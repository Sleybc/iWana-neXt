# ADR-034 — Bounded Context Media/Assets transversal

**Estado:** Aprobado
**Fecha:** 2026-04-30
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Aprobado por:** CTO Humano
**Trazabilidad:** [ADR-035](ADR-035-Storage-MinIO-StoragePort.md) · [ADR-016](ADR-016-Cierre-MOD01-Produccion.md) <!-- ADR-021 retirado 2026-07-19 vía ADR-056: boilerplate sin relación sustantiva con media assets; además Superado -->

---

## 1. Contexto

El sistema necesita gestionar archivos binarios para multiples dominios:

- Branding empresarial (logos, sellos, favicon, fondo de login).
- Expedientes CRM (soportes documentales del MOD05, hoy en disco local).
- Futuros: avatares de usuario, FURAT SG-SST, comprobantes de pago, adjuntos de soporte.

Si cada dominio implementa su propia logica de upload, validacion, almacenamiento y servido, se introduce duplicacion, inconsistencias de seguridad y violacion del principio de Modulith. Tampoco existe un punto unico para auditar uploads, aplicar quotas o rotar storage.

## 2. Decision

Se crea el bounded context **Media/Assets** como modulo transversal en `apps/api/src/modules/media/`, con boundary explicito y consumidores tipados.

### Responsabilidades del modulo

- Recibir uploads y URLs externas (modelo hibrido).
- Validar MIME real (magic bytes), tamano, dimensiones (cuando aplique).
- Sanitizar nombre de archivo y SVG (cuando aplique).
- Persistir metadata en tabla publica `media_assets`.
- Delegar el almacenamiento fisico al `StoragePort` (ADR-035).
- Exponer interfaz tipada `MediaService` para consumidores internos.
- Exponer endpoints REST `/api/v1/media/*` solo para casos donde el cliente sube directo.
- Auditar todas las operaciones de mutacion via `AuditService`.

### Lo que NO hace Media/Assets

- No conoce reglas de negocio del consumidor (Branding, CRM, etc).
- No decide si un asset es "el activo" de un dominio (eso lo decide el consumidor).
- No procesa imagenes (resize, crop, watermark) en v1. Si futuro lo requiere, se agrega un servicio dedicado o un worker.

### Modelo de datos

Tabla `public.media_assets`:

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `uuid` (ULID) | PK |
| `tenant_schema` | `varchar(63)` nullable | NULL para assets de plataforma |
| `usage` | `varchar(64)` | `branding.logo`, `branding.seal`, `branding.favicon`, `branding.login_background`, etc. |
| `origin` | `varchar(16)` | `upload` o `external_url` |
| `mime_type` | `varchar(127)` | validado contra allowlist |
| `bytes` | `integer` | tamano en bytes |
| `width` | `integer` nullable | dimension px (cuando aplique) |
| `height` | `integer` nullable | dimension px |
| `checksum_sha256` | `char(64)` nullable | NULL para origin=external_url |
| `object_key` | `varchar(500)` nullable | NULL para origin=external_url |
| `external_url` | `varchar(2048)` nullable | NULL para origin=upload |
| `original_filename` | `varchar(255)` nullable | sanitizado |
| `created_by` | `uuid` | usuario plataforma o tenant |
| `created_at` | `timestamptz` | |
| `deleted_at` | `timestamptz` nullable | soft delete |

Indices: `(tenant_schema, usage)`, `(checksum_sha256)`, `(created_at)`.

### Aislamiento multi-tenant

- Toda lectura/escritura desde `MediaService` exige `tenantSchema` explicito (o flag `platformGlobal: true` para SYSTEM_ADMIN).
- AbacGuard valida que el caller no acceda a `media_assets` de otro tenant cuando no sea rol de plataforma.
- El object key en MinIO incluye `tenantSchema` como prefijo (ADR-035).

### Contratos tipados para consumidores

