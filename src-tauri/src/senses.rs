//! What she can tell about the computer itself: the battery (how full, plugged in or not) and
//! how busy the processor is. Machine facts only: nothing about what you're doing, which apps
//! are open, or what's on screen. No OS permission on either platform.
//!
//! Read every few seconds on a background thread and sent to the page as a `sense` event; the
//! page decides what's worth a reaction (src/senses.js).

use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

/// How often the computer is looked at.
const EVERY: Duration = Duration::from_secs(5);

/// The battery, if the computer has one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Battery {
    /// How full, 0–100.
    pub percent: u8,
    /// Running on mains power.
    pub plugged: bool,
    pub charging: bool,
}

/// One look at the computer.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Snapshot {
    pub battery: Option<Battery>,
    /// The share of all processor time in use since the last look, 0–1.
    pub cpu: Option<f64>,
}

/// A battery level as a percentage, from what the system reports.
fn percent_of(current: i64, max: i64) -> u8 {
    if max <= 0 {
        return 0;
    }
    (current.saturating_mul(100) / max).clamp(0, 100) as u8
}

/// The share of processor time that was busy, from how much was idle and how much there was.
fn busy_share(idle: u64, total: u64) -> Option<f64> {
    (total > 0).then(|| (1.0 - idle as f64 / total as f64).clamp(0.0, 1.0))
}

#[cfg(target_os = "macos")]
mod system {
    use std::ffi::{CString, c_char, c_void};
    use std::sync::OnceLock;

    use super::{Battery, busy_share, percent_of};

