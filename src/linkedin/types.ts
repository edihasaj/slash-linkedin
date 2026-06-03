import type { LinkedInCookies } from '../lib/cookies.js';

export type Visibility = 'anyone' | 'connections';
export type CommentsScope = 'all' | 'connections' | 'none';

export interface LinkedInClientOptions {
	cookies: LinkedInCookies;
	userAgent?: string;
	timeoutMs?: number;
}

export interface PostResult {
	success: boolean;
	/** e.g. urn:li:activity:123 or urn:li:share:123 when it can be parsed from the response. */
	urn?: string;
	error?: string;
	/** Raw API response, surfaced for --json-full. */
	raw?: unknown;
}

export interface ReshareOptions {
	/** Optional commentary. When present (non-empty), posts a "repost with your thoughts"; otherwise an instant repost. */
	text?: string;
	visibility?: Visibility;
	commentsScope?: CommentsScope;
}

export interface CurrentUser {
	id: string;
	publicIdentifier?: string;
	firstName?: string;
	lastName?: string;
	headline?: string;
}

export interface CurrentUserResult {
	success: boolean;
	user?: CurrentUser;
	error?: string;
	raw?: unknown;
}

export interface UploadMediaResult {
	success: boolean;
	mediaUrn?: string;
	error?: string;
}

export interface MediaAttachment {
	data: Buffer;
	mimeType: string;
	filename: string;
	/** Alt text for accessibility. */
	alt?: string;
}
