# INFORME-MOD02-DASHBOARD-PORTAL-ANTIESPACIOS-v1.0

## Informe — antiespacios del inicio `/dashboard` (Opción A, adaptativo por altura)

**Versión:** 1.0
**Estado:** Completado — antiespacios implementado, verificado y medido en runtime
**Fecha:** 2026-08-13
**Modo activo:** ejecutor (AI-EM-ARCH) + protocolo multiagente —
**Autor consolidación:** AI-EM-ARCH
**Actores:** AI-FE-PLATFORM (implementación FE · tests) · AI-PROD-UX (adenda de spec) · AI-SR-QA (revisión independiente) · AI-EM-ARCH (verificación final e informe)
**Contrato UX:** [`2026-08-04-portal-dashboard-recomposicion-ux-spec.md`](../specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md) — **adenda densidad UI U-D4 (2026-08-13)**, sección 1058-1093
**Rastro de autorización:** sesión del responsable 2026-08-13 (aprobación de alcance Opción A)
**Rama:** sin rama nueva — cambio directo en working tree
**Alcance:** inicio `/dashboard` de `apps/portal` (home); no toca módulos, composición por rol, contratos DS ni HLD

---

## 1. Resumen

El inicio `/dashboard` mostraba dos espacios vacíos heredados de la retícula fija: un **hueco de ~890 px** en los 2/3 izquierdos (bloque dominante «al día» en tenant con datos en cero) y una **franja de ~203 px** a la derecha de B3 (ficha capada a `max-w-4xl` contra la propia spec §2.2, que manda 12 col). Se implementó la **Opción A — layout adaptativo por altura**: la banda B2/B2b mantiene la retícula 8/4 de la spec cuando el bloque dominante es alto (≥ 420 px) y pasa a bandas de ancho completo cuando es corto (< 420 px). B3 se alinea al spec a 12 columnas. Medición final en navegador: **sin huecos en 1280/1440/2048/768/375** y 134 tests verdes.

## 2. Hallazgos medidos (baseline 1442×902, rol ADMIN, tenant con KPIs en cero)

| # | Severidad | Evidencia medida | Causa raíz |
| --- | --- | --- | --- |
| H1 | P1 | Hueco de **~890 px**: dominante termina en y≈978; columna de apoyo baja hasta y≈1867 | Retícula fija `xl:grid-cols-12` + `items-start` con 8/4 (`DashboardClient` wrapper B2/B2b) |
| H2 | P2 | Ficha B3 en **896 px** dentro de banda de 1099 px → franja 203 px vacía | `max-w-4xl` en `TenantSummaryCard` — contradice spec §2.2 (B3 = 12 col) |
| H3 | P3 | Filas de B1 medio vacías (grupos de 2 tarjetas; OPORTUNIDADES 1 tarjeta) | Patrón estándar de grillas KPI — **sin cambio** (estirar rompe anatomía compacta) |
| H4 | P3 | Ritmo mixto 16/12/8 px entre bandas y columnas | Normalizado parcialmente por el cambio (banda usa `gap-3` consistente) |

Auditoría mecánica (`audit-ui.mjs`): P0/P1/P2 **0**, P3 3 (spinners en `expedientes`, fuera de alcance).

## 3. Decisión

**Opción A — adaptativo por altura** (aprobada por el responsable en sesión, 2026-08-13):

- **Modo retícula (dominante ≥ 420 px):** layout actual de la spec (B2 8 col + B2b 4 col). Sin cambios.
- **Modo banda (dominante < 420 px):** B2 a 12 col full width; B2b como banda horizontal: 3 paneles → `md:grid-cols-2 xl:grid-cols-3`; 2 paneles → `md:grid-cols-2`; 1 panel → `xl:max-w-2xl`. Histéresis de salida ≥ 460 px (sin parpadeo en 420-460).
- B3 a 12 col (alineación con spec §2.2).

## 4. Cambios

| Archivo | Cambio |
| --- | --- |
| `apps/portal/src/components/dashboard/DashboardClient.tsx` | Constantes `DOMINANT_BAND_THRESHOLD = 420` / `DOMINANT_BAND_EXIT = 460` (exportadas); estado `bandMode` + `useLayoutEffect` con `ResizeObserver` (guard jsdom, `disconnect()` en cleanup, deps `[composition]` estables); render dual con contenido compartido (`dominantColumnContent` / `supportBlocks`, sin duplicar markup). No toca composición por rol, promoción KPI>0, plegado «Ver más», franja B0, B1 ni shell. |
| `apps/portal/src/components/dashboard/TenantSummaryCard.tsx` | Eliminado `className="max-w-4xl"` del `PortalPanel` — B3 ocupa las 12 columnas. |
| `apps/portal/src/components/dashboard/DashboardClient.spec.tsx` | Stub `ResizeObserver` con callback capturado; test de banda actualizado (sin retícula 8/4) + tests nuevos: dominante alto → retícula 8/4 (`xl:col-span-8`/`xl:col-span-4`), 2 paneles (SUPPORT), 1 panel (NOC), rango muerto 420-460 (430 en banda permanece; 450 desde retícula no entra). |
| `apps/portal/src/components/dashboard/TenantSummaryCard.spec.tsx` | Test UX-D4-01: B3 sin clases `max-w-*`. |
| `docs/specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md` | Adenda **U-D4** (header + sección 1058-1093, criterios UX-D4-01…06). |

