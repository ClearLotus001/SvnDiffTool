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

#[derive(Debug, Clone)]
struct WorkbookRowEntry {
    raw_line: String,
    signature: String,
    row_number: usize,
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
struct DiffLineJson {
    #[serde(rename = "type")]
    line_type: String,
    base: Option<String>,
    mine: Option<String>,
    base_line_no: Option<usize>,
    mine_line_no: Option<usize>,
}

fn parse_args() -> Result<(OutputMode, String), String> {
    let mut args = env::args().skip(1);
    match args.next().as_deref() {
        Some("--metadata-json") => {
            let file_path = args
                .next()
                .ok_or_else(|| "Usage: svn_excel_parser --metadata-json <workbook-path>".to_string())?;
            Ok((OutputMode::MetadataJson, file_path))
        }
        Some("--diff-json") => {
            let base_path = args
                .next()
                .ok_or_else(|| "Usage: svn_excel_parser --diff-json <base-workbook-path> <mine-workbook-path>".to_string())?;
            let mine_path = args
                .next()
                .ok_or_else(|| "Usage: svn_excel_parser --diff-json <base-workbook-path> <mine-workbook-path>".to_string())?;
            Ok((OutputMode::DiffJson, format!("{base_path}\n{mine_path}")))
        }
        Some(file_path) => Ok((OutputMode::Text, file_path.to_string())),
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

fn build_row_line_and_signature(
    row_number: usize,
    cells: &[String],
) -> WorkbookRowEntry {
    let raw_line = if cells.is_empty() {
        format!("{}\t{}", ROW_PREFIX, row_number)
    } else {
        format!("{}\t{}\t{}", ROW_PREFIX, row_number, cells.join("\t"))
    };
    let signature = cells.join("\t");

    WorkbookRowEntry {
        raw_line,
        signature,
        row_number,
    }
}

fn collect_workbook_row_entries(
    range: &Range<Data>,
    formulas: Option<&Range<String>>,
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

        let mut encoded_cells = Vec::new();
        if let Some(last_col) = last_non_empty {
            for abs_col in start_col..=last_col {
                let value = row
                    .get((abs_col - start_col) as usize)
                    .map(format_cell)
                    .unwrap_or_default();
                let formula = formulas
                    .and_then(|formula_range| get_formula_for_position(formula_range, abs_row, abs_col))
                    .map(|formula| format!("={}", formula));
                encoded_cells.push(encode_cell(&value, formula.as_deref()));
            }
        }

        result.push(build_row_line_and_signature((abs_row + 1) as usize, &encoded_cells));
    }

    result
}

fn parse_workbook_document(file_path: &str) -> io::Result<Vec<WorkbookSheetDiffEntry>> {
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
            rows: collect_workbook_row_entries(&range, Some(&formulas)),
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

#[derive(Clone)]
struct LcsNode {
    base_idx: usize,
    mine_idx: usize,
    prev: Option<Box<LcsNode>>,
}

fn patience_lcs(base_rows: &[WorkbookRowEntry], mine_rows: &[WorkbookRowEntry]) -> Vec<(usize, usize)> {
    if base_rows.is_empty() || mine_rows.is_empty() {
        return Vec::new();
    }

    let mut mine_index: HashMap<&str, Vec<usize>> = HashMap::new();
    for (index, row) in mine_rows.iter().enumerate() {
        mine_index.entry(row.signature.as_str()).or_default().push(index);
    }

    let mut piles: Vec<Option<LcsNode>> = Vec::new();
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

            let node = LcsNode {
                base_idx,
                mine_idx,
                prev: if low > 0 {
                    piles[low - 1].as_ref().cloned().map(Box::new)
                } else {
                    None
                },
            };

            if low == piles.len() {
                piles.push(Some(node.clone()));
                tails.push(mine_idx);
            } else {
                piles[low] = Some(node.clone());
                tails[low] = mine_idx;
            }
        }
    }

    let mut result = Vec::new();
    let mut cursor = piles.last().and_then(|node| node.as_ref().cloned());
    while let Some(node) = cursor {
        result.push((node.base_idx, node.mine_idx));
        cursor = node.prev.as_deref().cloned();
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

fn append_row_pairs(
    output: &mut Vec<DiffLineJson>,
    base_rows: &[WorkbookRowEntry],
    mine_rows: &[WorkbookRowEntry],
) {
    let anchors = patience_lcs(base_rows, mine_rows);
    let mut base_idx = 0usize;
    let mut mine_idx = 0usize;

    fn emit_unmatched_rows(
        output: &mut Vec<DiffLineJson>,
        base_rows: &[WorkbookRowEntry],
        mine_rows: &[WorkbookRowEntry],
        base_idx: &mut usize,
        mine_idx: &mut usize,
        base_end: usize,
        mine_end: usize,
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
                    push_diff_line(
                        output,
                        "delete",
                        Some(base_row.raw_line.clone()),
                        None,
                        Some(base_row.row_number),
                        None,
                    );
                    push_diff_line(
                        output,
                        "add",
                        None,
                        Some(mine_row.raw_line.clone()),
                        None,
                        Some(mine_row.row_number),
                    );
                }
                (Some(base_row), None) => {
                    push_diff_line(
                        output,
                        "delete",
                        Some(base_row.raw_line.clone()),
                        None,
                        Some(base_row.row_number),
                        None,
                    );
                }
                (None, Some(mine_row)) => {
                    push_diff_line(
                        output,
                        "add",
                        None,
                        Some(mine_row.raw_line.clone()),
                        None,
                        Some(mine_row.row_number),
                    );
                }
                (None, None) => {}
            }
        }
        *base_idx = base_end;
        *mine_idx = mine_end;
    }

