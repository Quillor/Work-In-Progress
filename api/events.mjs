const CALENDAR_ID = 'cal-F949eHAMaWWgW78';
const FEED_URL = `https://api.lu.ma/ics/get?entity=calendar&id=${CALENDAR_ID}`;
const CACHE_MS = 10 * 60 * 1000;

let cache = { at: 0, events: null };

function unfoldLines(ics) {
  // ICS folds long lines with CRLF + a single space/tab continuation.
  return ics.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
}

function parseDate(value) {
  // 20250812T223000Z → ISO; all Luma feed times are UTC.
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

export function parseEvents(ics) {
  const events = [];
  let current = null;
  for (const line of unfoldLines(ics)) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') {
      if (current?.start && current.title) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).split(';')[0];
    const value = line.slice(separator + 1);
    if (key === 'DTSTART') current.start = parseDate(value);
    if (key === 'SUMMARY') current.title = value.replace(/\\([,;\\])/g, '$1');
    if (key === 'UID') {
      const id = /^(evt-[A-Za-z0-9]+)@/.exec(value)?.[1];
      if (id) current.url = `https://luma.com/event/${id}`;
    }
    if (key === 'DESCRIPTION') {
      const link = /https:\/\/luma\.com\/[A-Za-z0-9-]+/.exec(value)?.[0];
      if (link) current.url = link;
    }
    if (key === 'LOCATION') {
      const location = value.replace(/\\([,;\\])/g, '$1').replace(/\\n/g, ', ');
      // Luma uses a URL placeholder when the venue is hidden until registration.
      if (!/^https?:\/\//.test(location)) current.location = location.split(',').slice(0, 2).join(',').trim();
    }
  }
  events.sort((a, b) => a.start.localeCompare(b.start));
  const now = new Date().toISOString();
  const upcoming = events.filter((event) => event.start >= now);
  const past = events.filter((event) => event.start < now).reverse();
  return { upcoming: upcoming.slice(0, 6), past: past.slice(0, 6) };
}

export async function handleEvents(request, { fetchImpl = fetch } = {}) {
  if (request.method !== 'GET') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'GET' } });
  if (cache.events && Date.now() - cache.at < CACHE_MS) {
    return Response.json(cache.events, { headers: { 'Cache-Control': 'public, max-age=600' } });
  }
  try {
    const response = await fetchImpl(FEED_URL, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('feed-unavailable');
    const events = parseEvents(await response.text());
    cache = { at: Date.now(), events };
    return Response.json(events, { headers: { 'Cache-Control': 'public, max-age=600' } });
  } catch {
    if (cache.events) return Response.json(cache.events, { headers: { 'Cache-Control': 'public, max-age=60' } });
    return Response.json({ error: 'Events are temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export default { fetch: handleEvents };
