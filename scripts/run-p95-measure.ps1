<#
.SYNOPSIS
    Ejecuta la medición de p95 de paginación para un tenant.
.DESCRIPTION
    Wrapper PowerShell para scripts/p95-pagination-measure.sql.
    Lee credenciales de variables de entorno (PGHOST, PGPORT, PGDATABASE,
    PGUSER, PGPASSWORD), las valida y ejecuta psql con el SQL de medición.

    Variables de entorno requeridas:
      PGHOST      - Host de PostgreSQL
      PGPORT      - Puerto (default: 5432)
      PGDATABASE  - Base de datos
      PGUSER      - Usuario
      PGPASSWORD  - Contraseña

.PARAMETER TenantSchema
    Nombre del schema del tenant a medir (ej: 'tenant_demo').

.PARAMETER Force
    Omite la confirmación interactiva.

.EXAMPLE
    # Usar variables de entorno y pasar schema
    $env:PGHOST = "localhost"
    $env:PGPORT = "5432"
    $env:PGDATABASE = "iwana"
    $env:PGUSER = "postgres"
    $env:PGPASSWORD = "secret"
    .\scripts\run-p95-measure.ps1 -TenantSchema "tenant_demo"

.EXAMPLE
    # Con .env cargado previamente y sin confirmación
    .\scripts\run-p95-measure.ps1 tenant_iwana -Force
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$TenantSchema,

    [Parameter()]
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# ── Validar variables de entorno ──────────────────────────────────────────
$requiredVars = @(
    @{Name = "PGHOST";     Desc = "Host de PostgreSQL"},
    @{Name = "PGPORT";     Desc = "Puerto de PostgreSQL"},
    @{Name = "PGDATABASE"; Desc = "Nombre de la base de datos"},
    @{Name = "PGUSER";     Desc = "Usuario de PostgreSQL"},
    @{Name = "PGPASSWORD"; Desc = "Contraseña de PostgreSQL"}
)

$missing = @()
foreach ($var in $requiredVars) {
    $value = [Environment]::GetEnvironmentVariable($var.Name)
    if ([string]::IsNullOrEmpty($value)) {
        $missing += $var
    }
}

if ($missing.Count -gt 0) {
    Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Red
    Write-Host "║  ERROR: Variables de entorno requeridas no definidas         ║" -ForegroundColor Red
    Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Red
    foreach ($m in $missing) {
        Write-Host ("║  {0,-20} — {1,-34} ║" -f $m.Name, $m.Desc) -ForegroundColor Red
    }
    Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Red
    Write-Host ""
    Write-Host "Define las variables antes de ejecutar:" -ForegroundColor Yellow
    Write-Host '  $env:PGHOST = "localhost"' -ForegroundColor Yellow
    Write-Host '  $env:PGPORT = "5432"' -ForegroundColor Yellow
    Write-Host '  $env:PGDATABASE = "iwana"' -ForegroundColor Yellow
    Write-Host '  $env:PGUSER = "postgres"' -ForegroundColor Yellow
    Write-Host '  $env:PGPASSWORD = "your-password"' -ForegroundColor Yellow
    exit 1
}

# ── Validar que psql está disponible ──────────────────────────────────────
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    Write-Error "ERROR: psql no encontrado en el PATH. Instala PostgreSQL client tools."
    Write-Host "  Descarga: https://www.postgresql.org/download/" -ForegroundColor Yellow
    exit 1
}

# ── Validar que el archivo SQL existe ─────────────────────────────────────
$sqlFile = Join-Path $PSScriptRoot "p95-pagination-measure.sql"
if (-not (Test-Path $sqlFile)) {
    Write-Error "ERROR: Archivo SQL no encontrado: $sqlFile"
    exit 1
}

# ── Banner ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  P95 Pagination Measurement — iWana neXt                    ║" -ForegroundColor Cyan
Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host ("║  Schema:   {0,-49} ║" -f $TenantSchema) -ForegroundColor Cyan
Write-Host ("║  Host:     {0,-49} ║" -f "$env:PGHOST`:$env:PGPORT") -ForegroundColor Cyan
Write-Host ("║  Database: {0,-49} ║" -f $env:PGDATABASE) -ForegroundColor Cyan
Write-Host ("║  User:     {0,-49} ║" -f $env:PGUSER) -ForegroundColor Cyan
Write-Host ("║  SQL file: {0,-49} ║" -f (Split-Path $sqlFile -Leaf)) -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Confirmación (si es terminal interactiva y no se forzó) ──────────────
if (-not $Force -and [Environment]::UserInteractive) {
    Write-Host "ADVERTENCIA: Este script ejecuta ~3,750 consultas contra el tenant '$TenantSchema'." -ForegroundColor Yellow
    Write-Host "  - 25 recursos × 3 tipos de consulta × 50 iteraciones" -ForegroundColor Yellow
    Write-Host "  - Se recomienda ejecutar en staging con dump anonimizado, no en producción." -ForegroundColor Yellow
    Write-Host ""
    $confirmation = Read-Host "¿Continuar? (s/N)"
    if ($confirmation -notmatch '^[sSyY]') {
        Write-Host "Ejecución cancelada por el usuario." -ForegroundColor Yellow
        exit 0
    }
}

# ── Ejecutar psql ─────────────────────────────────────────────────────────
Write-Host "[P95] Ejecutando medición..." -ForegroundColor Green
Write-Host ""

$startTime = Get-Date

# Construir argumentos para psql
# PGPASSWORD se pasa como variable de entorno; psql la lee automáticamente
$psqlArgs = @(
    "-h", $env:PGHOST,
    "-p", $env:PGPORT,
    "-d", $env:PGDATABASE,
    "-U", $env:PGUSER,
    "-v", "tenant_schema=$TenantSchema",
    "-f", $sqlFile
)

# Ejecutar psql directamente (la salida fluye a la consola)
& psql @psqlArgs
$exitCode = $LASTEXITCODE
$duration = (Get-Date) - $startTime

# ── Mostrar resultado ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "══════════════════════════════════════════════════════════════" `
    -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })

if ($exitCode -eq 0) {
    Write-Host "  [P95] Medición completada exitosamente" -ForegroundColor Green
    Write-Host "  Duración total: $($duration.ToString('hh\:mm\:ss'))" -ForegroundColor Green
} else {
    Write-Host "  [P95] ERROR: psql terminó con código $exitCode" -ForegroundColor Red
    Write-Host "  Duración: $($duration.ToString('hh\:mm\:ss'))" -ForegroundColor Red
}

Write-Host "══════════════════════════════════════════════════════════════" `
    -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })

# Asegurar que PGPASSWORD se limpia de la sesión si fue seteada aquí
# (psql ya la consumió; no es necesario limpiarla explícitamente)

exit $exitCode
