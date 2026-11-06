# PROMPT — CRM · Marcas de privacidad en la transacción

**Versión:** 1.0
**Estado:** G0 aprobado el 2026-11-06. Bloqueado hasta el commit de MOD14 Fase 01
**Fecha:** 2026-11-06
**Emitido por:** AI-EM-ARCH
**Spec:** [2026-11-06-crm-marcas-en-transaccion-spec.md](../specs/2026-11-06-crm-marcas-en-transaccion-spec.md)
**Plan:** [2026-11-06-crm-marcas-en-transaccion-orquestacion.md](../plans/2026-11-06-crm-marcas-en-transaccion-orquestacion.md)

---

## §B1 — `sr-backend`

**Objetivo:** que `activeMarks`, `hasActive`, `getPlanById`, `createSnapshot` y `mediaService.findOne` usen la conexión de la transacción del llamante en CRM contratos y en la ficha 360°. Sin cambio de reglas ni de respuestas. Catálogo y media vienen de §4 de la spec transversal `docs/specs/2026-11-06-transacciones-conexiones-y-efectos-spec.md`.

**Lee primero:** `AGENTS.md`, la spec completa y las skills de la matriz del plan. Las líneas de la spec son previas al commit de MOD14: vuelve a localizarlas.

**Orden obligatorio:**

1. Escribe la prueba de CA-1 con `DataSource` de `max: 1` y `connectionTimeoutMillis` corto. Córrela y guarda el rojo.
2. Añade `ctx?: { manager: EntityManager }` a `activeMarks` y `hasActive` en sus puertos.
3. En los adaptadores, extrae la lectura a un método privado que reciba `manager`. Con `ctx` usa ese `manager`; sin `ctx`, `withPrivacyTenant` como hoy.
4. Pasa `ctx` en `contracts.service.ts` (agenda, `assertSubscriberNotBlocked`, `requireContractualAuthorization`) y en `contract-read-projection.ts`. La guarda y la autorización reciben `manager` opcional, porque también pueden correr fuera de transacción.
5. Haz lo mismo con `getPlanById` y `createSnapshot` en el catálogo, y con `mediaService.findOne` en `_hasVerifiedStratumEvidence`. Conserva `PLAN_UNAVAILABLE` ante `22P02` y añade una prueba, porque en la misma conexión ese error aborta la transacción.
6. Añade CA-2 a CA-6. Para CA-6, extiende el patrón de `crm/tests/crm-blocked-mutations.arch.spec.ts`.

**No hagas:**

- No muevas lecturas fuera de la transacción.
- No consultes `party_privacy_marks` ni tablas de autorizaciones desde CRM.
- No cambies `DB_POOL_MAX`, otros consumidores del catálogo, migraciones ni OpenAPI.
- No hagas `activeMarks` capture errores: el fallo sigue siendo cerrado.
- No ajustes una expectativa existente de bloqueo o enmascarado. Si una se pone roja, detente y repórtalo. El único ajuste admitido es el argumento nuevo en un `toHaveBeenCalledWith`.

**Cierre:** `@iwana/api` unitaria e integración completas, sin caché, en un `postgres:18-alpine` propio, con `DB_NAME=test`, conteo real y omisiones declaradas. Lint y `tsc`. Cobertura de `privacy/**` frente a la base vigente. Cero PII y nunca `tenant_iwana`.

**Informe:** archivos tocados, salida del rojo de CA-1, tabla de CA-1 a CA-7 con prueba y resultado, y specs existentes modificados con el motivo de cada uno. En `main`, sin commit. No edites el plan ni registres gates.

## §R1 — Revisiones, solo lectura

- **`boundary-reviewer`:** que CRM no acceda a tablas de Privacy, que el `manager` sea el de la transacción del mismo tenant y que ninguna ruta de la spec haya quedado sin `ctx`.
- **`test-change-reviewer`:** cada spec existente modificado, junto con el cambio que lo motivó. Marca como defecto cualquier expectativa de bloqueo o enmascarado alterada.
- **`gate-verifier`:** Gates Before Merge sobre `@iwana/api`, con conteos reales.

## §B1-R — `sr-backend`, corrección tras la verificación de B1

B1 entregó marcas y autorización. Faltan dos cosas.

**1. CA-3 no prueba el rollback.** El doble de `activeMarks` falla siempre, así que `create` se detiene en la guarda, antes de escribir: el conteo de 0 filas pasaría sin rollback. Haz que el doble deje pasar la primera llamada y falle en la segunda, la de la proyección, que ocurre después de `save`. Comprueba que esa llamada ocurrió y que quedan 0 filas. Haz lo mismo con una mutación sobre un contrato existente y comprueba que no cambió.

**2. D3 no se hizo: catálogo y media.** Aplica el paso 5 de §B1 a `getPlanById`, `createSnapshot` y `mediaService.findOne`, con `ctx?: { manager }`. Cubre también `_resolveVatSnapshot`, que se usa en `changePlan`, `updateServicePoint`, `uploadStratumEvidence`, `removeStratumEvidence`, `_transition` y `prepareLifecycleActivation`.

- Retira el doble del catálogo en la prueba de CA-1 y usa el adaptador real, con un plan real en el esquema de prueba.
- Añade `changePlan` a CA-1 y otra ruta que pase por `_resolveVatSnapshot` con evidencia de estrato. Guarda el rojo antes del cambio.
- Prueba `PLAN_UNAVAILABLE` ante `22P02` con la misma conexión: la transacción queda abortada y no debe ejecutarse otra consulta.
- Extiende CA-6 a estos métodos.

**No hagas:** nada de §B1 «No hagas». Otros consumidores del catálogo y de media siguen sin `ctx`.

**Cierre e informe:** los de §B1, en un informe nuevo que liste lo añadido sobre B1.

## §B1-R2 — `sr-backend`, limpieza de la prueba

`crm-privacy-marks-in-transaction.postgres.integration.spec.ts` crea una fila `stratum_evidence` en `public.media_assets` y no la borra. El esquema del tenant se elimina, pero esa tabla es pública. La fila hace fallar 7 pruebas de `026_media_usage_stratum_evidence.integration.spec.ts` si `@iwana/db` corre después sobre la misma base. CI no lo ve porque corre `@iwana/db` antes.

Borra en `afterAll` las filas de `public.media_assets` con el `tenant_schema` de la prueba, antes de eliminar el tenant. Cierra corriendo `@iwana/api` integración y después `@iwana/db` integración **sobre la misma base**, y entrega ambos conteos. Solo se toca ese archivo.
