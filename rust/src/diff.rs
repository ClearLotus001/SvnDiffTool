use std::collections::{HashMap, HashSet};
use std::io;
use std::thread;

use crate::model::{
    workbook_cells_differ, DiffLineJson, WorkbookCellDeltaJson, WorkbookCellSnapshotJson,
    WorkbookDiffOutputJson, WorkbookPrecomputedDeltaJson, WorkbookRowDeltaJson, WorkbookRowEntry,
    WorkbookSectionDeltaJson, WorkbookSheetDiffEntry, WorkbookTextSheetEntry, SHEET_PREFIX,
    normalize_field,
};
use crate::profile;
use crate::workbook::{
    parse_workbook_document, parse_workbook_text_document, ZipWorkbookContext,
};

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
    let serialized_mine = if line_type == "equal" && base == mine {
        None
    } else {
        mine
    };
    let serialized_mine_line_no = if line_type == "equal" && base_line_no == mine_line_no {
        None
    } else {
        mine_line_no
    };
    output.push(DiffLineJson {
        line_type: line_type.to_string(),
        base,
        mine: serialized_mine,
        base_line_no,
        mine_line_no: serialized_mine_line_no,
    });
}

fn build_workbook_row_delta_json(
    base_row: Option<&WorkbookRowEntry>,
    mine_row: Option<&WorkbookRowEntry>,
    left_line_idx: Option<usize>,
    right_line_idx: Option<usize>,
    compare_mode: &str,
) -> WorkbookRowDeltaJson {
    let max_columns = usize::max(
        base_row.map(|row| row.cells.len()).unwrap_or(0),
        mine_row.map(|row| row.cells.len()).unwrap_or(0),
    );

    if let (Some(base_row), Some(mine_row)) = (base_row, mine_row) {
        if base_row.signature == mine_row.signature {
            return WorkbookRowDeltaJson {
                left_line_idx,
                right_line_idx,
                cell_deltas: Vec::new(),
            };
        }
    }

    let empty_cell = WorkbookCellSnapshotJson { value: String::new(), formula: String::new() };
    let mut cell_deltas = Vec::with_capacity(max_columns);

    for column in 0..max_columns {
        let base_cell = base_row
            .and_then(|row| row.cells.get(column))
            .cloned()
            .unwrap_or_else(|| empty_cell.clone());
        let mine_cell = mine_row
            .and_then(|row| row.cells.get(column))
            .cloned()
            .unwrap_or_else(|| empty_cell.clone());
        if !workbook_cells_differ(&base_cell, &mine_cell, compare_mode) {
            continue;
        }

        cell_deltas.push(WorkbookCellDeltaJson {
            column,
            base_cell,
            mine_cell,
        });
    }

    WorkbookRowDeltaJson {
        left_line_idx,
        right_line_idx,
        cell_deltas,
    }
}

