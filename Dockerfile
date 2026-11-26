FROM node:20-alpine
ENV NODE_ENV=production PORT=3000 DATA_FILE=/data/rounds.jsonl
WORKDIR /app
COPY package.json ./
COPY app ./app
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "app/server.js"]
