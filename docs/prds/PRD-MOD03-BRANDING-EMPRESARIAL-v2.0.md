# PRD — Branding Empresarial v2 (extension MOD03)

## iWana neXt Platform — ISP/OSS/BSS Colombia

**Version:** 2.2
**Estado:** En revisión
**Fecha:** 2026-05-02
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Aprobador requerido:** CTO Humano
**Reemplaza parcialmente:** [PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md](PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md) seccion branding
**ADRs vinculados:** [ADR-035](../adrs/ADR-035-Storage-MinIO-StoragePort.md), [ADR-034](../adrs/ADR-034-Bounded-Context-Media-Assets.md)
**HLD:** [HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0.md](../hlds/HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0.md)

> Actualizacion v2.1: este mismo documento incorpora el alcance de branding propio de `apps/web` sin crear un PRD paralelo. La v2.0 cubria con claridad el branding de tenants administrado desde portal y plataforma; la v2.1 separa explicitamente esa capacidad del branding institucional de la consola de plataforma.
> Actualizacion v2.2: se incorpora metadata publica editable por tenant para cerrar la paridad funcional entre `apps/web/settings/Branding` y `apps/portal/dashboard/settings/Marca`: producto, superficie, titulo publico y descripcion publica dejan de ser solo derivados visuales y pasan a ser contrato persistente del branding empresarial.

---

## 1. Contexto y Motivacion

El branding tenant existe parcialmente (logos y sellos light/dark, columna `show_tenant_name`, endpoint self-service `PATCH /tenants/me/branding`, `BrandingForm` en portal). Tres limitaciones bloquean produccion completa:

1. **Solo URLs externas HTTPS.** Los clientes empresariales no siempre tienen donde hospedar assets. Se acordo modelo hibrido: upload propio + URL externa.
2. **Sin fondo de login ni favicon dedicados.** El login del portal sigue hardcodeado y el favicon depende del sello, lo cual no siempre es el activo deseado.
3. **Sin consola de administracion en `apps/web`.** SYSTEM_ADMIN/IWANA_SUPPORT no pueden corregir branding de un tenant via UI.

Adicionalmente, el almacenamiento de archivos no existe formalmente (ver ADR-035 y ADR-034). Esta v2 desbloquea ambos problemas.

Revision v2.1: durante la ejecucion se detecto una ambiguedad entre dos superficies distintas:

1. **Branding de tenants.** Identidad visual de cada empresa cliente, visible en `apps/portal` y administrable desde `apps/portal` y desde el detalle del tenant en `apps/web`.
2. **Branding propio de plataforma.** Identidad visual institucional de la consola administrativa `apps/web`, visible en login administrativo, metadata del navegador, favicon y shell autenticado.

Ambas superficies son requeridas. El branding de plataforma no debe ser un borrador local ni heredar branding de tenants; debe tener persistencia, contratos backend, auditoria y aplicacion real en UI.

## 2. Alcance

### In scope

- Cuatro categorias de assets por tenant: `logo`, `seal`, `favicon`, `login_background`. Cada una con variantes `light` y `dark` cuando aplique (favicon y login_background si; logo y seal ya existen).
- Modo de origen hibrido por asset: subir archivo o registrar URL HTTPS externa.
- Reset por asset (volver al fallback de iWana).
- Endpoint publico `GET /api/v1/tenants/public-branding?slug=` para que el login no autenticado del portal aplique branding antes de pedir credenciales.
- Pestaña "Marca" en `TenantSettingsForm` de `apps/web` que permite a SYSTEM_ADMIN y IWANA_SUPPORT editar el branding de cualquier tenant.
- Seccion extendida de Marca en `apps/portal` para que TENANT_ADMIN administre su propio branding.
- Branding propio de `apps/web`: logo/isotipo, favicon, imagen de fondo del login administrativo, titulo publico, descripcion publica, nombre de producto y nombre de superficie.
- Configuracion persistente de branding de plataforma desde `apps/web/settings`, con preview, reset y aplicacion real en login administrativo, favicon, metadata y shell autenticado.
- Endpoint publico de branding de plataforma para que el login administrativo no autenticado pueda cargar favicon, logo y fondo antes del login.
- Metadata publica editable por tenant: producto, superficie, titulo publico y descripcion publica, persistida en `public.tenants` y expuesta en `/tenants/me`, `/tenants/me/branding` y `/tenants/public-branding`.
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
- Branding por usuario, por rol o por ambiente dentro de `apps/web`.
- Heredar branding de un tenant en la consola administrativa global.

