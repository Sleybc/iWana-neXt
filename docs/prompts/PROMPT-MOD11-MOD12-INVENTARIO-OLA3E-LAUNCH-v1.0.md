# LAUNCH — MOD11 ↔ MOD12 · Inventario de OT · Ola 3e (R-D11b + I4 v1.2)

**Plan:** `docs/plans/2026-10-06-mod11-mod12-consumo-inventario-ot.md` v1.1 §5 · **Encargo:** `PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §Ola 3e
**Estado:** R-CA04 en GO en lo verificable (4/4 integrados). S2 v1.2 en NO GO por D11-RET-01 y D11-RET-02. D11 enmendada en la spec el 2026-10-09.
**Decisiones:** (1) el caso histórico se cierra por convergencia con SQL, sin leer Redis ni logs completos; (2) retención de 24 horas mientras API o worker estén activos, con limpieza independiente del contenido.
**Ya pasó, no se repite:** CA-01 a 03, CA-05 a 11, la inyección, los tres bloqueos de I1 y los recorridos integrados de CA-04.

| # | Subagente | Encargo | Skills a leer |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §R-D11b: `clean(24h, 'failed')` sin filtro de contenido, en las dos colas de origen, desde API y worker | `bullmq-specialist`, `backend-security-coder`, `testing-patterns` |
| 2 | `sr-qa` | §Re-verificación final, parte I4 v1.2: copy de los 4 motivos en la UI y convergencia del caso histórico | `e2e-testing-patterns`, `postgresql`, `playwright-skill`, `verification-before-completion` |

**Paralelo:** sí. I4 no toca código ni lee Redis.
**Después:** S2 v1.3 (`sec-eng`) sobre R-D11b. Con I4 v1.2 y S2 v1.3 en GO se consolida G6 del inventario.

---

### Bloque copiar-pegar — `sr-backend` (R-D11b)

> Actúa como `sr-backend`. Lee `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §Ola 3e, la D11 enmendada de la spec y `INFORME-MOD11-MOD12-INVENTARIO-S2-SEC-ENG-v1.2.md`. Lee los `SKILL.md` de `bullmq-specialist`, `backend-security-coder` y `testing-patterns`.
> En `inventory-execution-requests` y en `operations-execution-events`, borra **todo** fallido con más de 24 horas con `queue.clean(86_400_000, lote, 'failed')`, sin filtrar por nombre ni por `eventType`. Programa esa limpieza como job repetible horario **en el API y en el worker**.
> Tests: se borra un fallido malformado de más de 24 horas, se conserva uno reciente y funciona con un solo proceso activo. Jest de `inventory` y del worker con `Cached: 0`. Entrega R-D11B. Sin commit.

### Bloque copiar-pegar — `sr-qa` (I4 v1.2)

> Actúa como `sr-qa`. Lee `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §Ola 3e (Decisión 1 y §Re-verificación final) y tus informes I4 v1.0 y v1.1. Lee los `SKILL.md` de `e2e-testing-patterns`, `postgresql`, `playwright-skill` y `verification-before-completion`.
> (1) En la consola, sobre una OT con snapshot v2, comprueba que se ve el copy literal de dos partes de los cuatro motivos de CA-04 (spec §4).
> (2) Deja que D7 reemita el consumo histórico `PENDING` de `SUBSCRIBER_REQUIRED` y verifica **solo por SQL** que converge a `REJECTED/SUBSCRIBER_REQUIRED`, con recibo, `rejection_reason_code` y `request_attempts`. **No leas jobs de Redis ni líneas de log.**
> Entrega I4 v1.2. Sin commit.
