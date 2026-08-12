# Remediación UI — Centro de control (MOD02)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Los tracks de rol del protocolo (PROD-UX, DS-OWNER, FE-PLATFORM, SR-QA) tienen precedencia sobre un implementer genérico.

**Goal:** Cerrar los tres P1 y los tres P2 del review UI §11 del Centro de control sin rediseñar ni anticipar G6.5/G7.

**Architecture:** Remediación contra contratos ya congelados (HLD v2.0.1, UX spec + adendas, DS v1.3). El prompt G4 [`PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-UI-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-UI-v1.0.md) autoriza el trabajo. FE compone primitives existentes (`PortalAlert`, `DropdownMenu`, `PortalDashboardMetric`). Una lectura `audit` compartida en el shell del portal.

**Tech Stack:** Next.js App Router · React client · `@iwana/ui` · Tailwind v4 · Jest · Playwright · `apps/portal`.

---

## Archivos previstos

| Unidad | Responsabilidad |
| --- | --- |
| UX spec | Adendas R-A…R-D |
| DS contrato | Solo veredicto de carril rápido (sin v1.4) |
| `DashboardClient.tsx` | Hora honesta, alerta de grupo, menú, matriz B0, foco I-6 |
| `RecentActivityPanel.tsx` | Vocabulario + `<time>` |
| `NotificationBell.tsx` | Consumir la lectura compartida |
| Helper de vocabulario de auditoría | Una fuente de labels |
| Specs Jest + E2E portal-dashboard | CA-REM-01…10 |
| Informe vivo §12 | Evidencia y veredicto |

---

### Task 1: Formalizar adendas UX (AI-PROD-UX)

**Files:**
- Modify: `docs/specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md`
- Modify: `docs/informes/INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md` (bitácora U-R*)

- [ ] Copiar R-A…R-D del prompt al spec, con copy exacto de avisos.
- [ ] Fijar matriz B0 375/768/1280.
- [ ] No tocar código.

### Task 2: Carril rápido DS (AI-DS-OWNER)

**Files:**
- Modify: informe vivo (veredicto B-R1…B-R3) — no bump del contrato salvo hallazgo de API nueva.

- [ ] Confirmar `DropdownMenu` de `@iwana/ui` como desbordamiento de B0.
- [ ] Confirmar anuncio en el grupo, no en la tarjeta.
- [ ] Prohibir token/primitive nueva.

### Task 3: Implementar P1+P2+P3 (AI-FE-PLATFORM)

**Files:**
- Modify: `apps/portal/src/components/dashboard/DashboardClient.tsx`
- Modify: `apps/portal/src/components/dashboard/RecentActivityPanel.tsx`
- Modify: `apps/portal/src/components/layout/NotificationBell.tsx`
- Test: specs colocalizados + E2E `e2e/tests` portal-dashboard

- [ ] TDD por C-R1…C-R7 según el prompt.
- [ ] `audit-ui.mjs` en rutas tocadas → P0/P1 = 0.
- [ ] No commitear a menos que el usuario lo pida.

### Task 4: Verificar CA-REM (AI-SR-QA)

**Files:**
- Review/extend: specs y E2E del Task 3
- Modify: informe vivo §12

- [ ] Trazar CA-REM-01…10 ↔ test que pasa.
- [ ] Cobertura dashboard sin retroceso vs §11.
- [ ] Dictamen GO / GO condicionado / NO-GO. No anticipar G6.5/G7.
