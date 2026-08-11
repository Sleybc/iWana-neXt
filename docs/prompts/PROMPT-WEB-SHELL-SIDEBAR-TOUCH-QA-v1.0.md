# PROMPT — Remediación: targets táctiles sidebar + trazabilidad QA DropdownUser

**Versión:** 1.0  
**Estado:** Emitido (G4)  
**Fecha:** 2026-08-10  
**Generado por:** AI-EM-ARCH (modo Orchestrator + EM)  
**Módulo / superficie:** WEB-SHELL (`apps/web` — consola de plataforma) + trazabilidad QA web/portal/`@iwana/ui`  
**Fase:** Carril rápido UI (§3bis.3) + corrección G6 (evidencia falsa)  
**Nombre de archivo:** `PROMPT-WEB-SHELL-SIDEBAR-TOUCH-QA-v1.0.md`  
**Plantilla base (en revisión):** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`

## Vínculos de trazabilidad

- Review de entrada (sesión CTO/operador, 2026-08-10): **P1** targets táctiles < 44 px · **P2** informe declara PASS de CA-S1-12/13 sin pruebas que los ejercen · veredicto *Aprobada con cambios menores*.
- Informe vivo a actualizar (no duplicar): [`docs/informes/INFORME-WEB-SHELL-SIDEBAR-CARRIL-RAPIDO-v1.0.md`](../informes/INFORME-WEB-SHELL-SIDEBAR-CARRIL-RAPIDO-v1.0.md) — **G6 reabierto** por P1/P2.
- Contrato padre (congelado): [`docs/specs/2026-08-10-web-shell-sidebar-carril-rapido-contrato.md`](../specs/2026-08-10-web-shell-sidebar-carril-rapido-contrato.md) v1.0.
- Contrato deuda serie (congelado hasta adenda): [`docs/specs/2026-08-10-web-shell-sidebar-deuda-contrato.md`](../specs/2026-08-10-web-shell-sidebar-deuda-contrato.md) v1.5 — **requiere adenda v1.6** (targets táctiles T1) firmada por AI-DS-OWNER antes de código FE.
- Prompt fase previa: [`docs/prompts/PROMPT-WEB-SHELL-SIDEBAR-CARRIL-RAPIDO-v1.0.md`](./PROMPT-WEB-SHELL-SIDEBAR-CARRIL-RAPIDO-v1.0.md).
- Skills: `iwana-identity-ui-review`, `ui-ux-pro-max` (subordinada), `wcag-audit-patterns`, `core-components`, `frontend-dev-guidelines`, `testing-patterns`, `playwright-skill`.

---

## 1. Objetivo exacto

Cerrar el P1 de accesibilidad táctil del sidebar de `apps/web` **sin rediseñar** el shell, y **corregir la trazabilidad G6** del P2: CA-S1-12/13 (y roving portal) solo pueden quedar PASS con pruebas que realmente abren el menú, ejercen Escape / clic externo / retorno de foco / flechas.

**Resultado esperado:** hitboxes ≥ 44×44 px en cierre mobile, marca/home y filas de nav (icono visual intacto); suite de tests que demuestre CA-S1-12/13 (web + portal) y roving del portal; informe vivo actualizado sin PASS inventados.

### Qué SÍ entra

| ID | Severidad | Cambio | Dueño |
| --- | --- | --- | --- |
| T1 / P1 | Accesibilidad (touch) | Botón “Cerrar menú”: hitbox `h-11 w-11` (44×44); icono `X` permanece `w-5 h-5` (20×20). Links de marca/home y filas de navegación: `min-h-11` (altura táctil ≥ 44 px) sin alterar tipografía ni squircle canónico del mark. | DS-OWNER (contrato) → FE-PLATFORM (código) |
| Q1 / P2 | Trazabilidad QA | Pruebas reales: Escape cierra + restaura foco; clic externo cierra; `asChild` en items Link; roving ArrowUp/Down/Home/End en portal. Corregir o ampliar specs que hoy mockean/omitien `DropdownUser`. | SR-QA |
| Q2 | Evidencia | Actualizar informe vivo: CA-S1-12/13 dejan de figurar PASS hasta evidencia; registrar capturas autenticadas 375/1440 claro/oscuro **si** hay sesión; si no, deuda explícita (no PASS). | SR-QA (+ EM-ARCH consolida) |

### Qué NO entra (bloqueos duros)

- **NO** consolidar roving focus genérico dentro de `DropdownMenu` (queda deuda estratégica §6.1 del informe; requiere contrato propio futuro).
- **NO** cambiar tokens de marca en `globals.css`, tipografía ni lenguaje visual global.
- **NO** rediseñar ítem activo, canvas, isotipo squircle ni densidad del header (D1–D3 ya cerrados).
- **NO** backend, API, migraciones, OpenAPI.
- **NO** inventar PASS: sin test que ejecute el comportamiento → criterio = FAIL o “pendiente de evidencia”, nunca PASS.
- **NO** alterar geometría visual del PNG/`PlatformBrandMark` (40×44 squircle): solo el **área interactiva** del `<Link>`/`<button>` crece.

---

## 2. Contratos congelados (protocolo §3bis)

| Contrato | Ruta | Versión | Dueño | Estado al emitir este prompt |
| --- | --- | --- | --- | --- |
| Carril rápido base | `docs/specs/2026-08-10-web-shell-sidebar-carril-rapido-contrato.md` | 1.0 | AI-DS-OWNER | Congelado — no se reescribe |
| Deuda serie (hasta v1.5) | `docs/specs/2026-08-10-web-shell-sidebar-deuda-contrato.md` | 1.5 | AI-DS-OWNER | Congelado en lo previo; **adenda v1.6 pendiente de firma** |
| Adenda T1 (esta fase) | mismo archivo, cabecera **v1.6** | 1.6 | AI-DS-OWNER | **Pendiente** → al firmar = congelado para FE/QA |

**Declaración de congelación:** cuando AI-DS-OWNER deposite y firme la adenda **v1.6** (sección T1 + CA-T1-*), el contrato de componente de esta fase queda congelado citando esa ruta y versión. Un cambio post-firma exige bump v1.7 + notificación vía orquestador.

**Contrato de API:** no aplica.

**Carril rápido:** T1 califica (§3bis.3): no altera alcance funcional, contrato de datos, boundary ni tokens de marca. Q1/Q2 son corrección de G6, no diseño.

---

## 3. Tracks y RACI de esta fase

| Track | Agente | Acción | Espera a |
| --- | --- | --- | --- |
| Design-system (carril rápido) | **AI-DS-OWNER** (R) | Adenda v1.6: anatomía hitbox cierre / marca / nav; CA-T1-*; veredicto GO/NO-GO. | Nadie |
| Frontend | **AI-FE-PLATFORM** (R) | Implementar T1 solo en `apps/web` `Sidebar.tsx` (+ `PlatformBrandMark` solo si la adenda lo exige para el link wrapper). | Firma DS-OWNER v1.6 |
| QA | **AI-SR-QA** (R) | Escribir/ajustar tests Q1; re-verificar CA-T1; corregir informe vivo; evidencia visual si hay sesión. | Puede **diseñar** tests en paralelo al contrato; **correr** PASS de CA-T1 tras FE; **no** marcar CA-S1-12/13 PASS sin tests nuevos verdes |
| UX | AI-PROD-UX (C) | Solo si DS/QA reportan ruptura de flujo táctil. | — |
| Orquestación | AI-EM-ARCH (A) | Emite este prompt; consolida G5/G6; no implementa código. | Entregas |

---

## 4. Instrucciones por agente

### 4.1 AI-DS-OWNER (primero — gate de entrada a implementación FE)

1. Leer el review de entrada y `apps/web/src/components/layout/Sidebar.tsx` (botón cierre ~L202, links marca, filas nav `py-2.5`).
2. Extender `docs/specs/2026-08-10-web-shell-sidebar-deuda-contrato.md` a **v1.6** (constancia §3bis regla 1: v1.1–v1.5 no se reescriben; se complementan) con:
   - Anatomía exacta: botón cierre `h-11 w-11` + flex center + `interactiveFocusClassName`; icono `w-5 h-5` intacto.
   - `min-h-11` en links de marca (expandido/colapsado) y en filas de nav; squircle `PlatformBrandMark` densidad default **sin cambio de clases del mark**.
   - Criterios **CA-T1-01…** (mín. cierre 44×44 computado; filas/marca ≥ 44 px de alto computado a 375 px).
   - Fuera de alcance: roving en primitiva, portal shell (salvo QA de DropdownUser), tokens.
3. Veredicto carril rápido: **GO** | **GO con ajustes** | **NO-GO**.
4. No escribir código productivo.

### 4.2 AI-FE-PLATFORM (solo tras GO + v1.6 firmada)

1. Aplicar T1 exactamente según adenda v1.6.
2. Archivo esperado principal: `apps/web/src/components/layout/Sidebar.tsx`.
3. No tocar `apps/portal` layout/sidebar salvo que la adenda lo autorice (no debería).
4. Correr `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre archivos tocados.
5. Typecheck `@iwana/web` (y ui solo si se tocó).
6. No commitear salvo petición explícita del operador/orquestador.