## 5. Evidencia de verificación

| Verificación | Resultado |
| --- | --- |
| Jest suite dashboard | **7 suites · 134 passed / 0 failed** (`pnpm --filter @iwana/portal exec jest src/components/dashboard`) |
| Typecheck portal | Exit 0 (`tsc --noEmit`) |
| Lint portal | **0 errores**; 52 warnings preexistentes en módulos ajenos (0 en archivos tocados) |
| `audit-ui.mjs` (2 archivos tocados) | Sin hallazgos |
| Medición runtime (navegador, tenant vacío) — ciclo banda→retícula→banda | Inyección de 700 px en la columna dominante: salida a retícula (`.xl:grid-cols-12` + `xl:col-span-8` presentes) y regreso a banda al retirar (P2 de QA **descartado con evidencia**: React reutiliza el nodo, el observador no se desconecta) |

### Medición por viewport (modo banda activo, tenant vacío)

| Viewport | Banda | Hueco B2 | B3 |
| --- | --- | --- | --- |
| 2048 (2xl) | `xl:grid-cols-3` | sin hueco | full width |
| 1440 (xl) | `xl:grid-cols-3` | sin hueco (antes dominante 250 px vs apoyo 1139 px en columna) | sección 1096 px = panel 1096 px |
| 1280 (xl) | `xl:grid-cols-3` | sin hueco | sección 936 px = panel 936 px |
| 768 (md) | `md:grid-cols-2` (2+1) | sin hueco | — |
| 375 | 1 col | sin hueco | — |

## 6. Revisión independiente (AI-SR-QA)

Veredicto inicial: **APROBADO CON CAMBIOS**. Hallazgos cerrados así:

- **P2 (observer no re-observa en modo banda):** descartado con evidencia runtime (ver §5 — el bucle completo banda→retícula→banda opera en navegador real; React reutiliza el nodo del div entre ramas del ternario).
- **P3 (rástro de autorización ausente):** corregido — este informe existe y la adenda U-D4 lo cita.
- **P3 (UX-D4-01 sin aserción automatizada):** corregido — test nuevo en `TenantSummaryCard.spec.tsx`.
- **P3 (rango muerto 420-460 sin aserción):** corregido — aserciones nuevas de 430/450 en `DashboardClient.spec.tsx`.

Riesgos de regresión: ninguno (grep en specs del paquete: las clases `xl:grid-cols-12`, `xl:col-span-8/4`, `max-w-4xl` solo se asertan en `DashboardClient.spec.tsx`; los otros usos de `max-w-4xl` son drawers de otros módulos).

## 7. Trazabilidad criterio (adenda U-D4) ↔ test

| Criterio | Cobertura | Evidencia |
| --- | --- | --- |
| UX-D4-01 · B3 12 col sin cap | Test automatizado | `TenantSummaryCard.spec.tsx` (sin `max-w-*`) |
| UX-D4-02 · dominante alto → retícula 8/4 | Test | `DashboardClient.spec.tsx` (600 px → `xl:grid-cols-12` + `col-span-8/4`) |
| UX-D4-03 · dominante corto → banda; 3/2 paneles | Test | `DashboardClient.spec.tsx` (ADMIN 3 col, SUPPORT 2 col) |
| UX-D4-04 · 1 panel → `max-w-2xl` | Test | `DashboardClient.spec.tsx` (NOC) |
| UX-D4-05 · histéresis sin parpadeo | Test + runtime | aserciones 430/450 + ciclo medido en navegador |
| UX-D4-06 · sin cambios de composición/orden/plegado/B0 | Suite regresiva + diff | 134 tests verdes; diff limitado al wrapper B2/B2b |

## 8. Gates

- [x] Sin hallazgos P0-P2 en archivos tocados
- [x] Sin violaciones de boundary (cambio 100 % frontend, sin tocar modulith)
- [x] Tests verdes (134/134) con blindaje de criterios U-D4
- [x] Sin endpoints nuevos → OpenAPI no aplica
- [x] Sin PII en logs ni código
- [x] Lint y typecheck pasando

## 9. Pendientes (fuera de alcance)

- H3 (filas B1 medio vacías): no se corrige — patrón estándar de grillas KPI.
- P3 spinners en `crm/expedientes`: preexistente, otro encargo.
- Medición visual por screenshot (modelo sin lectura de imagen): documentada por geometría DOM; el responsable puede revisar visualmente en `localhost:3002/dashboard`.