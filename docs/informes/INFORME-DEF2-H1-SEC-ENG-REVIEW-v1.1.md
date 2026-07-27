# INFORME — Review AppSec H-1 / D-2: tope de `limit` en CRM (Ley 1581)

**Versión:** 1.1 (re-review post-parche)
**Fecha:** 2026-07-24
**Autor:** AI-SEC-ENG (persistido por AI-EM-ARCH)
**Gate:** [INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0.md) · D-2 / H-1
**Prompt:** `docs/prompts/PROMPT-DEF2-H1-SEC-ENG-REVIEW-v1.0.md`
**Predecesor:** [INFORME-DEF2-H1-SEC-ENG-REVIEW-v1.0](INFORME-DEF2-H1-SEC-ENG-REVIEW-v1.0.md)
**Clasificación:** Uso interno
**Modo:** Solo lectura · sin código

---

## Dictamen

| Objeto | Veredicto |
| --- | --- |
| **Diff aplicado (R1–R3)** | **Aceptable** |
| **Cierre limpio DEF-2 completo** | **No** — D-4 residual MEDIA (ticket propio) |

Visto bueno de superficie PII para cierre H-1 / D-2. Sin P0/P1 abiertos en el alcance del parche.

---

## Evidencia por ruta (post-parche)

### R1 · GET /crm/subscribers — cerrado

`clampLimit` antes de `clampPage`; `CrmListLimitPipe` (cap ≤100); `meta.limit` = limit efectivo vía `buildPageMeta`; `take(limit)` ≤100 antes de descifrar PII.

### R2 · GET /crm/expedientes — cerrado (dump por limit)

Mismo control service + pipe; respuesta `{ data, total }` sin meta (P3 contrato). Rama `documentNumber` → D-4.

### R3 · GET /crm/expedientes/:id/contact-attempts — cerrado

`clampLimit` + pipe + `take(limit)` ≤100.

### Bypass

Sin `offset` en R1–R3. Service capado aunque se omita el pipe. `responsibilities` = hardening opcional (fuera P0 H-1).

---

## Residual D-4

Comentario engañoso retirado. Mitigación parcial: `DOCUMENT_NUMBER_SCAN_CAP = 500` + 400 genérico + slice con limit capado. Deuda O-6/D-4 declarada (hash determinista). Severidad MEDIA. No bloquea H-1; sí cierre limpio DEF-2.

---

## Hallazgos residuales

| ID | Sev | Acción |
| --- | --- | --- |
| H-1-R-P3a | P3 | Opcional: meta en R2/R3 |
| H-1-R-P3b | P3 | DTO `@Max` solo OpenAPI; pipe es el control |
| H-1-R-P3c | P3 | Tests abuso `limit=10000` |
| H-1-R-P2 | MEDIA | Ticket D-4 |

## Handoff

- AI-EM-ARCH: cerrar H-1/D-2 en gate; D-4 aparte.
- AI-SR-FULL: sin acción obligatoria H-1.
- CTO: sin excepción.
