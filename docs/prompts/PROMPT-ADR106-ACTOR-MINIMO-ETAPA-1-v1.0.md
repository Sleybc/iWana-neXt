# PROMPT — ADR-106 · Etapa 1: actor mínimo en los tres puertos

**Versión:** 1.0
**Estado:** G0 aprobado el 2026-11-08 (ADR-106). Listo para lanzar
**Fecha:** 2026-11-08
**Emitido por:** AI-EM-ARCH
**Decisión:** [ADR-106](../adrs/ADR-106-Actor-Minimo-en-Puertos-y-Servicios.md) v1.0
**Plan:** [2026-11-08-adr106-actor-minimo-etapa-1-orquestacion.md](../plans/2026-11-08-adr106-actor-minimo-etapa-1-orquestacion.md)

Reglas de todos los bloques:
- Trabajo en `main`, sin ramas, sin stash y sin commit.
- Cero PII.
- `[BLOQUEO]` con archivo:línea si el código contradice ADR-106. No sintetizar una solución intermedia.
- Integración contra un PostgreSQL y un Redis propios y desechables, aprovisionados como en CI, con `DB_NAME=test`. Nunca `tenant_iwana` ni `dbiw`.
- No tocar archivos de `modules/privacy`, `modules/billing`, `modules/crm` ni `cli/`. Hay trabajo de H-EXP sin commitear ahí.

---

## §B1 — `sr-backend`

**Objetivo:** que los tres puertos de ADR-106 dejen de depender de `JwtPayload` y de `auth`, sin cambiar comportamiento.

**Antes de empezar:** toma la línea base de `@iwana/api` (unitaria + integración) sin caché de Turbo, con conteo de suites, tests y omitidas (skill `iwana-test-evidence`).

**Orden obligatorio:**

1. **D2.** Crea `apps/api/src/common/actor/actor-ref.ts` con `ActorRef { readonly sub: string }` y `ActorRefWithRole extends ActorRef { readonly role: string }`, tal como están en ADR-106 §2. No importes nada de `auth`. No añadas otros campos.
2. **`InventoryMovementPort` (D1 + D4).**
   - Las firmas de `inventory-movement.port.ts:30,48` pasan a `ActorRef`.
   - Mueve `InventoryMovementPortAdapter` a su propio archivo (`inventory/ports/inventory-movement.port.adapter.ts` o `inventory/adapters/`; elige uno y justifícalo) y actualiza `inventory.module.ts`.
   - El archivo del puerto queda sin imports de `services/` ni de `auth/`.
   - Reemplaza los cuatro `Pick<JwtPayload, 'sub'>` de `stock-ledger.service.ts` (272, 727, 743, 927) por `ActorRef`.
   - Ajusta `execution-order-inventory.service.ts` solo en lo que exija el tipo.
3. **`ExecutionOrderSchedulingPort` (D1 + D4).**
   - Las cuatro firmas pasan a `ActorRef`.
   - Mueve `CreateExecutionOrderFromSchedulingInput` desde `execution-orders.service.ts:299` a `tasks/ports/` y haz que el servicio lo importe de ahí, no al revés.
   - **Tipa también como `ActorRef` los cuatro métodos de `ExecutionOrdersService` que implementan el puerto (~1198–1644) y recorre los helpers que reciben ese `actor`.** Si un helper lee `role`, usa `ActorRefWithRole` en esa cadena y anótalo en el informe. Motivo: la sintaxis de método es bivariante, así que la clase compilaría con `JwtPayload` aunque el puerto diga `ActorRef`, y un llamador con `{ sub }` llegaría con `role` indefinido sin error.
4. **`WfmOrganizationSitesReadPort` (D1 + D3).**
   - `listDispatchSites(actor)` pasa a `listDispatchSites()`.
   - El adaptador obtiene el tenant de `TenantContext.getOrThrow()`.
   - `wfm.controller.ts:93,106` deja de pasar `user`.
   - El 400 «No fue posible resolver el tenant autenticado» desaparece: `getOrThrow` cubre ese caso y organization sigue validando `TENANT_CONTEXT_MISMATCH`. Si alguna spec HTTP asertaba ese 400, repórtalo para `test-change-reviewer`. No lo reemplaces por otro código de error.
