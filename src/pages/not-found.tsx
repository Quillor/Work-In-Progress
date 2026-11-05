import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <main className="site-container community-section"><h1 ref={heading} tabIndex={-1}>Page not found</h1><p>Let’s get you back to the community.</p><Link className="fds-button" data-variant="primary" to="/">Go home</Link></main>;
}
