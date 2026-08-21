use super::*;

pub(super) fn build_row_line_and_signature(
    row_number: usize,
    cells: &[WorkbookCellSnapshotJson],
) -> WorkbookRowEntry {
    let (raw_line, strict_signature, content_signature) = build_row_strings(row_number, cells);

    WorkbookRowEntry {
        raw_line,
        strict_signature,
        content_signature,
        row_number,
        cells: cells.to_vec(),
    }
}

pub(super) fn build_row_line_and_signature_owned(
    row_number: usize,
    cells: Vec<WorkbookCellSnapshotJson>,
) -> WorkbookRowEntry {
    let (raw_line, strict_signature, content_signature) = build_row_strings(row_number, &cells);
    WorkbookRowEntry {
        raw_line,
        strict_signature,
        content_signature,
        row_number,
        cells,
    }
}

fn build_row_strings(
    row_number: usize,
    cells: &[WorkbookCellSnapshotJson],
) -> (String, String, String) {
    let strict_signature_cell_count = cells
        .iter()
        .rposition(|cell| has_workbook_cell_content(cell, "strict"))
        .map(|index| index + 1)
        .unwrap_or(0);
    let content_signature_cell_count = cells
        .iter()
        .rposition(|cell| has_workbook_cell_content(cell, "content"))
        .map(|index| index + 1)
        .unwrap_or(0);
    let mut raw_line = format!("{}\t{}", ROW_PREFIX, row_number);
    let mut strict_signature = String::new();
    let mut content_signature = String::new();
    for (index, cell) in cells.iter().enumerate() {
        let encoded = encode_cell(
            &cell.value,
            (!cell.formula.is_empty()).then_some(cell.formula.as_str()),
        );
        raw_line.push('\t');
        raw_line.push_str(&encoded);
        if index < strict_signature_cell_count {
            if index > 0 {
                strict_signature.push('\t');
            }
            strict_signature.push_str(&encoded);
        }
        if index < content_signature_cell_count {
            if index > 0 {
                content_signature.push('\t');
            }
            if cell.value.trim().is_empty() && !cell.value.is_empty() {
                content_signature.push_str(&encode_cell(
                    "",
                    (!cell.formula.is_empty()).then_some(cell.formula.as_str()),
                ));
            } else {
                content_signature.push_str(&encoded);
            }
        }
    }
    (raw_line, strict_signature, content_signature)
}

pub(super) fn collect_workbook_row_entries(
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

        let mut row_cells = Vec::new();
        if let Some(last_col) = last_non_empty {
            for abs_col in start_col..=last_col {
                let value = row
                    .get((abs_col - start_col) as usize)
                    .map(format_cell)
                    .unwrap_or_default();
                let formula = formulas
                    .and_then(|formula_range| {
                        get_formula_for_position(formula_range, abs_row, abs_col)
                    })
                    .map(|formula| format!("={}", formula));
                row_cells.push(WorkbookCellSnapshotJson {
                    value,
                    formula: formula.unwrap_or_default(),
                });
            }
        }

        result.push(build_row_line_and_signature(
            (abs_row + 1) as usize,
            &row_cells,
        ));
    }

    result
}

pub(super) fn collect_workbook_text_row_entries(
    range: &Range<Data>,
    formulas: Option<&Range<String>>,
) -> Vec<WorkbookTextRowEntry> {
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

        let raw_line = if let Some(last_col) = last_non_empty {
            let mut encoded_cells = Vec::with_capacity((last_col - start_col + 1) as usize);
            for abs_col in start_col..=last_col {
                let value = row
                    .get((abs_col - start_col) as usize)
                    .map(format_cell)
                    .unwrap_or_default();
                let formula = formulas
                    .and_then(|formula_range| {
                        get_formula_for_position(formula_range, abs_row, abs_col)
                    })
                    .map(|formula| format!("={}", formula));
                encoded_cells.push(encode_cell(&value, formula.as_deref()));
            }
            format!(
                "{}\t{}\t{}",
                ROW_PREFIX,
                abs_row + 1,
                encoded_cells.join("\t")
            )
        } else {
            format!("{}\t{}", ROW_PREFIX, abs_row + 1)
        };

        result.push(WorkbookTextRowEntry {
            raw_line,
            row_number: (abs_row + 1) as usize,
        });
    }

    result
}

pub(super) fn write_sheet<W: Write>(
    writer: &mut W,
    sheet_name: &str,
    range: &Range<Data>,
    formulas: Option<&Range<String>>,
) -> io::Result<()> {
    writeln!(
        writer,
        "{}\t{}",
        SHEET_PREFIX,
        normalize_field(sheet_name).trim()
    )?;

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
                    .and_then(|formula_range| {
                        get_formula_for_position(formula_range, abs_row, abs_col)
                    })
                    .map(|formula| format!("={}", formula));
                let display = encode_cell(&value, formula.as_deref());
                write!(writer, "\t{}", display)?;
            }
        }
        writeln!(writer)?;
    }

    Ok(())
}
