# LAUNCH — MOD11 ↔ MOD12 · Inventario de OT · Ola 3d (R-CA04 + S2 v1.2)

**Plan:** `docs/plans/2026-10-06-mod11-mod12-consumo-inventario-ot.md` v1.1 §5 · **Encargo:** `PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md`, §Ola 3d y §Re-verificación
**Estado:** R-D11 en GO. I4 v1.1 en NO GO por dos motivos: `SUBSCRIBER_REQUIRED` termina sin recibo (causa sin demostrar) y el motivo del rechazo no llega a la consola (causa verificada: `listItemUsage()` no lo selecciona).
**Ya pasó, no se repite:** CA-01 a 03, CA-05 a 11, la inyección sin outbox y la retención D11 de 24 horas.
**Entorno:** Docker local (Postgres en 5433, Redis en 6380) y `INTERNAL_QUEUE_SIGNING_KEY` local.

| # | Subagente | Encargo | Skills a leer |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §R-CA04: proyección de `rejectionReasonCode`, diagnóstico de `SUBSCRIBER_REQUIRED` y test integrado por motivo | `nestjs-expert`, `bullmq-specialist`, `postgresql`, `testing-patterns`, `systematic-debugging` |
| 2 | `sec-eng` | §Re-verificación, parte S2 v1.2: re-auditoría de los 3 bloqueos de I1, R-D11 y la retención | `security-auditor`, `backend-security-coder` |

**Paralelo:** sí. S2 es de solo lectura sobre código que R-CA04 no toca: firma, relay y DLQ.
**Después:** I4 v1.2 (`sr-qa`), solo CA-04 completo y el copy de los cuatro motivos en la consola.

---

### Bloque copiar-pegar — `sr-backend` (R-CA04)

> Actúa como `sr-backend`. Lee `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §Ola 3d e `INFORME-MOD11-MOD12-INVENTARIO-I4-SR-QA-v1.1.md`. Lee los `SKILL.md` de la tabla.
> (1) Añade `'usage.rejectionReasonCode'` al `.select` de `listItemUsage()` y revisa las demás lecturas del consumo, con test contra Postgres real.
> (2) `SUBSCRIBER_REQUIRED` desaparece sin recibo. **Primero diagnostica con evidencia**: el diagnóstico de la DLQ para ese `inventoryRequestId` (solo campos permitidos), los logs del worker y del API, y el tramo exacto donde se pierde. Después corrige la causa.
> (3) Un test **integrado** por cada motivo del §4, contra Postgres y Redis reales, desde MOD11 hasta el recibo y la proyección `REJECTED`.
> Jest de `tasks`, `inventory` y worker con `Cached: 0`. Entrega el informe R-CA04 con la causa demostrada. Sin commit.

### Bloque copiar-pegar — `sec-eng` (S2 v1.2)

> Actúa como `sec-eng`. Lee tu informe S2 (v1.0 y su adenda) y los informes R-WORKER, R-API y R-D11. Lee los `SKILL.md` de `security-auditor` y `backend-security-coder`.
> Re-audita, sin ejecutar nada: (1) la firma solo tras cotejar con el outbox (id, tenant, tipo, agregado y payload canónico); (2) `onFailed` con UUID validados y diagnóstico sin identificadores; (3) el relay sin mensajes crudos; (4) la retención de 24 horas como tope en las colas de origen, y si cierra tu consulta de D11.
> Dictamen GO o NO GO por bloqueo, con referencia al código. Entrega S2 v1.2. Sin commit.
