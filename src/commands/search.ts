import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { LinkedInClient } from '../linkedin/client.js';

function parseCount(value: string | undefined): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return 10;
	}
	return Math.max(1, Math.min(Math.floor(parsed), 50));
}

export function registerSearchCommand(program: Command, ctx: CliContext): void {
	program
		.command('search')
		.description('Search LinkedIn posts')
		.argument('<query>', 'Search query')
		.option('-c, --count <n>', 'Maximum posts to return', '10')
		.option('--json', 'Output the result as JSON')
		.option('--json-full', 'Output result JSON including the raw API response')
		.action(async (query: string, cmdOpts: { count?: string; json?: boolean; jsonFull?: boolean }) => {
			const opts = program.opts();
			const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
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
			const count = parseCount(cmdOpts.count);
			const result = await client.searchPosts(query, count);
			const out: Record<string, unknown> = {
				success: result.success,
				items: result.items ?? [],
				total: result.items?.length ?? 0,
				error: result.error ?? null,
			};
			if (cmdOpts.jsonFull) {
				out._raw = result.raw ?? null;
			}
			if (cmdOpts.json || cmdOpts.jsonFull) {
				console.log(JSON.stringify(out, null, 2));
				if (!result.success) {
					process.exit(1);
				}
				return;
			}
			if (!result.success) {
				console.error(`${ctx.p('err')}Search failed: ${result.error}`);
				process.exit(1);
			}
			for (const item of result.items ?? []) {
				console.log(`${item.url}\n${item.text}\n`);
			}
		});
}
