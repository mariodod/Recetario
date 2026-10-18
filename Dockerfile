# Imagen de produccion:  solo node y dependencias de runtime
FROM node:24-alpine

WORKDIR /app

# Dependencias primero para aprovechar la cache de capas
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 8081

CMD ["node", "app.js"]
