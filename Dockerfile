FROM docker.io/cloudflare/sandbox:0.7.20

RUN npm install -g @github/copilot@1.0.46 \
    && copilot --version

ENV COMMAND_TIMEOUT_MS=300000

EXPOSE 3000