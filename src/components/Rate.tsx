// Upload / download readout. The arrow carries the series colour; the number
// stays in text ink so it reads the same for everyone.
export function Rate({ dir, children, className = '' }: { dir: 'up' | 'down'; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-0.5 whitespace-nowrap ${className}`}>
      <span className={`font-bold ${dir === 'up' ? 'text-up' : 'text-down'}`}>{dir === 'up' ? '↑' : '↓'}</span>
      {children}
    </span>
  )
}
