import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import DownloadPage from './pages/DownloadPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/download" element={<DownloadPage />} />
    </Routes>
  )
}

export default App
