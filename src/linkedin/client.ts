import { LinkedInClientBase } from './base.js';
import type {
	CommentsScope,
	CurrentUser,
	CurrentUserResult,
	MediaAttachment,
	PostResult,
	UploadMediaResult,
	Visibility,
} from './types.js';

const COMMENTS_SCOPE_MAP: Record<CommentsScope, string> = {
	all: 'ALL',
	connections: 'CONNECTIONS_ONLY',
	none: 'NONE',
};

// Match the urn of the created update, most-specific first.
const URN_REGEXES = [/urn:li:activity:\d+/, /urn:li:ugcPost:\d+/, /urn:li:share:\d+/];

export interface CreatePostOptions {
	visibility?: Visibility;
	commentsScope?: CommentsScope;
	/** Already-uploaded media URNs (see uploadImage). */
	mediaUrns?: string[];
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
