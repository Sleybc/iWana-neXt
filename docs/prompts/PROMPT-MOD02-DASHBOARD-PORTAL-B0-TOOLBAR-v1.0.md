# PROMPT-MOD02-DASHBOARD-PORTAL-B0-TOOLBAR-v1.0

> **Superado** el 2026-08-13 por **U-B0bis**: el Inicio ya no pinta la franja B0b. Este prompt documenta la fase que sacó los CTAs del `PageHeader`. Contratos vigentes: UX **U-B0bis** · DS **v1.9**.

**Módulo:** MOD02 Dashboard portal (`/dashboard`)
**Fase:** Refinamiento de jerarquía B0 — franja de acciones fuera del título
**Versión:** 1.0
**Fecha:** 2026-08-13
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` *(en revisión)*

---

## 0. Decisión congelada

**Opción 1:** `PageHeader` del Inicio = H1 + subtítulo. CTAs en toolbar **debajo** (B0b). No en Accesos rápidos. No se quita el slot `actions` de `PageHeader` para otras rutas.

## 1. Contratos

| Artefacto | Ruta | Versión |
| --- | --- | --- |
| UX | `docs/specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md` | adenda **U-B0** |
| DS | `docs/specs/2026-08-04-portal-dashboard-recomposicion-ds-contrato.md` | **v1.8** |

## 2. Tracks

| Track | Agente | Alcance |
| --- | --- | --- |
| UX | AI-PROD-UX | Adenda U-B0 (hecha en esta fase) |
| DS | AI-DS-OWNER | Changelog v1.8 + `aria-label` en `PortalActionToolbar` |
| FE | AI-FE-PLATFORM | `DashboardClient`: sin `actions` en `PageHeader`; `DashboardHeaderActions` envuelto en `PortalActionToolbar` |
| QA | AI-SR-QA | UX-B0-01…03; matriz U-R2bis intacta |

## 3. Stop

- No reintroducir CTAs en el H1.
- No fusionar B0b con Accesos rápidos.
- No `variant="lime"` ni `bg-iwana-primary` a mano.
- No romper `PageHeader.actions` en otras pantallas.
