FROM node:22-alpine
WORKDIR /app
# pg_dump para el respaldo (RNF-07); la versión 17 respalda servidores PostgreSQL 15, 16 y 17
RUN apk add --no-cache postgresql17-client
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY db ./db
COPY src ./src
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
