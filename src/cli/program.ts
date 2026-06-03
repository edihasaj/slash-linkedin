import { Command } from 'commander';
import { registerCheckCommand } from '../commands/check.js';
import { registerPostCommand } from '../commands/post.js';
import { registerRepostCommand } from '../commands/repost.js';
import { registerWhoamiCommand } from '../commands/whoami.js';
import { getCliVersion } from '../lib/version.js';
import { type CliContext, collectCookieSource } from './shared.js';

export const KNOWN_COMMANDS: Set<string> = new Set(['post', 'repost', 'reshare', 'whoami', 'check', 'help']);

export function createProgram(ctx: CliContext): Command {
	const program = new Command();
	program.configureHelp({
		showGlobalOptions: true,
		styleTitle: (t) => ctx.colors.section(t),
		styleCommandText: (t) => ctx.colors.command(t),
		styleCommandDescription: (t) => ctx.colors.muted(t),
		styleOptionTerm: (t) => ctx.colors.option(t),
		styleOptionText: (t) => ctx.colors.option(t),
		styleOptionDescription: (t) => ctx.colors.muted(t),
		styleArgumentTerm: (t) => ctx.colors.argument(t),
		styleArgumentText: (t) => ctx.colors.argument(t),
		styleArgumentDescription: (t) => ctx.colors.muted(t),
		styleSubcommandTerm: (t) => ctx.colors.command(t),
		styleSubcommandText: (t) => ctx.colors.command(t),
		styleSubcommandDescription: (t) => ctx.colors.muted(t),
		styleDescriptionText: (t) => ctx.colors.muted(t),
	});

	const collect = (value: string, previous: string[] = []): string[] => {
		previous.push(value);
		return previous;
	};

	program.addHelpText(
		'beforeAll',
		() => `${ctx.colors.banner('slash-linkedin')} ${ctx.colors.muted(getCliVersion())} ${ctx.colors.subtitle("— Edi's local LinkedIn CLI")}`,
	);
	program
		.name('slash-linkedin')
		.description("Edi's local LinkedIn CLI — post to your feed from the command line")
		.version(`slash-linkedin ${getCliVersion()}`, '-V, --version', 'output the version number');

	const formatExample = (command: string, description: string): string =>
		`${ctx.colors.command(`  ${command}`)}\n${ctx.colors.muted(`    ${description}`)}`;

	program.addHelpText(
		'afterAll',
		() =>
			`\n${ctx.colors.section('Examples')}\n${[
				formatExample('slash-linkedin whoami', 'Show the logged-in LinkedIn account'),
				formatExample('slash-linkedin post "Shipping slash-linkedin 🚀"', 'Publish a text post'),
				formatExample('slash-linkedin "hello from the CLI"', 'Bare text is treated as a post'),
				formatExample('slash-linkedin post --file note.md --visibility connections', 'Post a file, visible to connections'),
				formatExample('slash-linkedin post "look at this" --media shot.png', 'Post with an image'),
				formatExample('slash-linkedin repost <post-url>', 'Instantly repost a post (alias: reshare)'),
				formatExample('slash-linkedin repost <post-url> "my take"', 'Repost with your thoughts'),
				formatExample('slash-linkedin check', 'Verify credential availability'),
			].join('\n\n')}\n\n${ctx.colors.section('Config')}\n${ctx.colors.muted(
				`  Reads ${ctx.colors.argument('~/.config/slash-linkedin/config.json5')} and ${ctx.colors.argument('./.slashrc-linkedin.json5')} (JSON5)`,
			)}\n${ctx.colors.muted('  Supports: chromeProfile, chromeProfileDir, firefoxProfile, cookieSource, cookieTimeoutMs, timeoutMs')}\n\n${ctx.colors.section('Env')}\n${ctx.colors.muted(
				`  ${ctx.colors.option('LI_AT')}, ${ctx.colors.option('JSESSIONID')}, ${ctx.colors.option('NO_COLOR')}, ${ctx.colors.option('SLASH_LINKEDIN_TIMEOUT_MS')}, ${ctx.colors.option('SLASH_LINKEDIN_COOKIE_TIMEOUT_MS')}`,
			)}`,
	);

	program
		.option('--li-at <token>', 'LinkedIn li_at cookie')
		.option('--jsessionid <token>', 'LinkedIn JSESSIONID cookie (csrf token)')
		.option('--chrome-profile <name>', 'Chrome profile name for cookie extraction', ctx.config.chromeProfile)
		.option('--chrome-profile-dir <path>', 'Chrome/Chromium profile directory or cookie DB path', ctx.config.chromeProfileDir)
		.option('--firefox-profile <name>', 'Firefox profile name for cookie extraction', ctx.config.firefoxProfile)
		.option('--cookie-timeout <ms>', 'Cookie extraction timeout in milliseconds (keychain/OS helpers)')
		.option('--cookie-source <source>', 'Cookie source: safari, chrome, edge, firefox (repeatable)', collectCookieSource)
		.option('--media <path>', 'Attach an image file (repeatable, up to 9)', collect)
		.option('--alt <text>', 'Alt text for the corresponding --media (repeatable)', collect)
		.option('--timeout <ms>', 'Request timeout in milliseconds')
		.option('--plain', 'Plain output (stable, no emoji, no color)')
		.option('--no-emoji', 'Disable emoji output')
		.option('--no-color', 'Disable ANSI colors (or set NO_COLOR)');

	program.hook('preAction', (_thisCommand, actionCommand) => {
		ctx.applyOutputFromCommand(actionCommand);
	});

	registerPostCommand(program, ctx);
	registerRepostCommand(program, ctx);
	registerWhoamiCommand(program, ctx);
	registerCheckCommand(program, ctx);

	return program;
}
