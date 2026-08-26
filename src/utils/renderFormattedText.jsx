import { parseFormatSyntax } from './formatSyntax'

// Turns the small hand-rolled formatting syntax (see formatSyntax.js)
// into real elements — **bold**, _italic_, ~underline~, and
// [link text](url).
//
// Intentionally NOT dangerouslySetInnerHTML: this only ever produces
// plain text and a fixed set of elements (<strong>/<em>/<u>/<a>) from
// a narrow regex — links are further restricted to http/https URLs —
// so there's no path for arbitrary HTML or a javascript: URL to get
// through, unlike rendering raw stored HTML would allow.
//
// See DescriptionField, which is how admins actually insert this
// syntax (via a WYSIWYG toolbar, not by typing the symbols themselves).
export function renderFormattedText(text) {
  const segments = parseFormatSyntax(text)
  if (segments.length === 0) return null

  return segments.map((seg, key) => {
    switch (seg.type) {
      case 'bold':
        return <strong key={key}>{seg.content}</strong>
      case 'italic':
        return <em key={key}>{seg.content}</em>
      case 'underline':
        return <u key={key}>{seg.content}</u>
      case 'link':
        return (
          <a key={key} href={seg.url} target="_blank" rel="noopener noreferrer">
            {seg.content}
          </a>
        )
      default:
        return seg.content
    }
  })
}