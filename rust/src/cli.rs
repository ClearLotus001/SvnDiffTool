use std::env;

#[derive(Clone, Copy)]
pub enum OutputMode {
    Text,
    MetadataJson,
    DiffJson,
}

pub struct ParsedArgs {
    pub output_mode: OutputMode,
    pub file_path: String,
    pub compare_mode: String,
}

fn normalize_compare_mode(value: &str) -> Result<String, String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "strict" => Ok("strict".to_string()),
        "content" => Ok("content".to_string()),
        _ => Err("Compare mode must be either 'strict' or 'content'".to_string()),
    }
}

pub fn parse_args() -> Result<ParsedArgs, String> {
    let mut args = env::args().skip(1);
    match args.next().as_deref() {
        Some("--metadata-json") => {
            let file_path = args
                .next()
                .ok_or_else(|| "Usage: svn_excel_parser --metadata-json <workbook-path>".to_string())?;
            Ok(ParsedArgs {
                output_mode: OutputMode::MetadataJson,
                file_path,
                compare_mode: "strict".to_string(),
            })
        }
        Some("--diff-json") => {
            let base_path = args
                .next()
                .ok_or_else(|| "Usage: svn_excel_parser --diff-json <base-workbook-path> <mine-workbook-path>".to_string())?;
            let mine_path = args
                .next()
                .ok_or_else(|| "Usage: svn_excel_parser --diff-json <base-workbook-path> <mine-workbook-path>".to_string())?;
            let compare_mode = match args.next() {
                Some(flag) if flag == "--compare-mode" => {
                    let value = args
                        .next()
                        .ok_or_else(|| "Usage: svn_excel_parser --diff-json <base-workbook-path> <mine-workbook-path> [--compare-mode strict|content]".to_string())?;
                    normalize_compare_mode(&value)?
                }
                Some(_) => {
                    return Err("Usage: svn_excel_parser --diff-json <base-workbook-path> <mine-workbook-path> [--compare-mode strict|content]".to_string());
                }
                None => "strict".to_string(),
            };
            Ok(ParsedArgs {
                output_mode: OutputMode::DiffJson,
                file_path: format!("{base_path}\n{mine_path}"),
                compare_mode,
            })
        }
        Some(file_path) => Ok(ParsedArgs {
            output_mode: OutputMode::Text,
            file_path: file_path.to_string(),
            compare_mode: "strict".to_string(),
        }),
        None => Err("Usage: svn_excel_parser <workbook-path>".to_string()),
    }
}
