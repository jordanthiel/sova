interface FeatureCardProps {
  emoji: string
  title: string
  description: string
  accentColor: string
}

export function FeatureCard({ emoji, title, description, accentColor }: FeatureCardProps) {
  return (
    <article
      className="feature-card"
      style={{ '--feature-accent': accentColor } as React.CSSProperties}
    >
      <div className="feature-card-emoji">{emoji}</div>
      <h3 className="feature-card-title">{title}</h3>
      <p className="feature-card-desc">{description}</p>
    </article>
  )
}