fn append_row_pairs(
    output: &mut Vec<DiffLineJson>,
    base_rows: &[WorkbookRowEntry],
    mine_rows: &[WorkbookRowEntry],
    sheet_rows: &mut Vec<WorkbookRowDeltaJson>,
    compare_mode: &str,
    collect_row_deltas: bool,
) {
    if base_rows.len() == mine_rows.len()
        && base_rows
            .iter()
            .zip(mine_rows.iter())
            .all(|(base_row, mine_row)| {
                base_row.row_number == mine_row.row_number
                    && base_row.signature == mine_row.signature
            })
    {
        for (base_row, mine_row) in base_rows.iter().zip(mine_rows.iter()) {
            let line_idx = output.len();
            push_diff_line(
                output,
                "equal",
                Some(base_row.raw_line.clone()),
                Some(mine_row.raw_line.clone()),
                Some(base_row.row_number),
                Some(mine_row.row_number),
            );
            if collect_row_deltas {
                sheet_rows.push(build_workbook_row_delta_json(
                    Some(base_row),
                    Some(mine_row),
                    Some(line_idx),
                    Some(line_idx),
                    compare_mode,
                ));
            }
        }
        return;
    }

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
        collect_row_deltas: bool,
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
                    if collect_row_deltas {
                        sheet_rows.push(build_workbook_row_delta_json(
                            Some(base_row),
                            Some(mine_row),
                            Some(left_line_idx),
                            Some(right_line_idx),
                            compare_mode,
                        ));
                    }
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
                    if collect_row_deltas {
                        sheet_rows.push(build_workbook_row_delta_json(
                            Some(base_row),
                            None,
                            Some(left_line_idx),
                            None,
                            compare_mode,
                        ));
                    }
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
                    if collect_row_deltas {
                        sheet_rows.push(build_workbook_row_delta_json(
                            None,
                            Some(mine_row),
                            None,
                            Some(right_line_idx),
                            compare_mode,
                        ));
                    }
                }
                (None, None) => {}
            }
        }
        *base_idx = base_end;
        *mine_idx = mine_end;
    }

    for (anchor_base_idx, anchor_mine_idx) in anchors {
        emit_unmatched_rows(
            output,
            base_rows,
            mine_rows,
            sheet_rows,
            &mut base_idx,
            &mut mine_idx,
            anchor_base_idx,
            anchor_mine_idx,
            compare_mode,
            collect_row_deltas,
        );
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
        if collect_row_deltas {
            sheet_rows.push(build_workbook_row_delta_json(
                Some(base_row),
                Some(mine_row),
                Some(line_idx),
                Some(line_idx),
                compare_mode,
            ));
        }
        base_idx = anchor_base_idx + 1;
        mine_idx = anchor_mine_idx + 1;
    }

    emit_unmatched_rows(
        output,
        base_rows,
        mine_rows,
        sheet_rows,
        &mut base_idx,
        &mut mine_idx,
        base_rows.len(),
        mine_rows.len(),
        compare_mode,
        collect_row_deltas,
    );
}

fn append_equal_sheet_output(
    diff_lines: &mut Vec<DiffLineJson>,
    sections: &mut Vec<WorkbookSectionDeltaJson>,
    sheet_name: String,
    raw_sheet_line: String,
    rows: Vec<(String, usize)>,
    include_workbook_delta: bool,
) {
    push_diff_line(
        diff_lines,
        "equal",
        Some(raw_sheet_line.clone()),
        Some(raw_sheet_line),
        None,
        None,
    );

    let mut section_rows = Vec::new();
    for (raw_line, row_number) in rows {
        let line_idx = diff_lines.len();
        push_diff_line(
            diff_lines,
            "equal",
            Some(raw_line.clone()),
            Some(raw_line),
            Some(row_number),
            Some(row_number),
        );
        if include_workbook_delta {
            section_rows.push(WorkbookRowDeltaJson {
                left_line_idx: Some(line_idx),
                right_line_idx: Some(line_idx),
                cell_deltas: Vec::new(),
            });
        }
    }

    if include_workbook_delta {
        sections.push(WorkbookSectionDeltaJson {
            name: sheet_name,
            rows: section_rows,
        });
    }
}

fn build_equal_workbook_output(
    sheets: Vec<WorkbookTextSheetEntry>,
    compare_mode: &str,
) -> WorkbookDiffOutputJson {
    let include_workbook_delta = compare_mode == "strict";
    let mut diff_lines = Vec::new();
    let mut sections = Vec::new();

    for sheet in sheets {
        append_equal_sheet_output(
            &mut diff_lines,
            &mut sections,
            sheet.name,
            sheet.raw_sheet_line,
            sheet.rows
                .into_iter()
                .map(|row| (row.raw_line, row.row_number))
                .collect(),
            include_workbook_delta,
        );
    }

    WorkbookDiffOutputJson {
        diff_lines,
        workbook_delta: include_workbook_delta.then(|| WorkbookPrecomputedDeltaJson {
            compare_mode: compare_mode.to_string(),
            sections,
        }),
    }
}

