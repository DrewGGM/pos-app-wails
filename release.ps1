#!/usr/bin/env pwsh
# Script de release para POS App
# Actualiza versiones en todos los archivos necesarios, crea tag y hace push

param(
    [Parameter(Mandatory=$false)]
    [string]$Version
)

# Colores para output
function Write-Success { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Error { param($msg) Write-Host $msg -ForegroundColor Red }
function Write-Info { param($msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Warning { param($msg) Write-Host $msg -ForegroundColor Yellow }

# Banner
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     🚀 Script de Release - Restaurant POS            ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Validar que estamos en la raíz del proyecto
if (-not (Test-Path "wails.json")) {
    Write-Error "❌ Error: Este script debe ejecutarse desde la raíz del proyecto (donde está wails.json)"
    exit 1
}

# Verificar que git está instalado
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "❌ Error: Git no está instalado o no está en el PATH"
    exit 1
}

# Verificar que no hay cambios sin commitear
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Warning "⚠️  Tienes cambios sin commitear:"
    git status --short
    Write-Host ""
    $response = Read-Host "¿Deseas continuar de todas formas? (s/N)"
    if ($response -ne "s" -and $response -ne "S") {
        Write-Info "Operación cancelada"
        exit 0
    }
}

# Check for unpushed commits
$unpushedCommits = git log --branches --not --remotes 2>$null
if ($unpushedCommits) {
    Write-Warning "⚠️  Tienes commits sin hacer push al remoto"
    $commitCount = (git log --oneline --branches --not --remotes | Measure-Object -Line).Lines
    Write-Host "   Commits pendientes: $commitCount"

    # Check if there's a version bump commit
    $hasVersionBump = git log --oneline --branches --not --remotes | Select-String "chore: bump version"
    if ($hasVersionBump) {
        Write-Warning "   ⚠️  Detectado commit de versión previo sin push"
        Write-Host ""
        $response = Read-Host "¿Deseas hacer push de los commits existentes antes de continuar? (S/n)"
        if ($response -ne "n" -and $response -ne "N") {
            Write-Info "   Haciendo push..."
            $currentBranch = git rev-parse --abbrev-ref HEAD
            git push origin $currentBranch

            # Also push any existing tags
            $unpushedTags = git tag --points-at HEAD
            if ($unpushedTags) {
                foreach ($tag in $unpushedTags) {
                    Write-Info "   Haciendo push del tag $tag..."
                    git push origin $tag
                }
            }
            Write-Success "   ✓ Push completado"
            Write-Host ""
        }
    } else {
        Write-Host ""
        $response = Read-Host "¿Deseas continuar de todas formas? (s/N)"
        if ($response -ne "s" -and $response -ne "S") {
            Write-Info "Operación cancelada"
            exit 0
        }
    }
}

# Obtener versión actual
$wailsJson = Get-Content "wails.json" | ConvertFrom-Json
$currentVersion = $wailsJson.info.productVersion
Write-Info "📦 Versión actual: $currentVersion"

# Obtener versionCode actual
$kitchenBuild = Get-Content "mobile-apps/kitchen/app/build.gradle.kts" -Raw
if ($kitchenBuild -match 'versionCode = (\d+)') {
    $currentVersionCode = [int]$matches[1]
} else {
    Write-Error "❌ No se pudo leer el versionCode actual"
    exit 1
}
Write-Info "📱 VersionCode actual: $currentVersionCode"

# Solicitar nueva versión si no se proporcionó
if (-not $Version) {
    Write-Host ""
    Write-Host "Ingresa la nueva versión (formato: X.Y.Z, ejemplo: 1.2.0):" -NoNewline
    $Version = Read-Host " "
}

# Validar formato de versión (semver)
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Error "❌ Error: Formato de versión inválido. Debe ser X.Y.Z (ejemplo: 1.2.0)"
    exit 1
}

# Calcular nuevo versionCode
$newVersionCode = $currentVersionCode + 1

Write-Host ""
Write-Info "📋 Resumen de cambios:"
Write-Host "   • Wails App (wails.json):              $currentVersion → $Version"
Write-Host "   • Frontend (package.json):             $currentVersion → $Version"
Write-Host "   • Update Service (update_service.go):  $currentVersion → $Version"
Write-Host "   • Installer (setup.iss):               $currentVersion → $Version"
Write-Host "   • Kitchen App:                         $currentVersion (code: $currentVersionCode) → $Version (code: $newVersionCode)"
Write-Host "   • Waiter App:                          $currentVersion (code: $currentVersionCode) → $Version (code: $newVersionCode)"
Write-Host "   • Git tag:                             v$Version"
Write-Host ""

$confirm = Read-Host "¿Continuar con estos cambios? (s/N)"
if ($confirm -ne "s" -and $confirm -ne "S") {
    Write-Info "Operación cancelada"
    exit 0
}

Write-Host ""
Write-Info "🔄 Actualizando archivos..."

# 1. Actualizar wails.json
Write-Host "   • wails.json..." -NoNewline
$wailsContent = Get-Content "wails.json" -Raw
$wailsContent = $wailsContent -replace '"productVersion":\s*"[^"]*"', "`"productVersion`": `"$Version`""
Set-Content "wails.json" -Value $wailsContent -NoNewline
Write-Success " ✓"

