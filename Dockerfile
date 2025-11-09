FROM ghcr.io/puppeteer/puppeteer:24.22.3

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true 
   

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci
COPY . .
CMD ["node", "index.js"]