pub fn compute_workbook_diff_output(
    base_file_path: &str,
    mine_file_path: &str,
    compare_mode: &str,
) -> io::Result<WorkbookDiffOutputJson> {
    let total_start = profile::start();
    if base_file_path == mine_file_path {
        profile::log(format!(
            "diff_fast_path same_file=true file={} mode={}",
            base_file_path,
            compare_mode,
        ));
        let sheets = parse_workbook_text_document(base_file_path, None)?;
        let output = build_equal_workbook_output(sheets, compare_mode);
        profile::log_elapsed(
            total_start,
            format!("compute_workbook_diff_output mode={} same_file=true", compare_mode),
        );
        return Ok(output);
    }

    let inspect_start = profile::start();
    let mut use_sheet_inspection = false;
    let mut base_sheet_names = Vec::new();
    let mut mine_sheet_names = Vec::new();
    let mut unchanged_sheet_names: HashSet<String> = HashSet::new();
    let mut base_equal_by_name: HashMap<String, WorkbookTextSheetEntry> = HashMap::new();
    let mut base_zip_context = ZipWorkbookContext::open(base_file_path).ok();
    let mut mine_zip_context = ZipWorkbookContext::open(mine_file_path).ok();

    if let (Some(base_context), Some(mine_context)) = (&mut base_zip_context, &mut mine_zip_context) {
        let candidate_base_sheet_names = base_context.sheet_names();
        let candidate_mine_sheet_names = mine_context.sheet_names();
        let candidate_mine_sheet_name_set: HashSet<String> =
            candidate_mine_sheet_names.iter().cloned().collect();
        let mut xml_different_common_sheet_names = HashSet::new();
        let mut inspection_failed = false;

        use_sheet_inspection = true;
        base_sheet_names = candidate_base_sheet_names;
        mine_sheet_names = candidate_mine_sheet_names;

        for sheet_name in &base_sheet_names {
            if !candidate_mine_sheet_name_set.contains(sheet_name) {
                continue;
            }

            let base_xml = match base_context.read_sheet_xml_by_name(sheet_name) {
                Ok(value) => value,
                Err(_) => {
                    inspection_failed = true;
                    break;
                }
            };
            let mine_xml = match mine_context.read_sheet_xml_by_name(sheet_name) {
                Ok(value) => value,
                Err(_) => {
                    inspection_failed = true;
                    break;
                }
            };

            if base_xml != mine_xml {
                xml_different_common_sheet_names.insert(sheet_name.clone());
                continue;
            }

            let scanned = base_context.scan_text_sheet_with_shared_refs(sheet_name, &base_xml);
            let shared_strings_match = scanned
                .shared_string_indices
                .iter()
                .all(|index| base_context.shared_strings().value_equals(*index, mine_context.shared_strings()));

            if shared_strings_match {
                unchanged_sheet_names.insert(sheet_name.clone());
                base_equal_by_name.insert(sheet_name.clone(), scanned.sheet);
            }
        }

        if !inspection_failed && !xml_different_common_sheet_names.is_empty() {
            let base_inspections =
                base_context.collect_text_sheet_inspections(Some(&xml_different_common_sheet_names));
            let mine_fingerprints =
                mine_context.collect_semantic_fingerprints(Some(&xml_different_common_sheet_names));

            match (base_inspections, mine_fingerprints) {
                (Ok(base_inspections), Ok(mine_fingerprints)) => {
                    let equal_xml_different_sheet_names: HashSet<String> = xml_different_common_sheet_names
                        .iter()
                        .filter(|sheet_name| {
                            base_inspections
                                .get(*sheet_name)
                                .map(|inspection| &inspection.fingerprint)
                                == mine_fingerprints.get(*sheet_name)
                        })
                        .cloned()
                        .collect();

                    if !equal_xml_different_sheet_names.is_empty() {
                        for sheet_name in equal_xml_different_sheet_names {
                            let Some(inspection) = base_inspections.get(&sheet_name) else {
                                inspection_failed = true;
                                break;
                            };
                            unchanged_sheet_names.insert(sheet_name.clone());
                            base_equal_by_name.insert(
                                sheet_name.clone(),
                                WorkbookTextSheetEntry {
                                    name: sheet_name.clone(),
                                    raw_sheet_line: format!("{}\t{}", SHEET_PREFIX, normalize_field(&sheet_name).trim()),
                                    rows: inspection.rows.clone(),
                                },
                            );
                        }
                    }
                }
                _ => inspection_failed = true,
            }
        }

        if inspection_failed {
            use_sheet_inspection = false;
            unchanged_sheet_names.clear();
            base_equal_by_name.clear();
        }
    }

    let base_full_sheet_names: HashSet<String> = if use_sheet_inspection {
        base_sheet_names
            .iter()
            .filter(|sheet_name| !unchanged_sheet_names.contains(*sheet_name))
            .cloned()
            .collect()
    } else {
        HashSet::new()
    };
    let mine_full_sheet_names: HashSet<String> = if use_sheet_inspection {
        mine_sheet_names
            .iter()
            .filter(|sheet_name| !unchanged_sheet_names.contains(*sheet_name))
            .cloned()
            .collect()
    } else {
        HashSet::new()
    };
    if use_sheet_inspection {
        profile::log_elapsed(
            inspect_start,
            format!(
                "diff_sheet_inspection mode={} base_sheets={} mine_sheets={} unchanged={} changed_base={} changed_mine={}",
                compare_mode,
                base_sheet_names.len(),
                mine_sheet_names.len(),
                unchanged_sheet_names.len(),
                base_full_sheet_names.len(),
                mine_full_sheet_names.len(),
            ),
        );
    } else {
        profile::log_elapsed(
            inspect_start,
            format!("diff_sheet_inspection mode={} zip_fast_path=false", compare_mode),
        );
    }

    let base_file_path_owned = base_file_path.to_string();
    let mine_file_path_owned = mine_file_path.to_string();
    let compare_mode_owned = compare_mode.to_string();
    let base_compare_mode = compare_mode_owned.clone();
    let mine_compare_mode = compare_mode_owned.clone();
    let base_full_requested = if use_sheet_inspection {
        Some(base_full_sheet_names.clone())
    } else {
        None
    };
    let mine_full_requested = if use_sheet_inspection {
        Some(mine_full_sheet_names.clone())
    } else {
        None
    };

    let base_full_handle = thread::spawn(move || {
        parse_workbook_document(&base_file_path_owned, &base_compare_mode, base_full_requested.as_ref())
    });
    let mine_full_handle = thread::spawn(move || {
        parse_workbook_document(&mine_file_path_owned, &mine_compare_mode, mine_full_requested.as_ref())
    });

    let base_full_sheets = base_full_handle
        .join()
        .map_err(|_| io::Error::new(io::ErrorKind::Other, "Workbook base parsing thread panicked"))??;
    let mine_full_sheets = mine_full_handle
        .join()
        .map_err(|_| io::Error::new(io::ErrorKind::Other, "Workbook mine parsing thread panicked"))??;

    if !use_sheet_inspection {
        base_sheet_names = base_full_sheets.iter().map(|sheet| sheet.name.clone()).collect();
        mine_sheet_names = mine_full_sheets.iter().map(|sheet| sheet.name.clone()).collect();
    }

    let base_sheet_name_set: HashSet<String> = base_sheet_names.iter().cloned().collect();

    let mut base_full_by_name: HashMap<String, WorkbookSheetDiffEntry> = base_full_sheets
        .into_iter()
        .map(|sheet| (sheet.name.clone(), sheet))
        .collect();
    let mut mine_full_by_name: HashMap<String, WorkbookSheetDiffEntry> = mine_full_sheets
        .into_iter()
        .map(|sheet| (sheet.name.clone(), sheet))
        .collect();

    let mut diff_lines = Vec::new();
    let mut sections = Vec::new();
    let include_workbook_delta = compare_mode == "strict";

    for base_sheet_name in base_sheet_names {
        if unchanged_sheet_names.contains(&base_sheet_name) {
            if let Some(sheet) = base_equal_by_name.remove(&base_sheet_name) {
                profile::log(format!(
                    "diff_sheet mode={} sheet={} path=equal-sheet-fast-path rows={}",
                    compare_mode,
                    sheet.name,
                    sheet.rows.len(),
                ));
                append_equal_sheet_output(
                    &mut diff_lines,
                    &mut sections,
                    sheet.name,
                    sheet.raw_sheet_line,
                    sheet.rows
                        .into_iter()
                        .map(|row| (row.raw_line, row.row_number))
                        .collect(),
                    include_workbook_delta,
                );
            }
            continue;
        }

        let Some(base_sheet) = base_full_by_name.remove(&base_sheet_name) else {
            continue;
        };

        if let Some(mine_sheet) = mine_full_by_name.remove(&base_sheet_name) {
            let sheet_start = profile::start();
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
            append_row_pairs(
                &mut diff_lines,
                &base_sheet.rows,
                &mine_sheet.rows,
                &mut rows,
                compare_mode,
                include_workbook_delta,
            );
            if include_workbook_delta {
                sections.push(WorkbookSectionDeltaJson { name: section_name, rows });
            }
            let section_name_for_log = base_sheet.name.clone();
            let base_row_count = base_sheet.rows.len();
            let mine_row_count = mine_sheet.rows.len();
            profile::log_elapsed(
                sheet_start,
                format!(
                    "diff_sheet mode={} sheet={} kind=paired base_rows={} mine_rows={}",
                    compare_mode,
                    section_name_for_log,
                    base_row_count,
                    mine_row_count,
                ),
            );
            continue;
        }

        let sheet_start = profile::start();
        let section_name = base_sheet.name.clone();
        let deleted_row_count = base_sheet.rows.len();
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
            if include_workbook_delta {
                rows.push(build_workbook_row_delta_json(
                    Some(&row),
                    None,
                    Some(line_idx),
                    None,
                    compare_mode,
                ));
            }
        }
        let section_name_for_log = section_name.clone();
        if include_workbook_delta {
            sections.push(WorkbookSectionDeltaJson { name: section_name, rows });
        }
        profile::log_elapsed(
            sheet_start,
            format!(
                "diff_sheet mode={} sheet={} kind=delete rows={}",
                compare_mode,
                section_name_for_log,
                deleted_row_count,
            ),
        );
    }

    for mine_sheet_name in mine_sheet_names {
        if base_sheet_name_set.contains(&mine_sheet_name) {
            continue;
        }
        let Some(mine_sheet) = mine_full_by_name.remove(&mine_sheet_name) else {
            continue;
        };
        let sheet_start = profile::start();
        let section_name = mine_sheet.name.clone();
        let added_row_count = mine_sheet.rows.len();
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
            if include_workbook_delta {
                rows.push(build_workbook_row_delta_json(
                    None,
                    Some(&row),
                    None,
                    Some(line_idx),
                    compare_mode,
                ));
            }
        }
        let section_name_for_log = section_name.clone();
        if include_workbook_delta {
            sections.push(WorkbookSectionDeltaJson { name: section_name, rows });
        }
        profile::log_elapsed(
            sheet_start,
            format!(
                "diff_sheet mode={} sheet={} kind=add rows={}",
                compare_mode,
                section_name_for_log,
                added_row_count,
            ),
        );
    }

    let output = WorkbookDiffOutputJson {
        diff_lines,
        workbook_delta: include_workbook_delta.then(|| WorkbookPrecomputedDeltaJson {
            compare_mode: compare_mode.to_string(),
            sections,
        }),
    };
    profile::log_elapsed(
        total_start,
        format!("compute_workbook_diff_output mode={} same_file=false", compare_mode),
    );
    Ok(output)
}
