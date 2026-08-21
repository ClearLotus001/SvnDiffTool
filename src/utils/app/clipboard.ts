/** Copy text to clipboard, falling back to the Electron bridge when needed. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the Electron clipboard bridge.
  }

  if (window.versora) {
    window.versora.writeClipboardText(text);
    return true;
  }

  return false;
}
