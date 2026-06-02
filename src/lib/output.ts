export type OutputConfig = {
	plain: boolean;
	emoji: boolean;
	color: boolean;
	hyperlinks: boolean;
};

export type StatusKind = 'ok' | 'warn' | 'err' | 'info' | 'hint';
export type LabelKind = 'url' | 'source' | 'user' | 'userId' | 'credentials';

const STATUS: Record<StatusKind, { emoji: string; text: string; plain: string }> = {
	ok: { emoji: '✅', text: 'OK:', plain: '[ok]' },
	warn: { emoji: '⚠️', text: 'Warning:', plain: '[warn]' },
	err: { emoji: '❌', text: 'Error:', plain: '[err]' },
	info: { emoji: 'ℹ️', text: 'Info:', plain: '[info]' },
	hint: { emoji: 'ℹ️', text: 'Hint:', plain: '[hint]' },
};

const LABELS: Record<LabelKind, { emoji: string; text: string; plain: string }> = {
	url: { emoji: '🔗', text: 'URL:', plain: 'url:' },
	source: { emoji: '📍', text: 'Source:', plain: 'source:' },
	user: { emoji: '🙋', text: 'User:', plain: 'user:' },
	userId: { emoji: '🪪', text: 'User ID:', plain: 'user_id:' },
	credentials: { emoji: '🔑', text: 'Credentials:', plain: 'credentials:' },
};

export function resolveOutputConfigFromArgv(argv: string[], env: NodeJS.ProcessEnv, isTty: boolean): OutputConfig {
	const hasNoColorEnv = Object.hasOwn(env, 'NO_COLOR') || env.TERM === 'dumb';
	const defaultColor = isTty && !hasNoColorEnv;
	const plain = argv.includes('--plain');
	const emoji = !plain && !argv.includes('--no-emoji');
	const color = !plain && !argv.includes('--no-color') && defaultColor;
	const hyperlinks = !plain && isTty;
	return { plain, emoji, color, hyperlinks };
}

export function resolveOutputConfigFromCommander(
	opts: { plain?: boolean; emoji?: boolean; color?: boolean },
	env: NodeJS.ProcessEnv,
	isTty: boolean,
): OutputConfig {
	const hasNoColorEnv = Object.hasOwn(env, 'NO_COLOR') || env.TERM === 'dumb';
	const defaultColor = isTty && !hasNoColorEnv;
	const plain = Boolean(opts.plain);
	const emoji = !plain && (opts.emoji ?? true);
	const color = !plain && (opts.color ?? true) && defaultColor;
	const hyperlinks = !plain && isTty;
	return { plain, emoji, color, hyperlinks };
}

export function statusPrefix(kind: StatusKind, cfg: OutputConfig): string {
	if (cfg.plain) {
		return `${STATUS[kind].plain} `;
	}
	if (cfg.emoji) {
		return `${STATUS[kind].emoji} `;
	}
	return `${STATUS[kind].text} `;
}

export function labelPrefix(kind: LabelKind, cfg: OutputConfig): string {
	if (cfg.plain) {
		return `${LABELS[kind].plain} `;
	}
	if (cfg.emoji) {
		return `${LABELS[kind].emoji} `;
	}
	return `${LABELS[kind].text} `;
}

/**
 * Wraps a URL in OSC 8 escape sequences to make it clickable in supported terminals.
 * Falls back to plain text when not in a TTY or when hyperlinks are disabled.
 */
export function hyperlink(url: string, text?: string, cfg?: OutputConfig): string {
	const displayText = text ?? url;
	if (!cfg?.hyperlinks) {
		return displayText;
	}
	const safeUrl = url.replaceAll('\x1b', '').replaceAll('\x07', '');
	const safeText = displayText.replaceAll('\x1b', '').replaceAll('\x07', '');
	return `\x1b]8;;${safeUrl}\x07${safeText}\x1b]8;;\x07`;
}

export function formatPostUrl(urn: string): string {
	return `https://www.linkedin.com/feed/update/${urn}/`;
}

export function formatPostUrlLine(urn: string | undefined, cfg: OutputConfig): string {
	if (!urn) {
		return `${labelPrefix('url', cfg)}(post URL unavailable — check your LinkedIn feed)`;
	}
	const url = formatPostUrl(urn);
	return `${labelPrefix('url', cfg)}${hyperlink(url, url, cfg)}`;
}
