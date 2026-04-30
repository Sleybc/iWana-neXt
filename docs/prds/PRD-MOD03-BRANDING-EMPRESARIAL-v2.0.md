# PRD — Branding Empresarial v2 (extension MOD03)

## iWana neXt Platform — ISP/OSS/BSS Colombia

**Version:** 2.0
**Estado:** Borrador — pendiente aprobacion CTO
**Fecha:** 2026-04-30
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Aprobador requerido:** CTO Humano
**Reemplaza parcialmente:** [PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md](PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md) seccion branding
**ADRs vinculados:** [ADR-033](../adrs/ADR-033-Storage-MinIO-StoragePort.md), [ADR-034](../adrs/ADR-034-Bounded-Context-Media-Assets.md)
**HLD:** [HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0.md](../hlds/HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0.md)

---

## 1. Contexto y Motivacion

El branding tenant existe parcialmente (logos y sellos light/dark, columna `show_tenant_name`, endpoint self-service `PATCH /tenants/me/branding`, `BrandingForm` en portal). Tres limitaciones bloquean produccion completa:

1. **Solo URLs externas HTTPS.** Los clientes empresariales no siempre tienen donde hospedar assets. Se acordo modelo hibrido: upload propio + URL externa.
2. **Sin fondo de login ni favicon dedicados.** El login del portal sigue hardcodeado y el favicon depende del sello, lo cual no siempre es el activo deseado.
3. **Sin consola de administracion en `apps/web`.** SYSTEM_ADMIN/IWANA_SUPPORT no pueden corregir branding de un tenant via UI.

Adicionalmente, el almacenamiento de archivos no existe formalmente (ver ADR-033 y ADR-034). Esta v2 desbloquea ambos problemas.

## 2. Alcance

### In scope

- Cuatro categorias de assets por tenant: `logo`, `seal`, `favicon`, `login_background`. Cada una con variantes `light` y `dark` cuando aplique (favicon y login_background si; logo y seal ya existen).
- Modo de origen hibrido por asset: subir archivo o registrar URL HTTPS externa.
- Reset por asset (volver al fallback de iWana).
- Endpoint publico `GET /api/v1/tenants/public-branding?slug=` para que el login no autenticado del portal aplique branding antes de pedir credenciales.
- Pestaña "Marca" en `TenantSettingsForm` de `apps/web` que permite a SYSTEM_ADMIN y IWANA_SUPPORT editar el branding de cualquier tenant.
- Seccion extendida de Marca en `apps/portal` para que TENANT_ADMIN administre su propio branding.
- Previews claro/oscuro y reset por asset en ambas consolas.
- Auditoria completa con `oldValue/newValue` (sin URL completa si la consideramos sensible? — registramos URL completa porque no es PII).
- Migracion BD con nuevas columnas y tabla `media_assets` (ver ADR-034).
- Tests backend (unit, integracion HTTP), tests frontend (RTL), Playwright E2E mínimo (login con branding tenant resuelto, upload exitoso desde portal).

### Out of scope (v2)

- Edicion grafica in-app (crop, resize, rotacion).
- Temas completos por paleta (tokens de color customizables).
- CDN multi-region.
- Cuotas de almacenamiento por tenant.
- Aplicar branding a recibos PDF, emails transaccionales, exportables CRC/SUI (futuro modulo Templates).
- Migracion de CRM expedientes a MediaService (deuda registrada).

## 3. Personas y Casos de Uso

| Persona | Rol | Caso de uso |
|---------|-----|-------------|
| Carlos — SYSTEM_ADMIN | Plataforma | Onboarding asistido: configura branding inicial de un cliente nuevo desde `apps/web` antes del go-live |
| Patricia — IWANA_SUPPORT | Plataforma | Soporte: corrige asset roto reportado por cliente sin acceder a su consola |
| Andrea — TENANT_ADMIN | Cliente final | Sube logo nuevo cuando hay cambio de marca; cambia fondo de login en campana de marketing |
| Cliente final del ISP | Visitante login | Reconoce la marca de su ISP en la pagina de login antes de autenticarse |

### Flujos clave

