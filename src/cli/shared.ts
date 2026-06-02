import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';
import JSON5 from 'json5';
import kleur from 'kleur';
import { type CookieSource, resolveCredentials } from '../lib/cookies.js';
import {
	labelPrefix,
	type OutputConfig,
	resolveOutputConfigFromArgv,
	resolveOutputConfigFromCommander,
	statusPrefix,
} from '../lib/output.js';

export type SlashConfig = {
	chromeProfile?: string;
	chromeProfileDir?: string;
	firefoxProfile?: string;
	cookieSource?: CookieSource | CookieSource[];
	cookieTimeoutMs?: number;
	timeoutMs?: number;
};

export type MediaSpec = {
	path: string;
	filename: string;
	alt?: string;
	mime: string;
	buffer: Buffer;
};

export type CliContext = {
	isTty: boolean;
	getOutput: () => OutputConfig;
	colors: {
		banner: (t: string) => string;
		subtitle: (t: string) => string;
		section: (t: string) => string;
		command: (t: string) => string;
		option: (t: string) => string;
		argument: (t: string) => string;
		description: (t: string) => string;
		muted: (t: string) => string;
		accent: (t: string) => string;
	};
	p: (kind: Parameters<typeof statusPrefix>[0]) => string;
	l: (kind: Parameters<typeof labelPrefix>[0]) => string;
	config: SlashConfig;
	applyOutputFromCommand: (command: Command) => void;
	resolveTimeoutFromOptions: (options: { timeout?: string | number }) => number | undefined;
	resolveCredentialsFromOptions: (opts: CredentialsOptions) => ReturnType<typeof resolveCredentials>;
	loadMedia: (opts: { media: string[]; alts: string[] }) => MediaSpec[];
};

export type CredentialsOptions = {
	liAt?: string;
	jsessionid?: string;
	chromeProfile?: string;
	chromeProfileDir?: string;
	firefoxProfile?: string;
	cookieSource?: CookieSource[];
	cookieTimeout?: string | number;
};

const COOKIE_SOURCES: CookieSource[] = ['safari', 'chrome', 'edge', 'firefox'];

function parseCookieSource(value: string): CookieSource {
	const normalized = value.trim().toLowerCase();
	if (normalized === 'safari' || normalized === 'chrome' || normalized === 'edge' || normalized === 'firefox') {
		return normalized;
	}
	throw new Error(`Invalid --cookie-source "${value}". Allowed: safari, chrome, edge, firefox.`);
}

export const collectCookieSource = (value: string, previous: CookieSource[] = []): CookieSource[] => {
	previous.push(parseCookieSource(value));
	return previous;
};

function resolveCookieSourceOrder(input: unknown): CookieSource[] | undefined {
	if (typeof input === 'string') {
		return [parseCookieSource(input)];
	}
	if (Array.isArray(input)) {
		const result: CookieSource[] = [];
		for (const entry of input) {
			if (typeof entry === 'string') {
				result.push(parseCookieSource(entry));
			}
		}
		return result.length > 0 ? result : undefined;
	}
	return undefined;
}

function resolveTimeoutMs(...values: Array<string | number | undefined | null>): number | undefined {
	for (const value of values) {
		if (value === undefined || value === null || value === '') {
			continue;
		}
		const parsed = typeof value === 'number' ? value : Number(value);
		if (Number.isFinite(parsed) && parsed > 0) {
			return parsed;
		}
	}
	return undefined;
}

function detectMime(path: string): string | null {
	const ext = path.toLowerCase();
	if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) {
		return 'image/jpeg';
	}
	if (ext.endsWith('.png')) {
		return 'image/png';
	}
	if (ext.endsWith('.webp')) {
		return 'image/webp';
	}
	if (ext.endsWith('.gif')) {
		return 'image/gif';
	}
	return null;
}

function readConfigFile(path: string, warn: (message: string) => void): SlashConfig {
	if (!existsSync(path)) {
		return {};
	}
	try {
		const raw = readFileSync(path, 'utf8');
		return JSON5.parse(raw) ?? {};
	} catch (error) {
		warn(`Failed to parse config at ${path}: ${error instanceof Error ? error.message : String(error)}`);
		return {};
	}
}

function loadConfig(warn: (message: string) => void): SlashConfig {
	const globalPath = join(homedir(), '.config', 'slash-linkedin', 'config.json5');
	const localPath = join(process.cwd(), '.slashrc-linkedin.json5');
	return {
		...readConfigFile(globalPath, warn),
		...readConfigFile(localPath, warn),
	};
}

