# INFORME MOD05 — Revisión de seguridad D-PDF

**Versión:** 1.0 · **Fecha:** 2026-10-13  
**Bloque:** verificación consolidada de D-PDF · AI-SEC-ENG  
**Modo:** revisión estática de solo lectura; no se modificaron código, tests ni contratos, y no se aplicaron migraciones.  
**Fuentes:** ADR-093 D5, plan D-PDF v1.2, C-MEDIA-1/C-DDL-3/C-API-4, informes P1/P2/P3 y T7.

## Veredicto

**GO de seguridad para G6 D-PDF.** No encontré un bypass de los endpoints genéricos, una falla confirmada de pertenencia, exposición de URL firmada o incumplimiento de la allowlist del portal. El escaneo antivirus queda como deuda **Media (P2)**: no bloquea G6 ni, por sí solo, G7. G7 sigue condicionado a que el entorno use MinIO privado, como exige el plan de IVA.

La ruta de este informe estaba libre antes de escribirlo.

## Resumen por punto

| Punto                                                          | Veredicto                 | Evidencia                                                                                             |
| -------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| Aislamiento ante `/media/upload` y `GET /media/:id/signed-url` | **GO**                    | `media.service.ts:141-160, 311-318`; `media.controller.ts:82-90`; integración P2                      |
| PDF/JPEG/PNG/WEBP, bytes mágicos y 10 MiB                      | **GO**                    | `media.service.ts:56-59, 166-187, 360-394`; `magic-bytes.ts:23-80`; `contracts.controller.ts:226-230` |
| S-T7-02: uso dedicado, asset vigente y asociación única        | **GO**                    | `contracts.service.ts:897-909`; `contract.entity.ts:18-21`; migración 145; integración P2             |
| S-T7-03: allowlist del portal                                  | **GO**                    | `stratum-evidence.ts:8-18`; `CreateContractDialog.tsx:809-818`; informe P3 §§2.1–2.2                  |
| URL firmada ≤300 s, sin persistencia ni auditoría de la URL    | **GO**                    | `contracts.service.ts:655-675`; `media.service.ts:292-327`; `minio-storage.adapter.ts:141-148`        |
| Falta de escaneo antivirus                                     | **GO con deuda Media/P2** | `media.service.ts:166-187`; plan D-PDF v1.2 §3                                                        |

## Hallazgos por severidad

### Media (P2) — antivirus pendiente para archivos PDF

**[SEC-REVIEW] Archivo:** `apps/api/src/modules/media/media.service.ts` | **Línea:** 166  
**Severidad:** Media (P2), backlog priorizado; no bloquea G6 ni G7 en las condiciones actuales.  
**Hallazgo:** el servidor valida MIME, firma inicial y tamaño, pero no analiza contenido malicioso ni pone los PDF en cuarentena. Un PDF con cabecera válida puede contener contenido activo o explotar una vulnerabilidad del lector del usuario. El archivo queda en almacenamiento privado y su acceso requiere el endpoint del contrato; los enlaces duran como máximo cinco minutos. No encontré procesamiento PDF en API. Eso reduce exposición y evita convertir el archivo en entrada de un parser servidor, pero no elimina el riesgo para quien abra el documento.  
**OWASP:** file upload / manejo de archivos no confiables; la [File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) recomienda AV o sandbox cuando estén disponibles y CDR cuando aplique al formato. Se usa como recomendación de hardening, no como dictamen regulatorio.  
**Corrección / bloque nuevo:** registrar seguimiento D-PDF-AV-01 para que `sr-backend` y `plat-ops` evalúen una ruta de análisis y cuarentena antes de entregar el PDF; conservar aislamiento tenant y no remitir documentos personales a un servicio público de análisis.  
**Efecto en gates:** no bloquea G6. No bloquea G7 por sí solo con los controles actuales, pero la precondición de G7 de MinIO privado sigue siendo obligatoria (`docs/plans/2026-10-12-mod05-iva-punto-servicio.md:82`). Revalorar si los documentos se sirven públicamente, se procesan en servidor o se amplían los roles de carga/acceso.

### Baja (P3) — descripción OpenAPI del upload contractual contradice el contrato

**[SEC-REVIEW] Archivo:** `apps/api/src/modules/crm/contracts/contracts.controller.ts` | **Línea:** 241  
**Severidad:** Baja (P3), no bloquea G6/G7.  
**Hallazgo:** el esquema OpenAPI del endpoint dedicado todavía dice “PNG, WebP, JPEG, GIF o icono; [...] no admite PDF”. La implementación admite PDF/JPEG/PNG/WEBP y rechaza GIF/iconos. El enum del endpoint genérico sí excluye `stratum_evidence`; la discrepancia está en la descripción del endpoint contractual. Puede inducir a consumidores a enviar tipos rechazados o a omitir el soporte PDF.  
**Corrección / bloque nuevo:** `sr-backend`, corregir `ApiBody` para listar solo PDF/JPEG/PNG/WEBP y documentar el 422 `STRATUM_EVIDENCE_TYPE_NOT_ALLOWED`.

No se identificaron hallazgos críticos o altos en el alcance.

## Evidencia por punto

### 1. Aislamiento de los endpoints genéricos — GO

`POST /media/upload` tiene una allowlist de usos genéricos en el DTO (`apps/api/src/modules/media/dto/upload-media.dto.ts:5-16,21-29`) y OpenAPI enumera únicamente `logo`, `seal`, `favicon`, `login_background` y `general` (`media.controller.ts:82-90`). El servicio también rechaza explícitamente `STRATUM_EVIDENCE` antes de guardar en BD o storage (`media.service.ts:132-162`), con redundancia entre boundary HTTP y servicio.

