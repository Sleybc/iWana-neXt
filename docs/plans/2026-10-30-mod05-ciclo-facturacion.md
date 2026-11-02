# MOD05 Fase 09 — Ciclo de facturación y fecha de corte · Plan de orquestación

**Versión:** 1.0 · **Fecha:** 2026-10-30 · **Autor:** AI-EM-ARCH
**Decisión:** [ADR-102](../adrs/ADR-102-Ciclo-Facturacion-y-Fecha-de-Corte-por-Servicio.md) · **PRD:** [Fase 09 v1.1](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.1.md) (Aprobado, 2026-10-30; enmienda E1)
**Encargo:** [PROMPT-MOD05-CICLO-FACTURACION-v1.0](../prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md) · **Launcher vigente:** [PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.3](../prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.3.md) (Ola 4, remediación)
**Origen:** regla de negocio del CTO (2026-10-30): ciclos de facturación día 1 y día 15; corte el 15 y el 30 si no hay pago.
**Base:** `main` en `1ce4f263`. Se trabaja en `main`, sin ramas. El árbol tiene rutas sin commitear de otros frentes: ningún agente las toca ni las incluye en sus commits.

---

## 0. Alcance

ADR-102 D1–D5 y D7: catálogo de ciclos por tenant, ciclo obligatorio al activar el servicio, selector de ciclo en crear/editar/convertir, «Próximo corte» y agenda de corte.

**Fuera de alcance:**

- corte automático (D6: comportamiento objetivo, bloqueado por P1 señal de pago, P2 régimen CRC y P3 ejecutor de red);
- pagos, facturas, cartera, Wompi y reconexión;
- edición del catálogo desde Configuración;
- asignación masiva de ciclo a contratos existentes;
- `apps/api/src/modules/network/**`.

## 1. Decisiones del CTO antes de lanzar (G0)

| #      | Pregunta                                 | Estado / recomendación                                                   |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------ |
| C1     | Alcance de la fase                       | ✅ 2026-10-30: solo ciclo y fecha de corte, dentro de MOD05              |
| C2     | Forma del corte                          | ✅ 2026-10-30: automático sin confirmación (objetivo, ver D-F9-1)        |
| C3     | Día inexistente o no hábil               | ✅ 2026-10-30: último día del mes; se corta aunque sea domingo o festivo |
| D-F9-1 | Reconciliación C1 ↔ C2                   | ✅ 2026-10-30: **(a)** corte automático diferido hasta P1–P3             |
| D-F9-2 | Contratos existentes sin ciclo           | ✅ 2026-10-30: **(a)** corrección manual con el contador de la agenda    |
| D-F9-3 | Ubicación de la agenda                   | ✅ 2026-10-30: **(a)** vista dentro de Suscriptores                      |
| —      | ADR-102 y PRD Fase 09 pasan a `Aprobado` | ✅ Hecho el 2026-10-30                                                   |

## 2. Bloques y dependencias

| Bloque | Agente                    | Qué                                                                                                | Depende de              |
| ------ | ------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------- |
| P1     | `prod-ux`                 | Spec UX: diálogo de activación, selectores, «Próximo corte», agenda                                | G0                      |
| B1     | `sr-backend`              | Migración, contratos de `@iwana/shared`, `activate` con ciclo, catálogo y agenda, OpenAPI, pruebas | G0                      |
| B1b    | `sr-backend`              | Enmienda E1: `nextCutoffDate` en el catálogo, calculado en el servidor (CA-CF-13)                  | B1 y E1                 |
| F1     | `fe-platform`             | Portal según la spec de P1 contra el contrato congelado                                            | P1 (no el código de B1) |
| Q1     | `sr-qa`                   | E2E CA-CF-12 y matriz CA ↔ test                                                                    | B1 y F1                 |
| V1     | `contract-drift-reviewer` | `@iwana/shared` ↔ DTO/OpenAPI ↔ portal                                                             | B1 y F1                 |
| V2     | `boundary-reviewer`       | Migración y módulo `crm`: tenancy y boundaries                                                     | B1                      |
| V3     | `gate-verifier`           | Gates Before Merge sin caché, suite completa de api                                                | Q1, V1, V2              |

