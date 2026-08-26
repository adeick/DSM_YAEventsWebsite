import { supabase } from '../supabaseClient'

const BUCKET = 'site-images'

// Uploads a file to the "site-images" Storage bucket under `folder`,
// using a timestamp-prefixed filename so repeated uploads never
// silently collide with (or overwrite) an older file — overwriting a
// path a browser/CDN already cached would otherwise risk serving a
// stale image indefinitely. Returns the public URL to store on the
// relevant row (organizations, churches, event_preview_images).
export async function uploadImage(file, folder) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
  const path = `${folder}/${Date.now()}-${safeName}`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}