# INFORME — Carril rápido: shell sidebar consola de plataforma

**Modo:** EM + Orchestrator (AI-EM-ARCH) / ejecutor remediación deuda  
**Versión:** 1.10  
**Estado:** Cerrado — GO (G5/G6; paridad táctil portal cerrada)  
**Fecha:** 2026-08-10  
**Superficie:** `apps/web` (consola de plataforma) + `apps/portal` + `@iwana/ui`

## Vínculos

| Artefacto | Ruta |
| --- | --- |
| Prompt (G4) original | `docs/prompts/PROMPT-WEB-SHELL-SIDEBAR-CARRIL-RAPIDO-v1.0.md` |
| **Prompt (G4) remediación T1/QA** | `docs/prompts/PROMPT-WEB-SHELL-SIDEBAR-TOUCH-QA-v1.0.md` |
| Contrato adenda (DS-OWNER) | `docs/specs/2026-08-10-web-shell-sidebar-carril-rapido-contrato.md` v1.0 |
| **Contrato deuda v1.1…v1.8** | `docs/specs/2026-08-10-web-shell-sidebar-deuda-contrato.md` — v1.7 §25 roving; **v1.8 §26 paridad táctil portal** |
| Evidencia visual web | `docs/quality/evidence-web-shell-sidebar-touch/` |
| Evidencia visual portal | `docs/quality/evidence-portal-shell-touch/` |
| E2E touch web | `e2e/tests/web-shell-sidebar-touch-a11y.spec.ts` |
| E2E touch portal | `e2e/tests/portal-shell-touch-a11y.spec.ts` |
| Contrato padre | `docs/specs/2026-07-20-web-dashboard-firma-fase1-contrato.md` v1.0 |
| Adenda v1.4 (R1/R2) | `docs/specs/2026-08-10-web-shell-sidebar-deuda-contrato.md` — veredicto GO (DS-OWNER, 2026-08-10) |
| Adenda v1.5 (S1, consolidación) | `docs/specs/2026-08-10-web-shell-sidebar-deuda-contrato.md` §23 — veredicto GO (DS-OWNER, 2026-08-10); encargo propio (no carril rápido) |
| Agentes (remediación) | DS-OWNER (v1.6 GO) → FE-PLATFORM (T1 en `Sidebar.tsx`) ‖ SR-QA (Q1/Q2 + verificación CA-T1 clases) |

## 1. Resumen

Se cerró el review del menú lateral (86/100, P0=0) vía **carril rápido UI** (§3bis.3): foco teclado normado, canvas sin curva “mordida”, isotipo en squircle 44×40. **v1.1:** ítem activo del nav plano, `PlatformBrandMark` consolidado, header a densidad default. **v1.2:** controles de selección (`PlatformTenantPicker`, `GlobalSearch`, link home) al patrón canónico. **v1.3:** foco canónico en los 4 botones del header. **v1.4:** cierre de backlog — foco canónico en `ThemeToggle` (`@iwana/ui`, compartido web+portal) y `DropdownUser` (trigger + 3 menuitems). **v1.5:** consolidación estratégica — `DropdownUser` (web y portal) reimplementado sobre la primitiva `DropdownMenu` de `@iwana/ui`, que gana `asChild`, `width`, `Header` y `Separator` (encargo propio, no carril rápido).

## 2. Gates

| Gate | Resultado | Evidencia |
| --- | --- | --- |
| G2/G4 | GO | Prompt emitido; adenda firmada DS-OWNER **GO** |
| G5 | GO | Historial v1.1–v1.5 + **T1** FE-PLATFORM (`Sidebar.tsx`: `h-11 w-11` cierre; `min-h-11` marca/nav); audit-ui 0; typecheck `@iwana/web` OK (FE 2026-08-10) |
| G6 | **GO** | P2 specs reales; P1 `boundingBox` ≥ 44 (E2E); capturas 375/1440 claro/oscuro + foco en `docs/quality/evidence-web-shell-sidebar-touch/`; roving primitiva CA-RF PASS |
| G6.5 / G7 | N/A | Sin merge/release en este encargo |

