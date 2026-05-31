ARG NODE_VERSION=24.12.0
FROM node:${NODE_VERSION}-slim

LABEL gcr_launch_runtime="Node.js/Prisma"

WORKDIR /app

# Install all dependencies
COPY package*.json ./
RUN npm ci

# Generate Prisma Client
COPY prisma ./prisma
RUN npx prisma generate

# Remove dev dependencies
RUN npm prune --omit=dev

# Copy the rest of the application code
COPY . .

# run as non-root user
USER node

EXPOSE 3000

CMD ["npm", "start"]