**Olas:** Ola 1 = P1 ∥ B1 (archivos disjuntos) → Ola 2 = B1b ∥ F1 (archivos disjuntos) → Ola 3 = Q1 ∥ V1 ∥ V2 → V3 → cierre de AI-EM-ARCH (informe de cierre, commit, push, G6.5).

**Ruta crítica:** G0 → B1 → Q1 → V3. P1 → F1 corre en paralelo a B1.

## 3. Matriz de dispatch (agente × skill)

Skills verificadas en disco el 2026-10-30 con `ls .agents/skills/<nombre>/SKILL.md`.

| Bloque | Agente                    | Skills obligatorias                                                                                                        | De apoyo (condición)                                                                                                       | Descartadas y motivo                                                                                                     | Gate ejecutable                                                               |
| ------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| P1     | `prod-ux`                 | `brainstorming`, `system-vocabulary-review`, `iwana-identity-ui-review`                                                    | `wcag-audit-patterns` (foco del diálogo)                                                                                   | `ui-ux-pro-max`: hay patrones de diálogo y lista existentes · `senior-ui-systems-designer`: sin lenguaje visual nuevo    | —                                                                             |
| B1     | `sr-backend`              | `nestjs-expert`, `database-migration`, `postgresql`, `test-driven-development`, `iwana-test-evidence`                      | `openapi-spec-generation` (cuerpo de `activate` y endpoints); `backend-security-coder` (permiso y proyección de la agenda) | `bullmq-specialist`: D6 no se implementa · `auth-implementation-patterns`: sin cambio de autenticación                   | `pnpm --filter @iwana/api test` sin caché + integraciones Postgres con conteo |
| B1b    | `sr-backend`              | `nestjs-expert`, `test-driven-development`, `iwana-test-evidence`                                                          | `openapi-spec-generation` (respuesta nueva del catálogo)                                                                   | `database-migration`: sin cambio de esquema                                                                              | CA-CF-13 con conteo real                                                      |
| F1     | `fe-platform`             | `frontend-dev-guidelines`, `core-components`, `nextjs-app-router-patterns`, `system-vocabulary-review`, `testing-patterns` | `iwana-identity-ui-review` (vista de agenda); `tailwind-patterns` (composición nueva)                                      | — (`nextjs-app-router-patterns` pasó a obligatoria: la spec pone la agenda en `/dashboard/crm/subscribers/agenda-corte`) | `audit-ui.mjs` en 0                                                           |
| Q1     | `sr-qa`                   | `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence`                                                          | `wcag-audit-patterns` (diálogo)                                                                                            | `test-driven-development`: no implementa                                                                                 | job «E2E portal»                                                              |
| V1     | `contract-drift-reviewer` | `architect-review`                                                                                                         | —                                                                                                                          | —                                                                                                                        | —                                                                             |
| V2     | `boundary-reviewer`       | `architect-review`                                                                                                         | —                                                                                                                          | —                                                                                                                        | —                                                                             |
| V3     | `gate-verifier`           | `iwana-test-evidence`, `verification-before-completion`                                                                    | `turborepo-caching` (si aparece caché)                                                                                     | —                                                                                                                        | Gates Before Merge                                                            |
| Cierre | AI-EM-ARCH                | `docs-architect`                                                                                                           | —                                                                                                                          | —                                                                                                                        | `pnpm audit:adr-citations`                                                    |

## 4. Gates

| Gate    | Condición                                                                                                                                              | Quién         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| G0 / G1 | ADR-102 y PRD aprobados; D-F9-1 a D-F9-3 resueltas; review cruzado `sr-backend` (factibilidad) y `prod-ux` (viabilidad UX)                             | CTO           |
| G3      | CA-CF-01 a CA-CF-07 y CA-CF-09; integración Postgres **ejecutada** (> 0 tests). CA-CF-08 queda parcial: falta agenda sin `date` a las 21:00 de Bogotá. | sr-backend    |
| G4      | CA-CF-10, CA-CF-11; pruebas de componente; `audit-ui.mjs` en 0                                                                                         | fe-platform   |
| G5      | V1 sin deriva; V2 sin violaciones                                                                                                                      | revisores     |
| G6      | V3 con conteo real y suite completa de `@iwana/api`; CA-CF-12 y CA-CF-13                                                                               | gate-verifier |
| G6.5    | CI de `main` en verde por SHA tras el push                                                                                                             | AI-EM-ARCH    |

