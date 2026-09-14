# Informe de fase — MOD11: retención de la línea de tiempo de la OT

**Versión:** 1.0
**Fecha:** 2026-09-14
**Modo:** EM + Orchestrator
**Estado:** B1 + B2 GO. Exigencia 3 del dictamen cerrada en lo técnico.
**Plan:** `docs/plans/2026-09-14-mod11-retencion-linea-tiempo.md` v1.0
**Spec:** `docs/specs/2026-09-14-mod11-retencion-linea-tiempo-design.md` v1.0 (Propuesto)
**Dictamen que cumple:** `INFORME-MOD11-B3-FINALIDAD-RETENCION-v1.0.md` (Aprobado por AI-SEC-ENG), exigencia 3
**Prompt de ejecución:** `docs/prompts/PROMPT-MOD11-RETENCION-LINEA-TIEMPO-v1.0.md` v1.0

## 1. Qué se resolvió

La política de retención (24 meses post-cierre, dictamen B3) ya existía; faltaba ejecutarla. Este tramo extiende la purga por tenant existente (`purge_execution_order_retention_batch` + `ExecutionOrderTombstoneProcessor`) con la tabla de transiciones, bajo regla correlacionada con el estado de la OT padre — no por antigüedad de fila. Retira **uno de los cuatro obstáculos de T3** (métricas de productividad).

## 2. Bloques y veredicto

| Bloque | R | Veredicto | Evidencia |
| --- | --- | --- | --- |
| B1 purga + migración | AI-SR-FULL | GO | Migración `134_anonymize_execution_order_transition_retention.ts` + spec 10/10 (`--ci --runInBand --no-cache`, sin `--passWithNoTests`) |
| B2 verificación | AI-SR-QA | GO 10/10 CA | CA-01…CA-10 en verde con comandos corridos (ver §3) |

Decisión de diseño del tramo (§4.3 de la spec): **anonimizar, no borrar** — columna anulable + centinela nil-UUID para el vencido, NULL reservado a «nunca registrado» (CA-07). Terna terminal idéntica a `assertMutable`/`isTerminal` del servicio (`COMPLETED`, `COMPLETED_WITH_OBSERVATIONS`, `NOT_EXECUTED`, `CANCELLED` — verificado en `execution-orders.service.ts:1995` y `:2918`).

## 3. Evidencia de gates (verificada por AI-EM-ARCH, no autodeclarada)

- **CA-02:** el paso 6 es `UPDATE` (`changed_by` → centinela, `reason` → NULL); `from_status`/`to_status`/`changed_at` intactos. Sin `DELETE FROM execution_order_status_transitions`.
- **CA-03:** víctimas solo con `o.status IN (terminal)` y `COALESCE(MAX cierre no-corrección, closed_at) <= now − 24m`. OT abierta nunca vence.
- **CA-05:** sin `actorName`/`metadataJson` en la entidad (solo mención en comentario); `correction_of_id` es vínculo id↔id intra-OT que vence junto — no reconstruye actor. Sin apartamiento del dictamen: no requiere re-dictamen de sec-eng.
- **CA-07:** purga nunca escribe NULL ni toca NULLs (`t.changed_by IS NOT NULL AND <> centinela`).
- **CA-08:** procesador intacto (árbol limpio en `apps/worker`), sin cron nuevo. **CA-09:** purga sin PII en logs. **CA-10:** `down()` restaura el literal exacto de la 101 + guarda anti-NULL antes de DDL.
- **Conteo real:** `134` 10/10 · tasks **30 suites, 617/617** (jest directo `--ci --runInBand --no-cache`, sin turbo, verificado por orquestador) — piso intacto.
- **Transversal:** `audit:adr-citations` BLOQUEANTE: 0 · `audit:doc-locations` BLOQUEANTE: 0 (verificado por orquestador). Sin toque a `@iwana/shared` (`git status` vacío en `packages/shared`).

## 4. Gates del workflow (§3)

| Gate | Estado |
| --- | --- |
| G1 (spec/plan) | **Pendiente CTO** — spec y plan en `Propuesto`. El despacho se ejecutó por orden expresa del tramo; si el CTO cambia la regla, el retrabajo está acotado a la 134. |
| G4 | Cumplido — prompt de ejecución v1.0 emitido, sin contratos nuevos. |
| G6 (calidad del tramo) | **GO** — B2 10/10, sin bloqueantes, sin desvío del dictamen. |
| G6.5 | **Diferido por el CTO** hasta entorno Linux — no abordado, por orden. |
| G7 | No aplica (sin despliegue en el tramo). |

## 5. Deuda por severidad

- **Media (heredada, spec §8):** revisión anual de OT huérfanas sin automatizar (procedimiento manual). Tres condiciones restantes de T3 siguen abiertas: mapa campo × rol, registro de acceso masivo en `audit_logs`, cota de paginación.
- **Baja (observación B2, fuera del tramo):** `execution-orders.service.ts:869` vuelca motivo recortado en log operativo — tensión preexistente con dictamen B3 §3.4 (fase 2, dueños sr-backend/sec-eng). No toca CA-09.
- **Crítica/Alta:** ninguna.

## 6. Blockers y desempates

Bloqueantes: 0. `[BLOQUEO]`: 0. `[DESEMPATE]`: 0. Latencia de gates: 0. El tramo no generó artefactos contradictorios: la spec hermana de T1 no se supera, se cumple.

## 7. Decisión

**Exigencia 3 cerrada en lo técnico; un obstáculo de T3 retirado.** T3 sigue sin GO hasta sus tres condiciones restantes + dictamen independiente. G1 (aprobación CTO de spec/plan) queda como único pendiente de gobierno del tramo.
