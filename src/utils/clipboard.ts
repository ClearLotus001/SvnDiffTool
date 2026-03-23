/** Copy text to clipboard, falling back to the Electron bridge when needed. */
export function copyText(text: string): void {
  void (async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch {
      // Fall through to the Electron clipboard bridge.
    }

    if (window.svnDiff) {
      window.svnDiff.writeClipboardText(text);
      return;
    }

    console.warn('Clipboard write failed: no browser or Electron clipboard API available.');
  })();
}
