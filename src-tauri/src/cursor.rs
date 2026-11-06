//! Where the cursor is, for the front end, about 20 times a second.
//!
//! While her window lets clicks through, the web page gets no mouse events at all, so the app
//! itself reads the cursor's screen position (no OS permission needed) and sends it to the page
//! in window-local logical pixels. The page uses it to decide whether the cursor is over her
//! (and so whether to catch clicks) and to turn her head toward it anywhere on screen.
//!
//! The same loop saves her position a moment after she stops being moved.

use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{Emitter, Manager, PhysicalPosition, Runtime, WebviewWindow};

use crate::settings::{self, Position};

const POLL: Duration = Duration::from_millis(50);
/// How long after the last move before her position is written to disk.
const SAVE_AFTER: Duration = Duration::from_millis(700);

/// The cursor relative to her window's top-left, in logical pixels (may be outside it).
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Cursor {
    pub x: f64,
    pub y: f64,
    pub inside: bool,
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

/// The cursor relative to the window, or `None` if the OS doesn't say right now.
fn cursor_in<R: Runtime>(window: &WebviewWindow<R>) -> Option<Cursor> {
    let cursor = window.cursor_position().ok()?;
    let origin = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    let scale = window.scale_factor().ok()?;
    let x = (cursor.x - f64::from(origin.x)) / scale;
    let y = (cursor.y - f64::from(origin.y)) / scale;
    let width = f64::from(size.width) / scale;
    let height = f64::from(size.height) / scale;
    Some(Cursor {
        x,
        y,
        inside: x >= 0.0 && y >= 0.0 && x < width && y < height,
    })
}

/// Starts the cursor feed and the position saver on a background thread.
pub fn start<R: Runtime>(window: WebviewWindow<R>) {
    thread::spawn(move || {
        let mut last: Option<Cursor> = None;
        loop {
            thread::sleep(POLL);
            if window.is_visible().unwrap_or(false)
                && let Some(now) = cursor_in(&window)
            {
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
