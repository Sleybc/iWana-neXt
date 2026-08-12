# PROMPT-WEB-EMPRESAS-DIRECTORIO-ALINEACION-v1.0

## Prompt de ejecución — alinear `/tenants` (Empresas) a Firma iWana

**Versión:** 1.0  
**Estado:** Emitido — pendiente de ejecución  
**Fecha:** 2026-08-11  
**Emite:** AI-EM-ARCH (modo Orchestrator)  
**Etapa:** G2 (A+B congelan) → G4/G5 (C implementa) → G6 (D dictamina) · protocolo v1.5 §3bis · **carril rápido de UI**  
**Destinatarios:** AI-PROD-UX (A) · AI-DS-OWNER (B) · AI-FE-PLATFORM (C) · AI-SR-QA (D)  
**Plantilla de formato (en revisión):** [`TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)

> Sin prompt de ejecución no hay implementación. Lo que no está aquí no entra.  
> No es rediseño: el directorio ya es el lugar correcto de la tabla. Se alinea vocabulario, piel KPI, a11y y fetch de filtros al centro de control.

---

## 0. Identidad de sesión (obligatoria al arrancar)

Cada agente declara su rol al primer entregable. Lee antes de tocar nada:

1. `AGENTS.md`
2. Este prompt (alcance exacto)
3. [`INFORME-WEB-EMPRESAS-AUDITORIA-UI-v1.0.md`](../informes/INFORME-WEB-EMPRESAS-AUDITORIA-UI-v1.0.md) — fuente de hallazgos y CA
4. El `SKILL.md` de su track (tabla §3)
5. Contratos padre del centro de control (tabla §1) — recetas DS-S y copy `status*` ya vivos

**Modo:** ejecución contra contratos. A y B **transcriben** el informe + recetas vivas; no inventan flujo ni tokens. C implementa la spec, no este resumen. D no implementa features.

---

## 1. Contratos

### 1.1 Ya vigentes (no reabrir)

| Contrato | Ruta | Uso en esta fase |
| --- | --- | --- |
| Auditoría Empresas | [`INFORME-WEB-EMPRESAS-AUDITORIA-UI-v1.0.md`](../informes/INFORME-WEB-EMPRESAS-AUDITORIA-UI-v1.0.md) | Hallazgos P1/P2, CA-EMP-01…10, veredicto |
| UX spec portada | [`2026-08-11-web-centro-control-portada-senal-ux-spec.md`](../specs/2026-08-11-web-centro-control-portada-senal-ux-spec.md) | Copy canónico de estados; deep-link `/tenants?status=` |
| DS contrato portada | [`2026-08-11-web-centro-control-portada-senal-ds-contrato.md`](../specs/2026-08-11-web-centro-control-portada-senal-ds-contrato.md) | Receta **DS-S** (chips) · sombras · foco · toast/Alert |
| DS Fase-1 | [`2026-07-20-web-dashboard-firma-fase1-contrato.md`](../specs/2026-07-20-web-dashboard-firma-fase1-contrato.md) | `shadow-iwana-card` / `shadow-iwana-soft` · `--z-toast` |
| Firma iWana | [`2026-07-12-firma-iwana-diseno-visual-design.md`](../specs/2026-07-12-firma-iwana-diseno-visual-design.md) | Identidad; no cambiar tokens de marca |
| Copy vivo | `apps/web/src/lib/platform-ui-copy.ts` → `dashboard.status*` / `directoryError` / `chip*` | Fuente de rótulos; no duplicar strings sueltos |
| Receta viva KPI | `apps/web/src/components/dashboard/SignalChips.tsx` | Componer; no reinventar cards |
| Informe vivo home | [`INFORME-WEB-DASHBOARD-UI-REVIEW-v1.1.md`](../informes/INFORME-WEB-DASHBOARD-UI-REVIEW-v1.1.md) | No tocarlo salvo enlace cruzado de una línea |

### 1.2 A congelar en esta fase (DoR de etapa 5)

Hasta que A y B dejen estos artefactos en `docs/specs/` **con versión y estado Congelado**, C **no escribe código**. Quien reciba el handoff verifica su DoR; si falta, `[BLOQUEO]` a AI-EM-ARCH.

| Contrato | Dueño | Artefacto a crear | Evento de congelación |
| --- | --- | --- | --- |
| **UX spec Empresas** | AI-PROD-UX | `docs/specs/2026-08-11-web-empresas-directorio-ux-spec.md` v1.0 | Cabecera: estado **Congelado** · cita este prompt |
| **DS contrato Empresas** | AI-DS-OWNER | `docs/specs/2026-08-11-web-empresas-directorio-ds-contrato.md` v1.0 | Cabecera: estado **Congelado** · carril rápido · cita receta DS-S |

### 1.3 API — congelada, sin cambio

**Sin endpoints nuevos. Sin OpenAPI. Sin migraciones. Sin `@Roles`.**

Cliente ya tipado:

```ts
tenantApi.list({ limit, offset, status?, search? })
```

Definido en `apps/web/src/lib/api-client.ts` (`TenantListParams`). Hoy `page.tsx` **no pasa** `status` ni `search`. Esta fase solo usa el contrato existente.

Pager numerado / `meta.capabilities.randomAccess` (**ADR-065**) = **deuda declarada, fuera de este prompt**. El pie sigue siendo load-more (analogía ADR-064).

---

## 2. Objetivo

Quien llega desde el centro de control (`/tenants?status=PROVISIONING` o `ACTIVE`) reconoce el mismo lenguaje, ve el parque filtrado **en servidor**, y actúa (entrar, suspender, reactivar, reintentar alta) sin prosa que empuje la tabla bajo el pliegue.

### Entra

| ID | Paso | Track | Cierra |
| --- | --- | --- | --- |
| A-1 | Congelar UX spec: chrome, copy literal, estados, empty, KPI navegable, a11y de tabla, CA-EMP | A | DoR C |
| B-1 | Congelar DS: reutilizar DS-S, extensión mínima de `SignalChips`, Alert, Badge, tabla, toast | B | DoR C |
| C-1 | Helper único de estado de empresa (plural + singular) desde `PLATFORM_UI_COPY.dashboard.status*` | C | CA-EMP-01/02 |
| C-2 | Badges de fila + filtro + KPI: cero «Activo», «Configurando», «Configuración fallida», «En puesta en marcha» | C | CA-EMP-01 |
| C-3 | Chrome: un H1, subtítulo corto, eyebrow `Directorio`. Quitar H2 y párrafo del hero. Título de tabla sin segundo párrafo | C | CA-EMP-06 |
| C-4 | KPI → composición `SignalChips` (3 chips). Cáscara `shadow-iwana-card`. Skeleton en carga | C | CA-EMP-08 + P2 KPI |
| C-5 | `tenantApi.list` recibe `status` y `search`. Offset 0 al cambiar filtro/búsqueda. Load-more sobre el resultado servidor | C | CA-EMP-10 |
| C-6 | Persistencia `sort`/`dir` en URL con `replace` (junto a `status`/`q`/`size` si ya existen) | C | P2 ingeniería |
| C-7 | `aria-sort` en `<th>` ordenables; quitar `onClick` de celdas de estado/fechas; un solo control de fila al teclado (nombre) | C | CA-EMP-09 |
| C-8 | Placeholder, errores y toasts/Alertas al patrón canónico. Toast: `Alert` en flujo o `z-(--z-toast)` + `shadow-iwana-soft` | C | CA-EMP-03/05/07 |
| C-9 | Slug `text-xs font-mono`; fechas `<time>` + `font-mono tabular-nums`. Retirar o redirigir `TenantStatusBadge` huérfano | C | P3 + P2 mapas |
| C-10 | Jest: `page.spec.tsx` + `TenantsTable` (+ helper). Cubrir CA-EMP-01…10 automatizables | C | G5 |
| D-1…D-8 | Trazabilidad CA, Jest, typecheck, audit-ui, E2E, axe, dictamen, informe | D | G6 |

### No entra

| Fuera | Motivo |
| --- | --- |
| Portal (`apps/portal`) | Superficie distinta |
| Import desde `apps/portal` | Boundary |
| Primitive nueva en `@iwana/ui` | Carril rápido: componer lo vivo |
| Tokens de marca / sidebar / canvas `rounded-3xl` | Ya cerrados; no reabrir |
| Endpoints, OpenAPI, migraciones, backend | Contrato API intacto |
| Pager numerado ADR-065 | Deuda declarada |
| `/tenants/new`, ficha, settings, usuarios | Fuera de `/tenants` listado |
| NotificationBell (otro lema de estado) | Deriva hermana; no bloquea |
| Foco de `ConfirmDialog` | Fuera del núcleo |
| G6.5 / G7 / commit / push | No se anticipan |
| Reabrir enfoque A del home ni copy `status*` del dashboard | Ya congelado y aceptado |

---

## 3. Skills por track

| Track | Agente | Skills (leer `SKILL.md` antes) |
| --- | --- | --- |
| A | AI-PROD-UX | `system-vocabulary-review` · `iwana-identity-ui-review` (modo review) · `writing-plans` solo si A se bloquea |
| B | AI-DS-OWNER | `core-components` · `tailwind-patterns` · `iwana-identity-ui-review` · `senior-ui-systems-designer` (review, no propuesta estética nueva) |
| C | AI-FE-PLATFORM | `iwana-identity-ui-review` (modo diseño) · `frontend-dev-guidelines` · `nextjs-app-router-patterns` · `test-driven-development` · `system-vocabulary-review` · `ui-ux-pro-max` **subordinada** a identidad |
| D | AI-SR-QA | `testing-patterns` · `e2e-testing-patterns` · `playwright-skill` · `wcag-audit-patterns` · `verification-before-completion` |

`ui-ux-pro-max` no inventa paleta, radio ni receta de chip. Si choca con DS-S o Firma iWana, gana el contrato.

---

## 4. Track A — AI-PROD-UX (congela UX spec)

**No implementa. No rediseña.** Transcribe el informe + las decisiones §7 a `docs/specs/2026-08-11-web-empresas-directorio-ux-spec.md`.

La spec v1.0 **debe** incluir, en este orden:

1. **Cabecera:** título, v1.0, estado Congelado, fecha, cita de este prompt y del informe de auditoría.
2. **Personas / tarea:** operador de plataforma encuentra una empresa, reconoce estado, actúa.
3. **Arquitectura de página (sin wireframe ornamental):**
   - `PageHeader`: H1 `Empresas` · subtítulo **corto** (ver §7.2) · CTA `Nueva empresa` → `/tenants/new`.
   - Bloque KPI: eyebrow `Directorio` · 3 chips (Activas / En configuración / Requieren atención) · enlace secundario `Volver al centro de control`.
   - Tabla: un título (`Empresas` o `Directorio`) **sin** párrafo segundo.
   - Empty primera vez ≠ empty de filtros. CTA `Registrar primera empresa` **solo** si el parque total es 0 (sin filtros).
4. **Copy literal** §7.2 y §7.3. Prohibido «tenant», «slug», «identificador», «MFA», «CRUD», «puesta en marcha» como **estado**. «Puesta en marcha» solo en hint de historial/centro (`statusHintFailed`), no en KPI ni badge.
5. **Estados:** plural (filtro, KPI, chips) vs singular femenino (badge de fila). Tabla §7.3.
6. **Navegación KPI:** cifra > 0 en Activas → `?status=ACTIVE`; En configuración → `?status=PROVISIONING`. «Requieren atención» **no** inventa query (mismo criterio S-3 del home: foco a la tabla / no query).
7. **Filtros URL:** `status`, búsqueda (`q` o el param que ya use la página — no inventar un segundo nombre), `sort`, `dir`. Deep-link del home sigue funcionando.
8. **A11y:** un H1; `aria-sort` en columnas ordenables (uno ≠ `none`); un solo control de fila al teclado (nombre → ficha); fechas con `<time>`.
9. **CA-EMP-01…10** copiados del informe (no reenumerar).
10. **Fuera:** ADR-065, portal, ficha, NotificationBell.

**Stop A:** si hace falta un flujo nuevo (wizard, tabs de ámbito, pager numerado) → `[BLOQUEO]`. No ampliar alcance.

---

## 5. Track B — AI-DS-OWNER (congela DS contrato)

**No implementa. No crea primitive `@iwana/ui`.** Carril rápido: reutilizar.

Artefacto: `docs/specs/2026-08-11-web-empresas-directorio-ds-contrato.md` v1.0 Congelado.

**Debe** fijar:

| ID | Receta | Fuente | Qué hacer |
| --- | --- | --- | --- |
| DS-E-KPI | Chips S | DS contrato portada § DS-S + `SignalChips.tsx` | Mismas clases de cáscara (`rounded-3xl`, `shadow-iwana-soft`, acentos primary/warning/danger). **Prohibido** `shadow-sm`, iconos en pozo `dark:bg-emerald-950`, cifra sin `font-mono tabular-nums`, `...` de carga |
| DS-E-EXT | Extensión local de `SignalChips` | Carril rápido | Props **opcionales** con default actual (el home no se rompe): `eyebrow` (default `summaryEyebrow`), `ariaLabel`, `skeletonCount` (default 4). Si `chips.length === 3` → grid `xl:grid-cols-3`. No promover a `@iwana/ui` |
| DS-E-SHELL | Cáscara del bloque KPI | Fase-1 | Una sola cáscara `rounded-2xl` + `shadow-iwana-card` (o la sombra que Fase-1 reserve para secciones). Sin card-dentro-de-card con `shadow-sm` |
| DS-E-BADGE | Estado de fila | `@iwana/ui` `Badge` | Variant por estado (success / warning / error / neutral). Lima **nunca** = urgencia. Texto = singular §7.3 |
| DS-E-TABLE | Tabla | Contrato portada / Fase-1 | `interactiveFocusClassName` solo en el nombre. Encabezado activo `font-semibold text-iwana-primary`. Sin lima en el caret de orden. Slug `text-xs font-mono`. Fechas `font-mono tabular-nums` |
| DS-E-ALERT | Feedback | `@iwana/ui` `Alert` + `--z-toast: 600` | Preferir `Alert` en el flujo del listado. Si se conserva toast flotante: `z-(--z-toast)`, `shadow-iwana-soft`, `bg-success-600` / `bg-error-600`. Prohibido `z-50` + `shadow-lg` ad hoc |
| DS-E-EMPTY | Vacíos | Ya en página | Dos recetas distintas; no unificar |

Checklist B § cierre: 0 tokens nuevos · 0 primitives nuevas · home `SignalChips` visualmente idéntico si no se pasan las props nuevas.

**Stop B:** primitive nueva o token de marca → `[BLOQUEO]`.

---

## 6. Track C — AI-FE-PLATFORM

Arranca **solo** con A-1 y B-1 Congelados (rutas §1.2). Implementa **la UX spec + el DS contrato**, no este resumen.

Skills y TDD: tests que fallen por CA-EMP **antes** de pintar (al menos C-2, C-5, C-7, C-8).

### 6.1 Archivos previstos

| Archivo | Acción |
| --- | --- |
| `apps/web/src/lib/tenant-status-label.ts` (+ `.spec.ts`) | **Nuevo.** Helper `labelForTenantStatus(status, { form: 'plural' \| 'singular' })` leyendo `PLATFORM_UI_COPY.dashboard`. Cero mapas locales |
| `apps/web/src/lib/platform-ui-copy.ts` | Solo si A pide 2–4 claves nuevas de chrome Empresas (`tenants.subtitle`, `tenants.searchPlaceholder`, `tenants.suspendSuccess`, …). No tocar `dashboard.status*` |
| `apps/web/src/components/dashboard/SignalChips.tsx` (+ spec) | Extensión B (DS-E-EXT). Defaults = comportamiento actual del home |
| `apps/web/src/app/(protected)/tenants/page.tsx` | Chrome, KPI, fetch `status`/`search`, URL `sort`/`dir`, Alertas |
| `apps/web/src/app/(protected)/tenants/page.spec.tsx` | Reescribir aserciones de copy/KPI/fetch. El mock de `useSearchParams` ya existe (C-10 de portada) |
| `apps/web/src/components/dashboard/TenantsTable.tsx` (+ spec si existe o crear) | Badge helper, `aria-sort`, quitar `onClick` mudos, placeholder, load-more servidor |
| `apps/web/src/components/tenants/TenantStatusBadge.tsx` | Retirar o reexportar el helper. **Un solo mapa de estados en el repo web** |

No tocar: layout shell, sidebar, dashboard home salvo props opcionales de `SignalChips`, portal, API.

### 6.2 Fetch (C-5) — contrato de comportamiento

```
loadTenants():
  tenantApi.list({
    limit,
    offset,          // 0 cuando cambian status o search
    status: statusFilter !== 'TODAS' ? statusFilter : undefined,
    search: searchQuery.trim() || undefined,
  })
```

- Cambiar filtro o búsqueda → `offset = 0` y nueva petición.
- «Cargar más» → `offset += limit` **con los mismos** `status`/`search`.
- No recortar en cliente un lote sin filtrar para simular el deep-link.
- Si el API no entiende un `status` inválido de URL → tratar como `TODAS` (ya hay parseo; no cambiar salvo bug).

### 6.3 TDD mínimo (C-10)

| Caso | Assert |
| --- | --- |
| CA-EMP-01 | DOM sin «Configurando», «Configuración fallida», «En puesta en marcha», «Activo» (palabra completa de estado). Sí «En configuración», «Con error», «Activas» / «Activa» |
| CA-EMP-02 | `status=PROVISIONING` → filtro y badge de fila dicen «En configuración» |
| CA-EMP-03 | `tenantApi.list` rechaza → texto `directoryError` |
| CA-EMP-04 | Parque 0 → CTA primera empresa. Filtro sin filas → **sin** ese CTA |
| CA-EMP-05 | Placeholder sin «identificador» / «tenant» / «slug» |
| CA-EMP-06 | Un `heading` level 1; no hay H2 del hero actual |
| CA-EMP-07 | Éxito breve (`Empresa suspendida.`); error `No pudimos…` |
| CA-EMP-08 | Chip Activas con count > 0 es enlace a `status=ACTIVE` |
| CA-EMP-09 | `th` con `aria-sort`; celdas estado/fecha **sin** `onClick` |
| CA-EMP-10 | `tenantApi.list` llamado con `{ status: 'ACTIVE' }` (o search) — no solo `{ limit, offset }` |

### 6.4 Comandos C

```
pnpm --filter @iwana/web exec jest --runInBand --testPathPattern=tenant-status-label
pnpm --filter @iwana/web exec jest --runInBand --testPathPattern=app/\\(protected\\)/tenants/page.spec
pnpm --filter @iwana/web exec jest --runInBand --testPathPattern=TenantsTable
pnpm --filter @iwana/web exec jest --runInBand --testPathPattern=SignalChips
pnpm --filter @iwana/web typecheck
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/web/src/app/(protected)/tenants apps/web/src/components/dashboard/TenantsTable.tsx
```

En PowerShell no expandir `(protected)` sin escape.

**Prohibido C:** commitear · primitive `@iwana/ui` · import portal · pager ADR-065 · reabrir `status*` del dashboard · lima como urgencia · `synchronize` / backend.

---

## 7. Decisiones — no reabrir

### 7.1 Producto / arquitectura

| Asunto | Decisión |
| --- | --- |
| Superficie | Solo `apps/web` `/tenants` (listado) |
| Enfoque | Alinear, no rediseñar. Tabla se queda |
| Directorio canónico | Sigue siendo `/tenants` |
| KPI | 3 chips DS-S, no 4 cards con icono |
| S-3 análogo | «Requieren atención» no inventa `?status=` |
| Pager | Load-more. ADR-065 deuda, no esta fase |
| Mapas de estado | Un helper. `TenantStatusBadge` no vive en paralelo |

### 7.2 Copy de chrome (literal salvo que A documente una variante de 1 línea)

| Superficie | Texto |
| --- | --- |
| H1 | `Empresas` |
| Subtítulo | `Estado, contacto y última actualización de cada empresa.` |
| Eyebrow KPI | `Directorio` (no «Directorio operativo») |
| CTA header | `Nueva empresa` |
| Secundario | `Volver al centro de control` |
| Búsqueda | `Buscar por empresa o contacto…` |
| Error listado | `No pudimos cargar el directorio. Reintenta en unos minutos.` (`directoryError`) |
| Empty parque 0 | CTA `Registrar primera empresa` |
| Éxito suspender | `Empresa suspendida.` |
| Éxito reactivar | `Empresa reactivada.` |
| Éxito reintentar | `Reintento de alta enviado.` |
| Fallo acción | `No pudimos completar la acción. Reintenta en unos minutos.` |
| Reintentar | `Reintentar` |

Prohibido en UI: «correctamente», «Error al…», «No fue posible cargar empresas.», «identificador», «tenant», «slug» como etiqueta visible.

### 7.3 Estados (canónicos)

Fuente plural: `PLATFORM_UI_COPY.dashboard`.

| Enum | Plural (filtro, KPI, chip) | Singular (badge de fila) |
| --- | --- | --- |
| `ACTIVE` | Activas | Activa |
| `PROVISIONING` | En configuración | En configuración |
| `FAILED` | Con error | Con error |
| `SUSPENDED` | Suspendidas | Suspendida |
| `INACTIVE` | Inactivas | Inactiva |
| `MARKED_FOR_DELETION` | En eliminación | En eliminación |

Cero: Activo · Configurando · Configuración fallida · En puesta en marcha (como estado).

### 7.4 Chips KPI (3)

| Chip | Label | Accent | href si count > 0 |
| --- | --- | --- | --- |
| Activas | `statusActive` / `chipActive` | primary | `/tenants?status=ACTIVE` |
| En configuración | `statusProvisioning` | warning | `/tenants?status=PROVISIONING` |
| Requieren atención | `chipAttention` | danger | ninguno |

Conteo «Requieren atención»: el que ya calcula la página (FAILED + lo que hoy agrupe). No inventar semántica nueva.

---

## 8. Track D — AI-SR-QA

Arranca cuando C entregue. **No implementa UI.** Selectores por rol/nombre, no clases Tailwind.

| ID | Qué |
| --- | --- |
| **D-1** | Matriz CA-EMP-01…10 ↔ test que pasa (Jest y/o Playwright). Hueco = no cumplido |
| **D-2** | Jest C-10 en verde + typecheck `@iwana/web`. Adjuntar resumen; si Turbo cachea, `--force` o prueba de `Cached: 0` |
| **D-3** | `audit-ui.mjs` sobre page + TenantsTable: P0/P1 deterministas = 0 |
| **D-4** | E2E: desde centro, clic «En configuración» (o navegar `/tenants?status=PROVISIONING`) → heading Empresas, chip/filtro «En configuración», **sin** «Configurando». Búsqueda: «Fibernet Colombia» visible, «Demo ISP» no. Reutilizar `setupWebApiMocks` / login web |
| **D-5** | Viewports **375×812** y **1280×900**. 375: H1 + chips + tabla en una columna, tabla no empujada por H2. 1280: chips en fila. Capturas en `docs/quality/evidence-web-empresas-directorio/` (`375.png`, `1280.png`). Sin PII |
| **D-6** | Axe `wcag2a` + `wcag2aa` en `/tenants` autenticado. Violaciones = `[]`. `aria-sort` presente en un `th` |
| **D-7** | Actualizar **el mismo** [`INFORME-WEB-EMPRESAS-AUDITORIA-UI-v1.0.md`](../informes/INFORME-WEB-EMPRESAS-AUDITORIA-UI-v1.0.md): sección de cierre (matriz CA, números reales, dictamen). **No** crear INFORME nuevo. Una línea cruzada en el informe del dashboard §10 si hace falta |
| **D-8** | Dictamen **GO** / **GO condicionado** / **NO-GO**. GO solo con D-2…D-6 verdes. Si Playwright no corre en el sandbox → **NO-GO de evidencia** (no hay GO condicionado por ausencia). G6.5/G7 no se anticipan |

Comando D (ajustar path si el spec E2E es nuevo):

```
pnpm exec playwright test e2e/tests/web-auth-dashboard.spec.ts --config e2e/playwright.web.config.ts
```

Si D-4/D-5 viven en `e2e/tests/web-empresas-directorio.spec.ts`, incluirlo en el mismo comando o en un segundo `playwright test`.

---

## 9. Criterios de aceptación

Los **CA-EMP-01…10** del informe de auditoría (no reenumerar). Resumen operativo:

| ID | Criterio |
| --- | --- |
| **CA-EMP-01** | Badges, filtro y KPI usan `status*`. Cero «Configurando», «Configuración fallida», «En puesta en marcha», «Activo» |
| **CA-EMP-02** | `/tenants?status=PROVISIONING` muestra «En configuración» en filtro y filas |
| **CA-EMP-03** | Error de listado = `directoryError` |
| **CA-EMP-04** | Empty primera vez ≠ empty de filtros. CTA primera empresa solo en parque vacío |
| **CA-EMP-05** | Búsqueda sin «identificador», «tenant» ni «slug» |
| **CA-EMP-06** | Un H1, subtítulo corto, eyebrow `Directorio`. Sin H2 instructivo |
| **CA-EMP-07** | Éxito breve; error `No pudimos… Reintenta…` |
| **CA-EMP-08** | KPI Activas y En configuración (cifra > 0) aplican `?status=` |
| **CA-EMP-09** | `aria-sort`; un solo control de fila al teclado |
| **CA-EMP-10** | Listado pide `status`/`search` al servidor |

Cierre G6 además: DS-E-* respetados · Jest C-10 · E2E D-4…D-6 · `audit-ui` P0/P1 = 0.

---

## 10. Stop / go

**Stop — `[BLOQUEO]` a AI-EM-ARCH:**

- Endpoint nuevo, cambio OpenAPI o migración
- Primitive `@iwana/ui` o token de marca
- Import `apps/portal`
- Implementar pager ADR-065
- Reabrir copy `status*` del centro de control
- Lima como acento de urgencia
- Rediseñar la ficha o `/tenants/new`
- Confirmar dialog / NotificationBell como alcance

**Go (G6 de esta fase):**

- Specs A-1 y B-1 Congelados y citados
- CA-EMP-01…10 con evidencia (Jest + E2E 375/1280 + axe)
- Informe de auditoría actualizado (cierre), no duplicado
- Home `SignalChips` intacto en defaults
- Sin commit ni G6.5/G7

---

## 11. Orden de ejecución (paralelismo)

```
A-1 ─┐
     ├─ (contratos Congelados) → C-1…C-10 → D-1…D-8 → dictamen G6
B-1 ─┘
```

A y B corren en paralelo. C no arranca antes. D no arranca antes de C. Un cambio de contrato sube a v1.1 + adenda de EM-ARCH; no se parchea en silencio.

---

## 12. Entregables documentales

| Quién | Artefacto |
| --- | --- |
| A | `docs/specs/2026-08-11-web-empresas-directorio-ux-spec.md` |
| B | `docs/specs/2026-08-11-web-empresas-directorio-ds-contrato.md` |
| C | Código + tests. Sin informe propio |
| D | Cierre en `docs/informes/INFORME-WEB-EMPRESAS-AUDITORIA-UI-v1.0.md` + capturas `docs/quality/evidence-web-empresas-directorio/` |

Ningún `PROMPT-*` fuera de `docs/prompts/`. Ningún INFORME duplicado.

---

## 13. Deuda declarada (visible, no implementable aquí)

1. **ADR-065** — envelope `meta.capabilities.randomAccess` + pager numerado + primitive web. Exige contrato de API. Fuera.
2. **NotificationBell** — lema de estado distinto. Deriva hermana.
3. **ConfirmDialog** — foco; fuera del núcleo de esta portada.

---

*Emitido 2026-08-11 por AI-EM-ARCH (Orchestrator). Carril rápido de UI. G6.5 y G7 no forman parte de este prompt.*