## 3. Criterios

- CA-SB-01…08 (v1.0): **PASS**.
- CA-D1-01…05, CA-D2-01…03, CA-D3-01…03 (v1.1): **PASS**.
- CA-N1-01…03, CA-N2-01…02, CA-N3-01, CA-N4-01…02 (v1.2): **PASS** + specs 8/8.
- CA-B1-01…04 (v1.3): **PASS** (informe SR-QA 2026-08-10).
- CA-R1-01…03, CA-R2-01…05 (v1.4): **PASS** + specs 4/4 (DropdownUser) + typechecks ui/web/portal.
- CA-S1-01…11, 14, 15 (v1.5): **PASS** (estructura/API/foco/contraste/tokens) — no reabiertos por el review.
- CA-S1-12-R / CA-S1-13-R (remediación): **PASS** — specs ejecutables web + portal (Escape + restore focus; clic externo). Ver §10.
- CA-S1-ROV: **PASS** — roving ArrowUp/Down/Home/End en portal `DropdownUser.spec.tsx`.
- CA-T1-01…04 (v1.6): **PASS** — clases + E2E `boundingBox` ≥ 44 a 375 px (`web-shell-sidebar-touch-a11y`).
- CA-RF-01…04 (v1.7): **PASS** — roving en primitiva; portal sin handlers locales; specs web/portal + `DropdownMenu.roving.spec.tsx`.
- CA-DOC-01: **PASS** — informe + evidencia visual autenticada (mocks E2E).

## 4. Deuda corregida (v1.1)

1. **Ítem activo del nav plano** — `rounded-xl` (control, no superficie); retirados `shadow-iwana-card`, `ring-iwana-primary-100`, `dark:ring-dark-border-2`; barra lima e icono lima intactos.
2. **`PlatformBrandMark`** — componente local a `apps/web` (`density: default | compact`), consumido en sidebar expandido + colapsado + header; cero wrappers inline.
3. **TopHeader** — logo mobile en densidad `default` 40×44 (decisión DS-OWNER: `rounded-xl` en 32×32 degeneraría a círculo); cluster 320 px sin overflow (308 ≤ 320, margen ≥ 8 px).

## 5. Deuda corregida (v1.2)

1. **Trigger de `PlatformTenantPicker`** — patrón campo canónico `portal-input-surface` + `interactiveFocusClassName`; retirados `shadow-iwana-card` y foco ad-hoc `focus:ring-iwana-primary/20`.
2. **Opción seleccionada del listbox** — sin ring decorativo (estándar D1: tinte + texto + peso).
3. **Link home del header** — foco canónico en el `<Link>` (CA-N3-01).
4. **Input de `GlobalSearch`** — patrón campo; badge kbd y overlay fuera de alcance (CA-N4-02).

## 5b. Deuda corregida (v1.3)

1. **Botones del header (B1–B4)** — los 4 `<button>` de `TopHeader.tsx` (L129, L141, L179, L203) pasan a `cn('portal-input-surface …', interactiveFocusClassName)`. Foco canónico 2px + offset; hover/dark/layout intactos (CA-B1-01…04).

## 5c. Deuda corregida (v1.4) — cierre de backlog

1. **`ThemeToggle`** (`@iwana/ui`, compartido web+portal) — string plano → `cn(...)` + `interactiveFocusClassName`; imports relativos `../lib/utils` y `../focus` (primer consumidor intra-paquete). Estilo circular `rounded-full border`, hover/dark y API intactos (CA-R1-01…03). Sin cambio de tokens (`globals.css`/`focus.ts` intactos).
2. **`DropdownUser`** (web) — trigger `cn('flex items-center gap-2 rounded-xl', interactiveFocusClassName)` + 3 menuitems (`rounded-lg` conservado) con foco canónico; import barrel `{ cn, interactiveFocusClassName }` (CA-R2-01…05). Offset dark verificado sin banda clara (`ring-offset-dark-surface-2` = fondo del header/menú).

