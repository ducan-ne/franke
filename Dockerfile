FROM node:16-alpine as builder

RUN apk add --no-cache libc6-compat

RUN npm install -g pnpm
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./

RUN pnpm install --frozen-lockfile

COPY packages/edge ./packages/edge
COPY packages/deployctl ./packages/deployctl

WORKDIR /app/packages/edge
RUN pnpm install
RUN pnpm run generate

EXPOSE 4000
ENV NODE_ENV=production
CMD [ "pnpm", "start" ]
