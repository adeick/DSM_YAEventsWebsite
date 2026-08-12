// // Turns a hand-rolled "[text](url)" link syntax into real <a>
// // elements — see DescriptionField, which is how admins actually
// // insert that syntax. Intentionally NOT dangerouslySetInnerHTML: this
// // only ever produces plain text and <a> nodes from a narrow regex
// // restricted to http/https URLs, so there's no path for arbitrary
// // HTML or a javascript: URL to get through, unlike rendering raw
// // stored HTML would allow.
// const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g

// export function renderLinkedText(text) {
//   if (!text) return null

//   const nodes = []
//   let lastIndex = 0
//   let match
//   let key = 0

//   while ((match = LINK_PATTERN.exec(text)) !== null) {
//     if (match.index > lastIndex) {
//       nodes.push(text.slice(lastIndex, match.index))
//     }
//     const [fullMatch, linkText, url] = match
//     nodes.push(
//       <a key={key++} href={url} target="_blank" rel="noopener noreferrer">
//         {linkText}
//       </a>
//     )
//     lastIndex = match.index + fullMatch.length
//   }

//   if (lastIndex < text.length) {
//     nodes.push(text.slice(lastIndex))
//   }

//   return nodes
// }