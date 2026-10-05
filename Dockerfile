# صورة تشغيل محمولة لأي استضافة تدعم Docker.
# تعمل بصلاحية root لأن أقراص Railway الدائمة تُركَّب بملكية root.
FROM node:22-slim
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY scripts ./scripts
COPY public ./public
COPY admin ./admin
RUN mkdir -p /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