### 4.3 AI-SR-QA

1. **Inmediato (antes o en paralelo a FE):** inventariar gap de evidencia:
   - `apps/web/.../DropdownUser.spec.tsx` — no renderiza `DropdownUser`.
   - `apps/portal/.../TopHeader.spec.tsx` — mockea `DropdownUser`.
   - `ui-primitives-a11y.spec.tsx` — solo disabled item.
2. Añadir specs (co-localizados o E2E según patrón del repo) que demuestren:
   - **CA-S1-12:** Escape cierra + foco vuelve al trigger (web y portal).
   - **CA-S1-13:** clic externo cierra (web y portal).
   - Portal: ArrowUp/Down/Home/End (roving) con teclado real en el menú abierto.
   - Items `asChild` (navegación Link) sin romper role menuitem.
3. Tras FE: verificar CA-T1-* (inspección de clases +, si hay browser, getBoundingClientRect ≥ 44).
4. Actualizar el **informe vivo** existente (PROMPT-OPERATIVO-ACTUALIZAR-INFORME-VIVO):
   - Reclasificar CA-S1-12/13 según evidencia real.
   - Añadir sección remediación T1/Q1/Q2.
   - Evidencias visuales autenticadas 375/1440 claro/oscuro + anillo focus-visible: adjuntar o dejar **deuda explícita** si no hay sesión (no inventar PASS).
