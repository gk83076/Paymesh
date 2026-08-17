FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy Prisma schema
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Copy source
COPY src ./src

EXPOSE 3001

CMD ["node", "src/server.js"]
