#!/bin/bash
# Script de release para POS App
# Actualiza versiones en todos los archivos necesarios, crea tag y hace push

set -e  # Exit on error

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Funciones de output
success() { echo -e "${GREEN}$1${NC}"; }
error() { echo -e "${RED}$1${NC}"; }
info() { echo -e "${CYAN}$1${NC}"; }
warning() { echo -e "${YELLOW}$1${NC}"; }

# Banner
echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     🚀 Script de Release - Restaurant POS            ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# Validar que estamos en la raíz del proyecto
if [ ! -f "wails.json" ]; then
    error "❌ Error: Este script debe ejecutarse desde la raíz del proyecto (donde está wails.json)"
    exit 1
fi

# Verificar que git está instalado
if ! command -v git &> /dev/null; then
    error "❌ Error: Git no está instalado o no está en el PATH"
    exit 1
fi

# Verificar que jq está instalado (para manipular JSON)
if ! command -v jq &> /dev/null; then
    warning "⚠️  Advertencia: jq no está instalado. Instálalo para mejor manejo de JSON"
    warning "   Ubuntu/Debian: sudo apt-get install jq"
    warning "   macOS: brew install jq"
    echo ""
fi

# Verificar que no hay cambios sin commitear
if [ -n "$(git status --porcelain)" ]; then
    warning "⚠️  Tienes cambios sin commitear:"
    git status --short
    echo ""
    read -p "¿Deseas continuar de todas formas? (s/N): " response
    if [ "$response" != "s" ] && [ "$response" != "S" ]; then
        info "Operación cancelada"
        exit 0
    fi
fi

# Obtener versión actual
if command -v jq &> /dev/null; then
    CURRENT_VERSION=$(jq -r '.info.productVersion' wails.json)
else
    CURRENT_VERSION=$(grep -o '"productVersion": *"[^"]*"' wails.json | sed 's/"productVersion": *"\(.*\)"/\1/')
fi
info "📦 Versión actual: $CURRENT_VERSION"

# Obtener versionCode actual
CURRENT_VERSION_CODE=$(grep -o 'versionCode = [0-9]*' mobile-apps/kitchen/app/build.gradle.kts | sed 's/versionCode = //')
info "📱 VersionCode actual: $CURRENT_VERSION_CODE"

# Solicitar nueva versión
if [ -z "$1" ]; then
    echo ""
    read -p "Ingresa la nueva versión (formato: X.Y.Z, ejemplo: 1.2.0): " NEW_VERSION
else
    NEW_VERSION=$1
fi