5. No implementar features de producto.

---

## 5. Restricciones no negociables

- Boundaries Modulith intactos; sin PII; sin secretos; sin credenciales en fixtures.
- WCAG 2.2 AA: targets táctiles ≥ 44×44 (Apple HIG / MD / skill `ui-ux-pro-max` prioridad 2; checklist iWana densidades).
- Tokens solo existentes en `packages/ui/src/styles/globals.css`.
- Texto visible en español; sentence case.
- pnpm exclusivamente.
- Gate 4 protocolo: un PASS sin corrida (o restored cache sin `--force` cuando se cite cobertura) no cuenta.

---

## 6. Criterios de aceptación

| ID | Criterio | Verifica |
| --- | --- | --- |
| CA-T1-01 | Botón cerrar menú mobile: área interactiva computada ≥ 44×44 px; icono visual 20×20. | SR-QA |
| CA-T1-02 | Links de marca/home del sidebar: altura táctil ≥ 44 px (`min-h-11` o equivalente contractual). | SR-QA |
| CA-T1-03 | Filas de navegación del sidebar: altura táctil ≥ 44 px. | SR-QA |
| CA-T1-04 | Sin regresión de squircle `PlatformBrandMark` ni de `interactiveFocusClassName` en los mismos controles. | SR-QA / DS-OWNER |
| CA-S1-12-R | Spec **ejecutable** demuestra Escape + restore focus en `DropdownUser` web **y** portal (no mock del componente bajo prueba). | SR-QA |
| CA-S1-13-R | Spec **ejecutable** demuestra cierre por clic externo en web **y** portal. | SR-QA |
| CA-S1-ROV | Spec **ejecutable** demuestra ArrowUp/Down/Home/End en portal `DropdownUser`. | SR-QA |
| CA-DOC-01 | Informe vivo actualizado: sin PASS de CA-S1-12/13 sin evidencia; deuda visual autenticada listada o evidenciada. | SR-QA / EM-ARCH |

---

## 7. Criterio stop/go

**STOP inmediato si:**

- DS-OWNER emite NO-GO (tokens de marca / rediseño del squircle / alcance portal shell).
- Se propone meter roving en la primitiva “de paso”.
- Un agente marca PASS sin test verde que ejercite el comportamiento.
- Aparece necesidad de ADR o cambio de stack.

**GO a consolidación EM-ARCH cuando:** adenda v1.6 firmada + FE entregó T1 + CA-T1-* verdes + CA-S1-12-R / 13-R / ROV verdes (o FAIL explícito con plan) + informe vivo coherente.

---

## 8. Deuda estratégica diferida (no implementar aquí)

1. Roving focus genérico en `DropdownMenu` (`@iwana/ui`) — contrato futuro (informe §6.1).
2. Capturas formales autenticadas 375/1440 claro/oscuro + anillo focus-visible — si no hay sesión en esta fase.
3. Paridad táctil del shell portal (fuera de alcance salvo DropdownUser QA).

---

## 9. Impacto declarado (AI-EM-ARCH)

| Dimensión | Impacto |
| --- | --- |
| Multi-tenant | Ninguno — presentación + tests de UI. |
| Seguridad | Ninguno — a11y táctil/teclado; sin auth/PII en código. |
| Escala | Ninguno. |
| Regulación | Accesibilidad WCAG 2.2 AA (producto); sin norma sectorial nueva. |

**Requiere ADR:** No  
**Requiere CTO:** No (carril rápido + corrección de evidencia G6)
