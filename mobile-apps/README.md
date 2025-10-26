# Apps Móviles POS - Kitchen & Waiter

Sistema de apps móviles para restaurante con Jetpack Compose que se comunican con el sistema POS principal vía WebSocket.

## Descripción General

### Kitchen App (Cocina)
App simple para visualizar órdenes en tiempo real y marcarlas como listas.

**Características:**
- 🔍 **Auto-descubrimiento**: Encuentra automáticamente el servidor POS en la red local
- 📱 **Órdenes activas**: Muestra todas las órdenes pendientes en tiempo real
- ✅ **Marcar como listo**: Un botón para indicar cuando el pedido está listo
- 📜 **Historial**: Guarda órdenes completadas con opción de deshacer si se marcó por error
- 🔔 **Notificaciones sonoras**: Alerta cuando llega una nueva orden (configurable)
- 🔄 **Reconexión automática**: Se reconecta automáticamente si se pierde la conexión

### Waiter App (Meseros)
App para tomar pedidos desde las mesas.

**Características:**
- 🔍 **Auto-descubrimiento**: Encuentra automáticamente el servidor POS en la red local
- 🍕 **Lista de productos**: Carga productos disponibles del servidor
- 🏷️ **Categorías**: Filtra productos por categoría
- 🛒 **Carrito de compras**: Agrega múltiples productos con cantidades
- 📝 **Comentarios por producto**: Agrega notas especiales (ej: "sin cebolla", "término medio")
- 🪑 **Selección de mesa**: Asigna el pedido a una mesa específica o para llevar
- 📤 **Envío en tiempo real**: Notifica al POS y cocina instantáneamente

## Arquitectura Técnica

### Tecnologías Utilizadas
- **Jetpack Compose**: UI moderna y declarativa
- **Kotlin Coroutines & Flow**: Manejo de estados reactivos
- **OkHttp WebSocket**: Comunicación en tiempo real
- **Gson**: Serialización JSON
- **Material Design 3**: UI components

### Comunicación

#### Auto-Descubrimiento
Las apps escanean la red local (192.168.x.x) buscando el servidor POS:
- Puerto WebSocket: `8080`
- Endpoint de salud: `/health`
- Tiempo de escaneo: ~10-30 segundos

#### WebSocket Protocol

**Conexión:**
```
ws://SERVER_IP:8080/ws?type=kitchen  // Kitchen app
ws://SERVER_IP:8080/ws?type=waiter   // Waiter app
```

**Tipos de Mensajes:**

Kitchen recibe:
- `kitchen_order`: Nueva orden
- `order_update`: Actualización de estado
- `heartbeat`: Keep-alive

Kitchen envía:
- `kitchen_update`: Orden lista/actualización de estado

Waiter envía:
- `order_new`: Nueva orden creada

### Estructura del Proyecto

```
mobile-apps/
├── kitchen/                    # App de cocina
│   └── app/src/main/java/com/drewcore/kitchen_app/
│       ├── data/
│       │   ├── models/        # Order, Product, Message
│       │   └── network/       # WebSocket, ServerDiscovery
│       └── ui/
│           ├── screens/       # ActiveOrders, History
│           └── viewmodel/     # KitchenViewModel
│
└── waiter/                    # App de meseros
    └── app/src/main/java/com/drewcore/waiter_app/
        ├── data/
        │   ├── models/        # Product, Cart, OrderRequest
        │   └── network/       # WebSocket, PosApiService
        └── ui/
            ├── screens/       # Products, Cart
            └── viewmodel/     # WaiterViewModel
```

## Uso

### Requisitos
- Android 9.0 (API 28) o superior
- Dispositivo conectado a la misma red WiFi que el servidor POS
- Servidor POS ejecutándose (puerto 8080)

### Instalación

1. **Compilar Kitchen App:**
```bash
cd mobile-apps/kitchen
./gradlew assembleDebug
# APK generado en: app/build/outputs/apk/debug/app-debug.apk
```

2. **Compilar Waiter App:**
```bash
cd mobile-apps/waiter
./gradlew assembleDebug
# APK generado en: app/build/outputs/apk/debug/app-debug.apk
```

3. **Instalar en dispositivo:**
```bash
adb install app-debug.apk
```

### Primera Ejecución

1. **Asegúrate que el servidor POS esté corriendo** en la misma red WiFi
2. **Abre la app** (Kitchen o Waiter)
3. **Espera el auto-descubrimiento** (~10-30 segundos)
4. **Conexión exitosa**: Verás el icono verde ✓ en la esquina superior

### Troubleshooting

**No encuentra el servidor:**
- Verifica que ambos dispositivos estén en la misma red WiFi
- Asegúrate que el firewall no bloquee el puerto 8080
- Presiona el botón de reconexión (🔄)

**Órde

nes no llegan a cocina:**
- Verifica conexión WebSocket activa (icono verde)
- Revisa logs del servidor POS
- Reconecta presionando 🔄

**Error al cargar productos (Waiter):**
- Verifica que el servidor tenga productos registrados
- Comprueba conexión de red
- Presiona 🔄 para reintentar

## Flujo de Trabajo Típico

