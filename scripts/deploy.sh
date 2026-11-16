#!/usr/bin/env bash
set -euo pipefail
target='/home/jbox/Documents/ChatGPT/Linux general/Cadence'
cd "$target"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Deployment stopped: commit tracked local changes first.' >&2
  exit 1
fi
git fetch https://github.com/JordonRH/Cadence.git main
latest=$(git rev-parse FETCH_HEAD)
if [[ -n "${EXPECTED_SHA:-}" && "$latest" != "$EXPECTED_SHA" ]]; then
  echo 'A newer main commit exists; this older deployment was skipped.'
  exit 0
fi
git merge --ff-only FETCH_HEAD
test "$(git rev-parse HEAD)" = "$latest"
export CADENCE_REVISION="$latest"
previous=$(docker image ls --no-trunc --quiet cadence:local | head -n 1)
if [[ -n "$previous" ]]; then docker tag "$previous" cadence:previous; fi
docker compose build --pull
rollback() {
  if [[ -n "$previous" ]]; then
    docker tag cadence:previous cadence:local
    docker compose up -d --no-build cadence
  fi
  echo 'Deploy failed. Previous image restored where available. Data migrations require operator recovery.' >&2
}
trap rollback ERR
docker compose up -d --no-build
for attempt in {1..30}; do
  if node scripts/check-deployment.mjs "$latest"; then
    docker run --rm --network aitrace_proxy --entrypoint node cadence:local -e "fetch('http://cadence:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
    trap - ERR
    echo 'Cadence deployed and verified at local port 8099.'
    exit 0
  fi
  sleep 2
done
false
