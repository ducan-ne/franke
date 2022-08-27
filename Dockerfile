FROM node:16-slim as builder

RUN apt update
RUN apt install -y python3 make g++ openssl

RUN npm install -g pnpm
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

COPY packages/edge ./packages/edge
COPY packages/deployctl ./packages/deployctl

WORKDIR /app/packages/edge
RUN pnpm run generate

EXPOSE 4000
ENV NODE_ENV=production
CMD [ "pnpm", "start" ]
