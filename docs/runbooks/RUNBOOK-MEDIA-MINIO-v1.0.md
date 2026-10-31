# RUNBOOK-MEDIA-MINIO-v1.0

**Sistema:** iWana neXt — Módulo MOD03 Branding Empresarial  
**Componente:** Almacenamiento de objetos — MinIO (dev) / S3-compatible (prod)  
**Versión:** 1.1  
**Cambios:** v1.1 (2026-10-30/31) añade «Usos privados» para `stratum_evidence` y `privacy_evidence` (INFORME T9 v1.1) y sustituye las credenciales literales de desarrollo por referencias a `.env.example` (decisión D-CK-4 del CTO).  
**Ruta estable:** el sufijo `v1.0` del nombre es el del alta; la versión vigente es la de esta cabecera.  
**Fecha:** 2026-04-30 · **Última actualización:** 2026-10-30 (sección «Usos privados», [INFORME T9 v1.1](../informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T9-v1.1.md))  
**Autor:** AI-SR-FULL

---

## Propósito

Guía operativa para inicializar, mantener y depurar el subsistema de almacenamiento de objetos S3-compatible en los entornos de desarrollo y producción del módulo de medios (`MediaModule`).

---

## Arquitectura de almacenamiento

```
apps/api (MediaModule)
  └── STORAGE_PORT (token DI)
        ├── MinioStorageAdapter   ← STORAGE_DRIVER=minio  (default dev/prod)
        └── LocalFsStorageAdapter ← STORAGE_DRIVER=local   (fallback dev-offline)

packages/storage
  └── StoragePort (interfaz)
        ├── putObject(key, body, opts)
        ├── deleteObject(key)
        ├── objectExists(key)
        ├── getPublicUrl(key)       → síncrono, URL base + key
        └── getSignedUrl(key, ttl)  → async, URL pre-firmada
```

**Naming de objectKey:** `{tenantSchema}/{usage}/{assetId}.{ext}`

- `tenantSchema`: schema del tenant (p.ej. `tenant_acme`, `platform` para globales)
- `usage`: `logo | seal | favicon | login_background | general`
- `assetId`: UUID del registro `media_assets`

---

## Configuración de variables de entorno

### Desarrollo (`docker-compose.yml` + `pnpm dev`)

| Variable | Valor dev | Descripción |
|---|---|---|
| `STORAGE_DRIVER` | `minio` | Driver activo |
| `S3_ENDPOINT` | `http://localhost:9002` | Endpoint expuesto al host en desarrollo |
| `S3_REGION` | `us-east-1` | Región (MinIO ignora, requerido AWS SDK) |
| `S3_ACCESS_KEY_ID` | valor de `S3_ACCESS_KEY_ID` en `.env.example` | Usuario MinIO |
| `S3_SECRET_ACCESS_KEY` | valor de `S3_SECRET_ACCESS_KEY` en `.env.example` | Contraseña MinIO |
| `S3_BUCKET` | `iwana-media` | Bucket principal |
| `S3_FORCE_PATH_STYLE` | `true` | Obligatorio para MinIO |
| `S3_USE_SSL` | `false` | HTTP en dev |
| `S3_PUBLIC_BASE_URL` | `http://localhost:9002/iwana-media` | URL pública acceso directo (no aplica a usos privados) |

### Producción

| Variable | Valor | Descripción |
|---|---|---|
| `STORAGE_DRIVER` | `minio` | Compatible con S3 AWS también |
| `S3_ENDPOINT` | (proveedor S3/MinIO) | Endpoint del proveedor |
| `S3_REGION` | (region del bucket) | |
| `S3_ACCESS_KEY_ID` | (secreto) | Nunca en código |
| `S3_SECRET_ACCESS_KEY` | (secreto) | Nunca en código |
| `S3_BUCKET` | `iwana-media-prod` | Bucket producción |
| `S3_FORCE_PATH_STYLE` | `false` | Para S3 AWS estándar |
| `S3_USE_SSL` | `true` | HTTPS siempre en prod |
| `S3_PUBLIC_BASE_URL` | (sin definir) | Si se define en `production` o `staging`, la carga y la firma de usos privados responden 503 |

