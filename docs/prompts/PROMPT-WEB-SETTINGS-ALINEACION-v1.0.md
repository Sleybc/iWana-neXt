# PROMPT-WEB-SETTINGS-ALINEACION-v1.0

## Prompt de ejecución — alinear `/settings` (Plataforma) a Firma iWana

**Versión:** 1.0  
**Estado:** Emitido — en ejecución  
**Fecha:** 2026-08-11  
**Emite:** AI-EM-ARCH (modo Orchestrator)  
**Etapa:** G2 (A+B congelan) → G4/G5 (C) → G6 (D) · protocolo v1.5 §3bis · **carril rápido de UI**  
**Destinatarios:** AI-PROD-UX (A) · AI-DS-OWNER (B) · AI-FE-PLATFORM (C) · AI-SR-QA (D)

> Sin prompt no hay implementación. Lo que no está aquí no entra.  
> No es rediseño de información: la tarea (identidad de consola + seguridad de acceso) se queda. Se alinea copy, piel, Alert, foco y loading.

**Informe:** [`INFORME-WEB-SETTINGS-AUDITORIA-UI-v1.0.md`](../informes/INFORME-WEB-SETTINGS-AUDITORIA-UI-v1.0.md) — puntaje 44/100 · CA-SET-01…12 · matriz copy reconciliada  
**Plan:** [`docs/plans/2026-08-11-web-settings-alineacion.md`](../plans/2026-08-11-web-settings-alineacion.md)

---

## 0. Identidad de sesión

1. `AGENTS.md`
2. Este prompt
3. Informe (fuente de CA y matriz; **transcribir**, no reinventar)
4. Skill del track (§3)
5. `system-vocabulary-review` (A y C)
6. `iwana-identity-ui-review` (B y C)
7. Copy vivo: `apps/web/src/lib/platform-ui-copy.ts` — crear bloque `settings`; nav `Plataforma` no cambia

---

## 1. Contratos

### 1.1 Vigentes (no reabrir)

| Artefacto | Uso |
| --- | --- |
| Informe Settings v1.0 | Hallazgos + CA-SET + matriz |
| Firma iWana | Identidad |
| DS Empresas / Historial | Alert, soft, 2xl, interactiveFocus |
| API branding + MFA | Sin cambio de contrato |

### 1.2 A congelar (DoR etapa 5)

| Contrato | Dueño | Artefacto | Congelación |
| --- | --- | --- | --- |
| UX Settings | A | `docs/specs/2026-08-11-web-settings-plataforma-ux-spec.md` v1.0 | **Congelado** · cita este prompt · copy literal de la matriz del informe |
| DS Settings | B | `docs/specs/2026-08-11-web-settings-plataforma-ds-contrato.md` v1.0 | **Congelado** · **GO** carril rápido · 0 primitives nuevas |

C **no** escribe hasta ambos Congelados.

### 1.3 API

**Sin endpoints nuevos. Sin OpenAPI. Sin migraciones.** Solo UI + copy + tests.

---

## 2. Decisiones EM-ARCH (congeladas)

| # | Decisión |
| --- | --- |
| 1 | **Dos tabs:** `Identidad` \| `Seguridad`. **Retirar tab General**; deslinde a Empresas en subtítulo PageHeader. |
| 2 | **Sin CardTitle** «Gobierno…» — H1 `Plataforma` basta; Card sin título redundante o título «Configuración» solo si A lo exige en spec. |
| 3 | Copy = matriz del informe § Matriz (literal). Canon MFA → «verificación en dos pasos». |
| 4 | `Alert` de `@iwana/ui` en Seguridad y Branding (no `FORM_ALERT_*` en esta superficie). |
| 5 | Una cáscara: quitar `securityPanelClass` anidado. |
| 6 | Pozos `iwana-surface-soft` + `rounded-2xl`; dropzone `rounded-xl`; `interactiveFocusClassName` en slot. |
| 7 | Loading: skeleton o `fieldset`/`aria-busy` no editable. |
| 8 | URI `otpauth` fuera del camino feliz (avanzado u oculto). |
| 9 | Tests Jest actualizados al vocabulario nuevo. |

---

## 3. Skills por track

| Track | Skills |
| --- | --- |
| A | `system-vocabulary-review` |
| B | `iwana-identity-ui-review`, `core-components` |
| C | `frontend-dev-guidelines`, `test-driven-development`, `system-vocabulary-review`, `iwana-identity-ui-review` |
| D | `verification-before-completion`, `testing-patterns`, `wcag-audit-patterns` |

---

## 4. Criterios (informe — no reenumerar)

CA-SET-01 … CA-SET-12 del informe. Todos deben PASS en G6.

---

## 5. Fuera de alcance

- Portal settings · `tenants/[id]/settings`
- Refactor transversal de `form-styles.ts` / auth fuera de `/settings`
- API, OpenAPI, migraciones, sidebar
- Tokens de marca nuevos · primitives nuevas en `@iwana/ui`

---

## 6. Orden

1. **A + B** paralelo → Congelado  
2. **C** implementa  
3. **D** Jest + audit-ui + adenda informe GO/NO-GO  

---

## Changelog

| Ver | Cambio |
| --- | --- |
| 1.0 | Alineación post-auditoría settings 44/100 |
