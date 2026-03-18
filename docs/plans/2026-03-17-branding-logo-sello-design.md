# Diseño — Branding Tenant: Logo y Sello

**Fecha:** 2026-03-17
**Módulo:** MOD03 — Configuración Empresarial
**Fase:** Branding (extensión de Fase 01)
**Estado:** Aprobado para implementación
**Autor:** AI-EM-ARCH

## Trazabilidad

- PRD base: docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- HLD base: docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- Identidad visual: docs/identity/Manual_Implementacion_Identidad_Iwana.md
- Sidebar actual: apps/portal/src/components/layout/Sidebar.tsx
- Entidad Tenant: packages/database/src/entities/tenant.entity.ts

---

## 1. Problema

El sidebar del portal muestra "iW" y "iWana Empresa" hardcodeados. No existe mecanismo para que el tenant configure su propia identidad visual. A futuro, documentos generados por el sistema tampoco podrán incluir la marca del tenant.

---

## 2. Alcance de esta feature

### Entra

- Sección "Logo y Sello" en `dashboard/settings` con 4 campos URL + 1 toggle.
- Componente reutilizable `TenantSeal` para sidebar y cualquier punto futuro.
- Adaptación del sidebar para mostrar sello del tenant (o fallback de iniciales) y nombre comercial condicional.
- Migración TypeORM con 5 columnas nuevas en `public.tenants`.
- Endpoint `PATCH /api/v1/tenants/me/branding` con auditoría.
- Ampliación del DTO `TenantSelfResponseDto` con campos de branding.

### No entra (MVP)

- Upload de archivos al servidor — se gestiona en fase posterior.
- Logo en TopHeader ni en otras superficies del portal.
- Favicon dinámico por tenant — fase posterior.
- Logo en documentos — cuando se implemente el módulo de documentos.
- Login page del tenant con logo — fase posterior.

---

## 3. Formatos de imagen

### Sello (ícono compacto — uso en sidebar, favicon futuro, documentos)

| Criterio | Especificación |
|---|---|
| **Formato preferido** | SVG — escala sin pérdida, ideal para todos los tamaños |
| **Formato alternativo** | PNG con fondo transparente, mínimo 256×256 px |
| **Proporción** | 1:1 (cuadrado) obligatoria |
| **Variantes** | `seal_light_url` (fondos claros) y `seal_dark_url` (fondos oscuros) |
| **Uso en sidebar** | 32×32 px (`w-8 h-8`) |
| **Uso futuro** | Favicon 16×16 y 32×32, documentos 64×64 |

### Logo (banner horizontal — uso en documentos futuros, login futuro)

| Criterio | Especificación |
|---|---|
| **Formato preferido** | SVG |
| **Formato alternativo** | PNG con fondo transparente |
| **Proporción** | 3:1 a 5:1 (horizontal) — renderizado con `object-fit: contain` |
| **Variantes** | `logo_light_url` (fondos claros) y `logo_dark_url` (fondos oscuros) |

### Por qué no JPEG/WEBP

JPEG no soporta transparencia. WEBP es óptimo para fotografía, no para logotipos vectoriales. SVG/PNG son el estándar para identidad visual corporativa.

---

## 4. Modelo de datos

### Columnas nuevas en `public.tenants`

| Columna DB | Campo entidad | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|---|
| `logo_light_url` | `logoLightUrl` | `varchar(500)` | sí | null | Logo horizontal — variante clara |
| `logo_dark_url` | `logoDarkUrl` | `varchar(500)` | sí | null | Logo horizontal — variante oscura |
| `seal_light_url` | `sealLightUrl` | `varchar(500)` | sí | null | Sello compacto — variante clara |
| `seal_dark_url` | `sealDarkUrl` | `varchar(500)` | sí | null | Sello compacto — variante oscura |
| `show_tenant_name` | `showTenantName` | `boolean` | no | `true` | Mostrar nombre comercial junto al sello en sidebar |

### Ownership

