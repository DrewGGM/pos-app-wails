# 🚀 Guía de Releases

Este documento explica cómo crear y publicar nuevas versiones del Restaurant POS System.

## 📋 Pre-requisitos

- Git instalado y configurado
- Permisos de push al repositorio remoto
- Estar en la rama principal (main/master)

### Para Linux/Mac:
- `jq` instalado (opcional, pero recomendado):
  ```bash
  # Ubuntu/Debian
  sudo apt-get install jq

  # macOS
  brew install jq
  ```

## 🎯 Uso Rápido

### Windows (PowerShell)
```powershell
# Forma interactiva (el script te pedirá la versión)
./release.ps1

# O especificar la versión directamente
./release.ps1 -Version 1.2.0
```

### Linux/Mac (Bash)
```bash
# Forma interactiva
./release.sh

# O especificar la versión directamente
./release.sh 1.2.0
```

## 📝 ¿Qué hace el script?

El script automatiza todo el proceso de release:

1. **Validaciones iniciales:**
   - Verifica que estás en la raíz del proyecto
   - Verifica que Git está instalado
   - Muestra advertencia si hay cambios sin commitear

2. **Muestra información actual:**
   - Versión actual de las aplicaciones
   - VersionCode actual de las apps Android

3. **Solicita la nueva versión:**
   - Formato semver: `X.Y.Z` (ejemplo: `1.2.0`)
   - Valida el formato

4. **Actualiza automáticamente 6 archivos:**
   - `wails.json` → `productVersion`
   - `frontend/package.json` → `version`
   - `app/services/update_service.go` → `CurrentVersion` (servicio de actualización automática)
   - `installer/setup.iss` → `MyAppVersion` (instalador de Windows)
   - `mobile-apps/kitchen/app/build.gradle.kts` → `versionCode` y `versionName`
   - `mobile-apps/waiter/app/build.gradle.kts` → `versionCode` y `versionName`
   - El `versionCode` se incrementa automáticamente en +1

5. **Crea commit y tag:**
   - Commit con mensaje descriptivo
   - Tag anotado con formato `vX.Y.Z`

6. **Hace push:**
   - Push del commit a la rama actual
   - Push del tag al remoto

## 🔢 Versionado Semántico (SemVer)

Usa el formato `MAJOR.MINOR.PATCH`:

- **MAJOR** (X.0.0): Cambios incompatibles con versiones anteriores
- **MINOR** (0.X.0): Nueva funcionalidad compatible con versiones anteriores
- **PATCH** (0.0.X): Correcciones de bugs compatibles

### Ejemplos:
- `1.0.0` → Primera versión estable
- `1.1.0` → Nueva funcionalidad (ej: agregar módulo de inventario)
- `1.1.1` → Corrección de bugs
- `2.0.0` → Cambio mayor (ej: nueva arquitectura de base de datos)

## 📦 Después del Release

Una vez ejecutado el script, sigue estos pasos para completar el release:

### 1. Construir Ejecutable de Wails (Windows)
```powershell
wails build
```
El ejecutable estará en: `build/bin/RestaurantPOS.exe`

### 2. Construir APK de Kitchen
```bash
cd mobile-apps/kitchen
./gradlew assembleRelease
```
El APK estará en: `app/build/outputs/apk/release/app-release.apk`

### 3. Construir APK de Waiter
```bash
cd mobile-apps/waiter
./gradlew assembleRelease
```
El APK estará en: `app/build/outputs/apk/release/app-release.apk`

### 4. Crear Release en GitHub

1. Ve a tu repositorio en GitHub
2. Navega a **Releases** → **Draft a new release**
3. Selecciona el tag recién creado (ej: `v1.2.0`)
4. Título: `Restaurant POS v1.2.0`
5. Descripción: Resume los cambios principales (changelog)
6. Adjunta los binarios:
   - `RestaurantPOS.exe` (renombrar a `RestaurantPOS-v1.2.0-windows.exe`)
   - `kitchen-app-release.apk` (renombrar a `KitchenApp-v1.2.0.apk`)
   - `waiter-app-release.apk` (renombrar a `WaiterApp-v1.2.0.apk`)
