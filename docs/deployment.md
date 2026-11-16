# Cadence deployment

## Hostname handoff — user operated

Public hostname: **learning.jrhtechservices.party**.

Origin for the existing Docker connector: **HTTP `cadence:3000`**, on the external `aitrace_proxy` network. The app joins that network with the stable alias `cadence`, matching Hearth and Spoon's approach. Do not use the connector container's loopback as the host origin.

Host-local address: **http://127.0.0.1:8099**.

The app's configured public origin is `https://learning.jrhtechservices.party`; browser write requests must match it. TLS terminates at the user-managed edge. No tunnel or route configuration is included, inspected or changed. The operator performs all Cloudflare work.

## Sign-in

Cadence follows Hearth and Spoon's account/session pattern but owns its separate SQLite database and account. There is no shared password database, public signup or default password. Sessions use an HttpOnly, Secure, SameSite=Lax `__Host-cadence_session` cookie, hashed server-side tokens, a one-day idle timeout and seven-day absolute expiry. Write requests require the public origin plus a custom request header. Passwords use salted scrypt. Login attempts are rate limited; the current single-origin setup deliberately uses the socket address rather than trusting arbitrary forwarded IP headers.

Create your account locally, without sharing credentials:

```bash
cd '/home/jbox/Documents/ChatGPT/Linux general/Cadence'
sg docker -c 'docker compose exec -it cadence node scripts/setup-owner.mjs'
```

Enter email, display name and password at the prompts. Password input is hidden. Repeating this command resets the owner and revokes sessions. Runtime data is secret-bearing and must not be inspected by an agent without the AGENTS.md confirmation gate.

## GitHub and deployment

Repository: `git@github.com:JordonRH/Cadence.git`. Public HTTPS fetches avoid giving the deploy runner a repository SSH key. CI tests pull requests on a GitHub-hosted runner. Successful main builds may deploy through a dedicated `cadence-deploy` runner; pull requests never run on it.

The deploy job stays disabled until `CADENCE_DEPLOY_ENABLED=true`. To register the dedicated runner, the operator runs this command from the project directory:

```bash
sg docker -c 'node scripts/register-runner.mjs'
```

This operator-run script builds the runner, obtains short-lived registration material through the existing GitHub CLI session, supplies it via stdin without displaying it, starts the runner, enables deployment and requests a workflow run. The agent does not need to inspect the registration material or the runner's saved credentials. No sudo commands are required.

The runner has Docker daemon access and is for this trusted repository only. Keep GitHub branch protections and collaborator access appropriate. Registration state is ignored and must never be committed. The runner Compose file binds this repository path and the host Docker tools, following the neighbouring app's deployment layout.

Deploy refuses tracked local edits, checks the expected main commit, builds a revision-labelled image, restarts, verifies health/revision, checks anonymous access is denied and tests reachability from the shared Docker network. It retains the previous image for rollback. Image rollback does not restore data or reverse migrations.

## Start / verify / restart

```bash
sg docker -c 'docker compose up -d --build'
node scripts/check-deployment.mjs
sg docker -c 'docker compose ps'
```

Both application and runner use `restart: unless-stopped`; no host startup service changes are needed for already-created containers. The app runs without root, with a read-only root filesystem and a dedicated persistent data volume. Login is blocked until owner setup is completed. No AI provider credentials are required for this foundation.

## Data boundary

The SQLite volume contains password hashes, sessions, OAuth grants, learning preferences, selected lesson summaries and saved review phrases. It is not included in Git or image builds. Automated encrypted/off-machine backups, user export, account recovery UI and AI-provider configuration remain future work. See [ChatGPT connection](chatgpt.md) for OAuth endpoints, scopes and revocation.
