use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::env;
use std::fs::File;
use std::io::{self, Read, Write};
use std::path::Path;

use calamine::{open_workbook_auto, Data, Range, Reader};
use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader as XmlReader;
use serde::Serialize;
use zip::ZipArchive;

const SHEET_PREFIX: &str = "@@sheet";
const ROW_PREFIX: &str = "@@row";
const FORMULA_SEPARATOR: char = '\u{001F}';

#[derive(Clone, Copy)]
enum OutputMode {
    Text,
    MetadataJson,
    DiffJson,
}

struct ParsedArgs {
    output_mode: OutputMode,
    file_path: String,
    compare_mode: String,
}

#[derive(Debug, Clone)]
struct SheetInfo {
    name: String,
    path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkbookMergeRange {
    start_row: usize,
    end_row: usize,
    start_col: usize,
    end_col: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkbookSheetMetadata {
    name: String,
    hidden_columns: Vec<usize>,
    merge_ranges: Vec<WorkbookMergeRange>,
    row_count: usize,
    max_columns: usize,
}

#[derive(Debug, Clone, Serialize)]
struct WorkbookMetadataMap {
    sheets: BTreeMap<String, WorkbookSheetMetadata>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkbookCellSnapshotJson {
    value: String,
    formula: String,
}

#[derive(Debug, Clone)]
struct WorkbookRowEntry {
    raw_line: String,
    signature: String,
    row_number: usize,
    cells: Vec<WorkbookCellSnapshotJson>,
}

#[derive(Debug, Clone)]
struct WorkbookSheetDiffEntry {
    name: String,
    raw_sheet_line: String,
    rows: Vec<WorkbookRowEntry>,
}

#[derive(Debug, Clone)]
struct WorkbookSheetPair {
    base: Option<WorkbookSheetDiffEntry>,
    mine: Option<WorkbookSheetDiffEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkbookCellDeltaJson {
    column: usize,
    base_cell: WorkbookCellSnapshotJson,
    mine_cell: WorkbookCellSnapshotJson,
    changed: bool,
    masked: bool,
    strict_only: bool,
    kind: String,
    has_base_content: bool,
    has_mine_content: bool,
    has_content: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkbookRowDeltaJson {
    line_idx: usize,
    line_idxs: Vec<usize>,
    left_line_idx: Option<usize>,
    right_line_idx: Option<usize>,
    cell_deltas: Vec<WorkbookCellDeltaJson>,
    changed_columns: Vec<usize>,
    strict_only_columns: Vec<usize>,
    changed_count: usize,
    has_changes: bool,
    tone: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkbookSectionDeltaJson {
    name: String,
    rows: Vec<WorkbookRowDeltaJson>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkbookPrecomputedDeltaJson {
    compare_mode: String,
    sections: Vec<WorkbookSectionDeltaJson>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiffLineJson {
    #[serde(rename = "type")]
    line_type: String,
    base: Option<String>,
    mine: Option<String>,
    base_line_no: Option<usize>,
    mine_line_no: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkbookDiffOutputJson {
    diff_lines: Vec<DiffLineJson>,
    workbook_delta: WorkbookPrecomputedDeltaJson,
}

fn normalize_compare_mode(value: &str) -> Result<String, String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "strict" => Ok("strict".to_string()),
        "content" => Ok("content".to_string()),
        _ => Err("Compare mode must be either 'strict' or 'content'".to_string()),
    }
}

fn parse_args() -> Result<ParsedArgs, String> {
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

fn is_zip_workbook(file_path: &str) -> bool {
    matches!(
        Path::new(file_path)
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase()),
        Some(ref ext) if matches!(ext.as_str(), "xlsx" | "xlsm" | "xltx" | "xltm")
    )
}

fn normalize_worksheet_path(target: &str) -> String {
    let trimmed = target.replace('\\', "/").trim().trim_start_matches("./").to_string();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.starts_with('/') {
        return trimmed.trim_start_matches('/').to_string();
    }
    if trimmed.starts_with("xl/") {
        return trimmed;
    }
    format!("xl/{}", trimmed)
}

fn read_zip_entry_to_string(archive: &mut ZipArchive<File>, entry_path: &str) -> Option<String> {
    let mut entry = archive.by_name(entry_path).ok()?;
    let mut text = String::new();
    entry.read_to_string(&mut text).ok()?;
    Some(text)
}

fn decode_attr_value(reader: &XmlReader<&[u8]>, event: &BytesStart<'_>, key: &[u8]) -> Option<String> {
    event
        .attributes()
        .flatten()
        .find(|attribute| attribute.key.as_ref() == key)
        .and_then(|attribute| {
            attribute
                .decode_and_unescape_value(reader.decoder())
                .ok()
                .map(|value| value.into_owned())
        })
}

fn parse_workbook_relationships(archive: &mut ZipArchive<File>) -> Option<HashMap<String, String>> {
    let rels_xml = read_zip_entry_to_string(archive, "xl/_rels/workbook.xml.rels")?;
    let mut reader = XmlReader::from_str(&rels_xml);
    let mut rel_map = HashMap::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) | Ok(Event::Empty(event)) => {
                if event.name().as_ref() != b"Relationship" {
                    continue;
                }
                let id = decode_attr_value(&reader, &event, b"Id").unwrap_or_default();
                let target = decode_attr_value(&reader, &event, b"Target").unwrap_or_default();
                if !id.is_empty() && !target.is_empty() {
                    rel_map.insert(id, normalize_worksheet_path(&target));
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => return None,
            _ => {}
        }
    }

    Some(rel_map)
}

fn collect_visible_sheet_infos(file_path: &str) -> Option<Vec<SheetInfo>> {
    if !is_zip_workbook(file_path) {
        return None;
    }

    let file = File::open(file_path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let workbook_xml = read_zip_entry_to_string(&mut archive, "xl/workbook.xml")?;
    let rel_map = parse_workbook_relationships(&mut archive)?;
    let mut reader = XmlReader::from_str(&workbook_xml);
    let mut sheet_infos = Vec::new();
    let mut sheet_index = 0usize;

    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) | Ok(Event::Empty(event)) => {
                if event.name().as_ref() != b"sheet" {
                    continue;
                }

                let name = decode_attr_value(&reader, &event, b"name")
                    .unwrap_or_else(|| format!("Sheet{}", sheet_index + 1));
                let state = decode_attr_value(&reader, &event, b"state")
                    .unwrap_or_default()
                    .trim()
                    .to_ascii_lowercase();
                let rel_id = decode_attr_value(&reader, &event, b"r:id").unwrap_or_default();

                if state == "hidden" || state == "veryhidden" {
                    sheet_index += 1;
                    continue;
                }

                let path = rel_map
                    .get(&rel_id)
                    .cloned()
                    .unwrap_or_else(|| format!("xl/worksheets/sheet{}.xml", sheet_index + 1));
                sheet_infos.push(SheetInfo { name, path });
                sheet_index += 1;
            }
            Ok(Event::Eof) => break,
            Err(_) => return None,
            _ => {}
        }
    }

    Some(sheet_infos)
}

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

fn encode_cell(value: &str, formula: Option<&str>) -> String {
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

fn has_workbook_cell_content(cell: &WorkbookCellSnapshotJson, compare_mode: &str) -> bool {
    let normalized_value = if compare_mode == "content" && cell.value.trim().is_empty() {
        ""
    } else {
        cell.value.as_str()
    };
    !normalized_value.is_empty() || !cell.formula.is_empty()
}

fn workbook_cells_differ(
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

fn build_row_line_and_signature(
    row_number: usize,
    cells: &[WorkbookCellSnapshotJson],
    compare_mode: &str,
) -> WorkbookRowEntry {
    let encoded_cells: Vec<String> = cells
        .iter()
        .map(|cell| encode_cell(&cell.value, (!cell.formula.is_empty()).then_some(cell.formula.as_str())))
        .collect();
    let raw_line = if cells.is_empty() {
        format!("{}\t{}", ROW_PREFIX, row_number)
    } else {
        format!("{}\t{}\t{}", ROW_PREFIX, row_number, encoded_cells.join("\t"))
    };
    let mut trimmed_cells = cells.to_vec();
    while let Some(last_cell) = trimmed_cells.last() {
        if has_workbook_cell_content(last_cell, compare_mode) {
            break;
        }
        trimmed_cells.pop();
    }
    let signature = trimmed_cells
        .iter()
        .map(|cell| encode_cell(&cell.value, (!cell.formula.is_empty()).then_some(cell.formula.as_str())))
        .collect::<Vec<_>>()
        .join("\t");

    WorkbookRowEntry {
        raw_line,
        signature,
        row_number,
        cells: cells.to_vec(),
    }
}

fn collect_workbook_row_entries(
    range: &Range<Data>,
    formulas: Option<&Range<String>>,
    compare_mode: &str,
) -> Vec<WorkbookRowEntry> {
    let (start_row, start_col) = range.start().unwrap_or((0, 0));
    let mut result = Vec::new();

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

        let mut row_cells = Vec::new();
        if let Some(last_col) = last_non_empty {
            for abs_col in start_col..=last_col {
                let value = row
                    .get((abs_col - start_col) as usize)
                    .map(format_cell)
                    .unwrap_or_default();
                let formula = formulas
                    .and_then(|formula_range| get_formula_for_position(formula_range, abs_row, abs_col))
                    .map(|formula| format!("={}", formula));
                row_cells.push(WorkbookCellSnapshotJson {
                    value,
                    formula: formula.unwrap_or_default(),
                });
            }
        }

        result.push(build_row_line_and_signature((abs_row + 1) as usize, &row_cells, compare_mode));
    }

    result
}

fn parse_workbook_document(file_path: &str, compare_mode: &str) -> io::Result<Vec<WorkbookSheetDiffEntry>> {
    let mut workbook = open_workbook_auto(file_path)
        .map_err(|error| io::Error::new(io::ErrorKind::Other, format!("Failed to open workbook: {error}")))?;
    let sheet_names = collect_visible_sheet_infos(file_path)
        .map(|infos| infos.into_iter().map(|info| info.name).collect::<Vec<_>>())
        .unwrap_or_else(|| workbook.sheet_names().to_owned());
    let mut result = Vec::new();

    for sheet_name in sheet_names {
        let range = workbook
            .worksheet_range(&sheet_name)
            .map_err(|error| io::Error::new(io::ErrorKind::Other, format!("Failed to read worksheet '{sheet_name}': {error}")))?;
        let formulas = workbook
            .worksheet_formula(&sheet_name)
            .map_err(|error| io::Error::new(io::ErrorKind::Other, format!("Failed to read worksheet formula '{sheet_name}': {error}")))?;
        result.push(WorkbookSheetDiffEntry {
            name: sheet_name.clone(),
            raw_sheet_line: format!("{}\t{}", SHEET_PREFIX, normalize_field(&sheet_name).trim()),
            rows: collect_workbook_row_entries(&range, Some(&formulas), compare_mode),
        });
    }

    Ok(result)
}

fn align_workbook_sheets(
    base_sheets: Vec<WorkbookSheetDiffEntry>,
    mine_sheets: Vec<WorkbookSheetDiffEntry>,
) -> Vec<WorkbookSheetPair> {
    let mut mine_queues: HashMap<String, Vec<WorkbookSheetDiffEntry>> = HashMap::new();
    for sheet in mine_sheets {
        mine_queues.entry(sheet.name.clone()).or_default().push(sheet);
    }

    let mut pairs = Vec::new();
    for base_sheet in base_sheets {
        let mine_sheet = mine_queues
            .get_mut(&base_sheet.name)
            .and_then(|queue| if queue.is_empty() { None } else { Some(queue.remove(0)) });
        pairs.push(WorkbookSheetPair {
            base: Some(base_sheet),
            mine: mine_sheet,
        });
    }

    for (_, queue) in mine_queues {
        for mine_sheet in queue {
            pairs.push(WorkbookSheetPair {
                base: None,
                mine: Some(mine_sheet),
            });
        }
    }

    pairs
}

struct LcsNode {
    base_idx: usize,
    mine_idx: usize,
    prev_idx: Option<usize>,
}

fn patience_lcs(base_rows: &[WorkbookRowEntry], mine_rows: &[WorkbookRowEntry]) -> Vec<(usize, usize)> {
    if base_rows.is_empty() || mine_rows.is_empty() {
        return Vec::new();
    }

    let mut mine_index: HashMap<&str, Vec<usize>> = HashMap::new();
    for (index, row) in mine_rows.iter().enumerate() {
        mine_index.entry(row.signature.as_str()).or_default().push(index);
    }

    let mut nodes: Vec<LcsNode> = Vec::new();
    let mut piles: Vec<usize> = Vec::new();
    let mut tails: Vec<usize> = Vec::new();

    for (base_idx, row) in base_rows.iter().enumerate() {
        let Some(positions) = mine_index.get(row.signature.as_str()) else {
            continue;
        };

        let mut sorted_positions = positions.clone();
        sorted_positions.sort_unstable();

        for mine_idx in sorted_positions {
            let mut low = 0usize;
            let mut high = tails.len();
            while low < high {
                let mid = (low + high) >> 1;
                if tails[mid] < mine_idx {
                    low = mid + 1;
                } else {
                    high = mid;
                }
            }
            if low > 0 && tails[low - 1] >= mine_idx {
                continue;
            }

            let node_idx = nodes.len();
            nodes.push(LcsNode {
                base_idx,
                mine_idx,
                prev_idx: if low > 0 {
                    Some(piles[low - 1])
                } else {
                    None
                },
            });

            if low == piles.len() {
                piles.push(node_idx);
                tails.push(mine_idx);
            } else {
                piles[low] = node_idx;
                tails[low] = mine_idx;
            }
        }
    }

    let mut result = Vec::new();
    let mut cursor = piles.last().copied();
    while let Some(node_idx) = cursor {
        let node = &nodes[node_idx];
        result.push((node.base_idx, node.mine_idx));
        cursor = node.prev_idx;
    }
    result.reverse();
    result
}

fn push_diff_line(
    output: &mut Vec<DiffLineJson>,
    line_type: &str,
    base: Option<String>,
    mine: Option<String>,
    base_line_no: Option<usize>,
    mine_line_no: Option<usize>,
) {
    output.push(DiffLineJson {
        line_type: line_type.to_string(),
        base,
        mine,
        base_line_no,
        mine_line_no,
    });
}

fn resolve_cell_delta_kind(
    base_cell: &WorkbookCellSnapshotJson,
    mine_cell: &WorkbookCellSnapshotJson,
    compare_mode: &str,
) -> String {
    if !workbook_cells_differ(base_cell, mine_cell, compare_mode) {
        return "equal".to_string();
    }

    let has_base_content = has_workbook_cell_content(base_cell, compare_mode);
    let has_mine_content = has_workbook_cell_content(mine_cell, compare_mode);
    if has_base_content != has_mine_content {
        if has_mine_content {
            return "add".to_string();
        }
        return "delete".to_string();
    }

    "modify".to_string()
}

fn build_workbook_row_delta_json(
    base_row: Option<&WorkbookRowEntry>,
    mine_row: Option<&WorkbookRowEntry>,
    line_idx: usize,
    left_line_idx: Option<usize>,
    right_line_idx: Option<usize>,
    compare_mode: &str,
) -> WorkbookRowDeltaJson {
    let max_columns = usize::max(
        base_row.map(|row| row.cells.len()).unwrap_or(0),
        mine_row.map(|row| row.cells.len()).unwrap_or(0),
    );
    let empty_cell = WorkbookCellSnapshotJson { value: String::new(), formula: String::new() };
    let mut cell_deltas = Vec::new();
    let mut changed_columns = Vec::new();
    let mut strict_only_columns = Vec::new();
    let mut saw_add = false;
    let mut saw_delete = false;
    let mut saw_modify = false;

    for column in 0..max_columns {
        let base_cell = base_row
            .and_then(|row| row.cells.get(column))
            .cloned()
            .unwrap_or_else(|| empty_cell.clone());
        let mine_cell = mine_row
            .and_then(|row| row.cells.get(column))
            .cloned()
            .unwrap_or_else(|| empty_cell.clone());
        let changed = workbook_cells_differ(&base_cell, &mine_cell, compare_mode);
        let has_base_content = has_workbook_cell_content(&base_cell, compare_mode);
        let has_mine_content = has_workbook_cell_content(&mine_cell, compare_mode);
        let has_content = has_base_content || has_mine_content;
        if !changed && !has_content {
            continue;
        }

        let kind = resolve_cell_delta_kind(&base_cell, &mine_cell, compare_mode);
        if changed {
            changed_columns.push(column);
            if workbook_cells_differ(&base_cell, &mine_cell, "strict")
                && !workbook_cells_differ(&base_cell, &mine_cell, "content")
            {
                strict_only_columns.push(column);
            }
            match kind.as_str() {
                "add" => saw_add = true,
                "delete" => saw_delete = true,
                "modify" => saw_modify = true,
                _ => {}
            }
        }

        cell_deltas.push(WorkbookCellDeltaJson {
            column,
            base_cell,
            mine_cell,
            changed,
            masked: !changed,
            strict_only: strict_only_columns.contains(&column),
            kind,
            has_base_content,
            has_mine_content,
            has_content,
        });
    }

    let tone = if !saw_add && !saw_delete && !saw_modify {
        "equal"
    } else if saw_modify || (saw_add && saw_delete) {
        "mixed"
    } else if saw_add {
        "add"
    } else {
        "delete"
    };

    let mut line_idxs = Vec::new();
    if let Some(left_idx) = left_line_idx {
        line_idxs.push(left_idx);
    }
    if let Some(right_idx) = right_line_idx {
        line_idxs.push(right_idx);
    }

    WorkbookRowDeltaJson {
        line_idx,
        line_idxs,
        left_line_idx,
        right_line_idx,
        changed_count: changed_columns.len(),
        has_changes: !changed_columns.is_empty(),
        changed_columns,
        strict_only_columns,
        tone: tone.to_string(),
        cell_deltas,
    }
}

fn append_row_pairs(
    output: &mut Vec<DiffLineJson>,
    base_rows: &[WorkbookRowEntry],
    mine_rows: &[WorkbookRowEntry],
    sheet_rows: &mut Vec<WorkbookRowDeltaJson>,
    compare_mode: &str,
) {
    let anchors = patience_lcs(base_rows, mine_rows);
    let mut base_idx = 0usize;
    let mut mine_idx = 0usize;

    fn emit_unmatched_rows(
        output: &mut Vec<DiffLineJson>,
        base_rows: &[WorkbookRowEntry],
        mine_rows: &[WorkbookRowEntry],
        sheet_rows: &mut Vec<WorkbookRowDeltaJson>,
        base_idx: &mut usize,
        mine_idx: &mut usize,
        base_end: usize,
        mine_end: usize,
        compare_mode: &str,
    ) {
        let unmatched_count = usize::max(base_end.saturating_sub(*base_idx), mine_end.saturating_sub(*mine_idx));
        for offset in 0..unmatched_count {
            let base_row = if *base_idx + offset < base_end {
                base_rows.get(*base_idx + offset)
            } else {
                None
            };
            let mine_row = if *mine_idx + offset < mine_end {
                mine_rows.get(*mine_idx + offset)
            } else {
                None
            };

            match (base_row, mine_row) {
                (Some(base_row), Some(mine_row)) => {
                    let left_line_idx = output.len();
                    push_diff_line(
                        output,
                        "delete",
                        Some(base_row.raw_line.clone()),
                        None,
                        Some(base_row.row_number),
                        None,
                    );
                    let right_line_idx = output.len();
                    push_diff_line(
                        output,
                        "add",
                        None,
                        Some(mine_row.raw_line.clone()),
                        None,
                        Some(mine_row.row_number),
                    );
                    sheet_rows.push(build_workbook_row_delta_json(
                        Some(base_row),
                        Some(mine_row),
                        left_line_idx,
                        Some(left_line_idx),
                        Some(right_line_idx),
                        compare_mode,
                    ));
                }
                (Some(base_row), None) => {
                    let left_line_idx = output.len();
                    push_diff_line(
                        output,
                        "delete",
                        Some(base_row.raw_line.clone()),
                        None,
                        Some(base_row.row_number),
                        None,
                    );
                    sheet_rows.push(build_workbook_row_delta_json(
                        Some(base_row),
                        None,
                        left_line_idx,
                        Some(left_line_idx),
                        None,
                        compare_mode,
                    ));
                }
                (None, Some(mine_row)) => {
                    let right_line_idx = output.len();
                    push_diff_line(
                        output,
                        "add",
                        None,
                        Some(mine_row.raw_line.clone()),
                        None,
                        Some(mine_row.row_number),
                    );
                    sheet_rows.push(build_workbook_row_delta_json(
                        None,
                        Some(mine_row),
                        right_line_idx,
                        None,
                        Some(right_line_idx),
                        compare_mode,
                    ));
                }
                (None, None) => {}
            }
        }
        *base_idx = base_end;
        *mine_idx = mine_end;
    }

    for (anchor_base_idx, anchor_mine_idx) in anchors {
        emit_unmatched_rows(output, base_rows, mine_rows, sheet_rows, &mut base_idx, &mut mine_idx, anchor_base_idx, anchor_mine_idx, compare_mode);
        let base_row = &base_rows[anchor_base_idx];
        let mine_row = &mine_rows[anchor_mine_idx];
        let line_idx = output.len();
        push_diff_line(
            output,
            "equal",
            Some(base_row.raw_line.clone()),
            Some(mine_row.raw_line.clone()),
            Some(base_row.row_number),
            Some(mine_row.row_number),
        );
        sheet_rows.push(build_workbook_row_delta_json(
            Some(base_row),
            Some(mine_row),
            line_idx,
            Some(line_idx),
            Some(line_idx),
            compare_mode,
        ));
        base_idx = anchor_base_idx + 1;
        mine_idx = anchor_mine_idx + 1;
    }

    emit_unmatched_rows(output, base_rows, mine_rows, sheet_rows, &mut base_idx, &mut mine_idx, base_rows.len(), mine_rows.len(), compare_mode);
}

fn compute_workbook_diff_output(base_file_path: &str, mine_file_path: &str, compare_mode: &str) -> io::Result<WorkbookDiffOutputJson> {
    let base_sheets = parse_workbook_document(base_file_path, compare_mode)?;
    let mine_sheets = parse_workbook_document(mine_file_path, compare_mode)?;
    let sheet_pairs = align_workbook_sheets(base_sheets, mine_sheets);
    let mut diff_lines = Vec::new();
    let mut sections = Vec::new();

    for pair in sheet_pairs {
        match (pair.base, pair.mine) {
            (Some(base_sheet), Some(mine_sheet)) => {
                let section_name = base_sheet.name.clone();
                push_diff_line(
                    &mut diff_lines,
                    "equal",
                    Some(base_sheet.raw_sheet_line.clone()),
                    Some(mine_sheet.raw_sheet_line.clone()),
                    None,
                    None,
                );
                let mut rows = Vec::new();
                append_row_pairs(&mut diff_lines, &base_sheet.rows, &mine_sheet.rows, &mut rows, compare_mode);
                sections.push(WorkbookSectionDeltaJson { name: section_name, rows });
            }
            (Some(base_sheet), None) => {
                let section_name = base_sheet.name.clone();
                push_diff_line(
                    &mut diff_lines,
                    "delete",
                    Some(base_sheet.raw_sheet_line.clone()),
                    None,
                    None,
                    None,
                );
                let mut rows = Vec::new();
                for row in base_sheet.rows {
                    let line_idx = diff_lines.len();
                    push_diff_line(
                        &mut diff_lines,
                        "delete",
                        Some(row.raw_line.clone()),
                        None,
                        Some(row.row_number),
                        None,
                    );
                    rows.push(build_workbook_row_delta_json(
                        Some(&row),
                        None,
                        line_idx,
                        Some(line_idx),
                        None,
                        compare_mode,
                    ));
                }
                sections.push(WorkbookSectionDeltaJson { name: section_name, rows });
            }
            (None, Some(mine_sheet)) => {
                let section_name = mine_sheet.name.clone();
                push_diff_line(
                    &mut diff_lines,
                    "add",
                    None,
                    Some(mine_sheet.raw_sheet_line.clone()),
                    None,
                    None,
                );
                let mut rows = Vec::new();
                for row in mine_sheet.rows {
                    let line_idx = diff_lines.len();
                    push_diff_line(
                        &mut diff_lines,
                        "add",
                        None,
                        Some(row.raw_line.clone()),
                        None,
                        Some(row.row_number),
                    );
                    rows.push(build_workbook_row_delta_json(
                        None,
                        Some(&row),
                        line_idx,
                        None,
                        Some(line_idx),
                        compare_mode,
                    ));
                }
                sections.push(WorkbookSectionDeltaJson { name: section_name, rows });
            }
            (None, None) => {}
        }
    }

    Ok(WorkbookDiffOutputJson {
        diff_lines,
        workbook_delta: WorkbookPrecomputedDeltaJson {
            compare_mode: compare_mode.to_string(),
            sections,
        },
    })
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

fn get_column_index(cell_ref: &str) -> usize {
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

fn get_row_number(cell_ref: &str) -> usize {
    let digits: String = cell_ref.chars().filter(|ch| ch.is_ascii_digit()).collect();
    digits.parse::<usize>().unwrap_or(1).max(1)
}

fn parse_merge_range(range_ref: &str) -> Option<WorkbookMergeRange> {
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

fn is_truthy_flag(value: &str) -> bool {
    matches!(value.trim().to_ascii_lowercase().as_str(), "1" | "true")
}

fn parse_sheet_metadata_from_xml(sheet_name: &str, sheet_xml: &str) -> WorkbookSheetMetadata {
    let mut reader = XmlReader::from_str(sheet_xml);
    let mut hidden_columns = BTreeSet::new();
    let mut merge_ranges = Vec::new();
    let mut row_count = 0usize;
    let mut max_columns = 0usize;

    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) | Ok(Event::Empty(event)) => match event.name().as_ref() {
                b"row" => {
                    row_count += 1;
                }
                b"c" => {
                    if let Some(reference) = decode_attr_value(&reader, &event, b"r") {
                        max_columns = max_columns.max(get_column_index(&reference) + 1);
                    }
                }
                b"col" => {
                    let hidden = decode_attr_value(&reader, &event, b"hidden")
                        .map(|value| is_truthy_flag(&value))
                        .unwrap_or(false);
                    let min = decode_attr_value(&reader, &event, b"min")
                        .and_then(|value| value.parse::<usize>().ok())
                        .unwrap_or(1)
                        .max(1);
                    let max = decode_attr_value(&reader, &event, b"max")
                        .and_then(|value| value.parse::<usize>().ok())
                        .unwrap_or(min)
                        .max(min);
                    max_columns = max_columns.max(max);
                    if hidden {
                        for column in min - 1..=max - 1 {
                            hidden_columns.insert(column);
                        }
                    }
                }
                b"mergeCell" => {
                    if let Some(range_ref) = decode_attr_value(&reader, &event, b"ref") {
                        if let Some(range) = parse_merge_range(&range_ref) {
                            max_columns = max_columns.max(range.end_col + 1);
                            merge_ranges.push(range);
                        }
                    }
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }

    WorkbookSheetMetadata {
        name: sheet_name.to_string(),
        hidden_columns: hidden_columns.into_iter().collect(),
        merge_ranges,
        row_count,
        max_columns,
    }
}

fn collect_workbook_metadata(file_path: &str) -> Option<WorkbookMetadataMap> {
    if !is_zip_workbook(file_path) {
        return Some(WorkbookMetadataMap {
            sheets: BTreeMap::new(),
        });
    }

    let sheet_infos = collect_visible_sheet_infos(file_path)?;
    let file = File::open(file_path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let mut sheets = BTreeMap::new();

    for sheet_info in sheet_infos {
        let sheet_xml = read_zip_entry_to_string(&mut archive, &sheet_info.path)?;
        let metadata = parse_sheet_metadata_from_xml(&sheet_info.name, &sheet_xml);
        sheets.insert(sheet_info.name.clone(), metadata);
    }

    Some(WorkbookMetadataMap { sheets })
}

fn write_workbook_text(file_path: &str) -> io::Result<()> {
    let mut workbook = match open_workbook_auto(file_path) {
        Ok(workbook) => workbook,
        Err(error) => {
            eprintln!("Failed to open workbook: {}", error);
            std::process::exit(3);
        }
    };

    let sheet_names = collect_visible_sheet_infos(file_path)
        .map(|infos| infos.into_iter().map(|info| info.name).collect::<Vec<_>>())
        .unwrap_or_else(|| workbook.sheet_names().to_owned());
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

                write_sheet(&mut handle, sheet_name, &range, Some(&formulas))?;
                if index + 1 < sheet_names.len() {
                    writeln!(handle)?;
                }
            }
            Err(error) => {
                eprintln!("Failed to read worksheet '{}': {}", sheet_name, error);
                std::process::exit(5);
            }
        }
    }

    Ok(())
}

fn write_workbook_metadata_json(file_path: &str) -> io::Result<()> {
    let metadata = collect_workbook_metadata(file_path).unwrap_or_else(|| WorkbookMetadataMap {
        sheets: BTreeMap::new(),
    });
    let stdout = io::stdout();
    let mut handle = stdout.lock();
    serde_json::to_writer(&mut handle, &metadata)
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error.to_string()))?;
    Ok(())
}

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
