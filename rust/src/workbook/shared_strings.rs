use super::*;

pub(crate) struct SharedStringsStore {
    xml: Option<String>,
    item_ranges: Vec<(usize, usize)>,
    decoded_cache: RefCell<Vec<Option<String>>>,
}

impl SharedStringsStore {
    pub(super) fn empty() -> Self {
        Self {
            xml: None,
            item_ranges: Vec::new(),
            decoded_cache: RefCell::new(Vec::new()),
        }
    }

    pub(super) fn from_xml(xml: String) -> Self {
        let item_ranges = find_shared_string_item_ranges(&xml);
        let decoded_cache = RefCell::new(vec![None; item_ranges.len()]);
        Self {
            xml: Some(xml),
            item_ranges,
            decoded_cache,
        }
    }

    pub(super) fn len(&self) -> usize {
        self.item_ranges.len()
    }

    fn item_fragment(&self, index: usize) -> Option<&str> {
        let xml = self.xml.as_ref()?;
        let (start, end) = *self.item_ranges.get(index)?;
        xml.get(start..end)
    }

    pub(super) fn get(&self, index: usize) -> Option<String> {
        {
            let cache = self.decoded_cache.borrow();
            if let Some(Some(value)) = cache.get(index) {
                return Some(value.clone());
            }
        }

        let fragment = self.item_fragment(index)?;
        let decoded = decode_shared_string_item(fragment);
        let mut cache = self.decoded_cache.borrow_mut();
        let slot = cache.get_mut(index)?;
        *slot = Some(decoded.clone());
        Some(decoded)
    }

    pub(super) fn with_value<R>(&self, index: usize, map: impl FnOnce(&str) -> R) -> Option<R> {
        {
            let cache = self.decoded_cache.borrow();
            if let Some(Some(value)) = cache.get(index) {
                return Some(map(value));
            }
        }

        let fragment = self.item_fragment(index)?;
        let decoded = decode_shared_string_item(fragment);
        {
            let mut cache = self.decoded_cache.borrow_mut();
            let slot = cache.get_mut(index)?;
            *slot = Some(decoded);
        }
        let cache = self.decoded_cache.borrow();
        cache.get(index)?.as_deref().map(map)
    }

    pub(crate) fn value_equals(&self, index: usize, other: &SharedStringsStore) -> bool {
        match (self.item_fragment(index), other.item_fragment(index)) {
            (Some(left), Some(right)) if left == right => true,
            (Some(_), Some(_)) => self.get(index) == other.get(index),
            (None, None) => true,
            _ => false,
        }
    }
}

fn is_name_boundary(byte: Option<u8>) -> bool {
    matches!(byte, None | Some(b' ' | b'\t' | b'\r' | b'\n' | b'>' | b'/'))
}

fn find_subslice(bytes: &[u8], start: usize, needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || start >= bytes.len() || needle.len() > bytes.len().saturating_sub(start) {
        return None;
    }
    let mut position = start;
    let last_start = bytes.len() - needle.len();
    while position <= last_start {
        if &bytes[position..position + needle.len()] == needle {
            return Some(position);
        }
        position += 1;
    }
    None
}

fn find_shared_string_item_ranges(xml: &str) -> Vec<(usize, usize)> {
    let bytes = xml.as_bytes();
    let mut result = Vec::new();
    let mut position = 0usize;

    while position + 3 <= bytes.len() {
        if bytes[position] != b'<' || bytes[position + 1] != b's' || bytes[position + 2] != b'i' {
            position += 1;
            continue;
        }
        if !is_name_boundary(bytes.get(position + 3).copied()) {
            position += 1;
            continue;
        }

        let Some(start_tag_end) = find_subslice(bytes, position, b">") else {
            break;
        };
        if start_tag_end > position && bytes[start_tag_end - 1] == b'/' {
            result.push((position, start_tag_end + 1));
            position = start_tag_end + 1;
            continue;
        }

        let Some(end_tag_start) = find_subslice(bytes, start_tag_end + 1, b"</si>") else {
            break;
        };
        let end = end_tag_start + b"</si>".len();
        result.push((position, end));
        position = end;
    }

    result
}

fn decode_shared_string_item(shared_string_item_xml: &str) -> String {
    let mut reader = XmlReader::from_str(shared_string_item_xml);
    let mut current = String::new();
    let mut capture_text = false;

    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) => match event.name().as_ref() {
                b"t" => {
                    capture_text = true;
                }
                _ => {}
            },
            Ok(Event::End(event)) => match event.name().as_ref() {
                b"t" => {
                    capture_text = false;
                }
                _ => {}
            },
            Ok(Event::Text(text)) if capture_text => {
                if let Ok(value) = text.decode() {
                    current.push_str(value.as_ref());
                }
            }
            Ok(Event::CData(text)) if capture_text => {
                current.push_str(&String::from_utf8_lossy(text.as_ref()));
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }

    current
}

pub(super) fn parse_shared_strings(archive: &mut ZipArchive<File>) -> SharedStringsStore {
    let Some(shared_strings_xml) = super::read_zip_entry_to_string(archive, "xl/sharedStrings.xml") else {
        return SharedStringsStore::empty();
    };

    SharedStringsStore::from_xml(shared_strings_xml)
}
