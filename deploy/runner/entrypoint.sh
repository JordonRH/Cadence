#!/usr/bin/env bash
set -euo pipefail
umask 077
if [[ ! -x /runner/config.sh ]]; then cp -a /opt/runner/. /runner/; fi
cd /runner
if [[ "${1:-}" == register ]]; then
  IFS= read -r ACTIONS_RUNNER_INPUT_TOKEN
  export ACTIONS_RUNNER_INPUT_TOKEN
  exec ./config.sh --unattended --url https://github.com/JordonRH/Cadence --name cadence-deploy --labels cadence-deploy --work _work
fi
if [[ ! -f /runner/.runner ]]; then
  echo 'Runner is not registered. Run the operator registration script.' >&2
  exit 1
fi
exec ./run.sh
