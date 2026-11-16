# ==============================================================================
# Dockerfile Multi-Stage: Bibliografia Científica & Citações CSL
# Stage 1: Build da interface React 19 / Vite
# Stage 2: Servidor Web Nginx Alpine otimizado para Single Page Application
# ==============================================================================

# --- STAGE 1: Compilação dos Assets Frontend ---
FROM node:20-alpine AS builder

WORKDIR /app

# Instala dependências respeitando o lockfile
COPY package.json package-lock.json* ./
RUN npm install

# Copia código-fonte da aplicação
COPY . .

# Compila o projeto com Vite para a pasta dist/
RUN npm run build

# --- STAGE 2: Servidor Nginx de Produção / Preview ---
FROM nginx:alpine AS runner

LABEL maintainer="Marcos André da Luz <https://www.linkedin.com/in/marcos-andre-da-luz-847039141>"
LABEL version="1.0.0"
LABEL description="Bibliography - Open-Source Academic Writing & Reference Management Web Container"

# Remove a configuração padrão do Nginx
RUN rm -rf /etc/nginx/conf.d/default.conf

# Cria configuração Nginx personalizada para SPA com cache e gzip
RUN printf '%s\n' \
'server {' \
'    listen 80;' \
'    server_name localhost;' \
'    root /usr/share/nginx/html;' \
'    index index.html;' \
'' \
'    # Suporte a SPA (Single Page Application)' \
'    location / {' \
'        try_files $uri $uri/ /index.html;' \
'    }' \
'' \
'    # Cache de assets estáticos (JS, CSS, Imagens, Fontes, Workers)' \
'    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|mjs|woff|woff2)$ {' \
'        expires 1y;' \
'        add_header Cache-Control "public, max-age=31536000, immutable";' \
'    }' \
'' \
'    # Compressão gzip' \
'    gzip on;' \
'    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;' \
'}' > /etc/nginx/conf.d/bibliografia.conf

# Copia os artefatos compilados da etapa anterior
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

STOPSIGNAL SIGQUIT

CMD ["nginx", "-g", "daemon off;"]
