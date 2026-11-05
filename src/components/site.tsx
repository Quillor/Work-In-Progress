import { Link } from 'react-router-dom';

export function Icon({ name, solid = false, className }: { name: string; solid?: boolean; className?: string }) {
  return <svg className={`fds-icon${className ? ` ${className}` : ''}`} data-icon aria-hidden="true"><use href={`/icons/sprite.svg#hi-${name}-${solid ? 'solid' : 'outline'}`} /></svg>;
}

export function SiteNavbar() {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <nav className="fds-navbar public-navbar" aria-label="Main navigation">
        <Link to="/" className="fds-navbar-brand" aria-label="Work in Progress — home"><img src="/brand/Color-Horiztonal-Logo.svg" alt="Work in Progress" width="180" height="28" /></Link>
        <div className="fds-navbar-links">
          <a href="/#about" className="fds-nav-link">About</a>
          <a href="/#events" className="fds-nav-link">Events</a>
          <a className="fds-button" data-variant="primary" data-size="sm" href="/#apply">Apply to join</a>
        </div>
      </nav>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="community-footer"><div className="site-container footer-layout">
      <div><Link to="/" className="footer-brand"><img src="/brand/Color-Mark-Logo.svg" alt="" width="28" height="28" />Work in Progress</Link><p>A local community for learning and building with AI.<br />Raleigh · Durham · Chapel Hill</p></div>
      <div><a className="text-link" href="mailto:hello@timrosenberg.com">Say hello <span aria-hidden="true">↗</span></a><p>© {new Date().getFullYear()} Work in Progress</p></div>
    </div></footer>
  );
}