- **F1: Upload de logo desde portal.** TENANT_ADMIN entra en Configuracion > Marca > Logo (light), arrastra PNG, ve preview, confirma. La pantalla refleja el nuevo logo en el sidebar al instante.
- **F2: URL externa para favicon.** TENANT_ADMIN pega URL HTTPS, el sistema valida formato, muestra preview, confirma. La pestaña del navegador refleja el cambio en la siguiente recarga.
- **F3: Reset de fondo de login.** TENANT_ADMIN pulsa "Restaurar predeterminado" en `login_background.dark`. El asset queda en NULL y el sistema vuelve al fondo iWana.
- **F4: Edicion desde web (plataforma).** SYSTEM_ADMIN selecciona tenant en `apps/web`, abre pestaña Marca, edita cualquier asset, guarda. Auditoria registra `actorRole=SYSTEM_ADMIN` y `tenantId` afectado.
- **F5: Login publico con branding.** Visitante abre `https://portal.cliente.com/login`. Antes de pedir credenciales, el frontend invoca `/public-branding?slug=cliente`, aplica fondo, logo y favicon. Si el endpoint falla, fallback iWana.

## 4. Requerimientos Funcionales

### RF-01 — Modelo de assets de branding

Cada tenant tiene 8 slots de branding:

| Slot | Variantes | Tipo | Notas |
|------|-----------|------|-------|
| `logo` | light, dark | imagen | Existente. Se mantiene. |
| `seal` | light, dark | imagen | Existente. Se mantiene. |
| `favicon` | light, dark | imagen | NUEVO. Light usado en navegadores con tema claro; dark en oscuro. |
| `login_background` | light, dark | imagen | NUEVO. Imagen de fondo del login portal. Overlay del sistema preserva contraste. |

Cada slot puede ser:
- NULL (fallback al sello compacto en favicon, fondo iWana en login_background, logo iWana en logo/seal).
- URL HTTPS externa.
- Asset subido (URL servida desde MinIO publicamente).

### RF-02 — Endpoints backend

| Metodo | Ruta | Auth | Roles | Proposito |
|--------|------|------|-------|-----------|
| GET | `/api/v1/tenants/public-branding?slug=` | Publico (rate-limited) | — | Datos no sensibles de branding para login no autenticado |
| GET | `/api/v1/tenants/me` | JWT tenant | TENANT_ADMIN, miembros | Devuelve branding tenant (extiende DTO existente) |
| PATCH | `/api/v1/tenants/me/branding` | JWT tenant | UserRole.ADMIN | Actualiza URLs externas o referencias a assets ya subidos. Acepta `null` para reset. |
| POST | `/api/v1/tenants/me/branding/assets` | JWT tenant | UserRole.ADMIN | Multipart upload. Body: `usage`, `file`. Devuelve `MediaAsset`. |
| GET | `/api/v1/tenants/:id` | JWT plataforma | SYSTEM_ADMIN, IWANA_SUPPORT | Existente, se extiende para incluir branding completo |
| PATCH | `/api/v1/tenants/:id/branding` | JWT plataforma | SYSTEM_ADMIN | Equivalente al de portal pero por id |
| POST | `/api/v1/tenants/:id/branding/assets` | JWT plataforma | SYSTEM_ADMIN | Upload por administrador de plataforma |

Decision: se reutilizan los endpoints existentes extendiendo DTOs en lugar de crear `/admin/...`. AbacGuard ya cubre cross-tenant para roles plataforma.

### RF-03 — Validaciones por slot

| Slot | MIME permitidos | Tamano max | Dimensiones recomendadas |
|------|-----------------|------------|--------------------------|
| `logo.*` | png, webp, jpg, svg (sanitizado) | 1 MB | 240x60 a 480x120 |
| `seal.*` | png, webp, svg (sanitizado) | 512 KB | 256x256 |
| `favicon.*` | png, webp, ico | 256 KB | 32x32, 48x48, 64x64 |
| `login_background.*` | png, webp, jpg | 5 MB | 1920x1080 minimo recomendado |

URLs externas: HTTPS only, max 2048 chars, sin caracteres de control. Allowlist de hosts opcional via env.

### RF-04 — Auditoria

Toda mutacion de branding emite evento de auditoria con: `actorId`, `actorRole`, `tenantId` afectado, `slot` modificado, `oldValue`, `newValue`, `origin` (upload o external_url), `assetId` cuando aplique.

### RF-05 — Login portal con branding publico

