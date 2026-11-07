//! Where the cursor is, for the front end: 20 times a second near her, 5 times a second when
//! it's far away.
//!
//! While her window lets clicks through, the web page gets no mouse events at all, so the app
//! itself reads the cursor's screen position (no OS permission needed) and sends it to the page
//! in window-local logical pixels. The page uses it to decide whether the cursor is over her
//! (and so whether to catch clicks) and to turn her head toward it anywhere on screen.
//!
//! Her window's position, size and scale are remembered from the window's own events
//! (`Geometry`), so each check asks the OS one question (where's the cursor?) instead of five.
//!
//! The same loop saves her position a moment after she stops being moved.

use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{Emitter, Manager, PhysicalPosition, Runtime, WebviewWindow};

use crate::settings::{self, Position};

/// How often the cursor is checked while it's near her window…
const NEAR_POLL: Duration = Duration::from_millis(50);
/// …and while it's far away (her head still follows, eased, just less often).
const FAR_POLL: Duration = Duration::from_millis(200);
/// "Near": within this many logical pixels of her window.
const NEAR_DISTANCE: f64 = 240.0;
/// How often the window's frame is re-read in full.
const REFRESH_EVERY: Duration = Duration::from_secs(1);
/// How long after the last move before her position is written to disk.
const SAVE_AFTER: Duration = Duration::from_millis(700);

/// The cursor relative to her window's top-left, in logical pixels (may be outside it).
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Cursor {
    pub x: f64,
    pub y: f64,
    pub inside: bool,
}

/// Her window's place on screen, kept up to date from window events.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Frame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub scale: f64,
    pub visible: bool,
}

impl Frame {
    /// The cursor (physical screen pixels) in window-local logical pixels.
    pub fn local(&self, cursor: PhysicalPosition<f64>) -> Cursor {
        let x = (cursor.x - self.x) / self.scale;
        let y = (cursor.y - self.y) / self.scale;
        let width = self.width / self.scale;
        let height = self.height / self.scale;
        Cursor {
            x,
            y,
            inside: x >= 0.0 && y >= 0.0 && x < width && y < height,
        }
    }

    /// How long to wait before the next check, given where the cursor is.
    pub fn next_poll(&self, cursor: Cursor) -> Duration {
        let width = self.width / self.scale;
        let height = self.height / self.scale;
        let dx = (-cursor.x).max(cursor.x - width).max(0.0);
        let dy = (-cursor.y).max(cursor.y - height).max(0.0);
        if dx.hypot(dy) <= NEAR_DISTANCE {
            NEAR_POLL
        } else {
            FAR_POLL
        }
    }
}

/// The window's frame, shared between window events and the cursor thread.
#[derive(Default)]
pub struct Geometry(Mutex<Option<Frame>>);

impl Geometry {
    /// Reads the window's frame afresh (at start, after moves, resizes, show/hide).
    pub fn refresh<R: Runtime>(&self, window: &WebviewWindow<R>) {
        let frame = (|| {
            let origin = window.outer_position().ok()?;
            let size = window.inner_size().ok()?;
            Some(Frame {
                x: f64::from(origin.x),
                y: f64::from(origin.y),
                width: f64::from(size.width),
                height: f64::from(size.height),
                scale: window.scale_factor().ok()?,
                visible: window.is_visible().unwrap_or(true),
            })
        })();
        if let (Some(frame), Ok(mut slot)) = (frame, self.0.lock()) {
            *slot = Some(frame);
        }
    }

    /// Updates just the position (from a move event, without asking the OS).
    pub fn moved(&self, position: PhysicalPosition<i32>) {
        if let Ok(mut slot) = self.0.lock()
            && let Some(frame) = slot.as_mut()
        {
            frame.x = f64::from(position.x);
            frame.y = f64::from(position.y);
        }
    }

    fn get(&self) -> Option<Frame> {
        *self.0.lock().ok()?
    }
}

