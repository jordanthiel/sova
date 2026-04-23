import { Link } from 'react-router-dom'
import './LegalPage.css'

const supportEmail = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() ?? ''

function buildDeletionMailto(): string | null {
  if (!supportEmail) return null
  const subject = 'Account deletion request'
  const body = [
    'Hello,',
    '',
    'I would like to request deletion of my Sova account.',
    '',
    'Account email: ',
    'User ID (optional; from Settings if signed in): ',
    '',
    'Please let me know if you need anything else to verify this request.',
  ].join('\n')
  return `mailto:${encodeURIComponent(supportEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function buildSupportMailto(): string | null {
  if (!supportEmail) return null
  return `mailto:${encodeURIComponent(supportEmail)}?subject=${encodeURIComponent('Sova support request')}`
}

export default function SupportPage() {
  const supportMailto = buildSupportMailto()
  const deletionMailto = buildDeletionMailto()

  return (
    <div className="legal-page">
      <div className="legal-inner">
        <Link to="/" className="legal-back">
          ← Back to Sova
        </Link>

        <article className="legal-panel">
          <h1 className="legal-title">Support</h1>
          <p className="legal-updated">
            Help with Sova, including how to request account deletion.
          </p>

          <div className="legal-body">
            <h2>Contact us</h2>
            {supportMailto ? (
              <>
                <p>
                  For product questions, billing help, or other support, email us
                  using the button below. We aim to reply as soon as we can.
                </p>
                <div className="legal-actions">
                  <a
                    href={supportMailto}
                    className="legal-action-link legal-action-link--primary"
                  >
                    Email support
                  </a>
                </div>
                <p className="legal-muted">
                  Address:{' '}
                  <a href={supportMailto}>{supportEmail}</a>
                </p>
              </>
            ) : (
              <>
                <p>
                  The fastest way to reach us is from the Sova app: open{' '}
                  <strong>Settings</strong> and use the in-app support or feedback
                  options if available.
                </p>
                <p className="legal-muted">
                  This site can show a direct email link when{' '}
                  <code className="legal-code">VITE_SUPPORT_EMAIL</code> is set at
                  build time.
                </p>
              </>
            )}

            <h2>Delete your account</h2>
            <p>
              You can permanently delete your Sova account and ask for associated
              personal data to be removed. Deletion is processed by our team after
              we verify the request.
            </p>

            {deletionMailto ? (
              <>
                <p>Request deletion by email (opens your mail app):</p>
                <div className="legal-actions">
                  <a
                    href={deletionMailto}
                    className="legal-action-link legal-action-link--danger"
                  >
                    Request account deletion
                  </a>
                </div>
                <p>
                  Please send the message from the email address on your Sova
                  account, or include details we can use to verify ownership.
                </p>
              </>
            ) : null}

            <p>In the Sova mobile app:</p>
            <ol className="legal-ordered">
              <li>Open <strong>Settings</strong> (last tab).</li>
              <li>
                Scroll to <strong>Request account deletion</strong> and tap{' '}
                <strong>Request Account Deletion</strong>.
              </li>
              <li>
                This opens your mail app with a pre-filled message when support
                email is configured in the app build.
              </li>
            </ol>

            {!deletionMailto ? (
              <p className="legal-callout">
                If the in-app button is unavailable, use any contact option in
                Settings, or configure{' '}
                <code className="legal-code">VITE_SUPPORT_EMAIL</code> on this site
                to enable the email link above.
              </p>
            ) : null}

            <h2>Before you delete</h2>
            <ul>
              <li>
                Invited caregivers may lose access to shared baby profiles tied to
                your account.
              </li>
              <li>
                Sleep logs and related data associated with your account may be
                erased and cannot be recovered.
              </li>
            </ul>
          </div>

          <p className="legal-footer-nav">
            <Link to="/privacy">Privacy Policy</Link>
            {' · '}
            <Link to="/terms">Terms of Use</Link>
          </p>
        </article>
      </div>
    </div>
  )
}