`apps/portal/src/app/login/page.tsx` invoca `getPublicBranding(slug)` en boot (RSC o effect inicial). Aplica:
- `<link rel="icon">` dinamico segun `favicon.{light|dark}` y media query del navegador.
- Fondo de login segun `login_background.{light|dark}` con overlay fijo del sistema.
- Logo en card de login segun `logo.{light|dark}`.

Si la request falla, fallback iWana sin error visible.

### RF-06 — Aplicacion en sesion autenticada

`AuthProvider` y layout de `apps/portal` continuan resolviendo branding via `tenantSelfApi.me()` (existente). Se extiende para los nuevos slots.

`apps/web` aplica branding iWana base; no hereda branding de tenant porque es consola de plataforma.

### RF-07 — Reset por slot

`PATCH /branding` acepta `null` por slot para resetear. Si el slot apuntaba a un `media_assets` con `origin=upload`, se hace soft delete del asset (se conserva fila para auditoria; el archivo en MinIO se mantiene hasta job futuro de limpieza).

### RF-08 — Diseno preparado para `branding:manage`

Decorador `@Roles(UserRole.ADMIN)` en v1. Se documenta en codigo (`// TODO ABAC: replace with @RequirePermission('branding:manage') when permission RBAC lands`) sin implementar el sistema de permisos en este modulo.

## 5. Requerimientos No Funcionales

| RNF | Criterio |
|-----|----------|
| Performance endpoint publico | p95 < 100ms; cache HTTP 60s; rate limit 60/min/IP |
| Disponibilidad | Si MinIO no responde en uploads, error 503 controlado; lecturas de URLs externas no dependen de MinIO |
| Seguridad | OWASP ASVS L2; sin PII en logs; signed URLs cuando aplique; cifrado at-rest en bucket prod |
| Multi-tenancy | Aislamiento estricto en BD y en `objectKey` de MinIO; AbacGuard en toda escritura |
| Cobertura tests | >= 80% en MediaModule y BrandingService |
| Accesibilidad | Previews con contraste validado; labels en es-CO; sin texto en mayusculas crudas |
| Compatibilidad navegadores | Favicon light/dark via media query `prefers-color-scheme` |

## 6. Modelo de Datos

### Cambios en `public.tenants`

Nuevas columnas (nullable):

```sql
ALTER TABLE public.tenants
  ADD COLUMN favicon_light_url            varchar(500),
  ADD COLUMN favicon_dark_url             varchar(500),
  ADD COLUMN login_background_light_url   varchar(500),
  ADD COLUMN login_background_dark_url    varchar(500),
  ADD COLUMN favicon_light_asset_id       uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  ADD COLUMN favicon_dark_asset_id        uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  ADD COLUMN logo_light_asset_id          uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  ADD COLUMN logo_dark_asset_id           uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  ADD COLUMN seal_light_asset_id          uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  ADD COLUMN seal_dark_asset_id           uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  ADD COLUMN login_background_light_asset_id uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  ADD COLUMN login_background_dark_asset_id  uuid REFERENCES public.media_assets(id) ON DELETE SET NULL;
```

Razon de doble columna `*_url` y `*_asset_id`: el slot puede provenir de upload (asset_id apunta) o URL externa (asset_id NULL, url poblada). Lectura combinada en service: `asset_id ? media_assets.publicUrl : url`.

### Tabla nueva `public.media_assets`

Definida en ADR-034. Migracion `CreateMediaAssetsTable` precede a `ExtendTenantBrandingV2`.

## 7. Contratos de API

### `GET /api/v1/tenants/public-branding`

```http
GET /api/v1/tenants/public-branding?slug=acme HTTP/1.1

200 OK
Cache-Control: public, max-age=60
{
  "displayName": "ACME Telecomunicaciones",
  "showTenantName": true,
  "logoLightUrl": "https://...",
  "logoDarkUrl": null,
  "sealLightUrl": "https://...",
  "sealDarkUrl": null,
  "faviconLightUrl": null,
  "faviconDarkUrl": null,
  "loginBackgroundLightUrl": "https://...",
  "loginBackgroundDarkUrl": null
}

404 Not Found  // slug invalido o tenant inactivo
429 Too Many Requests
```

### `PATCH /api/v1/tenants/me/branding`

```jsonc
// Request
{
  "logoLightUrl": "https://cdn.cliente.com/logo-light.png",
  "logoLightAssetId": null,
  "faviconLightAssetId": "01HZX...",
  "loginBackgroundDarkUrl": null   // reset explicito
}
```

