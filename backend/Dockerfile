# Image untuk Back4app Containers (Container as a Service).
# Build context = folder backend/ (set "Root directory: backend" di Back4app).
FROM node:20-alpine

ENV NODE_ENV=production
# Back4app biasanya inject PORT sendiri; ini cuma default kalau tidak di-inject.
ENV PORT=4000

WORKDIR /app

# Layer dependency dipisah supaya cache-nya kepakai selama package.json tidak berubah.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# Jangan jalan sebagai root.
USER node

EXPOSE 4000

CMD ["node", "src/server.js"]