## 5d. Deuda estratégica corregida (v1.5) — consolidación

1. **`DropdownMenu` de `@iwana/ui`** — extensión de API aditiva y retrocompatible: `DropdownMenuTrigger` con `asChild` (vía `@radix-ui/react-slot`, dependencia preexistente, sin variantes en ese modo), `DropdownMenuItem` con `asChild` (soporta `<Link>` de Next), `DropdownMenuContent` con `width` (default `w-52`), nuevos `DropdownMenuHeader` y `DropdownMenuSeparator`. Sin roving focus en la primitiva (responsabilidad del consumidor). `TenantsTable` y `ui-primitives-a11y.spec` pasan sin cambios (CA-S1-01…15).
2. **`DropdownUser` web y portal** — reimplementados como composición de la primitiva, conservando `useAuth`/`logout`/rutas/`isLoggingOut`/`roleToLabel`/`platformRoleToLabel`/`UserAvatar`, foco canónico y (portal) roving ArrowUp/Down/Home/End. Se retiró la duplicación de click-fuera/Escape (los gestiona la primitiva). Exports públicos sobreviven (specs sin cambios).

## 6. Deuda registrada para backlog futuro (no bloqueante)

1. ~~Paridad táctil del shell portal~~ — **cerrado** v1.8 §26 + E2E `portal-shell-touch-a11y`.
2. ~~Roving focus genérico en `DropdownMenu`~~ — **cerrado** v1.7 §25.
3. ~~Validación visual autenticada 375/1440 (web)~~ — **cerrado**.
4. ~~Medición `getBoundingClientRect` ≥ 44 (web)~~ — **cerrado**.

## 7. Impacto

Multi-tenant / seguridad / escala: **sin impacto**. Regulación: WCAG 2.2 AA (foco + targets táctiles). ADR/CTO: **no requeridos**.

## 8. Decisión

**GO de fase (2026-08-10, v1.10).** Paridad táctil portal cerrada (CA-TP). Commit/PR a criterio del operador.

## 14. Changelog v1.10 (paridad táctil portal)

| Cambio | Evidencia |
| --- | --- |
| TopHeader home `min-h-11 min-w-11` | `TopHeader.tsx` + spec |
| NotificationBell / ThemeToggle `h-11 w-11` | portal + `@iwana/ui` (+ web campana) |
| DropdownUser trigger `min-h-11` | portal + web |
| E2E portal boundingBox + capturas | `portal-shell-touch-a11y` → `evidence-portal-shell-touch/` |
| Contrato §26 v1.8 | CA-TP-01…03 |

## 13. Changelog v1.9 (cierre deuda diferida)

| Cambio | Evidencia |
| --- | --- |
| Roving en `@iwana/ui` DropdownMenu | `DropdownMenu.tsx` + CA-RF; portal sin handlers locales |
| Specs ROV web + salto disabled | `DropdownUser.spec.tsx`, `DropdownMenu.roving.spec.tsx` |
| E2E boundingBox ≥ 44 + capturas | `web-shell-sidebar-touch-a11y` → `docs/quality/evidence-web-shell-sidebar-touch/` |
| Contrato §25 v1.7 | Deroga “sin roving” de CA-S1-07 |
| G6 → GO | Residual §6 cerrado |

## 9. Changelog v1.6 (reopen)

| Cambio | Motivo |
| --- | --- |
| Estado → Reabierto | Review post-cierre: P1 touch + P2 evidencia falsa |
| G6 → REABIERTO | No se autofirma cierre con CA-S1-12/13 sin tests que los ejecuten |
| CA-S1-12/13 → NO PASS vigente | Trazabilidad |
| Enlace prompt TOUCH-QA | G4 remediación |

## 10. Remediación T1 / Q1 / Q2 (SR-QA, 2026-08-10)

### Q1 — Specs ejecutables (sin mock del SUT)

