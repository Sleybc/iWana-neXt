# INFORME — MOD05 · Fase 09 · Ciclo de facturación y fecha de corte · Definición

**Versión:** 1.1 · **Fecha:** 2026-10-30 · **Autor:** AI-EM-ARCH
**Estado:** Vigente — definición aprobada (G0 2026-10-30); ejecución en curso según el plan
**Cambios:** v1.1 (2026-10-30) incorpora las actualizaciones de B1b (próximo corte calculado en el servidor, E1) y de la verificación E2E registradas en el cuerpo.
**Ruta estable:** el sufijo `v1.0` del nombre es el del alta; la versión vigente es la de esta cabecera.
**Modo:** Product Architect + Architect + Orchestrator
**Base:** `main` en `1ce4f263`
**Artefactos emitidos:** [ADR-102](../adrs/ADR-102-Ciclo-Facturacion-y-Fecha-de-Corte-por-Servicio.md) (Aprobado, 2026-10-30) · [PRD Fase 09 v1.0](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.0.md) (Aprobado, 2026-10-30) · [plan](../plans/2026-10-30-mod05-ciclo-facturacion.md) · [encargo](../prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md) · [launcher Ola 1](../prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.0.md) · Sustituidos el 2026-10-30 por la enmienda E1: [PRD v1.1](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.1.md) y [launcher v1.1](../prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.1.md) (§10)

---

## 1. Solicitud

El CTO pidió ubicar el módulo de suscriptores e incorporar la regla: al activar el servicio se ingresa la fecha de facturación (día 1 o día 15); si no hay pago, el ciclo 1 se corta el día 15 y el ciclo 15 el día 30.

## 2. Ubicación del módulo

| Pieza                     | Ruta                                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend                   | `apps/api/src/modules/crm/` — `subscribers/` y `contracts/`. El servicio es el contrato                                                        |
| Activar servicio          | `POST /crm/contracts/:id/activate` → `contracts.service.ts` `activate()` → `_transition`                                                       |
| Activación del suscriptor | Automática: cierre de OT (MOD11) → aprovisionamiento ACTIVE (MOD13) → expediente `CLIENTE_ACTIVO` → suscriptor `ACTIVE`                        |
| Portal                    | `apps/portal/src/components/crm/subscribers/` — `ServiciosTab.tsx`, `ContractCard.tsx`, `ContractDetailDrawer.tsx`, `CreateContractDialog.tsx` |
| Contratos compartidos     | `packages/shared/src/schemas/contract.schema.ts`, `lifecycle.schema.ts`                                                                        |

## 3. Hallazgos

- El ciclo de facturación existe solo como texto libre (`contracts.billing_cycle`), sin validación ni uso.
- No existen facturación, pagos, cartera ni corte automático; la suspensión es manual con motivo `MORA`.
- La Q2 de la Fase 05 («días de mora para suspender y cortar») estaba abierta; RF-BIL-06 del PRD maestro describía otro esquema (dos pasos por días de mora).
- El repositorio no contiene texto de la CRC sobre suspensión por no pago, aviso previo o reconexión.

## 4. Decisiones

| #      | Decisión                                                                       | Estado                                                |
| ------ | ------------------------------------------------------------------------------ | ----------------------------------------------------- |
| C1     | Alcance: solo ciclo y fecha de corte, dentro de MOD05                          | CTO, 2026-10-30                                       |
| C2     | Corte automático sin confirmación                                              | CTO, 2026-10-30 — adoptado como objetivo (ADR-102 D6) |
| C3     | Último día del mes si no existe el día de corte; se corta aunque sea festivo   | CTO, 2026-10-30                                       |
| D-F9-1 | Diferir el corte automático hasta señal de pago, régimen CRC y ejecutor de red | CTO, 2026-10-30 (G0)                                  |
| D-F9-2 | Contratos existentes sin ciclo: corrección manual                              | CTO, 2026-10-30 (G0)                                  |
| D-F9-3 | Agenda dentro de Suscriptores                                                  | CTO, 2026-10-30 (G0)                                  |

**Reconciliación C1 ↔ C2.** Sin registro de pagos el sistema no sabe quién pagó: un corte automático hoy suspendería a todos los servicios del ciclo. ADR-102 define el corte automático con sus tres precondiciones y esta fase entrega el ciclo, la fecha y la agenda. El corte sigue siendo la suspensión manual con motivo `MORA`.

