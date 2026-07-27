# ADR-035 — Adopcion de MinIO/S3-compatible y patron StoragePort

**Estado:** Aprobado
**Fecha:** 2026-04-30
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Aprobado por:** CTO Humano
**Trazabilidad:** [ADR-016](ADR-016-Cierre-MOD01-Produccion.md) · [docs/prds/Stack_Tecnologico.md](../prds/Stack_Tecnologico.md) <!-- ADR-021 retirado 2026-07-19 vía ADR-056: boilerplate sin relación sustantiva con storage; además Superado -->

---

## 1. Contexto

iWana neXt no tiene hoy un mecanismo formal para almacenar archivos binarios (logos, sellos, fondos de login, futuros adjuntos de expedientes CRM, avatares, FURAT SG-SST). Las soluciones actuales son ad hoc:

- `apps/api/storage/expediente-document-supports/` guarda archivos en disco local del contenedor API. No es persistente entre redeploys, no es replicable, no es seguro multi-tenant, no escala on-premise multi-instancia.
- El branding tenant solo acepta URLs HTTPS externas, lo cual delega la persistencia al cliente y bloquea el upload propio decidido en el brainstorming.
- `docker-compose.yml` ya levanta MinIO (puertos 9002/9003) como parte de la infraestructura local que orquesta `pnpm dev`, sin cliente NestJS que lo consuma.

El nuevo modulo Media/Assets (ver ADR-034) requiere un backend de objetos productivo y aislamiento estricto por tenant, con la opcion de servir signed URLs o proxy controlado.

## 2. Decision

Se adopta **MinIO** como backend de almacenamiento de objetos primario para todos los entornos (dev, staging, produccion on-premise) usando el SDK oficial de S3 (`@aws-sdk/client-s3`) sobre la API S3-compatible de MinIO.

Se introduce el patron **`StoragePort`** como interfaz tipada de dominio en `packages/storage` (nuevo paquete del monorepo). Toda interaccion con almacenamiento de objetos debe pasar por este puerto. Ningun modulo de negocio puede importar el SDK de S3 directamente.

### Contrato `StoragePort`

```ts
export interface StoragePutInput {
  tenantSchema: string;        // tenant_xxx o "platform"
  usage: string;               // ej: branding.logo, branding.favicon
  assetId: string;             // ULID generado por MediaService
  filename: string;            // nombre original sanitizado
  mimeType: string;            // validado contra allowlist
  body: Buffer | NodeJS.ReadableStream;
  contentLength: number;
  metadata?: Record<string, string>;
}

export interface StoragePort {
  putObject(input: StoragePutInput): Promise<{ objectKey: string; etag: string }>;
  deleteObject(objectKey: string): Promise<void>;
  objectExists(objectKey: string): Promise<boolean>;
  getPublicUrl(objectKey: string): string;            // si bucket es publico
  getSignedUrl(objectKey: string, ttlSeconds: number): Promise<string>;
}
```

### Convenciones operativas

- **Naming de objectKey:** `{tenantSchema}/{usage}/{assetId}.{ext}`. Si `tenantSchema = "platform"` el asset es global (no tenant-aware).
- **Buckets:** un bucket por entorno (`iwana-media-dev`, `iwana-media-staging`, `iwana-media-prod`). No se mezclan entornos.
- **Cifrado at-rest:** habilitar SSE en el bucket de produccion (clave gestionada por MinIO).
- **Cifrado in-transit:** TLS obligatorio entre API y MinIO en staging/produccion. Dev puede usar HTTP en red interna Docker.
- **Signed URLs:** TTL maximo 15 minutos para descargas autenticadas. URLs publicas solo para assets de branding marcados explicitamente como publicos (logos servidos al login no autenticado).
- **Sanitizacion de filename:** `MediaService` aplica slug + valida extension contra MIME real (magic bytes via `file-type`).

### Adapter primario y fallback de desarrollo

- `MinioStorageAdapter` (primario, todos los entornos).
- `LocalFilesystemStorageAdapter` (opcional, solo dev offline si MinIO no esta disponible). NUNCA habilitado en staging/produccion. Controlado por env `STORAGE_DRIVER=minio|local` con default `minio`.

### Variables de entorno requeridas

```
STORAGE_DRIVER=minio
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=<...>
S3_SECRET_ACCESS_KEY=<...>
S3_BUCKET=iwana-media-dev
S3_FORCE_PATH_STYLE=true
S3_USE_SSL=false   # dev. true en staging/prod
```

Validacion Joi al boot. Sin defaults inseguros.

## 3. Justificacion

| Alternativa | Resultado |
|-------------|-----------|
| Filesystem local del contenedor | Rechazada. No persistente, no escalable, ya causa deuda en CRM expedientes. |
| Volumen Docker compartido | Rechazada. Acopla replicas, complica respaldo, no resuelve cifrado ni signed URLs. |
| MinIO + SDK S3 con puerto abstracto (esta decision) | Estandar de facto, ya presente en compose, portable a S3/GCS si el cliente migra a cloud, permite extraer a microservicio sin refactor. |
| Acceso directo al SDK desde cada modulo | Rechazada. Viola Modulith, duplica validacion, acopla cada bounded context a la implementacion. |

## 4. Impacto

- **Stack:** se agrega dependencia operativa MinIO en produccion (ya en compose dev). Se agrega `@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner` al `package.json` del nuevo `@iwana/storage`.
- **Boundaries:** nuevo paquete transversal `@iwana/storage`. Solo `MediaModule` puede consumirlo; otros modulos consumen `MediaModule` (ADR-034).
- **Seguridad:** habilita allowlist MIME, signed URLs, separacion publica/privada de assets, auditoria de uploads.
- **Despliegue on-premise:** se documentara en runbook procedimiento de respaldo del bucket y rotacion de credenciales.
- **Migracion futura a cloud:** sin refactor de modulos consumidores; cambia solo el adapter.

## 5. Alternativas descartadas

Ver tabla en seccion 3.

## 6. Consecuencias

### Positivas
- Persistencia productiva real para uploads.
- Aislamiento claro por tenant en el naming.
- Patron portable y testeable (adapter mockeado en tests unitarios).
- Desbloquea Branding v2 y futuros consumidores (CRM expedientes, avatares).

### Negativas / costos
- Operacion adicional: MinIO a monitorear, respaldar, parchar.
- Curva minima para devs no familiarizados con S3.

### Riesgos
- Mala configuracion de bucket publico/privado podria exponer assets sensibles. **Mitigacion:** politica por defecto privado; lo publico se habilita solo en assets de branding marcados como tales por `MediaService`.
- Fuga cross-tenant si naming falla. **Mitigacion:** prefijo obligatorio en `StoragePort.putObject` validado en `MediaService`.

## 7. Cumplimiento

- Compatible con Modulith (paquete transversal con boundary explicito).
- Compatible con multi-tenancy por schema (naming basado en `tenantSchema`).
- Compatible con OWASP ASVS L2 (cifrado at-rest, in-transit, allowlist MIME, signed URLs).
- Sin PII en object keys ni en metadata.

## 8. Requiere ADR adicional

- ADR-034: Bounded Context Media/Assets (consumidor unico de `StoragePort`).

## 9. Aprobacion registrada

- CTO Humano: aprobación confirmada para MinIO, `StoragePort` y la dependencia `@aws-sdk/client-s3`.