# 2. Actualizar mobile-apps/kitchen/app/build.gradle.kts
Write-Host "   • kitchen/app/build.gradle.kts..." -NoNewline
$kitchenContent = Get-Content "mobile-apps/kitchen/app/build.gradle.kts" -Raw
$kitchenContent = $kitchenContent -replace 'versionCode = \d+', "versionCode = $newVersionCode"
$kitchenContent = $kitchenContent -replace 'versionName = "[^"]*"', "versionName = `"$Version`""
Set-Content "mobile-apps/kitchen/app/build.gradle.kts" -Value $kitchenContent -NoNewline
Write-Success " ✓"

# 3. Actualizar mobile-apps/waiter/app/build.gradle.kts
Write-Host "   • waiter/app/build.gradle.kts..." -NoNewline
$waiterContent = Get-Content "mobile-apps/waiter/app/build.gradle.kts" -Raw
$waiterContent = $waiterContent -replace 'versionCode = \d+', "versionCode = $newVersionCode"
$waiterContent = $waiterContent -replace 'versionName = "[^"]*"', "versionName = `"$Version`""
Set-Content "mobile-apps/waiter/app/build.gradle.kts" -Value $waiterContent -NoNewline
Write-Success " ✓"

# 4. Actualizar frontend/package.json
Write-Host "   • frontend/package.json..." -NoNewline
$packageContent = Get-Content "frontend/package.json" -Raw
$packageContent = $packageContent -replace '"version":\s*"[^"]*"', "`"version`": `"$Version`""
Set-Content "frontend/package.json" -Value $packageContent -NoNewline
Write-Success " ✓"

# 5. Actualizar app/services/update_service.go
Write-Host "   • app/services/update_service.go..." -NoNewline
$updateServiceContent = Get-Content "app/services/update_service.go" -Raw
$updateServiceContent = $updateServiceContent -replace 'CurrentVersion = "[^"]*"', "CurrentVersion = `"$Version`""
Set-Content "app/services/update_service.go" -Value $updateServiceContent -NoNewline
Write-Success " ✓"

# 6. Actualizar installer/setup.iss
Write-Host "   • installer/setup.iss..." -NoNewline
$setupContent = Get-Content "installer/setup.iss" -Raw
$setupContent = $setupContent -replace '#define MyAppVersion "[^"]*"', "#define MyAppVersion `"$Version`""
Set-Content "installer/setup.iss" -Value $setupContent -NoNewline
Write-Success " ✓"

Write-Host ""
Write-Info "📝 Creando commit..."
git add wails.json mobile-apps/kitchen/app/build.gradle.kts mobile-apps/waiter/app/build.gradle.kts frontend/package.json app/services/update_service.go installer/setup.iss

$commitMessage = "chore: bump version to $Version

- Update Wails app to version $Version
- Update Kitchen app to version $Version (versionCode: $newVersionCode)
- Update Waiter app to version $Version (versionCode: $newVersionCode)
- Update frontend package.json to version $Version
- Update update service to version $Version
- Update installer to version $Version"

git commit -m $commitMessage

if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Error al crear el commit"
    exit 1
}
Write-Success "✓ Commit creado"

Write-Host ""
Write-Info "🏷️  Creando tag v$Version..."

# Check if tag already exists locally
$tagExists = git tag -l "v$Version"
if ($tagExists) {
    Write-Warning "⚠️  El tag v$Version ya existe localmente"
    $response = Read-Host "¿Deseas eliminarlo y crearlo nuevamente? (s/N)"
    if ($response -eq "s" -or $response -eq "S") {
        Write-Info "   Eliminando tag existente..."
        git tag -d "v$Version"
        # Also try to delete from remote if it exists
        git push origin ":refs/tags/v$Version" 2>$null
    } else {
        Write-Info "   Usando tag existente"
    }
}

# Create tag if it doesn't exist
if (-not (git tag -l "v$Version")) {
    git tag -a "v$Version" -m "Release version $Version"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "❌ Error al crear el tag"
        exit 1
    }
    Write-Success "✓ Tag creado"
} else {
    Write-Success "✓ Tag existente confirmado"
}

Write-Host ""
Write-Info "📤 Haciendo push al repositorio remoto..."

# Obtener rama actual
$currentBranch = git rev-parse --abbrev-ref HEAD

Write-Host "   • Push de commit..." -NoNewline
git push origin $currentBranch
if ($LASTEXITCODE -ne 0) {
    Write-Error " ✗"
    Write-Error "❌ Error al hacer push del commit"
    exit 1
}
Write-Success " ✓"

Write-Host "   • Push de tag..." -NoNewline
git push origin "v$Version"
if ($LASTEXITCODE -ne 0) {
    Write-Error " ✗"
    Write-Error "❌ Error al hacer push del tag"
    exit 1
}
Write-Success " ✓"

Write-Host ""
Write-Success "╔═══════════════════════════════════════════════════════╗"
Write-Success "║           🎉 Release v$Version completado!            ║"
Write-Success "╚═══════════════════════════════════════════════════════╝"
Write-Host ""
Write-Info "Próximos pasos:"
Write-Host "   1. Construir el ejecutable de Wails: wails build"
Write-Host "   2. Construir APKs de Kitchen: cd mobile-apps/kitchen && ./gradlew assembleRelease"
Write-Host "   3. Construir APKs de Waiter: cd mobile-apps/waiter && ./gradlew assembleRelease"
Write-Host "   4. Crear release en GitHub con los binarios"
Write-Host ""
Write-Info "Tag creado: v$Version"
Write-Info "Para ver el tag: git show v$Version"
Write-Info "Para eliminar el tag (si es necesario): git tag -d v$Version && git push origin :refs/tags/v$Version"
Write-Host ""
