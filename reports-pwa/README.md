# 📊 POS Reportes - Progressive Web App (Producción)

Aplicación web progresiva (PWA) **lista para producción** que visualiza reportes del sistema POS desde Google Sheets. Se puede instalar como app nativa en iOS y Android desde el navegador.

> ⚠️ **Esta app NO usa datos simulados**. Requiere configuración de Google Sheets API para funcionar.

## ✨ Características

- ✅ **Instalable** en iOS y Android desde el navegador
- ✅ **Funciona offline** con Service Worker
- ✅ **Diseño responsive** y mobile-first
- ✅ **Integración real** con Google Sheets API
- ✅ **Caché inteligente** de datos
- ✅ **Validación automática** de configuración
- ✅ **Sin datos mock** - 100% producción
- ✅ **Manejo de errores** completo

## 🚀 Instalación

```bash
cd reports-pwa
npm install
```

## ⚙️ Configuración (REQUERIDA)

La aplicación **requiere** configuración antes de usarse. Sin configuración, mostrará una pantalla de ayuda.

### 1. Copia el archivo de ejemplo:

```bash
cp .env.example .env
```

### 2. Edita `.env` con tus credenciales:

```env
VITE_GOOGLE_SHEETS_API_KEY=tu_api_key_aqui
VITE_GOOGLE_SHEETS_SPREADSHEET_ID=tu_spreadsheet_id_aqui
VITE_GOOGLE_SHEETS_RANGE=Reportes!A1:Z1000
```

### 3. Obtén tus credenciales de Google Cloud:

#### Paso a Paso:

**A. Crea y configura el proyecto en Google Cloud:**

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un proyecto nuevo (selector arriba izquierda → "Nuevo Proyecto")
3. Habilita Google Sheets API: "APIs y servicios" → "Biblioteca" → Buscar "Google Sheets API" → "Habilitar"
4. Crea una API Key: "APIs y servicios" → "Credenciales" → "Crear credenciales" → "Clave de API"
5. **Restringe la clave** (recomendado):
   - HTTP referrers: Agrega tus dominios permitidos
   - Restricción de API: Solo "Google Sheets API"

**B. Prepara tu Google Sheet:**

1. Crea una hoja de cálculo en Google Sheets
2. Agrega tus datos (ver estructura abajo)
3. Compártela: "Cualquier persona con el enlace" (Lector)
4. Copia el ID del spreadsheet (está en la URL entre `/d/` y `/edit`)

**C. Configura el `.env`:**

Pega las credenciales obtenidas en el archivo `.env`

## 🏃‍♂️ Desarrollo

```bash
npm run dev
```

La app estará disponible en:
- **Local**: http://localhost:5174
- **Red**: http://192.168.0.117:5174

## 🏗️ Build para Producción

```bash
npm run build
```

Los archivos se generarán en `dist/` listos para deploy.

### Deploy en producción:

1. **Netlify/Vercel:**
   - Conecta tu repositorio
   - Agrega las variables de entorno en el panel
   - Deploy automático

2. **Servidor propio:**
   - Sube la carpeta `dist/`
   - Configura servidor web (nginx/apache)
   - Habilita HTTPS

## 📊 Estructura de Google Sheets

### Columnas que el sistema POS genera automáticamente:

| Nombre               | Tipo   | Descripción                                          |
|----------------------|--------|------------------------------------------------------|
| fecha                | Texto  | Fecha del reporte (YYYY-MM-DD) - **OBLIGATORIA**   |
| ventas_totales       | Número | Total de ventas del día                              |
| ventas_dian          | Número | Ventas con factura electrónica                       |
| ventas_no_dian       | Número | Ventas sin factura electrónica                       |
| ordenes              | Número | Número total de órdenes                              |
| productos_vendidos   | Número | Total de productos vendidos                          |
| ticket_promedio      | Número | Ticket promedio (ventas/órdenes)                     |
| detalle_productos    | JSON   | Detalle de productos vendidos (nombre, cantidad, total) |

### Ejemplo de hoja compatible con el sistema POS:

Primera fila (headers):
```
fecha | ventas_totales | ventas_dian | ventas_no_dian | ordenes | productos_vendidos | ticket_promedio | detalle_productos
```