## 3. Personas y Casos de Uso

| Persona                  | Rol             | Caso de uso                                                                                                    |
| ------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------- |
| Carlos — SYSTEM_ADMIN    | Plataforma      | Onboarding asistido: configura branding inicial de un cliente nuevo desde `apps/web` antes del go-live         |
| Patricia — IWANA_SUPPORT | Plataforma      | Soporte: corrige asset roto reportado por cliente sin acceder a su consola                                     |
| Laura — SYSTEM_ADMIN     | Plataforma      | Administra la identidad institucional de la consola `apps/web`: favicon, logo y fondo del login administrativo |
| Andrea — TENANT_ADMIN    | Cliente final   | Sube logo nuevo cuando hay cambio de marca; cambia fondo de login en campana de marketing                      |
| Cliente final del ISP    | Visitante login | Reconoce la marca de su ISP en la pagina de login antes de autenticarse                                        |

### Flujos clave

- **F1: Upload de logo desde portal.** TENANT_ADMIN entra en Configuracion > Marca > Logo (light), arrastra PNG, ve preview, confirma. La pantalla refleja el nuevo logo en el sidebar al instante.
- **F2: URL externa para favicon.** TENANT_ADMIN pega URL HTTPS, el sistema valida formato, muestra preview, confirma. La pestaña del navegador refleja el cambio en la siguiente recarga.
- **F3: Reset de fondo de login.** TENANT_ADMIN pulsa "Restaurar predeterminado" en `login_background.dark`. El asset queda en NULL y el sistema vuelve al fondo iWana.
- **F4: Edicion desde web (plataforma).** SYSTEM_ADMIN selecciona tenant en `apps/web`, abre pestaña Marca, edita cualquier asset, guarda. Auditoria registra `actorRole=SYSTEM_ADMIN` y `tenantId` afectado.
- **F5: Login publico con branding.** Visitante abre `https://portal.cliente.com/login`. Antes de pedir credenciales, el frontend invoca `/public-branding?slug=cliente`, aplica fondo, logo y favicon. Si el endpoint falla, fallback iWana.
- **F6: Branding propio de plataforma.** SYSTEM_ADMIN entra a `apps/web/settings`, abre Branding, sube favicon, logo y fondo de login administrativo, guarda y ve la marca aplicada en `/auth/login`, metadata del navegador y shell autenticado sin depender de `localStorage`.

## 4. Requerimientos Funcionales

### RF-01 — Modelo de assets de branding tenant

Cada tenant tiene 8 slots de branding:

| Slot               | Variantes   | Tipo   | Notas                                                                            |
| ------------------ | ----------- | ------ | -------------------------------------------------------------------------------- |
| `logo`             | light, dark | imagen | Existente. Se mantiene.                                                          |
| `seal`             | light, dark | imagen | Existente. Se mantiene.                                                          |
| `favicon`          | light, dark | imagen | NUEVO. Light usado en navegadores con tema claro; dark en oscuro.                |
| `login_background` | light, dark | imagen | NUEVO. Imagen de fondo del login portal. Overlay del sistema preserva contraste. |

Cada slot puede ser:

- NULL (fallback al sello compacto en favicon, fondo iWana en login_background, logo iWana en logo/seal).
- URL HTTPS externa.
- Asset subido (URL servida desde MinIO publicamente).

### RF-01B — Modelo de branding propio de plataforma

`apps/web` debe tener una configuracion global propia, independiente de tenants, almacenada en schema `public` y administrada solo por roles plataforma autorizados.

| Campo                                                            | Tipo   | Notas                                                     |
| ---------------------------------------------------------------- | ------ | --------------------------------------------------------- |
| `product_name`                                                   | texto  | Nombre visible del producto. Default: `iWana neXt`.       |
| `surface_name`                                                   | texto  | Nombre de la consola. Default: `Portal administrativo`.   |
| `metadata_title`                                                 | texto  | Titulo del navegador para `apps/web`.                     |
| `metadata_description`                                           | texto  | Descripcion publica de la consola.                        |
| `logo_url` / `logo_asset_id`                                     | imagen | Logo/isotipo de plataforma. URL HTTPS o asset subido.     |
| `favicon_url` / `favicon_asset_id`                               | imagen | Favicon dedicado de `apps/web`. URL HTTPS o asset subido. |
| `login_background_light_url` / `login_background_light_asset_id` | imagen | Fondo login administrativo tema claro.                    |
| `login_background_dark_url` / `login_background_dark_asset_id`   | imagen | Fondo login administrativo tema oscuro.                   |