Todos los campos son **tenant-managed** — editables por ADMIN desde portal. No son editables desde apps/web como configuración de plataforma.

### Migración

Una migración TypeORM versionada agrega las 5 columnas. Sin cambios destructivos. Todas las URLs son nullable; `show_tenant_name` tiene default `true` para no romper tenants existentes.

---

## 5. Contratos de API

### Nuevo endpoint

| Método | Ruta | Guard | Descripción |
|---|---|---|---|
| `PATCH` | `/api/v1/tenants/me/branding` | `JwtAuthGuard` + `RolesGuard(ADMIN)` | Actualizar URLs de logo, sello y preferencia de nombre |

### `UpdateTenantSelfBrandingDto`

```
logoLightUrl?   string | null   — URL https:// o null para borrar
logoDarkUrl?    string | null
sealLightUrl?   string | null
sealDarkUrl?    string | null
showTenantName? boolean
```

### Validaciones backend

- URLs deben iniciar con `https://` — se rechaza `http://` y `data:` URI (previene XSS/CSP bypass).
- Longitud máxima 500 caracteres.
- `null` permitido para borrar una imagen configurada.
- Solo `ADMIN` puede escribir.
- Auditoría con `oldValue`/`newValue` para entidad `TenantBranding`.

### `TenantSelfResponseDto` ampliado

Los campos de branding se agregan al DTO de respuesta de `GET /tenants/me` para que el frontend los lea en la carga inicial sin request adicional. El frontend ya llama `GET /tenants/me` al cargar settings — cero overhead.

---

## 6. Componente `TenantSeal`

Componente React reutilizable para todos los puntos de consumo del sello.

### Props

```typescript
interface TenantSealProps {
  sealLightUrl: string | null;
  sealDarkUrl: string | null;
  name: string;               // nombre comercial — para generar iniciales del fallback
  size?: 'sm' | 'md' | 'lg'; // sm=32px, md=40px, lg=64px — default 'sm'
  className?: string;
}
```

### Lógica de renderizado

```
TenantSeal
  ├── Si hay URL de sello (según dark mode) → <img>
  │     ├── onError → fallback de iniciales (imagen rota = sin URL)
  │     └── Elige sealDarkUrl en modo oscuro, sealLightUrl en modo claro
  │         Si solo hay una variante → se usa en ambos modos
  └── Si no hay URL → fallback:
        cuadrado redondeado bg-iwana-secondary (#A5C330)
        iniciales del nombre (máx. 2 caracteres, mayúsculas)
        texto: text-iwana-primary (#17163A) font-bold — Exo 2
        → idéntico al "iW" actual del sidebar
```

### Sizes

| Size | px | Clase Tailwind |
|---|---|---|
| `sm` | 32×32 | `w-8 h-8` |
| `md` | 40×40 | `w-10 h-10` |
| `lg` | 64×64 | `w-16 h-16` |

### Generación de iniciales

```
"ISP Colombia"     → "IC"
"Telecom Sur"      → "TS"
"Fibernet"         → "FI"   (una palabra → primeras 2 letras)
```

---

## 7. Sidebar adaptado

### Estado actual (hardcodeado)

```
Expandido:  [div bg-secondary] "iW"  |  "iWana Empresa"
Colapsado:  [div bg-secondary] "iW"
```

### Estado final (dinámico)

```
Expandido (show_tenant_name = true):
  <TenantSeal size="sm" />  <span>{tenant.name}</span>

Expandido (show_tenant_name = false):
  <TenantSeal size="sm" />

Colapsado (siempre):
  <TenantSeal size="sm" />
```

El sidebar recibe el objeto `TenantSelf` (que ya se carga en el layout del portal) como prop o via contexto. No hace fetch adicional.

---

## 8. UI en settings (`BrandingForm`)

Nuevo bloque en `dashboard/settings`, cuarto en el orden, después de Seguridad.

### Campos del formulario

