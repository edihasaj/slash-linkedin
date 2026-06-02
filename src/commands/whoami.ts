import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { LinkedInClient } from '../linkedin/client.js';

export function registerWhoamiCommand(program: Command, ctx: CliContext): void {
	program
		.command('whoami')
		.description('Show which LinkedIn account the current credentials belong to')
		.option('--json', 'Output as JSON')
		.action(async (cmdOpts: { json?: boolean }) => {
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
			const client = new LinkedInClient({ cookies, timeoutMs });
			const result = await client.getCurrentUser();
			if (!result.success || !result.user) {
				console.error(`${ctx.p('err')}Failed to determine current user: ${result.error ?? 'Unknown error'}`);
				process.exit(1);
			}
			if (cmdOpts.json) {
				console.log(JSON.stringify(result.user, null, 2));
				return;
			}
			const user = result.user;
			const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
			const credentialSource = cookies.source ?? 'env/auto-detected cookies';
			console.log(`${ctx.l('user')}${name || '(name unavailable)'}${user.publicIdentifier ? ` (@${user.publicIdentifier})` : ''}`);
			if (user.headline) {
				console.log(`   ${user.headline}`);
			}
			console.log(`${ctx.l('userId')}${user.id}`);
			if (user.publicIdentifier) {
				console.log(`${ctx.l('url')}https://www.linkedin.com/in/${user.publicIdentifier}/`);
			}
			console.log(`${ctx.l('credentials')}${credentialSource}`);
		});
}
