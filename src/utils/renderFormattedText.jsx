// Turns a small hand-rolled formatting syntax into real elements —
// **bold**, _italic_, ~underline~, and [link text](url). Each
// delimiter is a distinct character so none of the patterns can be
// confused with each other (unlike real markdown, where * does double
// duty for both bold and italic and needs more careful handling).
// Formatting does NOT nest (no bold text inside a link, etc.) — this
// is a deliberately small format, not a markdown implementation.
//
// Intentionally NOT dangerouslySetInnerHTML: this only ever produces
// plain text and a fixed set of elements (<strong>/<em>/<u>/<a>) from
// a narrow regex — links are further restricted to http/https URLs —
// so there's no path for arbitrary HTML or a javascript: URL to get
// through, unlike rendering raw stored HTML would allow.
//
// See DescriptionField, which is how admins actually insert this
// syntax (via toolbar buttons, not by typing the symbols themselves).
const FORMAT_PATTERN =
  /\*\*([^*]+)\*\*|_([^_]+)_|~([^~]+)~|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g

export function renderFormattedText(text) {
  if (!text) return null

  const nodes = []
  let lastIndex = 0
  let match
  let key = 0

  while ((match = FORMAT_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    const [fullMatch, bold, italic, underline, linkText, linkUrl] = match
    if (bold !== undefined) {
      nodes.push(<strong key={key++}>{bold}</strong>)
    } else if (italic !== undefined) {
      nodes.push(<em key={key++}>{italic}</em>)
    } else if (underline !== undefined) {
      nodes.push(<u key={key++}>{underline}</u>)
    } else {
      nodes.push(
        <a key={key++} href={linkUrl} target="_blank" rel="noopener noreferrer">
          {linkText}
        </a>
      )
    }

    lastIndex = match.index + fullMatch.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}