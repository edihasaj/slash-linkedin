# slash-linkedin

Local LinkedIn CLI for posting to your feed from the command line — a sibling of
[`slash-x`](https://github.com/edihasaj/slash-x), built the same way.

It authenticates with the LinkedIn cookies already in your browser (`li_at` +
`JSESSIONID`) and talks to LinkedIn's internal voyager API. No LinkedIn developer
app, OAuth dance, or API approval needed.

> ⚠️ This uses LinkedIn's private/internal API (the same one the website uses).
> It's for personal automation of **your own** account. Use responsibly.

## Install

```bash
pnpm install
pnpm build
# then run via:
node dist/cli.js --help
# or link it onto your PATH:
npm link   # exposes `slash-linkedin` and the short `sli` alias
```

## Auth

`slash-linkedin` resolves credentials in this order:

1. CLI flags: `--li-at <token> --jsessionid <token>`
2. Env vars: `LI_AT` / `LINKEDIN_LI_AT` and `JSESSIONID` / `LINKEDIN_JSESSIONID`
3. Browser cookies (auto-detected): Safari → Chrome → Edge → Firefox

The `JSESSIONID` cookie is stored as `"ajax:1234..."`; the CSRF token is that
value with the surrounding quotes stripped — `slash-linkedin` handles this for you.

Verify what it can see:

```bash
slash-linkedin check
slash-linkedin whoami
```

If browser extraction fails (e.g. Chrome keychain prompts on macOS), grab the two
cookies from DevTools → Application → Cookies → `https://www.linkedin.com`, then:

```bash
export LI_AT="...."
export JSESSIONID='"ajax:...."'
slash-linkedin whoami
```

## Post

```bash
# plain text
slash-linkedin post "Shipping slash-linkedin 🚀"

# bare text is treated as a post
slash-linkedin "hello from the CLI"

# from a file, visible to connections only
slash-linkedin post --file note.md --visibility connections

# limit who can comment
slash-linkedin post "thoughts?" --comments-scope connections

# attach images (up to 9)
slash-linkedin post "look at this" --media shot.png --media chart.png

# machine-readable result
slash-linkedin post "hi" --json
```

### Options

| Flag | Description |
| --- | --- |
| `-f, --file <path>` | Read post body from a file |
| `-v, --visibility <scope>` | `anyone` (default) or `connections` |
| `--comments-scope <scope>` | `all` (default), `connections`, `none` |
| `--media <path>` | Attach an image (repeatable, up to 9) |
| `--alt <text>` | Alt text for the matching `--media` |
| `--json` / `--json-full` | JSON output (`--json-full` includes the raw API response) |

Posts are capped at 3000 characters (LinkedIn's limit).

## Repost

```bash
# Instant repost (alias: reshare) — accepts a post URL or any share/ugcPost/activity urn
slash-linkedin repost "https://www.linkedin.com/posts/<slug>-activity-1234567890-abcd"

# Repost with your thoughts — add commentary
slash-linkedin repost "https://www.linkedin.com/feed/update/urn:li:activity:1234567890/" "My take on this."

# Preview the resolved target + request without sending
slash-linkedin repost <post-url> --dry-run
```

Activity URLs (the kind you get from "Copy link to post") are resolved to the underlying
share/ugcPost urn automatically via a read-only lookup. Commentary respects `--visibility`
and `--comments-scope`, same as `post`.

> Note: reshares go through LinkedIn's `voyager` GraphQL endpoints, whose query IDs rotate
> with the web client. If a repost starts failing with a 400/GraphQL error, the IDs in
> `src/linkedin/constants.ts` need re-capturing.

## Comment

```bash
# comment on an existing post (URL or urn:li:activity:<id>)
slash-linkedin comment "https://www.linkedin.com/feed/update/urn:li:activity:7338…/" "Great point!"

# from a file, machine-readable
slash-linkedin comment urn:li:activity:7338… --file reply.md --json
```

Accepts a full post URL (`/feed/update/…` or `/posts/…-activity-<id>-…`), a bare
`urn:li:activity:<id>`, or just the numeric id.

## Search

```bash
slash-linkedin search "looking for crm" --count 10 --json
```

Returns normalized post items (`urn`, `url`, `text`, author/date/stats when
LinkedIn includes them), suitable for automation through slash-bridge.

## Commands

| Command | Description |
| --- | --- |
| `post [text]` | Publish a post to your feed |
| `repost <post> [text]` | Repost a post (alias: `reshare`); add text for a quote repost |
| `comment <post> [text]` | Comment on an existing post (URL or activity urn) |
| `search <query>` | Search LinkedIn posts |
| `whoami` | Show the logged-in LinkedIn account |
| `check` | Check credential availability |

## Config

Reads JSON5 from `~/.config/slash-linkedin/config.json5` and
`./.slashrc-linkedin.json5`:

```json5
{
  // pick a specific browser / profile for cookie extraction
  cookieSource: ["chrome"],
  chromeProfile: "Default",
  firefoxProfile: "default-release",
  cookieTimeoutMs: 30000,
  timeoutMs: 30000,
}
```

Env knobs: `LI_AT`, `JSESSIONID`, `NO_COLOR`, `SLASH_LINKEDIN_TIMEOUT_MS`,
`SLASH_LINKEDIN_COOKIE_TIMEOUT_MS`.

## License

MIT © Edi Hasaj