Reglas:

- Debe existir un registro singleton de plataforma, por ejemplo `id='platform'`.
- Los assets subidos usan `MediaService` con `tenantSchema='platform'` y `usage` correspondiente.
- El estado no se guarda en `localStorage` salvo como cache efimera no autoritativa.
- El reset restaura defaults iWana por slot o por configuracion completa.

### RF-01C — Metadata publica de branding tenant

Cada tenant puede definir textos publicos de identidad visual para su portal empresarial, independientes del branding global de plataforma y sin crear un bounded context nuevo.

| Campo                           | Tipo  | Default efectivo                                                       | Notas                                                  |
| ------------------------------- | ----- | ---------------------------------------------------------------------- | ------------------------------------------------------ | ----- | -------------------------------------------------- |
| `branding_product_name`         | texto | `legal_name                                                            |                                                        | name` | Nombre visible del tenant en superficies publicas. |
| `branding_surface_name`         | texto | `Portal empresarial`                                                   | Nombre de la superficie de acceso del tenant.          |
| `branding_metadata_title`       | texto | `{displayName} — Portal empresarial`                                   | Titulo del navegador y labels publicos cuando aplique. |
| `branding_metadata_description` | texto | `Portal empresarial para la operacion de {displayName} en iWana neXt.` | Descripcion publica del portal.                        |

Reglas:

- Los campos son tenant-managed y editables solo por `UserRole.ADMIN` desde `apps/portal`.
- La consola `apps/web` puede administrar estos campos para un tenant desde el flujo plataforma existente si el formulario de tenant branding lo expone.
- Si un campo llega `null` o vacio normalizado, el backend retorna el default efectivo en respuestas publicas y self-service.
- No se permite incluir PII ni datos sensibles en estos campos; son metadata publica.

### RF-02 — Endpoints backend

| Metodo | Ruta                                    | Auth                   | Roles                       | Proposito                                                                            |
| ------ | --------------------------------------- | ---------------------- | --------------------------- | ------------------------------------------------------------------------------------ |
| GET    | `/api/v1/tenants/public-branding?slug=` | Publico (rate-limited) | —                           | Datos no sensibles de branding para login no autenticado                             |
| GET    | `/api/v1/tenants/me`                    | JWT tenant             | TENANT_ADMIN, miembros      | Devuelve branding tenant (extiende DTO existente)                                    |
| PATCH  | `/api/v1/tenants/me/branding`           | JWT tenant             | UserRole.ADMIN              | Actualiza URLs externas o referencias a assets ya subidos. Acepta `null` para reset. |
| POST   | `/api/v1/tenants/me/branding/assets`    | JWT tenant             | UserRole.ADMIN              | Multipart upload. Body: `usage`, `file`. Devuelve `MediaAsset`.                      |
| GET    | `/api/v1/tenants/:id`                   | JWT plataforma         | SYSTEM_ADMIN, IWANA_SUPPORT | Existente, se extiende para incluir branding completo                                |
| PATCH  | `/api/v1/tenants/:id/branding`          | JWT plataforma         | SYSTEM_ADMIN                | Equivalente al de portal pero por id                                                 |
| POST   | `/api/v1/tenants/:id/branding/assets`   | JWT plataforma         | SYSTEM_ADMIN                | Upload por administrador de plataforma                                               |
| GET    | `/api/v1/platform/branding/public`      | Publico (rate-limited) | —                           | Branding publico de la consola `apps/web` para login administrativo                  |
| GET    | `/api/v1/platform/branding`             | JWT plataforma         | SYSTEM_ADMIN, IWANA_SUPPORT | Lee configuracion completa de branding de plataforma                                 |
| PATCH  | `/api/v1/platform/branding`             | JWT plataforma         | SYSTEM_ADMIN                | Actualiza metadata, URLs externas, assets o reset de branding de plataforma          |
| POST   | `/api/v1/platform/branding/assets`      | JWT plataforma         | SYSTEM_ADMIN                | Upload de logo, favicon o fondo de login administrativo                              |

