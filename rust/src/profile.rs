use std::env;
use std::sync::OnceLock;
use std::time::Instant;

fn profiling_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| {
        let value = env::var("SVN_DIFF_RUST_PROFILE")
            .ok()
            .or_else(|| env::var("SVN_DIFF_DEBUG_TIMING").ok());
        matches!(
            value.as_deref(),
            Some("1") | Some("true") | Some("TRUE") | Some("yes") | Some("YES")
        )
    })
}

pub fn log(message: impl AsRef<str>) {
    if profiling_enabled() {
        eprintln!("[rust-profile] {}", message.as_ref());
    }
}

pub fn start() -> Option<Instant> {
    profiling_enabled().then(Instant::now)
}

pub fn log_elapsed(start: Option<Instant>, message: impl AsRef<str>) {
    if let Some(started_at) = start {
        log(format!(
            "{} took {:.1}ms",
            message.as_ref(),
            started_at.elapsed().as_secs_f64() * 1000.0,
        ));
    }
}