## 5. Artefactos previos marcados

| Artefacto                        | Nota                                            |
| -------------------------------- | ----------------------------------------------- |
| PRD MOD05 Fase 05 v1.2 §9.2 Q2   | Desarrollo posterior → ADR-102                  |
| PRD maestro §5.2 RF-BIL-06       | Divergencia declarada → ADR-102                 |
| HLD-MOD05-ARQUITECTURA v2.0 §5.1 | `billingCycle` del contrato deprecado → ADR-102 |

## 6. Bloqueos y escalaciones abiertas

| Tipo              | Descripción                                                                                                                                                              | Destino                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| ~~G0~~            | ✅ Resuelto el 2026-10-30: el CTO aprobó ADR-102, el PRD Fase 09 y D-F9-1 a D-F9-3 = (a)                                                                                 | CTO                                                                                        |
| Consulta jurídica | Régimen de protección de usuarios de la CRC: aviso previo, plazo de pago oportuno y reconexión antes del corte automático — **requiere verificación con fuente oficial** | Asesoría jurídica (Q1 de la Fase 05)                                                       |
| Dependencia       | Señal «pago del periodo» por contrato                                                                                                                                    | Módulo de Facturación (no iniciado; abrirlo exige decisión del CTO por la cota de ADR-080) |

## 7. Métricas de la definición

| Campo                   | Valor                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Reescrituras de PRD/HLD | 0                                                                                   |
| Desempates emitidos     | 0                                                                                   |
| Deuda nueva             | Media: conviven `billing_cycle` (deprecado) y `billing_cycle_day` hasta Facturación |
| Latencia de gates       | G0 resuelto el mismo día de la emisión (2026-10-30)                                 |

## 8. Verificación documental

| Control                    | Resultado                                                                                                                                                                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm audit:adr-citations` | `BLOQUEANTE: 0` (antes de G0 las citas de ADR-102 llevaron el marcador `(propuesto)`; se retiraron al aprobarse el 2026-10-30)                                                                                                                                                                  |
| `docs-governance`          | 2 bloqueantes corregidos en el mismo acto: plantilla base enlazada en encargo y launcher; contrato declarado congelado **solo al aprobarse ADR-102 en G0**. Menores corregidos: rutas completas de código, firma real de `contractsApi.activate`, referencia a la fila «§7 Facturacion» del HLD |
| Menores aceptados          | Nomenclatura `CICLO-FACTURACION` en lugar de `FASE-09` en prompts e informe (precedente `CICLO-VIDA`); notas «Desarrollo posterior» en PRD Fase 05 v1.2, PRD maestro y HLD-MOD05 sin bump de versión (misma práctica que ADR-100 sobre RF-SUB-06′)                                              |
| Launcher                   | 25 líneas (techo 40); bloque idéntico a `## Lanzamiento` del plan                                                                                                                                                                                                                               |
| Skills y subagentes        | Todos existen en disco                                                                                                                                                                                                                                                                          |

## 9. Ejecución de Ola 1 · P1 + B1

**Estado:** P1 y B1 completados el 2026-10-30. La fase sigue abierta: F1 (portal), Q1 (E2E), V1–V3 y el cierre de fase están pendientes. La spec UX está en [2026-10-30-mod05-ciclo-facturacion-ux](../specs/2026-10-30-mod05-ciclo-facturacion-ux.md). B1 implementa el contrato congelado de §7 sin añadir corte automático, jobs ni colas.

### Criterios CA-CF-01 a CA-CF-09

| Criterio            | Evidencia                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| CA-CF-01            | Migración tenant 167: 1 suite / 1 test Postgres; verifica siembra `(1,15)`, `(15,30)` y `down`.                         |
| CA-CF-02 a CA-CF-04 | Integración Postgres de contratos; activa sin ciclo, con ciclo válido y rechaza ciclo inexistente o inactivo.           |
| CA-CF-05 y CA-CF-06 | Pruebas unitarias de `computeCutoffDate` y `computeNextCutoffDate`, incluidos febrero bisiesto y cruce diciembre–enero. |
| CA-CF-07            | Integración Postgres de agenda; ciclos, exclusiones por estado y `withoutCycleCount`.                                   |
| CA-CF-08            | Parcial: la fecha local se prueba con el reloj de Bogotá; falta cubrir la agenda sin `date` en esa condición.           |
| CA-CF-09            | Pruebas HTTP: 403 para catálogo y agenda sin `CRM_SUBSCRIBERS_READ`.                                                    |

