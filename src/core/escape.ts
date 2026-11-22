const XML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

/** Escapes text for safe use in HTML/SVG content and attribute values. */
export function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => XML_ESCAPES[c] ?? c);
}