## 5. Riesgos

| Riesgo                                            | Mitigación                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| El CTO espera corte automático y la fase no corta | D6 explícito en ADR-102; D-F9-1 en G0; leyenda en la agenda              |
| Fechas desplazadas por UTC                        | RNF-CF-01, CA-CF-08                                                      |
| Régimen CRC sin fuente en el repo                 | P2 de D6 — requiere verificación con fuente oficial; no afecta esta fase |
| Otro consumidor de `billingCycle` texto           | RF-CF-06 lo mantiene deprecado; V1 busca consumidores                    |
| Suite focal verde con CI rojo                     | V3 corre la suite completa de api (cambia un `@Module`)                  |

## 6. Estado de ejecución · 2026-10-30

G0 ✅ el 2026-10-30: el CTO aprobó ADR-102, el PRD Fase 09 y D-F9-1 a D-F9-3 = (a). El contrato del PRD §7 queda congelado.

**Ola 1 completada el 2026-10-30:** P1 escribió la [spec UX](../specs/2026-10-30-mod05-ciclo-facturacion-ux.md) sin `[BLOQUEO]`; B1 implementó migración 167, contratos shared, activación, catálogo y agenda. CA-CF-01 a CA-CF-07 y CA-CF-09 tienen evidencia aprobada; CA-CF-08 está parcial porque falta probar la agenda sin `date` con el reloj a las 21:00 de Bogotá. La API completa pasó 438 suites / 5.848 tests; las integraciones Postgres fueron 1/1 migración, 25/25 contratos y 8/8 ciclo de vida. Ver el detalle en [informe de definición y Ola 1](../informes/INFORME-MOD05-CICLO-FACTURACION-DEFINICION-v1.0.md) §9 y §12.

**Enmienda E1 aprobada por el CTO el 2026-10-30.** Al verificar la Ola 1, AI-EM-ARCH encontró un hueco en el contrato. `SALES` y `AUDITOR` tienen `CRM_SUBSCRIBERS_READ` y `SALES` activa servicios, pero ninguno de los dos puede leer `GET /tenants/me/settings` (`tenant.controller.ts:214`). Por eso el portal no podía calcular el «Próximo corte» en la zona del tenant. Con E1, el servidor calcula `nextCutoffDate` y lo devuelve en el catálogo: [PRD v1.1](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.1.md) RF-CF-20 y CA-CF-13, bloque B1b. G3 ✅ con la evidencia de B1. Queda como deuda la cobertura de `ContractsService` en ramas (71,1 %) y funciones (69,13 %); V3 la mide antes y después.

**Ola 2 completada el 2026-10-30:** B1b añade `BillingCycleOption.nextCutoffDate` calculado por API con la fecha local del tenant; F1 implementa activación con ciclo, selectores de crear/editar/convertir, próximo corte y agenda dentro de Suscriptores. CA-CF-10, CA-CF-11 y CA-CF-13 tienen pruebas focales. La auditoría `audit-ui.mjs` dio 0 hallazgos. Evidencia y limitaciones: [informe de definición y ejecución](../informes/INFORME-MOD05-CICLO-FACTURACION-DEFINICION-v1.0.md) §11.

AI-EM-ARCH verificó la Ola 2 en disco el 2026-10-30: `BillingCycleOption` está en shared, el controlador lo devuelve, el portal no calcula fechas ni lee `/tenants/me/settings` y la línea ajena de `api-client.ts` sigue igual. G4 ✅. Q1 pasó CA-CF-12 contra API/Portal reales y revisó las 9 pruebas preexistentes modificadas por F1; detalle y hueco de aserción por mora en [informe §12](../informes/INFORME-MOD05-CICLO-FACTURACION-DEFINICION-v1.0.md).