### Verificación ejecutada

| Paquete / control    | Comando                                                                        | Resultado                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| API completa         | `pnpm --filter @iwana/api exec jest --runInBand --no-cache`                    | 438 suites / 5.848 tests aprobados; 4 suites / 15 tests omitidos; 0 fallos.                                   |
| Shared completo      | `pnpm --filter @iwana/shared exec jest --runInBand --no-cache`                 | 28 suites / 267 tests aprobados; 0 omitidos; 0 fallos.                                                        |
| PostgreSQL API       | Jest de integración, contratos + ciclo de vida, `E2E_TENANT_SLUG=test-s2-live` | 2 suites / 33 tests aprobados; schemas de trabajo efímeros.                                                   |
| PostgreSQL migración | Jest de integración de `167_crm_billing_cycles.integration.spec.ts`            | 1 suite / 1 test aprobado.                                                                                    |
| Orden de migraciones | Jest de `migration-order.spec.ts`                                              | 1 suite / 6 tests aprobados.                                                                                  |
| Typecheck            | `@iwana/api`, `@iwana/shared`, `@iwana/db`                                     | 3 paquetes, exit 0.                                                                                           |
| Lint                 | `@iwana/api`, `@iwana/shared`, `@iwana/db`                                     | 0 errores; API reporta 7 y DB 5 warnings preexistentes en archivos fuera de este cambio; shared sin warnings. |

Cobertura informada por archivo: `ContractsService` 81,88 % líneas y 81,44 % statements (71,1 % branches; 69,13 % functions); `BillingCyclesController` 100 % en las cuatro métricas; helper de fecha tenant 88,88 % líneas; calendario shared 85,29 % líneas; esquema shared 100 % líneas. Los nuevos handlers y cálculos tienen pruebas focalizadas.

La integración API tomó `test-s2-live` solo como plantilla DDL para schemas temporales; no escribió en el schema fuente. No se usó `tenant_iwana` y no hubo commits. `git diff --check` no detectó errores de whitespace; reportó únicamente el aviso CRLF de un PRD maestro preexistente.

## 10. Verificación de AI-EM-ARCH y enmienda E1 · 2026-10-30

AI-EM-ARCH revisó la Ola 1 en disco antes de lanzar la Ola 2:

- Los archivos de B1 existen. Los de `crm/contracts` no tenían cambios previos de otros frentes, así que todo su diff es de B1.
- Los nombres y formas de `@iwana/shared` coinciden con PRD v1.0 §7. Hay dos endurecimientos compatibles: `BillingCycleSchema` es `.strict()` y la fecha de la agenda valida días reales del calendario. V1 los confirma.
- La spec UX no tiene `[BLOQUEO]`. Pone la agenda en una página propia, por lo que `nextjs-app-router-patterns` pasa a ser obligatoria en F1.
- G3 ✅ con la evidencia de §9.

**Hueco de contrato:** el PRD asignaba al portal el cálculo del «Próximo corte» con la zona del tenant. Pero `SALES` y `AUDITOR` tienen `CRM_SUBSCRIBERS_READ` y `SALES` también tiene `CRM_EXPEDIENTES_MANAGE`, mientras que `GET /tenants/me/settings` solo admite `ADMIN`, `NOC`, `ACCOUNTANT` y `SUPPORT` (`apps/api/src/modules/tenant/tenant.controller.ts:214`). Un vendedor no habría podido ver su fecha de corte.

**Enmienda E1 (CTO, 2026-10-30):** `GET /crm/billing-cycles` devuelve `BillingCycleOption[]` con `nextCutoffDate` calculado en el servidor. Queda en [PRD v1.1](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.1.md) como RF-CF-20 y CA-CF-13, en el bloque B1b del encargo y en el [launcher v1.1](../prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.1.md) (Ola 2: B1b ∥ F1). Se descartó ampliar `@Roles` de `tenants/me/settings`, porque abría a esos roles la lectura de otro módulo sin necesidad.

**Deuda registrada:** la cobertura de `ContractsService` queda en 71,1 % de ramas y 69,13 % de funciones. Las líneas (81,88 %) cumplen el umbral de `AGENTS.md`. V3 la mide antes y después del cambio.