    type Ref = *const c_void;

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFRelease(object: Ref);
        fn CFGetTypeID(object: Ref) -> usize;
        fn CFArrayGetCount(array: Ref) -> isize;
        fn CFArrayGetValueAtIndex(array: Ref, index: isize) -> Ref;
        fn CFDictionaryGetValue(dictionary: Ref, key: Ref) -> Ref;
        fn CFStringCreateWithCString(allocator: Ref, text: *const c_char, encoding: u32) -> Ref;
        fn CFStringGetTypeID() -> usize;
        fn CFNumberGetTypeID() -> usize;
        fn CFNumberGetValue(number: Ref, kind: isize, value: *mut c_void) -> u8;
        fn CFBooleanGetTypeID() -> usize;
        fn CFBooleanGetValue(boolean: Ref) -> u8;
        fn CFEqual(one: Ref, other: Ref) -> u8;
    }

    #[link(name = "IOKit", kind = "framework")]
    unsafe extern "C" {
        fn IOPSCopyPowerSourcesInfo() -> Ref;
        fn IOPSCopyPowerSourcesList(info: Ref) -> Ref;
        fn IOPSGetPowerSourceDescription(info: Ref, source: Ref) -> Ref;
    }

    /// `kCFStringEncodingUTF8`.
    const UTF8: u32 = 0x0800_0100;
    /// `kCFNumberSInt64Type`.
    const SINT64: isize = 4;

    /// A Core Foundation object this code owns, released when dropped.
    struct Owned(Ref);

    impl Owned {
        fn new(object: Ref) -> Option<Owned> {
            (!object.is_null()).then_some(Owned(object))
        }

        fn text(text: &str) -> Option<Owned> {
            let text = CString::new(text).ok()?;
            // SAFETY: a valid NUL-terminated string, the default allocator, a known encoding.
            Owned::new(unsafe { CFStringCreateWithCString(std::ptr::null(), text.as_ptr(), UTF8) })
        }
    }

    impl Drop for Owned {
        fn drop(&mut self) {
            // SAFETY: created or copied by this code, non-null, released exactly once.
            unsafe { CFRelease(self.0) }
        }
    }

    /// One entry of a power source's description (borrowed from it; may be missing).
    fn entry(description: Ref, key: &str) -> Option<Ref> {
        let key = Owned::text(key)?;
        // SAFETY: `description` is a live dictionary and `key` a live string.
        let value = unsafe { CFDictionaryGetValue(description, key.0) };
        (!value.is_null()).then_some(value)
    }

    fn number(description: Ref, key: &str) -> Option<i64> {
        let value = entry(description, key)?;
        let mut out: i64 = 0;
        // SAFETY: checked to be a number first; `out` is a valid 64-bit integer to write to.
        unsafe {
            (CFGetTypeID(value) == CFNumberGetTypeID()
                && CFNumberGetValue(value, SINT64, (&raw mut out).cast()) != 0)
                .then_some(out)
        }
    }

    fn flag(description: Ref, key: &str) -> Option<bool> {
        let value = entry(description, key)?;
        // SAFETY: checked to be a boolean before it's read as one.
        unsafe {
            (CFGetTypeID(value) == CFBooleanGetTypeID()).then(|| CFBooleanGetValue(value) != 0)
        }
    }

    fn is(description: Ref, key: &str, text: &str) -> bool {
        let (Some(value), Some(text)) = (entry(description, key), Owned::text(text)) else {
            return false;
        };
        // SAFETY: checked to be a string; both are live objects.
        unsafe { CFGetTypeID(value) == CFStringGetTypeID() && CFEqual(value, text.0) != 0 }
    }

    /// The built-in battery, from the system's list of power sources.
    pub fn battery() -> Option<Battery> {
        // SAFETY: both calls return objects this code then owns (or null, handled by `new`).
        let info = Owned::new(unsafe { IOPSCopyPowerSourcesInfo() })?;
        let list = Owned::new(unsafe { IOPSCopyPowerSourcesList(info.0) })?;
        // SAFETY: `list` is a live array.
        let count = unsafe { CFArrayGetCount(list.0) };
        for index in 0..count {
            // SAFETY: `index` is within the array; the description is borrowed from `info`,
            // which outlives this loop.
            let description = unsafe {
                let source = CFArrayGetValueAtIndex(list.0, index);
                IOPSGetPowerSourceDescription(info.0, source)
            };
            if description.is_null() || !is(description, "Type", "InternalBattery") {
                continue;
            }
            let current = number(description, "Current Capacity")?;
            let max = number(description, "Max Capacity").unwrap_or(100);
            return Some(Battery {
                percent: percent_of(current, max),
                plugged: is(description, "Power Source State", "AC Power"),
                charging: flag(description, "Is Charging").unwrap_or(false),
            });
        }
        None
    }

    /// Processor time so far, in ticks: user, system, idle, nice (each wraps around).
    pub type Ticks = [u32; 4];

    unsafe extern "C" {
        fn mach_host_self() -> u32;
        fn host_statistics(host: u32, flavor: i32, info: *mut u32, count: *mut u32) -> i32;
    }

    /// `HOST_CPU_LOAD_INFO`.
    const CPU_LOAD: i32 = 3;
    const IDLE: usize = 2;

    pub fn ticks() -> Option<Ticks> {
        // The host port is asked for once: each call would hand out another reference.
        static HOST: OnceLock<u32> = OnceLock::new();
        // SAFETY: takes nothing, returns this machine's host port.
        let host = *HOST.get_or_init(|| unsafe { mach_host_self() });
        let mut ticks: Ticks = [0; 4];
        let mut count = ticks.len() as u32;
        // SAFETY: `ticks` has room for the four counters this flavour writes, and `count` says so.
        let result = unsafe { host_statistics(host, CPU_LOAD, ticks.as_mut_ptr(), &raw mut count) };
        (result == 0 && count as usize == ticks.len()).then_some(ticks)
    }

    pub fn load(before: &Ticks, after: &Ticks) -> Option<f64> {
        let passed = |index: usize| u64::from(after[index].wrapping_sub(before[index]));
        busy_share(passed(IDLE), (0..4).map(passed).sum())
    }
}

#[cfg(windows)]
mod system {
    use super::{Battery, busy_share};

    #[repr(C)]
    #[derive(Default)]
    struct PowerStatus {
        ac_line: u8,
        battery_flag: u8,
        battery_percent: u8,
        system_status: u8,
        battery_seconds: u32,
        battery_full_seconds: u32,
    }

    #[repr(C)]
    #[derive(Default, Clone, Copy)]
    struct FileTime {
        low: u32,
        high: u32,
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetSystemPowerStatus(status: *mut PowerStatus) -> i32;
        fn GetSystemTimes(idle: *mut FileTime, kernel: *mut FileTime, user: *mut FileTime) -> i32;
    }

    /// Battery flag bits: charging, and "no battery in this computer".
    const CHARGING: u8 = 8;
    const NO_BATTERY: u8 = 128;
    const UNKNOWN: u8 = 255;

