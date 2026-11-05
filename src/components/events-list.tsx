import { useEffect, useState } from 'react';

type CommunityEvent = { title: string; start: string; url?: string; location?: string };
type EventsPayload = { upcoming: CommunityEvent[]; past: CommunityEvent[] };

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

export default function EventsList() {
  const [events, setEvents] = useState<EventsPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/events', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('unavailable'))))
      .then((payload: EventsPayload) => setEvents(payload))
      .catch((error) => { if (error.name !== 'AbortError') setFailed(true); });
    return () => controller.abort();
  }, []);

  if (failed) {
    return <p className="events-fallback" role="status">We couldn’t load the events list right now. <a href="https://luma.com/work-in-progress-raleigh" target="_blank" rel="noreferrer">See all events on Luma</a>.</p>;
  }
  if (!events) return <p className="events-fallback" role="status">Loading events…</p>;

  const showingUpcoming = events.upcoming.length > 0;
  const list = showingUpcoming ? events.upcoming : events.past;

  return (
    <div className="events-list">
      {!showingUpcoming && <p className="events-list-note">New dates are in the works—here’s what we’ve been up to lately.</p>}
      <ul>
        {list.map((event) => {
          const start = new Date(event.start);
          return (
            <li key={`${event.start}-${event.title}`} className="event-card">
              <div className="event-date">
                <span className="event-day">{dateFormat.format(start)}</span>
                <span className="event-time">{timeFormat.format(start)}</span>
              </div>
              <div className="event-details">
                <h3>{event.url ? <a href={event.url} target="_blank" rel="noreferrer">{event.title}</a> : event.title}</h3>
                {event.location && <p className="event-location">{event.location}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
