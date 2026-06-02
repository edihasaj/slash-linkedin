/**
 * Browser cookie extraction for LinkedIn authentication.
 * Delegates to the vendored cookie helper for Safari/Chrome/Edge/Firefox reads.
 *
 * LinkedIn needs two cookies:
 *  - `li_at`       the session auth cookie
 *  - `JSESSIONID`  stored as `"ajax:1234..."` (quotes included); the CSRF token is
 *                  that value with the surrounding double-quotes stripped.
 */
import { getCookies } from 'sweet-cookie-local';

export interface LinkedInCookies {
	liAt: string | null;
	/** JSESSIONID value WITHOUT surrounding quotes (== the csrf-token). */
	jsessionId: string | null;
	cookieHeader: string | null;
	source: string | null;
}

export interface CookieExtractionResult {
	cookies: LinkedInCookies;
	warnings: string[];
}

export type CookieSource = 'safari' | 'chrome' | 'edge' | 'firefox';

const LINKEDIN_COOKIE_NAMES = ['li_at', 'JSESSIONID'];
const LINKEDIN_URL = 'https://www.linkedin.com/';
const LINKEDIN_ORIGINS = ['https://www.linkedin.com/', 'https://linkedin.com/'];
const DEFAULT_COOKIE_TIMEOUT_MS = 30_000;

function normalizeValue(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/** Strip a single pair of surrounding double quotes, if present. */
function stripQuotes(value: string): string {
	if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
		return value.slice(1, -1);
	}
	return value;
}

function buildCookieHeader(liAt: string, jsessionId: string): string {
	// JSESSIONID must keep its quotes in the Cookie header; csrf-token strips them.
	return `JSESSIONID="${jsessionId}"; li_at=${liAt}`;
}

function buildEmpty(): LinkedInCookies {
	return { liAt: null, jsessionId: null, cookieHeader: null, source: null };
}

function finalize(cookies: LinkedInCookies): LinkedInCookies {
	if (cookies.liAt && cookies.jsessionId) {
		cookies.cookieHeader = buildCookieHeader(cookies.liAt, cookies.jsessionId);
	}
	return cookies;
}

function readEnvCookie(cookies: LinkedInCookies, keys: string[], field: 'liAt' | 'jsessionId'): void {
	if (cookies[field]) {
		return;
	}
	for (const key of keys) {
		const value = normalizeValue(process.env[key]);
		if (!value) {
			continue;
		}
		cookies[field] = field === 'jsessionId' ? stripQuotes(value) : value;
		if (!cookies.source) {
			cookies.source = `env ${key}`;
		}
		break;
	}
}

function resolveSources(cookieSource?: CookieSource | CookieSource[]): CookieSource[] {
	if (Array.isArray(cookieSource)) {
		return cookieSource;
	}
	if (cookieSource) {
		return [cookieSource];
	}
	return ['safari', 'chrome', 'edge', 'firefox'];
}

function labelForSource(source: CookieSource, profile?: string): string {
	if (source === 'safari') {
		return 'Safari';
	}
	if (source === 'chrome') {
		return profile ? `Chrome profile "${profile}"` : 'Chrome default profile';
	}
	if (source === 'edge') {
		return profile ? `Edge profile "${profile}"` : 'Edge default profile';
	}
	return profile ? `Firefox profile "${profile}"` : 'Firefox default profile';
}

type RawCookie = { name?: string; value?: string; domain?: string };

function pickCookieValue(cookies: RawCookie[], name: string): string | null {
	const matches = cookies.filter((c) => c?.name === name && typeof c.value === 'string');
	if (matches.length === 0) {
		return null;
	}
	const preferred = matches.find((c) => (c.domain ?? '').endsWith('linkedin.com'));
	if (preferred?.value) {
		return preferred.value;
	}
	return matches[0]?.value ?? null;
}

