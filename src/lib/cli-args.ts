export type CliInvocation = {
	argv: string[] | null;
	showHelp: boolean;
};

/**
 * Resolve how to parse the raw CLI args.
 *
 * - No args → show help.
 * - A known command present → let commander parse as-is.
 * - Otherwise, if the first token is a bare value (not a flag), treat the whole
 *   invocation as `post <text>` so `slash-linkedin "hello world"` just works.
 */
export function resolveCliInvocation(rawArgs: string[], knownCommands: Set<string>): CliInvocation {
	if (rawArgs.length === 0) {
		return { argv: null, showHelp: true };
	}
	const hasKnownCommand = rawArgs.some((arg) => knownCommands.has(arg));
	if (hasKnownCommand) {
		return { argv: null, showHelp: false };
	}
	const firstToken = rawArgs[0] ?? '';
	const isHelpOrVersion = ['-h', '--help', '-V', '--version'].includes(firstToken);
	if (!isHelpOrVersion && !firstToken.startsWith('-')) {
		return { argv: ['node', 'slash-linkedin', 'post', ...rawArgs], showHelp: false };
	}
	return { argv: null, showHelp: false };
}