```
┌─ Logo y Sello ──────────────────────────────────────────────────────┐
│                                                                       │
│  LOGO HORIZONTAL (para documentos)                                   │
│  ┌──────────────────────────┐  ┌──────────────────────────┐         │
│  │ URL variante clara       │  │ URL variante oscura      │         │
│  └──────────────────────────┘  └──────────────────────────┘         │
│  Preview con fondo claro / oscuro alternado (si URL válida)          │
│                                                                       │
│  SELLO (ícono compacto — sidebar y documentos)                       │
│  ┌──────────────────────────┐  ┌──────────────────────────┐         │
│  └──────────────────────────┘  └──────────────────────────┘         │
│  Preview con fondo claro / oscuro alternado (si URL válida)          │
│                                                                       │
│  OPCIONES DE VISUALIZACIÓN                                            │
│  ☑ Mostrar nombre comercial junto al sello en el menú lateral        │
│                                                                       │
│  Nota: Las imágenes deben estar publicadas en HTTPS.                  │
│  Formatos recomendados: SVG o PNG con fondo transparente.            │
│                                                                       │
│                          [Guardar logo y sello]                       │
└───────────────────────────────────────────────────────────────────────┘
```

### Comportamiento del preview

- Preview se actualiza en tiempo real al escribir la URL (sin guardar).
- Si la URL carga → muestra imagen en miniatura sobre fondo claro y fondo oscuro alternados.
- Si la URL no carga o es inválida → muestra mensaje "No se pudo cargar — verifica la URL y que sea HTTPS."
- Preview del sello también muestra cómo quedaría el sidebar con el sello + nombre.

### Validaciones frontend (Zod)

```
logoLightUrl: z.string().url().startsWith('https://').max(500).optional().or(z.literal(''))
logoDarkUrl:  igual
sealLightUrl: igual
sealDarkUrl:  igual
showTenantName: z.boolean()
```

---

## 9. Identidad visual — alineación con Manual iWana

| Elemento | Token iWana | Aplicación |
|---|---|---|
| Fallback sello — fondo | `bg-iwana-secondary` (`#A5C330`) | Idéntico al "iW" actual |
| Fallback sello — texto | `text-iwana-primary` (`#17163A`) | Contraste 7.9:1 — WCAG AAA |
| Tipografía iniciales | Exo 2, `font-bold` | Font principal del sistema |
| Bordes redondeados | `rounded-md` (6px) | Estándar iWana |

El fallback de iniciales es visualmente indistinguible del ícono "iW" actual — la transición entre estado sin sello y con sello es natural y no rompe la identidad de plataforma.

---

## 10. Fuentes de datos en el sidebar

El layout del portal (`apps/portal/src/app/dashboard/layout.tsx` o equivalente) ya carga los datos del tenant autenticado. Los campos de branding llegan como parte de `TenantSelf` desde `GET /tenants/me` — que ya existe y ya se llama.

**No se requiere** un contexto nuevo ni un hook adicional. El sidebar recibe `profile: TenantSelf` como prop desde el layout, igual que lo hace el dashboard hoy.

---

## 11. Decisiones de diseño

| Decisión | Razón |
|---|---|
| URL externa en MVP, upload después | Cero infraestructura de almacenamiento nueva en esta fase |
| HTTPS obligatorio | Previene mixed-content warnings y posibles XSS con `data:` URIs |
| Columnas en `public.tenants`, no JSONB | Semántica clara, validación tipada, sin ambigüedad de ownership |
| `TenantSeal` como componente independiente | Reutilizable en sidebar, documentos, login futuro sin duplicar lógica |
| Fallback de iniciales con colores iWana | Coherencia visual — el tenant siempre ve algo reconocible, no un espacio vacío |
| `show_tenant_name` default `true` | Los tenants existentes no pierden el nombre en el sidebar al hacer la migración |
| Solo una variante de URL necesaria (no ambas) | Flexibilidad — un tenant puede subir solo la versión clara y el sistema la usa en ambos modos |
