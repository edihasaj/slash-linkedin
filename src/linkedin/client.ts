import { extractContentUrn } from '../lib/extract-urn.js';
import { LinkedInClientBase } from './base.js';
import { RESHARE_QUERY_ID, RESHARE_WITH_THOUGHTS_QUERY_ID } from './constants.js';
import type {
	CommentsScope,
	CurrentUser,
	CurrentUserResult,
	MediaAttachment,
	PostResult,
	ReshareOptions,
	UploadMediaResult,
	Visibility,
} from './types.js';

const COMMENTS_SCOPE_MAP: Record<CommentsScope, string> = {
	all: 'ALL',
	connections: 'CONNECTIONS_ONLY',
	none: 'NONE',
};

const VISIBILITY_TYPE_MAP: Record<Visibility, string> = {
	anyone: 'ANYONE',
	connections: 'CONNECTIONS_ONLY',
};

// Match the urn of the created update, most-specific first.
const URN_REGEXES = [/urn:li:activity:\d+/, /urn:li:ugcPost:\d+/, /urn:li:share:\d+/];
// The reshare API wants the content (share/ugcPost) urn, not the activity wrapper.
const CONTENT_URN_REGEX = /urn:li:(?:share|ugcPost):\d+/;

export interface CreatePostOptions {
	visibility?: Visibility;
	commentsScope?: CommentsScope;
	/** Already-uploaded media URNs (see uploadImage). */
	mediaUrns?: string[];
}

export interface ResolveUrnResult {
	success: boolean;
	/** The content (share/ugcPost) urn suitable for resharing. */
	urn?: string;
	error?: string;
}

export class LinkedInClient extends LinkedInClientBase {
	private parseJson(text: string): unknown {
		try {
			return JSON.parse(text);
		} catch {
			return undefined;
		}
	}

	private extractUrn(text: string): string | undefined {
		for (const regex of URN_REGEXES) {
			const match = regex.exec(text);
			if (match) {
				return match[0];
			}
		}
		return undefined;
	}

