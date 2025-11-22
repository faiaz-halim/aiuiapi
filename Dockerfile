# UPDATE THIS LINE
FROM mcr.microsoft.com/playwright:v1.56.1-jammy

# Set working directory
WORKDIR /app

# Copy package definitions first
COPY package.json package-lock.json* ./

# Install dependencies
# Rebuild better-sqlite3 for the container architecture
RUN npm install && npm rebuild better-sqlite3

# Copy source code
COPY . .

# Create data directory
RUN mkdir -p data

# Expose port
EXPOSE 3000

# Start server
CMD ["npx", "ts-node", "src/index.ts"]
