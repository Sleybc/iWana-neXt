---
name: iwana-tenant-migration
description: Crea la siguiente migracion de schema tenant de iWana neXt (packages/database/src/migrations/tenant/NNN_snake_case.ts) con up/down simetricos, la registra en runner.ts y la verifica contra migration-order.spec.ts. Usar al añadir o cambiar tablas, columnas, indices o restricciones de los schemas tenant. Complementa a database-migration, que es generica; no aplica a migraciones del schema public.
disable-model-invocation: true
metadata:
  category: backend
  triggers: migracion tenant, schema tenant, nueva columna, nueva tabla, indice, runner.ts, TENANT_MIGRATIONS, down reversible
---

# Migracion tenant de iWana neXt

Las migraciones tenant se escriben a mano: no existe `migration:generate`. El runner recorre
`TENANT_MIGRATIONS` **en orden de array** sobre cada schema tenant activo, y una migracion que
nadie añade al array no se aplica nunca, en silencio.

## Pasos

1. **Numero.** Toma el siguiente al mayor `NNN_` del directorio, calculado en el momento
   (no lo copies de un documento: otra ola puede haber agregado migraciones).

   ```bash
   ls packages/database/src/migrations/tenant | grep -E '^[0-9]{3}_' | sort | tail -1
   ```

2. **Archivo.** `NNN_<verbo>_<objeto>.ts` en snake_case (ej. `140_add_stock_issue_reason.ts`).
   Clase en PascalCase terminada en digitos, con `name` igual a la clase:

   ```ts
   import { MigrationInterface, QueryRunner } from 'typeorm';

   /**
    * Migracion 140: <que cambia y por que, en una linea>.
    */
   export class AddStockIssueReason1400000000000 implements MigrationInterface {
     name = 'AddStockIssueReason1400000000000';

     public async up(queryRunner: QueryRunner): Promise<void> {
       await queryRunner.query(`ALTER TABLE stock_issues ADD COLUMN reason TEXT`);
     }

     public async down(queryRunner: QueryRunner): Promise<void> {
       await queryRunner.query(`ALTER TABLE stock_issues DROP COLUMN IF EXISTS reason`);
     }
   }
   ```

3. **SQL sin schema calificado.** El runner fija el `search_path` del tenant. Nunca escribir
   un nombre de schema o tenant, nunca `synchronize`.

4. **`down()` reversible.** Deshace exactamente `up()`. Si el `down()` destruye datos, sigue el
   patron de guarda `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN` de `000_initial_tenant_schema.ts` y
   documenta el backfill y su reversion en el JSDoc.

5. **DDL fuera de transaccion.** Solo cuando haga falta (`CREATE INDEX CONCURRENTLY`), declara
   `transactional = false` segun ADR-066 y agrega su spec, como `130_execution_orders_list_ordering`.

6. **Registro.** En `runner.ts`: el `import` junto a los demas y la clase **al final** de
   `TENANT_MIGRATIONS`. El hook `tenant-migration-gate` de Claude Code avisa si falta alguno
   de los dos o el `down()`.

## Verificacion

```bash
pnpm --filter @iwana/db exec jest src/migrations/tenant/migration-order.spec.ts
pnpm --filter @iwana/db typecheck
pnpm --filter @iwana/db build
pnpm --filter @iwana/db migration:tenant:run
```

- `migration-order.spec.ts` comprueba que el archivo este en el array, en orden y sin nombres duplicados.
- Prueba la reversion sobre **un** schema con `pnpm --filter @iwana/db migration:tenant:revert`
  (el revert nunca itera tenants: el schema es argumento obligatorio).
- Si el `down()` toca datos, agrega una spec de integracion siguiendo
  `r2_4_down.integration.spec.ts` (schemas aislados, `IWANA_DB_INTEGRATION_AVAILABLE=true`).

## Cierre

Registra la migracion (numero, objetivo, reversibilidad, evidencia de los comandos) en el
INFORME de la fase. El gate «Migrations reversible» de `AGENTS.md` no se da por cumplido sin
esa evidencia.