### Kitchen App
1. App se conecta automáticamente
2. Nuevas órdenes aparecen en "Activas" con sonido de notificación
3. Cocina prepara el pedido
4. Presiona "MARCAR COMO LISTO"
5. Orden se mueve a "Historial"
6. Si se marcó por error, presiona "Deshacer" en historial

### Waiter App
1. App se conecta y carga productos
2. Mesero filtra por categoría si es necesario
3. Agrega productos al carrito (botón +)
4. En el carrito, ajusta cantidades y agrega notas
5. Presiona "ENVIAR PEDIDO"
6. Selecciona mesa o "Para Llevar"
7. Confirma envío
8. Orden llega a POS y Kitchen instantáneamente

## Configuración Avanzada

### Cambiar Puerto WebSocket
Edita en ambas apps:
- `ServerDiscovery.kt`: `WS_PORT`
- `WebSocketManager.kt`: `WS_PORT`

### Personalizar Sonidos (Kitchen)
Edita `KitchenViewModel.kt`, método `playNotificationSound()`:
```kotlin
val notification: Uri = RingtoneManager.getDefaultUri(
    RingtoneManager.TYPE_NOTIFICATION  // Cambia tipo aquí
)
```

### Deshabilitar Auto-Descubrimiento
Si tienes IP fija del servidor, modifica:
```kotlin
// ServerDiscovery.kt
suspend fun discoverServer(): String? {
    return "192.168.1.100"  // Tu IP fija
}
```

## API Endpoints Utilizados

### WebSocket
- `ws://SERVER:8080/ws?type=kitchen`
- `ws://SERVER:8080/ws?type=waiter`

### HTTP (Waiter App)
- `GET http://SERVER:8080/api/products` - Lista de productos
- `POST http://SERVER:8080/api/orders` - Crear nueva orden
- `GET http://SERVER:8080/health` - Health check

## Formato de Mensajes

### Nueva Orden (Kitchen recibe)
```json
{
  "type": "kitchen_order",
  "timestamp": "2025-10-28T10:30:00",
  "data": {
    "id": 123,
    "order_number": "W2510281030-001",
    "type": "dine-in",
    "table_id": 5,
    "items": [
      {
        "id": 1,
        "product": {
          "id": 10,
          "name": "Hamburguesa Clásica",
          "price": 25000
        },
        "quantity": 2,
        "notes": "Sin cebolla"
      }
    ],
    "created_at": "2025-10-28T10:30:00"
  }
}
```

### Actualización de Estado (Kitchen envía)
```json
{
  "type": "kitchen_update",
  "timestamp": "1730123456789",
  "data": {
    "order_id": 123,
    "status": "ready",
    "time": 1730123456789
  }
}
```

## 🔄 Auto-Actualización

Ambas apps incluyen un sistema de actualización automática que descarga e instala nuevas versiones desde GitHub Releases.

### Cómo Funciona

1. **Al abrir la app**: Verifica automáticamente si hay una nueva versión disponible
2. **Si encuentra actualización**: Muestra un diálogo con:
   - Versión nueva disponible
   - Notas de la versión (release notes)
   - Botones "Actualizar" o "Después"
3. **Al aceptar**: Descarga la APK en segundo plano
4. **Cuando termina**: Muestra notificación para instalar
5. **Un clic**: Instala la actualización automáticamente

### Configuración

El sistema está pre-configurado para buscar en:
```
Repositorio: DrewGGM/pos-app-wails
APKs: kitchen-app-v*.apk y waiter-app-v*.apk
```

Para cambiar el repositorio, edita `UpdateManager.kt`:
```kotlin
private val githubRepo = "tu-usuario/tu-repositorio"
```

### Publicar Actualizaciones

Las actualizaciones se publican automáticamente mediante GitHub Actions cuando creas un release:

```bash
# Crear tag y release
git tag v1.0.1
git push origin v1.0.1

# GitHub Actions automáticamente:
# 1. Compila ambas APKs
# 2. Las nombra: kitchen-app-v1.0.1.apk y waiter-app-v1.0.1.apk
# 3. Las publica en GitHub Releases
```

Las apps detectarán la actualización automáticamente al siguiente inicio.

### Requisitos de Usuario

- Android 8.0+ (API 26)
- Permitir instalación desde fuentes desconocidas (solo la primera vez)
- Conexión a internet para descargar actualizaciones

### Permisos Necesarios

Ya configurados en ambas apps:
- `REQUEST_INSTALL_PACKAGES` - Para instalar APKs
- `WRITE_EXTERNAL_STORAGE` - Para guardar APK descargado (Android < 13)
- `READ_EXTERNAL_STORAGE` - Para leer APK descargado (Android < 13)

## Próximas Mejoras Sugeridas

- [ ] Persistencia local con Room Database
- [ ] Modo offline con sincronización posterior
- [ ] Estadísticas de tiempo de preparación
- [ ] Priorización de órdenes
- [ ] Notificaciones push
- [ ] Multi-idioma
- [ ] Tema oscuro
- [ ] Impresión directa de tickets

## Soporte

Para problemas o sugerencias, contacta al equipo de desarrollo.

## Licencia

MIT License - Ver archivo LICENSE en el repositorio principal.