```ts
export interface RegisterUploadInput {
  tenantSchema: string;
  usage: string;
  file: Express.Multer.File;
  createdBy: string;
}

export interface RegisterExternalUrlInput {
  tenantSchema: string;
  usage: string;
  url: string;          // HTTPS only
  createdBy: string;
}

export interface MediaAsset {
  id: string;
  origin: 'upload' | 'external_url';
  publicUrl: string;    // URL servible (signed o publica)
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
}

export interface MediaService {
  registerUpload(input: RegisterUploadInput): Promise<MediaAsset>;
  registerExternalUrl(input: RegisterExternalUrlInput): Promise<MediaAsset>;
  getById(id: string, tenantSchema: string | null): Promise<MediaAsset | null>;
  remove(id: string, tenantSchema: string | null): Promise<void>;
}
```

### Permisos en v1

- Branding (consumidor v1) restringe via `@Roles(UserRole.ADMIN)` (portal) y roles de plataforma (web).
- `MediaController` no expone endpoints publicos. Los uploads van por endpoints especificos del consumidor (ej: `POST /tenants/me/branding/assets`).
- Diseno preparado para introducir permiso granular `media:manage` cuando exista RBAC de permisos (no en v1).

### SVG y formatos peligrosos

- SVG permitido **solo en `usage = branding.logo`**, sanitizado server-side (DOMPurify).
- SVG bloqueado en favicon, sello y fondo de login (riesgo XSS y soporte inconsistente).

### URL externa

- Solo HTTPS. Bloqueo de http://, file://, ftp://.
- Allowlist opcional configurable por env (vacia = cualquier HTTPS publico). Recomendacion productiva: poblar allowlist.
- Sin SSRF: no se hace fetch del host arbitrario. La URL se almacena tal cual y se sirve al cliente; el navegador del usuario final hace la request.

## 3. Justificacion

| Alternativa | Resultado |
|-------------|-----------|
| Cada modulo gestiona sus archivos | Rechazada. Duplica codigo, fragmenta seguridad, viola Modulith. |
| Servicio externo SaaS (Cloudinary, S3 puro) | Rechazada para v1. Ata a vendor, costo, regulacion. Posible en cloud futuro via cambio de adapter. |
| Modulo transversal Media/Assets (esta decision) | Boundary unico, una capa de validacion, auditoria centralizada, primer consumidor Branding, escalable a CRM expedientes. |

## 4. Impacto

- **Boundaries:** nuevo modulo `MediaModule` registrado en `app.module.ts`. Branding pasa a ser **consumidor** via inyeccion de `MediaService`.
- **Migracion datos:** crear tabla `media_assets` (forward) + drop (down). No requiere backfill: branding actual mantiene URLs externas hasta que el tenant las reemplace.
- **OpenAPI:** nuevos endpoints documentados. Branding endpoints reciben campo `assetId` opcional ademas de `url`.
- **CRM expedientes (futuro):** queda en deuda tecnica registrada migrar de filesystem local a `MediaService`. No entra en scope v1 de este ADR.

## 5. Alternativas descartadas

Ver tabla en seccion 3.

## 6. Consecuencias

### Positivas
- Un unico punto de validacion y auditoria.
- Branding desacoplado del storage.
- Preparado para extraer como microservicio sin refactor.

### Negativas
- Pequeno overhead de orquestacion en cada upload (call a `MediaService` antes de actualizar branding).

### Riesgos
- Acoplamiento si `MediaService` filtra detalles del storage. **Mitigacion:** contrato tipado expone solo `publicUrl` y metadata, nunca `objectKey` crudo.
- Crecimiento descontrolado del bucket. **Mitigacion:** soft delete + job futuro de limpieza fisica con TTL.

## 7. Cumplimiento

- Modulith: cumple boundary explicito.
- Multi-tenancy: aislamiento en BD (filtros por `tenant_schema`) y en storage (prefijo en `objectKey`).
- Seguridad: validacion MIME por magic bytes, sanitizacion SVG, HTTPS only, audit trail.
- Sin PII en metadata o filenames sin sanitizar.

## 8. Aprobacion registrada

- CTO Humano: aprobación confirmada para el bounded context Media/Assets como módulo transversal del Modulith.
