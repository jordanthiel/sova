import { Link } from 'react-router-dom'
import './LegalPage.css'

export default function TermsPage() {
  return (
    <div className="legal-page">
      <div className="legal-inner">
        <Link to="/" className="legal-back">
          ← Back to Sova
        </Link>

        <article className="legal-panel">
          <h1 className="legal-title">Terms of Use</h1>
          <p className="legal-updated">Last updated: April 22, 2026</p>

          <div className="legal-body">
            <p>
              These Terms of Use (&quot;Terms&quot;) govern your access to and
              use of the Sova mobile application and related services
              (collectively, the &quot;Service&quot;) provided by Sova
              (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By using the
              Service, you agree to these Terms.
            </p>

            <h2>Eligibility</h2>
            <p>
              You must be legally able to enter a binding contract in your
              jurisdiction to use the Service. If you use the Service on behalf
              of a child or household, you represent that you have the authority
              to do so.
            </p>

            <h2>The Service</h2>
            <p>
              Sova provides tools to log and understand infant and child sleep
              and related care information, including optional AI-assisted
              features. The Service is provided for informational and
              organizational purposes and is not a substitute for professional
              medical advice, diagnosis, or treatment.
            </p>

            <h2>Accounts and caregivers</h2>
            <p>
              You are responsible for maintaining the confidentiality of your
              account credentials and for activity under your account. If you
              invite caregivers, you are responsible for their access to
              information shared through the Service.
            </p>

            <h2>Acceptable use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Use the Service in violation of law or these Terms;</li>
              <li>
                Attempt to gain unauthorized access to the Service, other
                accounts, or underlying systems;
              </li>
              <li>
                Interfere with or disrupt the Service, or circumvent security or
                usage limits;
              </li>
              <li>
                Reverse engineer or attempt to extract source code or models
                except where expressly permitted by law.
              </li>
            </ul>

            <h2>Subscriptions and fees</h2>
            <p>
              Certain features may require a paid subscription or in-app
              purchase. Fees, renewal, cancellation, and refunds are handled
              through the applicable app store or payment platform and its
              policies.
            </p>

            <h2>Intellectual property</h2>
            <p>
              The Service, including its software, design, branding, and
              content (excluding your own data), is owned by us or our licensors
              and is protected by intellectual property laws. We grant you a
              limited, non-exclusive, non-transferable license to use the Service
              for personal, non-commercial purposes in accordance with these
              Terms.
            </p>

            <h2>Disclaimer</h2>
            <p>
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS
              AVAILABLE,&quot; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR
              IMPLIED, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS
              FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT, TO THE FULLEST
              EXTENT PERMITTED BY LAW.
            </p>

            <h2>Limitation of liability</h2>
            <p>
              TO THE FULLEST EXTENT PERMITTED BY LAW, WE AND OUR AFFILIATES,
              OFFICERS, DIRECTORS, EMPLOYEES, AND SUPPLIERS WILL NOT BE LIABLE FOR
              ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR EXEMPLARY
              DAMAGES, OR ANY LOSS OF PROFITS, DATA, GOODWILL, OR OTHER
              INTANGIBLE LOSSES, ARISING OUT OF OR RELATED TO YOUR USE OF THE
              SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR
              RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE
              AMOUNT YOU PAID US FOR THE SERVICE IN THE TWELVE MONTHS BEFORE THE
              CLAIM OR (B) ONE HUNDRED U.S. DOLLARS (USD $100), IF YOU HAVE NOT
              PAID US ANYTHING.
            </p>

            <h2>Indemnity</h2>
            <p>
              You will defend and indemnify us against any claims, damages,
              losses, liabilities, and expenses (including reasonable attorneys&apos;
              fees) arising from your use of the Service, your content, or your
              violation of these Terms, to the extent permitted by law.
            </p>

            <h2>Termination</h2>
            <p>
              We may suspend or terminate your access to the Service at any
              time, with or without notice, for conduct that we believe violates
              these Terms or is harmful to other users, us, or third parties. You
              may stop using the Service at any time. Provisions that by their
              nature should survive will survive termination.
            </p>

            <h2>Governing law</h2>
            <p>
              These Terms are governed by the laws applicable in your primary
              place of residence or, where we elect in writing, the laws of the
              jurisdiction where we operate, without regard to conflict-of-law
              rules. Courts in those jurisdictions will have exclusive venue,
              except where mandatory consumer protection laws require otherwise.
            </p>

            <h2>Changes</h2>
            <p>
              We may modify these Terms from time to time. We will post the
              updated Terms and update the &quot;Last updated&quot; date. If a
              change is material, we may provide additional notice. Your continued
              use of the Service after changes become effective constitutes your
              acceptance of the revised Terms.
            </p>

            <h2>Contact</h2>
            <p>
              For questions about these Terms, contact us through the support or
              feedback options available in the Sova app settings.
            </p>
          </div>

          <p className="legal-footer-nav">
            See also:{' '}
            <Link to="/privacy">Privacy Policy</Link>
          </p>
        </article>
      </div>
    </div>
  )
}