    pub fn battery() -> Option<Battery> {
        let mut status = PowerStatus::default();
        // SAFETY: `status` is a valid SYSTEM_POWER_STATUS to fill in.
        if unsafe { GetSystemPowerStatus(&raw mut status) } == 0 {
            return None;
        }
        let flag = status.battery_flag;
        if flag == UNKNOWN || flag & NO_BATTERY != 0 || status.battery_percent > 100 {
            return None;
        }
        Some(Battery {
            percent: status.battery_percent,
            plugged: status.ac_line == 1,
            charging: flag & CHARGING != 0,
        })
    }

    /// Processor time so far, in 100-nanosecond steps: idle, kernel (idle included), user.
    pub type Ticks = [u64; 3];

    pub fn ticks() -> Option<Ticks> {
        let mut times = [FileTime::default(); 3];
        let [idle, kernel, user] = &mut times;
        // SAFETY: three valid FILETIMEs to fill in.
        if unsafe { GetSystemTimes(idle, kernel, user) } == 0 {
            return None;
        }
        Some(times.map(|time| (u64::from(time.high) << 32) | u64::from(time.low)))
    }

    pub fn load(before: &Ticks, after: &Ticks) -> Option<f64> {
        let passed = |index: usize| after[index].wrapping_sub(before[index]);
        // Kernel time already counts the idle time.
        busy_share(passed(0), passed(1).saturating_add(passed(2)))
    }
}

/// Other systems: nothing to tell.
#[cfg(not(any(target_os = "macos", windows)))]
mod system {
    use super::Battery;

    pub type Ticks = ();

    pub fn battery() -> Option<Battery> {
        None
    }

    pub fn ticks() -> Option<Ticks> {
        None
    }

    pub fn load(_before: &Ticks, _after: &Ticks) -> Option<f64> {
        None
    }
}

/// Starts looking at the computer every few seconds, on a background thread.
pub fn start<R: Runtime>(app: AppHandle<R>) {
    thread::spawn(move || {
        let mut before = system::ticks();
        loop {
            thread::sleep(EVERY);
            let now = system::ticks();
            let cpu = match (&before, &now) {
                (Some(before), Some(now)) => system::load(before, now),
                _ => None,
            };
            before = now;
            let snapshot = Snapshot {
                battery: system::battery(),
                cpu,
            };
            let _ = app.emit_to("main", "sense", snapshot);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn battery_levels_are_percentages() {
        assert_eq!(percent_of(66, 100), 66);
        assert_eq!(percent_of(3300, 5000), 66);
        assert_eq!(percent_of(120, 100), 100);
        assert_eq!(percent_of(-5, 100), 0);
        assert_eq!(percent_of(50, 0), 0);
    }

    #[test]
    fn busy_share_of_processor_time() {
        assert_eq!(busy_share(25, 100), Some(0.75));
        assert_eq!(busy_share(100, 100), Some(0.0));
        assert_eq!(busy_share(0, 100), Some(1.0));
        // No time has passed: nothing to say.
        assert_eq!(busy_share(0, 0), None);
        // Odd numbers never give an odd share.
        assert_eq!(busy_share(150, 100), Some(0.0));
    }

    #[cfg(any(target_os = "macos", windows))]
    #[test]
    fn the_system_answers() {
        // A computer with no battery says so; one with a battery gives sensible numbers.
        if let Some(battery) = system::battery() {
            assert!(battery.percent <= 100);
            println!("battery: {battery:?}");
        }
        let before = system::ticks().expect("processor time");
        thread::sleep(Duration::from_millis(300));
        let after = system::ticks().expect("processor time");
        let load = system::load(&before, &after).expect("some time passed");
        assert!((0.0..=1.0).contains(&load));
        println!("cpu: {load:.2}");
    }

    #[test]
    fn a_snapshot_reads_plainly_in_the_page() {
        let snapshot = Snapshot {
            battery: Some(Battery {
                percent: 66,
                plugged: true,
                charging: true,
            }),
            cpu: Some(0.25),
        };
        assert_eq!(
            serde_json::to_string(&snapshot).unwrap(),
            r#"{"battery":{"percent":66,"plugged":true,"charging":true},"cpu":0.25}"#
        );
    }
}
