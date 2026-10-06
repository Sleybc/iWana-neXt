# PROMPT DE EJECUCIÓN — MOD11 · El spec de anulación no revierte la 136 ajena

**Versión:** 1.0
**Fecha:** 2026-10-05
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-SR-FULL** (`sr-backend`)
**Tipo:** corrección de la infraestructura de pruebas. No toca código de producción.

## 1. Defecto

`apps/api/src/modules/tasks/tests/execution-orders.annulment.postgres.integration.spec.ts` aplica la migración 136 en `beforeAll`. En `afterAll` ejecuta **su `down()` sin condición** (alrededor de la línea 209).

El tenant de integración por defecto es la base de desarrollo `tenant_iwana`, que ya trae la 136 aplicada: se verificó el 2026-10-05 que `is_annulled` existe y que `typeorm_migrations` registra `ExecutionOrderAnnulmentFlag1360000000000`. Sobre esa base, una corrida del spec **elimina la columna `is_annulled`** mientras el registro de migraciones sigue diciendo «aplicada». Es la misma deriva que E4-datos causó y reparó con la 135 en los specs `dispatch` y `origin-identity`.

## 2. Alcance exacto

- Replica en este spec la guarda que E4-datos puso en esos dos specs: detecta si la 136 ya está aplicada, consultando `information_schema` por `is_annulled`; aplica `up()` **solo** si falta y ejecuta `down()` **solo** si la aplicó la propia suite. La guarda de la 135 que el spec ya tiene se conserva.
- Busca en `apps/api/src/**/*.postgres.integration.spec.ts` cualquier otro `down()` incondicional sobre migraciones de tenant y **lístalo** en el informe. Corrígelo solo si es el mismo patrón de una sola línea; si no, déjalo como hallazgo.

**Fuera de alcance:** el código de producción, las migraciones y el resto de specs.

## 3. Skills, gates y entrega

| Tipo | Skills |
| --- | --- |
| **Obligatorias** | `testing-patterns`, `postgresql` |
| **Descartadas** | `database-migration`, porque no se escribe migración |

**Gates:**

- el spec corre contra el tenant de integración **dos veces seguidas**;
- después de cada corrida, `is_annulled` sigue existiendo y `typeorm_migrations` es coherente con el esquema. Se verifica con SQL y la salida va en el informe.

**Entrega:** `docs/informes/INFORME-MOD11-CORRECCION-OT-SPEC-136-GUARDA-v1.0.md`. Sin commit ni push.
