import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';

export function registerCheckCommand(program: Command, ctx: CliContext): void {
	program
		.command('check')
		.description('Check credential availability')
		.action(async () => {
			const opts = program.opts();
			const { cookies, warnings } = await ctx.resolveCredentialsFromOptions(opts);
			console.log(`${ctx.p('info')}Credential check`);
			console.log('─'.repeat(40));
			if (cookies.liAt) {
				console.log(`${ctx.p('ok')}li_at: ${cookies.liAt.slice(0, 10)}...`);
			} else {
				console.log(`${ctx.p('err')}li_at: not found`);
			}
			if (cookies.jsessionId) {
				console.log(`${ctx.p('ok')}JSESSIONID: ${cookies.jsessionId.slice(0, 12)}...`);
			} else {
				console.log(`${ctx.p('err')}JSESSIONID: not found`);
			}
			if (cookies.source) {
				console.log(`${ctx.l('source')}${cookies.source}`);
			}
			if (warnings.length > 0) {
				console.log(`\n${ctx.p('warn')}Warnings:`);
				for (const warning of warnings) {
					console.log(`   - ${warning}`);
				}
			}
			if (cookies.liAt && cookies.jsessionId) {
				console.log(`\n${ctx.p('ok')}Ready to post!`);
			} else {
				console.log(`\n${ctx.p('err')}Missing credentials. Options:`);
				console.log('   1. Login to linkedin.com in Safari/Chrome/Edge/Firefox');
				console.log('   2. Set LI_AT and JSESSIONID environment variables');
				console.log('   3. Use --li-at and --jsessionid flags');
				process.exit(1);
			}
		});
}
