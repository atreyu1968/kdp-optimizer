# KDP Optimizer AI - Documentacion Completa de Despliegue

## Documento Maestro: Instalacion, Configuracion y Despliegue en Ubuntu Server

**Version**: 1.0
**Ultima actualizacion**: Febrero 2026

---

## INDICE

1. [Descripcion del Sistema](#1-descripcion-del-sistema)
2. [Arquitectura Tecnica](#2-arquitectura-tecnica)
3. [Requisitos del Servidor](#3-requisitos-del-servidor)
4. [Subida a GitHub](#4-subida-a-github)
5. [Instalacion Rapida (Script Automatico)](#5-instalacion-rapida-script-automatico)
6. [Instalacion Manual Paso a Paso](#6-instalacion-manual-paso-a-paso)
7. [Configuracion de Variables de Entorno](#7-configuracion-de-variables-de-entorno)
8. [Administracion del Servidor](#8-administracion-del-servidor)
9. [Acceso Externo con Cloudflare Tunnel](#9-acceso-externo-con-cloudflare-tunnel)
10. [Backups y Restauracion](#10-backups-y-restauracion)
11. [Actualizacion del Sistema](#11-actualizacion-del-sistema)
12. [Solucion de Problemas](#12-solucion-de-problemas)
13. [Desinstalacion](#13-desinstalacion)
14. [Estructura de Archivos](#14-estructura-de-archivos)

---

## 1. Descripcion del Sistema

KDP Optimizer AI automatiza y optimiza metadatos de libros para Amazon Kindle Direct Publishing (KDP) en multiples mercados internacionales. Usa IA (DeepSeek) para analizar manuscritos y generar titulos, descripciones, palabras clave, categorias y recomendaciones de precio optimizados para cada mercado.

### Modulos principales:

| Modulo | Descripcion | API utilizada |
|--------|-------------|---------------|
| **KDP Optimizer** | Optimizacion de metadatos por mercado con IA | DeepSeek (deepseek-chat) |
| **Aura Analytics** | Dashboard multi-seudonimo de ventas y KENP | DeepSeek (deepseek-chat) |
| **AudiobookForge** | Generacion de audiolibros con multiples TTS | Amazon Polly / Google TTS / Qwen TTS |
| **Reeditor** | Reduccion de texto con IA preservando estilo | DeepSeek (deepseek-chat) |
| **Marketing Kit** | Estrategias de marketing organico con IA | DeepSeek (deepseek-chat) |
| **Sala de Contenido Social** | Posts para redes sociales por plataforma | DeepSeek (deepseek-chat) |

### Funcionalidades clave:

- Optimizacion de metadatos para 8 mercados Amazon (US, ES, CA, DE, FR, IT, UK, BR)
- Validacion contra reglas KDP (terminos prohibidos, limites de caracteres)
- Estrategia de 4 tipos de keywords con badges por tipo
- Kit de Marketing Organico (TikTok, Instagram, Pinterest, Facebook, LinkedIn)
- Plan de 30 dias de marketing personalizado
- SEO para landing pages de libros
- Categorias de nicho para Author Central
- Sistema Aura: importacion de ventas KDP, analytics, insights con IA
- AudiobookForge: 3 proveedores TTS, masterizacion ACX, gestion S3
- Publicaciones programadas con calendario y limites diarios

---

## 2. Arquitectura Tecnica

```
+-----------------------------------------------------------+
|                    CLIENTE (React)                          |
|  Vite + TypeScript + Tailwind + shadcn/ui + TanStack       |
|  Puerto: 5000 (servido por Express en produccion)          |
+-----------------------------+-----------------------------+
                              | HTTP/SSE
+-----------------------------v-----------------------------+
|                   SERVIDOR (Express)                       |
|  Node.js 20 + TypeScript + Drizzle ORM                    |
|  Puerto interno: 5000                                      |
|                                                            |
|  +------------------------------------------------------+ |
|  | Servicios principales:                                | |
|  | - Metadata Generator (analisis + generacion IA)       | |
|  | - Book Analyzer (insights Aura)                       | |
|  | - Polly/Google/Qwen TTS Synthesizers                  | |
|  | - Audio Mastering (ffmpeg, ACX-compliant)             | |
|  | - KDP Importer (ventas XLSX)                          | |
|  | - Publication Scheduler                               | |
|  +------------------------------------------------------+ |
+-----------------------------+-----------------------------+
                              |
+-----------------------------v-----------------------------+
|                    PostgreSQL                               |
|  Drizzle ORM - Schema en shared/schema.ts                  |
|  Tablas: manuscripts, optimizations, publications, tasks,  |
|  pen_names, aura_books, kdp_sales, audiobook_projects,     |
|  audiobook_chapters, audiobook_synthesis_jobs, etc.         |
+-----------------------------------------------------------+
```

### Flujo de datos en produccion:

```
Usuario -> Nginx (80/443) -> Express (5000) -> PostgreSQL (5432)
                                   |
                           DeepSeek API / AWS Polly / Google TTS
```

### Scripts de package.json:

```json
{
  "dev": "NODE_ENV=development tsx server/index.ts",
  "build": "vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
  "start": "NODE_ENV=production node dist/index.js",
  "check": "tsc",
  "db:push": "drizzle-kit push"
}
```

- `npm run dev` - Desarrollo con hot-reload (tsx)
- `npm run build` - Compila servidor (esbuild -> dist/index.js) + cliente (Vite -> dist/public/)
- `npm start` - Ejecuta el build de produccion
- `npm run db:push` - Aplica migraciones de schema a PostgreSQL

---

## 3. Requisitos del Servidor

### Hardware Minimo

| Recurso | Minimo | Recomendado |
|---------|--------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8 GB+ |
| Disco | 20 GB SSD | 50 GB SSD |
| Red | Conexion estable | Conexion estable |

### Software Base

- Ubuntu 22.04 LTS o 24.04 LTS
- Node.js 20.x
- PostgreSQL 15+
- Nginx
- ffmpeg (para AudiobookForge)
- Git, curl, build-essential

---

## 4. Subida a GitHub

### Desde tu computadora local (recomendado)

**Paso 1: Descargar de Replit**
1. En Replit, haz clic en los tres puntos (...) en el panel de archivos
2. Selecciona "Download as zip"
3. Extrae el ZIP en tu computadora

**Paso 2: Preparar y subir**

```bash
cd ruta/a/la/carpeta/extraida

# Eliminar archivos innecesarios
rm -rf node_modules dist .cache attached_assets .config

# Inicializar git
git init
git remote add origin https://github.com/atreyu1968/kdp-optimizer.git
git add .
git commit -m "KDP Optimizer AI v1.0"
git push -u origin main
```

**Si el repositorio ya tiene contenido y quieres sobrescribir:**

```bash
git push -u origin main --force
```

### Verificar que estos archivos esten en GitHub:

```
install.sh           <- Script de instalacion automatica
README.md            <- Documentacion principal
package.json         <- Dependencias del proyecto
drizzle.config.ts    <- Configuracion de migraciones
tsconfig.json        <- Configuracion TypeScript
vite.config.ts       <- Configuracion Vite
.gitignore           <- Archivos excluidos de Git
server/              <- Codigo del backend
  +-- index.ts
  +-- routes.ts
  +-- storage.ts
  +-- vite.ts
  +-- ai/            <- Cliente DeepSeek AI
  +-- services/      <- Servicios (TTS, metadata, etc.)
  +-- data/          <- Datos estaticos (categorias KDP)
client/              <- Codigo del frontend
  +-- src/
      +-- App.tsx
      +-- pages/     <- Paginas de la aplicacion
      +-- components/
shared/              <- Schemas compartidos
  +-- schema.ts
```

### Archivos que NO deben subirse (ya estan en .gitignore):

```
node_modules/        <- Se instalan con npm install
dist/                <- Se genera con npm run build
.cache/              <- Cache temporal
.env                 <- Variables de entorno (secretas)
attached_assets/     <- Archivos adjuntos
*.log                <- Logs
```

---

## 5. Instalacion Rapida (Script Automatico)

Una vez el codigo esta en GitHub, en tu servidor Ubuntu:

```bash
# 1. Clonar repositorio
git clone https://github.com/atreyu1968/kdp-optimizer.git
cd kdp-optimizer

# 2. Ejecutar instalador
sudo bash install.sh
```

### Lo que hace el instalador automaticamente:

1. Detecta si es primera instalacion o actualizacion
2. Actualiza el sistema e instala dependencias (curl, git, nginx, postgresql, ffmpeg, build-essential)
3. Instala Node.js 20.x (si no existe)
4. Crea usuario y base de datos PostgreSQL (solo primera vez)
5. Pide las API keys interactivamente:
   - DeepSeek API Key (motor de IA principal)
   - AWS Access Key + Secret (para Polly/S3 - opcional)
   - DashScope API Key (para Qwen TTS - opcional)
6. Genera automaticamente:
   - Clave maestra para Google TTS (GOOGLE_TTS_MASTER_KEY)
   - Secreto de sesion (SESSION_SECRET)
   - Contrasena de base de datos
7. Guarda configuracion en `/etc/kdpoptimizer/env`
8. Clona/actualiza codigo en `/var/www/kdpoptimizer`
9. Instala dependencias npm
10. Compila la aplicacion (`npm run build`)
11. Aplica migraciones de base de datos (`drizzle-kit push`)
12. Crea servicio systemd
13. Configura Nginx como reverse proxy
14. (Opcional) Configura Cloudflare Tunnel
15. Inicia la aplicacion

---

## 6. Instalacion Manual Paso a Paso

Si prefieres control total:

### 6.1 Actualizar el sistema

```bash
sudo apt update && sudo apt upgrade -y
sudo apt autoremove -y
```

### 6.2 Instalar herramientas base

```bash
sudo apt install -y curl git wget nano build-essential ffmpeg
```

### 6.3 Instalar Node.js 20.x

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # Verificar: v20.x.x
npm --version    # Verificar: 10.x.x
```

### 6.4 Instalar PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

### 6.5 Crear base de datos

```bash
sudo -u postgres psql
```

En la consola PostgreSQL:
```sql
CREATE USER kdpoptimizer WITH PASSWORD 'tu_password_seguro_aqui';
CREATE DATABASE kdpoptimizer OWNER kdpoptimizer;
GRANT ALL PRIVILEGES ON DATABASE kdpoptimizer TO kdpoptimizer;
\q
```

### 6.6 Instalar Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

### 6.7 Crear usuario del sistema

```bash
sudo useradd --system --create-home --shell /bin/bash kdpoptimizer
```

### 6.8 Clonar el codigo

```bash
sudo mkdir -p /var/www/kdpoptimizer
sudo chown kdpoptimizer:kdpoptimizer /var/www/kdpoptimizer
sudo -u kdpoptimizer git clone https://github.com/atreyu1968/kdp-optimizer.git /var/www/kdpoptimizer
```

### 6.9 Instalar dependencias y compilar

```bash
cd /var/www/kdpoptimizer
sudo -u kdpoptimizer npm install --legacy-peer-deps
sudo -u kdpoptimizer npm run build
```

### 6.10 Configurar variables de entorno

```bash
sudo mkdir -p /etc/kdpoptimizer
sudo nano /etc/kdpoptimizer/env
```

Contenido del archivo `/etc/kdpoptimizer/env`:

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://kdpoptimizer:tu_password@localhost:5432/kdpoptimizer
SESSION_SECRET=genera_una_cadena_aleatoria_de_32_caracteres
SECURE_COOKIES=false

# DeepSeek API (motor de IA principal)
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx

# AWS (Amazon Polly + S3 para AudiobookForge)
AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_REGION=us-east-1
S3_BUCKET_NAME=tu-bucket-audiolibros

# Google Cloud TTS (clave maestra de cifrado - generar con: openssl rand -hex 32)
GOOGLE_TTS_MASTER_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# DashScope / Qwen TTS (opcional)
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
DASHSCOPE_REGION=intl
```

Proteger el archivo:
```bash
sudo chmod 600 /etc/kdpoptimizer/env
sudo chown root:root /etc/kdpoptimizer/env
```

Para generar SESSION_SECRET:
```bash
openssl rand -base64 32
```

Para generar GOOGLE_TTS_MASTER_KEY:
```bash
openssl rand -hex 32
```

### 6.11 Aplicar migraciones de base de datos

```bash
cd /var/www/kdpoptimizer
set -a && source /etc/kdpoptimizer/env && set +a
sudo -E -u kdpoptimizer npx drizzle-kit push --force
```

### 6.12 Crear servicio systemd

```bash
sudo nano /etc/systemd/system/kdpoptimizer.service
```

Contenido:

```ini
[Unit]
Description=KDP Optimizer AI - Optimizador de metadatos para Amazon KDP
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=kdpoptimizer
Group=kdpoptimizer
WorkingDirectory=/var/www/kdpoptimizer
EnvironmentFile=/etc/kdpoptimizer/env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kdpoptimizer

[Install]
WantedBy=multi-user.target
```

Activar:
```bash
sudo systemctl daemon-reload
sudo systemctl enable kdpoptimizer
```

### 6.13 Configurar Nginx

```bash
sudo nano /etc/nginx/sites-available/kdpoptimizer
```

Contenido:

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 500M;
    proxy_read_timeout 600s;
    proxy_connect_timeout 600s;
    proxy_send_timeout 600s;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # SSE (Server-Sent Events) para progreso en tiempo real
    location ~ ^/api/(optimize|audiobooks)/.*events {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
}
```

Activar:
```bash
sudo ln -sf /etc/nginx/sites-available/kdpoptimizer /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### 6.14 Configurar firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### 6.15 Iniciar la aplicacion

```bash
sudo systemctl start kdpoptimizer
```

Verificar:
```bash
sudo systemctl status kdpoptimizer
curl http://localhost:5000
```

---

## 7. Configuracion de Variables de Entorno

### Archivo de configuracion: `/etc/kdpoptimizer/env`

| Variable | Descripcion | Requerido | Auto-generado |
|----------|-------------|-----------|---------------|
| `NODE_ENV` | Modo de ejecucion | Si | Si (production) |
| `PORT` | Puerto de la aplicacion | Si | Si (5000) |
| `DATABASE_URL` | URL de conexion PostgreSQL | Si | Si |
| `SESSION_SECRET` | Secreto para firmar sesiones | Si | Si |
| `SECURE_COOKIES` | Cookies seguras (true con HTTPS) | Si | Si (false) |
| `DEEPSEEK_API_KEY` | DeepSeek - Motor de IA principal | Recomendado | No |
| `AWS_ACCESS_KEY_ID` | AWS - Para Polly y S3 | Opcional* | No |
| `AWS_SECRET_ACCESS_KEY` | AWS - Secreto de acceso | Opcional* | No |
| `AWS_REGION` | AWS - Region (ej: us-east-1) | Opcional* | Si (us-east-1) |
| `S3_BUCKET_NAME` | AWS - Bucket S3 para audios | Opcional* | No |
| `GOOGLE_TTS_MASTER_KEY` | Clave maestra cifrado Google TTS | Si | Si |
| `DASHSCOPE_API_KEY` | DashScope - Para Qwen TTS | Opcional | No |
| `DASHSCOPE_REGION` | DashScope - Region (intl/cn) | Opcional | Si (intl) |

*Necesario solo si usas AudiobookForge con Amazon Polly.

### Editar configuracion despues de la instalacion:

```bash
sudo nano /etc/kdpoptimizer/env
sudo systemctl restart kdpoptimizer
```

### Obtener API Keys:

**DeepSeek (Principal - Requerido)**:
1. Visita https://platform.deepseek.com/
2. Crea una cuenta y agrega creditos ($2-5 para empezar)
3. Genera una API key en el panel de control
4. Modelo usado: `deepseek-chat` (V3)

**AWS (AudiobookForge - Opcional)**:
1. Visita https://console.aws.amazon.com/
2. Crea un usuario IAM con permisos para Polly y S3
3. Genera Access Key y Secret Key
4. Crea un bucket S3 para almacenar audios

**Google Cloud TTS (Opcional)**:
- Las credenciales de Google Cloud TTS se gestionan desde la interfaz web
- La clave maestra (GOOGLE_TTS_MASTER_KEY) se genera automaticamente

**DashScope / Qwen TTS (Opcional)**:
1. Visita https://dashscope.console.aliyun.com/
2. Crea una cuenta y genera una API key

---

## 8. Administracion del Servidor

### Comandos esenciales:

```bash
# Ver estado del servicio
systemctl status kdpoptimizer

# Ver logs en tiempo real
journalctl -u kdpoptimizer -f

# Ver ultimas 100 lineas de logs
journalctl -u kdpoptimizer -n 100

# Reiniciar servicio
sudo systemctl restart kdpoptimizer

# Detener servicio
sudo systemctl stop kdpoptimizer

# Iniciar servicio
sudo systemctl start kdpoptimizer
```

### Monitorear logs de todos los servicios:

```bash
# Logs de la aplicacion
journalctl -u kdpoptimizer -f

# Logs de Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Logs de PostgreSQL
sudo tail -f /var/log/postgresql/postgresql-*-main.log

# Estado de todos los servicios
systemctl status kdpoptimizer postgresql nginx
```

### Crear swap si hay poca memoria:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 9. Acceso Externo con Cloudflare Tunnel

Si necesitas acceso HTTPS desde internet sin abrir puertos:

### Paso 1: Crear el tunel en Cloudflare

1. Ve a https://one.dash.cloudflare.com/
2. Ve a Networks > Tunnels
3. Crea un nuevo tunel
4. Copia el token del tunel

### Paso 2: Instalar en el servidor

```bash
curl -L -o /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i /tmp/cloudflared.deb
rm /tmp/cloudflared.deb

sudo cloudflared service install TU_TOKEN_AQUI
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

### Paso 3: Configurar el hostname

En el dashboard de Cloudflare Tunnels:
- Agrega un Public Hostname
- Configura: Service = `http://localhost:5000`
- Guarda

### Paso 4: Activar cookies seguras

```bash
sudo nano /etc/kdpoptimizer/env
# Cambiar: SECURE_COOKIES=true
sudo systemctl restart kdpoptimizer
```

---

## 10. Backups y Restauracion

### Backup de la base de datos:

```bash
# Crear backup completo
sudo -u postgres pg_dump kdpoptimizer > ~/backup_kdpoptimizer_$(date +%Y%m%d_%H%M%S).sql

# Backup comprimido
sudo -u postgres pg_dump kdpoptimizer | gzip > ~/backup_kdpoptimizer_$(date +%Y%m%d).sql.gz
```

### Restaurar backup:

```bash
# Desde archivo SQL
sudo -u postgres psql kdpoptimizer < backup_kdpoptimizer_20260206.sql

# Desde archivo comprimido
gunzip -c backup_kdpoptimizer_20260206.sql.gz | sudo -u postgres psql kdpoptimizer
```

### Backup automatico (cron):

```bash
sudo crontab -e

# Backup diario a las 3:00 AM
0 3 * * * sudo -u postgres pg_dump kdpoptimizer | gzip > /var/backups/kdpoptimizer_$(date +\%Y\%m\%d).sql.gz

# Limpiar backups de mas de 30 dias
0 4 * * * find /var/backups/ -name "kdpoptimizer_*.sql.gz" -mtime +30 -delete
```

---

## 11. Actualizacion del Sistema

### Actualizacion rapida (recomendado):

```bash
cd /var/www/kdpoptimizer
sudo bash install.sh
```

El instalador detecta la instalacion existente y:
- Preserva credenciales de base de datos
- Preserva API keys
- Actualiza el codigo desde GitHub
- Reinstala dependencias
- Recompila
- Aplica migraciones nuevas
- Reinicia el servicio

### Actualizacion manual:

```bash
sudo systemctl stop kdpoptimizer

cd /var/www/kdpoptimizer
sudo -u kdpoptimizer git fetch origin
sudo -u kdpoptimizer git reset --hard origin/main

sudo -u kdpoptimizer npm install --legacy-peer-deps
sudo -u kdpoptimizer npm run build

set -a && source /etc/kdpoptimizer/env && set +a
sudo -E -u kdpoptimizer npx drizzle-kit push --force

sudo systemctl start kdpoptimizer
```

---

## 12. Solucion de Problemas

### El servicio no inicia

```bash
journalctl -u kdpoptimizer -n 50 --no-pager
sudo systemctl status postgresql
cat /etc/kdpoptimizer/env

# Probar ejecucion manual
cd /var/www/kdpoptimizer
set -a && source /etc/kdpoptimizer/env && set +a
npm start
```

### Error de conexion a base de datos

```bash
sudo systemctl start postgresql
sudo -u postgres psql -c "\l"
sudo -u postgres psql -c "\du"
psql "postgresql://kdpoptimizer:tu_password@localhost:5432/kdpoptimizer" -c "SELECT 1"
```

### Puerto 5000 en uso

```bash
sudo lsof -i :5000
sudo kill -9 $(sudo lsof -t -i:5000)
sudo systemctl restart kdpoptimizer
```

### Permisos de archivos

```bash
sudo chown -R kdpoptimizer:kdpoptimizer /var/www/kdpoptimizer
```

### Memoria insuficiente

```bash
free -h

sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### ffmpeg no encontrado (AudiobookForge)

```bash
sudo apt install -y ffmpeg
ffmpeg -version
sudo systemctl restart kdpoptimizer
```

---

## 13. Desinstalacion

```bash
# Detener y deshabilitar servicio
sudo systemctl stop kdpoptimizer
sudo systemctl disable kdpoptimizer

# Eliminar archivos de la aplicacion
sudo rm -rf /var/www/kdpoptimizer

# Eliminar configuracion
sudo rm -rf /etc/kdpoptimizer

# Eliminar servicio systemd
sudo rm /etc/systemd/system/kdpoptimizer.service
sudo systemctl daemon-reload

# Eliminar configuracion Nginx
sudo rm /etc/nginx/sites-enabled/kdpoptimizer
sudo rm /etc/nginx/sites-available/kdpoptimizer
sudo systemctl restart nginx

# Eliminar base de datos (CUIDADO: esto borra todos los datos)
sudo -u postgres psql -c "DROP DATABASE kdpoptimizer;"
sudo -u postgres psql -c "DROP USER kdpoptimizer;"

# Eliminar usuario del sistema
sudo userdel -r kdpoptimizer

# (Opcional) Eliminar Cloudflare Tunnel
sudo systemctl stop cloudflared
sudo systemctl disable cloudflared
sudo apt remove cloudflared
```

---

## 14. Estructura de Archivos

### En el servidor:

```
/var/www/kdpoptimizer/              # Codigo de la aplicacion
+-- package.json                    # Dependencias
+-- install.sh                      # Script de instalacion
+-- drizzle.config.ts               # Config de migraciones
+-- tsconfig.json                   # Config TypeScript
+-- vite.config.ts                  # Config Vite (frontend)
+-- dist/                           # Build de produccion
|   +-- index.js                    # Servidor compilado
|   +-- public/                     # Frontend compilado
+-- server/                         # Backend
|   +-- index.ts                    # Entry point
|   +-- routes.ts                   # API REST
|   +-- storage.ts                  # Interfaz de almacenamiento
|   +-- vite.ts                     # Servidor Vite (dev)
|   +-- ai/                         # Cliente DeepSeek
|   |   +-- openai-client.ts        # SDK OpenAI con DeepSeek
|   |   +-- retry-utils.ts          # Rate limiting y reintentos
|   +-- services/                   # Servicios
|   |   +-- metadata-generator.ts   # Generador de metadatos
|   |   +-- book-analyzer.ts        # Analizador de libros (Aura)
|   |   +-- polly-synthesizer.ts    # Amazon Polly TTS
|   |   +-- google-tts-synthesizer.ts # Google Cloud TTS
|   |   +-- qwen-tts-synthesizer.ts # Qwen TTS (DashScope)
|   |   +-- audio-mastering.ts      # Masterizacion ACX (ffmpeg)
|   |   +-- kdp-importer.ts         # Importador ventas KDP
|   |   +-- epub-parser.ts          # Parser EPUB3 con SSML
|   |   +-- publication-scheduler.ts # Programador publicaciones
|   +-- data/                       # Datos estaticos
|       +-- kdp-categories-list.ts  # Categorias KDP
+-- client/                         # Frontend React
|   +-- src/
|       +-- App.tsx                 # Router principal
|       +-- pages/                  # Paginas
|       |   +-- home.tsx            # Wizard de optimizacion
|       |   +-- library.tsx         # Biblioteca de manuscritos
|       |   +-- publications.tsx    # Calendario publicaciones
|       |   +-- aura-dashboard.tsx  # Dashboard Aura
|       |   +-- audiobook-projects.tsx # AudiobookForge
|       |   +-- reeditor.tsx        # Reeditor de textos
|       |   +-- social-content-room.tsx # Sala de contenido social
|       +-- components/             # Componentes UI (shadcn)
|       +-- lib/                    # Utilidades
+-- shared/                         # Codigo compartido
    +-- schema.ts                   # Schema de base de datos (Drizzle)

/etc/kdpoptimizer/
+-- env                             # Variables de entorno (permisos 600)

/etc/systemd/system/
+-- kdpoptimizer.service            # Servicio systemd

/etc/nginx/sites-available/
+-- kdpoptimizer                    # Config Nginx
```

---

## Resumen de Proceso Completo

### Flujo de despliegue de principio a fin:

```
1. REPLIT (desarrollo)
   +-- Descargar ZIP del proyecto

2. COMPUTADORA LOCAL
   +-- Extraer ZIP
   +-- Eliminar: node_modules, dist, .cache, attached_assets
   +-- git init
   +-- git remote add origin https://github.com/atreyu1968/kdp-optimizer.git
   +-- git add .
   +-- git commit -m "KDP Optimizer AI v1.0"
   +-- git push -u origin main (--force si ya existe)

3. SERVIDOR UBUNTU
   +-- git clone https://github.com/atreyu1968/kdp-optimizer.git
   +-- cd kdp-optimizer
   +-- sudo bash install.sh
   |   +-- Instala Node.js 20, PostgreSQL, Nginx, ffmpeg
   |   +-- Crea BD y usuario
   |   +-- Pide API keys
   |   +-- npm install + npm run build
   |   +-- drizzle-kit push (migraciones)
   |   +-- Crea servicio systemd
   |   +-- Configura Nginx
   |   +-- Inicia la aplicacion
   +-- Acceder: http://IP_SERVIDOR

4. ACTUALIZACIONES FUTURAS
   +-- Subir cambios a GitHub desde local
   +-- En servidor: cd /var/www/kdpoptimizer && sudo bash install.sh
```
