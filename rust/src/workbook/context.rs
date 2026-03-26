use super::*;

#[derive(Debug, Clone)]
pub(super) struct SheetInfo {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SheetSemanticFingerprint {
    pub row_count: usize,
    pub digest: u64,
}

#[derive(Clone)]
pub(crate) struct TextSheetInspection {
    pub fingerprint: SheetSemanticFingerprint,
    pub rows: Vec<WorkbookTextRowEntry>,
}

pub(crate) struct TextSheetSharedStringRefs {
    pub sheet: WorkbookTextSheetEntry,
    pub shared_string_indices: HashSet<usize>,
}

#[derive(Clone, Default)]
struct CachedSheetScan {
    fingerprint: Option<SheetSemanticFingerprint>,
    text_rows: Option<Vec<WorkbookTextRowEntry>>,
}

pub(crate) struct ZipWorkbookContext {
    file_path: String,
    archive: ZipArchive<File>,
    sheet_infos: Vec<SheetInfo>,
    shared_strings: SharedStringsStore,
    sheet_scan_cache: HashMap<String, CachedSheetScan>,
}

impl ZipWorkbookContext {
    pub(crate) fn open(file_path: &str) -> io::Result<Self> {
        if !is_zip_workbook(file_path) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!("Workbook is not a zip workbook: {file_path}"),
            ));
        }

        let file = File::open(file_path)
            .map_err(|error| io::Error::new(io::ErrorKind::Other, format!("Failed to open workbook zip: {error}")))?;
        let mut archive = ZipArchive::new(file)
            .map_err(|error| io::Error::new(io::ErrorKind::Other, format!("Failed to read workbook zip: {error}")))?;
        let sheet_infos = collect_visible_sheet_infos_from_archive(&mut archive).unwrap_or_default();
        let shared_strings_start = profile::start();
        let shared_strings = parse_shared_strings(&mut archive);
        profile::log_elapsed(
            shared_strings_start,
            format!("parse_shared_strings file={} count={}", file_path, shared_strings.len()),
        );

        Ok(Self {
            file_path: file_path.to_string(),
            archive,
            sheet_infos,
            shared_strings,
            sheet_scan_cache: HashMap::new(),
        })
    }

    pub(crate) fn sheet_names(&self) -> Vec<String> {
        self.sheet_infos.iter().map(|sheet_info| sheet_info.name.clone()).collect()
    }

    pub(crate) fn shared_strings(&self) -> &SharedStringsStore {
        &self.shared_strings
    }

    fn requested_sheet_infos(&self, requested_sheet_names: Option<&HashSet<String>>) -> Vec<SheetInfo> {
        self.sheet_infos
            .iter()
            .filter(|sheet_info| match requested_sheet_names {
                Some(requested) => requested.contains(&sheet_info.name),
                None => true,
            })
            .cloned()
            .collect()
    }

    fn find_sheet_info(&self, sheet_name: &str) -> Option<SheetInfo> {
        self.sheet_infos
            .iter()
            .find(|sheet_info| sheet_info.name == sheet_name)
            .cloned()
    }

    fn read_sheet_xml(&mut self, sheet_info: &SheetInfo) -> io::Result<String> {
        super::read_zip_entry_to_string(&mut self.archive, &sheet_info.path).ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::Other,
                format!("Failed to read sheet xml '{}'", sheet_info.path),
            )
        })
    }

    pub(crate) fn read_sheet_xml_by_name(&mut self, sheet_name: &str) -> io::Result<String> {
        let sheet_info = self.find_sheet_info(sheet_name).ok_or_else(|| {
            io::Error::new(io::ErrorKind::NotFound, format!("Sheet not found: {sheet_name}"))
        })?;
        self.read_sheet_xml(&sheet_info)
    }

    pub(crate) fn collect_semantic_fingerprints(
        &mut self,
        requested_sheet_names: Option<&HashSet<String>>,
    ) -> io::Result<HashMap<String, SheetSemanticFingerprint>> {
        let mut result = HashMap::new();

        for sheet_info in self.requested_sheet_infos(requested_sheet_names) {
            if let Some(fingerprint) = self
                .sheet_scan_cache
                .get(&sheet_info.name)
                .and_then(|cached| cached.fingerprint.clone())
            {
                result.insert(sheet_info.name.clone(), fingerprint);
                continue;
            }

            let sheet_start = profile::start();
            let sheet_xml = self.read_sheet_xml(&sheet_info)?;
            let fingerprint = scan_encoded_sheet_rows(
                &sheet_xml,
                &self.shared_strings,
                SemanticFingerprintSink::default(),
            );
            let row_count = fingerprint.row_count;
            self.sheet_scan_cache
                .entry(sheet_info.name.clone())
                .or_default()
                .fingerprint = Some(fingerprint.clone());
            result.insert(sheet_info.name.clone(), fingerprint);
            profile::log_elapsed(
                sheet_start,
                format!(
                    "parse_sheet file={} kind=semantic-fingerprint sheet={} rows={}",
                    self.file_path,
                    sheet_info.name,
                    row_count,
                ),
            );
        }

        Ok(result)
    }

    pub(crate) fn collect_text_sheet_inspections(
        &mut self,
        requested_sheet_names: Option<&HashSet<String>>,
    ) -> io::Result<HashMap<String, TextSheetInspection>> {
        let mut result = HashMap::new();

        for sheet_info in self.requested_sheet_infos(requested_sheet_names) {
            if let Some(cached) = self.sheet_scan_cache.get(&sheet_info.name) {
                if let (Some(fingerprint), Some(rows)) = (&cached.fingerprint, &cached.text_rows) {
                    result.insert(
                        sheet_info.name.clone(),
                        TextSheetInspection {
                            fingerprint: fingerprint.clone(),
                            rows: rows.clone(),
                        },
                    );
                    continue;
                }
            }

            let sheet_start = profile::start();
            let sheet_xml = self.read_sheet_xml(&sheet_info)?;
            let scanned = scan_encoded_sheet_rows(
                &sheet_xml,
                &self.shared_strings,
                SemanticFingerprintWithTextRowsSink::default(),
            );
            let row_count = scanned.fingerprint.row_count;
            self.sheet_scan_cache.insert(
                sheet_info.name.clone(),
                CachedSheetScan {
                    fingerprint: Some(scanned.fingerprint.clone()),
                    text_rows: Some(scanned.rows.clone()),
                },
            );
            result.insert(
                sheet_info.name.clone(),
                TextSheetInspection {
                    fingerprint: scanned.fingerprint,
                    rows: scanned.rows,
                },
            );
            profile::log_elapsed(
                sheet_start,
                format!(
                    "parse_sheet file={} kind=semantic+text-cached sheet={} rows={}",
                    self.file_path,
                    sheet_info.name,
                    row_count,
                ),
            );
        }

        Ok(result)
    }

    pub(crate) fn scan_text_sheet_with_shared_refs(
        &self,
        sheet_name: &str,
        sheet_xml: &str,
    ) -> TextSheetSharedStringRefs {
        let scanned = scan_text_sheet_rows_fast(sheet_xml, &self.shared_strings);
        TextSheetSharedStringRefs {
            sheet: WorkbookTextSheetEntry {
                name: sheet_name.to_string(),
                raw_sheet_line: format!("{}\t{}", SHEET_PREFIX, normalize_field(sheet_name).trim()),
                rows: scanned.rows,
            },
            shared_string_indices: scanned.shared_string_indices,
        }
    }

    pub(crate) fn parse_text_sheets(
        &mut self,
        requested_sheet_names: Option<&HashSet<String>>,
    ) -> io::Result<Vec<WorkbookTextSheetEntry>> {
        let mut result = Vec::new();

        for sheet_info in self.requested_sheet_infos(requested_sheet_names) {
            if let Some(rows) = self
                .sheet_scan_cache
                .get(&sheet_info.name)
                .and_then(|cached| cached.text_rows.clone())
            {
                result.push(WorkbookTextSheetEntry {
                    name: sheet_info.name.clone(),
                    raw_sheet_line: format!("{}\t{}", SHEET_PREFIX, normalize_field(&sheet_info.name).trim()),
                    rows,
                });
                continue;
            }

            let sheet_start = profile::start();
            let sheet_xml = self.read_sheet_xml(&sheet_info)?;
            let rows = scan_text_sheet_rows_fast(&sheet_xml, &self.shared_strings).rows;
            let row_count = rows.len();
            self.sheet_scan_cache
                .entry(sheet_info.name.clone())
                .or_default()
                .text_rows = Some(rows.clone());
            result.push(WorkbookTextSheetEntry {
                name: sheet_info.name.clone(),
                raw_sheet_line: format!("{}\t{}", SHEET_PREFIX, normalize_field(&sheet_info.name).trim()),
                rows,
            });
            profile::log_elapsed(
                sheet_start,
                format!(
                    "parse_sheet file={} kind=text-only-xml sheet={} rows={}",
                    self.file_path,
                    sheet_info.name,
                    row_count,
                ),
            );
        }

        Ok(result)
    }

    pub(crate) fn parse_full_sheets(
        &mut self,
        compare_mode: &str,
        requested_sheet_names: Option<&HashSet<String>>,
    ) -> io::Result<Vec<WorkbookSheetDiffEntry>> {
        let mut result = Vec::new();

        for sheet_info in self.requested_sheet_infos(requested_sheet_names) {
            let sheet_start = profile::start();
            let sheet_xml = self.read_sheet_xml(&sheet_info)?;
            let rows = scan_full_sheet_rows(
                &sheet_xml,
                &self.shared_strings,
                FullRowsSink::new(compare_mode),
            );
            let row_count = rows.len();
            let col_count = rows.iter().map(|row| row.cells.len()).max().unwrap_or(0);
            result.push(WorkbookSheetDiffEntry {
                name: sheet_info.name.clone(),
                raw_sheet_line: format!("{}\t{}", SHEET_PREFIX, normalize_field(&sheet_info.name).trim()),
                rows,
            });
            profile::log_elapsed(
                sheet_start,
                format!(
                    "parse_sheet file={} mode={} kind=full-xml sheet={} rows={} cols={}",
                    self.file_path,
                    compare_mode,
                    sheet_info.name,
                    row_count,
                    col_count,
                ),
            );
        }

        Ok(result)
    }
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

