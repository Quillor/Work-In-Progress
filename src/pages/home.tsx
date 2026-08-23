import { Icon, SiteFooter, SiteNavbar } from '@/components/site';
import Hero from '@/features/hero/Hero';

/* Marketing home — "Work in Progress: stop waiting to be ready."
   All color/space/type via Flavor semantic tokens; components are the fds-*
   CSS layer. */

const WHO = [
  {
    icon: 'arrow-trending-up',
    title: 'Career climbers',
    body: 'Making the bold move before the checklist is done — the pitch, the pivot, the promotion you were told to wait for. Waiting was never the plan.',
  },
  {
    icon: 'rocket-launch',
    title: 'Builders shipping with AI',
    body: 'Shipping real things with new tools before anyone hands them a certificate. Qualified is something you become by building, not a permission slip.',
  },
  {
    icon: 'pencil-square',
    title: 'Story rewriters',
    body: 'Changing lanes, changing titles, changing their own definition of what they do — in real time, out loud, with witnesses.',
  },
];

const ETHOS = [
  {
    n: '01',
    title: 'Believe in yourself louder',
    body: 'Confidence is a practice, not a prerequisite. Say the ambition out loud here first — then everywhere else.',
  },
  {
    n: '02',
    title: 'Grow in public',
    body: 'Share the half-finished thing. The draft, the demo, the awkward first version. Progress you hide is progress that stalls.',
  },
  {
    n: '03',
    title: 'Push each other further',
    body: 'No business-card bingo here. Just people who ask what you’re building, remember what you said last month, and hold you to it.',
  },
];

const FAQS = [
  {
    q: 'Who is Work in Progress for?',
    a: 'People who refuse to wait until they feel ready: career climbers making bold moves, builders shipping with AI before they think they’re qualified, and anyone rewriting their own story in real time. If you’re done doubting what you’re capable of, you’re one of us.',
  },
  {
    q: 'Do I need to feel "ready" to join?',
    a: 'No — that’s the whole point. Nobody’s finished. Nobody’s arrived. You join as a work in progress, because everyone here is one.',
  },
  {
    q: 'Is this just another networking group?',
    a: 'No. This isn’t polite networking or business-card bingo. It’s a community that grows in public — people who show each other the unfinished work and push each other further than they’d push alone.',
  },
  {
    q: 'Where do you meet?',
    a: 'We’re rooted in Raleigh, North Carolina. We gather in person around the Triangle and keep the momentum going in between.',
  },
];

