import { Link } from 'react-router-dom'
import './LegalPage.css'

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="legal-inner">
        <Link to="/" className="legal-back">
          ← Back to Sova
        </Link>

        <article className="legal-panel">
          <h1 className="legal-title">Privacy Policy</h1>
          <p className="legal-updated">Last updated: April 22, 2026</p>

          <div className="legal-body">
            <p>
              This Privacy Policy describes how Sova (&quot;we,&quot;
              &quot;us,&quot; or &quot;our&quot;) handles information when you
              use the Sova mobile application and related services
              (collectively, the &quot;Service&quot;).
            </p>

            <h2>Information we collect</h2>
            <p>We may collect information such as:</p>
            <ul>
              <li>
                <strong>Account and profile data</strong> you provide when you
                sign up or use the Service, including caregiver invitations and
                baby profile details you choose to enter.
              </li>
              <li>
                <strong>Sleep and care logs</strong> you record in the app
                (for example sleep sessions, feeds, diapers, and notes).
              </li>
              <li>
                <strong>Usage and device information</strong> such as app
                interactions, diagnostics, and device or operating system
                identifiers, as needed to operate and improve the Service.
              </li>
              <li>
                <strong>Purchase-related information</strong> processed by app
                stores or payment providers according to their policies, where
                applicable.
              </li>
            </ul>

            <h2>How we use information</h2>
            <p>We use the information above to:</p>
            <ul>
              <li>Provide, maintain, and secure the Service;</li>
              <li>Sync your data across devices and with invited caregivers;</li>
              <li>
                Offer features you request, including personalized insights or
                coaching where enabled;
              </li>
              <li>Communicate with you about the Service and respond to requests;</li>
              <li>Comply with law and enforce our terms.</li>
            </ul>

            <h2>Sharing</h2>
            <p>
              We may share information with service providers who assist us in
              hosting, analytics, authentication, messaging, AI processing, or
              similar functions, subject to appropriate safeguards. We may also
              share information when required by law or to protect rights and
              safety. Data you log may be visible to caregivers you invite
              within the Service.
            </p>

            <h2>Retention</h2>
            <p>
              We retain information for as long as your account is active or as
              needed to provide the Service, comply with legal obligations,
              resolve disputes, and enforce our agreements.
            </p>

            <h2>Your choices</h2>
            <p>
              Depending on where you live, you may have rights to access,
              correct, delete, or export certain personal information, or to
              object to or restrict certain processing. You can manage much of
              your information directly in the app. To exercise other rights,
              contact us as described below.
            </p>

            <h2>Children</h2>
            <p>
              The Service is designed for parents and caregivers. We do not
              knowingly collect personal information directly from children
              under 13 (or the age required in your jurisdiction) without
              appropriate parental consent. If you believe we have collected such
              information, please contact us so we can take appropriate steps.
            </p>

            <h2>Security</h2>
            <p>
              We use reasonable technical and organizational measures designed
              to protect your information. No method of transmission or storage is
              completely secure.
            </p>

            <h2>International transfers</h2>
            <p>
              Your information may be processed in countries other than where
              you live. Where required, we use appropriate mechanisms to support
              lawful transfers.
            </p>

            <h2>Changes</h2>
            <p>
              We may update this Privacy Policy from time to time. We will post
              the updated version and revise the &quot;Last updated&quot; date
              above. Material changes may be communicated through the Service or
              other reasonable means.
            </p>

            <h2>Contact</h2>
            <p>
              For privacy-related questions or requests, contact us through the
              support or feedback options available in the Sova app settings.
            </p>
          </div>

          <p className="legal-footer-nav">
            See also:{' '}
            <Link to="/terms">Terms of Use</Link>
          </p>
        </article>
      </div>
    </div>
  )
}
