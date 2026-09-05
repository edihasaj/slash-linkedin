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

function searchPage(records) {
	const flight = Object.entries(records)
		.map(([id, value]) => `${id}:${JSON.stringify(value)}`)
		.join('\n');
	return `<html><script id="rehydrate-data">window.__como_rehydration__ = ${JSON.stringify([flight])}</script></html>`;
}

test('searchPosts normalizes server-rendered LinkedIn search results', async () => {
	const activityUrn = 'urn:li:activity:7492945255508578305';
	const postUrl = 'https://www.linkedin.com/posts/ada-founder_agentic-ai-activity-7492945255508578305-abcd';
	const card = [
		'$',
		'div',
		null,
		{
			role: 'listitem',
			viewTrackingSpecs: { viewName: 'feed-full-update' },
			children: [
				postUrl,
				`commentCount-${activityUrn}`,
				'Open control menu for post by Ada Founder',
				'$Laa',
				{ viewTrackingSpecs: { viewName: 'feed-commentary' }, children: '$Lff' },
			],
		},
	];
	const commentary = [
		'$',
		'$L100',
		null,
		{
			textProps: {
				children: [
					['$', '$Sreact.fragment', '0', { children: 'Looking for a better CRM workflow for founder-led sales.' }],
					['$', 'a', null, { href: 'https://example.com', children: '#crm' }],
				],
			},
		},
	];
	const actor = { profileUrl: 'https://www.linkedin.com/in/ada-founder/' };
	const response = new Response(searchPage({ 84: card, aa: actor, ff: commentary }), {
		status: 200,
		headers: { 'content-type': 'text/html' },
	});
	const client = new LinkedInClient({ cookies: COOKIES });

	const result = await withStubbedFetch(response, (calls) => client.searchPosts('crm workflow', 5).then((out) => ({ out, calls })));

	assert.equal(result.out.success, true);
	assert.equal(result.out.items.length, 1);
	assert.equal(result.out.items[0].urn, activityUrn);
	assert.equal(result.out.items[0].author, 'Ada Founder');
	assert.equal(result.out.items[0].authorUrl, 'https://www.linkedin.com/in/ada-founder/');
	assert.equal(result.out.items[0].url, postUrl);
	assert.equal(result.out.items[0].text, 'Looking for a better CRM workflow for founder-led sales. #crm');
	assert.equal(result.out.items[0].publishedAt, '2026-08-11T14:09:21.104Z');
	assert.match(result.calls[0].url, /\/search\/results\/all\//);
	assert.match(result.calls[0].url, /keywords=crm\+workflow/);
	assert.doesNotMatch(result.calls[0].url, /sortBy=/);
	assert.equal(result.calls[0].init.headers.accept, 'text/html,application/xhtml+xml');
});

test('searchPosts reports a changed LinkedIn search page instead of returning false success', async () => {
	const response = new Response('<html>security challenge</html>', {
		status: 200,
		headers: { 'content-type': 'text/html' },
	});
	const client = new LinkedInClient({ cookies: COOKIES });

	const result = await withStubbedFetch(response, () => client.searchPosts('crm workflow', 5));

	assert.equal(result.success, false);
	assert.match(result.error, /did not include rehydration data/);
});
