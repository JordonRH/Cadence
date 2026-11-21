# ChatGPT connection

Cadence exposes **https://learning.jrhtechservices.party/mcp/** using authenticated Streamable HTTP. It uses the official TypeScript MCP SDK and a private plugin package in `plugin/cadence/`. ChatGPT performs the teaching; Cadence stores selected learning records. This does not add a separate model running inside the web app and does not require a paid API key.

## Connect

1. In [ChatGPT Plugins on the web](https://chatgpt.com/plugins), select **+ → Add custom MCP server**. Name it **Cadence** and use `https://learning.jrhtechservices.party/mcp/` with OAuth. ChatGPT can discover the supported client registration methods from Cadence. If asked for scopes, use `learning.read learning.write`. Leave client credentials blank.
2. Choose **Create as a plugin**, sign in to Cadence and approve the learning permissions. Verify that the discovered tools include `get_learning_context`, `save_lesson` and `save_review_items`.
3. Copy the `plugin_asdk_app_…` registration ID from the ChatGPT page URL. Use that registration for the private Cadence release with **Learn with Echo**. The account package must use the registered app connection, either by adding the skill to the eligible app-backed plugin or by linking the verified app ID in `.app.json` via `extensions.com.openai.apps`. The portable `mcp.json` configures the endpoint for compatible clients.
4. Install the finished plugin, start a new chat and select `@Cadence`. Check that it can read the learning profile on web and mobile. Then save one authorised practice record and verify it appears in **Progress** or **Library** before saving a backlog.

OpenAI documents web-only custom server registration and plan limits for custom MCP write actions. The registered plugin still needs to be tested on the intended mobile surface. [ChatGPT connection requirements](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt)

The app’s ChatGPT tab shows connection status and can revoke all ChatGPT access. Library displays saved phrases with meanings hidden until revealed. Progress displays saved lesson summaries. Refresh or revisit a tab after saving in chat.

## Tools

ChatGPT can discover the tool names and schemas before sign-in. Every tool verifies the OAuth token and its required scope before accessing learning data.

| Tool | Permission | Behaviour |
|---|---|---|
| `get_learning_context` | learning.read | Profile, recent lesson summaries and phrase count |
| `set_learning_profile` | learning.write | Updates language, goal and session length when requested |
| `save_lesson` | learning.write | Adds an idempotent summary of completed practice |
| `get_review_items` | learning.read | Paginated saved phrases, optionally filtered by language |
| `save_review_items` | learning.write | Adds up to 20 chosen phrases; preserves existing entries |

No tool reads credentials, executes commands, fetches arbitrary URLs or deletes learning records. A profile update replaces the current preference fields. Lesson saves reject conflicting reuse of an existing session ID. Review phrases use a language/phrase uniqueness constraint. Review scheduling and formal proficiency assessment remain future work.

## Authorization

The app publishes authorization-server and protected-resource metadata. It supports authorization codes with S256 PKCE, public clients using dynamic registration or ChatGPT's stable Client ID Metadata Document (CIMD), exact ChatGPT callback checks and resource-bound scopes. For CIMD, a signed-in authorization request verifies the public document at `https://chatgpt.com/oauth/client.json` over HTTPS and requires the stable ChatGPT callback. Browser consent is single-use and bound to the live signed-in session. Successful and denied callbacks include the issuer identifier. Codes, access tokens, refresh tokens and consent nonces are hashed in the database. Refresh tokens rotate and replay revokes their grant family. Browser revocation and operator account reset invalidate all OAuth grants.

Only learning records are exposed through tools. No password or browser cookie is shared with ChatGPT. Runtime credentials and OAuth grants are never written to application logs. The existing database and login are preserved by additive table creation.

## Networking

All paths use the existing Cadence hostname and origin. No extra hostname or tunnel change is required when that hostname already forwards all paths to the app. Do not put an interactive edge challenge in front of `/mcp/`, `/oauth/*` or `/.well-known/*`; application authentication protects them. Cloudflare remains operator-managed.

## Verification boundary

Automated tests exercise the full OAuth flow and a real MCP SDK client against an isolated synthetic account, including scope enforcement, PKCE failures, consent binding, duplicate saves, refresh rotation/replay and revocation. Live verification uses public metadata and unauthorized responses only; authenticated use requires the operator’s consent. A saved plugin alone does not mean the user has authenticated it or its tools are available in a particular conversation.
