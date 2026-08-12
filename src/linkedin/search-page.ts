import type { SearchItem } from './types.js';

const REHYDRATION_MARKER = 'window.__como_rehydration__';
const RECORD_ID_REGEX = /^[0-9a-f]+$/i;
const RECORD_REFERENCE_REGEX = /^\$L?([0-9a-f]+)$/i;
const ACTIVITY_URN_REGEX = /urn:li:activity:(\d{6,})/;
const POST_URL_REGEX = /^https:\/\/www\.linkedin\.com\/posts\//;
const AUTHOR_URL_REGEX = /^https:\/\/www\.linkedin\.com\/(?:in|company)\//;
const POST_URL_ID_REGEX = /-(activity|ugcPost|share)-(\d{6,})(?:-|$)/i;
const AUTHOR_LABEL = 'Open control menu for post by ';

type FlightRecord = unknown;

function parseFlightRecords(html: string): Map<string, FlightRecord> {
	const markerStart = html.indexOf(REHYDRATION_MARKER);
	if (markerStart < 0) {
		throw new Error('LinkedIn search page did not include rehydration data');
	}
	const dataStart = html.indexOf('[', markerStart);
	const dataEnd = html.indexOf('</script>', dataStart);
	if (dataStart < 0 || dataEnd < 0) {
		throw new Error('LinkedIn search page contained incomplete rehydration data');
	}

	let chunks: unknown;
	try {
		chunks = JSON.parse(html.slice(dataStart, dataEnd));
	} catch {
		throw new Error('LinkedIn search page contained invalid rehydration data');
	}
	if (!Array.isArray(chunks)) {
		throw new Error('LinkedIn search page rehydration data was not an array');
	}

	const records = new Map<string, FlightRecord>();
	for (const chunk of chunks) {
		if (typeof chunk !== 'string') {
			continue;
		}
		for (const line of chunk.split('\n')) {
			const separator = line.indexOf(':');
			if (separator <= 0) {
				continue;
			}
			const id = line.slice(0, separator);
			if (!RECORD_ID_REGEX.test(id)) {
				continue;
			}
			try {
				records.set(id, JSON.parse(line.slice(separator + 1)));
			} catch {
				// React Flight also carries import and binary records. Only JSON values
				// are needed to rebuild the visible search result cards.
			}
		}
	}
	return records;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFeedUpdate(value: unknown): boolean {
	const serialized = JSON.stringify(value);
	return serialized.includes('"role":"listitem"') && serialized.includes('"viewName":"feed-full-update"');
}

function collectMetadataStrings(
	value: unknown,
	records: Map<string, FlightRecord>,
	out: string[],
	visited = new Set<object>(),
	visitedReferences = new Set<string>(),
): void {
	if (typeof value === 'string') {
		const reference = RECORD_REFERENCE_REGEX.exec(value)?.[1];
		if (reference && records.has(reference) && !visitedReferences.has(reference)) {
			visitedReferences.add(reference);
			collectMetadataStrings(records.get(reference), records, out, visited, visitedReferences);
			return;
		}
		out.push(value);
		return;
	}
	if (!value || typeof value !== 'object' || visited.has(value)) {
		return;
	}
	visited.add(value);
	for (const child of Object.values(value)) {
		collectMetadataStrings(child, records, out, visited, visitedReferences);
	}
}

function findCommentaryChildren(value: unknown, visited = new Set<object>()): unknown {
	if (!value || typeof value !== 'object' || visited.has(value)) {
		return undefined;
	}
	visited.add(value);
	if (isRecord(value)) {
		const tracking = value.viewTrackingSpecs;
		if (isRecord(tracking) && tracking.viewName === 'feed-commentary') {
			return value.children;
		}
	}
	for (const child of Object.values(value)) {
		const match = findCommentaryChildren(child, visited);
		if (match !== undefined) {
			return match;
		}
	}
	return undefined;
}

function collectRenderedText(
	value: unknown,
	records: Map<string, FlightRecord>,
	out: string[],
	visitedReferences = new Set<string>(),
): void {
	if (typeof value === 'string') {
		const reference = RECORD_REFERENCE_REGEX.exec(value)?.[1];
		if (reference && records.has(reference) && !visitedReferences.has(reference)) {
			const nextVisited = new Set(visitedReferences);
			nextVisited.add(reference);
			collectRenderedText(records.get(reference), records, out, nextVisited);
			return;
		}
		if (!value.startsWith('$') && value.trim()) {
			out.push(value.trim());
		}
		return;
	}
	if (Array.isArray(value)) {
		if (value[0] === '$' && value.length >= 4) {
			collectRenderedText(value[3], records, out, visitedReferences);
			return;
		}
		for (const child of value) {
			collectRenderedText(child, records, out, visitedReferences);
		}
		return;
	}
	if (!isRecord(value)) {
		return;
	}
	if ('children' in value) {
		collectRenderedText(value.children, records, out, visitedReferences);
		return;
	}
	if (isRecord(value.textProps) && 'children' in value.textProps) {
		collectRenderedText(value.textProps.children, records, out, visitedReferences);
	}
}

function postUrn(strings: string[], url: string | undefined): string | undefined {
	for (const value of strings) {
		const match = ACTIVITY_URN_REGEX.exec(value);
		if (match) {
			return `urn:li:activity:${match[1]}`;
		}
	}
	const urlMatch = url ? POST_URL_ID_REGEX.exec(url) : undefined;
	if (!urlMatch) {
		return undefined;
	}
	const type = urlMatch[1].toLowerCase() === 'ugcpost' ? 'ugcPost' : urlMatch[1].toLowerCase();
	return `urn:li:${type}:${urlMatch[2]}`;
}

function snowflakeDate(urn: string): string | undefined {
	const id = /:(\d+)$/.exec(urn)?.[1];
	if (!id) {
		return undefined;
	}
	try {
		const timestamp = Number(BigInt(id) >> 22n);
		const date = new Date(timestamp);
		return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
	} catch {
		return undefined;
	}
}

function normalizeCard(card: FlightRecord, records: Map<string, FlightRecord>): SearchItem | undefined {
	const metadata: string[] = [];
	collectMetadataStrings(card, records, metadata);
	const url = metadata.find((value) => POST_URL_REGEX.test(value));
	const authorUrl = metadata.find((value) => AUTHOR_URL_REGEX.test(value));
	const urn = postUrn(metadata, url);
	if (!urn) {
		return undefined;
	}

	const textParts: string[] = [];
	collectRenderedText(findCommentaryChildren(card), records, textParts);
	const text = textParts
		.filter((part, index) => textParts.indexOf(part) === index)
		.join(' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!text) {
		return undefined;
	}

	const authorLabel = metadata.find((value) => value.startsWith(AUTHOR_LABEL));
	const author = authorLabel?.slice(AUTHOR_LABEL.length).trim() || undefined;
	return {
		id: urn,
		urn,
		url: url ?? `https://www.linkedin.com/feed/update/${urn}/`,
		text,
		author,
		authorUrl,
		publishedAt: snowflakeDate(urn),
	};
}

/** Parse the server-rendered React Flight records used by LinkedIn's current post search. */
export function parseLinkedInSearchPage(html: string, limit: number): SearchItem[] {
	const records = parseFlightRecords(html);
	const items: SearchItem[] = [];
	const seen = new Set<string>();
	for (const card of records.values()) {
		if (items.length >= limit || !isFeedUpdate(card)) {
			continue;
		}
		const item = normalizeCard(card, records);
		if (!item || seen.has(item.id)) {
			continue;
		}
		seen.add(item.id);
		items.push(item);
	}
	return items;
}
