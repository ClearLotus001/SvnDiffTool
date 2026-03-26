use calamine::{Data, Range};
use serde::Serialize;

pub const SHEET_PREFIX: &str = "@@sheet";
pub const ROW_PREFIX: &str = "@@row";
pub const FORMULA_SEPARATOR: char = '\u{001F}';

#[derive(Debug, Clone, Serialize)]
pub struct WorkbookMergeRange {
    #[serde(rename = "sr")]
    pub start_row: usize,
    #[serde(rename = "er")]
    pub end_row: usize,
    #[serde(rename = "sc")]
    pub start_col: usize,
    #[serde(rename = "ec")]
    pub end_col: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkbookSheetMetadata {
    #[serde(rename = "h", default, skip_serializing_if = "Vec::is_empty")]
    pub hidden_columns: Vec<usize>,
    #[serde(rename = "m", default, skip_serializing_if = "Vec::is_empty")]
    pub merge_ranges: Vec<WorkbookMergeRange>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkbookMetadataMap {
    #[serde(rename = "s")]
    pub sheets: std::collections::BTreeMap<String, WorkbookSheetMetadata>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkbookCellSnapshotJson {
    #[serde(rename = "v", default, skip_serializing_if = "String::is_empty")]
    pub value: String,
    #[serde(rename = "f", default, skip_serializing_if = "String::is_empty")]
    pub formula: String,
}

#[derive(Debug, Clone)]
pub struct WorkbookRowEntry {
    pub raw_line: String,
    pub signature: String,
    pub row_number: usize,
    pub cells: Vec<WorkbookCellSnapshotJson>,
}

#[derive(Debug, Clone)]
pub struct WorkbookSheetDiffEntry {
    pub name: String,
    pub raw_sheet_line: String,
    pub rows: Vec<WorkbookRowEntry>,
}

#[derive(Debug, Clone)]
pub struct WorkbookTextRowEntry {
    pub raw_line: String,
    pub row_number: usize,
}

#[derive(Debug, Clone)]
pub struct WorkbookTextSheetEntry {
    pub name: String,
    pub raw_sheet_line: String,
    pub rows: Vec<WorkbookTextRowEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkbookCellDeltaJson {
    #[serde(rename = "c")]
    pub column: usize,
    #[serde(rename = "b")]
    pub base_cell: WorkbookCellSnapshotJson,
    #[serde(rename = "m")]
    pub mine_cell: WorkbookCellSnapshotJson,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkbookRowDeltaJson {
    #[serde(rename = "l", skip_serializing_if = "Option::is_none")]
    pub left_line_idx: Option<usize>,
    #[serde(rename = "r", skip_serializing_if = "Option::is_none")]
    pub right_line_idx: Option<usize>,
    #[serde(rename = "c", default, skip_serializing_if = "Vec::is_empty")]
    pub cell_deltas: Vec<WorkbookCellDeltaJson>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkbookSectionDeltaJson {
    #[serde(rename = "n")]
    pub name: String,
    #[serde(rename = "r")]
    pub rows: Vec<WorkbookRowDeltaJson>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkbookPrecomputedDeltaJson {
    #[serde(rename = "m")]
    pub compare_mode: String,
    #[serde(rename = "s")]
    pub sections: Vec<WorkbookSectionDeltaJson>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiffLineJson {
    #[serde(rename = "t")]
    pub line_type: String,
    #[serde(rename = "b", skip_serializing_if = "Option::is_none")]
    pub base: Option<String>,
    #[serde(rename = "m", skip_serializing_if = "Option::is_none")]
    pub mine: Option<String>,
    #[serde(rename = "bl", skip_serializing_if = "Option::is_none")]
    pub base_line_no: Option<usize>,
    #[serde(rename = "ml", skip_serializing_if = "Option::is_none")]
    pub mine_line_no: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkbookDiffOutputJson {
    #[serde(rename = "d")]
    pub diff_lines: Vec<DiffLineJson>,
    #[serde(rename = "w", skip_serializing_if = "Option::is_none")]
    pub workbook_delta: Option<WorkbookPrecomputedDeltaJson>,
}

pub fn normalize_field(value: &str) -> String {
    value
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .replace('\n', " / ")
        .replace('\t', "    ")
        .replace(FORMULA_SEPARATOR, " ")
}

pub fn format_cell(cell: &Data) -> String {
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
            if *value {
                "TRUE".to_string()
            } else {
                "FALSE".to_string()
            }
        }
        Data::Error(value) => format!("#{}", value),
        Data::DateTime(value) => value.to_string(),
        Data::DateTimeIso(value) => normalize_field(value),
        Data::DurationIso(value) => normalize_field(value),
    }
}

pub fn encode_cell(value: &str, formula: Option<&str>) -> String {
    let normalized_value = normalize_field(value);
    let normalized_formula = formula
        .map(normalize_field)
        .filter(|text| !text.trim().is_empty());

    match normalized_formula {
        Some(formula_text) => {
            format!("{normalized_value}{FORMULA_SEPARATOR}{formula_text}")
        }
        None => normalized_value,
    }
}

pub fn encode_cell_owned(mut value: String, formula: Option<String>) -> String {
    if value.contains('\r') || value.contains('\n') || value.contains('\t') || value.contains(FORMULA_SEPARATOR) {
        value = normalize_field(&value);
    }
    let normalized_formula = formula
        .map(|formula_text| {
            if formula_text.contains('\r')
                || formula_text.contains('\n')
                || formula_text.contains('\t')
                || formula_text.contains(FORMULA_SEPARATOR)
            {
                normalize_field(&formula_text)
            } else {
                formula_text
            }
        })
        .filter(|text| !text.trim().is_empty());

    match normalized_formula {
        Some(formula_text) => {
            value.push(FORMULA_SEPARATOR);
            value.push_str(&formula_text);
            value
        }
        None => value,
    }
}

pub fn has_workbook_cell_content(cell: &WorkbookCellSnapshotJson, compare_mode: &str) -> bool {
    let normalized_value = if compare_mode == "content" && cell.value.trim().is_empty() {
        ""
    } else {
        cell.value.as_str()
    };
    !normalized_value.is_empty() || !cell.formula.is_empty()
}

pub fn workbook_cells_differ(
    left_cell: &WorkbookCellSnapshotJson,
    right_cell: &WorkbookCellSnapshotJson,
    compare_mode: &str,
) -> bool {
    let left_value = if compare_mode == "content" && left_cell.value.trim().is_empty() {
        ""
    } else {
        left_cell.value.as_str()
    };
    let right_value = if compare_mode == "content" && right_cell.value.trim().is_empty() {
        ""
    } else {
        right_cell.value.as_str()
    };
    left_value != right_value || left_cell.formula != right_cell.formula
}

pub fn get_formula_for_position<'a>(
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

pub fn get_column_index(cell_ref: &str) -> usize {
    let letters: String = cell_ref
        .chars()
        .take_while(|ch| ch.is_ascii_alphabetic())
        .collect::<String>()
        .to_ascii_uppercase();
    let mut value = 0usize;
    for ch in letters.chars() {
        value = (value * 26) + (ch as usize - 'A' as usize + 1);
    }
    value.saturating_sub(1)
}

pub fn get_row_number(cell_ref: &str) -> usize {
    let digits: String = cell_ref.chars().filter(|ch| ch.is_ascii_digit()).collect();
    digits.parse::<usize>().unwrap_or(1).max(1)
}

pub fn parse_merge_range(range_ref: &str) -> Option<WorkbookMergeRange> {
    let mut parts = range_ref.split(':');
    let start_ref = parts.next()?.trim();
    let end_ref = parts.next().unwrap_or(start_ref).trim();

    Some(WorkbookMergeRange {
        start_row: get_row_number(start_ref),
        end_row: get_row_number(end_ref),
        start_col: get_column_index(start_ref),
        end_col: get_column_index(end_ref),
    })
}

pub fn is_truthy_flag(value: &str) -> bool {
    matches!(value.trim().to_ascii_lowercase().as_str(), "1" | "true")
}