El `signed-url` genérico detecta asset inexistente, eliminado o de uso `STRATUM_EVIDENCE` y devuelve 404 en las mismas condiciones de respuesta (`media.service.ts:300-318`). La integración P2 reporta el rechazo 400 de upload y el 404 de la URL genérica, sin omisiones (`INFORME-MOD05-IVA-PDF-P2-v1.0.md`, “Evidencia ejecutada”).

La carga dedicada está protegida por JWT, RBAC y permisos de gestión de CRM (`contracts.controller.ts:56-60,221-224`); está limitada a un archivo y 10 MiB en el interceptor (`:226-230`). El servicio toma el schema del `TenantContext` y exige storage privado antes de guardar (`contracts.service.ts:532-563,882-895`).

### 2. Tipos, firmas y tamaño — GO

`MEDIA_CONSTRAINTS[STRATUM_EVIDENCE]` fija 10 MiB y el allowlist `application/pdf`, `image/jpeg`, `image/png`, `image/webp` (`media.service.ts:56-59`). El método de carga dedicada compara MIME con allowlist y bytes mágicos antes de crear el asset; el tipo inválido termina en 422 `STRATUM_EVIDENCE_TYPE_NOT_ALLOWED` (`:166-187`). La validación común vuelve a imponer MIME y máximo del uso (`:360-394`), y Multer aplica el límite de 10 MiB antes del servicio (`contracts.controller.ts:226-230`).

El validador reconoce firmas PDF/JPEG/PNG/WEBP y para WebP exige tanto `RIFF` como `WEBP` (`apps/api/src/modules/media/magic-bytes.ts:23-35,48-80`). El tamaño es tope duro; la validación de cabecera no equivale a escaneo antimalware ni a validar semánticamente un documento completo, deuda descrita arriba.

### 3. S-T7-02 — GO

`_hasVerifiedStratumEvidence` lee el id desde el contrato, carga el asset bajo el schema del tenant, y acepta solo `usage = STRATUM_EVIDENCE`; `MediaService.findOne` filtra por `tenantSchema` y `deletedAt IS NULL` (`contracts.service.ts:897-909`; `media.service.ts:267-277`). Por lo tanto un id heredado con `GENERAL`, inexistente o eliminado no satisface la verificación.

El índice único parcial evita que dos contratos del mismo schema tenant apunten al mismo id (`apps/api/src/modules/crm/contracts/entities/contract.entity.ts:18-21`; `packages/database/src/migrations/tenant/145_contract_stratum_evidence_unique.ts:49-83`). P2 reporta integración real de reutilización rechazada por unicidad y del id heredado `GENERAL` como `STANDARD` (`INFORME-MOD05-IVA-PDF-P2-v1.0.md`, “Evidencia ejecutada”). No se consultó ni modificó ninguna base en esta auditoría.

### 4. S-T7-03 — GO

El helper del portal declara exactamente PDF/JPEG/PNG/WEBP y el límite de 10 MiB (`apps/portal/src/components/crm/subscribers/stratum-evidence.ts:8-18`). El control compartido que se usa en creación, conversión y drawer pasa `accept={STRATUM_EVIDENCE_ACCEPT}` (`CreateContractDialog.tsx:809-818`). El informe P3 registra tests de PDF aceptado, GIF rechazado y tamaño excesivo (`INFORME-MOD05-IVA-PDF-P3-v1.0.md:25-32`). La validación del navegador es solo de UX; el servidor repite validaciones críticas.

### 5. URL firmada — GO

La ruta contractual obtiene contrato y confirma evidencia verificada antes de solicitar la URL; la auditoría posterior registra `STRATUM_EVIDENCE_ACCESS` con `{ resource: 'stratumEvidence' }`, sin URL (`contracts.service.ts:655-675`). Media fija 300 segundos para el acceso dedicado y además aplica `Math.min` contra el máximo de 300; devuelve la URL y vencimiento en memoria, sin asignarlos a una entidad (`media.service.ts:292-327`). El adaptador MinIO solo presigna `GetObjectCommand` con ese TTL (`packages/storage/src/adapters/minio-storage.adapter.ts:141-148`).

El upload previo exige MinIO privado, `S3_BUCKET_PUBLIC` falso y ausencia de URL pública; de este modo `publicUrl` no se rellena para el asset del soporte (`contracts.service.ts:882-895`; `media.service.ts:243-255`). En el flujo revisado no se encontró un log de la URL. La URL se entrega como respuesta al lector autorizado, comportamiento previsto por el contrato; no se persiste ni se incorpora al evento de acceso.

## Alcance y limitaciones

- Revisión estática; no se ejecutaron pruebas HTTP, escáneres ni consultas a bases.
- El informe P2 registra la integración PostgreSQL en `dbiw`, con 19 tests aprobados. En esta revisión no se aplicaron migraciones ni se reprodujo esa ejecución.
- No se afirma cumplimiento legal por el análisis de AV; cualquier interpretación regulatoria adicional requiere verificación con fuente oficial.

## Deuda de seguridad

| Severidad  | Hallazgo                                                              | Bloque / efecto                                                        |
| ---------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Crítica    | Ninguno identificado                                                  | —                                                                      |
| Alta       | Ninguno identificado                                                  | —                                                                      |
| Media (P2) | Sin escaneo antivirus/cuarentena de PDF                               | D-PDF-AV-01; no bloquea G6/G7 con MinIO privado y los accesos actuales |
| Baja (P3)  | Descripción OpenAPI del endpoint dedicado conserva formatos obsoletos | Bloque nuevo `sr-backend`; no bloquea G6/G7                            |
