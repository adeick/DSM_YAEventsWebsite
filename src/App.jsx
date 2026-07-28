import PublicPage from './pages/PublicPage'
import AdminPage from './pages/AdminPage'

export default function App() {
  const isAdmin = window.location.pathname.startsWith('/admin')
  return isAdmin ? <AdminPage /> : <PublicPage />
}