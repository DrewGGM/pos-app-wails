# Restaurant POS System
### Sistema de Punto de Venta para Restaurantes con Facturación Electrónica DIAN (Colombia)

Sistema POS completo construido con **Wails** (Go + React + TypeScript) diseñado específicamente para restaurantes en Colombia que necesitan facturación electrónica integrada con la DIAN.

[![Wails](https://img.shields.io/badge/Wails-v2.10.2-blue)](https://wails.io)
[![Go](https://img.shields.io/badge/Go-1.21+-00ADD8)](https://golang.org)
[![React](https://img.shields.io/badge/React-18-61DAFB)](https://reactjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-336791)](https://www.postgresql.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Arquitectura del Sistema](#-arquitectura-del-sistema)
- [Requisitos Previos](#-requisitos-previos)
- [Configuración Rápida](#-configuración-rápida)
- [Configuración DIAN](#-configuración-dian-facturación-electrónica)
- [Sistema de Logging](#-sistema-de-logging)
- [Guía de Uso](#-guía-de-uso)
- [Troubleshooting](#-troubleshooting)
- [Seguridad](#-seguridad)
- [Build para Producción](#-build-para-producción)

---

## 🚀 Características

### 🍽️ Gestión de Ventas
- **POS Táctil Completo**: Interfaz optimizada para pantalla táctil
- **Gestión de Órdenes**: Sistema completo de pedidos con modificadores
- **Gestión de Mesas**: Distribución por áreas, estados en tiempo real
- **Múltiples Métodos de Pago**: Efectivo, tarjeta, transferencia, Nequi, Daviplata, QR
- **Impresión**: Tickets, facturas, comandas de cocina
- **Facturación Electrónica DIAN**: Integración completa con API de facturalatam.com

### 📊 Gestión de Negocio
- **Inventario**: Productos, categorías, modificadores, control de stock
- **Clientes**: Base de datos completa con información tributaria
- **Empleados**: Gestión de personal con roles y permisos
- **Reportes**: Ventas, caja, productos más vendidos, análisis de períodos
- **Dashboard**: Métricas en tiempo real
- **Sincronización Offline**: Cola de operaciones cuando no hay internet

### 🖨️ Sistema de Impresión
- **Detección Automática**: Escanea impresoras instaladas en el sistema
- **Impresoras Térmicas**: Soporte USB, Red, Serial
- **Formatos**: 58mm y 80mm
- **Tipos de Documentos**: Tickets, facturas, comandas, reportes de caja

### 🔐 Seguridad y Auditoría
- **Autenticación Dual**: Usuario/contraseña + PIN de 4 dígitos
- **Roles Granulares**: Admin, Cajero, Mesero, Cocina
- **Bcrypt Hashing**: Passwords y PINs encriptados (cost factor 10)
- **Registro de Auditoría**: Log completo de todas las operaciones
- **Sistema de Logging**: Archivos diarios con todos los errores y eventos
- **Cierre de Caja**: Verificación y reporte detallado

### 📱 Características Adicionales
- **WebSocket Server**: Sincronización en tiempo real para múltiples dispositivos
- **Modo Offline**: Operación sin internet con sincronización posterior
- **Actualización Automática**: Sistema de auto-actualización desde GitHub
- **Configuración de Wizard**: Asistente de configuración inicial paso a paso

---

## 🏗️ Arquitectura del Sistema

### Stack Tecnológico

**Backend (Go)**
- **Framework**: Wails v2.10.2
- **ORM**: GORM v1.30
- **Database**: PostgreSQL 14+
- **Seguridad**: bcrypt, AES-256-GCM
- **HTTP Client**: net/http con timeout
- **WebSocket**: gorilla/websocket

**Frontend (React + TypeScript)**
- **Framework**: React 18
- **Lenguaje**: TypeScript 5
- **UI Library**: Material-UI v5
- **Estado Global**: Redux Toolkit
- **Router**: React Router v6
- **Formularios**: React Hook Form
- **Notificaciones**: React Toastify
- **Fechas**: Day.js con locale español

**Database**
- **PostgreSQL 14+** (local, cloud o Docker)
- **Migraciones**: GORM Auto-Migrate
- **Índices**: Optimizados para consultas frecuentes
- **Soft Deletes**: Todos los modelos principales

**Integración DIAN**
- **API**: FacturaLatam.com API (https://facturalatam.com/api/)
- **Protocolo**: UBL 2.1
- **Ambientes**: Testing y Producción
- **Validación**: Tiempo real con worker asíncrono

---

## 📦 Requisitos Previos

### Software Necesario

| Software | Versión Mínima | Propósito |
|----------|---------------|-----------|
| **Go** | 1.21+ | Backend y compilación |
| **Node.js** | 18+ | Frontend |
| **npm** | 9+ | Gestor de paquetes frontend |
| **PostgreSQL** | 14+ | Base de datos |
| **Wails CLI** | v2.10+ | Framework desktop |

### Instalar Wails CLI

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

Verificar instalación:
```bash
wails doctor
```

### Servicios Externos Requeridos

#### 1. **API de Facturación Electrónica DIAN**

⚠️ **REQUISITO OBLIGATORIO para facturación electrónica**

Este sistema utiliza la API de **FacturaLatam.com** para la facturación electrónica DIAN:

- 🌐 **Website**: https://facturalatam.com
- 📖 **Documentación API**: https://facturalatam.com/api/
- 🔑 **Registro**: Necesitas crear una cuenta y obtener credenciales
- 💰 **Planes**: Freemium con opciones de pago según volumen

**Pasos para configurar:**
1. Regístrate en https://facturalatam.com
2. Crea tu empresa en la plataforma
3. Obtén tus credenciales de API (Token)
4. Configura el software en el panel de FacturaLatam
5. Ingresa las credenciales en el sistema POS (Settings → DIAN)

**Endpoints principales utilizados:**
- `POST /api/ubl2.1/config/{nit}/{dv}` - Configuración de empresa
- `POST /api/ubl2.1/software` - Configuración de software
- `POST /api/ubl2.1/invoice/{nit}/{dv}` - Emisión de factura
- `POST /api/ubl2.1/credit-note/{nit}/{dv}` - Nota crédito
- `POST /api/ubl2.1/debit-note/{nit}/{dv}` - Nota débito

#### 2. **Base de Datos PostgreSQL**

Opciones recomendadas:

**Cloud (Recomendado para producción):**
- [Neon](https://neon.tech) - PostgreSQL serverless gratuito
- [Supabase](https://supabase.com) - PostgreSQL con extras gratuito
- [Railway](https://railway.app) - Despliegue fácil con plan gratuito
- [Render](https://render.com) - PostgreSQL managed gratuito

**Local (Desarrollo):**
```bash
# Docker (más fácil)
docker run --name pos-postgres -e POSTGRES_PASSWORD=yourpassword -p 5432:5432 -d postgres:14

# O instalación nativa
# Windows: https://www.postgresql.org/download/windows/
# Linux: sudo apt install postgresql-14
# macOS: brew install postgresql@14
```

---

## ⚡ Configuración Rápida

### 1. Clonar y Configurar Proyecto

```bash
# Clonar repositorio
git clone <repository-url>
cd PosApp

# Instalar dependencias backend
go mod download

# Instalar dependencias frontend
cd frontend
npm install
cd ..
```

### 2. Configurar Base de Datos

El sistema usa un **Setup Wizard** integrado que se ejecuta automáticamente la primera vez.

**Opción A: Wizard de Configuración (Recomendado)**

1. Ejecuta la aplicación:
   ```bash
   wails dev
   ```

2. El wizard aparecerá automáticamente

3. Sigue los pasos:
   - **Paso 1**: Configuración de Base de Datos
     - Host, puerto, usuario, contraseña, nombre de BD
     - El sistema creará la BD automáticamente si no existe
   - **Paso 2**: Información del Negocio
     - Nombre comercial, razón social, NIT, dirección, etc.
   - **Paso 3**: Confirmación
     - Revisa y completa la configuración

4. El wizard crea automáticamente:
   - ✅ Base de datos PostgreSQL (si no existe)
   - ✅ Todas las tablas (GORM auto-migrate)
   - ✅ Usuario administrador (`admin` / `admin`)
   - ✅ Datos predeterminados (categorías, métodos de pago, etc.)
   - ✅ Archivo `config.json` encriptado

**Opción B: Configuración Manual (.env para desarrollo)**

Solo si necesitas desarrollo sin wizard:

```bash
# Copiar plantilla
cp .env.example .env
```

Editar `.env`:
```env
# Opción 1: URL completa (recomendado para cloud)
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require

# Opción 2: Variables individuales (recomendado para local)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=yourpassword
DB_NAME=restaurant_pos
DB_SSLMODE=disable
```

**Ejemplos de conexión:**
```env
# Neon
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/pos_db?sslmode=require

# Supabase
DATABASE_URL=postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres

# Railway
DATABASE_URL=postgresql://postgres:pass@containers-us-west-xxx.railway.app:5432/railway

# Local Docker
DATABASE_URL=postgresql://postgres:yourpass@localhost:5432/restaurant_pos
```

### 3. Credenciales de Administrador

El wizard crea automáticamente un usuario administrador:

```
Usuario:    admin
Contraseña: admin
PIN:        12345
```

⚠️ **IMPORTANTE**: Cambia estas credenciales **INMEDIATAMENTE** después del primer login:
- Ve a **Settings → Empleados**
- Edita el usuario admin
- Cambia contraseña y PIN

### 4. Iniciar la Aplicación

```bash
# Modo desarrollo (con hot reload)
wails dev

# Build para producción
wails build

# El ejecutable estará en: build/bin/RestaurantPOS.exe (Windows)
```

---

## 🧾 Configuración DIAN (Facturación Electrónica)

### Requisitos Previos

1. **Cuenta en FacturaLatam.com**
   - Registrarse en https://facturalatam.com
   - Crear empresa en la plataforma
   - Tener habilitación DIAN (testset o producción)

2. **Información Tributaria del Restaurante**
   - NIT con dígito de verificación
   - Tipo de documento (31 para NIT)
   - Tipo de organización (1 = Persona Jurídica, 2 = Persona Natural)
   - Tipo de régimen (2 = Simplificado, 0 = Común)
   - Tipo de responsabilidad (códigos DIAN)
   - Resolución de facturación

### Configuración Paso a Paso en el Sistema

1. **Acceder a Configuración DIAN**
   ```
   Login → Settings → DIAN (Facturación Electrónica)
   ```

2. **Paso 1: Configurar Empresa**
   - URL API: `https://api.facturalatam.com` (o URL de test)
   - NIT + Dígito de Verificación
   - Razón Social
   - Dirección, teléfono, email
   - Datos tributarios (tipo organización, régimen, responsabilidades)
   - ID de municipio DIAN
   - Clic en **"Guardar y Continuar"**

3. **Paso 2: Configurar Software**
   - Software ID (provisto por FacturaLatam)
   - Software PIN (provisto por FacturaLatam)
   - Test Set ID (para ambiente de pruebas)
   - Clic en **"Guardar y Continuar"**

4. **Paso 3: Configurar Resolución**
   - Prefijo de facturación (ej: SETP, SETT)
   - Número inicial
   - Número final
   - Fecha de inicio de vigencia
   - Fecha final de vigencia
   - Llave técnica (opcional)
   - Clic en **"Guardar y Continuar"**

5. **Paso 4: Probar Conexión**
   - El sistema valida automáticamente contra la API DIAN
   - Si todo está correcto, aparece ✅ "Configuración Completada"
   - Si hay errores, revisa los datos ingresados

### Ambientes DIAN

**Ambiente de Pruebas (Testing)**
```
URL API: https://api-test.facturalatam.com
- Para desarrollo y testing
- Usa prefijo SETT (Set de Pruebas)
- Test Set ID requerido
```

**Ambiente de Producción**
```
URL API: https://api.facturalatam.com
- Para facturas reales
- Usa prefijo SETP (Set de Producción)
- Resolución DIAN activa requerida
```

### Facturación

Una vez configurado:

1. **Crear Venta**
   - Dashboard → Nueva Venta
   - Agregar productos
   - Seleccionar cliente (puede ser "CONSUMIDOR FINAL")
   - Confirmar pago

2. **Generar Factura Electrónica**
   - Automático después del pago
   - O manualmente desde "Ventas → Ver Venta → Generar Factura"

3. **Validación DIAN**
   - El sistema valida automáticamente en segundo plano
   - Ver estado en "Ventas → Facturas Electrónicas"
   - Estados: Pendiente, Validada, Rechazada

4. **Notas Crédito/Débito**
   - Desde "Ventas → Ver Venta → Generar Nota Crédito"
   - Ingresa motivo y valor
   - Validación automática DIAN

### Solución de Problemas DIAN

| Error | Solución |
|-------|----------|
| **401 Unauthorized** | Verificar API Token, regenerar si es necesario |
| **400 Bad Request** | Revisar datos tributarios, NIT, DV |
| **Resolución inválida** | Verificar fechas de vigencia, prefijo, rangos |
| **Cliente inválido** | Asegurar que tiene tipo de documento y número de identificación |
| **Producto sin código** | Todos los productos necesitan código (usar SKU) |

---

## 📋 Sistema de Logging

El sistema incluye un **sistema de logging completo** que captura todos los errores y eventos tanto del backend como del frontend.

### Ubicación de Logs

Los archivos de log se guardan automáticamente en:

**Windows:**
```
C:\Users\[tu-usuario]\AppData\Roaming\PosApp\logs\
```

**Linux:**
```
~/.config/PosApp/logs/
```

**macOS:**
```
~/Library/Application Support/PosApp/logs/
```

### Formato de Archivos

```
2025-10-25.log
2025-10-26.log
2025-10-27.log
```

Cada día se crea un nuevo archivo automáticamente.

### Qué se Registra

- ✅ **Inicio/Cierre de aplicación**
- ✅ **Errores del backend (Go)** con archivo y línea
- ✅ **Errores del frontend (React)** con stack trace
- ✅ **Panics** con stack trace completo
- ✅ **Conexiones a base de datos**
- ✅ **Llamadas a API DIAN**
- ✅ **Warnings y eventos importantes**
- ✅ **Errores no manejados** (Promise rejections, etc.)

### Ver Logs en Tiempo Real

**Windows PowerShell:**
```powershell
Get-Content "$env:APPDATA\PosApp\logs\$(Get-Date -Format yyyy-MM-dd).log" -Wait
```

**Linux/macOS:**
```bash
tail -f ~/.config/PosApp/logs/$(date +%Y-%m-%d).log
```

### Debugging con Logs

Si la aplicación no abre o tiene errores:

1. Ejecuta el .exe
2. Abre el archivo de log del día
3. Busca líneas con `[ERROR]`, `[FATAL]` o `[PANIC]`
4. El log incluye la causa exacta del problema

Ejemplo de log de error:
```
2025/10/25 11:40:12 main.go:213: [FATAL] Failed to initialize database | Error: connection refused
2025/10/25 11:40:12 main.go:214: [FATAL] Stack trace:
goroutine 1 [running]:
PosApp/app/services.(*ConfigService).InitializeDatabase(...)
    C:/path/to/config_service.go:45
main.main()
    C:/path/to/main.go:213 +0x914
```

### Limpieza de Logs

Los logs se acumulan indefinidamente. Para limpiar logs antiguos:

Desde la aplicación:
```
Settings → Mantenimiento → Limpiar Logs (mantener últimos 30 días)
```

---

## 📖 Guía de Uso

### Primer Inicio

1. **Login**
   - Usuario: `admin`
   - Contraseña: `admin`

2. **Cambiar Credenciales**
   - Settings → Empleados → Editar admin
   - Nueva contraseña y PIN

3. **Configurar Restaurante**
   - Settings → General
   - Nombre, dirección, teléfono, logo

4. **Configurar DIAN** (si usarás facturación electrónica)
   - Settings → DIAN
   - Seguir wizard de 4 pasos

5. **Configurar Impresoras**
   - Settings → Impresoras
   - Detectar Impresoras → Configurar

6. **Crear Productos**
   - Productos → Nueva Categoría
   - Productos → Nuevo Producto
   - Asignar categoría, precio, stock

7. **Crear Empleados**
   - Empleados → Nuevo Empleado
   - Asignar rol: Cajero, Mesero, Cocina

### Flujo de Venta Completo

1. **Iniciar Turno**
   - Login con usuario/PIN
   - Dashboard → Abrir Caja
   - Ingresa monto inicial

2. **Crear Orden**
   - Dashboard → Nueva Venta
   - Buscar productos o navegar categorías
   - Agregar al pedido
   - Modificadores si aplica

3. **Asignar Mesa** (opcional)
   - Seleccionar mesa en el mapa
   - Estado cambia a "Ocupada"
   - Enviar a cocina

4. **Pagar Orden**
   - Click en "Cobrar"
   - Seleccionar método de pago
   - Dividir cuenta si aplica
   - Confirmar

5. **Generar Factura** (si cliente requiere)
   - Seleccionar cliente o crear nuevo
   - Click "Generar Factura Electrónica"
   - DIAN valida automáticamente

6. **Cerrar Turno**
   - Dashboard → Cerrar Caja
   - Contar efectivo
   - Generar reporte de cierre
   - Imprimir

### Gestión de Inventario

- **Agregar Stock**: Productos → Editar → Ajustar Stock → Agregar
- **Alertas de Stock Bajo**: Dashboard muestra productos críticos
- **Historial de Movimientos**: Productos → Movimientos de Inventario

### Reportes Disponibles

- **Ventas por Período**: Daily, Weekly, Monthly
- **Productos Más Vendidos**: Top 10, Top 20, All
- **Ventas por Empleado**: Individual performance
- **Ventas por Categoría**: Category breakdown
- **Métodos de Pago**: Payment method distribution
- **Cierres de Caja**: Z reports history

---

## 🔧 Troubleshooting

### La aplicación no abre (.exe no inicia)

1. **Ver los logs:**
   ```powershell
   notepad "$env:APPDATA\PosApp\logs\$(Get-Date -Format yyyy-MM-dd).log"
   ```

2. **Buscar errores:**
   - `[FATAL]` - Error crítico
   - `[PANIC]` - Crash inesperado
   - `[ERROR]` - Error de operación

3. **Errores comunes:**
   - `database not initialized` → Problema de conexión a BD
   - `config.json not found` → Ejecuta wizard de configuración
   - `panic: runtime error` → Ver stack trace en log

### Error de Conexión a Base de Datos

```bash
# Verificar que PostgreSQL esté corriendo
# Windows
sc query postgresql-x64-14

# Docker
docker ps | grep postgres

# Verificar conexión manual
psql "postgresql://user:password@host:5432/database"
```

**Soluciones:**
- Verificar credenciales en config.json o .env
- Verificar firewall/seguridad de red
- Para cloud: verificar IP whitelist
- Verificar que el puerto 5432 esté abierto

### No Detecta Impresoras

**Windows:**
```powershell
Get-Printer | Select-Object Name, DriverName, PortName
```

**Linux:**
```bash
lpstat -p -d
lpadmin -p
```

**Soluciones:**
- Verificar que la impresora esté instalada en el SO
- Verificar cables USB o conectividad de red
- En Linux: agregar usuario al grupo `lp` o `lpadmin`
  ```bash
  sudo usermod -a -G lp $USER
  ```
- Reinstalar drivers de la impresora

### Error en Facturación DIAN

| Error | Causa | Solución |
|-------|-------|----------|
| `401 Unauthorized` | Token inválido o expirado | Regenerar token en FacturaLatam.com |
| `400 Bad Request` | Datos inválidos | Revisar NIT, DV, datos tributarios |
| `404 Not Found` | Endpoint incorrecto | Verificar URL API en configuración |
| `500 Server Error` | Error en API DIAN | Contactar soporte FacturaLatam |
| `Resolución inválida` | Fuera de vigencia o rango | Actualizar resolución DIAN |

**Verificar conexión:**
```bash
# Test de conectividad
curl -X GET https://api.facturalatam.com/api/health
```

### La app va directo al dashboard sin login

Limpiar localStorage:

```javascript
// En la consola del navegador (F12 → Console)
localStorage.clear();
location.reload();
```

### Errores de Compilación

```bash
# Limpiar y reconstruir completamente
wails build -clean

# Limpiar caché de Go
go clean -cache

# Reinstalar node_modules
cd frontend
rm -rf node_modules package-lock.json
npm install
cd ..

# Build limpio
wails build
```

### Puerto WebSocket en Uso

Cambiar en `.env` o config.json:
```env
WS_PORT=8081
```

---

## 🔐 Seguridad

### Encriptación de Contraseñas

El sistema usa **bcrypt** con cost factor 10:

```go
// golang.org/x/crypto/bcrypt
hashedPassword := bcrypt.GenerateFromPassword([]byte(password), 10)
hashedPIN := bcrypt.GenerateFromPassword([]byte(pin), 10)
```

### Encriptación de Datos Sensibles

**AES-256-GCM** para datos en `config.json`:
- Password de base de datos
- Tokens de API

### Buenas Prácticas Recomendadas

**1. Credenciales:**
- ✅ Cambiar credenciales de admin inmediatamente
- ✅ Usar contraseñas únicas y seguras por empleado
- ✅ PINs de 4-6 dígitos únicos
- ❌ No reutilizar las credenciales de ejemplo

**2. Base de Datos:**
- ✅ Usar `sslmode=require` para BD remotas
- ✅ Configurar firewall para limitar acceso
- ✅ Backups automáticos diarios
- ✅ Encriptar backups
- ❌ No exponer PostgreSQL directamente a internet

**3. Archivos Sensibles:**
- ✅ `.env` está en `.gitignore` - **NUNCA** subir a Git
- ✅ `config.json` se genera automáticamente - **NO** compartir
- ✅ Usar variables de entorno en producción
- ❌ No hardcodear credenciales en el código

**4. Acceso y Auditoría:**
- ✅ Revisar permisos de roles regularmente
- ✅ Revisar logs de auditoría semanalmente
- ✅ Desactivar empleados inactivos (no eliminar)
- ✅ Monitorear intentos de login fallidos

**5. Facturación DIAN:**
- ✅ Proteger API Token de FacturaLatam
- ✅ Usar ambiente de testing antes de producción
- ✅ Validar resolución DIAN vigente
- ❌ No compartir credenciales DIAN

---

## 🏭 Build para Producción

### Build Estándar

```bash
# Windows
wails build

# Windows con optimización
wails build -clean -upx

# Linux
wails build -platform linux/amd64

# macOS
wails build -platform darwin/amd64
```

**Salida:**
```
build/bin/RestaurantPOS.exe      (Windows)
build/bin/RestaurantPOS          (Linux)
build/bin/RestaurantPOS.app      (macOS)
```

### Build Multiplataforma

```bash
# Desde Windows, build para Linux
wails build -platform linux/amd64

# Desde Linux, build para Windows
wails build -platform windows/amd64
```

### Optimización con UPX

Reduce el tamaño del ejecutable ~50%:

```bash
# Instalar UPX
# Windows: choco install upx
# Linux: sudo apt install upx
# macOS: brew install upx

# Build optimizado
wails build -clean -upx
```

### Distribución

**Windows:**
```
RestaurantPOS.exe → Copiar directamente
```

**Linux:**
```bash
# Crear instalador .deb (ejemplo)
dpkg-deb --build restaurant-pos_1.0.0_amd64
```

**macOS:**
```bash
# Firmar app (requiere Apple Developer Account)
codesign --force --deep --sign "Developer ID" RestaurantPOS.app
```

---

## 🌐 Proveedores de PostgreSQL Soportados

El sistema funciona con **cualquier PostgreSQL 14+**:

### Cloud (Recomendado)

| Proveedor | Free Tier | Pros | Ideal Para |
|-----------|-----------|------|------------|
| [Neon](https://neon.tech) | ✅ 3GB | Serverless, rápido | Producción pequeña |
| [Supabase](https://supabase.com) | ✅ 500MB | Extras gratuitos | Desarrollo + Producción |
| [Railway](https://railway.app) | ✅ $5 crédito | Fácil despliegue | Testing + Producción |
| [Render](https://render.com) | ✅ 1GB, 90 días | Simple setup | Producción |
| **AWS RDS** | ❌ Pago | Enterprise-grade | Gran escala |
| **Google Cloud SQL** | ❌ Pago | Alta disponibilidad | Empresarial |
| **Azure Database** | ❌ Pago | Integración Microsoft | Empresarial |

### Local/Auto-hospedado

- ✅ PostgreSQL nativo (Windows, Linux, macOS)
- ✅ Docker Compose
- ✅ Kubernetes
- ✅ Servidor dedicado

---

## 📞 Soporte y Contribución

### Reportar Issues

Si encuentras bugs o problemas:

1. **Verificar logs** primero (`AppData/PosApp/logs/`)
2. Abrir issue en GitHub con:
   - Descripción del problema
   - Pasos para reproducir
   - Logs relevantes (últimas 20 líneas)
   - Sistema operativo y versión

### Contribuir

Pull requests son bienvenidos! Por favor:

1. Fork el proyecto
2. Crear branch para feature (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push al branch (`git push origin feature/AmazingFeature`)
5. Abrir Pull Request

### Contacto

- **Developer**: Andrew Garcia Mosquera
- **Email**: andrewgarciamosquera@gmail.com

---

## 📄 Licencia

Este proyecto está bajo la licencia MIT. Ver archivo `LICENSE` para más detalles.

---

## 🙏 Agradecimientos

- [Wails](https://wails.io) - Framework desktop increíble
- [FacturaLatam.com](https://facturalatam.com) - API de facturación DIAN
- [Material-UI](https://mui.com) - Componentes React
- Comunidad Open Source

---

**Hecho con ❤️ para restaurantes en Colombia**
