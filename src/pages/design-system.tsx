import * as React from 'react';
import { Icon, SiteFooter, SiteNavbar } from '@/components/site';

/* /design-system — living reference for the Flavor DS layer in this app.
   The theme switcher writes the nine data-attributes on <html> (Flavor rule:
   theme is attributes, never forked stylesheets). */

const AXES: Record<string, { attr: string; options: string[] }> = {
  Hue: { attr: 'data-hue', options: ['brand', 'brand2', 'neutral', 'red', 'orange', 'yellow', 'green', 'teal', 'cyan', 'blue', 'violet', 'purple', 'magenta'] },
  Saturation: { attr: 'data-sat', options: ['muted', 'regular', 'bold'] },
  Mode: { attr: 'data-mode', options: ['light', 'dark'] },
  Contrast: { attr: 'data-contrast', options: ['aa', 'aaa'] },
  Radius: { attr: 'data-radius', options: ['square', 'rounded', 'pill'] },
  Density: { attr: 'data-density', options: ['compact', 'regular', 'comfy'] },
  Font: { attr: 'data-font', options: ['flavor', 'editorial', 'reading', 'geometric', 'expressive'] },
};

const SURFACE_TOKENS = ['--surface-page', '--surface-1', '--surface-2', '--surface-3', '--surface-tint', '--accent-subtle', '--accent-bg', '--success-bg', '--warning-bg', '--danger-bg', '--info-bg'];
const TEXT_TOKENS = ['--text-primary', '--text-secondary', '--text-tertiary', '--text-disabled', '--text-accent', '--accent-fg', '--success-text', '--warning-text', '--danger-text', '--info-text'];
const SPACE_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function useHtmlAttr(attr: string): [string, (v: string) => void] {
  const [value, setValue] = React.useState(() => document.documentElement.getAttribute(attr) ?? '');
  const set = (v: string) => {
    document.documentElement.setAttribute(attr, v);
    setValue(v);
  };
  return [value, set];
}

function AxisControl({ label, attr, options }: { label: string; attr: string; options: string[] }) {
  const [value, set] = useHtmlAttr(attr);
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: 'var(--font-size-2)', fontWeight: 600, color: 'var(--text-secondary)' }}>
      {label}
      <select className="fds-select" value={value} onChange={(e) => set(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBlockEnd: 'var(--space-10)' }}>
      <div className="fds-divider-label" style={{ marginBlockEnd: 'var(--space-5)' }}>
        {title}
      </div>
      {children}
    </section>
  );
}

