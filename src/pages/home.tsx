import { Icon, SiteFooter, SiteNavbar } from '@/components/site';
import ApplicationForm from '@/components/application-form';
import EventsList from '@/components/events-list';
import Hero from '@/features/hero/Hero';

const activities = [
  { title: 'Ship what you’re building.', body: 'Demo your AI project—rough or polished. Get honest feedback, pick up new techniques, and leave with the push to take it further.' },
  { title: 'Level up your career.', body: 'Trade job-search tactics, portfolio feedback, and promotion strategies with mentors who’ve already made the moves you’re planning.' },
  { title: 'Grow your local network.', body: 'Meet the builders and mentors behind the projects, and keep the momentum going in our member Slack between gatherings.' },
];
const questions = [
  { q: 'Who is the community for?', a: 'Local professionals, mentors, and mentees who are curious about AI and willing to share what they’re learning. You can be an experienced builder or just getting started.' },
  { q: 'Do I need a technical background?', a: 'No. Different perspectives make the conversations better. Designers, developers, business owners, and people exploring a new direction are welcome.' },
  { q: 'Where do you meet?', a: 'Around the Triangle in North Carolina, including Raleigh, Durham, and Chapel Hill. Each event on our calendar has its own location and registration details.' },
  { q: 'What happens after I apply?', a: 'Tim reviews each application personally. If the community is a good fit, you’ll receive an invitation to our Slack. Applying does not automatically add you to Slack or register you for an event.' },
];

export default function HomePage() {
  return (
    <div className="community-site">
      <SiteNavbar />
      <main id="main-content">
        {/* Shader hero (WebGL) — sky, 3D text + spinner, dot-dissolve into the page */}
        <Hero />
        <section className="site-container" style={{ paddingBlock: 'var(--space-12)', textAlign: 'center' }} aria-labelledby="hero-title">
          <span className="fds-badge" data-variant="accent"><Icon name="map-pin" solid /> Raleigh, North Carolina</span>
          <h1
            id="hero-title"
            style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--font-size-11)', lineHeight: 'var(--line-height-11)', fontWeight: 800, letterSpacing: '-0.02em', margin: 'var(--space-5) auto var(--space-4)', maxInlineSize: '16ch' }}
          >
            Stop waiting to be ready.
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-5)', lineHeight: 'var(--line-height-5)', maxInlineSize: '58ch', margin: '0 auto var(--space-7)' }}>
            Nobody&rsquo;s finished. Nobody&rsquo;s arrived. And that&rsquo;s exactly why this is exciting. Work in
            Progress is Raleigh&rsquo;s community for people who refuse to wait until they feel ready — a place to
            believe in yourself louder, grow in public, and push each other further than you&rsquo;d ever push alone.
          </p>
          <div id="join" style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a className="fds-button" data-variant="primary" data-size="lg" href="#apply">Come build with us <Icon name="arrow-right" /></a>
            <a className="fds-button" data-variant="outline" data-size="lg" href="#events">See what&rsquo;s coming up</a>
          </div>
        </section>

        <section id="about" className="community-about" aria-labelledby="about-title">
          <div className="site-container about-layout">
            <div>
              <p className="section-label">The community</p>
              <h2 id="about-title">Build with AI.<br />Grow your career.</h2>
              <p>AI is rewriting what one person can build—and what your next role can look like. We meet to turn that into momentum: ship real projects with AI, sharpen the skills that matter, and make the career move you’ve been circling.</p>
              <p>Come with something you’re building or the career question you’re working through. You’ll leave with feedback, new ideas, and people in your corner.</p>
            </div>
            <div className="activity-list">
              {activities.map((activity) => <article key={activity.title}><h3>{activity.title}</h3><p>{activity.body}</p></article>)}
            </div>
          </div>
        </section>

        <section id="events" className="site-container community-section" aria-labelledby="events-title">
          <div className="section-heading"><div><p className="section-label">See you around the Triangle</p><h2 id="events-title">Latest events</h2></div><a className="fds-button" data-variant="primary" href="https://luma.com/work-in-progress-raleigh" target="_blank" rel="noreferrer">See new events on Luma <Icon name="arrow-right" /></a></div>
          <p>From sharing projects to getting together over dinner, find your next chance to connect.</p>
          <EventsList />
          <p className="calendar-note">Events are kept up to date on Luma. If the list doesn’t load, <a href="https://luma.com/work-in-progress-raleigh" target="_blank" rel="noreferrer">open the calendar directly</a>.</p>
        </section>

        <section id="apply" className="application-section" aria-labelledby="apply-title">
          <div className="site-container application-layout"><div className="application-intro"><p className="section-label">Find your people</p><h2 id="apply-title">Bring your curiosity.<br />We’ll make room.</h2><p>Tell us a little about yourself and what you’d like to get out of the community.</p><p>Tim reads every application. If it’s a good fit, he’ll send you a personal invitation to our Slack.</p><p className="application-note">No need for a polished pitch. Just be yourself.</p></div><ApplicationForm /></div>
        </section>

        <section className="site-container community-section questions-section" aria-labelledby="questions-title"><h2 id="questions-title">A few good questions</h2><div className="fds-accordion">{questions.map((item) => <details className="fds-accordion-item" key={item.q}><summary>{item.q}</summary><div className="fds-accordion-body">{item.a}</div></details>)}</div></section>
      </main>
      <SiteFooter />
    </div>
  );
}