## 11. Ejecución de Ola 2 · B1b + F1 · 2026-10-30

**Estado:** B1b y F1 completados. La fase sigue abierta para Q1 (E2E), V1 (deriva de contrato), V2 (boundaries), V3 (gates) y el cierre. El contrato congelado del PRD Fase 09 v1.1 no cambió.

- **CA-CF-13:** el catálogo devuelve `BillingCycleOption[]` con `nextCutoffDate` calculado en API con `computeNextCutoffDate` y `getTenantLocalDate` según la zona horaria del tenant. La prueba fija el reloj a las 21:00 de Bogotá del día 15 y verifica que el ciclo 1 conserve ese día; el test HTTP autoriza a `SALES` y `AUDITOR` con `CRM_SUBSCRIBERS_READ`. Se documenta el esquema de respuesta en OpenAPI.
- **CA-CF-10 y CA-CF-11:** el diálogo de activación exige seleccionar ciclo, muestra la fecha recibida del catálogo y envía el valor elegido; crear y editar usan el selector de catálogo. También se implementó el selector al convertir un expediente y se conserva el dato anterior como sugerencia solo ante coincidencia decimal exacta.
- La agenda vive dentro de Suscriptores, consulta fecha y página al API, presenta estados de carga, vacío y error recuperable, y reutiliza la acción manual de suspensión.
- La línea ajena `CreateOrganizationSiteDto.code?: string` en `apps/portal/src/lib/api-client.ts` quedó intacta. No se calcularon fechas en el navegador, no se llamó a `/tenants/me/settings` y no se implementó corte automático, jobs ni colas.

### Verificación fresca

| Paquete / control                        | Comando                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Resultado                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| API focal (CA-CF-13, guards, OpenAPI)    | `pnpm --filter @iwana/api exec jest --runInBand --no-cache --runTestsByPath src/modules/crm/contracts/tests/contracts.service.spec.ts src/modules/crm/contracts/tests/billing-cycles.controller.http.spec.ts src/modules/crm/contracts/billing-cycles.controller.spec.ts src/modules/crm/contracts/billing-cycles.swagger.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 4 suites / 107 tests aprobados; 0 omitidos.                                                      |
| Shared completo                          | `pnpm --filter @iwana/shared exec jest --runInBand --no-cache`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 28 suites / 268 tests aprobados; 0 omitidos.                                                     |
| Portal focal y regresión de Suscriptores | `pnpm --filter @iwana/portal exec jest --runInBand --no-cache --runTestsByPath src/components/crm/subscribers/billing-cycle-fase09.portal.spec.tsx src/components/crm/subscribers/CutoffAgendaClient.portal.spec.tsx src/components/crm/subscribers/ContractCard.spec.tsx src/components/crm/subscribers/crm-contract-dialogs.portal.spec.tsx src/components/crm/subscribers/contracts-dialogs.behavior.spec.tsx src/components/crm/subscribers/mod05-iva-punto-servicio-ui.spec.tsx src/components/crm/subscribers/mod05-deuda-fiscal-ui.portal.spec.tsx src/components/crm/subscribers/stratum-evidence-upload.portal.spec.tsx src/components/crm/subscribers/SubscriberDetailClient.mod05-deuda.portal.spec.tsx src/components/crm/subscribers/SubscriberLifecycleDialog.portal.spec.tsx src/components/crm/subscribers/SubscriberPeek.spec.tsx` | 11 suites / 137 tests aprobados; 0 omitidos. Incluye CA-CF-10/11 y agenda vacía/error.           |
| Typecheck                                | `pnpm --filter @iwana/api typecheck`, `pnpm --filter @iwana/shared typecheck`, `pnpm --filter @iwana/portal typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Los tres paquetes terminaron con exit 0.                                                         |
| ESLint focal                             | ESLint sobre los archivos backend/shared modificados y `apps/portal/src/components/crm/subscribers`, `apps/portal/src/app/dashboard/crm/subscribers`, `apps/portal/src/lib/api-client.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | API, shared y portal: exit 0, 0 warnings.                                                        |
| Auditoría de identidad UI                | `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/crm/subscribers apps/portal/src/app/dashboard/crm/subscribers`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Sin hallazgos (0).                                                                               |
| Whitespace                               | `git diff --check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Exit 0; muestra solo el aviso CRLF preexistente de `docs/prds/PRD_Sistema_ISP_Colombia_v2_4.md`. |

