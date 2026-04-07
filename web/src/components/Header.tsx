type ProfileOption = { id: string; label: string }

type Props = {
  query: string
  onQuery: (q: string) => void
  typeFilter: string
  onTypeFilter: (v: string) => void
  genreFilter: string
  onGenreFilter: (v: string) => void
  activeTab: 'discover' | 'saved' | 'rated'
  onTabChange: (tab: 'discover' | 'saved' | 'rated') => void
  onResetFilters: () => void
  typeOptions: string[]
  genreOptions: string[]
  profiles: ProfileOption[]
  userId: string
  onUserId: (id: string) => void
  userLabel: string
}

export function Header({
  query,
  onQuery,
  typeFilter,
  onTypeFilter,
  genreFilter,
  onGenreFilter,
  activeTab,
  onTabChange,
  onResetFilters,
  typeOptions,
  genreOptions,
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
        <button
          type="button"
          className={`nav-link nav-link--button${activeTab === 'discover' ? ' is-active' : ''}`}
          onClick={() => onTabChange('discover')}
        >
          Discover
        </button>
        <button
          type="button"
          className={`nav-link nav-link--button${activeTab === 'saved' ? ' is-active' : ''}`}
          onClick={() => onTabChange('saved')}
        >
          Saved
        </button>
        <button
          type="button"
          className={`nav-link nav-link--button${activeTab === 'rated' ? ' is-active' : ''}`}
          onClick={() => onTabChange('rated')}
        >
          Rated
        </button>
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
        <label className="filter-select-wrap">
          <span className="visually-hidden">Filter by type</span>
          <select
            className="filter-select"
            value={typeFilter}
            onChange={(e) => onTypeFilter(e.target.value)}
          >
            <option value="">All types</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-select-wrap">
          <span className="visually-hidden">Filter by genre</span>
          <select
            className="filter-select"
            value={genreFilter}
            onChange={(e) => onGenreFilter(e.target.value)}
          >
            <option value="">All genres</option>
            {genreOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="filter-refresh-btn"
          onClick={onResetFilters}
          aria-label="Reset search and filters"
          title="Reset filters"
        >
          Refresh
        </button>
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