Validacion: HTTPS only; XOR entre `*Url` y `*AssetId` por slot (no ambos simultaneamente).

### `POST /api/v1/tenants/me/branding/assets`

```http
POST /api/v1/tenants/me/branding/assets HTTP/1.1
Content-Type: multipart/form-data; boundary=...

usage=branding.logo
file=<binario>

201 Created
{
  "id": "01HZX...",
  "publicUrl": "https://minio.iwana.local/iwana-media-prod/tenant_acme/branding.logo/01HZX....png",
  "mimeType": "image/png",
  "bytes": 24831,
  "width": 480,
  "height": 120
}
```

OpenAPI completo se actualiza en fase 03B.

## 8. Criterios de Aceptacion

| ID | Criterio |
|----|----------|
| CA-01 | TENANT_ADMIN sube logo light desde portal y el sidebar lo muestra en la siguiente carga |
| CA-02 | TENANT_ADMIN reemplaza logo via URL HTTPS externa con preview correcto |
| CA-03 | Reset de favicon dejando el slot en NULL hace fallback al sello compacto |
| CA-04 | SYSTEM_ADMIN edita branding de un tenant arbitrario desde `apps/web` y se audita correctamente |
| CA-05 | Login portal de un tenant muestra fondo, logo y favicon antes de pedir credenciales |
| CA-06 | Endpoint publico responde < 100ms p95 con cache 60s y rate limit funcionando |
| CA-07 | Upload con MIME no permitido (ej. PDF) retorna 400 sin tocar storage |
| CA-08 | Upload SVG en `branding.favicon` retorna 400. SVG en `branding.logo` se sanitiza y persiste |
| CA-09 | Aislamiento: TENANT_ADMIN de tenant A no puede leer ni escribir branding de tenant B |
| CA-10 | Migraciones forward y reverse pasan sin error en BD limpia |
| CA-11 | OpenAPI publica los nuevos endpoints con ejemplos validos |
| CA-12 | Cobertura `apps/api/src/modules/media/` y rutas de branding >= 80% |

## 9. Dependencias y Riesgos

### Dependencias

- ADR-033 aprobado (MinIO + StoragePort).
- ADR-034 aprobado (bounded context Media).
- HLD-TRANSVERSAL-MEDIA-ASSETS aprobado.
- MOD03 abierto para extension (verificar con CTO antes de fase 03B).
- `@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner` aprobados como dependencias.
- `file-type` para magic bytes; `image-size` para dimensiones; `dompurify` + `jsdom` para SVG sanitization.

### Riesgos

| Riesgo | Severidad | Mitigacion |
|--------|-----------|-----------|
| MinIO no esta listo en infra on-premise del cliente | Alta | Adapter local fallback solo dev; runbook de bootstrap MinIO |
| Cliente sube imagen muy grande | Media | Limite a nivel multer + nginx + policy del slot |
| URL externa apunta a recurso luego eliminado | Baja | Fallback iWana cuando la imagen falla a nivel cliente |
| Migracion de columnas no es reversible si ya hay assets | Baja | Down() limpia FK antes de drop column |
| MOD03 podria estar cerrado | Media | Escalar al CTO; alternativa: emitir como TRANSVERSAL Branding v2 |

## 10. Definition of Done

- [ ] Codigo backend (`MediaModule`, extensiones `BrandingService`, controllers) con tests >= 80%.
- [ ] Codigo frontend (`apps/web` pestaña Marca, `apps/portal` seccion Marca extendida) con tests RTL.
- [ ] Migraciones forward y reverse aplicadas en dev sin errores.
- [ ] OpenAPI actualizada con nuevos endpoints y ejemplos.
- [ ] Validaciones HTTPS, MIME magic bytes, tamano, dimensiones, SVG sanitization implementadas.
- [ ] Auditoria con `oldValue/newValue` por slot.
- [ ] Endpoint publico con rate limit y cache.
- [ ] Playwright E2E: upload portal + login con branding aplicado.
- [ ] Bootstrap MinIO documentado en runbook on-premise.
- [ ] Sin secretos, sin PII en logs.
- [ ] Sin violaciones de boundary Modulith.
- [ ] Informe de cierre `INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md` archivado en `docs/informes/`.
- [ ] CTO aprueba ADR-033, ADR-034 y este PRD.