**Integración PostgreSQL de contratos:** 1 suite / 25 tests aprobados. Se ejecutó con `IWANA_DB_INTEGRATION_AVAILABLE=true` y `E2E_TENANT_SLUG=test-s2-live` usando `pnpm --filter @iwana/api exec jest --config jest.integration.config.js --runInBand --no-cache --runTestsByPath src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts`. `@iwana/shared` se compiló antes para regenerar las declaraciones consumidas por Jest. El tenant solo aportó DDL a un schema aleatorio de trabajo que se eliminó al terminar; no se tocó `tenant_iwana`. La evidencia PostgreSQL de B1 sigue en §9. No hubo commits.

## 12. Ejecución de Q1 · E2E y matriz de criterios · 2026-10-30

**Estado:** el E2E de CA-CF-12 pasó contra Portal y API reales. La matriz confirma evidencia para 12 criterios y detecta que CA-CF-08 solo está cubierto parcialmente: no hay una prueba de la agenda sin `date` a las 21:00 de Bogotá.

### E2E real

Se compiló `@iwana/db` para que el runner de provisioning cargara la migración 167. El primer intento antes de esa compilación recibió HTTP 500 al crear el contrato porque el `dist` consumido en runtime todavía no contenía `167_crm_billing_cycles.js`; después del build, el alta y la activación reales funcionaron.

El comando de `e2e/playwright.portal.config.ts` no pudo iniciar porque el Portal de desarrollo ya ocupaba el puerto 3002 y el gate no reutiliza ese servidor. La ejecución final usó una configuración derivada temporal con el mismo build standalone y el puerto 3012. El archivo `e2e/playwright.portal.q1-temp.config.ts` se eliminó al finalizar.

| Comando                                                                                                                          | Resultado                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @iwana/db build`                                                                                                  | Exit 0; generó `packages/database/dist/migrations/tenant/167_crm_billing_cycles.js`.                                                               |
| `pnpm exec playwright test e2e/tests/portal-crm-ciclo-facturacion-live.spec.ts --config=e2e/playwright.portal.q1-temp.config.ts` | 1 test / 1 aprobado / 0 omitidos / 0 fallidos; 23,6 s. Build standalone de Portal en `http://127.0.0.1:3012`; API real en `http://127.0.0.1:3000`. |

La spec crea un slug aleatorio `srqa-mod05-cf-<12 hex>` y verifica el schema `tenant_srqa_mod05_cf_<12 hex>`, además de rechazar `tenant_iwana`. El fixture, el texto legal, el plan y el suscriptor son sintéticos. Al terminar, el tenant queda en `MARKED_FOR_DELETION` mediante el endpoint real de borrado lógico; la plataforma conserva su schema por contrato. No queda ningún tenant de esta spec activo.

### Matriz CA-CF-01 a CA-CF-13

