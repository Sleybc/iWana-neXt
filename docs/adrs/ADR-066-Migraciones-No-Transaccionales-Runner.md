# ADR-066 — Soporte de migraciones no transaccionales en runner multi-tenant

**Versión:** 1.0
**Estado:** **Aprobado**
**Fecha:** 2026-07-24
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Aprobado por:** CTO (2026-07-24)
**Skills:** `architecture-decision-records`, `nestjs-expert`, `database-migration`
**Relaciona:** [ADR-065](ADR-065-Paginacion-Numerada-Tablas-Operativas.md) §Consecuencias (bloqueo operativo), [plan de escalaciones](../plans/2026-07-24-escalaciones-abiertas-paginacion.md) E-1
**Incide sobre:** `packages/database/src/migrations/tenant/runner.ts:210-245`, `packages/database/src/migrations/tenant/revert.ts:203-221`

---

## Contexto

`packages/database/src/migrations/tenant/runner.ts:225` envuelve cada migración tenant en `queryRunner.startTransaction()`, ejecuta `migration.up(queryRunner)`, inserta el registro en `typeorm_migrations`, y hace `commitTransaction()`. La operación es atómica: o se aplica la migración entera (DDL + bookkeeping) o no se aplica nada.

PostgreSQL prohíbe `CREATE INDEX CONCURRENTLY` dentro de un bloque de transacción. El error es:

```
ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block
```

La Ola 2 de ADR-065 requiere ~14 índices de paginación más los de orden para las tablas operativas. Las dos tablas de mayor volumen —`stock_movements` y `audit_logs`— **se estima** que superan el millón de filas por tenant en operadores maduros (**supuesto de escala objetivo, no medición sobre un tenant representativo**; la medición de duración de `CREATE INDEX` bloqueante queda diferida a la ventana de ejecución de la Ola 2, conforme al plan de escalaciones E-1).

### ¿Por qué no sirve `CREATE INDEX` bloqueante?

Un `CREATE INDEX` sin `CONCURRENTLY` sobre una tabla de 1M+ filas:

1. **Adquiere un bloqueo `SHARE`** sobre la tabla, impidiendo escrituras concurrentes.
2. **Dura de decenas de segundos a minutos** según la cardinalidad, el ancho de las columnas indexadas y la contención de disco.
3. Durante ese tiempo, **todas las inserciones en `stock_movements` y `audit_logs` quedan bloqueadas** —incluyendo las de otros tenants que comparten el mismo servidor PostgreSQL, porque el bloqueo es a nivel de tabla en el schema del tenant.

En un operador ISP con movimiento continuo de inventario y registro de auditoría en tiempo real, una ventana de escritura bloqueada de 30-60 segundos por índice es inaceptable sin una ventana de mantenimiento declarada. Y con ~14 índices, la ventana se multiplica.

### ¿Por qué no se ha necesitado antes?

Las 86 migraciones tenant existentes (000-086) nunca han creado índices sobre tablas de alto volumen que requirieran `CONCURRENTLY`. Los índices existentes se crearon sobre tablas vacías o con pocas filas (migraciones iniciales), o sobre tablas de catálogo de baja cardinalidad. La migración `084` (índices trigram de usuarios) crea índices GIN sobre `users`, que es una tabla de cardinalidad moderada (cientos a pocos miles de filas por tenant) y no requirió `CONCURRENTLY`.

---

## Opciones

| # | Opción | Resumen | Veredicto |
|---|---|---|---|
| A | `CREATE INDEX` bloqueante con ventana de mantenimiento | Sin modificar el runner; se programa una ventana | **Descartada.** Multiplica el riesgo operativo: ~14 ventanas por tenant, contención entre tenants que comparten servidor, rollback manual por índice fallido. Viola el principio de zero-downtime de las migraciones del repo |
| B | Ejecutar `CONCURRENTLY` fuera de la transacción, con bookkeeping separado | El runner detecta migraciones con `transactional = false`, ejecuta el DDL sin transacción, inserta el registro `typeorm_migrations` en una transacción aparte | **Recomendada** |
| C | Migración manual ad-hoc por tenant | El DBA ejecuta los índices a mano, tenant por tenant, fuera del runner | **Descartada.** Rompe la automatización, no es reproducible, no tiene rollback, y el runner marcaría la migración como no aplicada para siempre |

---

## Decisión

**Opción B.** Se extiende el contrato de migración para que una migración pueda declararse no transaccional, y el runner bifurca su ejecución en dos caminos.

### Diseño

#### 1. Flag en la migración

Se añade una propiedad opcional `transactional` a las migraciones que lo necesiten:

```typescript
// packages/database/src/migrations/tenant/089_pagination_ordering_indexes.ts
export class PaginationOrderingIndexes0890000000000 implements MigrationInterface {
  name = 'PaginationOrderingIndexes0890000000000';
  
  /** Esta migración usa CREATE INDEX CONCURRENTLY y no puede ejecutarse dentro de una transacción. */
  transactional = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ...`);
    // ...
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS ...`);
    // ...
  }
}
```

#### 2. Bifurcación en el runner

`applyTenantMigrationsInOrder()` se modifica para inspeccionar `transactional` (default `true`):

