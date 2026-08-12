# Review UI — Empresas / directorio (`apps/web` `/tenants`)

## Resumen ejecutivo

Listado operativo para encontrar una empresa, reconocer su estado con el mismo lenguaje del centro de control y actuar (entrar, suspender, reactivar, reintentar el alta). La arquitectura aguanta: filtros en URL, confirmación, empty de primera vez vs. sin resultados. El daño está en el vocabulario (tres diccionarios de estado), en la prosa que empuja la tabla bajo el pliegue, y en una franja KPI que no es la receta ya aceptada en Monitoreo / Empresas por estado.

**Modo:** código (protocolo v1.5 · tracks PROD-UX + DS-OWNER + FE-PLATFORM)  
**Script:** `audit-ui.mjs` sobre page + TenantsTable + TenantStatusBadge → 0 deterministas, 0 heurísticos. El script no cubre copy, `aria-sort`, `shadow-sm` ni `dark:bg-emerald-950`.  
**Puntaje:** 52/100 (P0: 0, P1: 3, P2: 5, P3: 3)

## Hallazgos críticos (P0)

Ninguno.

## Hallazgos

### [P1][Vocabulario] Estados distintos al centro de control

- **Evidencia:** `TenantsTable.tsx:81-87` (Activo / Configurando / Configuración fallida) · `page.tsx:271` (En puesta en marcha) · `TenantStatusBadge.tsx:17-22` (tercer mapa, no montado). Canónico: `platform-ui-copy.ts` `statusActive`… y spec portada §6.
- **Impacto:** Quien pulsa «En configuración» o «Con error» en el home aterriza y no reconoce el estado. «Activo» habla de tenant, no de empresa.
- **Recomendación:** Un helper desde `PLATFORM_UI_COPY.dashboard.status*`. KPI 2 = En configuración. Badge de fila en femenino singular (Activa). «Puesta en marcha» solo como verbo de historial.
- **Esfuerzo:** S

### [P1][Accesibilidad] Tabla: orden y celdas no teclado

- **Evidencia:** `TenantsTable.tsx:359-396` sin `aria-sort` · `:500-521` `td` con `onClick` sin botón. Solo el nombre tiene `interactiveFocusClassName`.
- **Impacto:** El lector no anuncia el orden; tres columnas parecen clicables y no lo son al teclado (WCAG 2.1.1 / ADR-065 §22).
- **Recomendación:** `aria-sort` en cada `<th>` ordenable (uno distinto de `none`). Quitar `onClick` de estado/fechas. Peso `font-semibold text-iwana-primary` en el activo. Sin lima en el orden.
- **Esfuerzo:** S

### [P1][UX] `?status=` y búsqueda no van al API

- **Evidencia:** `page.tsx:128-129` lista solo `{ limit, offset }`. `tenantApi.list` ya acepta `status` y `search`. La tabla recorta en cliente y oculta «Cargar más» si hay filtro.
- **Impacto:** El deep-link del centro (`/tenants?status=ACTIVE`) solo recorta el lote cargado (hasta 100). El operador cree que eso es todo el directorio.
- **Recomendación:** Pasar `status`/`search` al listado, resetear offset al filtrar, load-more sobre el resultado servidor.
- **Esfuerzo:** S

### [P2][UX] Tres bloques de prosa antes de la tabla

- **Evidencia:** `page.tsx:372-396` (subtítulo + H2 + párrafo) y `TenantsTable.tsx:305-308` (otro título + párrafo).
- **Impacto:** La tarea queda bajo el pliegue.
- **Recomendación:** Subtítulo corto. Eyebrow `Directorio`. Quitar H2 y el párrafo del hero. Título de tabla sin segundo párrafo.
- **Esfuerzo:** S

### [P2][Identidad] KPI ad hoc: cards dentro de cards

- **Evidencia:** `page.tsx:382-431` — `shadow-sm`, cifra sin `font-mono tabular-nums`, `...` en carga, pozos `dark:bg-emerald-950/25`. Receta viva: `SignalChips.tsx`.
- **Impacto:** Misma métrica, otra piel que el centro de control.
- **Recomendación:** Componer `SignalChips` (mismas clases DS-S). Cáscara única `shadow-iwana-card`. `SkeletonBlock` en carga. KPI Activas / En configuración con cifra > 0 aplican `?status=`. «Requieren atención» no inventa query.
- **Esfuerzo:** S–M

### [P2][Copy] «Identificador» y errores fuera de patrón

- **Evidencia:** placeholder `TenantsTable.tsx:316` · `page.tsx:133` «No fue posible cargar empresas.» · toasts `:156-247` con «correctamente» / «Error al…».
- **Recomendación:** `Buscar por empresa o contacto…` · `directoryError` · éxitos breves (`Empresa suspendida.`) · fallos `No pudimos… Reintenta en unos minutos.`
- **Esfuerzo:** S

### [P2][Identidad] Toast flotante `z-50` / `shadow-lg`