| Criterio | Test / evidencia real                                                                                                                                                                                                                                                                                                                                          | Estado     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| CA-CF-01 | [`167_crm_billing_cycles.integration.spec.ts`](../../packages/database/src/migrations/tenant/167_crm_billing_cycles.integration.spec.ts): semilla exacta y rollback; suite PostgreSQL 1/1.                                                                                                                                                                     | ✅         |
| CA-CF-02 | [`contracts.service.postgres.integration.spec.ts`](../../apps/api/src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts): test CA-CF-02 conserva `DRAFT` sin ciclo; suite PostgreSQL 25/25.                                                                                                                                           | ✅         |
| CA-CF-03 | Mismo test de integración, CA-CF-03 verifica estado, ciclo persistido y auditoría; suite PostgreSQL 25/25.                                                                                                                                                                                                                                                     | ✅         |
| CA-CF-04 | Mismo test de integración, CA-CF-04 rechaza ciclo inexistente e inactivo; suite PostgreSQL 25/25.                                                                                                                                                                                                                                                              | ✅         |
| CA-CF-05 | [`billing-cutoff.spec.ts`](../../packages/shared/src/calendar/billing-cutoff.spec.ts): tabla de ciclos, meses y febrero bisiesto; Shared completo, 28 suites / 268 tests.                                                                                                                                                                                      | ✅         |
| CA-CF-06 | Mismo spec de calendario: día de corte, día siguiente y cruce diciembre–enero; Shared completo, 28 / 268.                                                                                                                                                                                                                                                      | ✅         |
| CA-CF-07 | [`contracts.service.postgres.integration.spec.ts`](../../apps/api/src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts): agenda Postgres para los días 15/30, febrero, exclusiones y conteo sin ciclo; suite 25/25.                                                                                                                  | ✅         |
| CA-CF-08 | [`billing-cycle-date.util.spec.ts`](../../apps/api/src/modules/crm/contracts/billing-cycle-date.util.spec.ts) comprueba fecha local Bogotá; [`contracts.service.spec.ts`](../../apps/api/src/modules/crm/contracts/tests/contracts.service.spec.ts) fija las 21:00 para CA-CF-13. Falta un test que llame la agenda sin `date` y compruebe la fecha retornada. | ⚠️ Parcial |
| CA-CF-09 | [`billing-cycles.controller.http.spec.ts`](../../apps/api/src/modules/crm/contracts/tests/billing-cycles.controller.http.spec.ts): 403 para catálogo y agenda sin permiso; suites focales API 4 / 107.                                                                                                                                                         | ✅         |
| CA-CF-10 | [`billing-cycle-fase09.portal.spec.tsx`](../../apps/portal/src/components/crm/subscribers/billing-cycle-fase09.portal.spec.tsx): botón deshabilitado, fecha del catálogo y envío del ciclo; Portal focal 11 / 137.                                                                                                                                             | ✅         |
| CA-CF-11 | Mismo spec: crear y editar usan selector; Portal focal 11 / 137.                                                                                                                                                                                                                                                                                               | ✅         |
| CA-CF-12 | [`portal-crm-ciclo-facturacion-live.spec.ts`](../../e2e/tests/portal-crm-ciclo-facturacion-live.spec.ts): selección, activación real, respuesta ACTIVE y aparición en agenda de su fecha; 1 / 1 aprobado.                                                                                                                                                      | ✅         |
| CA-CF-13 | [`contracts.service.spec.ts`](../../apps/api/src/modules/crm/contracts/tests/contracts.service.spec.ts) fija el reloj a las 21:00 de Bogotá; [`billing-cycles.controller.http.spec.ts`](../../apps/api/src/modules/crm/contracts/tests/billing-cycles.controller.http.spec.ts) autoriza SALES y AUDITOR. API focal 4 / 107.                                    | ✅         |

### Revisión de las nueve pruebas de Portal modificadas por F1

No se modificaron estas pruebas durante Q1. En [`contracts-dialogs.behavior.spec.tsx:160`](../../apps/portal/src/components/crm/subscribers/contracts-dialogs.behavior.spec.tsx), F1 sustituyó la prueba de rechazo por mora por una aserción de delegación al diálogo. Se borraron las comprobaciones de `SUBSCRIBER_SUSPENDED_FOR_DELINQUENCY`, del mensaje y del botón «Dejar como borrador»; el spec nuevo de Fase 09 solo cubre CA-CF-10 y CA-CF-11, así que esa rama queda sin aserción de Portal. El código nuevo mantiene el manejo de error, pero la cobertura anterior no se trasladó.

En [`ContractCard.spec.tsx`](../../apps/portal/src/components/crm/subscribers/ContractCard.spec.tsx), la comprobación antigua de `PSE · Mensual` se reemplazó por `PSE` y «Sin ciclo de facturación» para el fixture sin ciclo; verifica el nuevo contrato de UI y no se considera debilitamiento. Las otras siete pruebas solo recibieron `billingCycleDay: null` en fixtures y/o un mock de catálogo vacío; no se borraron sus aserciones.

La fase sigue abierta para resolver la prueba directa de CA-CF-08, el hallazgo V2 y la cobertura de mora eliminada; el detalle de V3 está en §13. No se implementaron jobs, colas ni corte automático.

## 13. Gates V3 · 2026-10-30

**Resultado:** las suites y verificaciones automáticas requeridas terminaron, pero la fase no queda lista para cierre: V2 encontró una violación mayor de boundary y CA-CF-08 está parcial. G6 tiene evidencia aprobada (suite completa de API, CA-CF-12 y CA-CF-13); G5 falla por V2. No se ejecutó G6.5 porque no hubo commit ni push.

### Lint y typecheck

Comandos ejecutados por paquete; todos terminaron con exit 0.

