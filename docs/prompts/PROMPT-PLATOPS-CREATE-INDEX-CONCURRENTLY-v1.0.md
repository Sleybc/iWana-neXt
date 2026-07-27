# PROMPT — AI-PLAT-OPS: Medicion CREATE INDEX y decision de patron (E-1 ADR-065)

**Version:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-07-24
**Modo activo:** Architect (AI-EM-ARCH delega a AI-PLAT-OPS)
**Generado por:** AI-EM-ARCH
**Ejecutor previsto:** AI-PLAT-OPS
**ADR:** [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md) (Aprobado CTO 2026-07-24)
**Escalacion origen:** [E-1 runner.ts y CREATE INDEX CONCURRENTLY](../plans/2026-07-24-escalaciones-abiertas-paginacion.md#e-1--runnerts-y-create-index-concurrently--bloquea-la-ola-2)
**Archivo destino:** docs/prompts/PROMPT-PLATOPS-CREATE-INDEX-CONCURRENTLY-v1.0.md

---

## 1. Objetivo exacto

Determinar si la migracion `087_*` (14+ indices de paginacion y orden para la Ola 2 de ADR-065) puede usar `CREATE INDEX` bloqueante con ventana de mantenimiento, o si requiere modificar `packages/database/src/migrations/tenant/runner.ts:225` para soportar migraciones no transaccionales con `CREATE INDEX CONCURRENTLY`.

### Resultado esperado

AI-PLAT-OPS entrega un numero medido y una recomendacion: **(i)** indice bloqueante con ventana (opcion barata, no toca el runner) o **(ii)** modo no transaccional en el runner (toca infraestructura multi-tenant compartida, exige ADR hermano y aprobacion CTO).

### Lo que si entra

- Medicion de duracion de un `CREATE INDEX` bloqueante sobre `stock_movements`, `audit_logs` e `inventory_items` en un tenant representativo.
- Documentar la metodologia de medicion, el entorno usado y la cardinalidad de cada tabla en el tenant de prueba.
- Recomendacion fundamentada con el numero que la sostiene.

### Lo que no entra

- Escribir la migracion `087_*`.
- Modificar el runner.ts (eso sale de un ADR posterior si la medicion lo exige).
- Crear los indices. Esto es solo medicion y decision de patron.

---

## 2. Artefactos de entrada obligatorios

- ADR-065 (especialmente §Consecuencias: "Bloqueo operativo abierto" y "~14 indices nuevos por tenant")
- Plan de adopcion: [2026-07-24-paginacion-numerada-adopcion.md](../plans/2026-07-24-paginacion-numerada-adopcion.md) (Ola 2)
- runner.ts actual: `packages/database/src/migrations/tenant/runner.ts` (linea 225: transaccion incondicional)
- Plan de escalaciones: [2026-07-24-escalaciones-abiertas-paginacion.md](../plans/2026-07-24-escalaciones-abiertas-paginacion.md) (E-1)

---

## 3. Instrucciones para AI-PLAT-OPS

1. Identificar el tenant con mayor cardinalidad en las tablas objetivo (`stock_movements`, `audit_logs`, `inventory_items`). Si no hay acceso a produccion, estimar con datos de seed representativo o documentar la imposibilidad de medicion.
2. Para cada tabla, medir `CREATE INDEX` bloqueante sobre la clave de paginacion proyectada:
   - `stock_movements`: compuesto por `(tenant_id, created_at DESC, id DESC)` o similar
   - `audit_logs`: compuesto por `(tenant_id, created_at DESC, id DESC)` o similar
   - `inventory_items`: compuesto por `(tenant_id, ...)` segun el orden de negocio
3. Registrar: cardinalidad de la tabla, duracion del CREATE INDEX, y si la tabla acepta bloqueo durante la ventana de mantenimiento tipica del tenant.
4. Si todas las mediciones estan por debajo de 3 segundos: recomendar **patron bloqueante con ventana**, sin tocar el runner.
5. Si alguna medicion supera los 3 segundos: recomendar **patron no transaccional**, detallando el mecanismo propuesto para el runner (flag `requiresExternalTransaction` en la migracion, bifurcacion de `applyTenantMigrationsInOrder` en dos caminos).

---

## 4. Restricciones no negociables

- No modificar el runner sin ADR hermano aprobado por el CTO.
- No usar `CONCURRENTLY` dentro de una transaccion (PostgreSQL lo rechaza).
- No medir en produccion sin autorizacion del CTO.
- No asumir cardinalidades: medir o documentar la imposibilidad.

---

## 5. Entregables

- Informe de medicion en `docs/informes/INFORME-PLATOPS-INDICES-PAGINACION-MEDICION-v1.0.md`
- Recomendacion de patron (bloqueante vs no transaccional) con el numero que la sostiene
- Si se recomienda patron no transaccional: propuesta de ADR hermano con el diseno del mecanismo

---

## 6. Criterio de stop/go

**Detenerse si:**
- No hay acceso a un tenant con datos representativos y no se puede estimar con seed.
- La medicion revela que incluso con `CONCURRENTLY` el impacto es inaceptable (>30 s por indice en el p95 de tenants).

**Escalar a:** AI-EM-ARCH, quien escala al CTO si es necesario.

---

## 7. Criterio de salida

- Medicion documentada con metodologia, entorno y cardinalidades.
- Recomendacion de patron con justificacion cuantitativa.
- Si aplica, borrador de ADR hermano para modificacion del runner.

---

## 8. Fecha limite

Antes de que la Ola 1 cierre (para no dejar la Ola 2 esperando). La Ola 1 es la fase de contrato unico de API — este dato debe estar listo cuando AI-SR-FULL llegue a la migracion `087_*` en la Ola 2.