fn parse_workbook_relationships(archive: &mut ZipArchive<File>) -> Option<HashMap<String, String>> {
    let rels_xml = super::read_zip_entry_to_string(archive, "xl/_rels/workbook.xml.rels")?;
    let mut reader = XmlReader::from_str(&rels_xml);
    let mut rel_map = HashMap::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) | Ok(Event::Empty(event)) => {
                if event.name().as_ref() != b"Relationship" {
                    continue;
                }
                let id = super::decode_attr_value(&reader, &event, b"Id").unwrap_or_default();
                let target = super::decode_attr_value(&reader, &event, b"Target").unwrap_or_default();
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

pub(super) fn collect_visible_sheet_infos_from_archive(
    archive: &mut ZipArchive<File>,
) -> Option<Vec<SheetInfo>> {
    let workbook_xml = super::read_zip_entry_to_string(archive, "xl/workbook.xml")?;
    let rel_map = parse_workbook_relationships(archive)?;
    let mut reader = XmlReader::from_str(&workbook_xml);
    let mut sheet_infos = Vec::new();
    let mut sheet_index = 0usize;

    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) | Ok(Event::Empty(event)) => {
                if event.name().as_ref() != b"sheet" {
                    continue;
                }

                let name = super::decode_attr_value(&reader, &event, b"name")
                    .unwrap_or_else(|| format!("Sheet{}", sheet_index + 1));
                let state = super::decode_attr_value(&reader, &event, b"state")
                    .unwrap_or_default()
                    .trim()
                    .to_ascii_lowercase();
                let rel_id = super::decode_attr_value(&reader, &event, b"r:id").unwrap_or_default();

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

pub(super) fn collect_visible_sheet_infos(file_path: &str) -> Option<Vec<SheetInfo>> {
    if !is_zip_workbook(file_path) {
        return None;
    }

    let file = File::open(file_path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    collect_visible_sheet_infos_from_archive(&mut archive)
}
