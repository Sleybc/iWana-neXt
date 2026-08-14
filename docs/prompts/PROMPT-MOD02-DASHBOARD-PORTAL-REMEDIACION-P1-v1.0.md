# PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-P1-v1.0

## Prompt de ejecución — remediación P1/P2/P3 residual del inicio y shell

**Versión:** 1.0
**Estado:** Emitido — autorización viva 2026-08-12 («corrige todo»)
**Fecha:** 2026-08-12
**Emite:** AI-EM-ARCH
**Etapa:** remediación post re-auditoría · protocolo v1.5 §3bis
**Destinatarios:** AI-PROD-UX · AI-DS-OWNER · AI-FE-PLATFORM · AI-SR-QA
**Origen:** [informe v1.1](../informes/INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.1.md) §3–§7 (fuera del delta de densidad U-D, ya aplicado)

> Lo que no está aquí no entra. **No** reabrir tinte activo del sidebar (§5.1). **No** endpoints nuevos. **No** tokens de marca.

**Plantilla:** [`TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md).

---

## 1. Objetivo

Cerrar los P1 de vocabulario del nav y a11y local, los P2 de estados/copy/foco, y el pulido P3 del shell, alineados al mapa §4 del informe v1.1 y a los desempates D-G6-1 (pliegue, ya en U-D) y U-R2 (B0 desde `md`).

## 2. Contratos

| Contrato | Versión de partida | Delta de esta fase |
| --- | --- | --- |
| UX spec | v1.0 + U-D | Adenda **U-R2bis** (B0 desde `md` = patrón 1280) + **U-NAV** (labels del menú) + historial/onboarding |
| DS contrato | **v1.4** | **v1.5** carril rápido: `portalInlineTextLinkClassName` incluye foco; título de `PortalAlert` en sentence case (no `.portal-eyebrow`) |
| HLD | v2.0.1 | Sin cambio |

## 3. Alcance FE (tabla vinculante)

| ID | Cambio | Archivo |
| --- | --- | --- |
| P1-NAV | «CRM» → «Oportunidades»; «Programacion» → «Programación»; «Usuarios» → «Usuarios y accesos»; retirar Reportes | `Sidebar.tsx` · `GlobalSearchOverlay.tsx` (mismos labels) |
| P1-CTA | `<Button asChild variant="primary" className="min-h-11">` + `Link` | `DashboardClient.tsx` B0 |
| P1-FOCO | Filas comerciales → `PortalNavListRow` | `DashboardClient.tsx` |
| P2-UNK | `operationState === 'unknown'` → esqueleto; no «al día» | `OnboardingAlerts.tsx` |
| P2-FOCO | `portalInlineTextLinkClassName` += `interactiveFocusClassName` | `portal-ui.tsx` |
| P2-B3 | loading / error / éxito de `tenant-me` + `tenant-summary` | `DashboardClient.tsx` |
| P2-HIST | `auditFeedSummary`; LOGIN/LOGOUT sin «en usuario»; sin fallback «registro» | `audit-vocabulary.ts` · `RecentActivityPanel.tsx` |
| P2-UR2 | Desde `md`: primaria + Actualizar + menú si hay secundaria. 375: 1 + menú | `DashboardClient.tsx` |
| P3-ALERT | Título de `PortalAlert` sentence case (`text-sm font-semibold` + `titleColor`) | `portal-ui.tsx` |
| P3-HDR | No duplicar rol: `subtitle` vacío si no hay nombre de persona | `AuthProvider.tsx`; borrar `roleToLabel` muerto |
| P3-KBD | Atajo de búsqueda: `⌘K` en Apple, `Ctrl+K` en el resto | `GlobalSearch.tsx` |
| P3-GRP | Rótulos de grupo del sidebar: «Menú» / «Administración» (sentence case, `.portal-eyebrow`) | `Sidebar.tsx` |

## 4. Copy nav (PROD-UX, ya en informe §4)

| Antes | Después |
| --- | --- |
| CRM | Oportunidades |
| Programacion | Programación |
| Usuarios (nav) | Usuarios y accesos |
| Reportes + «Siguiente fase» | Retirar |

## 5. Fuera de alcance

P1 densidad (ya en U-D). Convergencia ítem activo sidebar. U-R2 overflow a 768 **sí entra** (desempate del informe: versionar). Páginas CRM internas pueden seguir diciendo «CRM» en copy de dominio operativo (expedientes, modo asistido); este prompt solo unifica **nav y búsqueda global** con el inicio.

## 6. Tests

`Sidebar.spec.tsx` · `DashboardClient.spec.tsx` (C-R4 → U-R2bis) · `OnboardingAlerts.spec.tsx` · `portal-ui.spec.tsx` · `GlobalSearch.spec.tsx` · `RecentActivityPanel.spec.tsx` · `DropdownUser.spec.tsx` si aplica · E2E que esperen «CRM» en el nav.

## 7. Stop/go

Stop si aparece endpoint, token de marca o reabrir §5.1. Go: typecheck portal + Jest de rutas tocadas en verde.
