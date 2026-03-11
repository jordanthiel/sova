import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Link } from 'react-router-dom'
import './DownloadPage.css'

const DEEPLINK_SCHEME = 'sova://'
const FALLBACK_DELAY_MS = 2000

const APP_STORE_URL =
  import.meta.env.VITE_APP_STORE_URL ||
  'https://apps.apple.com/app/sova/idXXXX'
const PLAY_STORE_URL =
  import.meta.env.VITE_PLAY_STORE_URL ||
  'https://play.google.com/store/apps/details?id=com.jordanthiel.sova'

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod|Android/i.test(ua)
}

export default function DownloadPage() {
  const [showFallback, setShowFallback] = useState(false)
  const mobile = isMobile()

  useEffect(() => {
    if (!mobile) {
      setShowFallback(true)
      return
    }

    // Attempt to open app via deep link
    const timeout = setTimeout(() => {
      setShowFallback(true)
    }, FALLBACK_DELAY_MS)

    window.location.href = DEEPLINK_SCHEME

    return () => clearTimeout(timeout)
  }, [mobile])

  const downloadUrl = `${window.location.origin}/download`

  return (
    <div className="download-page">
      <div className="download-content">
        <Link to="/" className="download-back">
          ← Back to Sova
        </Link>

        <div className="download-hero">
          <div className="download-icon-wrap">
            <img src="/sova-icon.png" alt="Sova" className="download-icon" />
          </div>
          <h1 className="download-title">Get Sova</h1>
          <p className="download-subtitle">Better sleep for your little one</p>
        </div>

        {showFallback && (
          <div className="download-fallback">
            {mobile && (
              <p className="download-fallback-hint">
                App not installed? Get it from the store below.
              </p>
            )}
            <div className="download-buttons">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="download-btn download-btn-apple"
                aria-label="Download on the App Store"
              >
                App Store
              </a>
              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="download-btn download-btn-google"
                aria-label="Get it on Google Play"
              >
                Google Play
              </a>
            </div>
          </div>
        )}

        {!mobile && (
          <p className="download-qr-hint">
            Scan with your phone to download
          </p>
        )}

        <div className="download-qr-section">
          <div className="download-qr-wrap">
            <QRCodeSVG
              value={downloadUrl}
              size={200}
              level="M"
              bgColor="#0B1426"
              fgColor="#E8EDF2"
              marginSize={2}
              title="Scan to open download page on your phone"
            />
          </div>
          <p className="download-qr-label">
            Scan to open this page on your phone
          </p>
        </div>
      </div>
    </div>
  )
}
