// One-time helper: turns a list of church addresses into SQL INSERT
// statements with real latitude/longitude, using OpenStreetMap's free
// Nominatim geocoder (no API key needed).
//
// Run locally with:  node scripts/geocode-churches.mjs
// Then paste the printed SQL into the Supabase SQL Editor.
//
// This is a starter list pulled from the Diocese of Des Moines' public
// parish directory (Des Moines metro only — add more rows as you like).

const churches = [
  { name: "St. Ambrose Cathedral", address: "607 High St, Des Moines, IA" },
  { name: "Basilica of St. John", address: "1915 University Ave, Des Moines, IA" },
  { name: "All Saints", address: "650 NE 52nd Ave, Des Moines, IA" },
  { name: "Christ the King", address: "5711 SW 9th St, Des Moines, IA" },
  { name: "Holy Trinity", address: "2926 Beaver Ave, Des Moines, IA" },
  { name: "Our Lady of the Americas", address: "1271 E 9th St, Des Moines, IA" },
  { name: "St. Anthony's", address: "15 Indianola Rd, Des Moines, IA" },
  { name: "St. Augustin's", address: "545 42nd St, Des Moines, IA" },
  { name: "Our Lady's Immaculate Heart", address: "510 E First St, Ankeny, IA" },
  { name: "St. Luke the Evangelist", address: "1102 NW Weigel Dr, Ankeny, IA" },
  { name: "St. Francis of Assisi", address: " 7075 Ashworth Rd, West Des Moines, IA" },
  { name: "St. Pius X", address: "3663 66th St, Urbandale, IA" },
  { name: "Sacred Heart", address: "1627 Grand Ave, West Des Moines, IA" },
  { name: "St. Theresa", address: "1230 Merle Hay Rd, Des Moines, IA" },
]

async function geocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
    address
  )}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'church-events-site-setup-script' },
  })
  const results = await res.json()
  if (!results.length) return null
  return { lat: results[0].lat, lon: results[0].lon }
}

function escape(str) {
  return str.replace(/'/g, "''")
}

const rows = []
for (const church of churches) {
  const coords = await geocode(church.address)
  if (!coords) {
    console.error(`Could not geocode: ${church.name}`)
    continue
  }
  rows.push(
    `('${escape(church.name)}', '${escape(church.address)}', ${coords.lat}, ${coords.lon})`
  )
  // Nominatim's usage policy asks for max 1 request/second.
  await new Promise((r) => setTimeout(r, 1100))
}

console.log('\ninsert into churches (name, address, latitude, longitude) values')
console.log(rows.join(',\n') + ';')