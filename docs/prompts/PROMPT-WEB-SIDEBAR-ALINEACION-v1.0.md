# PROMPT-WEB-SIDEBAR-ALINEACION-v1.0

## Prompt de ejecución — alinear menú lateral `apps/web` a Firma iWana

**Versión:** 1.0  
**Estado:** Emitido — en ejecución  
**Fecha:** 2026-08-11  
**Emite:** AI-EM-ARCH (modo Orchestrator · perfil v2.4)  
**Etapa:** G2 (A+B congelan) → G4/G5 (C) → G6 (D) · protocolo v1.5 §3bis · **carril rápido de UI**  
**Destinatarios:** AI-PROD-UX (A) · AI-DS-OWNER (B) · AI-FE-PLATFORM (C) · AI-SR-QA (D)

> Sin prompt no hay implementación. Lo que no está aquí no entra.  
> No es rediseño de destinos ni de navy. Se aplana IA, se corrige copy y se cierra deuda DS menor.

**Informe:** [`INFORME-WEB-SIDEBAR-AUDITORIA-UI-v1.0.md`](../informes/INFORME-WEB-SIDEBAR-AUDITORIA-UI-v1.0.md) — **79/100** · CA-NAV-01…06 · CA-NAV-DS-01…03  
**Plan:** [`docs/plans/2026-08-11-web-sidebar-alineacion.md`](../plans/2026-08-11-web-sidebar-alineacion.md)

---

## 0. Identidad de sesión

1. `AGENTS.md` + este prompt  
2. Informe (transcribir CA + matriz; no reinventar)  
3. Skills del track (§3)  
4. Copy vivo `platform-ui-copy.ts` → `navigation` / `navigationGroups` / `shell`  
5. **Navy Superado.** Sidebar blanco vigente. No reabrir CA-SB/CA-T1 táctiles.

---

## 1. Contratos

### 1.1 Vigentes (no reabrir)

| Artefacto | Uso |
| --- | --- |
| Informe Sidebar v1.0 | Hallazgos + CA |
| BLOQUEO-3 Fase-1 | Sidebar blanco |
| Carril touch GO | min-h-11, foco, Escape |
| Destinos | 5 rutas actuales |

### 1.2 A congelar (DoR etapa 5)

| Contrato | Dueño | Artefacto | Congelación |
| --- | --- | --- | --- |
| UX nav | A | `docs/specs/2026-08-11-web-sidebar-nav-ux-spec.md` v1.0 | **Congelado** · copy literal |
| DS nav | B | `docs/specs/2026-08-11-web-sidebar-nav-ds-contrato.md` v1.0 | **Congelado** · **GO** carril · 0 primitives |

C **no** escribe hasta ambos Congelados.

### 1.3 API

Sin endpoints. Sin OpenAPI. Sin migraciones.

---

## 2. Decisiones EM-ARCH (congeladas)

| # | Decisión |
| --- | --- |
| 1 | **Lista plana** de 5 ítems, mismo orden: Centro de control → Empresas → Usuarios internos → Historial de cambios → Plataforma. **Sin** grupos Operacion/Gobierno. Separador mudo **opcional** antes de Plataforma (B decide si aporta; default **sin** separador). |
| 2 | Cero «Gobierno» / «gobierno» en nav y `shell.workspaceSubtitle`. |
| 3 | `workspaceSubtitle` = `Consola de plataforma.` |
| 4 | `Abrir menú` / `Cerrar menú` con tilde. Actualizar E2E `web-shell-sidebar-touch-a11y`. |
| 5 | Ítems de destino **sin cambio** (CA-NAV-04). |
| 6 | Landmarks a `PLATFORM_UI_COPY.shell` (`navLandmark`, `menuLandmark`). |
| 7 | Aside `z-(--z-drawer)`; velo `z-(--z-overlay)` (ADR-075). |
| 8 | Quitar `text-[11px]` (absorbido al quitar grupos). |
| 9 | **Sólido:** `bg-white` / `dark:bg-dark-surface-2` (paridad portal; CA-NAV-DS-03 **entra**, no opcional). Sin blur. **No** navy. |
| 10 | No portal Sidebar. No TopHeader layout (solo copy que ya consume `shell.*`). |

---

## 3. Skills por track

| Track | Skills |
| --- | --- |
| A | `system-vocabulary-review` |
| B | `iwana-identity-ui-review`, `core-components` |
| C | `frontend-dev-guidelines`, `system-vocabulary-review`, `iwana-identity-ui-review` |
| D | `verification-before-completion`, `testing-patterns`, `e2e-testing-patterns` |

---

## 4. Criterios

CA-NAV-01…06 y CA-NAV-DS-01…03 del informe. DS-03 deja de ser opcional (decisión #9). Todos PASS en G6.

---

## 5. Fuera de alcance

Portal sidebar · nuevas rutas · navy · Auth «Gobierno de plataforma» · rediseño TopHeader · extraer Sidebar a `@iwana/ui`.

---

## 6. Orden

1. **A + B** paralelo → Congelado  
2. **C** implementa  
3. **D** Jest/E2E touch + audit-ui + adenda GO  

---

## Changelog

| Ver | Cambio |
| --- | --- |
| 1.0 | Alineación post-auditoría sidebar 79/100 |
