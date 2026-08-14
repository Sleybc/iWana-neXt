# PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.0

## Prompt de ejecución — densidad del inicio `/dashboard` del portal

**Versión:** 1.0
**Estado:** Emitido — autorización viva 2026-08-12 («Autorizado»)
**Fecha:** 2026-08-12
**Emite:** AI-EM-ARCH (modo Orchestrator → ejecución FE)
**Etapa del workflow:** remediación post re-auditoría identidad/copy · protocolo v1.5 §3bis
**Destinatarios:** AI-FE-PLATFORM (C) · AI-SR-QA (D) · AI-PROD-UX / AI-DS-OWNER (contratos ya versionados en este ciclo)
**Origen:** [informe v1.1 §8](../informes/INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.1.md) · adenda UX U-D · DS contrato **v1.4**

> Sin prompt de ejecución no hay implementación (protocolo §3, G4). Lo que no está aquí no entra.
> **Plantilla de formato (en revisión):** [`TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md).
> **Archivo destino obligatorio:** `docs/prompts/PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.0.md`.

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** el inicio ADMIN con KPI en 0 se lee como «hoy no hay trabajo», no como cajas vacías. Postura: *visualmente sobrio, interactivamente denso*.
- **Lo que sí entra:** los 7 cambios de la tabla §3 + copy de pliegue/onboarding/errores de «bloque» → «resumen» + etiquetas B3.
- **Lo que no entra:** P1 nav (CRM / Programacion / Reportes); CTA B0 `Button asChild`; foco de filas comerciales; U-R2 overflow a 768; historial «registro»; endpoints nuevos; tokens de marca; volver a retícula plana de 4 por fila.

---

## 2. Artefactos de entrada obligatorios

| Contrato | Ruta | Versión |
| --- | --- | --- |
| UX spec | [`2026-08-04-portal-dashboard-recomposicion-ux-spec.md`](../specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md) | v1.0 + adendas + **U-D 2026-08-12** |
| DS contrato | [`2026-08-04-portal-dashboard-recomposicion-ds-contrato.md`](../specs/2026-08-04-portal-dashboard-recomposicion-ds-contrato.md) | **v1.4** |
| HLD | [`HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md) | v2.0.1 — sin cambio |
| Informe re-auditoría | [`INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.1.md`](../informes/INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.1.md) | §8 densidad |
| Informe vivo | [`INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md`](../informes/INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md) | actualizar, no duplicar |

**API tipada:** sin endpoints nuevos, sin ampliar `@Roles`, sin migraciones.

---

## 3. Instrucciones para AI-FE-PLATFORM

| # | Cambio | Dónde |
| --- | --- | --- |
| 1 | `PortalDashboardMetric` compacta `min-h-24` + `py-3`; icono `h-8 w-8`; sin hueco sparkline. **No** tocar default de `PortalMetricCard` (148 px) | `portal-ui.tsx` |
| 2 | `resolveDashboardMetricAccent`: `warning`/`danger` solo si `value > 0` o hay `delta`; si no, `neutral`. I-1/I-3/I-7 conservan `primary` | `dashboard-role-composition.ts` + `DashboardClient.tsx` |
| 3 | Grupo de 1 hijo: `sm:max-w-[calc(50%-0.5rem)]`. Skeleton B1 a `h-24` | `DashboardClient.tsx` |
| 4 | Retícula B2: `items-start` | `DashboardClient.tsx` |
| 5 | `PortalEmptyState` + `embedded`; `BlockEmpty` y vacíos de panel del inicio la usan | `portal-ui.tsx` + paneles dashboard |
| 6 | Accesos rápidos: `line-clamp-1` en meta y/o `gap-1`. Sin recortar el mapa §4.14 | `QuickActionsPanel.tsx` |
| 7 | B3: `max-w-4xl`; `America/Bogota` → «Hora de Bogotá»; `CO` → «Colombia» | `TenantSummaryCard.tsx` |
| Extra | N=1 restante → «Ver el pendiente restante». Pliegue: «resumen(es)». Errores «este bloque» → «este resumen» | `OnboardingAlerts.tsx` · `DashboardClient.tsx` |

`AssuranceClient` consume `PortalDashboardMetric`: densificar la primitive es aceptable.

---

## 4. Restricciones no negociables

- No romper boundaries del modulith.
- No acceder a tablas de otro módulo.
- No usar credenciales ni datos reales / PII en logs, tests o docs.
- TypeScript estricto; sin `any`; pnpm; Tailwind v4 CSS-first (sin `tailwind.config.js`).
- Lima ≠ urgencia. CTA de página navy (`Button variant="primary"`), no lima.
- Prohibido KPI fantasma (U-1 regla 7). Se mantienen I-1…I-7 y agrupación U-1.

---

## 5. Entregables técnicos obligatorios

- Código frontend del delta (sin backend, sin migraciones, sin OpenAPI).
- Tests: `portal-dashboard-metric.spec.tsx`, `dashboard-role-composition.spec.ts`, `TenantSummaryCard.spec.tsx`, `OnboardingAlerts.spec.tsx`, `DashboardClient.spec.tsx`, `portal-ui.spec.tsx` (embedded).
- Comando: `pnpm --filter @iwana/portal exec jest` sobre esas suites.

---

## 6. Entregables documentales obligatorios

- Actualizar informe v1.1 §8 (autorizado + aplicado) e informe vivo de recomposición. **No** crear un informe nuevo.
- Contratos ya versionados en este ciclo (U-D + DS v1.4).

---

## 7. Criterios de aceptación

- **CA-DEN-01:** Con valor 0 y sin delta, I-2/I-4/I-5/I-6 no pintan cáscara ámbar/rosa.
- **CA-DEN-02:** I-7 no ocupa el ancho completo del lienzo.
- **CA-DEN-03:** La columna de B2 no se estira (`items-start`).
- **CA-DEN-04:** El vacío de campo no anida un segundo recuadro bordeado.
- **CA-DEN-05:** B3 no muestra `America/Bogota` ni `CO` como texto visible.
- **CA-DEN-06:** Pliegue N=1 → `Ver más · 1 resumen`; onboarding N=1 restante → `Ver el pendiente restante`.
- **CA-DEN-07:** `PortalMetricCard` sigue en 148 px. Lint/typecheck de las rutas tocadas en verde.

---

## 8. Criterio de stop/go

- Detenerse inmediatamente si aparece un endpoint nuevo, un token de marca, o si hay que achicar KPIs para forzar B2 en el primer viewport (anti-patrón R-D original).
- Go: tests del dashboard + primitive en verde y CA-DEN-01…07 cubiertos.
