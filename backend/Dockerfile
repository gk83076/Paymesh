FROM node:20-alpine AS base

# Install OpenSSL and libc compat for Prisma on Alpine
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy Prisma schema
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Copy source
COPY src ./src

EXPOSE 3001

CMD ["node", "src/server.js"]
