# ChatGPT connection

Cadence exposes **https://learning.jrhtechservices.party/mcp/** using authenticated Streamable HTTP. It uses the official TypeScript MCP SDK and a private plugin package in `plugin/cadence/`. ChatGPT performs the teaching; Cadence stores selected learning records. This does not add a separate model running inside the web app and does not require a paid API key.

## Connect

Install the private Cadence plugin, choose Connect, sign in to Cadence and approve the requested learning permissions. Existing browser sign-in can be reused. If adding the MCP server manually, use the endpoint above with OAuth, dynamic client registration and scopes `learning.read learning.write`. No client secret is required.

Try: “Use Cadence to start my first language lesson. Ask what you need to know, then save a summary and five useful phrases after we practise.”

The app’s ChatGPT tab shows connection status and can revoke all ChatGPT access. Library displays saved phrases with meanings hidden until revealed. Progress displays saved lesson summaries. Refresh or revisit a tab after saving in chat.

## Tools

| Tool | Permission | Behaviour |
|---|---|---|
| `get_learning_context` | learning.read | Profile, recent lesson summaries and phrase count |
| `set_learning_profile` | learning.write | Updates language, goal and session length when requested |
| `save_lesson` | learning.write | Adds an idempotent summary of completed practice |
| `get_review_items` | learning.read | Paginated saved phrases, optionally filtered by language |
| `save_review_items` | learning.write | Adds up to 20 chosen phrases; preserves existing entries |

No tool reads credentials, executes commands, fetches arbitrary URLs or deletes learning records. A profile update replaces the current preference fields. Lesson saves reject conflicting reuse of an existing session ID. Review phrases use a language/phrase uniqueness constraint. Review scheduling and formal proficiency assessment remain future work.

## Authorization

The app publishes authorization-server and protected-resource metadata. It supports authorization codes with S256 PKCE, public clients using dynamic registration, exact ChatGPT callback checks and resource-bound scopes. Browser consent is single-use and bound to the live signed-in session. Successful and denied callbacks include the issuer identifier. Codes, access tokens, refresh tokens and consent nonces are hashed in the database. Refresh tokens rotate and replay revokes their grant family. Browser revocation and operator account reset invalidate all OAuth grants.

Only learning records are exposed through tools. No password or browser cookie is shared with ChatGPT. Runtime credentials and OAuth grants are never written to application logs. The existing database and login are preserved by additive table creation.

## Networking

All paths use the existing Cadence hostname and origin. No extra hostname or tunnel change is required when that hostname already forwards all paths to the app. Do not put an interactive edge challenge in front of `/mcp/`, `/oauth/*` or `/.well-known/*`; application authentication protects them. Cloudflare remains operator-managed.

## Verification boundary

Automated tests exercise the full OAuth flow and a real MCP SDK client against an isolated synthetic account, including scope enforcement, PKCE failures, consent binding, duplicate saves, refresh rotation/replay and revocation. Live verification uses public metadata and unauthorized responses only; authenticated use requires the operator’s consent. A saved plugin alone does not mean the user has authenticated it or its tools are available in a particular conversation.