function Swatch({ token, text }: { token: string; text?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <span
        aria-hidden="true"
        style={{
          inlineSize: 36,
          blockSize: 36,
          flexShrink: 0,
          borderRadius: 'var(--radius-control)',
          border: '1px solid var(--border-default)',
          background: text ? 'var(--surface-1)' : `var(${token})`,
          display: 'grid',
          placeContent: 'center',
          color: text ? `var(${token})` : undefined,
          fontWeight: 700,
        }}
      >
        {text ? 'Ag' : ''}
      </span>
      <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2)', color: 'var(--text-secondary)' }}>{token}</code>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <div style={{ minBlockSize: '100%', display: 'flex', flexDirection: 'column' }}>
      <SiteNavbar />

      <main className="site-container" style={{ flex: 1, paddingBlock: 'var(--space-9)' }}>
        <header style={{ marginBlockEnd: 'var(--space-9)' }}>
          <span className="fds-badge" data-variant="neutral">
            <Icon name="swatch" />
            Flavor DS
          </span>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--font-size-9)', lineHeight: 'var(--line-height-9)', margin: 'var(--space-3) 0 var(--space-2)' }}>
            Design system
          </h1>
          <p style={{ color: 'var(--text-secondary)', maxInlineSize: '60ch', margin: 0 }}>
            Tokens and components from Flavor DS. Theme is nine attributes on <code style={{ fontFamily: 'var(--font-mono)' }}>&lt;html&gt;</code> —
            switch any axis below and the whole page (and every component) follows.
          </p>
        </header>

        <Section title="Theme axes">
          <div className="fds-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-4)' }}>
            {Object.entries(AXES).map(([label, cfg]) => (
              <AxisControl key={label} label={label} attr={cfg.attr} options={cfg.options} />
            ))}
          </div>
        </Section>

        <Section title="Color — surfaces">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
            {SURFACE_TOKENS.map((t) => (
              <Swatch key={t} token={t} />
            ))}
          </div>
        </Section>

        <Section title="Color — text">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
            {TEXT_TOKENS.map((t) => (
              <Swatch key={t} token={t} text />
            ))}
          </div>
        </Section>

        <Section title="Typography">
          <div className="fds-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {[
              { label: 'Display / font-size-10', style: { fontFamily: 'var(--font-display)', fontSize: 'var(--font-size-10)', lineHeight: 'var(--line-height-10)', fontWeight: 700 } },
              { label: 'Heading L / font-size-7', style: { fontFamily: 'var(--font-display)', fontSize: 'var(--font-size-7)', lineHeight: 'var(--line-height-7)', fontWeight: 700 } },
              { label: 'Heading M / font-size-6', style: { fontSize: 'var(--font-size-6)', lineHeight: 'var(--line-height-6)', fontWeight: 600 } },
              { label: 'Body M / font-size-4', style: { fontSize: 'var(--font-size-4)', lineHeight: 'var(--line-height-4)' } },
              { label: 'Body S / font-size-3', style: { fontSize: 'var(--font-size-3)', lineHeight: 'var(--line-height-3)' } },
              { label: 'Mono S / font-size-2', style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2)', lineHeight: 'var(--line-height-2)' } },
            ].map((t) => (
              <div key={t.label} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
                <span style={{ inlineSize: 200, flexShrink: 0, color: 'var(--text-tertiary)', fontSize: 'var(--font-size-2)', fontFamily: 'var(--font-mono)' }}>{t.label}</span>
                <span style={t.style as React.CSSProperties}>Careers are built, not found.</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Spacing">
          <div className="fds-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {SPACE_STEPS.map((n) => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                <code style={{ inlineSize: 90, fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-2)', color: 'var(--text-secondary)' }}>--space-{n}</code>
                <span style={{ blockSize: 12, inlineSize: `var(--space-${n})`, background: 'var(--accent-bg)', borderRadius: 2 }} />
              </div>
            ))}
            <p style={{ margin: 'var(--space-3) 0 0', color: 'var(--text-tertiary)', fontSize: 'var(--font-size-2)' }}>
              Spacing re-resolves with the density axis — flip Density above and watch the scale change.
            </p>
          </div>
        </Section>

        <Section title="Buttons">
          <div className="fds-card" style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="fds-button" data-variant="primary" type="button">Primary</button>
            <button className="fds-button" data-variant="secondary" type="button">Secondary</button>
            <button className="fds-button" data-variant="outline" type="button">Outline</button>
            <button className="fds-button" data-variant="ghost" type="button">Ghost</button>
            <button className="fds-button" data-variant="danger" type="button">Danger</button>
            <button className="fds-button" data-variant="primary" data-tone="secondary" type="button">Secondary tone</button>
            <button className="fds-button" data-variant="primary" disabled type="button">Disabled</button>
            <button className="fds-button" data-variant="primary" data-size="sm" type="button">Small</button>
            <button className="fds-button" data-variant="primary" data-size="lg" type="button">Large</button>
          </div>
        </Section>

        <Section title="Badges & chips">
          <div className="fds-card" style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="fds-badge" data-variant="accent">Accent</span>
            <span className="fds-badge" data-variant="neutral">Neutral</span>
            <span className="fds-badge" data-variant="success">Success</span>
            <span className="fds-badge" data-variant="warning">Warning</span>
            <span className="fds-badge" data-variant="danger">Danger</span>
            <span className="fds-badge" data-variant="solid">Solid</span>
            <button className="fds-chip" type="button">Chip</button>
            <button className="fds-chip" type="button" aria-pressed="true">Selected chip</button>
          </div>
        </Section>

        <Section title="Alerts">
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            {(['info', 'success', 'warning', 'danger'] as const).map((v) => (
              <div className="fds-alert" data-variant={v} key={v}>
                <div>
                  <p className="fds-alert-title">{v[0].toUpperCase() + v.slice(1)}</p>
                  Every text/background pairing here is contrast-approved by the system — never asserted by hand.
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Forms">
          <div className="fds-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-5)' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: 'var(--font-size-2)', fontWeight: 600 }}>
              Email
              <input className="fds-input" type="email" placeholder="you@example.com" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: 'var(--font-size-2)', fontWeight: 600 }}>
              Role
              <select className="fds-select" defaultValue="builder">
                <option value="builder">Career builder</option>
                <option value="mentor">Mentor</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: 'var(--font-size-2)', fontWeight: 600, gridColumn: '1 / -1' }}>
              What are you working toward?
              <textarea className="fds-textarea" rows={3} placeholder="Tell us about your goals…" />
            </label>
          </div>
        </Section>

        <Section title="Stat & code">
          <div className="fds-card" style={{ display: 'flex', gap: 'var(--space-9)', flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="fds-stat">
              <span className="fds-stat-label">Members</span>
              <span className="fds-stat-value">1,200</span>
              <span className="fds-stat-delta" data-trend="up">+18% this month</span>
            </div>
            <div>
              <p style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--font-size-3)', color: 'var(--text-secondary)' }}>
                Press <kbd className="fds-kbd">⌘</kbd> <kbd className="fds-kbd">K</kbd> anywhere, or theme via{' '}
                <code className="fds-code-inline">data-mode=&quot;dark&quot;</code>.
              </p>
              <a className="fds-link" href="https://flavor-ds.vercel.app" target="_blank" rel="noreferrer">
                Flavor DS documentation
              </a>
            </div>
          </div>
        </Section>
      </main>

      <SiteFooter />
    </div>
  );
}
