import { Hero } from '../components/Hero'
import { FeatureCard } from '../components/FeatureCard'
import { Link } from 'react-router-dom'
import './LandingPage.css'

const FEATURES = [
  {
    emoji: '🏠',
    title: 'Today',
    description:
      "See your baby's current sleep status at a glance. Get AI-powered nap recommendations, one-tap logging, and a live wake window tracker.",
    accent: '#4ECDC4',
  },
  {
    emoji: '📋',
    title: 'Log',
    description:
      'Browse sleep history day by day. Log naps, night sleep, feeds, diapers, and medications. Tap the + button anytime.',
    accent: '#FFB84D',
  },
  {
    emoji: '💬',
    title: 'AI Coach',
    description:
      'Chat with your personal sleep coach. Ask about nap timing, bedtime, wake windows, or nap transitions — and get personalized answers.',
    accent: '#5BA3E8',
  },
  {
    emoji: '✨',
    title: 'Insights',
    description:
      "AI surfaces sleep patterns, consistency metrics, and actionable suggestions. Apply suggestions directly to improve your baby's routine.",
    accent: '#818CF8',
  },
  {
    emoji: '⚙️',
    title: 'Settings',
    description:
      "Manage your baby's profile, invite caregivers, customize AI preferences, and set up notification reminders.",
    accent: '#68D391',
  },
]

export default function LandingPage() {
  return (
    <div className="landing">
      <Hero />
      <section className="features">
        <h2 className="features-title">Everything you need for better sleep</h2>
        <div className="features-grid">
          {FEATURES.map((f) => (
            <FeatureCard
              key={f.title}
              emoji={f.emoji}
              title={f.title}
              description={f.description}
              accentColor={f.accent}
            />
          ))}
        </div>
      </section>
      <footer className="landing-footer">
        <div className="landing-footer-actions">
          <Link to="/download" className="footer-cta">
            Get Sova
          </Link>
          <Link to="/trainers" className="footer-cta footer-cta-secondary">
            Sleep trainer controls
          </Link>
        </div>
        <nav className="landing-footer-legal" aria-label="Legal">
          <Link to="/support">Support</Link>
          <span className="landing-footer-sep" aria-hidden="true">
            ·
          </span>
          <Link to="/privacy">Privacy</Link>
          <span className="landing-footer-sep" aria-hidden="true">
            ·
          </span>
          <Link to="/terms">Terms of Use</Link>
        </nav>
      </footer>
    </div>
  )
}
