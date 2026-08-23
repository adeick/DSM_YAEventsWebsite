import PublicPage from './pages/PublicPage'
import AdminPage from './pages/AdminPage'
import DevPage from './pages/DevPage'
import SetPasswordPage from './pages/SetPasswordPage'

export default function App() {
  const path = window.location.pathname
  if (path.startsWith('/admin')) return <AdminPage />
  if (path.startsWith('/dev')) return <DevPage />
  if (path.startsWith('/set-password')) return <SetPasswordPage />
  return <PublicPage />
}