| Archivo | Acción | Resultado |
| --- | --- | --- |
| `apps/web/src/components/layout/DropdownUser.spec.tsx` | Reescrito: renderiza `DropdownUser` real; mocks solo `useAuth`, `next/navigation`, `next/link` | 7/7 PASS |
| `apps/portal/src/components/layout/DropdownUser.spec.tsx` | **Nuevo**: Escape, clic externo, roving, asChild | 4/4 PASS |

**Comandos:**

```text
pnpm --filter @iwana/web exec jest src/components/layout/DropdownUser.spec.tsx --no-coverage
→ Test Suites: 1 passed · Tests: 7 passed

pnpm --filter @iwana/portal exec jest src/components/layout/DropdownUser.spec.tsx --no-coverage
→ Test Suites: 1 passed · Tests: 4 passed
```

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| CA-S1-12-R | **PASS** | Escape + restore focus — web y portal |
| CA-S1-13-R | **PASS** | `mousedown` externo cierra — web y portal |
| CA-S1-ROV | **PASS** | ArrowDown/Up/Home/End — portal |
| asChild smoke | **PASS** | Links con `role=menuitem` + `href`; logout = `button` |

### Q2 — Trazabilidad documental

- CA-S1-12/13 reclasificados a **PASS** solo tras corrida verde (Gate 4).
- Capturas autenticadas 375/1440 claro/oscuro + anillo focus-visible: **deuda explícita** (sin sesión en esta corrida) — **no PASS**.

### T1 — CA-T1-01…04 (inspección estática post-FE)

FE entregó cambios en `apps/web/src/components/layout/Sidebar.tsx` (diff local). `PlatformBrandMark.tsx` **no** modificado en el diff T1 (densidad default `h-10 w-11` / img `h-7 w-7 object-contain` intacta).

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| CA-T1-01 | **PASS clases** / **pendiente px** | Botón cierre: `h-11 w-11` + flex center + `interactiveFocusClassName`; icono `X` `w-5 h-5`. Sin `getBoundingClientRect`. |
| CA-T1-02 | **PASS clases** / **pendiente px** | Links marca: `min-h-11` + `interactiveFocusClassName` (expandido y colapsado). |
| CA-T1-03 | **PASS clases** / **pendiente px** | Filas nav: `min-h-11` + `interactiveFocusClassName`. |
| CA-T1-04 | **PASS clases** | Squircle mark intacto; foco canónico en cierre/marca/filas; sin edición T1 de `PlatformBrandMark.tsx`. |

### CA-DOC-01

**PASS** — informe vivo actualizado sin PASS inventados de Escape/clic-fuera ni de medición px browser.

### Salida orquestador

Sin `[BLOQUEO]`. Sin `[CONSULTA]` nueva: deuda residual (medición px + visual autenticada) ya listada en §6.

## 11. Changelog v1.7 (track QA TOUCH)

| Cambio | Motivo |
| --- | --- |
| Specs DropdownUser web/portal reales | Cerrar P2 / CA-S1-12-R / 13-R / ROV |
| G6 → PARCIAL | P2 cerrado; P1 clases OK, px + visual pendientes |
| §10 remediación T1/Q1/Q2 | Trazabilidad Gate 4 |
| CA-DOC-01 PASS | Informe coherente con evidencia |

## 12. Consolidación EM-ARCH v1.8

| Acto | Resultado |
| --- | --- |
| Re-verificación Jest | web 7/7 + portal 4/4 PASS |
| G5 T1 | GO (clases + audit-ui + typecheck FE) |
| G6 | **GO condicional** — `h-11`/`min-h-11` = 44 px contractuales a root 16 px; browser/capturas = deuda no bloqueante |
| Tracks | [DS-OWNER](681c3375-1089-4b18-8a0f-b464591909e4) · [FE-PLATFORM](ac4b76cf-f94a-4240-ad1d-57b30c58a6e9) · [SR-QA](991d6c87-0806-4554-8652-60eba259708c) |
| ADR / CTO | No requeridos |
