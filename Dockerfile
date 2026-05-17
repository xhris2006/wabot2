FROM node:20-alpine

# Build tools nécessaires pour les éventuelles deps natives (Baileys signal-crypto, etc.)
RUN apk add --no-cache git ffmpeg python3 make g++ curl

WORKDIR /app

# Copier package.json + lock pour profiter du cache Docker
COPY package*.json ./

# Install propre, sans audit/fund (plus rapide)
RUN npm install --omit=dev --no-audit --no-fund

# Copier le reste du code
COPY . .

# Créer les dossiers utilisés par le bot
RUN mkdir -p session data/tmp

# Healthcheck simple : vérifier que le process Node tourne
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD pgrep -f "node src/index.js" > /dev/null || exit 1

CMD ["node", "src/index.js"]