**Ola 3 ejecutada el 2026-10-30:** Q1 pasó CA-CF-12 contra API/Portal reales; V1 no encontró deriva mayor y registró como nota menor el texto editable heredado de expedientes; V2 encontró una violación mayor de boundary. V3 completó suites, typecheck, lint, integraciones y E2E; detalle y conteos en [informe §13](../informes/INFORME-MOD05-CICLO-FACTURACION-DEFINICION-v1.0.md). G6 tiene evidencia aprobada; G5 falla por V2. El gate de vulnerabilidades también falla: `pnpm audit` encontró dos críticas en `handlebars` bajo `ts-jest`. La fase sigue abierta para resolver el boundary, atender las vulnerabilidades, cubrir directamente CA-CF-08, restaurar la aserción de mora eliminada y completar el cierre autorizado. G6.5 (CI por SHA) no se ejecutó. No se implementaron jobs, colas ni corte automático.

**Disposición tras la Ola 3 (AI-EM-ARCH, 2026-10-30):** el hallazgo mayor de V2 no es una violación de boundary según `AGENTS.md`. G5 ✅. Las críticas de `pnpm audit` son de desarrollo y anteriores a la fase; son deuda transversal. Quedan dos remediaciones: R1 (CA-CF-08 completo) y R2 (prueba de mora). Ver [informe §14](../informes/INFORME-MOD05-CICLO-FACTURACION-DEFINICION-v1.0.md).

**Estado al 2026-10-31 (AI-EM-ARCH):** la Ola 4 no se ha ejecutado. CA-CF-08 sigue parcial: la prueba de las 21:00 existente cubre CA-CF-13, no la agenda sin `date`, y no existe la prueba del 409 por mora en `ActivateServiceDialog`. La **definición** de esta fase ya está publicada en `origin/main` (`316c5b4e`, G6.5 PASS con el checkpoint transversal). El **código** sigue local. Con la Ola 4 en GO, el commit se hace según D-CK-1 del [checkpoint de commits](../prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md): encadenado D → E → F, separando por hunks lo que pase gates en su índice. El cierre «informe, commit, push» del lanzador v1.3 queda sustituido por esa regla.

## Lanzamiento

Espejo de [PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.3](../prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.3.md). **El archivo es la fuente y prevalece si divergen.**

Ola 4: `sr-backend` §R1 ∥ `fe-platform` §R2 → `gate-verifier` §V3b.

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el PRD Fase 09 v1.1 (CA-CF-08) y tu encargo `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md` §R1. Lee los `SKILL.md` de `test-driven-development` e `iwana-test-evidence`. Añade la prueba de `getCutoffAgenda` sin `date` con reloj fijo a las 21:00 de Bogotá: `date` debe ser el día de Bogotá, no el de UTC. No cambies código de producción salvo que la prueba muestre un defecto; si lo muestra, repórtalo. No toques `apps/portal`. Sin `tenant_iwana`, sin `git stash`, no toques cambios ajenos ni commitees. Cierras con el conteo real de la suite tocada.

===== 2 · fe-platform =====
Actúa como `fe-platform`. Lee `AGENTS.md`, la spec `docs/specs/2026-10-30-mod05-ciclo-facturacion-ux.md` §1 y tu encargo `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md` §R2. Lee los `SKILL.md` de `testing-patterns` y `frontend-dev-guidelines`. Restituye en `ActivateServiceDialog` la prueba del 409 `SUBSCRIBER_SUSPENDED_FOR_DELINQUENCY`: título, botón «Dejar como borrador» y contrato en borrador. Revisa si las ramas de mora de `ServiciosTab.tsx:209` y `ContractDetailDrawer.tsx:568` quedaron sin uso: si es así, elimínalas con sus pruebas; si no, nombra la transición que las usa. No debilites aserciones. No toques `apps/api`, sin `git stash`, no commitees.

===== 3 · gate-verifier (después de 1 y 2) =====
Actúa como `gate-verifier`. Lee `AGENTS.md` «Gates Before Merge» y el encargo §V3b; lee los `SKILL.md` de `iwana-test-evidence` y `verification-before-completion`. Sin caché de turbo: lint y typecheck de `@iwana/api` y `@iwana/portal`, la suite completa de `@iwana/portal`, la suite de `crm/contracts` de `@iwana/api` y `pnpm audit --prod --audit-level critical`. Entrega comandos y cifras reales; no corrijas código.
