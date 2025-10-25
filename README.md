# Restaurant POS System

Sistema de Punto de Venta (POS) completo para restaurantes construido con Wails (Go + React + TypeScript).

## Características

### 🍽️ Gestión de Ventas
- Sistema POS completo con interfaz táctil
- Gestión de órdenes y mesas
- Múltiples métodos de pago
- Impresión de tickets y facturas
- Facturación electrónica (DIAN - Colombia)

### 📊 Gestión de Negocio
- Inventario de productos y categorías
- Gestión de clientes y empleados
- Reportes de ventas y caja
- Áreas y distribución de mesas
- Sincronización offline/online

### 🖨️ Sistema de Impresión
- Detección automática de impresoras del sistema
- Soporte para impresoras térmicas (USB/Red)
- Formatos 58mm y 80mm
- Impresión de tickets, facturas y reportes
- Comandas de cocina

### 🔐 Seguridad y Control
- Autenticación de usuarios con PIN
- Roles y permisos (admin, cajero, mesero, cocina)
- Passwords hasheados con bcrypt
- Registro de auditoría
- Cierre de caja con verificación

## Tecnologías

- **Backend**: Go 1.21+ con GORM
- **Frontend**: React 18 + TypeScript + Material-UI v5
- **Desktop**: Wails v2
- **Base de Datos**: PostgreSQL 14+
- **Hash**: bcrypt (golang.org/x/crypto/bcrypt)

## Requisitos Previos

- Go 1.21 o superior
- Node.js 18+ y npm
- PostgreSQL 14+ (local, cloud, o Docker)
- Wails CLI v2

### Instalar Wails

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

## Configuración Rápida

### 1. Base de Datos

```bash
# Copiar archivo de ejemplo
cp .env.example .env
```

Edita `.env` con tu configuración:

**Opción A: URL completa** (recomendado para servicios cloud)
```env
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
```

**Opción B: Variables individuales** (recomendado para local)
```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=posapp
DB_SSLMODE=disable
```

**Ejemplos de proveedores:**
- **Neon**: `postgresql://user:pass@host.neon.tech/db?sslmode=require`
- **Supabase**: `postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres`
- **AWS RDS**: `postgresql://user:pass@xxx.rds.amazonaws.com:5432/db`
- **Local**: `postgresql://postgres:password@localhost:5432/posapp`

### 2. Instalar Dependencias

```bash
# Backend
go mod download

# Frontend
cd frontend && npm install && cd ..
```

### 3. Crear Primer Usuario Administrador

⚠️ **IMPORTANTE**: La aplicación NO crea usuarios por defecto por seguridad.

**Ejecuta el script SQL incluido:**

```bash
# Opción 1: Desde línea de comandos
psql "postgresql://user:password@host:5432/database" -f scripts/init_default_users_and_customers.sql

# Opción 2: Desde psql interactivo
psql "postgresql://user:password@host:5432/database"
\i scripts/init_default_users_and_customers.sql
```

**Credenciales por defecto:**
- Username: `admin`
- Password: `admin123`
- PIN: `1234`

⚠️ **Cambia estas credenciales INMEDIATAMENTE después del primer login en Settings → Empleados**

### 4. Iniciar la Aplicación

```bash
# Modo desarrollo
wails dev

# Build para producción
wails build
```

## Configuración de Impresoras

1. Inicia la aplicación y logueate
2. Ve a **Settings → Impresoras**
3. Clic en **"Detectar Impresoras"** para escanear impresoras instaladas
4. Selecciona tu impresora y configura:
   - Nombre
   - Tipo de conexión (USB, Red, Serial)
   - Ancho de papel (58mm o 80mm)
   - Marca como "Impresora Principal"
5. Prueba con **"Imprimir Prueba"**

**Nota**: Las impresoras deben estar instaladas en el sistema operativo para ser detectadas.

## Variables de Entorno

| Variable | Descripción | Default | Requerido |
|----------|-------------|---------|-----------|
| `DATABASE_URL` | URL completa de PostgreSQL | - | Sí* |
| `DB_HOST` | Host de PostgreSQL | localhost | Sí* |
| `DB_PORT` | Puerto de PostgreSQL | 5432 | No |
| `DB_USER` | Usuario de PostgreSQL | postgres | Sí* |
| `DB_PASSWORD` | Contraseña de PostgreSQL | - | Sí* |
| `DB_NAME` | Nombre de la BD | posapp | No |
| `DB_SSLMODE` | Modo SSL (disable/require) | disable | No |
| `WS_PORT` | Puerto WebSocket | 8080 | No |

*Usa `DATABASE_URL` O las variables individuales (`DB_HOST`, `DB_USER`, etc.)

## Troubleshooting

### La app va directo al dashboard sin login

Limpia el localStorage:

```javascript
// En la consola del navegador (F12 → Console)
localStorage.clear();
location.reload();
```

### Error de conexión a base de datos

```bash
# Verificar conexión manualmente
psql "postgresql://user:password@host:5432/database"

# Verificar que PostgreSQL esté corriendo
# Linux:
sudo systemctl status postgresql

# Docker:
docker ps | grep postgres
```

### No detecta impresoras

**Windows:**
```powershell
Get-Printer | Select-Object Name, DriverName, PortName
```

**Linux/macOS:**
```bash
lpstat -p -d
```

- Verifica que las impresoras estén instaladas y encendidas
- Verifica cables USB o conectividad de red
- En Linux, asegúrate de estar en el grupo `lp` o `lpadmin`

### Errores de compilación

```bash
# Limpiar y reconstruir
wails build -clean
go mod tidy

# Si persiste
rm -rf build/bin frontend/dist frontend/node_modules
cd frontend && npm install && cd ..
wails build
```

### Puerto WebSocket en uso

Cambiar en `.env`:
```env
WS_PORT=8081
```

## Seguridad

### Hash de Contraseñas

El sistema usa **bcrypt** con cost factor 10:

```go
// Librería: golang.org/x/crypto/bcrypt
hashedPassword, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
hashedPIN, _ := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost)
```

### Buenas Prácticas

1. **Credenciales**:
   - Cambia las credenciales del admin inmediatamente después del primer login
   - Usa contraseñas y PINs únicos para cada empleado
   - No reutilices las credenciales de ejemplo

2. **Base de Datos**:
   - Usa `sslmode=require` para bases de datos remotas
   - Configura firewall para permitir solo IPs confiables
   - Haz backups automáticos regulares

3. **Archivos**:
   - `.env` está en `.gitignore` - **NUNCA** lo subas a Git
   - Usa variables de entorno del sistema en producción
   - Considera usar servicios de secrets management (AWS Secrets Manager, Vault, etc.)

4. **Acceso**:
   - Revisa los permisos de roles regularmente
   - Revisa los logs de auditoría periódicamente
   - Desactiva empleados que ya no trabajan en lugar de eliminarlos

## Build para Producción

```bash
# Build estándar
wails build

# Build optimizado con compresión UPX
wails build -clean -upx

# Binario estará en: build/bin/
```

## Proveedores de PostgreSQL Soportados

El sistema funciona con **cualquier PostgreSQL 14+**:

- ✅ **Cloud**: Neon, Supabase, Railway, Render
- ✅ **Grandes proveedores**: AWS RDS, Google Cloud SQL, Azure Database
- ✅ **Auto-hospedado**: PostgreSQL local, Docker, Kubernetes

## Licencia

MIT License