export default function HomePage() {
  return (
    <div style={{ minBlockSize: '100%', display: 'flex', flexDirection: 'column' }}>
      <SiteNavbar />

      <main style={{ flex: 1 }}>
        {/* Shader hero (WebGL) — sky, 3D text + spinner, dot-dissolve into the page */}
        <Hero />
        {/* Hero */}
        <section className="site-container" style={{ paddingBlock: 'var(--space-12)', textAlign: 'center' }}>
          <span className="fds-badge" data-variant="accent">
            <Icon name="map-pin" solid />
            Raleigh, North Carolina
          </span>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--font-size-11)',
              lineHeight: 'var(--line-height-11)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: 'var(--space-5) auto var(--space-4)',
              maxInlineSize: '16ch',
            }}
          >
            Stop waiting to be ready.
          </h1>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: 'var(--font-size-5)',
              lineHeight: 'var(--line-height-5)',
              maxInlineSize: '58ch',
              margin: '0 auto var(--space-7)',
            }}
          >
            Nobody&rsquo;s finished. Nobody&rsquo;s arrived. And that&rsquo;s exactly why this is exciting. Work in
            Progress is Raleigh&rsquo;s community for people who refuse to wait until they feel ready — a place to
            believe in yourself louder, grow in public, and push each other further than you&rsquo;d ever push alone.
          </p>
          <div id="join" style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="fds-button" data-variant="primary" data-size="lg" type="button">
              Come build with us
              <Icon name="arrow-right" />
            </button>
            <button className="fds-button" data-variant="outline" data-size="lg" type="button">
              See how it works
            </button>
          </div>

          {/* Stats */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 'var(--space-6)',
              marginBlockStart: 'var(--space-12)',
              paddingBlockStart: 'var(--space-8)',
              borderBlockStart: '1px solid var(--border-subtle)',
            }}
          >
            {[
              { label: 'Works in progress', value: '1,200+' },
              { label: 'Bold moves made', value: '340' },
              { label: 'Things shipped unready', value: '95' },
              { label: 'Stories rewritten', value: '60+' },
            ].map((s) => (
              <div className="fds-stat" key={s.label} style={{ alignItems: 'center' }}>
                <span className="fds-stat-value">{s.value}</span>
                <span className="fds-stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Who's here */}
        <section style={{ background: 'var(--surface-1)', borderBlock: '1px solid var(--border-subtle)' }}>
          <div className="site-container" style={{ paddingBlock: 'var(--space-11)' }}>
            <div className="fds-divider-label" style={{ marginBlockEnd: 'var(--space-4)' }}>
              Who&rsquo;s here
            </div>
            <p
              style={{
                margin: '0 0 var(--space-7)',
                color: 'var(--text-secondary)',
                fontSize: 'var(--font-size-4)',
                lineHeight: 'var(--line-height-4)',
                maxInlineSize: '60ch',
              }}
            >
              Nobody here is finished — that&rsquo;s the point. Three kinds of unfinished, all moving.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-5)' }}>
              {WHO.map((f) => (
                <div className="fds-card" key={f.title}>
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-grid',
                      placeContent: 'center',
                      inlineSize: 44,
                      blockSize: 44,
                      borderRadius: 'var(--radius-control)',
                      background: 'var(--accent-subtle)',
                      color: 'var(--text-on-accent-subtle)',
                      marginBlockEnd: 'var(--space-4)',
                    }}
                  >
                    <Icon name={f.icon} />
                  </span>
                  <h3 className="fds-card-title">{f.title}</h3>
                  <p className="fds-card-description">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Ethos */}
        <section className="site-container" style={{ paddingBlock: 'var(--space-11)' }}>
          <div className="fds-divider-label" style={{ marginBlockEnd: 'var(--space-4)' }}>
            Not polite networking
          </div>
          <p
            style={{
              margin: '0 0 var(--space-7)',
              color: 'var(--text-secondary)',
              fontSize: 'var(--font-size-4)',
              lineHeight: 'var(--line-height-4)',
              maxInlineSize: '60ch',
            }}
          >
            Three things we actually do here — no small talk required.
          </p>
          <ol
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 'var(--space-6)',
            }}
          >
            {ETHOS.map((s) => (
              <li key={s.n}>
                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-accent)', fontSize: 'var(--font-size-2)', fontWeight: 500 }}>
                  {s.n}
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--font-size-5)', margin: 'var(--space-2) 0' }}>{s.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-3)', lineHeight: 'var(--line-height-3)', margin: 0 }}>
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* FAQ */}
        <section className="site-container" style={{ paddingBlockEnd: 'var(--space-11)', maxInlineSize: 720 }}>
          <div className="fds-divider-label" style={{ marginBlockEnd: 'var(--space-7)' }}>
            Questions
          </div>
          <div className="fds-accordion">
            {FAQS.map((f, i) => (
              <details className="fds-accordion-item" key={f.q} open={i === 0}>
                <summary>{f.q}</summary>
                <div className="fds-accordion-body">{f.a}</div>
              </details>
            ))}
          </div>
        </section>

        {/* CTA band */}
        <section style={{ background: 'var(--accent-bg)', color: 'var(--accent-fg)' }}>
          <div
            className="site-container"
            style={{
              paddingBlock: 'var(--space-10)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-6)',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 320px' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--font-size-8)', lineHeight: 'var(--line-height-8)', margin: 0 }}>
                Done doubting what you&rsquo;re capable of?
              </h2>
              <p style={{ margin: 'var(--space-2) 0 0', opacity: 0.85 }}>
                Come build the next version of yourself with us.
              </p>
            </div>
            <button className="fds-button" data-variant="outline" data-size="lg" type="button" style={{ color: 'inherit', borderColor: 'currentColor' }}>
              Join Work in Progress
            </button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
