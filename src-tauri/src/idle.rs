//! How long ago the keyboard or mouse was last touched, in seconds.
//!
//! One number, asked of the system: never which keys, where the click was, or which app had
//! it. No OS permission on either platform. It tells her you're here while you type with the
//! mouse lying still, so she doesn't doze off (and a break reminder isn't put off) mid-sentence.

/// Seconds since the last keyboard, mouse or trackpad input; `None` where the system can't say.
#[cfg(target_os = "macos")]
pub fn seconds() -> Option<f64> {
    /// `kCGEventSourceStateCombinedSessionState`: everything in this login session.
    const COMBINED_SESSION: i32 = 0;
    /// `kCGAnyInputEventType`.
    const ANY_INPUT: u32 = !0;

    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state: i32, event_type: u32) -> f64;
    }

    // SAFETY: a plain C function taking two integers and returning a double; no pointers.
    let idle = unsafe { CGEventSourceSecondsSinceLastEventType(COMBINED_SESSION, ANY_INPUT) };
    sensible(idle)
}

/// Seconds since the last keyboard or mouse input; `None` where the system can't say.
#[cfg(windows)]
pub fn seconds() -> Option<f64> {
    #[repr(C)]
    struct LastInputInfo {
        size: u32,
        time: u32,
    }

    #[link(name = "user32")]
    unsafe extern "system" {
        fn GetLastInputInfo(info: *mut LastInputInfo) -> i32;
    }
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetTickCount() -> u32;
    }

    let mut info = LastInputInfo {
        size: size_of::<LastInputInfo>() as u32,
        time: 0,
    };
    // SAFETY: `info` is a valid LASTINPUTINFO with its size set, alive for the whole call.
    if unsafe { GetLastInputInfo(&mut info) } == 0 {
        return None;
    }
    // SAFETY: takes nothing and returns milliseconds since Windows started.
    let now = unsafe { GetTickCount() };
    sensible(f64::from(ticks_between(info.time, now)) / 1000.0)
}

/// Other systems: not known. Cursor movement still counts as being here.
#[cfg(not(any(target_os = "macos", windows)))]
pub fn seconds() -> Option<f64> {
    None
}

/// Milliseconds from tick `then` to tick `now`; the tick count starts again every 49.7 days.
#[cfg_attr(not(windows), allow(dead_code))]
fn ticks_between(then: u32, now: u32) -> u32 {
    now.wrapping_sub(then)
}

/// An answer that makes sense: a real number, not negative.
#[cfg_attr(not(any(target_os = "macos", windows)), allow(dead_code))]
fn sensible(idle: f64) -> Option<f64> {
    (idle.is_finite() && idle >= 0.0).then_some(idle)
}

/// Whether there was input since the last check, `since_check` seconds ago.
pub fn touched_since(idle: f64, since_check: f64) -> bool {
    idle < since_check
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn odd_answers_are_refused() {
        assert_eq!(sensible(2.5), Some(2.5));
        assert_eq!(sensible(-1.0), None);
        assert_eq!(sensible(f64::NAN), None);
        assert_eq!(sensible(f64::INFINITY), None);
    }

    #[test]
    fn the_tick_count_starting_again_is_not_a_long_idle() {
        assert_eq!(ticks_between(1000, 4000), 3000);
        assert_eq!(ticks_between(u32::MAX - 99, 400), 500);
    }

    #[test]
    fn input_since_the_last_check() {
        assert!(touched_since(0.2, 1.0));
        assert!(!touched_since(45.0, 1.0));
    }

    #[cfg(any(target_os = "macos", windows))]
    #[test]
    fn the_system_answers() {
        assert!(seconds().is_some());
    }
}