7. Click en **Publish release**

## 🎨 Ejemplo Completo

```powershell
# 1. Ejecutar script de release
./release.ps1 -Version 1.2.0

# Output:
# ╔═══════════════════════════════════════════════════════╗
# ║     🚀 Script de Release - Restaurant POS            ║
# ╚═══════════════════════════════════════════════════════╝
#
# 📦 Versión actual: 1.1.0
# 📱 VersionCode actual: 2
#
# 📋 Resumen de cambios:
#    • Wails App (wails.json):              1.1.0 → 1.2.0
#    • Frontend (package.json):             1.1.0 → 1.2.0
#    • Update Service (update_service.go):  1.1.0 → 1.2.0
#    • Kitchen App:                         1.1.0 (code: 2) → 1.2.0 (code: 3)
#    • Waiter App:                          1.1.0 (code: 2) → 1.2.0 (code: 3)
#    • Git tag:                             v1.2.0
#
# ¿Continuar con estos cambios? (s/N): s
#
# 🔄 Actualizando archivos...
#    • wails.json... ✓
#    • frontend/package.json... ✓
#    • app/services/update_service.go... ✓
#    • installer/setup.iss... ✓
#    • kitchen/app/build.gradle.kts... ✓
#    • waiter/app/build.gradle.kts... ✓
#
# 📝 Creando commit...
# ✓ Commit creado
#
# 🏷️  Creando tag v1.2.0...
# ✓ Tag creado
#
# 📤 Haciendo push al repositorio remoto...
#    • Push de commit... ✓
#    • Push de tag... ✓
#
# ╔═══════════════════════════════════════════════════════╗
# ║           🎉 Release v1.2.0 completado!            ║
# ╚═══════════════════════════════════════════════════════╝

# 2. Construir ejecutables
wails build

# 3. Construir APKs
cd mobile-apps/kitchen && ./gradlew assembleRelease
cd ../waiter && ./gradlew assembleRelease

# 4. Crear release en GitHub con los binarios
```

## 🔧 Solución de Problemas

### Error: "Este script debe ejecutarse desde la raíz del proyecto"
**Solución:** Navega a la carpeta donde está `wails.json`:
```bash
cd c:/Users/andre/Downloads/AppPos-Wails/PosApp
```

### Error: "Git no está instalado"
**Solución:** Instala Git:
- Windows: https://git-scm.com/download/win
- Linux: `sudo apt-get install git`
- Mac: `brew install git`

### Error al hacer push
**Posibles causas:**
1. No tienes permisos en el repositorio remoto
2. No estás autenticado con Git
3. El tag ya existe

**Solución:**
```bash
# Verificar configuración de Git
git config --list

# Verificar remoto
git remote -v

# Si el tag existe y quieres reemplazarlo:
git tag -d v1.2.0
git push origin :refs/tags/v1.2.0
./release.ps1 -Version 1.2.0
```

### Deshacer un release
Si cometiste un error y necesitas deshacer el release:

```bash
# 1. Eliminar el tag localmente
git tag -d v1.2.0

# 2. Eliminar el tag del remoto
git push origin :refs/tags/v1.2.0

# 3. Revertir el commit (si no has hecho más commits después)
git reset --hard HEAD~1

# 4. Hacer force push (¡CUIDADO! solo si estás seguro)
git push origin main --force
```

## 📚 Referencias

- [Semantic Versioning](https://semver.org/)
- [Git Tagging](https://git-scm.com/book/en/v2/Git-Basics-Tagging)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github)

## 💡 Tips

1. **Siempre haz un commit de todos los cambios antes de ejecutar el script de release**
2. **Prueba tu aplicación antes de crear un release**
3. **Documenta los cambios importantes en el changelog del release de GitHub**
4. **Usa versionado semántico consistente**
5. **No elimines tags antiguos del remoto** (a menos que sea absolutamente necesario)

## 📞 Soporte

Si encuentras problemas con el script de release, por favor:
1. Revisa esta guía
2. Verifica los logs de Git
3. Reporta el issue en GitHub con el mensaje de error completo
