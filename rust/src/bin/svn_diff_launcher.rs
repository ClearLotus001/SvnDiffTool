#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use serde::Serialize;
use std::env;
use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const EXTERNAL_DIFF_REQUEST_VERSION: u32 = 1;
const REQUEST_RETENTION_SECS: u64 = 24 * 60 * 60;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalDiffRequestPayload {
    version: u32,
    base_path: String,
    mine_path: String,
    base_name: String,
    mine_name: String,
    base_url: String,
    mine_url: String,
    base_revision: String,
    mine_revision: String,
    peg_revision: String,
    file_name: String,
}

fn append_log(current_exe: &Path, message: &str) {
    if let Some(bin_dir) = current_exe.parent() {
        let log_path = bin_dir.join("svn_diff_launcher.log");
        if let Some(parent) = log_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
            let _ = writeln!(file, "{}", message);
        }
    }
}

fn resolve_app_path(current_exe: &Path) -> Option<PathBuf> {
    let bin_dir = current_exe.parent()?;
    let resources_dir = bin_dir.parent()?;
    let install_dir = resources_dir.parent()?;
    Some(install_dir.join("SvnDiffTool.exe"))
}

fn normalize_arg(value: Option<&OsString>) -> String {
    value
        .map(|entry| entry.to_string_lossy().trim().to_string())
        .unwrap_or_default()
}

fn build_request_payload(args: &[OsString]) -> ExternalDiffRequestPayload {
    let base_path = normalize_arg(args.get(0));
    let mine_path = normalize_arg(args.get(1));
    let base_name = normalize_arg(args.get(2));
    let mine_name = normalize_arg(args.get(3));

    let (base_url, mine_url, base_revision, mine_revision, peg_revision, file_name) = if args.len() >= 10 {
        (
            normalize_arg(args.get(4)),
            normalize_arg(args.get(5)),
            normalize_arg(args.get(6)),
            normalize_arg(args.get(7)),
            normalize_arg(args.get(8)),
            normalize_arg(args.get(9)),
        )
    } else {
        (
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            normalize_arg(args.get(4)),
        )
    };

    ExternalDiffRequestPayload {
        version: EXTERNAL_DIFF_REQUEST_VERSION,
        base_path,
        mine_path,
        base_name,
        mine_name,
        base_url,
        mine_url,
        base_revision,
        mine_revision,
        peg_revision,
        file_name,
    }
}

fn request_root_path() -> PathBuf {
    env::temp_dir().join("svn-diff-tool").join("requests")
}

fn cleanup_stale_request_files(root_path: &Path) {
    let now = SystemTime::now();
    let Ok(entries) = fs::read_dir(root_path) else {
        return;
    };

    for entry in entries.flatten() {
        let entry_path = entry.path();
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let Ok(modified) = metadata.modified() else {
            continue;
        };
        let Ok(age) = now.duration_since(modified) else {
            continue;
        };
        if age.as_secs() < REQUEST_RETENTION_SECS {
            continue;
        }
        let _ = fs::remove_file(entry_path);
    }
}

fn write_request_file(current_exe: &Path, payload: &ExternalDiffRequestPayload) -> Result<PathBuf, String> {
    let root_path = request_root_path();
    fs::create_dir_all(&root_path).map_err(|error| format!("create_dir_all {}", error))?;
    cleanup_stale_request_files(&root_path);

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let request_path = root_path.join(format!(
        "external-diff-request-{}-{}.json",
        std::process::id(),
        stamp,
    ));
    let serialized = serde_json::to_vec_pretty(payload).map_err(|error| format!("serialize {}", error))?;
    fs::write(&request_path, serialized).map_err(|error| format!("write {}", error))?;
    append_log(current_exe, &format!("request_path={}", request_path.display()));
    Ok(request_path)
}

fn main() {
    let current_exe = match env::current_exe() {
        Ok(path) => path,
        Err(error) => {
            let fallback = PathBuf::from("svn_diff_launcher.exe");
            append_log(&fallback, &format!("current_exe:error {}", error));
            std::process::exit(1)
        }
    };
    let args: Vec<OsString> = env::args_os().collect();
    let cli_args = args.get(1..).unwrap_or(&[]);
    append_log(
        &current_exe,
        &format!(
            "start exe={} argc={} args={:?} electron_run_as_node={:?}",
            current_exe.display(),
            cli_args.len(),
            cli_args,
            env::var_os("ELECTRON_RUN_AS_NODE")
        ),
    );

    let request_payload = build_request_payload(cli_args);
    append_log(&current_exe, &format!("request_payload base={} mine={} file={}", request_payload.base_path, request_payload.mine_path, request_payload.file_name));

    let request_path = match write_request_file(&current_exe, &request_payload) {
        Ok(path) => path,
        Err(error) => {
            append_log(&current_exe, &format!("write_request:error {}", error));
            std::process::exit(1)
        }
    };

    let app_path = match resolve_app_path(&current_exe) {
        Some(path) if path.exists() => path,
        Some(path) => {
            append_log(&current_exe, &format!("resolve_app_path:missing {}", path.display()));
            std::process::exit(1)
        }
        None => {
            append_log(&current_exe, "resolve_app_path:none");
            std::process::exit(1)
        }
    };
    append_log(&current_exe, &format!("resolve_app_path:ok {}", app_path.display()));

    let mut command = Command::new(&app_path);
    command.arg(format!("--external-diff-request={}", request_path.display()));
    command.current_dir(app_path.parent().unwrap_or_else(|| Path::new(".")));
    command.env_remove("ELECTRON_RUN_AS_NODE");

    match command.spawn() {
        Ok(mut child) => {
            append_log(&current_exe, &format!("spawn:ok pid={}", child.id()));
            thread::sleep(Duration::from_millis(500));
            match child.try_wait() {
                Ok(Some(status)) => {
                    append_log(
                        &current_exe,
                        &format!("child:exited code={:?} success={}", status.code(), status.success()),
                    );
                }
                Ok(None) => {
                    append_log(&current_exe, "child:still-running");
                }
                Err(error) => {
                    append_log(&current_exe, &format!("child:try_wait_error {}", error));
                }
            }
            std::process::exit(0)
        }
        Err(error) => {
            append_log(&current_exe, &format!("spawn:error {}", error));
            std::process::exit(1)
        }
    }
}