5. **D5.** En `eslint.config.js` (raíz), añade un bloque `files: ['apps/api/src/**/ports/**/*.ts']` con `no-restricted-imports`. La regla prohíbe los patrones `**/auth/interfaces/jwt-payload.interface` y `**/services/**`, con un mensaje que cite ADR-106. Debe pasar sin excepciones sobre el árbol resultante.
6. **Specs.** Toca solo las que dejen de compilar. Los fixtures `JwtPayload` completos que siguen compilando se quedan como están: el tipo es estructural.

**No hagas:**
- No migres otros servicios (eso es la etapa 2).
- No cambies `@CurrentUser`, `@Roles`, `@Permissions`, `JwtPayload` ni `TenantContext`.
- No añadas `tenantId` a `ActorRef`.
- No uses `eslint-disable`.
- No toques `packages/shared` ni las colas. El processor de inventario ya pasa `{ sub }` y debe seguir compilando sin cambios.

**Cierre (G2):**
- `tsc` de `@iwana/api`.
- Lint de la raíz.
- Suite **completa** de `@iwana/api`, unitaria e integración, sin caché, con conteo no inferior a la línea base y omitidas frente a `integration-expected-skips.json`. Es suite completa porque cambian providers de `@Module`.
- Prettier sobre lo tocado.

**Informe:**
- Archivos tocados.
- Destino elegido para el adaptador.
- Métodos que necesitaron `ActorRefWithRole`, con archivo:línea.
- Specs modificadas, con su motivo.
- Línea base frente al cierre.
- Salida de `grep -rn "jwt-payload.interface" apps/api/src --include=*.ts | grep /ports/`, que debe quedar vacía.

En `main`, sin commit. No edites el plan, el ADR ni registres gates.

---

## §B2 — `sr-qa`

**Objetivo:** demostrar que B1 no cambió comportamiento y que la regla ESLint muerde.

**No cambies código de producción.** Si una prueba falla por el código, `[BLOQUEO]` con archivo:línea.

1. **Matriz MOD11↔MOD12** (skill `iwana-matriz-motivos`).
   - Cada código de `INVENTORY_CONSUMPTION_REJECTION_REASON_CODES` → su `*.integration.spec.ts`, contra Postgres y Redis reales.
   - Tabla motivo → spec → resultado, con conteo.
   - Una spec omitida por falta de servicios cuenta como fallo, no como verde.
2. **Regresión.** Corre las specs de §2 del plan: `inventory-movement.port.spec.ts`, `execution-order-inventory.service.spec.ts`, `execution-orders.*` y las de `wfm`. Incluye `wfm.tenant-isolation.spec.ts` y `wfm-organization-sites.controller.http.spec.ts`.
3. **D3 en integración.** Con dos tenants aprovisionados, `GET` de sitios de despacho con el token del tenant A y `TenantContext` del A devuelve solo sitios del A. Si ya existe una prueba equivalente, cítala en lugar de duplicarla.
4. **Rojo sembrado de D5, sin crear archivos en el árbol.** Usa `pnpm exec eslint --stdin --stdin-filename apps/api/src/modules/tasks/ports/__seed__.port.ts` con:
   - un import de `jwt-payload.interface` → debe fallar;
   - un import de `../services/x` → debe fallar;
   - un import de `common/actor/actor-ref` → debe pasar.

   Guarda las tres salidas.
5. **Camino no HTTP.** Muestra con una prueba existente o nueva que `ExecutionOrderInventoryService` (o el processor de inventario) llama al puerto con un `ActorRef` de solo `sub` y el movimiento queda auditado con ese `sub`.

**Cierre (G3):**
- Matriz completa en verde con conteo.
- Las tres salidas de ESLint.
- Suites de §2 sin caché.
- Lint y Prettier de lo tocado.

---

## §B3 — Revisiones, solo lectura

- **`boundary-reviewer`:** diff completo contra ADR-106 D1–D5.
  - ¿Quedó algún `JwtPayload` en `**/ports/**` o en los métodos que implementan esos puertos?
  - ¿Algún puerto importa de `services/`?
  - ¿Algún adaptador lee el tenant del actor?
- **`test-change-reviewer`:** cada spec cuyo fixture o expectativa cambió en B1 o B2, junto con el cambio de producción que lo motivó. Especial atención al 400 retirado del adaptador WFM.
- **`gate-verifier`:** «Gates Before Merge» sobre `@iwana/api` completo, sin caché, con conteo real frente a la línea base de B1.
