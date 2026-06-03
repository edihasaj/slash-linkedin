import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
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

export function registerRepostCommand(parent: Command, ctx: CliContext, root?: Command): void {
	const optsSource = root ?? parent;
	parent
		.command('repost')
		.aliases(['reshare'])
		.description('Repost (reshare) a post; add text for a "repost with your thoughts"')
		.argument('<post>', 'Post URL or urn (share/ugcPost/activity)')
		.argument('[text]', 'Optional commentary — present means "repost with your thoughts"')
		.option('-v, --visibility <scope>', 'Who can see it: anyone (default) or connections')
		.option('--comments-scope <scope>', 'Who can comment: all (default), connections, none')
		.option('--dry-run', 'Resolve the target and print the request without sending it')
		.option('--json', 'Output the result as JSON')
		.option('--json-full', 'Output result JSON including the raw API response')
		.action(
			async (
				postArg: string,
				textArg: string | undefined,
				cmdOpts: {
					visibility?: string;
					commentsScope?: string;
					dryRun?: boolean;
					json?: boolean;
					jsonFull?: boolean;
				},
			) => {
				const opts = optsSource.opts();
				const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
				const visibility = parseVisibility(cmdOpts.visibility, ctx);
				const commentsScope = parseCommentsScope(cmdOpts.commentsScope, ctx);
				const text = textArg?.trim() ? textArg : undefined;

				if (text && text.length > MAX_POST_CHARS) {
					console.error(`${ctx.p('err')}Commentary is ${text.length} chars; LinkedIn limit is ${MAX_POST_CHARS}.`);
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

				if (cmdOpts.dryRun) {
					const resolved = await client.resolveContentUrn(postArg);
					if (!resolved.success || !resolved.urn) {
						console.error(`${ctx.p('err')}${resolved.error}`);
						process.exit(1);
					}
					const plan = {
						mode: text ? 'repost-with-thoughts' : 'instant-repost',
						contentUrn: resolved.urn,
						text: text ?? null,
						visibility,
						commentsScope,
					};
					console.log(`${ctx.p('info')}Dry run — nothing sent.`);
					console.log(JSON.stringify(plan, null, 2));
					return;
				}

				console.error(`${ctx.p('info')}${text ? 'Reposting with your thoughts' : 'Reposting'}…`);
				const result = await client.reshare(postArg, { text, visibility, commentsScope });

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
					console.log(`${ctx.p('ok')}Reposted!`);
					console.log(formatPostUrlLine(result.urn, ctx.getOutput()));
				} else {
					console.error(`${ctx.p('err')}Failed to repost: ${result.error}`);
					process.exit(1);
				}
			},
		);
}
