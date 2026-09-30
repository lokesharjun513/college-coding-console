FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# Ensure node user owns the app directory
RUN chown -R node:node /app
USER node

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start"]