### Usos privados (actualizado 2026-10-30)

`stratum_evidence` (soporte de estrato) y `privacy_evidence` (evidencia de privacidad) contienen datos del titular. Regla vigente, según [INFORME T9 v1.1](../informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T9-v1.1.md):

- Nunca reciben `publicUrl`, sea cual sea la configuración. Solo se leen por URL firmada de hasta 300 segundos.
- `MediaService` rechaza su carga y su firma con 503 (`STRATUM_EVIDENCE_STORAGE_MUST_BE_PRIVATE` o `PRIVACY_EVIDENCE_STORAGE_MUST_BE_PRIVATE`) si `STORAGE_DRIVER` no es `minio`, si `S3_BUCKET_PUBLIC=true` o si `S3_PUBLIC_BASE_URL` está definida en `production` o `staging`.
- En `development` y `test` la base URL no bloquea: el bucket es privado y esa URL apunta al MinIO directo, que exige firma.
- Ningún CDN, proxy ni política anónima debe servir los prefijos `{tenantSchema}/stratum_evidence/` ni `{tenantSchema}/privacy_evidence/`. Habilitar un CDN para la marca exige antes separar estos usos (bucket o prefijo excluido) mediante ADR.

---

## Inicialización MinIO — Bootstrap de desarrollo

### Requisito previo

MinIO debe estar corriendo. Verificar:

```bash
docker ps | grep minio
# Debe aparecer: iwana_minio_dev   minio/minio   Up ...   0.0.0.0:9002->9000/tcp, 0.0.0.0:9003->9001/tcp
```

### Flujo recomendado

```bash
pnpm dev
```

`pnpm dev` levanta MinIO, PostgreSQL, Redis, pgBouncer, Typesense y nginx con `up --wait` —es decir, espera a que cada healthcheck pase— y a continuación ejecuta el bootstrap del bucket con `run --rm minio-init`. Adminer no forma parte del arranque: tiene perfil opt-in propio (ver más abajo).

### Bootstrap aislado

Usar esta ruta solo si estás depurando MinIO fuera del flujo normal de `pnpm dev`.

```bash
docker compose --env-file .env -f docker-compose.yml up -d minio
docker compose --env-file .env -f docker-compose.yml run --rm minio-init
```

El bootstrap aislado:
1. Espera que MinIO esté listo
2. Configura alias `iwana-local` en `mc`
3. Crea el bucket `iwana-media` si no existe
4. Aplica policy `private`

Salidas esperadas:
```
→ MinIO lista en http://localhost:9002
→ Bucket iwana-media ya existe o fue creado
→ Policy private aplicada
✓ Bootstrap MinIO completado
```

### Bootstrap manual (alternativa sin `mc`)

```bash
# Usando la consola web MinIO
# URL: http://localhost:9003
# User: ver MINIO_ROOT_USER en .env
# Pass: ver MINIO_ROOT_PASSWORD en .env

# 1. Crear bucket "iwana-media"
# 2. Access Policy: Private
```

---

## Arrancar el entorno de desarrollo

```bash
# Flujo normal y recomendado: infraestructura + bootstrap + apps en host
pnpm dev

# Diagnóstico aislado de infraestructura (sin apps):
docker compose --env-file .env -f docker-compose.yml -f docker-compose.dev.yml up -d minio postgres redis pgbouncer typesense nginx

# Adminer es opcional y solo se publica en loopback:
docker compose --profile development --profile adminer --env-file .env -f docker-compose.yml -f docker-compose.dev.yml up -d adminer

# Inicializar el bucket manualmente si no se usa pnpm dev:
docker compose --env-file .env -f docker-compose.yml run --rm minio-init

# Arrancar la API de forma aislada:
pnpm --filter @iwana/api dev
```

---

## Verificar conectividad del API con MinIO

```bash
# Health check de la API
curl http://localhost:3000/api/v1/health

# Upload de prueba (requiere token admin)
curl -X POST http://localhost:3000/api/v1/media/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@/ruta/al/logo.png" \
  -F "usage=logo" \
  -F "tenantSchema=tenant_test"
```

---

## Depuración de errores comunes