```powershell
pnpm --filter @iwana/shared lint
pnpm --filter @iwana/db lint
pnpm --filter @iwana/api lint
pnpm --filter @iwana/portal lint

pnpm --filter @iwana/shared typecheck
pnpm --filter @iwana/db typecheck
pnpm --filter @iwana/api typecheck
pnpm --filter @iwana/portal typecheck
```

Warnings de lint: shared 0, database 5, API 7 y portal 42.

### Suites completas sin caché de Turbo

```powershell
pnpm exec turbo run test --filter=@iwana/shared --force
pnpm exec turbo run test --filter=@iwana/db --force
pnpm exec turbo run test --filter=@iwana/api --force --concurrency=1
pnpm exec turbo run test --filter=@iwana/portal --force --concurrency=1
```

| Paquete         | Resultado real                                                    |
| --------------- | ----------------------------------------------------------------- |
| `@iwana/shared` | 28 suites / 268 tests aprobados; 0 omitidos.                      |
| `@iwana/db`     | 77 suites / 423 tests aprobados; 0 omitidos.                      |
| `@iwana/api`    | 439 suites / 5.852 tests aprobados; 4 suites / 15 tests omitidos. |
| `@iwana/portal` | 333 suites / 3.359 tests aprobados; 1 test omitido.               |

Omisiones explícitas: en API, `tenant-migrations-second-schema.spec.ts:171` omite 7 pruebas salvo `TENANT_MIGRATIONS_REAL_DB=1`; las suites `asset-loan.transactional.ev1.spec.ts:111`, `stock-reservations.transactional.ev1.spec.ts:95` y `useful-life-alerts.parity.ev1.spec.ts:149` omiten otras 8 salvo `EV1_REAL_DB=1`. Las tres EV1 contienen referencias a `tenant_iwana`, pero fueron omitidas y no se ejecutaron. En Portal, `InventoryClient.spec.tsx:2244` tiene un `it.skip` explícito por DEBT-001 (React 19 + jsdom); el comentario indica que el flujo se verifica en navegador real.

### PostgreSQL, E2E y cobertura

```powershell
pnpm --filter @iwana/db exec jest --config jest.integration.config.js --runInBand --no-cache --runTestsByPath src/migrations/tenant/167_crm_billing_cycles.integration.spec.ts
pnpm --filter @iwana/api exec jest --config jest.integration.config.js --runInBand --no-cache --runTestsByPath src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts
pnpm --filter @iwana/db exec jest src/migrations/tenant/migration-order.spec.ts --runInBand --no-cache
pnpm --filter @iwana/api exec jest --runInBand --no-cache --coverage --coverageReporters=text-summary --coverageReporters=json-summary
```

- Migración tenant 167: 1 suite / 1 test; `up/down` aprobados. Integración de contratos: 1 suite / 25 tests aprobados; `test-s2-live` se usó solo como plantilla DDL y el trabajo ocurrió en un schema aleatorio temporal. No se usó `tenant_iwana`. Orden de migraciones: 1 suite / 6 tests aprobados.
- El E2E CA-CF-12 se reejecutó contra API real y Portal standalone en el puerto 3012: 1 test aprobado, 0 omitidos/fallos, 43,3 s. Comando: `pnpm exec playwright test e2e/tests/portal-crm-ciclo-facturacion-live.spec.ts --config=%TEMP%\pw-v3-cf-3012.cjs`. La API iniciada por V3 fue detenida, el config temporal se eliminó y los puertos 3000, 3002 y 3012 quedaron libres.
- Coverage API terminó con exit 0 y 439 suites / 5.852 tests aprobados, 4 suites / 15 omitidos. El total API es 67,42 % líneas, 53,04 % ramas, 56,76 % funciones y 60,54 % statements; los reportes preexistentes bajo `apps/api/src/coverage` contaminan el agregado.
- `ContractsService` según `apps/api/coverage/coverage-summary.json`: líneas 82,72 % (431/521), statements 82,25 % (459/558), ramas 71,00 % (311/438) y funciones 71,95 % (59/82). Frente a B1 (81,88 % líneas, 71,10 % ramas y 69,13 % funciones): +0,84, −0,10 y +2,82 puntos porcentuales, respectivamente. El threshold configurado pasó; líneas superan 80 %, ramas y funciones no.
- Escaneo del diff con `git diff --unified=0 -- apps/api/src packages/database/src packages/shared/src | Select-String -Pattern '^\\+.*(logger\\.|console\\.)' -CaseSensitive`: sin nuevas líneas de log.

