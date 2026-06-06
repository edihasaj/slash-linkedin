import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { formatPostUrl } from '../lib/output.js';
import { LinkedInClient } from '../linkedin/client.js';
import { MAX_POST_CHARS } from '../linkedin/constants.js';

export function registerCommentCommand(parent: Command, ctx: CliContext, root?: Command): void {
	const optsSource = root ?? parent;
	parent
		.command('comment')
		.description('Comment on an existing LinkedIn post')
		.argument('<post>', 'Post URL or urn:li:activity:<id>')
		.argument('[text]', 'Comment text (or use --file)')
		.option('-f, --file <path>', 'Read the comment body from a file')
		.option('--json', 'Output the result as JSON')
		.option('--json-full', 'Output result JSON including the raw API response')
		.action(
			async (
				post: string,
				textArg: string | undefined,
				cmdOpts: { file?: string; json?: boolean; jsonFull?: boolean },
			) => {
				const opts = optsSource.opts();
				const timeoutMs = ctx.resolveTimeoutFromOptions(opts);

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
					console.error(`${ctx.p('err')}Comment body is empty. Provide <text> or --file <path>.`);
					process.exit(1);
				}
				if (body.length > MAX_POST_CHARS) {
					console.error(`${ctx.p('err')}Comment is ${body.length} chars; LinkedIn limit is ${MAX_POST_CHARS}.`);
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
				console.error(`${ctx.p('info')}Commenting (${body.length} chars)…`);
				const result = await client.createComment(post, body);

				if (cmdOpts.json || cmdOpts.jsonFull) {
					const out: Record<string, unknown> = {
						success: result.success,
						urn: result.urn ?? null,
						postUrn: result.postUrn ?? null,
						error: result.error ?? null,
					};
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
					console.log(`${ctx.p('ok')}Comment posted!`);
					if (result.postUrn) {
						console.log(`${ctx.l('url')}${formatPostUrl(result.postUrn)}`);
					}
				} else {
					console.error(`${ctx.p('err')}Failed to comment: ${result.error}`);
					process.exit(1);
				}
			},
		);
}
