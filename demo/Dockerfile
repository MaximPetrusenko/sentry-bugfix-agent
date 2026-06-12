FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ ./src/
COPY demo/ ./demo/
EXPOSE 4000
CMD ["npx", "tsx", "demo/app.ts"]