```typescript
// packages/database/src/migrations/tenant/runner.ts

async function applyTenantMigrationsInOrder(
  dataSource: DataSource,
): Promise<Set<string>> {
  const queryRunner = dataSource.createQueryRunner();
  const appliedNames = await getAppliedTenantMigrationNames(queryRunner);

  for (const MigrationClass of TENANT_MIGRATIONS) {
    const migration = new MigrationClass();
    const migrationName = (migration as any).name ?? MigrationClass.name;

    if (appliedNames.has(migrationName)) continue;

    const transactional = (migration as any).transactional ?? true;

    if (transactional) {
      // Camino existente: DDL + bookkeeping en una transacción
      await queryRunner.startTransaction();
      try {
        await migration.up(queryRunner);
        await queryRunner.query(
          `INSERT INTO "typeorm_migrations" ("timestamp", "name") VALUES ($1, $2)`,
          [extractMigrationTimestamp(migrationName), migrationName],
        );
        await queryRunner.commitTransaction();
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      }
    } else {
      // Nuevo camino: DDL fuera de transacción, bookkeeping en transacción aparte
      await migration.up(queryRunner);
      await queryRunner.startTransaction();
      try {
        await queryRunner.query(
          `INSERT INTO "typeorm_migrations" ("timestamp", "name") VALUES ($1, $2)`,
          [extractMigrationTimestamp(migrationName), migrationName],
        );
        await queryRunner.commitTransaction();
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      }
    }

    appliedNames.add(migrationName);
  }

  return appliedNames;
}
```

#### 3. Contrato de `down()` no transaccional

Una migración con `transactional = false` **no garantiza atomicidad entre DDL y bookkeeping**. Si el `up()` tiene éxito pero falla el `INSERT` de bookkeeping, la migración se reintentará en la próxima ejecución — y el `CREATE INDEX CONCURRENTLY IF NOT EXISTS` la hará idempotente. El `down()` debe ser igual de idempotente (`DROP INDEX CONCURRENTLY IF EXISTS`).

La reversión (`revert.ts`) aplica la misma bifurcación: si `transactional === false`, `down()` se ejecuta fuera de la transacción que envuelve el `DELETE` de bookkeeping.

#### 4. Responsabilidad del autor de la migración

Una migración con `transactional = false` traslada la responsabilidad de atomicidad del runner al autor:

- **Idempotencia obligatoria:** `up()` y `down()` deben usar `IF NOT EXISTS` / `IF EXISTS`.
- **Sin DML:** no se permite mezclar DDL no transaccional con DML (inserciones, actualizaciones) en la misma migración. Si se necesita DML + índices, se separan en dos migraciones: una transaccional para el DML y otra no transaccional para los índices.
- **Rollback parcial:** si `down()` lanza excepción, el bookkeeping ya se eliminó y el estado del schema es desconocido. Se documenta en el mensaje de error.

---

## Consecuencias

### Positivas

- Desbloquea la Ola 2 de ADR-065 — la migración `089_*` de índices puede escribirse y aplicarse sin ventana de mantenimiento.
- Habilita cualquier migración futura que necesite `CREATE INDEX CONCURRENTLY`, `REINDEX CONCURRENTLY` u otra DDL no transaccional de PostgreSQL.
- El runner mantiene su comportamiento por defecto (transaccional) para las 86 migraciones existentes y todas las futuras que no declaren `transactional = false`.
- La bifurcación es mínima (dos ramas de ~10 líneas cada una) y no reestructura el runner.

### Negativas

- **Rompe la garantía de atomicidad** para migraciones no transaccionales. El autor de la migración asume la responsabilidad de idempotencia.
- **Complejidad adicional en el contrato de migración:** dos caminos de ejecución, dos conjuntos de reglas.
- **El revert de una migración no transaccional no es completamente reversible:** si `down()` falla a mitad, el estado es desconocido y requiere intervención manual.
- **No hay tipo TypeScript para `transactional`:** se accede con `(migration as any).transactional` porque `MigrationInterface` de TypeORM no tiene esa propiedad. Si TypeORM añade un campo similar en el futuro, se migra a la API nativa.

### Mitigaciones

- La regla "sin DML en migraciones no transaccionales" se documenta en `database.instructions.md` y se verifica en review.
- El mensaje de error del runner cuando una migración no transaccional falla incluye el nombre de la migración y la instrucción de verificar el estado del schema manualmente.
- La migración `089_*` se prueba en un tenant de staging con volumen representativo antes de producción.

---

## Criterio de aceptación

- [x] CTO aprueba el ADR — **2026-07-24**.
- [x] `runner.ts` modificado con la bifurcación condicional; los 86 caminos existentes no se alteran.
- [x] `revert.ts` modificado con la misma bifurcación.
- [x] `database.instructions.md` documenta el flag `transactional` y las reglas para migraciones no transaccionales.
- [ ] Migración de índices CONCURRENTLY (`089_pagination_ordering_indexes`; 087 = hash schema, 088 = backfill hash) con `transactional = false`, `CONCURRENTLY IF NOT EXISTS`, y `down()` con `DROP INDEX CONCURRENTLY IF EXISTS`.
- [ ] `pnpm db:migrate:all` exitoso en un tenant de staging con >500K filas en `stock_movements` y `audit_logs`.
- [ ] `pnpm db:migrate:revert` de la migración CONCURRENTLY (`088+`) exitoso en el mismo tenant.

---

## Escalación al CTO — RESUELTA

**[ESCALACIÓN AL CTO]**
**Prioridad:** Alta — bloquea la Ola 2 de ADR-065 (índices de paginación)
**Resolución:** Aprobado por el CTO el 2026-07-24. La Ola 2 queda desbloqueada. Implementación delegada a AI-SR-FULL.