Decision tenant: se reutilizan los endpoints existentes extendiendo DTOs en lugar de crear `/admin/...`. AbacGuard ya cubre cross-tenant para roles plataforma.

Decision plataforma: el branding propio de `apps/web` no vive en `/tenants` porque no pertenece a una empresa cliente. Se implementa como bounded capability de plataforma sobre schema `public` y consume `MediaService` para no duplicar almacenamiento.

### RF-03 — Validaciones por slot

| Slot                 | MIME permitidos                  | Tamano max | Dimensiones recomendadas     |
| -------------------- | -------------------------------- | ---------- | ---------------------------- |
| `logo.*`             | png, webp, jpg, svg (sanitizado) | 1 MB       | 240x60 a 480x120             |
| `seal.*`             | png, webp, svg (sanitizado)      | 512 KB     | 256x256                      |
| `favicon.*`          | png, webp, ico                   | 256 KB     | 32x32, 48x48, 64x64          |
| `login_background.*` | png, webp, jpg                   | 5 MB       | 1920x1080 minimo recomendado |

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

`apps/web` no hereda branding de tenant porque es consola de plataforma. Debe resolver su propio branding global desde `GET /api/v1/platform/branding/public` en superficies no autenticadas y desde `GET /api/v1/platform/branding` en superficies autenticadas. Si la carga falla, aplica fallback iWana.

### RF-06B — Aplicacion de metadata publica tenant

`apps/portal` debe consumir la metadata publica retornada por `/tenants/public-branding` antes de autenticacion para:

- actualizar `document.title` con `metadataTitle` cuando exista,
- usar `surfaceName` en la narrativa del panel de login,
- usar `displayName`/`productName` como nombre visible de marca segun `showTenantName`,
- mantener fallback iWana cuando el endpoint publico falle o el tenant no tenga metadata configurada.

En sesion autenticada, el dashboard debe recibir metadata extendida desde `/tenants/me` y actualizar el sidebar/header si el diseño vigente la consume. El evento `tenant-branding-updated` debe transportar tambien la metadata para evitar recarga manual.

### RF-07 — Reset por slot

`PATCH /branding` acepta `null` por slot para resetear. Si el slot apuntaba a un `media_assets` con `origin=upload`, se hace soft delete del asset (se conserva fila para auditoria; el archivo en MinIO se mantiene hasta job futuro de limpieza).

### RF-08 — Diseno preparado para `branding:manage`

Decorador `@Roles(UserRole.ADMIN)` en v1. Se documenta en codigo (`// TODO ABAC: replace with @RequirePermission('branding:manage') when permission RBAC lands`) sin implementar el sistema de permisos en este modulo.

### RF-09 — Branding de login administrativo y shell `apps/web`

El login administrativo de `apps/web` debe aplicar:

- `<link rel="icon">` desde `favicon_url`, con fallback iWana.
- Logo/isotipo desde `logo_url`, con fallback iWana.
- Fondo de login desde `login_background_light_url` o `login_background_dark_url` segun tema.
- `metadata_title` y `metadata_description` en las paginas donde Next.js lo permita sin romper SSR.

El shell autenticado debe aplicar logo/isotipo y nombre de superficie. La pagina `apps/web/settings` debe mostrar el estado autoritativo recibido del backend, no un borrador local como fuente de verdad.

## 5. Requerimientos No Funcionales

| RNF                          | Criterio                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| Performance endpoint publico | p95 < 100ms; cache HTTP 60s; rate limit 60/min/IP                                                     |
| Disponibilidad               | Si MinIO no responde en uploads, error 503 controlado; lecturas de URLs externas no dependen de MinIO |
| Seguridad                    | OWASP ASVS L2; sin PII en logs; signed URLs cuando aplique; cifrado at-rest en bucket prod            |
| Multi-tenancy                | Aislamiento estricto en BD y en `objectKey` de MinIO; AbacGuard en toda escritura                     |
| Cobertura tests              | >= 80% en MediaModule y BrandingService                                                               |
| Accesibilidad                | Previews con contraste validado; labels en es-CO; sin texto en mayusculas crudas                      |
| Compatibilidad navegadores   | Favicon light/dark via media query `prefers-color-scheme`                                             |
| Persistencia plataforma      | Branding propio de `apps/web` persiste en backend; `localStorage` no es fuente autoritativa           |

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

