const MAX_BYTES = 16_384;
const RECIPIENT = 'hello@timrosenberg.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;
function reply(status, data, extraHeaders = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders } });
}
function getConfiguration(env) {
  const origins = (env.APPLICATION_ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  // Local development mode: applications are logged to the server console instead of emailed.
  const devDelivery = env.APPLICATION_DELIVERY === 'log';
  return {
    siteKey: env.TURNSTILE_SITE_KEY,
    ready: Boolean((devDelivery || (env.RESEND_API_KEY && env.APPLICATION_FROM_EMAIL)) && env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY && origins.length),
    origins,
    devDelivery,
  };
}
async function readLimitedBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('empty');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('too-large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function validateApplication(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const data = {};
  // No per-field character limits beyond protocol realities (email length, token size);
  // the 16 KB request cap is the effective bound on the free-text answers.
  for (const [name, min, max] of [['name', 1, 1000], ['email', 3, 254], ['location', 1, 2000], ['work', 1, 16000], ['interest', 1, 16000], ['linkedin', 0, 2000], ['token', 1, 2048], ['requestId', 36, 36]]) {
    const raw = body[name] ?? (name === 'linkedin' ? '' : null);
    if (typeof raw !== 'string') return null;
    const value = raw.trim();
    if (value.length < min || value.length > max || [...value].some((char) => { const code = char.charCodeAt(0); return code < 32 && code !== 9 && code !== 10 && code !== 13 || code === 127; })) return null;
    data[name] = value;
  }
  if (!EMAIL.test(data.email) || /[\r\n]/.test(data.name) || !UUID.test(data.requestId)) return null;
  // linkedin is free text (a link or a profile name); the control-character
  // screen above is the only constraint.
  return data;
}

export async function handleApplication(request, { env = process.env, fetchImpl = fetch } = {}) {
  const config = getConfiguration(env);
  if (request.method === 'GET') return reply(200, { ready: config.ready, siteKey: config.ready ? config.siteKey : null });
  if (request.method !== 'POST') return reply(405, { error: 'Use the application form to apply.' }, { Allow: 'GET, POST' });
  if (!config.ready) return reply(503, { error: 'Online applications are not available yet. Please email hello@timrosenberg.com.' });
  const origin = request.headers.get('origin');
  if (!origin || !config.origins.includes(origin)) return reply(403, { error: 'Please submit your application from the community website.' });
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return reply(415, { error: 'Please use the application form.' });
  if (Number(request.headers.get('content-length')) > MAX_BYTES) return reply(413, { error: 'Your application is too long. Please shorten your answers.' });
  let body;
  try { body = await readLimitedBody(request); } catch (error) { return reply(error.message === 'too-large' ? 413 : 400, { error: 'We could not read your application. Please check your answers and try again.' }); }
  if (body && typeof body.website === 'string' && body.website.trim()) return reply(400, { error: 'Please use the application form.' });
  const data = validateApplication(body);
  if (!data) return reply(400, { error: 'Check all required answers and your email address, then try again.' });
  let verification;
  try {
    const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: data.token }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('verification-unavailable');
    verification = await response.json();
  } catch { return reply(503, { error: 'Spam verification is temporarily unavailable. Please try again shortly.' }); }
  const allowedHosts = config.origins.flatMap((value) => { try { return [new URL(value).hostname]; } catch { return []; } });
  // Cloudflare's published testing keys return hostname "example.com" and no action; accept them only in dev log mode.
  const testingKey = config.devDelivery && verification?.metadata?.result_with_testing_key === true;
  if (verification?.success !== true || (!testingKey && (verification.action !== 'apply' || !allowedHosts.includes(verification.hostname)))) return reply(400, { error: 'Please complete verification again and retry your application.' });
  const text = [
    'New Work in Progress community application', '',
    `Name: ${data.name}`, `Email: ${data.email}`, `Location: ${data.location}`, `LinkedIn: ${data.linkedin || 'Not provided'}`, '',
    'Work and AI interests:', data.work, '', 'Why they want to join:', data.interest, '',
    'Review personally, then invite to Slack if appropriate. No automated Slack invitation was sent.',
  ].join('\n');
  if (config.devDelivery) {
    console.log(`[application:dev] delivery skipped (APPLICATION_DELIVERY=log)\n${text}`);
    return reply(200, { ok: true });
  }
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `wip-application-${data.requestId}` },
      body: JSON.stringify({ from: env.APPLICATION_FROM_EMAIL, to: [RECIPIENT], reply_to: data.email, subject: 'New Work in Progress application', text }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return reply(response.status === 429 ? 429 : 502, { error: 'Your application could not be delivered. Please try again shortly, or email hello@timrosenberg.com.' });
    const result = await response.json();
    if (!result.id) throw new Error('missing-delivery-id');
    return reply(200, { ok: true });
  } catch { return reply(502, { error: 'Delivery could not be confirmed. Please retry your application, or email hello@timrosenberg.com.' }); }
}

export default { fetch: handleApplication };
