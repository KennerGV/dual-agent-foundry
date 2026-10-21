FROM node:20-slim

WORKDIR /app

# Copy dependency manifests and install packages during build
COPY package*.json ./
RUN npm install

# Copy project source files
COPY . .

# Pre-compile TypeScript sources into dist/ during build
RUN npx tsc

# Execute test suite with Node.js test runner in isolated environment
CMD ["node", "--test", "dist/**/*.test.js"]
