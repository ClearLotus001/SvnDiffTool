use super::*;

fn parse_sheet_metadata_from_xml(_sheet_name: &str, sheet_xml: &str) -> WorkbookSheetMetadata {
    let mut reader = XmlReader::from_str(sheet_xml);
    let mut hidden_columns = BTreeSet::new();
    let mut merge_ranges = Vec::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) | Ok(Event::Empty(event)) => match event.name().as_ref() {
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
                    if hidden {
                        for column in min - 1..=max - 1 {
                            hidden_columns.insert(column);
                        }
                    }
                }
                b"mergeCell" => {
                    if let Some(range_ref) = decode_attr_value(&reader, &event, b"ref") {
                        if let Some(range) = parse_merge_range(&range_ref) {
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
        hidden_columns: hidden_columns.into_iter().collect(),
        merge_ranges,
    }
}

pub(super) fn collect_workbook_metadata_impl(file_path: &str) -> Option<WorkbookMetadataMap> {
    if !is_zip_workbook(file_path) {
        return Some(WorkbookMetadataMap {
            sheets: BTreeMap::new(),
        });
    }

    let total_start = profile::start();
    let sheet_infos = collect_visible_sheet_infos(file_path)?;
    let file = File::open(file_path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let mut sheets = BTreeMap::new();

    for sheet_info in sheet_infos {
        let sheet_start = profile::start();
        let sheet_xml = read_zip_entry_to_string(&mut archive, &sheet_info.path)?;
        let metadata = parse_sheet_metadata_from_xml(&sheet_info.name, &sheet_xml);
        profile::log_elapsed(
            sheet_start,
            format!(
                "collect_sheet_metadata file={} sheet={} hidden={} merges={}",
                file_path,
                sheet_info.name,
                metadata.hidden_columns.len(),
                metadata.merge_ranges.len(),
            ),
        );
        sheets.insert(sheet_info.name.clone(), metadata);
    }

    profile::log_elapsed(
        total_start,
        format!("collect_workbook_metadata file={} sheets={}", file_path, sheets.len()),
    );
    Some(WorkbookMetadataMap { sheets })
}
