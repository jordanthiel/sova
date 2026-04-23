import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import DownloadPage from './pages/DownloadPage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import SupportPage from './pages/SupportPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/download" element={<DownloadPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/support" element={<SupportPage />} />
    </Routes>
  )
}

export default App
