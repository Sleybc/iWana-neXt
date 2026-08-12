# PROMPT-UI-MODO-OSCURO-ALINEACION-v1.0

## Prompt de ejecución — alinear modo oscuro (emparejamiento ADR-056)

**Versión:** 1.0  
**Estado:** Cerrado — G6 GO (D) · G6.5 no corrido  
**Fecha:** 2026-08-11  
**Emite:** AI-EM-ARCH (modo Orchestrator)  
**Etapa:** G2 (A+B congelan) → G4/G5 (C) → G6 (D) · protocolo v1.5 §3bis · **carril rápido de UI**  
**Destinatarios:** AI-PROD-UX (A) · AI-DS-OWNER (B) · AI-FE-PLATFORM (C) · AI-SR-QA (D)

> Sin prompt no hay implementación. Lo que no está aquí no entra.  
> No es rediseño ni «Premium nocturno». No se cambian hex de `--color-dark-surface*` ni tokens de marca (CTO). Navy del sidebar no se reabre.

**Informe:** [`INFORME-UI-MODO-OSCURO-AUDITORIA-v1.0.md`](../informes/INFORME-UI-MODO-OSCURO-AUDITORIA-v1.0.md) — combinado **24/100** · A 44 · B 37  
**Plan:** [`docs/plans/2026-08-11-ui-modo-oscuro-alineacion.md`](../plans/2026-08-11-ui-modo-oscuro-alineacion.md)

---

## 0. Identidad de sesión

1. `AGENTS.md`
2. Este prompt
3. Informe (transcribir CA; no reinventar)
4. [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) §2 (cuatro reglas de emparejamiento)
5. Firma iWana §4 ítems **1.2, 1.2bis, 1.4**
6. Skills: A = `iwana-identity-ui-review` + `ui-ux-pro-max` subordinada; B = identity + `tokens.md`; C = `frontend-dev-guidelines` + TDD + identity; D = `testing-patterns` + `verification-before-completion`

---

## 1. Contratos

### 1.1 Vigentes (no reabrir)

| Artefacto | Uso |
| --- | --- |
| INFORME modo oscuro v1.0 | CA + matriz + deduplicación |
| ADR-056 §2 | Superficies congeladas; pares de texto/lima/borde |
| `globals.css` tokens dark | Fuente de valores |
| Sidebar navy Superado | Fuera |

### 1.2 A congelar (DoR etapa 5)

| Contrato | Dueño | Artefacto | Congelación |
| --- | --- | --- | --- |
| UX dark | A | `docs/specs/2026-08-11-ui-modo-oscuro-ux-spec.md` v1.0 | **Congelado** · estados de tarea (campo, foco, primer paint, metadatos) |
| DS dark | B | `docs/specs/2026-08-11-ui-modo-oscuro-ds-contrato.md` v1.0 | **Congelado** · **GO** carril rápido · 0 tokens nuevos |

C **no** escribe hasta ambos Congelados.

### 1.3 API

**Sin endpoints. Sin OpenAPI. Sin migraciones.** UI + motor de tema + tests.

---

## 2. Decisiones EM-ARCH (congeladas)

| # | Decisión |
| --- | --- |
| 1 | **Carril rápido SÍ.** Tokens existentes. **NO** cambiar `--color-dark-surface*` / marca / OLED / `info-400`. |
| 2 | **P0 CA-DARK-UX-01:** borde que identifica control = `dark:border-iwana-neutral-600` en `.portal-input-surface`, `Input`, `Select` y class-tokens equivalentes. `dark-border` solo divisor. |
| 3 | **FOUC CA-DARK-UX-02:** script inline Firma 1.4 en `<head>` de web y portal; `ThemeProvider` no persiste el default `light` (flag hidratado). Clave `iwana-theme` se mantiene. |
| 4 | **Foco CA-DARK-UX-03:** `dark:focus-visible:ring-iwana-primary-300` en `interactiveFocusClassName` y base de `Button`. Offset `dark-surface-2` se queda. Copiar el par ya vivo en `Input`. |
| 5 | **Texto muted CA-DARK-UX-04:** par canónico `text-gray-500 dark:text-gray-400` (o `iwana-neutral-400`) en primitives y un barrido grep de `dark:text-gray-500` / `gray-600` en `apps/*` + `packages/ui` (excl. specs). |
| 6 | **`dark:bg-gray-{700-950}` CA-DARK-DS-01:** las 13 ocurrencias → `dark-surface-2/3/4` según rol (card / input-dropdown / hover). Incluye `Popover` y `Calendar`. |
| 7 | **Lima invertida CA-DARK-DS-04:** texto real `secondary-700` sin override → `dark:text-iwana-secondary-400` (muestreo del informe + grep de `<th>`/`<dt>`/labels). Iconos `aria-hidden` exentos. `.portal-eyebrow` ya cumple. |
| 8 | **Elevación CA-DARK-UX-05:** borde de card `dark-border-2`; hover de fila `dark-surface-3`. No glow. `dark:shadow-none` se mantiene (sombra navy no opera). |
| 9 | **Campana portal CA-DARK-UX-06:** alinear a web (`warning`/`error`, no lima = avisos). |
| 10 | Semánticos `info-400`/`warning-400`: **no crear**. `Alert` se queda en `*-300`. |
| 11 | Tests: Jest ThemeProvider (no escribir light antes de hidratar) + foco/borde en primitive; D corre `audit-ui.mjs` y grep `dark:bg-gray-(700\|800\|900\|950)` = 0 en código productivo. |

---

## 3. Fuera de alcance

Navy sidebar · auth hex de marca (Firma 3.5) · `z-10002` · rediseño de pantallas · tokens nuevos · captura live de todas las rutas (D usa muestreo shell + primitive + un formulario).

---

## 4. Stop / go

**Stop:** token nuevo; cambio de hex dark-surface; OLED; reabrir navy; API.  
**Go:** CA-DARK-UX-01…06 y CA-DARK-DS-01/04 PASS en G6 (D). Combinado no tiene que llegar a 90 en esta fase; bloqueantes en verde.

---

## Changelog

| Ver | Cambio |
| --- | --- |
| 1.0 | Alineación dark post-auditoría 24/100 |
