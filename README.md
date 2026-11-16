# Cadence

A calm place to learn a language. Small steps, useful practice and Echo, a fluffy cartoon baby cheetah companion.

Public address: **https://learning.jrhtechservices.party** (operator-managed networking).

## Current milestone

Working private sign-in, persistent sessions, five themes, saved language/goal/session preferences and an authenticated ChatGPT MCP connection. Practise in ChatGPT and save selected lesson summaries and review phrases; Library and Progress display those records. Echo is your fluffy baby cheetah companion. No notifications, streak penalties, fake progress or default account.

ChatGPT teaching is available through the [private Cadence plugin and MCP connection](docs/chatgpt.md). A model running inside the app, automated spaced repetition and media imports remain planned in [the product specification](docs/product-spec.md). Cards labelled “planned” refer to those future in-app capabilities.

## Run

Node 22.16+. Run `npm ci --ignore-scripts` to install the official MCP SDK and Zod, then `npm test` for isolated authentication, OAuth, MCP and persistence checks. The runtime uses Node's built-in SQLite module, which emits an experimental warning on Node 22.

Production: `docker compose up -d --build`. Create the owner interactively with `docker compose exec -it cadence node scripts/setup-owner.mjs`. Passwords are hidden and never placed in command arguments. Only the operator should run account setup; re-running it resets the account and revokes sessions while retaining learning preferences.

For local development use `BASE_URL=http://localhost:3000 npm start`, then run `npm run setup-owner` in a separate terminal. Sessions retain Secure cookies; use localhost or HTTPS for browser testing.

See [deployment and GitHub setup](docs/deployment.md), [design notes](docs/design.md) and [mascot provenance](docs/mascot.md).
