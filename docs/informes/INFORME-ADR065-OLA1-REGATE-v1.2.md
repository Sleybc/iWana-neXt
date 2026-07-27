# INFORME — Re-gate v1.2: DEF-2 + Ola 1 ADR-065 (post R-1/R-3)

**Versión:** 1.2 → **supersedida por** [INFORME-ADR065-OLA1-REGATE-v1.3](INFORME-ADR065-OLA1-REGATE-v1.3.md) (Ola 1 / DEF-2 **GO**; R-4 cerrada)
**Fecha:** 2026-07-24
**Modo:** Orchestrator + EM
**Autor:** AI-EM-ARCH
**Gate de referencia:** [INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.1](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.1.md)
**Predecesor re-gate:** v1.1 de [INFORME-ADR065-OLA1-REGATE-v1.0](INFORME-ADR065-OLA1-REGATE-v1.0.md) (NO-GO hasta R-1)
**Clasificación:** Uso interno

> **Estado:** histórico. Veredicto vigente = [REGATE-v1.3](INFORME-ADR065-OLA1-REGATE-v1.3.md).

---

## Veredicto

| Gate | v1.1 (auditoría) | **Ahora** |
| --- | --- | --- |
| **Ola 1 de ADR-065** | NO-GO por R-1 | **GO-CON-DEUDA** |
| **DEF-2 hotfix** | GO-CON-DEUDA, D-4 abierta | **GO-CON-DEUDA** — **D-4 cerrada** (088) |
| **Escalaciones** | Cerradas | Cerradas |

**Sin dos artefactos contradictorios:** este v1.2 es el re-gate vigente; la auditoría v1.1 permanece como evidencia del NO-GO intermedio.

---

## Evidencia de cierre bloqueantes

| # | Acción | Estado | Evidencia |
| --- | --- | --- | --- |
| R-1 | Mocks `addOrderBy` + aserción ORDER BY | **Cerrada** | AI-SR-FULL + AI-SR-QA GO |
| R-3 | Migración datos `088_*` backfill hash | **Cerrada** | `088_backfill_expediente_document_number_hash.ts` tras 087 |
| R-2 | Numeración índices → 089 | **Cerrada** | EM-ARCH (docs/ADR/prompts) |
| Compuerta suite | Resumen Jest, exit 0 | **Verde** | `205 passed`, `2307 passed`, `EXIT_CODE=0` |

---

## Deuda residual (no bloquea)

| Ítem | Momento |
| --- | --- |
| R-4 / D-5 clamp fuera de `runInTenantSchema` (4 sitios) | Ola 2 |
| R-5 test orden efectivo por recurso con `sortableFields` | Stop/go Ola 2 |
| Índices paginación `089_*` | Ola 2 |
| Pepper HMAC documentos (ambas columnas) | Propuesta futura |

---

## Tracks

| Agente | Resultado |
| --- | --- |
| AI-SR-FULL | R-1 + R-3 |
| AI-SR-QA | Compuerta **GO** |

## Próximo paso

Commit/PR del diff acumulado; Ola 2 arranca con `089` + R-4/R-5 en el prompt de fase.
