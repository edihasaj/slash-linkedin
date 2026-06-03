/**
 * Extract a LinkedIn content URN from a post URL or a raw URN string.
 *
 * Accepts, in order of preference:
 *  - a raw URN:            urn:li:share:123 / urn:li:ugcPost:123 / urn:li:activity:123
 *  - a feed permalink:     https://www.linkedin.com/feed/update/urn:li:activity:123/
 *  - a /posts/ permalink:  https://www.linkedin.com/posts/<slug>-activity-123-abcd
 *
 * Returns the URN verbatim (including its type) so callers can decide whether to
 * resolve an activity URN into the share/ugcPost URN the reshare API expects.
 */
const RAW_URN_REGEX = /urn:li:(share|ugcPost|activity):(\d+)/i;
const POSTS_SLUG_REGEX = /(?:^|[-_/])(activity|share|ugcPost)[-:](\d+)/i;

export type LinkedInUrnType = 'share' | 'ugcPost' | 'activity';

export interface ExtractedUrn {
	urn: string;
	type: LinkedInUrnType;
	id: string;
}

export function extractContentUrn(input: string): ExtractedUrn | undefined {
	const trimmed = input.trim();
	const raw = RAW_URN_REGEX.exec(trimmed);
	if (raw) {
		const type = raw[1] as LinkedInUrnType;
		return { urn: `urn:li:${type}:${raw[2]}`, type, id: raw[2]! };
	}
	const slug = POSTS_SLUG_REGEX.exec(trimmed);
	if (slug) {
		const type = slug[1] as LinkedInUrnType;
		return { urn: `urn:li:${type}:${slug[2]}`, type, id: slug[2]! };
	}
	return undefined;
}
