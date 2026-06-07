// Regression test for the redirect-loop bug: LinkedIn 302s voyager requests
// (session/bot challenge); with the default redirect:'follow' this looped into
// an opaque "fetch failed". The client must now surface an actionable message.
//
// Runs against the built dist (run `pnpm build` first). No network: fetch is stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LinkedInClient } from '../dist/linkedin/client.js';

const COOKIES = { liAt: 'li_at_value', jsessionId: 'ajax:123', cookieHeader: 'JSESSIONID="ajax:123"; li_at=li_at_value' };

function withStubbedFetch(response, fn) {
	const real = globalThis.fetch;
	globalThis.fetch = async () => response;
	return Promise.resolve(fn()).finally(() => { globalThis.fetch = real; });
}

test('302 redirect -> actionable error, not "fetch failed"', async () => {
	const res = new Response('', { status: 302, headers: { location: 'https://www.linkedin.com/voyager/api/me' } });
	const client = new LinkedInClient({ cookies: COOKIES });
	const out = await withStubbedFetch(res, () => client.getCurrentUser());
	assert.equal(out.success, false);
	assert.match(out.error, /redirected the request \(HTTP 302\)/i);
	assert.match(out.error, /re-login to linkedin\.com/i);
	assert.doesNotMatch(out.error, /fetch failed/i);
});

test('non-redirect failure (500) is unaffected by the redirect branch', async () => {
	const res = new Response('{"message":"boom"}', { status: 500, headers: { 'content-type': 'application/json' } });
	const client = new LinkedInClient({ cookies: COOKIES });
	const out = await withStubbedFetch(res, () => client.getCurrentUser());
	assert.equal(out.success, false);
	assert.doesNotMatch(out.error, /redirected the request/i);
});