async function readCookiesFromBrowser(options: {
	source: CookieSource;
	chromeProfile?: string;
	firefoxProfile?: string;
	cookieTimeoutMs?: number;
}): Promise<CookieExtractionResult> {
	const warnings: string[] = [];
	const out = buildEmpty();
	const { cookies, warnings: providerWarnings } = await getCookies({
		url: LINKEDIN_URL,
		origins: LINKEDIN_ORIGINS,
		names: [...LINKEDIN_COOKIE_NAMES],
		browsers: [options.source],
		mode: 'merge',
		chromeProfile: options.chromeProfile,
		firefoxProfile: options.firefoxProfile,
		timeoutMs: options.cookieTimeoutMs,
	});
	warnings.push(...providerWarnings);
	const liAt = pickCookieValue(cookies, 'li_at');
	const jsessionRaw = pickCookieValue(cookies, 'JSESSIONID');
	if (liAt) {
		out.liAt = liAt;
	}
	if (jsessionRaw) {
		out.jsessionId = stripQuotes(jsessionRaw);
	}
	if (out.liAt && out.jsessionId) {
		out.source = labelForSource(
			options.source,
			options.source === 'chrome' ? options.chromeProfile : options.firefoxProfile,
		);
		return { cookies: finalize(out), warnings };
	}
	warnings.push(
		`No LinkedIn cookies found in ${labelForSource(options.source)}. Make sure you are logged into linkedin.com there.`,
	);
	return { cookies: out, warnings };
}

export async function extractCookiesFromSafari(): Promise<CookieExtractionResult> {
	return readCookiesFromBrowser({ source: 'safari' });
}

export async function extractCookiesFromChrome(profile?: string): Promise<CookieExtractionResult> {
	return readCookiesFromBrowser({ source: 'chrome', chromeProfile: profile });
}

export async function extractCookiesFromFirefox(profile?: string): Promise<CookieExtractionResult> {
	return readCookiesFromBrowser({ source: 'firefox', firefoxProfile: profile });
}

/**
 * Resolve LinkedIn credentials from multiple sources.
 * Priority: CLI args > environment variables > browsers (ordered).
 */
export async function resolveCredentials(options: {
	liAt?: string;
	jsessionId?: string;
	cookieSource?: CookieSource | CookieSource[];
	chromeProfile?: string;
	firefoxProfile?: string;
	cookieTimeoutMs?: number;
}): Promise<CookieExtractionResult> {
	const warnings: string[] = [];
	const cookies = buildEmpty();
	const cookieTimeoutMs =
		typeof options.cookieTimeoutMs === 'number' && Number.isFinite(options.cookieTimeoutMs) && options.cookieTimeoutMs > 0
			? options.cookieTimeoutMs
			: process.platform === 'darwin'
				? DEFAULT_COOKIE_TIMEOUT_MS
				: undefined;

	if (options.liAt) {
		cookies.liAt = options.liAt;
		cookies.source = 'CLI argument';
	}
	if (options.jsessionId) {
		cookies.jsessionId = stripQuotes(options.jsessionId);
		if (!cookies.source) {
			cookies.source = 'CLI argument';
		}
	}
	readEnvCookie(cookies, ['LI_AT', 'LINKEDIN_LI_AT'], 'liAt');
	readEnvCookie(cookies, ['JSESSIONID', 'LINKEDIN_JSESSIONID'], 'jsessionId');
	if (cookies.liAt && cookies.jsessionId) {
		return { cookies: finalize(cookies), warnings };
	}

	const sourcesToTry = resolveSources(options.cookieSource);
	for (const source of sourcesToTry) {
		const res = await readCookiesFromBrowser({
			source,
			chromeProfile: options.chromeProfile,
			firefoxProfile: options.firefoxProfile,
			cookieTimeoutMs,
		});
		warnings.push(...res.warnings);
		if (res.cookies.liAt && res.cookies.jsessionId) {
			return { cookies: res.cookies, warnings };
		}
		// Keep any partial finds (e.g. li_at from one browser) as a fallback hint.
		if (res.cookies.liAt && !cookies.liAt) {
			cookies.liAt = res.cookies.liAt;
			cookies.source = res.cookies.source;
		}
		if (res.cookies.jsessionId && !cookies.jsessionId) {
			cookies.jsessionId = res.cookies.jsessionId;
		}
	}

	if (!cookies.liAt) {
		warnings.push('Missing li_at - provide via --li-at, LI_AT env var, or login to linkedin.com in Safari/Chrome/Edge/Firefox');
	}
	if (!cookies.jsessionId) {
		warnings.push(
			'Missing JSESSIONID - provide via --jsessionid, JSESSIONID env var, or login to linkedin.com in Safari/Chrome/Edge/Firefox',
		);
	}
	return { cookies: finalize(cookies), warnings };
}
