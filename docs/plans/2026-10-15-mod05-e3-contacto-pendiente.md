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

## Estado al 2026-10-15

| Bloque | Estado |
| --- | --- |
| E1 | ✅ Migración 148: `up/down/up` contra Postgres real; `down` aborta con `NULL` y da conteos sin PII ([informe](../informes/INFORME-MOD05-E3-E1-v1.0.md)) |
| E2 | ✅ API 375 suites y shared 18, sin caché. Integraciones: conversión sin contacto, activación, guarda del expediente, CLI e idempotencia; B5 16/16; la rotación conserva los `NULL` ([informe](../informes/INFORME-MOD05-E3-E2-v1.0.md)). Extensión menor aceptada: la entidad `party_contact` admite `NULL` |
| E3 | ✅ Portal 299 suites y 3.004 tests, sin caché; `audit-ui` limpio ([informe](../informes/INFORME-MOD05-E3-E3-v1.0.md)). Extensión aceptada: `SubscriberDetailClient.tsx` y `SubscriberSections.tsx`, para conectar «Agregar contacto» y el mensaje de R6 |
| Ola 2 (E4) | E4-B ✅ GO · E4-C NO-GO (cobertura de `expediente.service.ts` y `search_path` de B5) · E4-A bloqueado: **defecto real SUB-A01** (fallos de conversión tragados por `suppressErrors`) más la precondición A18 omitida en el encargo · Anexo A `[BLOQUEO]` legítimo → **Ola 2-bis** (F1–F4, prompt §6) |
| Ola 2-bis | F1, F2 y F3 ✅; `sec-eng` NO-GO (UUID en logs y `response.code`) → disposiciones D1–D5 (prompt §7.1); el portal no muestra fallos de conversión → **Ola 2-ter** (G1–G4, prompt §7.3) |
| Ola 2-ter | G3 ✅ 2/2 E2E reales; G4 con 15 comandos verdes. NO-GO por SEC-G4-01 (ampliación de roles; **defecto del emisor** en §7.2), SEC-G4-02 (reintento sin auditoría), el test B5 desfasado por R8 y la cobertura D1 (3 métricas por debajo de `fb3d41ee`; portal 95/99). SEC-G4-03 aclarado en ADR-027 → **Ola 2-quater** (H1–H4, prompt §8) |
| Ola 2-quater | H1, H2, H3 ✅; `sec-eng` ✅ GO; gates ✅ salvo 3 líneas nuevas sin cubrir (`expediente.service.ts:1328-1329` y `:1338`) → delta H5 + H6 (prompt §9) |
| **G6** | ✅ **GO** (2026-10-15): H5 cubre las 3 líneas; H6, API 5.002 tests sin caché, líneas cambiadas 55/55 y 51/51, D1 > línea base. [Informe de cierre](../informes/INFORME-MOD05-E3-CIERRE-G6-v1.0.md). Pendiente: G6.5 (CI por SHA) y G7 (CLI por tenant) |

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
