import { Link, useLocation } from 'react-router-dom';

/* Shared site chrome for the Flavor-styled pages (/ and /design-system).
   Everything here uses fds-* component classes + Flavor semantic tokens. */

export function Icon({ name, solid = false, className }: { name: string; solid?: boolean; className?: string }) {
  return (
    <svg className={`fds-icon${className ? ` ${className}` : ''}`} data-icon aria-hidden="true">
      <use href={`/icons/sprite.svg#hi-${name}-${solid ? 'solid' : 'outline'}`} />
    </svg>
  );
}

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/design-system', label: 'Design system' },
  { to: '/canvas', label: 'Canvas' },
];

export function SiteNavbar() {
  const { pathname } = useLocation();
  return (
    <nav className="fds-navbar">
      <Link to="/" className="fds-navbar-brand" aria-label="Work in Progress — home">
        <img src="/brand/Color-Horiztonal-Logo.svg" alt="Work in Progress" />
      </Link>
      <div className="fds-navbar-links">
        {NAV_LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="fds-nav-link" aria-current={pathname === l.to ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
        <a className="fds-button" data-variant="primary" data-size="sm" href="#join" style={{ textDecoration: 'none' }}>
          Join us
        </a>
      </div>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer
      style={{
        borderBlockStart: '1px solid var(--border-subtle)',
        background: 'var(--surface-1)',
        paddingBlock: 'var(--space-8)',
      }}
    >
      <div className="site-container" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <img src="/brand/Color-Mark-Logo.svg" alt="" aria-hidden="true" style={{ blockSize: 24, inlineSize: 'auto' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Work in Progress</span>
        <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-2)' }}>
          Raleigh, NC · Stop waiting to be ready
        </span>
        <span style={{ marginInlineStart: 'auto', color: 'var(--text-tertiary)', fontSize: 'var(--font-size-2)' }}>
          © {new Date().getFullYear()} Work in Progress
        </span>
      </div>
    </footer>
  );
}
