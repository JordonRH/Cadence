# Cadence

A calm place to learn a language. Small steps, useful practice and a cartoon hedgehog companion.

Public address: **https://learning.jrhtechservices.party** (operator-managed networking).

## Current milestone

Working private sign-in, persistent sessions, five themes, saved language/goal/session preferences and a responsive learning-space foundation. The design borrows short-session and progression concepts from language-learning apps while using an original layout and mascot. No notifications, streak penalties, fake progress or default account.

AI conversations, lessons, spaced repetition and media imports are planned in [the product specification](docs/product-spec.md); they are not implemented yet. Cards labelled “planned” are descriptive, not pretend working lessons.

## Run

Node 22.16+; no package dependencies. `npm test` runs isolated authentication and persistence checks. The runtime currently uses Node's built-in SQLite module, which emits an experimental warning on Node 22.

Production: `docker compose up -d --build`. Create the owner interactively with `docker compose exec -it cadence node scripts/setup-owner.mjs`. Passwords are hidden and never placed in command arguments. Only the operator should run account setup; re-running it resets the account and revokes sessions while retaining learning preferences.

For local development use `BASE_URL=http://localhost:3000 npm start`, then run `npm run setup-owner` in a separate terminal. Sessions retain Secure cookies; use localhost or HTTPS for browser testing.

See [deployment and GitHub setup](docs/deployment.md), [design notes](docs/design.md) and [mascot provenance](docs/mascot.md).