    for (anchor_base_idx, anchor_mine_idx) in anchors {
        emit_unmatched_rows(output, base_rows, mine_rows, &mut base_idx, &mut mine_idx, anchor_base_idx, anchor_mine_idx);
        let base_row = &base_rows[anchor_base_idx];
        let mine_row = &mine_rows[anchor_mine_idx];
        push_diff_line(
            output,
            "equal",
            Some(base_row.raw_line.clone()),
            Some(mine_row.raw_line.clone()),
            Some(base_row.row_number),
            Some(mine_row.row_number),
        );
        base_idx = anchor_base_idx + 1;
        mine_idx = anchor_mine_idx + 1;
    }

    emit_unmatched_rows(output, base_rows, mine_rows, &mut base_idx, &mut mine_idx, base_rows.len(), mine_rows.len());
}

fn compute_workbook_diff_lines(base_file_path: &str, mine_file_path: &str) -> io::Result<Vec<DiffLineJson>> {
    let base_sheets = parse_workbook_document(base_file_path)?;
    let mine_sheets = parse_workbook_document(mine_file_path)?;
    let sheet_pairs = align_workbook_sheets(base_sheets, mine_sheets);
    let mut result = Vec::new();

    for pair in sheet_pairs {
        match (pair.base, pair.mine) {
            (Some(base_sheet), Some(mine_sheet)) => {
                push_diff_line(
                    &mut result,
                    "equal",
                    Some(base_sheet.raw_sheet_line.clone()),
                    Some(mine_sheet.raw_sheet_line.clone()),
                    None,
                    None,
                );
                append_row_pairs(&mut result, &base_sheet.rows, &mine_sheet.rows);
            }
            (Some(base_sheet), None) => {
                push_diff_line(
                    &mut result,
                    "delete",
                    Some(base_sheet.raw_sheet_line.clone()),
                    None,
                    None,
                    None,
                );
                for row in base_sheet.rows {
                    push_diff_line(
                        &mut result,
                        "delete",
                        Some(row.raw_line),
                        None,
                        Some(row.row_number),
                        None,
                    );
                }
            }
            (None, Some(mine_sheet)) => {
                push_diff_line(
                    &mut result,
                    "add",
                    None,
                    Some(mine_sheet.raw_sheet_line.clone()),
                    None,
                    None,
                );
                for row in mine_sheet.rows {
                    push_diff_line(
                        &mut result,
                        "add",
                        None,
                        Some(row.raw_line),
                        None,
                        Some(row.row_number),
                    );
                }
            }
            (None, None) => {}
        }
    }

    Ok(result)
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
    let (output_mode, file_path) = match parse_args() {
        Ok(result) => result,
        Err(message) => {
            eprintln!("{}", message);
            std::process::exit(1);
        }
    };

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
            match compute_workbook_diff_lines(base_file_path, mine_file_path) {
                Ok(diff_lines) => {
                    let stdout = io::stdout();
                    let mut handle = stdout.lock();
                    serde_json::to_writer(&mut handle, &diff_lines)
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