	async createPost(text: string, options: CreatePostOptions = {}): Promise<PostResult> {
		const media = (options.mediaUrns ?? []).map((mediaUrn) => ({
			category: 'IMAGE',
			mediaUrn,
			tapTargets: [],
		}));
		const payload = {
			visibleToConnectionsOnly: options.visibility === 'connections',
			externalAudienceProviders: [],
			commentaryV2: {
				text,
				attributes: [],
			},
			origin: 'FEED',
			allowedCommentersScope: COMMENTS_SCOPE_MAP[options.commentsScope ?? 'all'],
			postState: 'PUBLISHED',
			media,
		};
		try {
			const res = await this.request({ method: 'POST', path: '/contentcreation/normShares', body: payload });
			if (!res.ok) {
				return { success: false, error: this.describeError(res) };
			}
			const raw = this.parseJson(res.text);
			return { success: true, urn: this.extractUrn(res.text), raw };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	/**
	 * Resolve a post URL or URN into the content (share/ugcPost) urn the reshare API expects.
	 * Share/ugcPost urns pass through untouched; an activity urn is resolved via a read-only
	 * feed-update fetch (LinkedIn's `/feed/updates/{urn}` returns the underlying share urn).
	 */
	async resolveContentUrn(input: string): Promise<ResolveUrnResult> {
		const extracted = extractContentUrn(input);
		if (!extracted) {
			return { success: false, error: `Could not find a LinkedIn post URN in "${input}". Pass a post URL or a urn:li:share/ugcPost/activity:… value.` };
		}
		if (extracted.type !== 'activity') {
			return { success: true, urn: extracted.urn };
		}
		try {
			const res = await this.request({ method: 'GET', path: `/feed/updates/${encodeURIComponent(extracted.urn)}` });
			if (!res.ok) {
				return { success: false, error: `Could not resolve ${extracted.urn}: ${this.describeError(res)}` };
			}
			const match = CONTENT_URN_REGEX.exec(res.text);
			if (!match) {
				return { success: false, error: `Resolved ${extracted.urn} but found no share/ugcPost urn in the response.` };
			}
			return { success: true, urn: match[0] };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	/**
	 * Reshare (repost) an existing post. With `options.text` it posts a "repost with your
	 * thoughts" (commentary + RESHARE origin); without it, an instant repost. `target` may be
	 * a post URL or any share/ugcPost/activity urn — activity urns are resolved automatically.
	 */
	async reshare(target: string, options: ReshareOptions = {}): Promise<PostResult> {
		const resolved = await this.resolveContentUrn(target);
		if (!resolved.success || !resolved.urn) {
			return { success: false, error: resolved.error ?? 'Could not resolve the post to reshare' };
		}
		const contentUrn = resolved.urn;
		const text = options.text?.trim();
		const queryId = text ? RESHARE_WITH_THOUGHTS_QUERY_ID : RESHARE_QUERY_ID;
		const variables = text
			? {
					post: {
						allowedCommentersScope: COMMENTS_SCOPE_MAP[options.commentsScope ?? 'all'],
						intendedShareLifeCycleState: 'PUBLISHED',
						origin: 'RESHARE',
						visibilityDataUnion: { visibilityType: VISIBILITY_TYPE_MAP[options.visibility ?? 'anyone'] },
						commentary: { text, attributesV2: [] },
						parentUrn: contentUrn,
					},
				}
			: { entity: { rootContentUrn: contentUrn } };
		try {
			const res = await this.request({
				method: 'POST',
				path: '/graphql',
				query: { action: 'execute', queryId },
				body: { variables, queryId, includeWebMetadata: true },
			});
			if (!res.ok) {
				return { success: false, error: this.describeError(res) };
			}
			const raw = this.parseJson(res.text);
			if (raw && typeof raw === 'object' && Array.isArray((raw as { errors?: unknown[] }).errors) && (raw as { errors: unknown[] }).errors.length > 0) {
				return { success: false, error: `LinkedIn rejected the reshare (GraphQL errors). The query ID may be stale — re-capture it. Raw: ${res.text.slice(0, 200)}`, raw };
			}
			return { success: true, urn: this.extractUrn(res.text), raw };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	async getCurrentUser(): Promise<CurrentUserResult> {
		try {
			const res = await this.request({ method: 'GET', path: '/me' });
			if (!res.ok) {
				return { success: false, error: this.describeError(res) };
			}
			const raw = this.parseJson(res.text);
			const user = this.parseCurrentUser(raw);
			if (!user) {
				return { success: false, error: 'Could not parse current user from /me response', raw };
			}
			return { success: true, user, raw };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	private parseCurrentUser(raw: unknown): CurrentUser | undefined {
		if (!raw || typeof raw !== 'object') {
			return undefined;
		}
		const record = raw as Record<string, unknown>;
		const candidates: Array<Record<string, unknown>> = [];
		const included = record.included;
		if (Array.isArray(included)) {
			for (const item of included) {
				if (item && typeof item === 'object') {
					candidates.push(item as Record<string, unknown>);
				}
			}
		}
		const data = record.data;
		if (data && typeof data === 'object') {
			candidates.push(data as Record<string, unknown>);
		}
		const profile = candidates.find((c) => typeof c.publicIdentifier === 'string') ?? candidates[0];
		if (!profile) {
			return undefined;
		}
		const entityUrn = typeof profile.entityUrn === 'string' ? profile.entityUrn : undefined;
		const id = entityUrn ? (entityUrn.split(':').pop() ?? entityUrn) : 'unknown';
		const occupation = typeof profile.occupation === 'string' ? profile.occupation : undefined;
		const headline = typeof profile.headline === 'string' ? profile.headline : occupation;
		return {
			id,
			publicIdentifier: typeof profile.publicIdentifier === 'string' ? profile.publicIdentifier : undefined,
			firstName: typeof profile.firstName === 'string' ? profile.firstName : undefined,
			lastName: typeof profile.lastName === 'string' ? profile.lastName : undefined,
			headline,
		};
	}

	/** Two-step image upload: register metadata, then PUT the binary. Returns the media URN. */
	async uploadImage(media: MediaAttachment): Promise<UploadMediaResult> {
		try {
			const metaRes = await this.request({
				method: 'POST',
				path: '/voyagerVideoDashMediaUploadMetadata',
				query: { action: 'upload' },
				body: {
					mediaUploadType: 'IMAGE_SHARING',
					fileSize: media.data.byteLength,
					filename: media.filename,
				},
			});
			if (!metaRes.ok) {
				return { success: false, error: `Upload metadata failed: ${this.describeError(metaRes)}` };
			}
			const meta = this.parseJson(metaRes.text) as
				| { data?: { value?: { singleUploadUrl?: string; urn?: string } } }
				| undefined;
			const uploadUrl = meta?.data?.value?.singleUploadUrl;
			const mediaUrn = meta?.data?.value?.urn;
			if (!uploadUrl || !mediaUrn) {
				return { success: false, error: 'LinkedIn did not return an image upload URL' };
			}
			const uploadResponse = await fetch(uploadUrl, {
				method: 'PUT',
				headers: {
					'content-type': media.mimeType,
					'media-type-family': 'STILLIMAGE',
					cookie: this.cookieHeader,
					'csrf-token': this.jsessionId,
					'user-agent': this.userAgent,
				},
				body: media.data,
			});
			if (!uploadResponse.ok) {
				return { success: false, error: `Image binary upload failed: HTTP ${uploadResponse.status}` };
			}
			return { success: true, mediaUrn };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	}
}

export type { CurrentUser, CurrentUserResult, PostResult, UploadMediaResult } from './types.js';
