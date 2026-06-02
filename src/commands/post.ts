import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import type { CliContext, MediaSpec } from '../cli/shared.js';
import { formatPostUrlLine } from '../lib/output.js';
import { LinkedInClient } from '../linkedin/client.js';
import { MAX_POST_CHARS } from '../linkedin/constants.js';
import type { CommentsScope, Visibility } from '../linkedin/types.js';

function parseVisibility(value: string | undefined, ctx: CliContext): Visibility {
	if (value === undefined) {
		return 'anyone';
	}
	const normalized = value.trim().toLowerCase();
	if (normalized === 'anyone' || normalized === 'public') {
		return 'anyone';
	}
	if (normalized === 'connections') {
		return 'connections';
	}
	console.error(`${ctx.p('err')}Invalid --visibility "${value}". Allowed: anyone, connections.`);
	process.exit(1);
}

function parseCommentsScope(value: string | undefined, ctx: CliContext): CommentsScope {
	if (value === undefined) {
		return 'all';
	}
	const normalized = value.trim().toLowerCase();
	if (normalized === 'all' || normalized === 'connections' || normalized === 'none') {
		return normalized;
	}
	console.error(`${ctx.p('err')}Invalid --comments-scope "${value}". Allowed: all, connections, none.`);
	process.exit(1);
}

async function uploadImagesOrExit(client: LinkedInClient, media: MediaSpec[], ctx: CliContext): Promise<string[]> {
	const urns: string[] = [];
	for (const item of media) {
		const res = await client.uploadImage({
			data: item.buffer,
			mimeType: item.mime,
			filename: item.filename,
			alt: item.alt,
		});
		if (!res.success || !res.mediaUrn) {
			console.error(`${ctx.p('err')}Image upload failed for ${item.path}: ${res.error ?? 'Unknown error'}`);
			process.exit(1);
		}
		urns.push(res.mediaUrn);
	}
	return urns;
}

export function registerPostCommand(parent: Command, ctx: CliContext, root?: Command): void {
	const optsSource = root ?? parent;
	parent
		.command('post')
		.description('Publish a post to your LinkedIn feed')
		.argument('[text]', 'Post text (or use --file)')
		.option('-f, --file <path>', 'Read post body from a file')
		.option('-v, --visibility <scope>', 'Who can see it: anyone (default) or connections')
		.option('--comments-scope <scope>', 'Who can comment: all (default), connections, none')
		.option('--json', 'Output the result as JSON')
		.option('--json-full', 'Output result JSON including the raw API response')
		.action(
			async (
				textArg: string | undefined,
				cmdOpts: { file?: string; visibility?: string; commentsScope?: string; json?: boolean; jsonFull?: boolean },
			) => {
				const opts = optsSource.opts();
				const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
				const visibility = parseVisibility(cmdOpts.visibility, ctx);
				const commentsScope = parseCommentsScope(cmdOpts.commentsScope, ctx);

				let body = textArg;
				if (cmdOpts.file) {
					try {
						body = await readFile(cmdOpts.file, 'utf8');
					} catch (error) {
						console.error(`${ctx.p('err')}Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
						process.exit(1);
					}
				}
				if (!body || body.trim().length === 0) {
					console.error(`${ctx.p('err')}Post body is empty. Provide <text> or --file <path>.`);
					process.exit(1);
				}
				if (body.length > MAX_POST_CHARS) {
					console.error(`${ctx.p('err')}Post is ${body.length} chars; LinkedIn limit is ${MAX_POST_CHARS}.`);
					process.exit(1);
				}

				let media: MediaSpec[] = [];
				try {
					media = ctx.loadMedia({ media: opts.media ?? [], alts: opts.alt ?? [] });
				} catch (error) {
					console.error(`${ctx.p('err')}${error instanceof Error ? error.message : String(error)}`);
					process.exit(1);
				}

				const { cookies, warnings } = await ctx.resolveCredentialsFromOptions(opts);
				for (const warning of warnings) {
					console.error(`${ctx.p('warn')}${warning}`);
				}
				if (!cookies.liAt || !cookies.jsessionId) {
					console.error(`${ctx.p('err')}Missing required credentials`);
					process.exit(1);
				}
				if (cookies.source) {
					console.error(`${ctx.l('source')}${cookies.source}`);
				}

				const client = new LinkedInClient({ cookies, timeoutMs });
				if (media.length > 0) {
					console.error(`${ctx.p('info')}Uploading ${media.length} image(s)…`);
				}
				const mediaUrns = await uploadImagesOrExit(client, media, ctx);
				console.error(`${ctx.p('info')}Posting (${body.length} chars)…`);
				const result = await client.createPost(body, { visibility, commentsScope, mediaUrns });

				if (cmdOpts.json || cmdOpts.jsonFull) {
					const out: Record<string, unknown> = { success: result.success, urn: result.urn ?? null, error: result.error ?? null };
					if (cmdOpts.jsonFull) {
						out._raw = result.raw ?? null;
					}
					console.log(JSON.stringify(out, null, 2));
					if (!result.success) {
						process.exit(1);
					}
					return;
				}

				if (result.success) {
					console.log(`${ctx.p('ok')}Post published!`);
					console.log(formatPostUrlLine(result.urn, ctx.getOutput()));
				} else {
					console.error(`${ctx.p('err')}Failed to post: ${result.error}`);
					process.exit(1);
				}
			},
		);
}
