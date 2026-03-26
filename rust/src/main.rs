mod cli;
mod diff;
mod model;
mod profile;
mod workbook;

use std::io;
use std::path::Path;

use cli::{parse_args, OutputMode};
use diff::compute_workbook_diff_output;
use workbook::{write_workbook_metadata_json, write_workbook_text};

fn main() {
    let parsed_args = match parse_args() {
        Ok(result) => result,
        Err(message) => {
            eprintln!("{}", message);
            std::process::exit(1);
        }
    };
    let output_mode = parsed_args.output_mode;
    let file_path = parsed_args.file_path;
    let compare_mode = parsed_args.compare_mode;

    match output_mode {
        OutputMode::DiffJson => {
            let mut parts = file_path.splitn(2, '\n');
            let base_file_path = parts.next().unwrap_or_default();
            let mine_file_path = parts.next().unwrap_or_default();
            if !Path::new(base_file_path).exists() {
                eprintln!("Workbook not found: {}", base_file_path);
                std::process::exit(2);
            }
            if !Path::new(mine_file_path).exists() {
                eprintln!("Workbook not found: {}", mine_file_path);
                std::process::exit(2);
            }
        }
        _ => {
            if !Path::new(&file_path).exists() {
                eprintln!("Workbook not found: {}", file_path);
                std::process::exit(2);
            }
        }
    }

    let result = match output_mode {
        OutputMode::Text => write_workbook_text(&file_path),
        OutputMode::MetadataJson => write_workbook_metadata_json(&file_path),
        OutputMode::DiffJson => {
            let mut parts = file_path.splitn(2, '\n');
            let base_file_path = parts.next().unwrap_or_default();
            let mine_file_path = parts.next().unwrap_or_default();
            match compute_workbook_diff_output(base_file_path, mine_file_path, &compare_mode) {
                Ok(diff_output) => {
                    let stdout = io::stdout();
                    let mut handle = stdout.lock();
                    serde_json::to_writer(&mut handle, &diff_output)
                        .map_err(|error| io::Error::new(io::ErrorKind::Other, error.to_string()))
                }
                Err(error) => Err(error),
            }
        }
    };

    if let Err(error) = result {
        eprintln!("Failed to process workbook: {}", error);
        std::process::exit(7);
    }
}
