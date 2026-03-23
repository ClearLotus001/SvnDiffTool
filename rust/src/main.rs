use std::env;
use std::io::{self, Write};
use std::path::Path;

use calamine::{open_workbook_auto, Data, Range, Reader};

const SHEET_PREFIX: &str = "@@sheet";
const ROW_PREFIX: &str = "@@row";
const FORMULA_SEPARATOR: char = '\u{001F}';

fn normalize_field(value: &str) -> String {
    value
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .replace('\n', " / ")
        .replace('\t', "    ")
        .replace(FORMULA_SEPARATOR, " ")
}

fn format_cell(cell: &Data) -> String {
    match cell {
        Data::Empty => String::new(),
        Data::String(value) => normalize_field(value),
        Data::Float(value) => {
            if value.fract() == 0.0 {
                format!("{}", *value as i64)
            } else {
                value.to_string()
            }
        }
        Data::Int(value) => value.to_string(),
        Data::Bool(value) => {
            if *value { "TRUE".to_string() } else { "FALSE".to_string() }
        }
        Data::Error(value) => format!("#{}", value),
        Data::DateTime(value) => value.to_string(),
        Data::DateTimeIso(value) => normalize_field(value),
        Data::DurationIso(value) => normalize_field(value),
    }
}

fn encode_cell(value: &str, formula: Option<&str>) -> String {
    let normalized_value = normalize_field(value);
    let normalized_formula = formula
        .map(normalize_field)
        .filter(|text| !text.trim().is_empty());

    match normalized_formula {
        Some(formula_text) => {
            let visible_value = if normalized_value.is_empty() {
                formula_text.clone()
            } else {
                normalized_value
            };
            format!("{visible_value}{FORMULA_SEPARATOR}{formula_text}")
        }
        None => normalized_value,
    }
}

fn get_formula_for_position<'a>(
    formulas: &'a Range<String>,
    abs_row: u32,
    abs_col: u32,
) -> Option<&'a str> {
    let (start_row, start_col) = formulas.start()?;
    if abs_row < start_row || abs_col < start_col {
        return None;
    }

    formulas
        .get(((abs_row - start_row) as usize, (abs_col - start_col) as usize))
        .map(|formula| formula.trim())
        .filter(|formula| !formula.is_empty())
}

fn write_sheet<W: Write>(
    writer: &mut W,
    sheet_name: &str,
    range: &Range<Data>,
    formulas: Option<&Range<String>>,
) -> io::Result<()> {
    writeln!(writer, "{}\t{}", SHEET_PREFIX, normalize_field(sheet_name).trim())?;

    let (start_row, start_col) = range.start().unwrap_or((0, 0));

    for (row_idx, row) in range.rows().enumerate() {
        let abs_row = start_row + row_idx as u32;
        let mut last_non_empty = None;
        for (col_idx, cell) in row.iter().enumerate() {
            let abs_col = start_col + col_idx as u32;
            let has_formula = formulas
                .and_then(|formula_range| get_formula_for_position(formula_range, abs_row, abs_col))
                .is_some();
            if !matches!(cell, Data::Empty) || has_formula {
                last_non_empty = Some(abs_col);
            }
        }

        write!(writer, "{}\t{}", ROW_PREFIX, abs_row + 1)?;
        if let Some(last_col) = last_non_empty {
            for abs_col in 0..=last_col {
                let value = if abs_col >= start_col {
                    row.get((abs_col - start_col) as usize)
                        .map(format_cell)
                        .unwrap_or_default()
                } else {
                    String::new()
                };
                let formula = formulas
                    .and_then(|formula_range| get_formula_for_position(formula_range, abs_row, abs_col))
                    .map(|formula| format!("={}", formula));
                let display = encode_cell(&value, formula.as_deref());
                write!(writer, "\t{}", display)?;
            }
        }
        writeln!(writer)?;
    }

    Ok(())
}

fn main() {
    let file_path = match env::args().nth(1) {
        Some(path) => path,
        None => {
            eprintln!("Usage: svn_excel_parser <workbook-path>");
            std::process::exit(1);
        }
    };

    if !Path::new(&file_path).exists() {
        eprintln!("Workbook not found: {}", file_path);
        std::process::exit(2);
    }

    let mut workbook = match open_workbook_auto(&file_path) {
        Ok(workbook) => workbook,
        Err(error) => {
            eprintln!("Failed to open workbook: {}", error);
            std::process::exit(3);
        }
    };

    let sheet_names = workbook.sheet_names().to_owned();
    let stdout = io::stdout();
    let mut handle = stdout.lock();

    for (index, sheet_name) in sheet_names.iter().enumerate() {
        match workbook.worksheet_range(sheet_name) {
            Ok(range) => {
                let formulas = match workbook.worksheet_formula(sheet_name) {
                    Ok(formula_range) => formula_range,
                    Err(error) => {
                        eprintln!("Failed to read worksheet formula '{}': {}", sheet_name, error);
                        std::process::exit(6);
                    }
                };

                if let Err(error) = write_sheet(&mut handle, sheet_name, &range, Some(&formulas)) {
                    eprintln!("Failed to write workbook output: {}", error);
                    std::process::exit(4);
                }
                if index + 1 < sheet_names.len() {
                    let _ = writeln!(handle);
                }
            }
            Err(error) => {
                eprintln!("Failed to read worksheet '{}': {}", sheet_name, error);
                std::process::exit(5);
            }
        }
    }
}
