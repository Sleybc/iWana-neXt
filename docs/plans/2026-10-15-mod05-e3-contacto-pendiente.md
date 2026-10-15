# MOD05 — E-3 opción (a): contacto pendiente sin placeholders · Plan de orquestación

**Fecha:** 2026-10-15 · **Versión:** 1.0 · **Emisor:** AI-EM-ARCH (modo EM + Orchestrator)
**Decisión:** E-3 opción (a) del CTO, 2026-10-15 (auditoría MOD05, C-10)
**Prompt G4:** [PROMPT-MOD05-E3-CONTACTO-PENDIENTE-v1.0.md](../prompts/PROMPT-MOD05-E3-CONTACTO-PENDIENTE-v1.0.md)
**Launcher:** [PROMPT-MOD05-E3-CONTACTO-PENDIENTE-LAUNCH-v1.0.md](../prompts/PROMPT-MOD05-E3-CONTACTO-PENDIENTE-LAUNCH-v1.0.md)

**Goal:** que ninguna conversión se pierda por falta de contacto y que ningún suscriptor se active sin un teléfono o un correo reales. Se eliminan los placeholders (SUB-M07, SUB-B05, B7-03), lo que bloquea G7 según la [re-auditoría](../informes/INFORME-MOD05-SUBSCRIBERS-REAUDITORIA-v1.0.md).

**Impacto declarado:**
- **Multi-tenant:** migración tenant 148 y un CLI por tenant.
- **Seguridad:** el CLI recalcula HMAC con la clave de `ConfigService`; sus informes no llevan PII.
- **Escala:** el CLI recorre una vez cada tenant.
- **Regulación:** dato veraz (Ley 1581, art. 4 lit. d: principio de veracidad); el placeholder era un dato falso sobre el titular.

## 1. Olas

```
Ola 1:  E1 data-eng (148)  ∥  E2 sr-backend (reglas R1–R7, contrato, CLI; publica primero los schemas)  ∥  E3 fe-platform (UI, contra el contrato declarado)
Ola 2:  E4 sr-qa (E2E real) → sec-eng (CLI y PII) → gate-verifier → G6 · push → CI → G6.5
G7:     CLI por tenant en el runbook, después de la 148
```

## 2. Matriz de dispatch

Skills verificadas en disco el 2026-10-15. Se leen como documentación antes de escribir.

| Bloque | Subagente | Obligatorias | Apoyo | Gate |
| --- | --- | --- | --- | --- |
| E1 | `data-eng` | `postgresql`, `database-migration` | — | `up/down/up` real; `down` aborta con `NULL` |
| E2 | `sr-backend` | `nestjs-expert`, `backend-security-coder`, `test-driven-development` | `postgresql` (CLI) | turbo `api` + `shared` `--force` e integraciones reales |
| E3 | `fe-platform` | `frontend-dev-guidelines`, `iwana-identity-ui-review`, `system-vocabulary-review` | — | turbo portal `--force` y `audit-ui.mjs` |
| E4 | `sr-qa` · `sec-eng` · `gate-verifier` | `testing-patterns`, `playwright-skill` · `security-auditor` · `iwana-test-evidence` | — | E2E real, GO de seguridad y los cinco paquetes |

## 3. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Suscriptores `ACTIVE` que hoy solo tienen placeholder | El CLI los cuenta y no los desactiva; quedan como «Contacto pendiente» para que el operador los complete |
| Un listener asíncrono no puede rechazar la activación | La regla R5 rechaza de forma síncrona en la transición del expediente |
| Deriva de contrato por la lista blanca | `contactPending` va nombrado en `sanitizeResponse` |
| Specs que dependen del estado de migración o del entorno | Lecciones R6, R7 y R8 escritas como restricción en el prompt |

## Lanzamiento

> Espejo de [PROMPT-MOD05-E3-CONTACTO-PENDIENTE-LAUNCH-v1.0.md](../prompts/PROMPT-MOD05-E3-CONTACTO-PENDIENTE-LAUNCH-v1.0.md); el archivo prevalece.

Ola 1: E1 `data-eng` ∥ E2 `sr-backend` ∥ E3 `fe-platform`.
