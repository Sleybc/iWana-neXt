# PROMPT — TRANSVERSAL · Salud de pruebas (E2E del portal, B5 y cobertura de contratos)

**Versión:** 1.0 · **Fecha:** 2026-10-20 · **Emisor:** AI-EM-ARCH · **Estado:** Contrato congelado; G0 aprobado por el CTO el 2026-10-20 (D-SP-1 A, D-SP-2 cuarentena acotada, D-SP-3 omitir -live con motivo, D-SP-4 capturas en contenedor y revisadas, D-SP-5 cuarentena en WFM/Inventario y D-SP-6 B5 con migraciones; [spec](../specs/2026-10-20-transversal-salud-pruebas-spec.md) §6)
**Plan:** [2026-10-20-transversal-salud-pruebas.md](../plans/2026-10-20-transversal-salud-pruebas.md)
**Base:** `main` en `cc54cf9d`. Se trabaja en `main`, sin ramas. **Ningún agente commitea**: lo hace AI-EM-ARCH en G7.

## 0. Reglas comunes

1. Lee `AGENTS.md`, la spec completa, el plan y tu § antes de tocar nada.
2. Lee los `SKILL.md` de tu fila en el plan §3 como documentación, no como tool.
3. Solo editas los archivos de tu fila en §2. Si necesitas otro, emite `[BLOQUEO]` y para.
4. **No se arregla una prueba relajándola:** nada de ampliar timeouts, cambiar `toBeVisible` por aserciones más débiles ni borrar la aserción que da sentido al test (RQ-P-01). Si la prueba ya no tiene sentido, es obsoleta (RQ-P-02) y se cita por qué.
5. Nunca payloads de error, tokens ni datos personales en reportes, logs ni capturas.
6. Evidencia: comando exacto y conteo real, sin caché. Las corridas E2E se reportan con pasadas, fallidas, omitidas y flaky.
7. Una cuarentena es `test.fixme(true, 'QUARANTINE: <id>')` en la spec **más** la fila que reportas al orquestador (id, spec, test, categoría, motivo, dueño propuesto). Tú no editas `e2e/QUARANTINE.md`.
8. El orquestador es dueño de `e2e/playwright.portal.config.ts` y `scripts/next-standalone-e2e.mjs`; la suite Portal construye y sirve el standalone de producción en local y CI para conservar los mocks `page.route` sin el indicador de caché de Next dev.

## 1. Hechos de partida

H1-H9 de la spec §1. Fallos por spec del run `39339080296` (spec H4) y por tipo de error (spec H5).

## 2. Propiedad de archivos

| Bloque | Edita                                                                                                                                                                                                                                  | Crea                                                                                                                                                         |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T0     | — (solo lectura; puede re-ejecutar specs aisladas)                                                                                                                                                                                     | —                                                                                                                                                            |
| B0     | `apps/api/src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts` y helpers de prueba de integración en `apps/api/src/**/testing/` si hace falta                                                              | —                                                                                                                                                            |
| C0     | specs de `ContractCard`, `ContractDetailDrawer`, `ConvertExpedienteToContractDialog` y `CreateContractDialog` en `apps/portal/src/components/crm/subscribers/`                                                                         | specs nuevas de esos cuatro componentes                                                                                                                      |
| Q0     | —                                                                                                                                                                                                                                      | `scripts/check-e2e-quarantine.mjs` y su test, `e2e/QUARANTINE.md` (solo encabezado y formato), `e2e/quarantine-cap.json`                                     |
| E0     | specs `portal-*-live.spec.ts` (`mod05-deuda-fiscal-live`, `privacy-fase-1b-live`, `privacy-live`, `crm-suscriptores-ux-qw-live`, `crm-conversion-failure-live`, `crm-contact-pending-live`), `portal-settings-organization-ui.spec.ts` | capturas de referencia de Linux en `e2e/tests/portal-settings-organization-ui.spec.ts-snapshots/` y `e2e/tests/portal-settings-access-ui.spec.ts-snapshots/` |
| PA     | el resto de specs `portal-*.spec.ts` con fallos que no son de E0 ni de PB (CRM, Commercial, Settings, Privacy, Auth, Dashboard, Assurance, Tax) y sus helpers de mock en `e2e/`                                                        | —                                                                                                                                                            |
| PB     | `portal-wfm-scheduling`, `portal-inventory-scm`, `portal-inventory-scm-federated`, `portal-field-flow-ticket-ot-inventory`, `portal-operations-consola-ot-r3`                                                                          | —                                                                                                                                                            |
| R0     | solo los archivos de producto que el orquestador le asigne desde la matriz de triaje, en módulos cerrados                                                                                                                              | tests de regresión                                                                                                                                           |
| J0     | `.github/workflows/ci.yml` (job E2E del portal y gate de la suite de integración de la API)                                                                                                                                            | lista de omisiones esperadas de integración (`apps/api/integration-expected-skips.json`)                                                                     |

Si un helper de mock de `e2e/` lo necesitan PA y PB a la vez, es de PA; PB emite `[BLOQUEO]`.

---

## T0 — Triaje · `e2e-triage`

Corre `pnpm test:e2e:portal` **dos veces** sobre `cc54cf9d` (o el HEAD indicado por el orquestador) y clasifica los fallos según RQ-T-01: entorno, prueba desactualizada, regresión de producto, flaky u obsoleta. Para cada uno: spec, test, primera línea del error (sin payload) y evidencia de la clasificación; para regresión, el commit probable (`git log -S` o `git bisect` acotado). Compara con los 125 del CI y explica las diferencias entre Windows y Linux.
**Cierras cuando:** entregas la tabla completa al orquestador (S1). No editas archivos.