### Hallazgos y gates abiertos

- **V2, mayor:** `ContractsModule` importa `TenantModule` y `ContractsTenantSettingsReadAdapter` importa/injecta `TenantService`, contra el requisito de leer la zona por puerto sin importar el módulo tenant. Referencias: `apps/api/src/modules/crm/contracts/contracts.module.ts:15,30`; `apps/api/src/modules/crm/contracts/ports/contracts-tenant-settings-read.adapter.ts:2,7,12`. G5 falla hasta resolverlo.
- **CA-CF-08 parcial:** falta una prueba de `GET cutoff-agenda` sin `date` a las 21:00 de Bogotá que compruebe la fecha devuelta.
- **Regresión de prueba:** `contracts-dialogs.behavior.spec.tsx:160` perdió las aserciones de rechazo por mora (`SUBSCRIBER_SUSPENDED_FOR_DELINQUENCY`, mensaje y botón «Dejar como borrador»); la rama no se trasladó a otra prueba.
- **V1:** sin deriva mayor de contrato. Nota menor: el formulario de expedientes sigue permitiendo editar `billingCycle` como texto; no se usa como ciclo de contrato en los flujos de Fase 09. `apps/web/src` no tiene consumidores.
- Auditoría adicional: `pnpm audit` exitó 1 con 30 vulnerabilidades (2 críticas, 12 altas, 12 moderadas y 4 bajas); las 2 críticas son `handlebars` bajo `apps__api>ts-jest`. `pnpm audit --prod` exitó 1 con 9 (0 críticas, 3 altas, 5 moderadas y 1 baja). No hubo cambios de dependencias en esta fase. El gate «No critical vulnerabilities» falla por las dos críticas del árbol completo.
- G6.5 queda pendiente de CI por SHA tras el cierre autorizado.

## 14. Disposición de AI-EM-ARCH tras la Ola 3 · 2026-10-30

| Hallazgo | Disposición | Motivo |
| --- | --- | --- |
| V2 mayor: `ContractsModule` importa `TenantModule` y el adaptador usa `TenantService` | **No es violación de boundary.** G5 ✅ | Lo que dice `AGENTS.md` (Modulith): «sin acceso directo a tablas de otro modulo; comunicacion via interfaces tipadas o eventos; sin imports circulares». La zona se lee por un puerto propio de `crm/contracts` (`ContractsTenantSettingsReadPort`); el adaptador consume el servicio que exporta `TenantModule`; no hay acceso a tablas ajenas. `TenantModule` importa `AuthModule`, `AuditModule`, `MediaModule` y `SearchQueueModule`, no CRM, así que no hay ciclo. Es el patrón que ordenó el encargo §B1 (`wfm-tenant-settings-read.adapter.ts`) y el que usan `wfm`, `crm`, `inventory`, `network` y `users`. La exigencia «sin importar el módulo `tenant`» la redactó AI-EM-ARCH en el launcher v1.2: era más estricta que el encargo §V2 y que `AGENTS.md`, y no se impone. |
| CA-CF-08 parcial | Remediación §R1 | Falta la agenda sin `date` a las 21:00 de Bogotá |
| Prueba de mora eliminada (`contracts-dialogs.behavior.spec.tsx:160`) | Remediación §R2 | El código sigue en `ActivateServiceDialog.tsx:100`; se perdió la prueba, no la regla. R2 también revisa si `ServiciosTab.tsx:209` y `ContractDetailDrawer.tsx:568` quedaron sin uso |
| `pnpm audit`: 2 críticas (`handlebars` bajo `ts-jest`) | **No bloquea la fase.** Deuda transversal | Son dependencias de desarrollo. Esta fase no cambió `package.json` ni el lockfile. El gate del CI es `pnpm audit --prod --audit-level critical` (`.github/workflows/ci.yml:277`), con 0 críticas. V3b lo confirma |
| V1 menor: `BillingSection.tsx:24` edita `billingCycle` como texto | Deuda registrada | El campo está deprecado (ADR-102 D1). Se elimina cuando exista Facturación |

Siguiente: Ola 4 (R1 ∥ R2 → V3b), [launcher v1.3](../prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.3.md).
