# INFORME-MOD02-DASHBOARD-PORTAL-ANTIESPACIOS-v1.1

## Informe — antiespacios del inicio `/dashboard` (Opción A, adaptativo por altura) + grilla B1 unificada (U-D5)

**Versión:** 1.1 (supersede v1.0, 2026-08-13 — mismo encargo «antiespacios», cierra el hallazgo H3)
**Estado:** Completado — antiespacios y grilla B1 verificados y medidos en runtime
**Fecha:** 2026-08-13
**Modo activo:** ejecutor (AI-EM-ARCH) + protocolo multiagente
**Autor consolidación:** AI-EM-ARCH
**Actores:** AI-FE-PLATFORM (implementación FE · tests) · AI-PROD-UX (adendas U-D4 y U-D5 de spec) · AI-SR-QA (revisión independiente) · AI-EM-ARCH (verificación final e informe)
**Contrato UX:** [`2026-08-04-portal-dashboard-recomposicion-ux-spec.md`](../specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md) — **adenda densidad UI U-D4 (2026-08-13)**, sección 1058-1093; **adenda densidad UI U-D5 (2026-08-13)**, sección 1097-1133
**Rastro de autorización:** sesión del responsable 2026-08-13 (aprobación de alcance Opción A; aprobación de grilla unificada 4 por fila — Opción 1 — ante media pista de las bandas de 2 KPIs)
**Rama:** sin rama nueva — cambio directo en working tree
**Alcance:** inicio `/dashboard` de `apps/portal` (home); no toca módulos, contratos DS ni HLD

---

## 1. Resumen

El inicio `/dashboard` mostraba dos espacios vacíos heredados de la retícula fija: un **hueco de ~890 px** en los 2/3 izquierdos y una **franja de ~203 px** a la derecha de B3. Se implementó la **Opción A — layout adaptativo por altura** (adenda U-D4) y, en una segunda decisión de la misma sesión, se corrigió el hallazgo **H3 (filas de B1 medio vacías)** con la **grilla B1 unificada de hasta 4 por fila** (adenda U-D5): todas las tarjetas KPI del rol fluyen en una sola grilla, sin eyebrows de dominio, recuperando el diseño §2.2 original («tarjetas iguales, 4 por fila»). Medición final en navegador: **sin huecos en 1280/1440/2048/768/375** y **136 tests verdes**.

## 2. Hallazgos medidos (baseline 1442×902, rol ADMIN, tenant con KPIs en cero)

| # | Severidad | Evidencia medida | Causa raíz | Estado |
| --- | --- | --- | --- | --- |
| H1 | P1 | Hueco de **~890 px**: dominante termina en y≈978; columna de apoyo baja hasta y≈1867 | Retícula fija `xl:grid-cols-12` + `items-start` con 8/4 | **Cerrado** (U-D4, adaptativo por altura) |
| H2 | P2 | Ficha B3 en **896 px** dentro de banda de 1099 px → franja 203 px vacía | `max-w-4xl` en `TenantSummaryCard` — contradice spec §2.2 | **Cerrado** (U-D4, B3 a 12 col) |
| H3 | P3 | Filas de B1 medio vacías (grupos de 2 tarjetas; OPORTUNIDADES 1 tarjeta) | Grid fija `xl:grid-cols-4` por grupo de dominio (U-D3/§A.2) con bandas máx. 2 KPIs | **Cerrado** (U-D5, grilla unificada 4 por fila) |
| H4 | P3 | Ritmo mixto 16/12/8 px entre bandas y columnas | Normalizado por U-D4 (banda usa `gap-3` consistente) | **Cerrado** |

Auditoría mecánica (`audit-ui.mjs`): P0/P1/P2 **0** en archivos tocados.

## 3. Decisiones

**Decisión 1 — Opción A, adaptativo por altura (U-D4):**

- **Modo retícula (dominante ≥ 420 px):** layout de la spec (B2 8 col + B2b 4 col). Sin cambios.
- **Modo banda (dominante < 420 px):** B2 a 12 col full width; B2b como banda horizontal (3 → `md:grid-cols-2 xl:grid-cols-3`; 2 → `md:grid-cols-2`; 1 → `xl:max-w-2xl`). Histéresis de salida ≥ 460 px.
- B3 a 12 col.