- **Evidencia:** `page.tsx:315-321`. Escala iWana: `--z-toast: 600`. Receta §7: `Alert` de `@iwana/ui`.
- **Recomendación:** `Alert` en el flujo, o `z-(--z-toast)` + `shadow-iwana-soft` + `bg-success-600` / `bg-error-600`.
- **Esfuerzo:** S

### [P2][Ingeniería] Tres mapas de estado + orden solo en memoria

- **Evidencia:** `TenantsTable` pills · `TenantStatusBadge` huérfano · `sortField` no va a la URL.
- **Recomendación:** Un helper + `<Badge>`. Persistir `sort`/`dir` con `replace`.
- **Esfuerzo:** S–M

### [P3] Carga `...`, slug `text-[11px]`, fechas sin mono

- **Evidencia:** `page.tsx:418` · `TenantsTable.tsx:494` · `:509-521`.
- **Recomendación:** Skeleton; `text-xs font-mono`; fechas `font-mono tabular-nums` + `<time>`.
- **Esfuerzo:** S

## Quick wins

1. Rótulos → `PLATFORM_UI_COPY.dashboard.status*`.
2. `aria-sort` + quitar `onClick` de celdas mudas.
3. `status`/`search` al `tenantApi.list`.
4. Placeholder, errores y toasts al patrón canónico.
5. KPI → composición `SignalChips`; toast → `Alert`.

## Mejoras estratégicas

- Envelope `meta.capabilities.randomAccess` + pager numerado (ADR-065). Hoy el pie es load-more (analogía ADR-064). **No es carril rápido:** exige contrato de API y primitive web. Declarado, no bloquea el ajuste de copy/identidad.
- Promover helper de estado de empresa (label + variant) y retirar `TenantStatusBadge` o redirigirlo.

## Criterios de aceptación (si se remedia)

| ID | Criterio |
| --- | --- |
| **CA-EMP-01** | Badges, filtro y KPI usan `PLATFORM_UI_COPY.dashboard.status*`. Cero «Configurando», «Configuración fallida», «En puesta en marcha», «Activo». |
| **CA-EMP-02** | `/tenants?status=PROVISIONING` muestra «En configuración» en filtro y filas. |
| **CA-EMP-03** | Error de listado: `No pudimos cargar el directorio. Reintenta en unos minutos.` |
| **CA-EMP-04** | Empty primera vez ≠ empty de filtros. CTA `Registrar primera empresa` solo en parque vacío. |
| **CA-EMP-05** | Búsqueda sin «identificador», «tenant» ni «slug». |
| **CA-EMP-06** | Un H1, un subtítulo corto, un eyebrow `Directorio`. Sin H2 instructivo. |
| **CA-EMP-07** | Toasts/Alertas: éxito breve; error `No pudimos… Reintenta…`. |
| **CA-EMP-08** | KPI Activas y En configuración (cifra > 0) aplican `?status=`. |
| **CA-EMP-09** | `aria-sort` en encabezados ordenables; un solo control de fila al teclado. |
| **CA-EMP-10** | Listado pide `status`/`search` al servidor. |

## Por verificar

1. Contraste runtime de `dark:text-emerald-300` en iconos KPI (cae si se adopta DS-S).
2. Foco de `ConfirmDialog` (fuera del núcleo de esta portada).
3. NotificationBell: **cerrado** — mismo helper de estado que el directorio (`Con error`, sin slug).

## Veredicto

**Aprobada con cambios.**

No hace falta rediseñar el directorio: es el lugar correcto de la tabla. Bloqueantes de cierre: **CA-EMP-01, CA-EMP-02, CA-EMP-03, CA-EMP-09, CA-EMP-10**. El resto son quick wins del mismo ajuste.

**Siguiente paso (orquestación):** ejecutado. Prompt G4 emitido: [`PROMPT-WEB-EMPRESAS-DIRECTORIO-ALINEACION-v1.0.md`](../prompts/PROMPT-WEB-EMPRESAS-DIRECTORIO-ALINEACION-v1.0.md). Tracks A+B congelan specs → C implementa CA-EMP-01…10 → D dictamina G6. G6.5 / G7 no se anticipan. Pager ADR-065 queda como deuda declarada, fuera de ese prompt.

## Tracks

| Rol | Dictamen |
| --- | --- |
| AI-PROD-UX | Aprobada con cambios. Bloqueantes: rótulos + error de carga. |
| AI-DS-OWNER | GO con deuda. Firma no rota. KPI ≠ DS-S. Load-more vs ADR-065 declarado. |
| AI-FE-PLATFORM | Listo para remediación FE. P1: copy, `aria-sort`, fetch de filtros. |

## Cierre G6 — Track D (2026-08-11)

**Agente:** AI-SR-QA  
**Prompt:** [`PROMPT-WEB-EMPRESAS-DIRECTORIO-ALINEACION-v1.0.md`](../prompts/PROMPT-WEB-EMPRESAS-DIRECTORIO-ALINEACION-v1.0.md) §8–§9  
**Specs:** UX + DS Empresas v1.0 Congelados. Status API = `PROVISIONING_FAILED`. Search param = `search`.

