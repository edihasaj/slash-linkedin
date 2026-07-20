import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LinkedInClient } from '../dist/linkedin/client.js';

const COOKIES = {
	liAt: 'li_at_value',
	jsessionId: 'ajax:123',
	cookieHeader: 'JSESSIONID="ajax:123"; li_at=li_at_value',
};

function withStubbedFetch(response, fn) {
	const real = globalThis.fetch;
	const calls = [];
	globalThis.fetch = async (url, init) => {
		calls.push({ url: String(url), init });
		return response;
	};
	return Promise.resolve(fn(calls)).finally(() => {
		globalThis.fetch = real;
	});
}

test('searchPosts normalizes LinkedIn search results', async () => {
	const body = {
		included: [
			{
				entityUrn: 'urn:li:activity:7338123456789012345',
				commentary: { text: 'Looking for a better CRM workflow for founder-led sales.' },
				author: { title: { text: 'Ada Founder' } },
				createdAt: '2026-07-20T08:00:00.000Z',
				likeCount: 7,
				commentCount: 3,
			},
			{
				permalink: 'https://www.linkedin.com/posts/example-activity-7338123456789012999-abcd',
				text: 'Any recommendations for monitoring social mentions across X and Reddit?',
				name: 'Ben Operator',
			},
		],
	};
	const response = new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
	const client = new LinkedInClient({ cookies: COOKIES });

	const result = await withStubbedFetch(response, (calls) => client.searchPosts('crm workflow', 5).then((out) => ({ out, calls })));

	assert.equal(result.out.success, true);
	assert.equal(result.out.items.length, 2);
	assert.equal(result.out.items[0].urn, 'urn:li:activity:7338123456789012345');
	assert.equal(result.out.items[0].author, 'Ada Founder');
	assert.equal(result.out.items[0].likeCount, 7);
	assert.match(result.out.items[1].url, /urn:li:activity:7338123456789012999/);
	assert.match(result.calls[0].url, /\/voyager\/api\/search\/blended/);
	assert.match(result.calls[0].url, /keywords=crm\+workflow/);
});
