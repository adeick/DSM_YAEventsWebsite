// Shared by any card that links an address out to a maps app —
// currently ChurchCard and EventDetailCard.

// iPadOS reports navigator.platform as 'MacIntel' just like a real Mac
// — maxTouchPoints is what actually distinguishes the two, since a
// Mac (even one with a touchscreen-less trackpad) reports 0.
export function isIOSDevice() {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

// Apple Maps only makes sense to hand someone already on an iOS
// device — everyone else (desktop of any OS, Android) gets Google
// Maps, which opens its native app on Android automatically and falls
// back to the website everywhere else.
export function directionsUrl(address) {
  const query = encodeURIComponent(address)
  return isIOSDevice()
    ? `https://maps.apple.com/?daddr=${query}`
    : `https://www.google.com/maps/dir/?api=1&destination=${query}`
}