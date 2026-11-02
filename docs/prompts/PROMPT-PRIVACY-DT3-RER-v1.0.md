# PROMPT — `privacy` · DT-3 «R-ER»: mutaciones sobre titulares anonimizados

**Versión:** 1.0, con secciones añadidas: B1-R, B1-RR (anulada), B3-R, B1-F, B3-R2 y B1-G
**Estado:** En ejecución dentro de la consolidación conjunta con MOD05 (opción A). B1 a B4 cerrados, salvo B1-G
**Fecha:** 2026-11-01
**Emitido por:** AI-EM-ARCH
**Plantilla base:** [`TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)
**Spec (contrato congelado):** [`docs/specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md`](../specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md) **v1.2**. Las secciones anteriores a B1-F citan v1.0 o v1.1; manda la v1.2
**Plan:** [`docs/plans/2026-11-01-privacy-dt3-rer-orquestacion.md`](../plans/2026-11-01-privacy-dt3-rer-orquestacion.md) · **Launcher vigente:** [`PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.7.md`](PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.7.md)

## Reglas comunes a todos los bloques

- Leer antes de actuar: `AGENTS.md`, `.github/copilot-instructions.md`, la spec DT-3 completa, [HLD Privacy v1.1](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.1.md) §2, §6.6 y §6.7, y las skills de tu fila en el plan (Claude Code **lee** el `SKILL.md`; no lo invoca como herramienta).
- Se trabaja en `main`, sin ramas ni worktrees. **No commitear.** Solo editar las rutas de tu bloque.
- La spec manda. Si el código contradice una premisa de la spec (línea, firma, orden de bloqueos), parar con `[BLOQUEO]` y reportarlo con `archivo:línea`. No sintetizar una solución intermedia.
- Cero PII en código, pruebas, logs y documentos. Las pruebas usan datos sintéticos.
- Toda evidencia de pruebas lleva conteo real de suites y tests, sin caché de Turbo y con 0 omitidas en las suites PG (skill `iwana-test-evidence`).
- No ajustar una prueba existente para que pase. Si una prueba previa queda roja, se reporta; lo revisa `test-change-reviewer`.

---

## B1 · `sr-backend` · Escritores CRM (D-RER-1, 2 y 3)

**Rutas:** `apps/api/src/modules/crm/contracts/**`, `crm/subscribers/**`, `crm/expedientes/**`, `crm/privacy-adapters/crm-contract-impersonation.adapter.ts`, `crm/tests/crm-blocked-mutations.arch.spec.ts`. **No tocar** `crm/privacy-adapters/titular-erasure/**`, `crm-contract-standing-read.adapter.ts`, `privacy/**` ni `packages/database/**` (son de B2).

1. Constructor único `titularAnonymizedConflict()` → 409 `{ code: 'PRIVACY_TITULAR_ANONYMIZED', message }` (texto en spec D-RER-1).
2. Las tres guardas (`ContractsService.assertSubscriberNotBlocked`, `SubscribersBlockedTitularGuard`, `ExpedientesBlockedTitularGuard`) rechazan con ese código cuando `anonymizedAt != null`, antes de mirar marcas. Se mantiene `PRIVACY_DATA_BLOCKED` para los bloqueados.
3. Decorador de guarda en las tres escrituras tributarias sin él (`subscriber-tax.controller.ts:74-132`). Ampliar `crm-blocked-mutations.arch.spec.ts` a ese controller.
4. **Comprobación bajo bloqueo en cada escritor** (D-RER-3): orden `expediente_records → subscribers → contracts`; relectura de `anonymized_at` dentro de la transacción; nada de `save` sobre entidades cargadas antes del bloqueo. Inventariar **todos** los escritores de las tres tablas en `crm` (servicios, ciclo de vida, cambio de plan, punto de servicio, estrato, impersonation) y entregar la lista con `archivo:línea` y cómo quedó cada uno.
5. `archive` sobre titular anonimizado: `UPDATE` explícito de `status`, `status_reason_code`, `status_changed_at` y `updated_at` (D-RER-2). Todo otro `_transition` sobre anonimizado → 409; si aparece un contrato abierto, log sin PII (solo ids) y 409.
6. Orden de errores de D-RER-3 punto 4.
7. Pruebas unitarias y HTTP de CA-RER-02 (matriz por reflexión, incluida la creación con `body.subscriberId`). Cobertura ≥80 % en los servicios tocados sin bajar su línea base.

**Entrega:** inventario de escritores, diff por archivo, conteo de pruebas.

---

## B2 · `sr-backend` (segunda instancia) · Supresión, puerto y base de datos (D-RER-4, 5 y 6)

**Rutas:** `crm/privacy-adapters/titular-erasure/**`, `crm/privacy-adapters/crm-personal-data-erasure.adapter.ts`, `crm/privacy-adapters/crm-contract-standing-read.adapter.ts`, `privacy/requests/ports/contract-standing-read.port.ts`, `privacy/requests/requests.service.ts` (solo la evaluación del deber de conservación en `resolve`), `apps/api/src/cli/anonymize-titular.ts`, el filtro de errores de la API, `packages/database/src/migrations/tenant/**` (migración nueva y `runner.ts`). **No tocar** las rutas de B1.

1. D-RER-5: `anonymizeConfiguredTable` y `markAnonymizedRows` avanzan `updated_at` con la expresión `GREATEST(...)` de la spec; sin avance si la fila no cambia.
2. D-RER-4: `IContractStandingReadPort.standing(partyId, ctx: { manager })`; `resolve` lo evalúa después de `port.plan`, dentro de la transacción; si aplica, aborta sin anonimizar.
3. D-RER-6: migración tenant con el siguiente número libre (verificar `runner.ts`; 167 y 168 son del clúster), función y triggers en `subscribers`, `expediente_records` y `contracts`, excepción de archivo, paso por `iwana.titular_erasure` fijado con `set_config(..., true)` solo en el adaptador de supresión y en el CLI. `down` reversible. Leer la skill `iwana-tenant-migration`; el hook de migraciones exige que quede registrada y reversible.
4. Traducir `SQLSTATE 55000` con `HINT = 'PRIVACY_TITULAR_ANONYMIZED'` a 409 en el filtro de errores; nunca 500.
5. `--verify-only` en el CLI (spec §7): solo lectura, salida sin PII (ids y conteos).
6. Pruebas: `*.integration.spec.ts` de la migración (`up → down → up`, CA-RER-08) y de CA-RER-06 y CA-RER-07.

**Entrega:** número de migración, diff, conteo de pruebas PG con `DB_NAME=dbiw`.

---

## B3 · `sr-qa` · Suite de concurrencia contra Postgres real (tras B1 y B2)

Eres verificador **y autor de pruebas**: escribe pruebas y fixtures; nunca código de producto.

**Ruta:** `apps/api/src/modules/crm/tests/titular-anonymized-concurrency.postgres.integration.spec.ts` (nueva) y fixtures propios.

1. Schema creado por la cadena de migraciones (patrón `subscriber-enum-parity`), adaptadores reales, sin dobles de puertos entre módulos.
2. Dos conexiones reales para CA-RER-04, CA-RER-05 (PATCH de alias **y** archive), CA-RER-09 y CA-RER-10 (20 iteraciones, 0 `40P01`). Coordinar el orden con bloqueos explícitos (`pg_advisory_lock` o una transacción retenida), no con `setTimeout`.
3. CA-RER-01 y CA-RER-03 por HTTP con el titular suprimido por `resolve` real.
4. CA-RER-12: correr sin ajustes las suites de bloqueo de Fase 1b y la E2E de supresión.

**Entrega:** tabla CA → archivo:línea → PASS/FAIL, con conteo real y 0 omitidas.

---

## B1-R · `sr-backend` · Remediación de B1 (añadido el 2026-11-01, tras la Ola 1)

**Estado de partida:** B1 entregó en rojo (9 suites: 4 PASS y 5 FAIL; 335/419 tests, 84 fallidos, 0 omitidos; la suite HTTP nueva, 11/11). B2 entregó en verde: migración 169 registrada; 3 suites PG y 13 tests, más la de identidad 17/17. **No re-despachar B2.** Contrato: spec **v1.1**.

**Rutas:** las de §B1 más `crm/responsibilities/**`.

1. **Clasificar antes de tocar cada prueba roja.** Para cada test fallido, una fila: `archivo:línea` · causa · categoría:
   - (a) el doble no modela la lectura bajo bloqueo; la expectativa funcional no cambia;
   - (b) la expectativa contradice una regla explícita de la spec, citada (D-RER-n);
   - (c) regresión de producto.

   Solo (a) y (b) autorizan a editar la prueba. En (a) se cambia el doble, nunca la aserción. Ante (c) se corrige el producto. Si una prueba no encaja en ninguna, va como `[BLOQUEO]`.
2. `ResponsibilitiesService`: spec v1.1 §5, fila D-RER-3 (v1.1), con prueba unitaria y prueba PG de 409 sobre un expediente anonimizado.
3. Correr las suites completas de `@iwana/api` y de `@iwana/db` sin caché (`--force`). Las específicas no bastan: cambia un `@Module` (puerto `standing`). Incluir las unitarias de `privacy/requests`, que tocó B2.

**Entrega:** tabla de clasificación, diff y conteo real de la suite completa. La tabla la revisa `test-change-reviewer` **antes** de la Ola 2.

---

## B1-RR · `sr-backend` · Reponer los hunks perdidos (añadido el 2026-11-01, tras la Ola 2)

**Contexto:** a las 08:22:06 cinco archivos volvieron al contenido del clúster sin DT-3 (plan, «Estado tras la Ola 2»). Antes de editar, comprobar con `git diff --stat` y la hora de modificación que siguen igual. Si cambiaron de nuevo, parar con `[BLOQUEO]`: hay otra sesión escribiendo.

**Rutas:** solo `runner.ts`, `subscriber-tax.controller.ts`, `subscriber-tax-profile.service.ts`, `subscriber-lifecycle.service.ts` y `crm-contract-impersonation.adapter.ts`. Conservar íntegros los hunks del clúster en esos archivos.

1. Reponer cada cambio desde la spec v1.1 (§4 y §5) y el [informe B1-R](../informes/INFORME-PRIVACY-DT3-B1R-v1.0.md), no de memoria: registro de la 169 en `runner.ts`, decorador de guarda en las tres escrituras tributarias y comprobación bajo bloqueo (orden de D-RER-3) en perfil tributario, ciclo de vida e impersonation.
2. No tocar pruebas: las de B1-R ya esperan este comportamiento. Si alguna falla, es la reposición la que está mal.
3. Suite completa de `@iwana/api` y `@iwana/db` con `--force`, más la 169 por la cadena de migraciones.

**Entrega:** diff de los cinco archivos y conteo real.

## B3-R · `sr-qa` · Fixture E2E y cobertura de escritores (en paralelo con B1-RR)

Eres autor de pruebas: escribe pruebas y fixtures, nunca código de producto. **Rutas:** `e2e/tests/portal-privacy-fase-1b-live.spec.ts` y la suite de concurrencia de B3.

1. Fixture E2E (`:571`): asignar un ciclo de facturación activo antes de activar. Es categoría (b): la regla es «ciclo obligatorio al activar» de la spec de ciclo v1.1. Las aserciones de privacidad no cambian.
2. En la suite de concurrencia, un caso PG por escritor que B3 no cubrió (perfil tributario, ciclo de vida, impersonation): sobre un titular anonimizado, 409 y fila intacta.
3. Fixture de la 169: quitar la aplicación manual y migrar por la cadena.

Después de B1-RR y B3-R se repite B3 completo (CA-RER-01 a 10 y 12).

---

## B1-F · `sr-backend` · Guarda HTTP del archivo permitido (añadido el 2026-11-01, tras repetir B3)

**Contexto:** CA-RER-03 da 409 donde se espera 200 porque `POST crm/contracts/:id/archive` (`contracts.controller.ts:759`) lleva `GuardBlockedTitular('params.id')` y la guarda rechaza al anonimizado antes de llegar al servicio. Contrato: spec **v1.2**, §5, fila «D-RER-2 (v1.2), guarda HTTP».

**Rutas:** `crm/contracts/guards/**`, `crm/contracts/contracts.controller.ts`, `crm/tests/crm-blocked-mutations.arch.spec.ts` y **`crm/contracts/contracts.service.ts`**. Este último es uno de los 9 archivos congelados de C4a-R: se edita solo para añadir la opción `allowAnonymized` a `assertContractNotBlocked`, con el `[BLOQUEO]` ya avisado a la sesión del clúster. No tocar los otros 8.

1. Opción `{ allowAnonymized: true }` en el decorador de contratos, usada solo en la ruta de archivo. La guarda sigue rechazando `DATOS_BLOQUEADOS`.
2. El test de arquitectura exige que `allowAnonymized` aparezca en exactamente una ruta: el archivo.
3. Prueba HTTP: archivar un contrato `TERMINATED` de un titular anonimizado da 200; con titular bloqueado, 409 `PRIVACY_DATA_BLOCKED`; cualquier otra transición sobre un anonimizado, 409 `PRIVACY_TITULAR_ANONYMIZED`.
4. Suite completa de `@iwana/api` con `--force`.

**Condiciones de la sesión del clúster (autorización del 2026-11-01):**
- **Alcance cerrado:** solo `{ allowAnonymized: true }` en `POST crm/contracts/:id/archive` y la opción correspondiente en `assertContractNotBlocked`. Una prueba HTTP demuestra que `PATCH /crm/contracts/:id` sigue dando 409 `PRIVACY_TITULAR_ANONYMIZED` para un titular anonimizado.
- **Hashes:** SHA-256 de `contracts.service.ts` y de `contracts.controller.ts` antes de editar y al terminar. Van en §B1-F de `docs/informes/INFORME-PRIVACY-DT3-B1R-v1.0.md` (se edita, no se sobrescribe) y en una línea al final de `docs/informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`, que dice que, para C4d y C4e, el hash de referencia de `contracts.service.ts` es el nuevo y ya no el de `mixed/`.

**Entrega:** diff, hunk de `contracts.service.ts` aislado, los cuatro hashes y conteo real.

## B3-R2 · `sr-qa` · Ajustes de aceptación (en paralelo con B1-F)

Escribe pruebas y fixtures; nunca código de producto.

1. CA-RER-05 (`titular-anonymized-concurrency…:923`): la expectativa pasa de `[409, 409]` a `[409, 200]` y se compara cada columna redactada con su valor posterior a la supresión. Es categoría (b), por la spec v1.2, CA-RER-05.
2. `e2e/tests/portal-privacy-live.spec.ts:245`: el fixture elige un ciclo activo antes de activar. Categoría (b), por la regla «ciclo obligatorio al activar» de la spec de ciclo v1.1; las aserciones no cambian.
3. Identificar la suite que rechazó `DB_NAME=dbiw` y correrla con la base que exige (`test` o `iwana_it_*`). Si pertenece a DT-3, debe terminar con 0 omitidas; si no, se registra su ruta para C4d. En los dos casos, documentar la ruta de la suite, la base exigida, el comando o script que la crea y el comando exacto para correrla, para que C4d no la deje en `NOT_EXECUTED` sin causa.
4. Antes de B4, los dos puntos para C4d (este y el fixture del punto 2) quedan cerrados, o clasificados con su causa.

Luego, `test-change-reviewer` revisa B3-R2 y `sr-qa` repite §B3 completo.

---

## B1-G · `sr-backend` · Orden de errores en la creación de contratos (P2 de B4)

**Contexto:** `sec-eng` (B4) encontró que `create` y la conversión desde expediente llaman a `assertActiveBillingCycle` (`contracts.service.ts:155` y `:255`) antes de `lockSubscriberForContractCreation`. En una carrera con la supresión, eso responde 422 `BILLING_CYCLE_INVALID` en lugar de 409 `PRIVACY_TITULAR_ANONYMIZED`, contra D-RER-3 punto 4 de la spec v1.2.

**Ruta:** solo `contracts.service.ts`, archivo congelado; esta edición está autorizada por esta sección, que se avisa a la sesión del clúster. Además, su spec unitaria o la suite de concurrencia, si hace falta una prueba nueva.

1. En las dos creaciones, mover `assertActiveBillingCycle` para que vaya **después** del bloqueo del suscriptor y de la comprobación de anonimizado. Nada más cambia.
2. Prueba: crear un contrato con `billingCycleDay` inválido para un titular anonimizado responde 409 `PRIVACY_TITULAR_ANONYMIZED`, no 422. Con un titular normal, el mismo ciclo inválido sigue dando 422.
3. SHA-256 de `contracts.service.ts` antes y después: se registra en el informe DT-3 (§B1-G) y en una línea nueva al final del informe de consolidación, que reemplaza a la referencia de B1-F.
4. Suite completa de `@iwana/api` con `--force`; `test-change-reviewer` revisa la prueba nueva.

**Condiciones de la sesión del clúster (autorización del 2026-11-01).** `assertActiveBillingCycle` pertenece al clúster (D, ADR-102):
- Solo se mueven las dos llamadas, dentro de la misma transacción. No cambian su lógica ni sus códigos.
- Precedencia, con una prueba por caso:
  - titular sano con ciclo inválido: 422 `BILLING_CYCLE_INVALID`;
  - titular sano con ciclo ausente donde es obligatorio: 422 `BILLING_CYCLE_REQUIRED`;
  - titular anonimizado: 409 `PRIVACY_TITULAR_ANONYMIZED`, aunque el ciclo sea inválido.
- No regresión: `contracts.service.spec.ts`, `billing-cycles.*` y las integraciones de contratos y de ciclo de vida pasan con conteo real y 0 omitidas. Si cambia una expectativa de D, la revisa `test-change-reviewer` antes de C4d.

---

## B3-H · `sr-qa` · Integraciones del clúster rotas por DT-3 (añadido el 2026-11-01, tras B1-G)

Escribe pruebas y fixtures; nunca código de producto. Clasificación de AI-EM-ARCH. Las tres pruebas son del clúster, así que se aplica cuando su sesión dé el visto bueno.

**Causa común:** B1 y B1-R declararon la suite completa en verde, pero las integraciones PG del clúster están detrás de guardas opt-in y no se corrieron. Solo B1-G las corrió.

| Prueba | Causa | Cat. | Ajuste |
| --- | --- | --- | --- |
| `subscriber-lifecycle.service.postgres.integration.spec.ts`, 10 casos | El DDL hecho a mano de `subscribers` (`:94`) no tiene `anonymized_at` ni `anonymized_request_id` (migración 150), que DT-3 lee bajo bloqueo | (a) | Añadir las dos columnas al DDL del fixture. Las aserciones no cambian. Migrar el fixture a la cadena migrada sigue siendo la deuda P3-5 del clúster |
| `contracts.service.postgres.integration.spec.ts:585-601` | Crea con `subscriberId: randomUUID()` y espera 422 de ciclo. Con B1-G, el bloqueo del suscriptor va primero: 404 antes de la validación de dominio (D-RER-3 punto 4) | (b) | Usar un suscriptor existente y sano, para que la prueba siga demostrando el 422 `BILLING_CYCLE_INVALID`. El caso inexistente se puede conservar aparte, esperando 404 |
| `contracts.service.postgres.integration.spec.ts:488-505` | Simula con un espía de `findOne` una entidad cargada antes de la transacción, con versión vieja, y espera `CONTRACT_CHANGED`. DT-3 relee la fila bajo bloqueo (D-RER-3 punto 3) y ya no usa la entidad cargada antes; la activación no recibe versión del cliente | (b) | Conservar la propiedad que protegía la prueba («no se decide con datos obsoletos»): el espía devuelve una entidad vieja que parece válida y la fila real tiene un cambio que invalida la activación (por ejemplo, `service_usage = NULL`). Se espera 422, el estado sigue en DRAFT y no hay auditoría |

**Condiciones de la sesión del clúster (visto bueno del 2026-11-01):**
1. Ciclo de vida: las dos columnas llevan el mismo tipo y la misma nulabilidad que la migración 150. No se toca ninguna aserción.
2. Contratos `:585`: además del suscriptor sano con 422, un caso explícito en el que `create` con un `subscriberId` inexistente responde 404. Así la precedencia de D-RER-3 queda fijada en una prueba.
3. Contratos `:488`:
   - el nombre o un comentario de la prueba dicen por qué cambió (D-RER-3: relectura bajo `pessimistic_write`);
   - las demás pruebas PG de `CONTRACT_CHANGED` (`contract-plan-change` y los otros casos de `contracts.service.postgres`; el código lanza ese error en `contracts.service.ts:949`, `:1536` y `:1754`) siguen en verde **sin cambios**. Si alguna necesita cambiar, se para con `[BLOQUEO]` y se consulta a la sesión del clúster.
4. Las integraciones se corren con `IWANA_DB_INTEGRATION_AVAILABLE=true`, y una suite omitida cuenta como fallo.

Después, correr **todas** las integraciones PG de G1 punto 3 (contratos, cambio de plan, ciclo de vida, 360° de cotizaciones, fecha de nacimiento y migraciones 167 y 168) y las de DT-3, con 0 omitidas. `test-change-reviewer` revisa las tres filas antes de C4d.

---

## B3-H2 · `sr-qa` · Las tres pruebas bloqueadas en B3-H (añadido el 2026-11-01)

Escribe pruebas y fixtures; nunca código de producto. Se aplica cuando la sesión del clúster dé el visto bueno; si aprueba solo algunas filas, se aplican solo esas.

| Prueba | Causa (leída en el código) | Cat. | Ajuste propuesto |
| --- | --- | --- | --- |
| `contracts.service.postgres…:636-643` | `createFromExpediente(randomUUID(), …)` espera 422. Con B1-G, el bloqueo va primero: 404 por expediente inexistente (D-RER-3 punto 4). Es el mismo caso ya aprobado para `create` (`:585`) | (b) | Igual que en `:585`: un expediente existente y sano conserva el 422 `BILLING_CYCLE_INVALID`, y se añade un caso explícito de 404 con un id inexistente |
| `subscriber-lifecycle…:262` (RF-LC-17) | Antes de DT-3, el contrato salía de un `findOne` simulado. Ahora `activate` lo relee bajo bloqueo con `qr.manager.findOne(Contract)`, que selecciona todas las columnas de la entidad, y el DDL hecho a mano de `contracts` no tiene `customer_segment` | (a) | Añadir `customer_segment` al DDL del fixture, con el tipo y la nulabilidad de su migración. Revisar que no falte ninguna otra columna que mapee la entidad `Contract`. Las aserciones no cambian |
| `contract-plan-change.postgres…:276` | La prueba coordina la carrera esperando la lectura previa de `update` (`findOne`). DT-3 eliminó esa lectura: `update` bloquea y relee (D-RER-3 punto 3), así que la espera no llega nunca. El `PATCH` no lleva versión del cliente (solo `changePlan` lleva `expectedUpdatedAt`) | (b) | Mantener la propiedad del nombre de la prueba: el `PATCH` no puede restaurar el plan anterior. Coordinar con `pg_stat_activity` (como en la suite de concurrencia), no con la lectura eliminada. Se acepta cualquiera de los dos órdenes: (i) `changePlan` confirma primero y el `PATCH` aplica el alias sobre el plan nuevo (200, plan nuevo, versión mayor); (ii) el `PATCH` confirma primero y `changePlan` responde 409 `CONTRACT_CHANGED` por su `expectedUpdatedAt`. Nunca se acepta el plan anterior con `changePlan` confirmado. **Cambio visible:** en el orden (i), el `PATCH` antes respondía 409 y ahora responde 200 |

**Visto bueno del clúster (2026-11-01): A, B y C aprobadas.** Sustituye a la columna «Ajuste propuesto» cuando difieran:
- **A:** el 422 se prueba con un expediente sano y, aparte, va un caso explícito de 404 con un expediente inexistente.
- **B:** las columnas que falten en el DDL hecho a mano (`customer_segment` y cualquier otra que mapee `Contract`) llevan el tipo y la nulabilidad exactos de su migración. El informe lista las columnas añadidas. Las aserciones de RF-LC-17 no cambian.
- **C (condicionada):** la spec y el plan E exigen que un `save` obsoleto no sobrescriba el plan nuevo, no que el `PATCH` responda 409. El 200 es un cambio visible aceptado. Condiciones:
  1. **Dos pruebas deterministas, una por orden**, no una que acepte los dos. Cada orden se fuerza con un bloqueo que controla la prueba: una transacción propia con `FOR UPDATE` liberada en el momento elegido, o `pg_stat_activity` con espera acotada y timeout explícito.
     - (i) `changePlan` primero: el `PATCH` da 200 y la fila queda con el plan nuevo, su snapshot y el alias aplicado.
     - (ii) `PATCH` primero: `changePlan` da 409 `CONTRACT_CHANGED` y la fila conserva el plan anterior con el alias, sin auditoría de cambio de plan.
  2. **Estabilidad:** las dos pruebas se corren 20 veces seguidas y se reporta 20/20. Si no se puede forzar un orden: `[BLOQUEO]` con su causa. No se acepta una prueba no determinista.
  3. El nombre o un comentario dicen que el 409 anterior venía de una ventana interna del servidor y que D-RER-3 la reemplaza por bloqueo con relectura.
- Si aparece otra prueba de `CONTRACT_CHANGED` del clúster que haga falta tocar: `[BLOQUEO]` y consulta.
- El esquema efímero no lo borra nadie de DT-3; lo decide el usuario.

Después: la misma corrida de integraciones de §B3-H, con todas las suites completas y 0 omitidas, y la revisión de `test-change-reviewer` sobre A, B y C.

**Limpieza:** queda el esquema efímero `tenant_plan_change_f0f328f25d1d4ae6a251d29566d0c800` de la corrida detenida. Borrar un esquema es una acción destructiva: la ejecuta el usuario (o `plat-ops` con su autorización), no un agente de pruebas.

---

## B4 · Verificación (tras B3)

| Agente | Encargo |
| --- | --- |
| `sec-eng` | Revisión de seguridad de D-RER-1 a 6 y CA-RER-11: ninguna ruta o escritor de §5 deja pasar una mutación; ningún `save` de entidad previa al bloqueo; sólo dos sitios fijan `iwana.titular_erasure`. Hallazgos con `archivo:línea` y severidad |
| `test-change-reviewer` | Toda spec existente modificada por B1–B3 |
| `boundary-reviewer` | `privacy` no lee tablas de CRM; el puerto conserva su dueño |
| `gate-verifier` | Gates de AGENTS.md sobre `@iwana/api` y `@iwana/db`, suite completa sin caché |

Cierre: informe `docs/informes/INFORME-PRIVACY-DT3-RER-CIERRE-v1.0.md` (verificar que la ruta esté libre) y actualización de HLD Privacy §6.7 y §10 en la versión siguiente.
