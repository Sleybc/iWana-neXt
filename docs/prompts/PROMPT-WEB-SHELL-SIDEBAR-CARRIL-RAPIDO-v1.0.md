# PROMPT — Carril rápido UI: shell sidebar consola de plataforma

**Versión:** 1.0  
**Estado:** Emitido (G4)  
**Fecha:** 2026-08-10  
**Generado por:** AI-EM-ARCH (modo Orchestrator + EM)  
**Módulo / superficie:** WEB-SHELL (`apps/web` — consola de plataforma)  
**Fase:** Carril rápido UI (protocolo §3bis.3) — remediación review sidebar  
**Nombre de archivo:** `PROMPT-WEB-SHELL-SIDEBAR-CARRIL-RAPIDO-v1.0.md`

## Vínculos de trazabilidad

- Review de entrada (sesión CTO/operador): hallazgos P1 foco · P2 canvas `lg:rounded-3xl` · P3 isotipo squircle — veredicto *Aprobada con cambios*.
- Contrato padre (congelado previo): [`docs/specs/2026-07-20-web-dashboard-firma-fase1-contrato.md`](../specs/2026-07-20-web-dashboard-firma-fase1-contrato.md) v1.0 — barra lima activa + `interactiveFocusClassName` en `@iwana/ui`.
- Adenda de contrato (esta fase): [`docs/specs/2026-08-10-web-shell-sidebar-carril-rapido-contrato.md`](../specs/2026-08-10-web-shell-sidebar-carril-rapido-contrato.md) — **debe existir y quedar firmada por AI-DS-OWNER antes de que FE-PLATFORM escriba código**.
- Spec Firma iWana: [`docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md`](../specs/2026-07-12-firma-iwana-diseno-visual-design.md)
- ADR-056 (superficies dark / contraste)
- Skills: `iwana-identity-ui-review`, `wcag-audit-patterns`, `core-components`, `frontend-dev-guidelines`

---

## 1. Objetivo exacto

Cerrar los tres hallazgos del review del menú lateral de `apps/web` **sin rediseñar el sidebar** y **sin alterar** el activo “Centro de control” (barra lima + `rounded-2xl` + ring + sombra) aprobado en el contrato Fase-1.

**Resultado esperado:** sidebar con foco teclado normado, canvas sin curva que produzca “mordida”, isotipo en squircle horizontal 44×40 sin deformar el PNG.

### Qué SÍ entra

| ID | Severidad | Cambio |
| --- | --- | --- |
| P1 | Accesibilidad | Aplicar `interactiveFocusClassName` (export `@iwana/ui`) a enlaces de navegación, marca (home) y botón de cierre mobile en `Sidebar.tsx`. |
| P2 | Diseño visual | Quitar `lg:rounded-3xl` del `<main>` en `apps/web/src/app/(protected)/layout.tsx`. Separación solo por contraste `bg-white` sidebar vs `bg-iwana-surface-soft` canvas. |
| P3 | Marca (presentación) | Contenedor del isotipo: `h-10 w-11 rounded-xl` + isotipo `h-7 w-7 object-contain`; retirar ring claro si el fondo suave basta; **no** deformar el PNG circular. Aplicar en variantes expandida y colapsada del sidebar. |

### Qué NO entra (bloqueos duros)

- **NO** rediseñar el ítem activo del nav (sombra / ring / `rounded-2xl`) — deuda estratégica diferida a revisión DS posterior.
- **NO** consolidar `PlatformBrandMark` en esta fase (recomendación estratégica diferida; opcional solo si FE-PLATFORM lo hace sin ampliar alcance ni tocar portal).
- **NO** cambiar tokens de marca en `globals.css`, tipografía ni lenguaje visual global.
- **NO** tocar `apps/portal` salvo lectura de paridad; esta fase es solo `apps/web`.
- **NO** backend, API, migraciones, OpenAPI.
- **NO** inventar focus ring paralelo: solo `interactiveFocusClassName` de `@iwana/ui`.

---

## 2. Contratos congelados (protocolo §3bis)

| Contrato | Ruta | Versión | Dueño | Estado al emitir este prompt |
| --- | --- | --- | --- | --- |
| Firma Fase-1 (padre) | `docs/specs/2026-07-20-web-dashboard-firma-fase1-contrato.md` | 1.0 | AI-DS-OWNER | Congelado — **no se reescribe**; la adenda no lo invalida |
| Adenda shell sidebar | `docs/specs/2026-08-10-web-shell-sidebar-carril-rapido-contrato.md` | 1.0 | AI-DS-OWNER | **Pendiente de firma DS-OWNER** → al firmar = congelado para FE/QA |

**Declaración de congelación:** cuando AI-DS-OWNER deposite y firme la adenda v1.0, el contrato de componente de esta fase queda congelado citando esa ruta. Un cambio post-firma exige bump v1.1 + notificación vía orquestador.

**Contrato de API:** no aplica (sin backend).

---

## 3. Tracks y RACI de esta fase

| Track | Agente | Acción |
| --- | --- | --- |
| Design-system (carril rápido) | **AI-DS-OWNER** (R) | Emitir/firmar adenda: anatomía marca, canvas, foco; veredicto GO/NO-GO de carril rápido. |
| Frontend | **AI-FE-PLATFORM** (R) | Implementar P1–P3 contra adenda firmada; tests de estructura/foco si ya hay patrón en web. |
| QA | **AI-SR-QA** (R) | Verificar CA abajo; a11y teclado; colapsado 90px; viewport 375; dark sin ring. |
| UX | AI-PROD-UX (C) | Solo si DS-OWNER o QA reportan ruptura de flujo; no bloquea el arranque. |
| Orquestación | AI-EM-ARCH (A) | Consolida G5/G6; registra deuda estratégica diferida. |