export function createCliContext(normalizedArgs: string[], env: NodeJS.ProcessEnv = process.env): CliContext {
	const isTty = Boolean(process.stdout.isTTY);
	let output = resolveOutputConfigFromArgv(normalizedArgs, env, isTty);
	kleur.enabled = output.color;
	const wrap = (styler: (text: string) => string) => (text: string): string => (isTty ? styler(text) : text);
	const colors = {
		banner: wrap((t) => kleur.bold().blue(t)),
		subtitle: wrap((t) => kleur.dim(t)),
		section: wrap((t) => kleur.bold().white(t)),
		command: wrap((t) => kleur.bold().cyan(t)),
		option: wrap((t) => kleur.cyan(t)),
		argument: wrap((t) => kleur.magenta(t)),
		description: wrap((t) => kleur.white(t)),
		muted: wrap((t) => kleur.gray(t)),
		accent: wrap((t) => kleur.green(t)),
	};
	const p = (kind: Parameters<typeof statusPrefix>[0]): string => {
		const prefix = statusPrefix(kind, output);
		if (output.plain || !output.color) {
			return prefix;
		}
		if (kind === 'ok') return kleur.green(prefix);
		if (kind === 'warn') return kleur.yellow(prefix);
		if (kind === 'err') return kleur.red(prefix);
		if (kind === 'info') return kleur.cyan(prefix);
		return kleur.gray(prefix);
	};
	const l = (kind: Parameters<typeof labelPrefix>[0]): string => {
		const prefix = labelPrefix(kind, output);
		if (output.plain || !output.color) {
			return prefix;
		}
		if (kind === 'url') return kleur.cyan(prefix);
		if (kind === 'source') return kleur.gray(prefix);
		if (kind === 'user') return kleur.cyan(prefix);
		if (kind === 'userId') return kleur.magenta(prefix);
		if (kind === 'credentials') return kleur.yellow(prefix);
		return kleur.gray(prefix);
	};
	const config = loadConfig((message) => {
		console.error(colors.muted(`${p('warn')}${message}`));
	});

	function applyOutputFromCommand(command: Command): void {
		const opts = command.optsWithGlobals();
		output = resolveOutputConfigFromCommander(opts, env, isTty);
		kleur.enabled = output.color;
	}
	function resolveTimeoutFromOptions(options: { timeout?: string | number }): number | undefined {
		return resolveTimeoutMs(options.timeout, config.timeoutMs, env.SLASH_LINKEDIN_TIMEOUT_MS);
	}
	function resolveCookieTimeoutFromOptions(options: { cookieTimeout?: string | number }): number | undefined {
		return resolveTimeoutMs(options.cookieTimeout, config.cookieTimeoutMs, env.SLASH_LINKEDIN_COOKIE_TIMEOUT_MS);
	}
	function resolveCredentialsFromOptions(opts: CredentialsOptions): ReturnType<typeof resolveCredentials> {
		const cookieSource = opts.cookieSource?.length
			? opts.cookieSource
			: (resolveCookieSourceOrder(config.cookieSource) ?? COOKIE_SOURCES);
		const chromeProfile = opts.chromeProfileDir || opts.chromeProfile || config.chromeProfileDir || config.chromeProfile;
		return resolveCredentials({
			liAt: opts.liAt,
			jsessionId: opts.jsessionid,
			cookieSource,
			chromeProfile,
			firefoxProfile: opts.firefoxProfile || config.firefoxProfile,
			cookieTimeoutMs: resolveCookieTimeoutFromOptions(opts),
		});
	}
	function loadMedia(opts: { media: string[]; alts: string[] }): MediaSpec[] {
		if (opts.media.length === 0) {
			return [];
		}
		const specs: MediaSpec[] = [];
		for (const [index, path] of opts.media.entries()) {
			const mime = detectMime(path);
			if (!mime) {
				throw new Error(`Unsupported media type for ${path}. Supported: jpg, jpeg, png, webp, gif`);
			}
			const buffer = readFileSync(path);
			specs.push({ path, filename: basename(path), mime, buffer, alt: opts.alts[index] });
		}
		if (specs.length > 9) {
			throw new Error('LinkedIn allows at most 9 images per post');
		}
		return specs;
	}

	return {
		isTty,
		getOutput: () => output,
		colors,
		p,
		l,
		config,
		applyOutputFromCommand,
		resolveTimeoutFromOptions,
		resolveCredentialsFromOptions,
		loadMedia,
	};
}