**Decisión 2 — Grilla B1 unificada 4 por fila (U-D5, Opción 1 aprobada):** las bandas de dominio (máx. 2 KPIs cada una) dejaban medias filas vacías con el grid fijo de U-D3. El responsable aprobó volver al diseño §2.2: **una sola grilla** `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4` con todas las tarjetas del rol en orden de composición, **sin eyebrows de dominio** en B1 (la etiqueta de la tarjeta porta el contexto). Resultado por rol (composición real): ADMIN 7 → 4+3 · NOC y SOPORTE 4 → fila completa · VENTAS 3 → 3 por fila · CONTADOR 1 → columna 1/4 (nunca estirada) · TECNICO 0 → sin B1. Móvil/tablet sin cambios (`grid-cols-1` / `sm:grid-cols-2`). Deroga en B1: agrupación §A (U-1/UX-D3-04) y la regla de grid por grupo de U-D3; lo demás de U-D3 (KPI compacto vertical, sin max-w 50 %, sin KPI fantasma) permanece vigente.

## 4. Cambios

| Archivo | Cambio |
| --- | --- |
| `apps/portal/src/components/dashboard/DashboardClient.tsx` | **U-D4:** constantes `DOMINANT_BAND_THRESHOLD=420`/`DOMINANT_BAND_EXIT=460`, estado `bandMode` + `ResizeObserver` (guard jsdom, cleanup, deps estables), render dual sin duplicar markup. **U-D5:** B1 = una sola grilla `grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4` con las tarjetas del rol en orden de composición; eliminados eyebrows de dominio (h2 + refs de foco), `metricGroupGridClassName`, la capa de agrupación (`groupDashboardMetricsByDomain`, registry de dominios, `DashboardMetricDomain*`) y el campo `eyebrow` del registry de métricas (dead data). `MetricsSkeleton` usa la misma grilla. B2/B2b y `PortalDashboardMetric` intactos. |
| `apps/portal/src/components/dashboard/TenantSummaryCard.tsx` | **U-D4:** eliminado `max-w-4xl` (B3 a 12 col). |
| `apps/portal/src/components/dashboard/DashboardClient.spec.tsx` | **U-D4:** stub `ResizeObserver`, tests de banda/retícula/1 panel/rango muerto. **U-D5:** test B1 grilla unificada sin eyebrows (7 tarjetas, orden I-1→I-7, sin `max-w-[calc(50%-0.5rem)]`); test B1 en error sin foco artificial; **test ACCOUNTANT (1 KPI → columna 1/4, sin variante estirada, UX-D5-03)**. |
| `apps/portal/src/components/dashboard/dashboard-role-composition.ts` | **U-D5:** eliminada la capa de agrupación por dominio (registry + helper + tipos). |
| `apps/portal/src/components/dashboard/dashboard-role-composition.spec.ts` | **U-D5:** orden plano por rol (ADMIN I-1…I-7; SUPPORT I-3,I-4,I-1,I-2; NOC 4; SALES 3; ACCOUNTANT 1; roles sin ficha → `[]`). |
| `apps/portal/src/components/dashboard/TenantSummaryCard.spec.tsx` | **U-D4:** B3 sin clases `max-w-*`. |
| `docs/specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md` | Adendas **U-D4** (header + sección 1058-1093, UX-D4-01…06) y **U-D5** (header + sección 1097-1133, UX-D5-01…04, derogaciones). |
| `docs/specs/2026-08-04-portal-dashboard-recomposicion-ds-contrato.md` | Nota **U-D5** en §1.8 (grilla unificada; rol con 1 KPI = una columna). |

## 5. Evidencia de verificación

| Verificación | Resultado |
| --- | --- |
| Jest suite dashboard | **7 suites · 136 passed / 0 failed** (`pnpm --filter @iwana/portal exec jest src/components/dashboard`) |
| Typecheck portal | Exit 0 (`tsc --noEmit`) |
| Lint portal (archivos tocados) | 0 errores |
| `audit-ui.mjs` (archivos tocados) | Sin hallazgos |
| Medición runtime (navegador) — U-D4 | Ciclo banda→retícula→banda operando; sin huecos en 2048/1440/1280/768/375 |
| Medición runtime (navegador) — U-D5 | **1440 px, ADMIN:** una sola grilla B1 `xl:grid-cols-4`; fila 1 = 4 tarjetas (269 px c/u), fila 2 = 3 tarjetas; sin eyebrows de dominio. 136 tests verdes |

