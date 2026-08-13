// Vercel Edge Middleware.
//
// Link-preview crawlers (iMessage, WhatsApp, Slack, etc.) read Open Graph
// meta tags from whatever HTML the server returns on the FIRST request —
// they don't run JavaScript, so React never gets a chance to update
// <title> or inject event-specific tags client-side. Since every event
// link is the same route (`/?event=<id>`), the static index.html always
// shows the same generic title/description.
//
// This middleware intercepts requests to `/` that carry an `?event=`
// query param, looks the event up in Supabase, and rewrites the
// og:title / og:description / og:image tags in index.html before it's
// served — so the preview reflects the actual event. Normal browser
// navigation is unaffected: React still takes over and renders the page
// exactly as before, this only changes what's in the initial HTML.
//
// Runs only on the exact path "/" (see `config.matcher` below), so it
// never touches JS/CSS/image asset requests.

export const config = {
  matcher: '/',
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

// Strips the site's small custom formatting syntax (**bold**, _italic_,
// ~underline~, [text](url)) down to plain text for use in og:description.
// Mirrors the pattern in src/utils/renderFormattedText.jsx.
function stripFormatting(text) {
  if (!text) return ''
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~([^~]+)~/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
    .trim()
}

export default async function middleware(request) {
  const url = new URL(request.url)
  const eventId = url.searchParams.get('event')
  if (!eventId) return // not an event link, serve the site as normal

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!supabaseUrl || !supabaseKey) return // env vars not set, fall through

  try {
    const apiRes = await fetch(
      `${supabaseUrl}/rest/v1/events?id=eq.${encodeURIComponent(eventId)}&select=title,description,location_photo_url`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    )
    if (!apiRes.ok) return

    const [event] = await apiRes.json()
    if (!event) return // unknown/deleted event id, fall through to default page

    const htmlRes = await fetch(`${url.origin}/index.html`)
    let html = await htmlRes.text()

    const title = event.title
    const description =
      stripFormatting(event.description).slice(0, 200) ||
      'Join us for this parish event — Daily Mass Des Moines.'
    const image = event.location_photo_url
      ? event.location_photo_url
      : `${url.origin}/og-default.png`

    html = html
      .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
      .replace(
        /<meta property="og:title" content=".*?" \/>/,
        `<meta property="og:title" content="${escapeHtml(title)}" />`
      )
      .replace(
        /<meta property="og:description" content=".*?" \/>/,
        `<meta property="og:description" content="${escapeHtml(description)}" />`
      )
      .replace(
        /<meta property="og:image" content=".*?" \/>/,
        `<meta property="og:image" content="${escapeHtml(image)}" />`
      )
      .replace(
        '</head>',
        `<meta property="og:url" content="${escapeHtml(url.toString())}" />\n  </head>`
      )

    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  } catch {
    return // any failure: fall through to the default static page
  }
}