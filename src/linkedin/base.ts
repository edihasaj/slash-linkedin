import { DEFAULT_USER_AGENT, LINKEDIN_BASE, NORMALIZED_ACCEPT, VOYAGER_BASE, VOYAGER_CLIENT_VERSION } from './constants.js';
import type { LinkedInClientOptions } from './types.js';

export interface RequestOptions {
	method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
	path: string;
	query?: Record<string, string | number | boolean | undefined>;
	body?: unknown;
	/** Hit linkedin.com root instead of the voyager API base. */
	baseRequest?: boolean;
	/** Extra headers merged on top of the defaults. */
	headers?: Record<string, string>;
}

export interface RawResponse {
	ok: boolean;
	status: number;
	contentType: string;
	text: string;
}

/**
 * Low-level voyager request layer: cookie/CSRF auth, default headers, timeout.
 * Higher-level post/user/media methods live in client.ts.
 */
export abstract class LinkedInClientBase {
	protected readonly liAt: string;
	protected readonly jsessionId: string;
	protected readonly cookieHeader: string;
	protected readonly userAgent: string;
	protected readonly timeoutMs?: number;

	constructor(options: LinkedInClientOptions) {
		if (!options.cookies.liAt || !options.cookies.jsessionId) {
			throw new Error('Both li_at and JSESSIONID cookies are required');
		}
		this.liAt = options.cookies.liAt;
		this.jsessionId = options.cookies.jsessionId;
		this.cookieHeader = options.cookies.cookieHeader || `JSESSIONID="${this.jsessionId}"; li_at=${this.liAt}`;
		this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
		this.timeoutMs = options.timeoutMs;
	}

	protected getBaseHeaders(): Record<string, string> {
		return {
			'csrf-token': this.jsessionId,
			cookie: this.cookieHeader,
			'user-agent': this.userAgent,
			accept: NORMALIZED_ACCEPT,
			'accept-language': 'en-US,en;q=0.9',
			'x-li-lang': 'en_US',
			'x-restli-protocol-version': '2.0.0',
			'x-li-track': JSON.stringify({
				clientVersion: VOYAGER_CLIENT_VERSION,
				osName: 'web',
				timezoneOffset: new Date().getTimezoneOffset() / -60,
				deviceFormFactor: 'DESKTOP',
				mpName: 'voyager-web',
			}),
		};
	}

	private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
		if (!this.timeoutMs || this.timeoutMs <= 0) {
			return fetch(url, init);
		}
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
		try {
			return await fetch(url, { ...init, signal: controller.signal });
		} finally {
			clearTimeout(timeoutId);
		}
	}

	protected async request(options: RequestOptions): Promise<RawResponse> {
		const base = options.baseRequest ? LINKEDIN_BASE : VOYAGER_BASE;
		let url = `${base}${options.path}`;
		if (options.query) {
			const params = new URLSearchParams();
			for (const [key, value] of Object.entries(options.query)) {
				if (value !== undefined) {
					params.set(key, String(value));
				}
			}
			const qs = params.toString();
			if (qs) {
				url += `?${qs}`;
			}
		}

		const headers: Record<string, string> = { ...this.getBaseHeaders(), ...options.headers };
		if (options.body !== undefined) {
			headers['content-type'] = 'application/json; charset=UTF-8';
			headers.origin = LINKEDIN_BASE;
		}

		const response = await this.fetchWithTimeout(url, {
			method: options.method,
			headers,
			body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
		});
		const contentType = response.headers.get('content-type') ?? '';
		const text = await response.text();
		return { ok: response.ok, status: response.status, contentType, text };
	}

	/** Translate a non-OK response into a human-readable error string. */
	protected describeError(res: RawResponse): string {
		if (res.contentType.includes('text/html')) {
			return `HTTP ${res.status}: LinkedIn returned an HTML page (session expired or a security challenge — re-login in your browser).`;
		}
		let message = `HTTP ${res.status}`;
		try {
			const parsed = JSON.parse(res.text);
			message = parsed.message ?? parsed.errorMessage ?? message;
		} catch {
			if (res.text) {
				message = `${message}: ${res.text.slice(0, 200)}`;
			}
		}
		if (res.status === 401) {
			return `${message} (session expired — re-login to linkedin.com in your browser)`;
		}
		return message;
	}
}
