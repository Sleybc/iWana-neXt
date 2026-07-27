# INFORME — Ola de pago de deuda: re-gate ADR-065

**Versión:** 1.0
**Fecha:** 2026-07-24
**Modo:** Orchestrator + EM
**Autor:** AI-EM-ARCH
**Antecedente:** [INFORME-ADR065-OLA1-REGATE-v1.0](INFORME-ADR065-OLA1-REGATE-v1.0.md)

---

## Decisión de alcance

| Deuda | Esta ola | Responsable | Notas |
| --- | --- | --- | --- |
| **D-4** hash `documentNumber` en expedientes | **Sí** | AI-SR-FULL (+ SEC review) | Espejo de `subscribers.documentNumberHash` |
| **E-1 ejecución** ADR-066 `runner`/`revert` | **Sí** | AI-SR-FULL | Primer entregable Ola 2; **sin** migración `087` de índices aún |
| **Meta R2/R3** + tests abuso `limit=10000` | **Sí** | AI-SR-FULL + AI-SR-QA | P3 SEC; cierra residual H-1-R-P3a/c |
| **31 endpoints** envelope | **No** | — | Decisión 1 Ola 1 (Olas 5/6/7) |
| Índices paginación Ola 2 | **No** | — | Después de runner ADR-066 verde |

**Justificación:** pagar la deuda que deja DEF-2/Ola 1 en GO limpio y desbloquear ejecución de Ola 2, sin violar la Decisión 1 ni adelantar índices antes del runner.

---

## Criterio de salida de esta ola

1. Listado expedientes por `documentNumber` = `WHERE hash = …` + `skip`/`take` (sin scan AES).
2. `runner.ts` / `revert.ts` con flag `transactional` (default true); docs en `database.instructions.md`.
3. R2/R3 emiten `meta` coherente; spec demuestra `limit=10000` → ≤100.
4. SEC: D-4 **aceptable**; QA: verdes en superficie tocada.

---

## Estado (2026-07-24)

**Cerrada.** Ver [INFORME-ADR065-DEUDA-CIERRE-v1.0](INFORME-ADR065-DEUDA-CIERRE-v1.0.md).