### Medición por viewport (modo banda activo, tenant vacío) — U-D4

| Viewport | Banda | Hueco B2 | B3 |
| --- | --- | --- | --- |
| 2048 (2xl) | `xl:grid-cols-3` | sin hueco | full width |
| 1440 (xl) | `xl:grid-cols-3` | sin hueco | panel 1096 px |
| 1280 (xl) | `xl:grid-cols-3` | sin hueco | panel 936 px |
| 768 (md) | `md:grid-cols-2` (2+1) | sin hueco | — |
| 375 | 1 col | sin hueco | — |

## 6. Revisión independiente (AI-SR-QA)

**U-D4:** APROBADO CON CAMBIOS → hallazgos cerrados (P2 observer descartado con evidencia runtime; P3 rastro de autorización, UX-D4-01 sin aserción, rango muerto → corregidos).

**U-D5:** APROBADO CON CAMBIOS → hallazgos cerrados en esta v1.1:

- **P2 (UX-D5-03 sin test del caso real de 1 KPI; adenda citaba TECNICO):** corregido — test de render nuevo con **ACCOUNTANT** (única tarjeta «Planes sin precio vigente» en columna 1/4 de la grilla unificada, sin `max-w-[calc(50%-0.5rem)]`, sin eyebrows) y adenda corregida a la composición real (CONTADOR 1, VENTAS 3, TECNICO 0 → no compone B1).
- **P2 (aislamiento del árbol de trabajo):** el working tree mezcla el rework B1 con frentes previos sin commitear (B2 adaptativo, densidad/PortalDashboardMetric, copy, shell). **Riesgo latente de proceso, no funcional** — requiere separación de commits antes del merge, fuera de esta sesión.
- **P3 (precisión de roles en adenda):** corregido.

## 7. Trazabilidad criterio ↔ test (adenda U-D5)

| Criterio | Cobertura | Evidencia |
| --- | --- | --- |
| UX-D5-01 · hasta 4 columnas a 1280+; ADMIN 4+3; roles con 4 KPIs = fila completa | Test automatizado | `dashboard-role-composition.spec.ts` (orden plano por rol) + `DashboardClient.spec.tsx` (7 tarjetas en una grilla `xl:grid-cols-4`, orden I-1→I-7) |
| UX-D5-02 · sin eyebrows de dominio en B1 | Test | `DashboardClient.spec.tsx` (sin headings de dominio en B1; tarjetas sin eyebrow) |
| UX-D5-03 · rol con 1 KPI (CONTADOR) = columna 1/4, sin estirar | Test | `DashboardClient.spec.tsx` (ACCOUNTANT, «Planes sin precio vigente» en la grilla unificada sin variante estirada) |
| UX-D5-04 · móvil/tablet sin cambios | Test | `DashboardClient.spec.tsx` (`grid-cols-1` + `sm:grid-cols-2` en la misma grilla) |

## 8. Gates

- [x] Sin hallazgos P0-P2 abiertos en archivos tocados
- [x] Sin violaciones de boundary (cambio 100 % frontend, sin tocar modulith)
- [x] Tests verdes (136/136) con blindaje de criterios U-D5
- [x] Sin endpoints nuevos → OpenAPI no aplica
- [x] Sin PII en logs ni código
- [x] Lint y typecheck pasando

## 9. Pendientes (fuera de alcance)

- Separación de commits del working tree (rework U-D5 vs frentes previos sin commitear: B2 adaptativo, densidad/PortalDashboardMetric, copy, shell) — proceso, recomendado antes del merge.
- Prompts `PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.2.md` y `…-AUDITORIA-DISENO-v1.2.md` aún mencionan `metricGroupGridClassName` (helper eliminado): artefactos de fase superada; opcional marcarlos como superados.
- P3 spinners en `crm/expedientes`: preexistente, otro encargo.
- Medición visual por screenshot (modelo sin lectura de imagen): documentada por geometría DOM; el responsable puede revisar visualmente en `localhost:3002/dashboard`.
