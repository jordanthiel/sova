import { Link } from 'react-router-dom'

export function Hero() {
  return (
    <section className="hero">
      <div className="hero-badge">
        <span className="hero-emoji">🌙</span>
      </div>
      <h1 className="hero-title">Sova</h1>
      <p className="hero-tagline">Better sleep for your little one</p>
      <Link to="/download" className="hero-cta">
        Download the app
      </Link>
    </section>
  )
}