Datos de ejemplo:
```
2025-01-29 | 1250000 | 800000 | 450000 | 45 | 120 | 27777.78 | [{"product_name":"Producto A","quantity":50,"total":500000}...]
2025-01-28 | 980000  | 650000 | 330000 | 38 | 95  | 25789.47 | [{"product_name":"Producto B","quantity":40,"total":400000}...]
```

**Nota**: Si el sistema POS no ha enviado datos aún, puedes agregar datos manualmente siguiendo esta estructura para probar la PWA.

## 📱 Instalación como PWA

### En iOS (Safari):
1. Abre la app en Safari
2. Toca "Compartir" 
3. "Agregar a pantalla de inicio"
4. Confirma

### En Android (Chrome):
1. Abre la app en Chrome
2. Menú (⋮) → "Instalar aplicación"
3. Confirma

### En Desktop (Chrome/Edge):
1. Abre la app
2. Icono de instalación en barra de direcciones
3. "Instalar"

## 🗂️ Estructura del Proyecto

```
reports-pwa/
├── public/
│   ├── icon-192.png           # Icono Android
│   ├── icon-512.png           # Icono iOS
│   └── favicon.ico
├── src/
│   ├── services/
│   │   └── googleSheets.ts    # Servicio API Google Sheets
│   ├── App.tsx                # Componente principal
│   ├── App.css                # Estilos
│   └── main.tsx               # Entry point
├── .env                       # Variables de entorno (no subir a git)
├── .env.example               # Ejemplo de configuración
├── vite.config.ts             # Configuración Vite + PWA
└── README.md                  # Este archivo
```

## 🔄 Cómo funciona

1. **Usuario abre la app** → Valida configuración
2. **Si no está configurada** → Muestra pantalla de ayuda
3. **Si está configurada** → Usuario hace clic en "Cargar Reportes"
4. **App consulta Google Sheets** → API request
5. **Muestra datos reales** → Sin simulación
6. **Si no hay datos** → Muestra mensaje apropiado

## 🔒 Seguridad

### ⚠️ IMPORTANTE:

- **NO subas** el archivo `.env` a Git (ya está en `.gitignore`)
- **Restringe** tu API Key a dominios específicos
- **Limita** los permisos solo a Google Sheets API
- **Para producción**: Considera usar Google Service Account

### Configurar restricciones en Google Cloud:

1. Ve a tu API Key en Google Cloud Console
2. **Restricciones de aplicaciones**: Solo tus dominios
3. **Restricciones de API**: Solo Google Sheets API

## 📝 Variables de Entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `VITE_GOOGLE_SHEETS_API_KEY` | API Key de Google Cloud | `AIzaSyD...` |
| `VITE_GOOGLE_SHEETS_SPREADSHEET_ID` | ID del documento de Google Sheets | `1BxiMVs...` |
| `VITE_GOOGLE_SHEETS_RANGE` | Rango de celdas a leer | `Reportes!A1:Z1000` |

## 🐛 Solución de problemas

### "Configuración Requerida"
- Verifica que el archivo `.env` exista
- Verifica que las variables empiecen con `VITE_`
- Reinicia el servidor

### "API Key inválida"
- Verifica la API Key en Google Cloud
- Asegúrate de habilitar Google Sheets API

### "Spreadsheet no encontrado"
- Verifica el ID del documento
- Asegúrate de que esté compartido públicamente

### "No hay datos"
- Verifica que la hoja tenga datos
- Verifica el nombre de la pestaña
- Verifica el rango especificado

## 📚 Documentación

- [Google Sheets API Docs](https://developers.google.com/sheets/api) - Documentación oficial
- [Google Cloud Console](https://console.cloud.google.com/) - Configuración de API Key

## 🔄 Integración con sistema POS

Para que el sistema POS escriba automáticamente en Google Sheets, considera:

1. **Google Service Account** (recomendado) - Permite escritura programática desde el servidor
2. **Google Apps Script** - Crea un endpoint HTTP que escribe en la hoja
3. **Zapier/Make** - Servicios de integración no-code

## 📄 Licencia

MIT

---

## 🆘 Soporte

¿Problemas con la configuración?
1. Revisa la sección "Configuración" arriba
2. Revisa los logs del navegador (F12 → Console)
3. Verifica las variables de entorno en `.env`
4. Consulta [Google Sheets API Docs](https://developers.google.com/sheets/api)

**La app está lista para producción. Solo necesita configuración.**
