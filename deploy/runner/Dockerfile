FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git libicu72 libssl3 procps python3 python3-yaml unzip \
    && rm -rf /var/lib/apt/lists/*
ARG RUNNER_VERSION=2.338.2
ARG RUNNER_SHA256=baebf204307bac6193480852732f0aba2ae97b6c5597c244f4d5558390147c40
RUN mkdir /opt/runner /runner && curl -fsSL "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" -o /tmp/runner.tar.gz && echo "${RUNNER_SHA256}  /tmp/runner.tar.gz" | sha256sum -c - && tar -xzf /tmp/runner.tar.gz -C /opt/runner && rm /tmp/runner.tar.gz && chown -R node:node /opt/runner /runner
COPY deploy/runner/entrypoint.sh /entrypoint.sh
USER node
WORKDIR /runner
ENTRYPOINT ["bash", "/entrypoint.sh"]