# Validar formato de versión (semver)
if ! [[ $NEW_VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    error "❌ Error: Formato de versión inválido. Debe ser X.Y.Z (ejemplo: 1.2.0)"
    exit 1
fi

# Calcular nuevo versionCode
NEW_VERSION_CODE=$((CURRENT_VERSION_CODE + 1))

echo ""
info "📋 Resumen de cambios:"
echo "   • Wails App (wails.json):              $CURRENT_VERSION → $NEW_VERSION"
echo "   • Frontend (package.json):             $CURRENT_VERSION → $NEW_VERSION"
echo "   • Update Service (update_service.go):  $CURRENT_VERSION → $NEW_VERSION"
echo "   • Installer (setup.iss):               $CURRENT_VERSION → $NEW_VERSION"
echo "   • Kitchen App:                         $CURRENT_VERSION (code: $CURRENT_VERSION_CODE) → $NEW_VERSION (code: $NEW_VERSION_CODE)"
echo "   • Waiter App:                          $CURRENT_VERSION (code: $CURRENT_VERSION_CODE) → $NEW_VERSION (code: $NEW_VERSION_CODE)"
echo "   • Git tag:                             v$NEW_VERSION"
echo ""

read -p "¿Continuar con estos cambios? (s/N): " confirm
if [ "$confirm" != "s" ] && [ "$confirm" != "S" ]; then
    info "Operación cancelada"
    exit 0
fi

echo ""
info "🔄 Actualizando archivos..."

# 1. Actualizar wails.json
echo -n "   • wails.json..."
if command -v jq &> /dev/null; then
    # Usar jq si está disponible
    jq ".info.productVersion = \"$NEW_VERSION\"" wails.json > wails.json.tmp && mv wails.json.tmp wails.json
else
    # Usar sed como alternativa
    sed -i.bak "s/\"productVersion\": *\"[^\"]*\"/\"productVersion\": \"$NEW_VERSION\"/" wails.json && rm wails.json.bak
fi
success " ✓"

# 2. Actualizar mobile-apps/kitchen/app/build.gradle.kts
echo -n "   • kitchen/app/build.gradle.kts..."
sed -i.bak "s/versionCode = [0-9]*/versionCode = $NEW_VERSION_CODE/" mobile-apps/kitchen/app/build.gradle.kts
sed -i.bak "s/versionName = \"[^\"]*\"/versionName = \"$NEW_VERSION\"/" mobile-apps/kitchen/app/build.gradle.kts
rm mobile-apps/kitchen/app/build.gradle.kts.bak
success " ✓"

# 3. Actualizar mobile-apps/waiter/app/build.gradle.kts
echo -n "   • waiter/app/build.gradle.kts..."
sed -i.bak "s/versionCode = [0-9]*/versionCode = $NEW_VERSION_CODE/" mobile-apps/waiter/app/build.gradle.kts
sed -i.bak "s/versionName = \"[^\"]*\"/versionName = \"$NEW_VERSION\"/" mobile-apps/waiter/app/build.gradle.kts
rm mobile-apps/waiter/app/build.gradle.kts.bak
success " ✓"

# 4. Actualizar frontend/package.json
echo -n "   • frontend/package.json..."
sed -i.bak "s/\"version\": *\"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" frontend/package.json
rm frontend/package.json.bak
success " ✓"

# 5. Actualizar app/services/update_service.go
echo -n "   • app/services/update_service.go..."
sed -i.bak "s/CurrentVersion = \"[^\"]*\"/CurrentVersion = \"$NEW_VERSION\"/" app/services/update_service.go
rm app/services/update_service.go.bak
success " ✓"

# 6. Actualizar installer/setup.iss
echo -n "   • installer/setup.iss..."
sed -i.bak "s/#define MyAppVersion \"[^\"]*\"/#define MyAppVersion \"$NEW_VERSION\"/" installer/setup.iss
rm installer/setup.iss.bak
success " ✓"

echo ""
info "📝 Creando commit..."
git add wails.json mobile-apps/kitchen/app/build.gradle.kts mobile-apps/waiter/app/build.gradle.kts frontend/package.json app/services/update_service.go installer/setup.iss

COMMIT_MESSAGE="chore: bump version to $NEW_VERSION

- Update Wails app to version $NEW_VERSION
- Update Kitchen app to version $NEW_VERSION (versionCode: $NEW_VERSION_CODE)
- Update Waiter app to version $NEW_VERSION (versionCode: $NEW_VERSION_CODE)
- Update frontend package.json to version $NEW_VERSION
- Update update service to version $NEW_VERSION
- Update installer to version $NEW_VERSION"

git commit -m "$COMMIT_MESSAGE"
success "✓ Commit creado"

echo ""
info "🏷️  Creando tag v$NEW_VERSION..."
git tag -a "v$NEW_VERSION" -m "Release version $NEW_VERSION"
success "✓ Tag creado"

echo ""
info "📤 Haciendo push al repositorio remoto..."

# Obtener rama actual
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo -n "   • Push de commit..."
git push origin "$CURRENT_BRANCH"
success " ✓"

echo -n "   • Push de tag..."
git push origin "v$NEW_VERSION"
success " ✓"

echo ""
success "╔═══════════════════════════════════════════════════════╗"
success "║           🎉 Release v$NEW_VERSION completado!            ║"
success "╚═══════════════════════════════════════════════════════╝"
echo ""
info "Próximos pasos:"
echo "   1. Construir el ejecutable de Wails: wails build"
echo "   2. Construir APKs de Kitchen: cd mobile-apps/kitchen && ./gradlew assembleRelease"
echo "   3. Construir APKs de Waiter: cd mobile-apps/waiter && ./gradlew assembleRelease"
echo "   4. Crear release en GitHub con los binarios"
echo ""
info "Tag creado: v$NEW_VERSION"
info "Para ver el tag: git show v$NEW_VERSION"
info "Para eliminar el tag (si es necesario): git tag -d v$NEW_VERSION && git push origin :refs/tags/v$NEW_VERSION"
echo ""