Extension v2.2 para metadata publica tenant:

```sql
ALTER TABLE public.tenants
  ADD COLUMN branding_product_name varchar(120),
  ADD COLUMN branding_surface_name varchar(120),
  ADD COLUMN branding_metadata_title varchar(180),
  ADD COLUMN branding_metadata_description varchar(300);
```

Las columnas son nullable para habilitar defaults efectivos desde `TenantService` sin backfill destructivo. El `down()` de la migracion debe eliminar las cuatro columnas en orden inverso.

### Tabla nueva `public.media_assets`

Definida en ADR-034. Migracion `CreateMediaAssetsTable` precede a `ExtendTenantBrandingV2`.

### Tabla nueva `public.platform_branding_settings`

Requerida para v2.1. Debe ser singleton y reversible:

```sql
CREATE TABLE public.platform_branding_settings (
  id varchar(30) PRIMARY KEY DEFAULT 'platform',
  product_name varchar(120) NOT NULL,
  surface_name varchar(120) NOT NULL,
  metadata_title varchar(180) NOT NULL,
  metadata_description varchar(300) NOT NULL,
  logo_url varchar(500),
  logo_asset_id uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  favicon_url varchar(500),
  favicon_asset_id uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  login_background_light_url varchar(500),
  login_background_light_asset_id uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  login_background_dark_url varchar(500),
  login_background_dark_asset_id uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_platform_branding_singleton CHECK (id = 'platform')
);
```

La migracion debe insertar defaults iWana en `up()` y eliminar la tabla en `down()` despues de remover FKs.

## 7. Contratos de API

### `GET /api/v1/tenants/public-branding`

```http
GET /api/v1/tenants/public-branding?slug=acme HTTP/1.1

200 OK
Cache-Control: public, max-age=60
{
  "displayName": "ACME Telecomunicaciones",
  "productName": "ACME Telecomunicaciones",
  "surfaceName": "Portal empresarial",
  "metadataTitle": "ACME Telecomunicaciones — Portal empresarial",
  "metadataDescription": "Portal empresarial para la operación de ACME Telecomunicaciones en iWana neXt.",
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
  "brandingProductName": "ACME Telecomunicaciones",
  "brandingSurfaceName": "Portal empresarial",
  "brandingMetadataTitle": "ACME Telecomunicaciones — Portal empresarial",
  "brandingMetadataDescription": "Portal empresarial para la operación de ACME Telecomunicaciones en iWana neXt.",
  "faviconLightAssetId": "01HZX...",
  "loginBackgroundDarkUrl": null, // reset explicito
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

OpenAPI de branding tenant se actualiza en fase 03B. OpenAPI de branding propio de plataforma se actualiza en fase 03D.

### `GET /api/v1/platform/branding/public`

```http
GET /api/v1/platform/branding/public HTTP/1.1

