type Props = {
  saved: boolean
  onToggle: () => void
  className?: string
}

export function SaveHeartButton({ saved, onToggle, className = '' }: Props) {
  return (
    <button
      type="button"
      className={`save-heart ${saved ? 'save-heart--saved' : ''} ${className}`.trim()}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      aria-label={saved ? 'Remove from saved list' : 'Add to saved list'}
      aria-pressed={saved}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden focusable="false">
        {saved ? (
          <path
            fill="currentColor"
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          />
        ) : (
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
          />
        )}
      </svg>
    </button>
  )
}
