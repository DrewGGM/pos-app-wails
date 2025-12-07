# 🐳 Despliegue del PWA de Reportes con Docker

Guía simple para desplegar el PWA de reportes usando Docker.

---

## 📋 Requisitos

- Docker instalado (versión 20.10 o superior)

Verificar instalación:
```bash
docker --version
```

---

## 🚀 Uso

### 1. Construir la imagen

```bash
cd reports-pwa
docker build -t pos-reports-pwa .
```

### 2. Ejecutar el contenedor

```bash
docker run -d \
  --name pos-reports-pwa \
  -p 3000:80 \
  --restart unless-stopped \
  pos-reports-pwa
```

### 3. Acceder

Abre tu navegador en: **http://localhost:3000**

---

## ⚙️ Opciones de Configuración

### Cambiar el puerto

```bash
docker run -d --name pos-reports-pwa -p 8080:80 pos-reports-pwa
```

### Con variables de entorno

```bash
docker build \
  --build-arg VITE_GOOGLE_SHEETS_API_KEY=tu_api_key \
  --build-arg VITE_GOOGLE_SHEETS_SPREADSHEET_ID=tu_spreadsheet_id \
  --build-arg VITE_GOOGLE_SHEETS_RANGE=Reportes!A1:Z1000 \
  --build-arg VITE_CONFIG_API_URL=https://tu-config-api.example.com \
  -t pos-reports-pwa .
```

**Variables disponibles:**
| Variable | Descripción |
|----------|-------------|
| `VITE_GOOGLE_SHEETS_API_KEY` | API Key de Google Sheets |
| `VITE_GOOGLE_SHEETS_SPREADSHEET_ID` | ID del spreadsheet |
| `VITE_GOOGLE_SHEETS_RANGE` | Rango de datos (ej: `Reportes!A1:Z1000`) |
| `VITE_CONFIG_API_URL` | URL del servidor Config API para límites de facturación |

---

## 🔧 Comandos Útiles

### Ver logs
```bash
docker logs -f pos-reports-pwa
```

### Detener
```bash
docker stop pos-reports-pwa
```

### Reiniciar
```bash
docker restart pos-reports-pwa
```

### Eliminar
```bash
docker stop pos-reports-pwa
docker rm pos-reports-pwa
docker rmi pos-reports-pwa
```

### Ver estadísticas
```bash
docker stats pos-reports-pwa
```

---

## 📊 Características

✅ **Multi-stage build** - Imagen ligera (~25MB)
✅ **Nginx optimizado** - Configuración específica para PWAs
✅ **Cache inteligente** - Assets cacheados, service worker sin cache
✅ **Health check** - Monitoreo automático del estado
✅ **Gzip compression** - Archivos comprimidos
✅ **Security headers** - Protección básica incluida

---

## 🐛 Troubleshooting

### Puerto ya en uso
```bash
# Usar otro puerto
docker run -d --name pos-reports-pwa -p 4000:80 pos-reports-pwa
```

### Reconstruir sin cache
```bash
docker build --no-cache -t pos-reports-pwa .
```

### Verificar archivos dentro del contenedor
```bash
docker exec -it pos-reports-pwa ls -la /usr/share/nginx/html/
```

---

## 🌐 Producción

Para usar un dominio, configura un reverse proxy (nginx, traefik, caddy) apuntando al puerto del contenedor.

Ejemplo con nginx:
```nginx
server {
    listen 80;
    server_name reportes.mirestaurante.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }
}
```
