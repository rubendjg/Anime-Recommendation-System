type ProfileOption = { id: string; label: string }

type Props = {
  query: string
  onQuery: (q: string) => void
  profiles: ProfileOption[]
  userId: string
  onUserId: (id: string) => void
  userLabel: string
}

export function Header({
  query,
  onQuery,
  profiles,
  userId,
  onUserId,
  userLabel,
}: Props) {
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <span className="logo">Hanami</span>
        <span className="logo-tag">reco</span>
      </div>
      <nav className="app-header__nav" aria-label="Primary">
        <a href="#home" className="nav-link is-active">
          Discover
        </a>
        <span className="nav-link nav-link--muted">Studios</span>
        <span className="nav-link nav-link--muted">Saved</span>
      </nav>
      <div className="app-header__tools">
        <label className="search-wrap">
          <span className="visually-hidden">Search titles</span>
          <input
            type="search"
            className="search-input"
            placeholder="Search catalog…"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="profile-select-wrap">
          <span className="visually-hidden">Active profile</span>
          <select
            className="profile-select"
            value={userId}
            onChange={(e) => onUserId(e.target.value)}
            aria-label={`Profile: ${userLabel}`}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <div className="avatar" aria-hidden title={userLabel} />
      </div>
    </header>
  )
}
