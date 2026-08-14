# INFORME — Comercial UI: «Mando comercial» sin KPIs (alerta compacta + tabs sticky)

**Versión:** 1.0
**Fecha:** 2026-08-14
**Estado:** **GO**
**Módulo:** MOD06 — Comercial
**Modo:** Dirección visual (senior-ui-systems-designer, opción A revisada) + ejecución multiagente
**Antecesor:** [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.9.md](./INFORME-COMMERCIAL-UI-ALIGNMENT-v1.9.md) (adenda U-B0bis)
**Rama:** `feat/portal-commercial-ui-audit`

---

## Resumen ejecutivo

Tras la auditoría v1.9, el responsable pidió dirección visual más profunda. Se evaluaron 3 direcciones y se eligió **A — «Mando comercial»**, revisada por el responsable: **sin franja KPI** (Comercial es un módulo de listas consumido por otros módulos; una banda de métricas es adorno con costo de viewport y duplica alertas/actividad). Alcance final: alerta compacta + tabs sticky, ambos aditivos y sin tocar contratos compartidos.

| Métrica | Resultado |
| --- | --- |
| Jest módulo commercial | **14 suites / 134 tests PASS** |
| Typecheck portal | limpio |
| ESLint / Prettier (archivos tocados) | 0 problemas |
| `audit-ui.mjs` | 0 deterministas, 0 heurísticos |
| Verificación en vivo (:3002) | tabs con `md:sticky md:top-[69px] z-(--z-sticky)`; título sin botones |

---

## Agentes

| Rol | Entregable |
| --- | --- |
| AI-PROD-UX (Track 0) | Posturas UX: selección por dominio, copy «Ver N alertas más», sin colapso, foco al revelar, skeleton único |
| AI-FE-PLATFORM (Track 1) | Alerta compacta + tabs sticky + specs mínimos |
| EM-ARCH (consolidación) | Desempate de divergencias Track 0↔1: orden fijo por dominio, sin botón «Ocultar alertas», foco al contenedor revelado, skeleton único |
| AI-SR-QA (Track 2) | +3 tests (skeleton único, sin live al revelar, expandir por teclado con foco) |

---

## Cambios

### 1. Alerta compacta (`CommercialAlertsStrip.tsx`)
- Una sola alerta visible: selección por **orden fijo de dominio** `catalog-incomplete → rules-gap → offers-at-risk` (`selectPrimaryAlert`), determinista y testeable.
- Botón ghost «Ver N alertas más» (singular «Ver 1 alerta más») con `aria-expanded={false}`.
- Al expandir, el botón **desaparece** (sin colapso — las alertas son trabajo pendiente, no notificaciones que archivar); el resto se revela con su CTA intacto y el foco se mueve a un contenedor `div tabIndex={-1}` (disclosure sin pérdida de posición de teclado).
- Skeleton de carga = un solo bloque (reserva la altura de una alerta).
- Sin `aria-live` en lo revelado (`live="off"`); sin headings nuevos en la región.

### 2. Tabs sticky (`CommercialTabLayout.tsx`)
- TabsList principal: `cn(portalModuleTabsShellClassName, 'md:sticky md:top-[69px] z-(--z-sticky)')`. Offset medido del TopHeader real (py-3 ×2 + 44px + border = 69px); token `--z-sticky` (ADR-075). Fondo sólido del class-token; sin backdrop-blur.
- Subtabs de Tributación sin sticky. Class-token compartido **intacto** (Inventario no se ve afectado).

---

## Verificación

- `pnpm --filter @iwana/portal exec jest src/components/commercial --silent` → 14/14 suites, 134/134.
- `tsc --noEmit` limpio · ESLint 0 problemas · Prettier OK en los 4 archivos.
- `audit-ui.mjs` → 0 deterministas / 0 heurísticos.
- En vivo (3002): tablist con `md:sticky md:top-[69px] z-(--z-sticky)`; card de título sin botones; franja de alertas ausente cuando no hay alertas (tenant de prueba sin datos).

---

## Decisiones registradas

1. **Sin KPIs en módulos de listas.** Orientación global = alertas compactas + panel de actividad + badges de conteo por panel. Si en el futuro se quisiera orientación numérica, va como propuesta PROD-UX, no como default.
2. **Selección de alerta principal por dominio**, no por variante (aunque hoy coinciden): orden fijo testeable.
3. **Expandir sin colapsar** en la franja de alertas (postura PROD-UX).
4. Backlog (sin cambio de alcance): variante de acento lima para `PortalMetricCard` (candidata a DS-OWNER); migración de tests legacy que asertan títulos de alertas a estilo estructural.

---

## Veredicto

**GO** — dirección visual ejecutada con alcance mínimo, pruebas en verde y sin deuda visual nueva. La jerarquía del primer viewport quedó: título → alerta única → tabs sticky → contenido.

---

## Adenda de sesión 2026-08-14 (bis) — sin botones de cabecera

El responsable decidió que los botones «Actividad» y «Actualizar» **sobran**: la orientación la cubren la franja de alertas (con CTAs) y los badges de conteo por panel.

- `CommercialClient.tsx` — eliminados la fila de acciones, el `PortalSidePeek` de actividad, el estado de refresh y el contador de atención. El error del resumen ahora ofrece «Reintentar» en su `PortalAlert` (estado de error recuperable sin chrome extra).
- Eliminados los archivos huérfanos `CommercialActivityPanel.tsx` y `CommercialActivityPanel.spec.tsx` (único consumidor era CommercialClient).
- `CommercialClient.spec.tsx` — retirados los 4 tests de la cabecera de actividad; el test de fallo de resumen ahora verifica el reintento del alert.
- Verificado: jest 13/13 suites · 117 tests · tsc limpio · eslint limpio · `audit-ui` 0 · en vivo (:3002): solo tabs + «Nuevo plan» en `main`, card de título sin botones, tabs sticky intactos.

La jerarquía final del módulo: título → alertas operativas → tabs sticky → listado. Sin botones globales.

