# LAUNCH — MOD11 ↔ MOD12 · Inventario de OT · Ola 3 (S2 + I4)

**Plan:** `docs/plans/2026-10-06-mod11-mod12-consumo-inventario-ot.md` v1.1 §5 · **Spec:** v1.1 (Aprobado, 2026-10-06)
**Gates:** G1 cerrado · G4 emitido · olas 1, 2 y 2b en GO (auditadas el 2026-10-06)
**Contrato:** v1.6 congelado. `technicianCustodyId` es el `responsibleRefId` del técnico (aclaración de I2-R).
**Cerrado, no re-despachar:** P1, I1, I1-R, I2, I2-R, I3 y T-FIX. Los hallazgos vuelven al dueño del bloque.
**Entorno local activo:** Postgres en `127.0.0.1:5433`, Redis en `127.0.0.1:6380`, MinIO en `9002` y pgbouncer en `6433`. Se necesita `INTERNAL_QUEUE_SIGNING_KEY` en el `.env` local, generada con `openssl rand -base64 32`.

| # | Subagente | Encargo (`PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md`) | Skills a leer |
| --- | --- | --- | --- |
| 1 | `sec-eng` | §S2: auditoría de solo lectura del código de I1, I1-R, I2 e I2-R contra D8, D9, D11 y CA-08 | `security-auditor`, `backend-security-coder` |
| 2 | `sr-qa` | §I4: CA-01 a CA-11 contra api, worker, Postgres y Redis reales | `e2e-testing-patterns`, `testing-patterns`, `postgresql`, `verification-before-completion`; `playwright-skill` para CA-03 |

**Paralelo:** sí. S2 no ejecuta nada, e I4 no modifica código de producción.
**Cierre:** S2 e I4 en GO. Después, AI-EM-ARCH consolida G6 de este plan y lo registra junto al G6 de la consola.

---

### Bloque copiar-pegar — `sec-eng` (S2)

> Actúa como `sec-eng`. Lee `AGENTS.md`, la spec v1.1 (D8, D9, D11, D12 y CA-08), el plan §5 y `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §S2. Lee los `SKILL.md` de `security-auditor` y `backend-security-coder`.
> Audita el código del worker (reencolado firmado, rescan y DLQ) y del API (`inventory-execution-request.processor.ts`, ledger y recibos). Revisa: HMAC y rotación con comparación en tiempo constante, Zod antes de cualquier efecto, esquema derivado solo de `public.tenants`, principal `{ sub }` sin claims fabricados, custodia resuelta por `responsibleRefId`, y DLQ y logs sin payload ni PII.
> Solo lectura. Un hallazgo es `[BLOQUEO]` hacia el dueño del bloque. Entrega el informe S2. Sin commit.

### Bloque copiar-pegar — `sr-qa` (I4)

> Actúa como `sr-qa`. Lee `AGENTS.md`, la spec v1.1 §5 (CA-01 a CA-11), el plan §5 y `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §I4. Lee los `SKILL.md` de la tabla.
> Levanta api y worker contra el Postgres (5433) y el Redis (6380) locales, con clave HMAC local. Usa datos de prueba propios: una `StockLocation` móvil real, con `id` distinto del técnico, un CPE serial y una cantidad. No toques las OT reales de `tenant_iwana`.
> Prioridades: CA-01 y CA-02 (el stock se mueve de verdad), CA-05 con **carrera real** de dos jobs, las cinco negaciones de CA-08, CA-09 tras el cierre, CA-11 inspeccionando un job fallido real en la DLQ, y CA-03 en el selector de la consola.
> Evidencia con conteos, SQL y Redis. Un fallo es hallazgo para el dueño del bloque, con su reproducción. Entrega el informe I4. Sin commit.
