import { useState } from 'react'
import { useSession } from '../hooks/useSession'
import { supabase } from '../supabaseClient'

// Lands here after clicking either an invite link or a "forgot
// password" recovery link — both just establish a logged-in session
// with the old/no password still technically valid, and leave it to
// the app to actually ask for a new one. Supabase's client parses the
// token out of the URL automatically on load (detectSessionInUrl,
// on by default), so by the time useSession's listener fires, the
// session below reflects that — no manual token handling needed here.
//
// This one page covers both invite and recovery on purpose: both
// cases reduce to the same thing from here — "you're logged in and
// need to set a password" — so there's no reason to build two forms.
//
// Requires Supabase's Site URL (Authentication > URL Configuration)
// to point at this page's URL (e.g. https://yoursite.org/set-password)
// so invite/recovery emails land here instead of the public
// homepage — see chat for the full rationale.
export default function SetPasswordPage() {
  const session = useSession()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.")
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (error) {
      setError(error.message)
    } else {
      setDone(true)
    }
  }

  if (session === undefined) {
    return <p className="event-list__status">Loading…</p>
  }

  if (!session) {
    return (
      <div className="admin-page admin-page--centered">
        <div className="login-form">
          <h2>Link expired</h2>
          <p>
            This invite or password reset link is no longer valid. Ask for a new invite, or go
            back and sign in if you already have a password set.
          </p>
          <a className="back-link" href="/admin">
            ← Back to sign in
          </a>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="admin-page admin-page--centered">
        <div className="login-form">
          <h2>Password set</h2>
          <p>You're all set — you can head to the admin page now.</p>
          <a className="back-link" href="/admin">
            Continue to admin →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-page admin-page--centered">
      <form className="login-form" onSubmit={handleSubmit}>
        <h2>Set your password</h2>
        <label>
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Set password'}
        </button>
      </form>
    </div>
  )
}