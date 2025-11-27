# Node LTS estable
FROM node:20-slim

# Directorio base
WORKDIR /usr/src/app

# 1) Copiar solo package.json y package-lock.json del backend
COPY server/package*.json ./server/

# 2) Instalar dependencias dentro del contenedor (Linux)
WORKDIR /usr/src/app/server
RUN npm ci --omit=dev

# 3) Copiar el resto del código backend y frontend
WORKDIR /usr/src/app
COPY server ./server
COPY public ./public

# Variables de entorno básicas
ENV NODE_ENV=production

# Exponer el puerto del servidor Express
EXPOSE 3000

# Arranque del backend
WORKDIR /usr/src/app/server
CMD ["node", "index.js"]
