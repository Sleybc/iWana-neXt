# INFORME — Review AppSec H-1 / D-2: tope de `limit` en CRM (Ley 1581)

**Versión:** 1.0
**Fecha:** 2026-07-24
**Autor:** AI-SEC-ENG (consolidado por AI-EM-ARCH)
**Gate:** [INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0.md) · D-2 / H-1
**Prompt:** `docs/prompts/PROMPT-DEF2-H1-SEC-ENG-REVIEW-v1.0.md`
**Clasificación:** Uso interno
**Modo:** Solo lectura · sin código

---

## Dictamen

| Objeto | Veredicto |
| --- | --- |
| **Estado actual (sin parche)** | **Bloqueante** del cierre DEF-2 / H-1 |
| **Diseño propuesto** (`clampLimit` máx. 100 +/o DTO `@Max(100)`) | **Aceptable con ajustes** |
| **Cierre total DEF-2** | **No** — D-4 residual MEDIA (ticket propio) |

Sin remediación aplicada, **no hay visto bueno de superficie PII** para merge de H-1.

---

## Evidencia por ruta

### R1 · `GET /crm/subscribers` — P0 · bloqueante

Controller `subscribers.controller.ts` sin `@Max`; service solo `clampPage`; `decryptSubscriberFields` + `sanitizeResponse` exponen documento / correo / teléfono.  
`?page=1&limit=10000` → producto ≤ 10_000 → **pasa** → hasta 10 000 registros con PII descifrada.

### R2 · `GET /crm/expedientes` — P1 · alto (DoS + PII residual)

Mismo patrón sin tope; `Promise.all` de completitud por fila amplifica presión de pool. Listado anula `*Encrypted` pero conserva `emailSecondary` / `fullName`.

### R3 · `GET /crm/expedientes/:id/contact-attempts` — P2

Mismo bypass de `limit`; alcance acotado a un expediente. Incluir en el parche H-1.

### Conteo «4 endpoints»

En código del alcance citado hay **3** listados paginados CRM (R1–R3). Un 4.º candidato es `responsibilities` (hardening, no dump de documento/teléfono/correo). **Decisión EM-ARCH:** el parche H-1 obligatorio es **R1+R2+R3**; responsibilities = hardening opcional en el mismo PR si el costo es bajo.

---

## Diseño — ajustes requeridos

1. **Service obligatorio:** `const limit = clampLimit(rawLimit)` **antes** de `clampPage(page, limit)`.
2. Defense-in-depth: DTO/Zod `@Max(100)` además del service.
3. `meta.limit` = limit **efectivo**.
4. Cap silencioso o 400 genérico (estilo `clampPage`); sin stack/SQL.
5. No cerrar H-1 solo con OpenAPI/`@ApiQuery`.

---

## Residual D-4

Full-scan + AES en rama `documentNumber`; `safeLimit` solo acota `slice`. Severidad **MEDIA**. No bloquea el dictamen de diseño H-1; sí el cierre limpio de DEF-2 (ticket propio).

---

## Hallazgos

| ID | Sev | Acción |
| --- | --- | --- |
| H-1-P0 | P0 | R1: `clampLimit` en service (+ DTO) |
| H-1-P1 | P1 | R2: mismo tope 100 |
| H-1-P2a | P2 | R3 en el parche |
| H-1-P2b | P2 | D-4 ticket |
| H-1-P2c | P2 | Clamp en service como control primario |
| H-1-P3* | P3 | Contrato cap vs 400; minimización payload; rate limit a medio plazo |

**No P0 de auth/tenant:** riesgo = abuso autenticado / insider / cuenta comprometida.

## Handoff

- AI-SR-FULL: implementar con ajustes 1–5; re-review SEC del **diff**.
- AI-EM-ARCH: no cerrar DEF-2 sin H-1 verificado + re-review SEC.
- CTO: no se pide excepción.