### Matriz CA-EMP ↔ test

| ID | Criterio | Evidencia | Estado |
| --- | --- | --- | --- |
| **CA-EMP-01** | Cero «Configurando» / «Configuración fallida» / «En puesta en marcha» / «Activo»; sí `status*` | Jest `tenant-status-label.spec.ts` · `page.spec` CA-EMP-01 · `TenantsTable.spec` CA-EMP-01/02 · E2E D-4 | Cubierto · PASS |
| **CA-EMP-02** | `?status=PROVISIONING` → «En configuración» en filtro y filas | Jest `page.spec` CA-EMP-02 · `TenantsTable.spec` · E2E D-4 (clic chip → filtro + región) | Cubierto · PASS |
| **CA-EMP-03** | Error de listado = `directoryError` | Jest `page.spec` CA-EMP-03 | Cubierto · PASS |
| **CA-EMP-04** | Empty primera vez ≠ empty de filtros; CTA solo en parque 0 | Jest `page.spec` CA-EMP-04 · `TenantsTable.spec` empty | Cubierto · PASS |
| **CA-EMP-05** | Búsqueda sin «identificador» / «tenant» / «slug» | Jest `page.spec` + `TenantsTable.spec` CA-EMP-05 · E2E searchbox por rol | Cubierto · PASS |
| **CA-EMP-06** | Un H1, subtítulo corto, eyebrow `Directorio`; sin H2 instructivo | Jest `page.spec` CA-EMP-06 · E2E D-5 (375: H1 + 0 headings nivel 2) | Cubierto · PASS |
| **CA-EMP-07** | Éxito breve; error `No pudimos… Reintenta…` | Jest `page.spec` CA-EMP-07 | Cubierto · PASS |
| **CA-EMP-08** | KPI Activas / En configuración (cifra > 0) aplican `?status=` | Jest `page.spec` CA-EMP-08 | Cubierto · PASS |
| **CA-EMP-09** | `aria-sort`; un solo control de fila al teclado | Jest `page.spec` + `TenantsTable.spec` CA-EMP-09 · E2E D-6 (`th[aria-sort]`, uno ≠ `none`) | Cubierto · PASS |
| **CA-EMP-10** | Listado pide `status` / `search` al servidor | Jest `page.spec` CA-EMP-10 (status + search) · E2E D-4 (búsqueda Fibernet / Demo ISP) | Cubierto · PASS |

Sin huecos. Ningún CA-EMP quedó sin test que pasa.

### Números reales (D-2…D-6)

| Gate | Comando | Resultado |
| --- | --- | --- |
| Jest helper | `jest --runInBand --testPathPattern=tenant-status-label` | **4/4** PASS |
| Jest page | `jest --runInBand --testPathPattern=tenants/page.spec` | **14/14** PASS |
| Jest tabla | `jest --runInBand --testPathPattern=TenantsTable` | **9/9** PASS |
| Jest chips | `jest --runInBand --testPathPattern=SignalChips` | **4/4** PASS |
| Typecheck | `pnpm --filter @iwana/web typecheck` | exit **0** |
| audit-ui | `audit-ui.mjs` sobre tenants + `TenantsTable.tsx` | **0 hallazgos** (P0/P1 = 0) |
| Playwright | `playwright test e2e/tests/web-empresas-directorio.spec.ts --config e2e/playwright.web.config.ts` | **4/4** PASS (D-4, D-5 375, D-5 1280, D-6 axe) |
| Axe D-6 | `wcag2a` + `wcag2aa` en `/tenants` autenticado | `violations = []` · `aria-sort` presente |

Capturas (sin PII): [`docs/quality/evidence-web-empresas-directorio/375.png`](../quality/evidence-web-empresas-directorio/375.png) · [`1280.png`](../quality/evidence-web-empresas-directorio/1280.png).

375: H1 + 3 chips apilados + tabla en una columna; sin H2 instructivo. 1280: chips en fila; badges «Activa» / «En configuración».

### Observación (deuda, no NO-GO)

**Cerrada 2026-08-11 (identidad):** los chips leen un listado de parque sin `status`/`search`; la tabla sigue filtrada. NotificationBell usa `labelForTenantStatus` (Con error / En configuración), sin slug ni «Configuración fallida».

**Cerrada 2026-08-11 (chrome K):** se retiró `Volver al centro de control` y la cáscara extra del pulso. Quedan 3 chips sueltos.

**Cerrada 2026-08-11 (CTA):** `Nueva empresa` pasó del PageHeader al chrome de la tabla. Empty de primera vez intacto. Pager ADR-065 sigue fuera.

### Dictamen

**GO.** D-2…D-6 verdes. CA-EMP-01…10 con evidencia. G6.5 / G7 no se anticipan. Sin commit.
