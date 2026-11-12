import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }
let widgetScript: Promise<void> | undefined;
function loadWidget() {
  if (window.turnstile) return Promise.resolve();
  if (!widgetScript) {
    widgetScript = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => { widgetScript = undefined; script.remove(); reject(new Error('Verification could not load.')); };
      document.head.append(script);
    });
  }
  return widgetScript;
}

export default function ApplicationForm() {
  const [availability, setAvailability] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState('');
  const widgetContainer = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const requestId = useRef<string | null>(null);
  const statusElement = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    async function initialize() {
      try {
        const response = await fetch('/api/application', { signal: controller.signal });
        const config = await response.json();
        if (!response.ok || !config.ready || !config.siteKey) throw new Error('Applications are not connected yet.');
        await loadWidget();
        if (disposed || !widgetContainer.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(widgetContainer.current, {
          sitekey: config.siteKey,
          action: 'apply',
          theme: 'light',
          // 'flexible' has a 300px minimum; very narrow phones get the compact widget instead
          size: widgetContainer.current.clientWidth < 300 ? 'compact' : 'flexible',
          callback: (value: string) => { setToken(value); setMessage(''); },
          'expired-callback': () => setToken(''),
          'error-callback': () => { setToken(''); setMessage('Verification could not complete. Refresh the page or email Tim directly.'); },
        });
        setAvailability('ready');
      } catch {
        if (!disposed) setAvailability('unavailable');
      }
    }
    void initialize();
    return () => {
      disposed = true;
      controller.abort();
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'sending' || availability !== 'ready' || !token) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    requestId.current ??= crypto.randomUUID();
    setStatus('sending');
    setMessage('Sending your application…');
    try {
      const response = await fetch('/api/application', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, token, requestId: requestId.current }),
        signal: AbortSignal.timeout(25000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Your application could not be sent. Please try again.');
      setStatus('success');
      setMessage('Application sent. Tim will review it personally and email you about next steps. Slack invitations are sent after review.');
      form.reset();
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'Delivery could not be confirmed. Please try again, or email Tim directly.');
    } finally {
      setToken('');
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
      // Announce the result and put focus where it can be read without searching.
      requestAnimationFrame(() => statusElement.current?.focus());
    }
  }

  return (
    <form className="application-form" onSubmit={submit} onChange={() => { requestId.current = null; }}>
      <div className="form-row"><label htmlFor="app-name">Your name<input id="app-name" className="fds-input" name="name" autoComplete="name" required /></label><label htmlFor="app-email">Email address<input id="app-email" className="fds-input" name="email" type="email" autoComplete="email" required /></label></div>
      <label htmlFor="app-location">Where are you based?<input id="app-location" className="fds-input" name="location" autoComplete="address-level2" required placeholder="Raleigh, Durham, Chapel Hill, or nearby" /></label>
      <label htmlFor="app-work">What do you do, and what are you exploring with AI?<textarea id="app-work" className="fds-textarea" name="work" required rows={3} /></label>
      <label htmlFor="app-interest">Why would you like to join?<textarea id="app-interest" className="fds-textarea" name="interest" required rows={3} /></label>
      <label htmlFor="app-linkedin">LinkedIn profile <span className="optional-label">(optional)</span><input id="app-linkedin" className="fds-input" name="linkedin" type="text" placeholder="A link or your profile name" /></label>
      <div className="form-trap" aria-hidden="true"><label htmlFor="app-website">Leave this field empty<input id="app-website" name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div ref={widgetContainer} className="verification-widget" />
      {availability === 'loading' && <p role="status" className="form-note">Checking application availability…</p>}
      <button className="fds-button" data-variant="primary" data-size="lg" type="submit" disabled={availability !== 'ready' || !token || status === 'sending' || status === 'success'}>{status === 'sending' ? 'Sending application…' : status === 'success' ? 'Application sent' : 'Send application'}</button>
      <p ref={statusElement} className={`form-result ${status === 'error' ? 'form-error' : ''}`} role="status" aria-live="polite" tabIndex={-1}>{message}</p>
    </form>
  );
}