/// A position waiting to be saved, and when it last changed.
#[derive(Default)]
pub struct PendingMove(Mutex<Option<(Position, Instant)>>);

impl PendingMove {
    /// Notes a new window position (called on every move event).
    pub fn record(&self, position: PhysicalPosition<i32>) {
        if let Ok(mut pending) = self.0.lock() {
            *pending = Some((
                Position {
                    x: position.x,
                    y: position.y,
                },
                Instant::now(),
            ));
        }
    }

    /// The position to save, once it has been still for a moment.
    fn settled(&self) -> Option<Position> {
        let mut pending = self.0.lock().ok()?;
        match *pending {
            Some((position, at)) if at.elapsed() >= SAVE_AFTER => {
                *pending = None;
                Some(position)
            }
            _ => None,
        }
    }
}

/// Starts the cursor feed and the position saver on a background thread.
pub fn start<R: Runtime>(window: WebviewWindow<R>) {
    window.state::<Geometry>().refresh(&window);
    thread::spawn(move || {
        let mut last: Option<Cursor> = None;
        let mut wait = NEAR_POLL;
        let mut refreshed = Instant::now();
        loop {
            thread::sleep(wait);
            wait = FAR_POLL;
            // Once a second, re-read the frame: catches being shown by the page, and anything
            // a window event missed. Cheap, compared with asking five questions every check.
            if refreshed.elapsed() >= REFRESH_EVERY {
                window.state::<Geometry>().refresh(&window);
                refreshed = Instant::now();
            }
            if let Some(frame) = window.state::<Geometry>().get()
                && frame.visible
                && let Ok(position) = window.cursor_position()
            {
                let now = frame.local(position);
                wait = frame.next_poll(now);
                let moved = last.is_none_or(|before| {
                    (before.x - now.x).abs() > 0.5
                        || (before.y - now.y).abs() > 0.5
                        || before.inside != now.inside
                });
                if moved {
                    let _ = window.emit_to(window.label(), "cursor", now);
                    last = Some(now);
                }
            }
            save_settled_position(&window);
        }
    });
}

fn save_settled_position<R: Runtime>(window: &WebviewWindow<R>) {
    let app = window.app_handle();
    let Some(position) = app.state::<PendingMove>().settled() else {
        return;
    };
    let Ok(path) = crate::assets::data_dir(app).map(|dir| dir.join("settings.json")) else {
        return;
    };
    if let Err(error) = settings::update(&path, |current| current.position = Some(position)) {
        eprintln!("YDCP: couldn't save her position: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A 320×480 window at (1000, 500) on a 2× (Retina) screen: 640×960 physical pixels.
    fn frame() -> Frame {
        Frame {
            x: 1000.0,
            y: 500.0,
            width: 640.0,
            height: 960.0,
            scale: 2.0,
            visible: true,
        }
    }

    #[test]
    fn converts_screen_pixels_to_window_points() {
        let inside = frame().local(PhysicalPosition::new(1100.0, 700.0));
        assert_eq!((inside.x, inside.y, inside.inside), (50.0, 100.0, true));
        let outside = frame().local(PhysicalPosition::new(900.0, 700.0));
        assert_eq!((outside.x, outside.inside), (-50.0, false));
    }

    #[test]
    fn checks_often_near_her_and_less_far_away() {
        let f = frame();
        assert_eq!(
            f.next_poll(Cursor {
                x: 10.0,
                y: 10.0,
                inside: true
            }),
            NEAR_POLL
        );
        assert_eq!(
            f.next_poll(Cursor {
                x: -200.0,
                y: 100.0,
                inside: false
            }),
            NEAR_POLL
        );
        assert_eq!(
            f.next_poll(Cursor {
                x: -800.0,
                y: 100.0,
                inside: false
            }),
            FAR_POLL
        );
        assert_eq!(
            f.next_poll(Cursor {
                x: 160.0,
                y: 1200.0,
                inside: false
            }),
            FAR_POLL
        );
    }
}