---

## 4. Instrucciones por agente

### 4.1 AI-DS-OWNER (primero — gate de entrada a implementación)

1. Leer el review de entrada y `Sidebar.tsx` / `layout.tsx` actuales.
2. Crear `docs/specs/2026-08-10-web-shell-sidebar-carril-rapido-contrato.md` con:
   - Anatomía exacta del contenedor de marca (clases Tailwind autorizadas).
   - Regla de canvas: sin `lg:rounded-3xl` (ni radio equivalente en el shell).
   - Obligación de `interactiveFocusClassName` en interactivos del sidebar.
   - Estados requeridos: expandido / colapsado / mobile / dark.
   - Lista explícita de **fuera de alcance** (activo nav, PlatformBrandMark opcional).
3. Emitir veredicto carril rápido: **GO** | **GO con ajustes** | **NO-GO** (si tocara tokens de marca o alcance).
4. No escribir código productivo.

### 4.2 AI-FE-PLATFORM (solo tras GO de DS-OWNER)

1. Aplicar P1–P3 exactamente según adenda.
2. Archivos esperados: `Sidebar.tsx`, `layout.tsx`; opcional extracción local `PlatformBrandMark` **solo en web** si reduce duplicación sin tocar portal.
3. Si toca TopHeader logo: alinear al mismo contrato de squircle **solo** si está en el mismo wrapper duplicado y la adenda lo autoriza; si no, dejar TopHeader para deuda diferida.
4. Correr `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre archivos tocados.
5. Typecheck/lint del paquete web según scripts del monorepo.
6. No commitear salvo que el orquestador lo pida después.

### 4.3 AI-SR-QA (tras entrega FE)

Verificar criterios §7 con evidencia (unit/estructura y/o checklist manual + screenshot si hay entorno).

---

## 5. Restricciones no negociables

- Boundaries Modulith intactos; sin PII; sin secretos.
- WCAG 2.2 AA: foco visible obligatorio (P1 es bloqueante de G6 si falla).
- Tokens solo los existentes en `packages/ui/src/styles/globals.css`.
- Texto visible en español (sin cambios de copy salvo labels `aria-*` ya existentes).
- pnpm exclusivamente.

---

## 6. Criterios de aceptación

| ID | Criterio | Verifica |
| --- | --- | --- |
| CA-SB-01 | Todo `<Link>` de nav del sidebar, los dos links de marca (expandido/colapsado) y el botón cerrar mobile incluyen `interactiveFocusClassName`. | SR-QA |
| CA-SB-02 | El `<main>` del layout protegido **no** incluye `lg:rounded-3xl` ni clase de radio equivalente en el canvas del shell. | SR-QA |
| CA-SB-03 | Contenedor isotipo sidebar: `h-10 w-11 rounded-xl`; img `h-7 w-7 object-contain`; sin ring claro en light (salvo que la adenda DS lo reintroduzca con justificación). | SR-QA |
| CA-SB-04 | Proporciones del PNG intactas (`object-contain`); sin `object-cover` ni stretch. | SR-QA |
| CA-SB-05 | Sidebar colapsado (`lg:w-[90px]`): squircle 44×40 no desborda ni corta el isotipo. | SR-QA |
| CA-SB-06 | Dark: separación isotipo legible sin depender del ring retirado (fondo `dark-surface-*`). | SR-QA |
| CA-SB-07 | Viewport ~375px: drawer mobile cierra con botón que tiene foco visible; sin regresión de overflow del header de marca. | SR-QA |
| CA-SB-08 | Ítem activo del nav **sin cambios** de sombra/ring/`rounded-2xl` respecto al contrato Fase-1. | SR-QA / DS-OWNER |

---

## 7. Criterio stop/go

**STOP inmediato si:**

- DS-OWNER emite NO-GO (cambio de tokens de marca o alcance).
- Se propone aplanar el activo del nav “de paso”.
- Aparece necesidad de tocar portal o `@iwana/ui` tokens (escalar a EM-ARCH).
- P1 no se puede satisfacer con el export existente (consulta bloqueante a DS-OWNER).

**GO a consolidación EM-ARCH cuando:** adenda firmada + FE entregó + CA-SB-01…08 en verde (o deuda explícita aceptada por EM-ARCH, no silenciosa).

---

## 8. Deuda estratégica diferida (no implementar aquí)

1. Revisión DS del activo nav: evaluar `rounded-xl`, quitar sombra y posiblemente ring → navegación más plana.
2. Consolidar wrapper de logo (sidebar expandido/colapsado + header) como `PlatformBrandMark`.

Registrarlas en el informe de fase si se emite; no las “parchear” en silencio.

---

## 9. Impacto declarado (AI-EM-ARCH)

| Dimensión | Impacto |
| --- | --- |
| Multi-tenant | Ninguno — solo presentación `apps/web`. |
| Seguridad | Ninguno — a11y de foco; sin auth/PII. |
| Escala | Ninguno. |
| Regulación | Accesibilidad WCAG 2.2 AA (producto); sin norma sectorial nueva. |

**Requiere ADR:** No  
**Requiere CTO:** No (carril rápido; sin tokens de marca globales)
