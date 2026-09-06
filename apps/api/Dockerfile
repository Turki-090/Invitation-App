# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm generate
RUN pnpm exec turbo run build --filter=@dawah/api...
RUN pnpm --filter @dawah/api deploy --prod /opt/dawah-api
RUN mkdir -p /opt/dawah-api/prisma \
  && cp /workspace/database/schema.prisma /opt/dawah-api/prisma/schema.prisma \
  && cd /opt/dawah-api \
  && /workspace/node_modules/.bin/prisma generate --schema prisma/schema.prisma

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /opt/dawah-api ./

USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||'4000')+'/api/v1/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
