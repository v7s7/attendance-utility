// A short message for the page HR is sent to next, e.g. "Imported" when an import takes
// them straight to the report. It is shown only on that page and only for a few seconds.

let flash: { path: string; text: string; at: number } | null = null;

export function setFlash(path: string, text: string): void {
  flash = { path: path.split("?")[0], text, at: Date.now() };
}

/** The message left for this page, if it was left just now. */
export function readFlash(path: string): string | null {
  return flash && flash.path === path && Date.now() - flash.at < 10_000 ? flash.text : null;
}
