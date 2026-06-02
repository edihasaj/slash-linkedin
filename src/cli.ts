#!/usr/bin/env node
/**
 * slash-linkedin - CLI tool for posting to LinkedIn from the command line
 *
 * Usage:
 *   slash-linkedin post "Hello LinkedIn!"
 *   slash-linkedin "Hello LinkedIn!"          (bare text → post)
 *   slash-linkedin whoami
 *   slash-linkedin check
 */
import { createProgram, KNOWN_COMMANDS } from './cli/program.js';
import { createCliContext } from './cli/shared.js';
import { resolveCliInvocation } from './lib/cli-args.js';

const rawArgs = process.argv.slice(2);
const normalizedArgs = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const ctx = createCliContext(normalizedArgs);
const program = createProgram(ctx);
const { argv, showHelp } = resolveCliInvocation(normalizedArgs, KNOWN_COMMANDS);

if (showHelp) {
	program.outputHelp();
	process.exit(0);
}

if (argv) {
	program.parse(argv);
} else {
	program.parse(['node', 'slash-linkedin', ...normalizedArgs]);
}
