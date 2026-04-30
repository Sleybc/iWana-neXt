# PROMPT — Ejecucion Fase 03A · Cimientos Media/Assets

**Version:** 1.0
**Estado:** Listo para ejecucion (tras aprobacion CTO de ADRs)
**Fecha:** 2026-04-30
**Generado por:** Engineering Manager (AI-EM-ARCH)
**Plantilla base:** [docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)
**Convencion documental:** PROMPT-MOD03-BRANDING-FASE-03A-v1.0.md

## Modulo

- Nombre: Branding Empresarial v2 — Cimientos Media/Assets
- Codigo: MOD03 — fase 03A
- Version: 1.0
- Fecha: 2026-04-30
- Generado por: Engineering Manager
- Nombre de archivo destino: `PROMPT-MOD03-BRANDING-FASE-03A-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** Paquete `@iwana/storage` con `StoragePort` y adapters operativos; `MediaModule` registrado en `apps/api` con servicio, validators y persistencia; tabla `media_assets` migrada; bootstrap MinIO funcional en dev. Sin consumidores aun.
- **Lo que SI entra:**
  - `packages/storage/` con `StoragePort`, `MinioStorageAdapter`, `LocalFsStorageAdapter` (dev only), factory por env.
  - `apps/api/src/modules/media/` con `MediaModule`, `MediaService`, `MediaController` (interno JWT), DTOs, validators (MIME magic bytes, dimensiones, SVG sanitizer), `usage-policy`.
  - Entidad `MediaAssetEntity` y migracion `CreateMediaAssetsTable` reversible.
  - Configuracion env validada con Joi (`STORAGE_DRIVER`, `S3_*`).
  - Bootstrap MinIO (`scripts/bootstrap-minio.sh`) idempotente + documentacion runbook.
  - Tests unitarios + integracion del modulo.
- **Lo que NO entra:**
  - Endpoints publicos de consumo final.
  - Cambios en branding tenant (eso es 03B).
  - Cambios frontend.
  - Migracion de CRM expedientes.
  - Procesamiento de imagenes.

## 2. Artefactos de entrada obligatorios

- PRD: [docs/prds/PRD-MOD03-BRANDING-EMPRESARIAL-v2.0.md](../prds/PRD-MOD03-BRANDING-EMPRESARIAL-v2.0.md)
- HLD: [docs/hlds/HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0.md](../hlds/HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0.md)
- ADRs aplicables: [ADR-033](../adrs/ADR-033-Storage-MinIO-StoragePort.md), [ADR-034](../adrs/ADR-034-Bounded-Context-Media-Assets.md)
- Plan: [docs/plans/PLAN-MOD03-BRANDING-EMPRESARIAL-FASE-03-v1.0.md](../plans/PLAN-MOD03-BRANDING-EMPRESARIAL-FASE-03-v1.0.md)
- Skills aplicables: `nestjs-expert`, `postgresql`, `database-migration`, `backend-security-coder`, `testing-patterns`.

## 3. Instrucciones para Sr. Dev Fullstack

1. Crear paquete `packages/storage` con `package.json`, `tsconfig.json` derivados de `@iwana/config`. Exponer `StoragePort`, `createStorageAdapter()`, tipos.
2. Implementar `MinioStorageAdapter` usando `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. Implementar `LocalFsStorageAdapter` con disco local solo activable cuando `STORAGE_DRIVER=local` (no usable en staging/prod por validacion Joi).
3. Validar env al boot con Joi en `apps/api/src/config/validation.schema.ts` para los campos `STORAGE_DRIVER`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`, `S3_USE_SSL`. En entorno test usar mocks o defaults seguros como en patrones existentes.
4. Crear modulo `apps/api/src/modules/media/`:
   - `MediaAssetEntity` mapeada a `public.media_assets`.
   - `MediaService` con `registerUpload`, `registerExternalUrl`, `getById`, `remove`. Validar `tenantSchema` + `usage`. Usar `usage-policy.ts` como fuente unica de allowlist MIME, tamano max y dimensiones.
   - Validators: `mime-validator.ts` con `file-type` por magic bytes; `dimension-validator.ts` con `image-size`; `svg-sanitizer.ts` con `dompurify` + `jsdom`.
   - `MediaController` con `POST /api/v1/media/uploads` protegido por JWT (uso interno; los consumidores envuelven y exponen sus propias rutas en 03B).
5. Crear migracion `packages/database/src/migrations/public/CreateMediaAssetsTable.ts` reversible siguiendo el patron del repo.
6. Crear `scripts/bootstrap-minio.sh` que:
   - Espere salud de MinIO.
   - Cree el bucket `S3_BUCKET` si no existe (idempotente).
   - Aplique policy privada por defecto.
   - Aplique policy publica de lectura solo a prefijos de branding (`*/branding.logo/*`, `*/branding.seal/*`, `*/branding.favicon/*`, `*/branding.login_background/*`).
7. Documentar el bootstrap y operacion en `docs/runbooks/RUNBOOK-MEDIA-MINIO-v1.0.md`.
8. Tests:
   - Unit: validators, factory, `MediaService` con storage mockeado.
   - Integracion: `MediaService` contra MinIO levantado por compose dev.
   - Aislamiento: dos `tenantSchema` no se ven entre si.
9. Documentar decisiones y desvios en informe vivo `docs/informes/INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md` (crearlo en esta fase).

## 4. Restricciones no negociables

- No importar `@aws-sdk/client-s3` fuera de `packages/storage`.
- No exponer `objectKey` crudo a consumidores; solo `publicUrl`.
- No habilitar `LocalFsStorageAdapter` en staging/prod (validacion Joi falla).
- No PII ni filenames originales sin sanitizar en logs.
- No usar credenciales reales en tests; mockear o usar MinIO local.
- Sin acceso directo a tablas de otros modulos.
- Sin `synchronize: true` en TypeORM.

## 5. Entregables tecnicos obligatorios

- Codigo backend: `packages/storage/**`, `apps/api/src/modules/media/**`.
- Migracion: `CreateMediaAssetsTable` forward + down.
- Script bootstrap: `scripts/bootstrap-minio.sh`.
- Tests: unit, integracion y aislamiento con coverage >= 80% en estos paquetes.
- OpenAPI: anotaciones Swagger en `MediaController` (interno).

## 6. Entregables documentales obligatorios

- Informe vivo `docs/informes/INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md` (crear en esta fase, actualizar al cierre).
- Runbook `docs/runbooks/RUNBOOK-MEDIA-MINIO-v1.0.md`.
- Evidencia de calidad en `docs/quality/` cuando aplique (cobertura, hallazgos).
- Si se detecta desviacion al PRD/HLD, actualizar el documento aprobado y dejar trazabilidad.

## 7. Criterios de aceptacion

- CA-03A-01: `MediaService.registerUpload` valida MIME por magic bytes y rechaza extensiones falseadas.
- CA-03A-02: SVG en `branding.favicon` rechazado; SVG en `branding.logo` aceptado y sanitizado.
- CA-03A-03: Dos llamadas con `tenantSchema` distintos producen `objectKey` con prefijos distintos y no se cruzan.
- CA-03A-04: Migracion forward y reverse pasan en BD limpia.
- CA-03A-05: Bootstrap MinIO crea bucket idempotentemente y aplica policies correctas.
- CA-03A-06: `STORAGE_DRIVER=local` en `NODE_ENV=production` falla al boot.
- CA-03A-07: Cobertura >= 80% en `packages/storage` y `apps/api/src/modules/media/`.

## 8. Criterio de stop/go

- Detenerse si:
  - El SDK S3 muestra incompatibilidades persistentes con MinIO.
  - SVG sanitization no logra eliminar vectores XSS conocidos en fixtures.
  - La policy publica/privada del bucket no es soportada por la version de MinIO declarada en stack.
- Documentar causa en: informe vivo y `docs/quality/`.
- Escalar a: Staff Engineer y luego CTO si > 4h.
- Recomendacion esperada: alternativa de adapter o re-evaluacion de ADR-033.

## 9. Criterio de salida de la fase

- Backend validado: lint + typecheck + test verde.
- Base de datos validada: migracion forward y reverse en BD limpia.
- Tests en verde con cobertura >= 80%.
- Bootstrap MinIO validado en dev.
- Documentacion archivada (informe vivo + runbook).
- Sin secretos ni PII en logs.
- Listo para iniciar 03B.
