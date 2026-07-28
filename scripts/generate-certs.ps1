<#
.SYNOPSIS
    Genera certificado SSL autofirmado para staging/PoC de iWana neXt.
.DESCRIPTION
    Crea un par {crt,key} autofirmado en secrets/iwana-selfsigned.{crt,key}.
    En producción, reemplazar por certificado firmado por CA (Let's Encrypt,
    corporativo, etc.) y rotar según política de seguridad.

    Requiere: OpenSSL instalado y accesible en PATH.
    Uso:       pwsh scripts/generate-certs.ps1
.NOTES
    Los archivos generados están en .gitignore (secrets/*.pem, secrets/*.key,
    secrets/*.crt). El directorio secrets/ se monta como volumen en el
    contenedor nginx-prod.
#>

$ErrorActionPreference = 'Stop'
$secretsDir = Join-Path $PSScriptRoot '..' 'secrets' | Resolve-Path
$certFile   = Join-Path $secretsDir 'iwana-selfsigned.crt'
$keyFile    = Join-Path $secretsDir 'iwana-selfsigned.key'

# Verificar OpenSSL
$openssl = Get-Command openssl -ErrorAction SilentlyContinue
if (-not $openssl) {
    Write-Error "OpenSSL no encontrado. Instale OpenSSL (choco install openssl / winget install OpenSSL.OpenSSL) y vuelva a intentar."
    exit 1
}

# No sobrescribir si ya existen (rotación manual)
if ((Test-Path $certFile) -and (Test-Path $keyFile)) {
    Write-Host "✓ Certificados ya existen en $secretsDir — no se sobrescriben."
    Write-Host "  Para regenerar: elimine secrets/iwana-selfsigned.{crt,key} manualmente."
    exit 0
}

Write-Host "==> Generando certificado SSL autofirmado (válido 365 días)..." -ForegroundColor Cyan
Write-Host "    Directorio: $secretsDir"

& $openssl.Source req -x509 -nodes -days 365 -newkey rsa:2048 `
    -keyout $keyFile `
    -out $certFile `
    -subj "/C=CO/ST=Estado/L=Ciudad/O=iWana neXt/OU=Staging/CN=localhost" `
    -addext "subjectAltName=DNS:localhost,DNS:*.iwana.local,IP:127.0.0.1"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Error generando certificados. Código: $LASTEXITCODE"
    exit 1
}

Write-Host "    ✓ $certFile" -ForegroundColor Green
Write-Host "    ✓ $keyFile" -ForegroundColor Green
Write-Host ""
Write-Host "==> Listo. Los certificados se montan desde secrets/ en el contenedor nginx." -ForegroundColor Cyan
Write-Host "    Producción: reemplazar por certificados firmados por CA y rotar según política."
