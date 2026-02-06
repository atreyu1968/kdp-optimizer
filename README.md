# KDP Optimizer AI

Optimizador de metadatos para Amazon Kindle Direct Publishing (KDP) con inteligencia artificial.
Analiza manuscritos y genera metadatos optimizados para multiples mercados internacionales.

## Caracteristicas Principales

- **Optimizacion de Metadatos**: Analisis de manuscritos con IA (DeepSeek) para generar titulos, descripciones, keywords y categorias optimizados
- **8 Mercados Amazon**: US, ES, CA, DE, FR, IT, UK, BR con metadatos localizados
- **Validacion KDP**: Verificacion automatica contra reglas de Amazon (terminos prohibidos, limites)
- **Kit de Marketing Organico**: TikTok hooks, Instagram posts, Pinterest, hashtags, Facebook Groups
- **Plan de 30 Dias**: Calendario de marketing personalizado
- **SEO para Landing Pages**: Meta tags, Open Graph, keywords SEO por mercado
- **Categorias de Nicho**: Sugerencias de categorias de baja competencia para Author Central
- **Aura Analytics**: Dashboard multi-seudonimo con importacion de ventas KDP y KENP
- **AudiobookForge**: Generacion de audiolibros con Amazon Polly, Google Cloud TTS y Qwen TTS
- **Reeditor**: Reduccion de texto con IA preservando voz del autor
- **Sala de Contenido Social**: Posts para redes sociales adaptados por plataforma

## Requisitos

- Ubuntu 22.04 / 24.04 LTS
- 4GB RAM minimo (8GB recomendado)
- 20GB espacio en disco
- Conexion a internet
- API Key de DeepSeek

## Instalacion Rapida

### 1. Clonar e instalar

```bash
git clone https://github.com/atreyu1968/kdp-optimizer.git
cd kdp-optimizer
sudo bash install.sh
```

### 2. Durante la instalacion

El instalador pide:
- DeepSeek API Key (motor de IA principal)
- AWS Credentials (opcional, para AudiobookForge)
- DashScope API Key (opcional, para Qwen TTS)
- Cloudflare Tunnel Token (opcional, para HTTPS)

### 3. Acceder

```
http://TU_IP_SERVIDOR
```

## Configuracion Manual de API Keys

```bash
sudo nano /etc/kdpoptimizer/env
sudo systemctl restart kdpoptimizer
```

## Comandos de Administracion

```bash
systemctl status kdpoptimizer       # Estado
journalctl -u kdpoptimizer -f       # Logs
sudo systemctl restart kdpoptimizer # Reiniciar
sudo systemctl stop kdpoptimizer    # Detener
```

## Actualizacion

```bash
cd /var/www/kdpoptimizer
sudo bash install.sh
```

Preserva automaticamente: credenciales, API keys, datos.

## Variables de Entorno

| Variable | Descripcion | Requerido |
|----------|-------------|-----------|
| `DATABASE_URL` | Conexion PostgreSQL | Si (auto) |
| `SESSION_SECRET` | Secreto de sesiones | Si (auto) |
| `DEEPSEEK_API_KEY` | DeepSeek - Motor IA principal | Recomendado |
| `AWS_ACCESS_KEY_ID` | AWS - Polly/S3 | Opcional* |
| `AWS_SECRET_ACCESS_KEY` | AWS - Secret | Opcional* |
| `AWS_REGION` | AWS - Region | Opcional* |
| `S3_BUCKET_NAME` | AWS - Bucket S3 | Opcional* |
| `GOOGLE_TTS_MASTER_KEY` | Cifrado Google TTS | Si (auto) |
| `DASHSCOPE_API_KEY` | DashScope - Qwen TTS | Opcional |
| `SECURE_COOKIES` | Cookies seguras (HTTPS) | Si (auto) |

*Necesario solo para AudiobookForge con Amazon Polly.

## Backup

```bash
# Crear backup
sudo -u postgres pg_dump kdpoptimizer > backup_$(date +%Y%m%d).sql

# Restaurar backup
sudo -u postgres psql kdpoptimizer < backup_20260206.sql
```

## Estructura en el Servidor

```
/var/www/kdpoptimizer/     # Codigo
/etc/kdpoptimizer/env      # Configuracion
/etc/systemd/system/kdpoptimizer.service  # Servicio
/etc/nginx/sites-available/kdpoptimizer   # Nginx
```

## Stack Tecnologico

- **Frontend**: React + TypeScript + Vite + Tailwind + shadcn/ui
- **Backend**: Node.js + Express + TypeScript
- **Base de datos**: PostgreSQL + Drizzle ORM
- **IA**: DeepSeek API (deepseek-chat)
- **Audio**: Amazon Polly + Google Cloud TTS + Qwen TTS + ffmpeg
- **Almacenamiento**: AWS S3

## Licencia

MIT License
