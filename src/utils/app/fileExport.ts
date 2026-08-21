export interface TextExportResult {
  status: 'saved' | 'downloaded' | 'cancelled';
  location: string | null;
}

function isMissingExportHandler(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("No handler registered for 'save-diagnostic-report'")
    || message.includes('saveDiagnosticReport is not a function')
  );
}

function triggerBrowserDownload(content: string, fileName: string): TextExportResult {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
  return {
    status: 'downloaded',
    location: fileName,
  };
}

export async function exportTextFile(content: string, defaultFileName: string): Promise<TextExportResult> {
  if (window.versora?.saveDiagnosticReport) {
    try {
      const filePath = await window.versora.saveDiagnosticReport(content, defaultFileName);
      return filePath
        ? {
            status: 'saved',
            location: filePath,
          }
        : {
            status: 'cancelled',
            location: null,
          };
    } catch (error) {
      if (!isMissingExportHandler(error)) {
        throw error;
      }
    }
  }

  return triggerBrowserDownload(content, defaultFileName);
}