### Error: `NoSuchBucket` / `Bucket does not exist`

```
Causa: Bucket iwana-media no fue creado
Solución: `pnpm dev` o `docker compose --env-file .env -f docker-compose.yml run --rm minio-init`
```

### Error: `ECONNREFUSED` al subir archivo

```
Causa: MinIO no está corriendo o URL incorrecta
Verificar:
  docker ps | grep minio
  # Si no está corriendo:
  docker compose --env-file .env -f docker-compose.yml up -d minio
```

### Error: `InvalidAccessKeyId`

```
Causa: Credenciales incorrectas en .env.local
Verificar S3_ACCESS_KEY_ID y S3_SECRET_ACCESS_KEY
Dev: usar `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` definidos en `.env` (plantilla en `.env.example`).
```

### Error: `RequestSigningFailed` / `AuthorizationQueryParametersError`

```
Causa: S3_FORCE_PATH_STYLE=false con MinIO (MinIO requiere path style)
Solución: Asegurar S3_FORCE_PATH_STYLE=true en desarrollo
```

### Archivo subido pero URL no funciona

```
Causa: S3_PUBLIC_BASE_URL no configurada o incorrecta
Dev: http://localhost:9002/iwana-media
Verificar: curl http://localhost:9002/iwana-media/{objectKey}
```

### `getSignedUrl` devuelve URL de localhost en ambiente Docker

```
Causa: El MinIO SDK genera URLs con el endpoint interno (minio:9000)
Workaround dev: La URL pre-firmada es para llamada server-to-server.
Para uso cliente, redirigir vía API o usar S3_PUBLIC_BASE_URL externa.
```

---

## Procedimiento de limpieza (dev)

```bash
# Listar contenidos del bucket
docker compose --env-file .env -f docker-compose.yml run --rm --entrypoint /bin/sh minio-init -lc \
  'mc alias set iwana-local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" && mc ls iwana-local/iwana-media --recursive'

# Eliminar todos los objetos del bucket (solo dev)
docker compose --env-file .env -f docker-compose.yml run --rm --entrypoint /bin/sh minio-init -lc \
  'mc alias set iwana-local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" && mc rm --recursive --force iwana-local/iwana-media'

# Eliminar y recrear el bucket
docker compose --env-file .env -f docker-compose.yml run --rm --entrypoint /bin/sh minio-init -lc \
  'mc alias set iwana-local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" && mc rb --force iwana-local/iwana-media && mc mb iwana-local/iwana-media && mc anonymous set private iwana-local/iwana-media'
```

---

## Consola web MinIO

| Campo | Valor |
|---|---|
| URL | http://localhost:9003 |
| Usuario | valor de `MINIO_ROOT_USER` en `.env` |
| Contraseña | valor de `MINIO_ROOT_PASSWORD` en `.env` |

Desde la consola se puede:
- Navegar objetos por bucket
- Ver metadatos de archivos
- Regenerar access keys
- Configurar event notifications (para futuros webhooks)

---

## Operaciones en producción

> **IMPORTANTE:** Los comandos destructivos en producción requieren aprobación del CTO.  
> Nunca ejecutar `mc rm --recursive` en producción sin autorización escrita.

### Backup de bucket en producción

```bash
# Sincronizar a backup (nunca al revés sin revisión)
mc mirror s3-prod/iwana-media-prod s3-backup/iwana-media-prod-backup-$(date +%Y%m%d)
```

### Rotación de credenciales

1. Generar nuevas access keys en consola MinIO/AWS
2. Actualizar secretos en gestor de secretos (Vault/AWS Secrets Manager)
3. Hacer rolling restart de la API:
   ```bash
   # k8s
   kubectl rollout restart deployment/iwana-api
   ```
4. Verificar health check post-restart
5. Revocar las credenciales antiguas

---

## Referencias

- ADR-033: Gestión de Activos de Medios con MinIO
- ADR-034: Multi-Tenant Media Asset Naming Convention
- `packages/storage/src/` — código fuente de los adaptadores
- `apps/api/src/modules/media/` — módulo NestJS
- `packages/database/src/migrations/public/008_create_media_assets_table.ts` — DDL