## B0 — B5 en CI · `sr-backend`

RQ-B-01 y RQ-B-02 (D-SP-6): el esquema de prueba se construye ejecutando las migraciones del runner tenant sobre un esquema efímero, como las integraciones de E4, en lugar de `CREATE TABLE … (LIKE <tenant>.<tabla>)`. Conserva todas las aserciones.
**Cierras cuando:** `pnpm --filter @iwana/api test:integration` en local da B5 17/17, con `IWANA_DB_INTEGRATION_AVAILABLE=true` y `E2E_TENANT_SLUG=test`, y anexas el conteo.

## C0 — Cobertura de contratos · `sr-qa`

RQ-C-01 y RQ-C-02. Mide primero la cobertura actual de los cuatro componentes; agrega pruebas de comportamiento hasta superar el 80 % de líneas en cada uno.
**Cierras cuando:** reportas cobertura antes y después por componente, con `pnpm --filter @iwana/portal exec jest <specs> --coverage --collectCoverageFrom=<los cuatro> --no-cache`, sin advertencias `act()`.

## Q0 — Mecanismo de cuarentena · `plat-ops`

RQ-Q-01 y RQ-Q-02: `e2e/QUARANTINE.md` con la tabla vacía y su formato; `scripts/check-e2e-quarantine.mjs` que cuenta los `QUARANTINE:` de `e2e/tests/**`, los cruza con las filas y falla si hay huérfanos, filas vencidas o más cuarentenas que `e2e/quarantine-cap.json`. Tope provisional: 0 (el orquestador lo fija al cerrar la Ola 2).
**Cierras cuando:** el script tiene tests que cubren huérfano, fila vencida y tope superado (S2).

## E0 — Entorno y capturas · `sr-qa` (tras S1)

RQ-E-01: cada spec `-live` se omite con `test.skip` y un motivo cuando falta su variable. RQ-E-02: capturas de Linux de `portal-settings-organization-ui` y `portal-settings-access-ui` generadas en el contenedor oficial `mcr.microsoft.com/playwright` de la versión del repo, usando el servidor standalone que configura la suite; pasa ambos juegos de imágenes a `ds-owner` por medio del orquestador antes de darlos por buenos. Access UI se amplía porque, tras la corrección de Axe, sus seis pruebas de screenshot también deben pasar en Linux y no había baselines Linux.
**Cierras cuando:** sin variables, las specs `-live` dan 0 fallos y N omitidas con motivo, y ambas suites de Settings UI pasan en el contenedor con los baselines revisados.

## PA — CRM, Commercial, Settings y resto · `sr-qa` (tras S1 y S2)

Corrige las pruebas desactualizadas, elimina las obsoletas y resuelve las flaky de tus specs según la matriz. Las regresiones de producto en módulos cerrados las reportas para R0, sin tocar producto.
**Cierras cuando:** tus specs dan 0 fallos fuera de cuarentena en dos corridas seguidas.

## PB — WFM e Inventario · `sr-qa` (tras S1 y S2)

Igual que PA, pero D-SP-5 rige: si el fallo es una regresión de producto, cuarentena con el hallazgo documentado para el turno de auditoría del módulo. Solo corriges las pruebas desactualizadas, obsoletas o flaky.
**Cierras cuando:** tus specs dan 0 fallos fuera de cuarentena en dos corridas seguidas.

## R0 — Regresiones en módulos cerrados · `fe-platform` (tras S1)

Para cada regresión que el orquestador te asigne: test que la reproduce, arreglo mínimo y la spec E2E en verde.
**Cierras cuando:** cada regresión asignada tiene test y arreglo, con conteo real. Puede no tener encargos.

## J0 — Job bloqueante y gate de omisiones · `plat-ops` (tras la Ola 2)

RQ-J-01 a RQ-J-04: el job se llama «E2E portal», sin `continue-on-error` ni `|| true`, con `retries: 0`, corre `check-e2e-quarantine.mjs` y publica pasadas, fallidas, omitidas, cuarentenadas y flaky; se retira `E2E_PORTAL_DEBT_BASELINE`. RQ-B-03: el gate de la suite de integración de la API falla si una spec `*.postgres.integration.spec.ts` se omite completa sin figurar en `integration-expected-skips.json` con su motivo.
**Cierras cuando:** anexas, en local, el rojo del gate con una omisión no declarada y el verde sin ella (sin commitear la prueba del rojo).

---

## V1 — `sr-qa`

`pnpm test:e2e:portal` dos veces en local y una en el contenedor de Playwright: 0 fallos fuera de cuarentena. Revisa el diff de cada spec corregida contra RQ-P-01. Veredicto GO/NO-GO.

## V2 — `docs-governance`

Spec, plan, prompts, matriz de triaje y `e2e/QUARANTINE.md` conformes a «Documentation Rules».

## V3 — `gate-verifier`

Gates Before Merge en local sin caché sobre `@iwana/api`, `@iwana/portal` y los paquetes tocados; B5 17/17; cobertura de los cuatro componentes; script de cuarentena en verde. El CI de `main` se verifica en G7, después del push.

## 3. Formato de reporte

Entregables con ruta; comando y conteo real; requerimientos y CA cubiertos por identificador; filas de cuarentena propuestas; `[BLOQUEO]` si los hay; deuda nueva por severidad P0-P3.
