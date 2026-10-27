FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY certificado.sh /docker-entrypoint.d/05-certificado.sh
RUN chmod +x /docker-entrypoint.d/05-certificado.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080 8443