200 OK
Cache-Control: public, max-age=60
{
  "productName": "iWana neXt",
  "surfaceName": "Portal administrativo",
  "metadataTitle": "iWana neXt — Portal Administrativo",
  "metadataDescription": "Portal administrativo para operadores ISP iWana neXt",
  "logoUrl": "/brand/iwiso6.png",
  "faviconUrl": "/brand/favicon-gecko.svg",
  "loginBackgroundLightUrl": null,
  "loginBackgroundDarkUrl": null
}
```

### `PATCH /api/v1/platform/branding`

```jsonc
{
  "productName": "iWana neXt",
  "surfaceName": "Consola de plataforma",
  "logoAssetId": "01HZX...",
  "faviconUrl": "https://cdn.iwana.co/favicon.svg",
  "loginBackgroundDarkUrl": null,
}
```

Validacion: HTTPS para URLs externas, XOR entre URL y assetId por slot, reset explicito con `null`.

## 8. Criterios de Aceptacion

| ID    | Criterio                                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- |
| CA-01 | TENANT_ADMIN sube logo light desde portal y el sidebar lo muestra en la siguiente carga                                            |
| CA-02 | TENANT_ADMIN reemplaza logo via URL HTTPS externa con preview correcto                                                             |
| CA-03 | Reset de favicon dejando el slot en NULL hace fallback al sello compacto                                                           |
| CA-04 | SYSTEM_ADMIN edita branding de un tenant arbitrario desde `apps/web` y se audita correctamente                                     |
| CA-05 | Login portal de un tenant muestra fondo, logo y favicon antes de pedir credenciales                                                |
| CA-06 | Endpoint publico responde < 100ms p95 con cache 60s y rate limit funcionando                                                       |
| CA-07 | Upload con MIME no permitido (ej. PDF) retorna 400 sin tocar storage                                                               |
| CA-08 | Upload SVG en `branding.favicon` retorna 400. SVG en `branding.logo` se sanitiza y persiste                                        |
| CA-09 | Aislamiento: TENANT_ADMIN de tenant A no puede leer ni escribir branding de tenant B                                               |
| CA-10 | Migraciones forward y reverse pasan sin error en BD limpia                                                                         |
| CA-11 | OpenAPI publica los nuevos endpoints con ejemplos validos                                                                          |
| CA-12 | Cobertura `apps/api/src/modules/media/` y rutas de branding >= 80%                                                                 |
| CA-13 | SYSTEM_ADMIN actualiza logo/isotipo propio de `apps/web` desde `/settings` y el shell autenticado lo refleja tras recarga          |
| CA-14 | SYSTEM_ADMIN actualiza favicon propio de `apps/web` y `/auth/login` lo aplica antes de autenticar                                  |
| CA-15 | SYSTEM_ADMIN actualiza fondo de login administrativo y `/auth/login` lo renderiza con overlay legible                              |
| CA-16 | Reset de un slot de plataforma restaura fallback iWana sin afectar branding de tenants                                             |
| CA-17 | IWANA_SUPPORT puede consultar branding de plataforma pero no modificarlo                                                           |
| CA-18 | El borrador en `localStorage` deja de ser fuente autoritativa; la recarga obtiene estado desde backend                             |
| CA-19 | TENANT_ADMIN edita producto, superficie, titulo publico y descripcion publica desde portal Marca; los cambios persisten en backend |
| CA-20 | `GET /tenants/public-branding` expone metadata publica efectiva con fallback cuando campos tenant estan vacios                     |
| CA-21 | Login portal usa `metadataTitle`, `surfaceName` y `displayName/productName` sin mostrar errores cuando la metadata no existe       |
| CA-22 | El evento `tenant-branding-updated` transporta metadata para refrescar superficies autenticadas sin recarga manual                 |

## 9. Dependencias y Riesgos

### Dependencias

- ADR-035 aprobado (MinIO + StoragePort).
- ADR-034 aprobado (bounded context Media).
- HLD-TRANSVERSAL-MEDIA-ASSETS aprobado.
- MOD03 abierto para extension (verificar con CTO antes de ejecutar alcance nuevo o fase 03D).
- `@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner` aprobados como dependencias.
- `file-type` para magic bytes; `image-size` para dimensiones; `dompurify` + `jsdom` para SVG sanitization.

### Riesgos

| Riesgo                                                    | Severidad | Mitigacion                                                                                                        |
| --------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| MinIO no esta listo en infra on-premise del cliente       | Alta      | Adapter local fallback solo dev; runbook de bootstrap MinIO                                                       |
| Cliente sube imagen muy grande                            | Media     | Limite a nivel multer + nginx + policy del slot                                                                   |
| URL externa apunta a recurso luego eliminado              | Baja      | Fallback iWana cuando la imagen falla a nivel cliente                                                             |
| Migracion de columnas no es reversible si ya hay assets   | Baja      | Down() limpia FK antes de drop column                                                                             |
| MOD03 podria estar cerrado                                | Media     | Escalar al CTO; alternativa: emitir como TRANSVERSAL Branding v2                                                  |
| Ambiguedad entre branding tenant y branding plataforma    | Alta      | Separar contratos, rutas, UI y modelo de datos; `apps/web/settings` administra solo branding propio de plataforma |
| Login administrativo requiere branding antes de auth      | Media     | Endpoint publico cacheado con fallback iWana y sin datos sensibles                                                |
| Configuracion local no persistente en `apps/web/settings` | Media     | Reemplazar `localStorage` por backend autoritativo y tests de regresion                                           |
| Metadata tenant solo visual en portal                     | Media     | Persistir campos en `public.tenants`, extender DTOs/API y tests de contrato antes de habilitar inputs editables   |

## 10. Definition of Done

- [ ] Codigo backend (`MediaModule`, extensiones `BrandingService`, controllers) con tests >= 80%.
- [ ] Codigo frontend (`apps/web` pestaña Marca, `apps/portal` seccion Marca extendida) con tests RTL.
- [ ] Branding propio de `apps/web` persistente: backend, migracion, endpoints publicos/admin, UI `/settings`, login administrativo y shell autenticado.
- [ ] Metadata publica tenant persistente: backend, migracion, DTOs, UI portal editable, login publico y evento runtime actualizados.
- [ ] Migraciones forward y reverse aplicadas en dev sin errores.
- [ ] OpenAPI actualizada con nuevos endpoints y ejemplos.
- [ ] Validaciones HTTPS, MIME magic bytes, tamano, dimensiones, SVG sanitization implementadas.
- [ ] Auditoria con `oldValue/newValue` por slot.
- [ ] Endpoint publico con rate limit y cache.
- [ ] Playwright E2E: upload portal + login con branding aplicado.
- [ ] Playwright E2E: branding de plataforma aplicado en `/auth/login` y shell `apps/web`.
- [ ] Bootstrap MinIO documentado en runbook on-premise.
- [ ] Sin secretos, sin PII en logs.
- [ ] Sin violaciones de boundary Modulith.
- [ ] Informe de cierre `INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md` archivado en `docs/informes/`.
- [ ] CTO aprueba ADR-035, ADR-034 y este PRD v2.1.
- [ ] CTO aprueba ADR-035, ADR-034 y este PRD v2.2.

### Plan de ejecucion v2.1 — Fase 03D Branding propio de plataforma

| Paso  | Entregable                                                    | Criterio de salida                                                           |
| ----- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 03D-1 | Migracion `platform_branding_settings` + entidad/DTOs         | Forward/reverse en BD limpia; defaults iWana insertados                      |
| 03D-2 | `PlatformBrandingModule` en API                               | Endpoints public/admin, auditoria, cache headers y roles plataforma          |
| 03D-3 | Reuso de `MediaService` para assets `tenantSchema='platform'` | Upload logo/favicon/fondo con validaciones de MediaModule                    |
| 03D-4 | `apps/web/settings` conectado a backend                       | Sin `localStorage` como fuente autoritativa; reset por slot; previews reales |
| 03D-5 | Login administrativo dinámico                                 | Logo, favicon, fondo y metadata aplicados con fallback iWana                 |
| 03D-6 | Shell autenticado dinámico                                    | Sidebar/header usan branding de plataforma sin afectar tenants               |
| 03D-7 | QA focalizada                                                 | Unit/API + RTL + Playwright login administrativo; typecheck/lint verdes      |

No se crea PRD nuevo para 03D. La ejecucion queda gobernada por esta version 2.1 y por el plan vigente actualizado.

### Plan de ejecucion v2.2 — Fase 03E Metadata publica de branding tenant

| Paso  | Entregable                                                              | Criterio de salida                                                                             |
| ----- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 03E-1 | Migracion publica `011_add_tenant_branding_metadata` + entidad `Tenant` | Forward/reverse en BD limpia; columnas nullable agregadas                                      |
| 03E-2 | DTOs y servicios backend extendidos                                     | `/tenants/me`, `/tenants/me/branding` y `/tenants/public-branding` devuelven metadata efectiva |
| 03E-3 | OpenAPI y tests HTTP/backend                                            | Casos de persistencia, defaults, validacion y auditoria en verde                               |
| 03E-4 | Cliente portal/web actualizado                                          | Tipos `TenantSelf`, `TenantPublicBranding` y `UpdateTenantSelfBrandingDto` incluyen metadata   |
| 03E-5 | `BrandingForm` portal editable                                          | Seccion `Nombres e identidad` deja de ser read-only y guarda payload incremental               |
| 03E-6 | Login portal consume metadata                                           | Titulo, narrativa y nombre visible usan contrato publico con fallback iWana                    |
| 03E-7 | QA focalizada                                                           | Unit/API + RTL + typecheck; Playwright si el runner local esta disponible                      |

No se requiere ADR nuevo para 03E porque no cambia stack, boundary ni patron de integracion; extiende el contrato self-service existente de Tenant Branding dentro de MOD03.
