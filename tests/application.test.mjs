import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApplication } from '../api/application.mjs';
const env = { RESEND_API_KEY: 'test-key', APPLICATION_FROM_EMAIL: 'WIP <applications@example.com>', TURNSTILE_SECRET_KEY: 'test-secret', TURNSTILE_SITE_KEY: 'test-site', APPLICATION_ALLOWED_ORIGINS: 'https://community.example' };
const valid = { name: 'Test Applicant', email: 'applicant@example.com', location: 'Durham', work: 'I build small AI tools.', interest: 'I want to learn with local people.', linkedin: '', consent: true, website: '', token: 'test-token', requestId: '12345678-1234-4234-8234-123456789012' };
function request(body = valid, options = {}) { return new Request('https://community.example/api/application', { method: 'POST', headers: { Origin: 'https://community.example', 'Content-Type': 'application/json', ...options.headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }); }
function provider(verification = { success: true, action: 'apply', hostname: 'community.example' }, sendStatus = 200) {
  const calls = [];
  return { calls, fetchImpl: async (url, options) => { calls.push({ url, options }); return url.includes('siteverify') ? Response.json(verification) : Response.json(sendStatus === 200 ? { id: 'email-id' } : { message: 'provider failed' }, { status: sendStatus }); } };
}
test('readiness never exposes credentials and fails closed without config', async () => {
  const response = await handleApplication(new Request('https://community.example/api/application'), { env: {} });
  assert.deepEqual(await response.json(), { ready: false, siteKey: null });
  const ready = await handleApplication(new Request('https://community.example/api/application'), { env });
  assert.deepEqual(await ready.json(), { ready: true, siteKey: 'test-site' });
});
test('success requires verification and provider acceptance, with fixed recipient and reply-to', async () => {
  const mock = provider(); const result = await handleApplication(request(), { env, ...mock });
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { ok: true });
  const email = JSON.parse(mock.calls[1].options.body);
  assert.deepEqual(email.to, ['hello@timrosenberg.com']); assert.equal(email.reply_to, valid.email);
  assert.match(email.text, /Durham/); assert.match(email.text, /No automated Slack invitation/);
  assert.equal(mock.calls[1].options.headers['Idempotency-Key'], `wip-application-${valid.requestId}`);
});
for (const [name, patch] of [ ['missing name', { name: ' ' }], ['invalid email', { email: 'invalid' }], ['header injection', { email: 'a@example.com\r\nBcc:x@example.com' }], ['empty answer', { interest: ' ' }], ['fake LinkedIn domain', { linkedin: 'https://linkedin.com.evil.test/in/me' }], ['unsafe URL', { linkedin: 'javascript:alert(1)' }], ['invalid request ID', { requestId: 'anything' }], ['array field', { work: ['test'] }], ['honeypot', { website: 'spam' }] ]) {
  test(`rejects ${name} before contacting providers`, async () => { const mock = provider(); const response = await handleApplication(request({ ...valid, ...patch }), { env, ...mock }); assert.equal(response.status, 400); assert.equal(mock.calls.length, 0); });
}
test('accepts a valid optional LinkedIn profile', async () => { const mock = provider(); const result = await handleApplication(request({ ...valid, linkedin: 'https://www.linkedin.com/in/test-person' }), { env, ...mock }); assert.equal(result.status, 200); });
test('rejects cross-origin submissions', async () => { const mock = provider(); const response = await handleApplication(request(valid, { headers: { Origin: 'https://evil.example' } }), { env, ...mock }); assert.equal(response.status, 403); assert.equal(mock.calls.length, 0); });
test('rejects large streamed bodies and malformed JSON', async () => { assert.equal((await handleApplication(request('x'.repeat(17000)), { env })).status, 413); assert.equal((await handleApplication(request('{'), { env })).status, 400); });
for (const verification of [{ success: false }, { success: true, action: 'other', hostname: 'community.example' }, { success: true, action: 'apply', hostname: 'evil.example' }]) {
  test(`rejects invalid challenge ${JSON.stringify(verification)}`, async () => { const mock = provider(verification); assert.equal((await handleApplication(request(), { env, ...mock })).status, 400); assert.equal(mock.calls.length, 1); });
}
test('provider failures never produce success', async () => { const mock = provider(undefined, 429); assert.equal((await handleApplication(request(), { env, ...mock })).status, 429); });
test('network failures never produce success or leak secrets', async () => { const result = await handleApplication(request(), { env, fetchImpl: async () => { throw new Error('secret-provider-detail'); } }); assert.equal(result.status, 503); assert.doesNotMatch(await result.text(), /test-secret|secret-provider-detail/); });
test('missing config and unsupported methods are explicit', async () => { assert.equal((await handleApplication(request(), { env: {} })).status, 503); assert.equal((await handleApplication(new Request('https://community.example/api/application', { method: 'DELETE' }), { env })).status, 405); });

test('dev log delivery accepts testing-key verification without contacting the email provider', async () => {
  const devEnv = { TURNSTILE_SECRET_KEY: 'test-secret', TURNSTILE_SITE_KEY: 'test-site', APPLICATION_ALLOWED_ORIGINS: 'https://community.example', APPLICATION_DELIVERY: 'log' };
  const ready = await handleApplication(new Request('https://community.example/api/application'), { env: devEnv });
  assert.deepEqual(await ready.json(), { ready: true, siteKey: 'test-site' });
  const mock = provider({ success: true, hostname: 'example.com', metadata: { result_with_testing_key: true } });
  const result = await handleApplication(request(), { env: devEnv, ...mock });
  assert.equal(result.status, 200);
  assert.equal(mock.calls.length, 1); // siteverify only — no email call
});
test('production still rejects testing-key verification results', async () => {
  const mock = provider({ success: true, hostname: 'example.com', metadata: { result_with_testing_key: true } });
  assert.equal((await handleApplication(request(), { env, ...mock })).status, 400);
});
test('malformed verification responses fail closed', async () => { const mock = provider(null); assert.equal((await handleApplication(request(), { env, ...mock })).status, 400); assert.equal(mock.calls.length, 1); });
test('email transport exceptions never produce success', async () => { let count = 0; const response = await handleApplication(request(), { env, fetchImpl: async () => { if (++count === 1) return Response.json({ success: true, action: 'apply', hostname: 'community.example' }); throw new Error('provider-secret'); } }); assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /provider-secret/); });
