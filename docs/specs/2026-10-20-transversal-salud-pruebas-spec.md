# TRANSVERSAL — Salud de pruebas: E2E del portal, integración B5 y cobertura de contratos · Spec

**Fecha:** 2026-10-20 · **Versión:** 1.0 · **Estado:** Aprobado — G0 del CTO, 2026-10-20: D-SP-1 A, D-SP-2 cuarentena acotada, D-SP-3 omitir -live con motivo, D-SP-4 capturas en contenedor y revisadas, D-SP-5 cuarentena en WFM/Inventario y D-SP-6 B5 con migraciones
**Emisor:** AI-EM-ARCH
**Plan:** [2026-10-20-transversal-salud-pruebas.md](../plans/2026-10-20-transversal-salud-pruebas.md)
**Origen:**
- [cierre de la Fase 06 de MOD05](../informes/INFORME-MOD05-LISTA-OPERATIVA-CIERRE-v1.0.md), «Pendientes y deuda»;
- [cierre de los quick wins](../informes/INFORME-MOD05-SUSCRIPTORES-UX-QW-CIERRE-v1.0.md), deuda P3 de cobertura;
- `AGENTS.md` → Gates Before Merge (cobertura ≥80 % y suites verdes).

**Tipo:** fase de calidad. No cambia comportamiento de producto salvo que el triaje encuentre una regresión real (§3.4).

---

## 0. Por qué ahora

La suite E2E del portal no protege contra regresiones: falla el 41 % de forma estable y su job no bloquea, así que nadie lo ve en rojo. Una regresión nueva no se distingue del ruido. Es el mayor riesgo de calidad antes de la beta (ADR-095).

## 1. Hechos verificados (2026-10-20, `main` en `cc54cf9d`)

| # | Hecho | Fuente |
| --- | --- | --- |
| H1 | El job `e2e-portal-debt-counter` corre con `continue-on-error: true`, tolera el exit de la suite (`|| true`) y compara contra `E2E_PORTAL_DEBT_BASELINE: '100'`, ya superado | `.github/workflows/ci.yml:866-1020` |
| H2 | Último run (`39339080296`, `cc54cf9d`): 304 pruebas, 178 pasan, **125 fallan**, 1 omitida, 0 flaky. Pre-Fase 06 (`ea49fb4c`): 127 fallos de 299 | log del job; informe de cierre de la Fase 06 |
| H3 | La suite levanta **solo el portal** (`next-dev.mjs --webpack`, puerto 3002) e intercepta la API con `page.route`; `workers: 1`, sin reintentos | `e2e/playwright.portal.config.ts` |
| H4 | Fallos por spec: `wfm-scheduling` 18, `inventory-scm` 17, `crm-expedientes` 13, `crm-gestion-comercial-operativa` 12, `mod05-deuda-fiscal-live` 8, `inventory-scm-federated` 8, `settings-access-ui` 7, `settings-organization-ui` 6 y 20 specs con 1 a 4 fallos | log del job, agrupado por spec |
| H5 | Fallos por tipo de error: `toBeVisible` 47, `element(s) not found` 46, `locator.click`/`fill` con timeout 45, **variable de entorno faltante 17** (`E2E_PRIVACY_1B_TENANT_SLUG`, `E2E_TENANT_SLUG`, `DB_NAME`), igualdad profunda 7, **captura de referencia de Linux inexistente 6**, `toHaveURL` 2 y modo estricto 1 | ídem (un fallo puede emitir más de un mensaje) |
| H6 | Las specs `-live` **lanzan un error** cuando falta su variable, en lugar de omitirse | mensajes «Falta configurar …» |
| H7 | B5 (`b5-identity-conversion.postgres.integration.spec.ts`): en CI figura como `PASS` pero con sus 15 tests omitidos (el total de omitidos del job es 15), y en local fallan 15 de 17. Arma su esquema copiando tablas con `CREATE TABLE … (LIKE <tenant existente>.<tabla>)`, así que depende de que ese tenant esté migrado (falta `expediente_records.anonymized_at`, migración 150) | spec L61-63 y L338-356; job «Integration tests — API R2.3» del run `39339080296` |
| H8 | El gate de la suite API solo exige el `PASS` de `execution-orders.postgres.integration.spec.ts`: una spec que se omite completa no lo pone en rojo | `ci.yml:528-548` |
| H9 | Cobertura de líneas medida en el cierre de los quick wins: `ContractCard` 63,88 %, `ContractDetailDrawer` 78,60 %, `ConvertExpedienteToContractDialog` 71,69 %, `CreateContractDialog` 77,10 %. Hay que remedirla: la Fase 05 tocó `ContractCard` | informe de cierre de los quick wins |

## 2. Objetivo

1. Que la suite E2E del portal **bloquee** el merge con **cero fallos** fuera de una cuarentena explícita, acotada y decreciente.
2. Que B5 corra de verdad en CI y que el CI se ponga en rojo si una spec de integración se omite completa sin haberlo declarado.
3. Que los cuatro componentes de contratos superen el 80 % de líneas.

## 3. Requerimientos

### 3.1 Triaje

| ID | Requerimiento |
| --- | --- |
| RQ-T-01 | Cada uno de los 125 fallos se clasifica en **entorno**, **prueba desactualizada** (mock, selector o texto que cambió con la UI), **regresión de producto**, **flaky** o **obsoleta** (prueba de un flujo retirado), con evidencia: spec, test, mensaje y, para regresión, el commit probable |
| RQ-T-02 | El triaje se corre dos veces sobre el mismo commit para separar flaky de determinista |
| RQ-T-03 | La matriz de triaje queda en `docs/informes/INFORME-TRANSVERSAL-SALUD-PRUEBAS-TRIAJE-v1.0.md`, sin payloads de error ni datos personales |

### 3.2 Entorno

| ID | Requerimiento |
| --- | --- |
| RQ-E-01 | Toda spec `-live` usa `test.skip(!env, '<motivo>')` cuando falta su variable: se omite con motivo, no falla (D-SP-3) |
| RQ-E-02 | Las capturas de referencia de Linux de `portal-settings-organization-ui` se generan en el contenedor oficial de Playwright de la **misma versión** que el repo (`@playwright/test` ^1.58.2) y `ds-owner` las revisa antes del commit (D-SP-4) |

### 3.3 Pruebas desactualizadas, obsoletas y flaky

| ID | Requerimiento |
| --- | --- |
| RQ-P-01 | Las pruebas desactualizadas se corrigen para reflejar la UI y el contrato vigentes, sin relajar la aserción que les da sentido (no reemplazar `toBeVisible` por `toBeAttached`, ni ampliar timeouts como arreglo) |
| RQ-P-02 | Las obsoletas se eliminan citando el commit o la decisión que retiró el flujo |
| RQ-P-03 | Las flaky se corrigen en su causa (espera de red, foco diferido, orden). Si no se encuentra la causa en el bloque, van a cuarentena |

### 3.4 Regresiones de producto (sujeto a D-SP-5)

| ID | Requerimiento |
| --- | --- |
| RQ-R-01 | En módulos ya auditados y cerrados (MOD04, MOD05, MOD06, Settings), la regresión se corrige en esta fase con su test |
| RQ-R-02 | En módulos con auditoría pendiente (Inventario y WFM), la prueba va a cuarentena con el hallazgo documentado para el turno de ese módulo; no se corrige producto fuera de turno |

### 3.5 Cuarentena (sujeto a D-SP-2)

| ID | Requerimiento |
| --- | --- |
| RQ-Q-01 | Mecanismo único: `test.fixme(true, 'QUARANTINE: <id>')` más una fila en `e2e/QUARANTINE.md` con id, spec, test, categoría, motivo, dueño y fecha límite (máximo 30 días) |
| RQ-Q-02 | Un script del repo cuenta las cuarentenas y falla si el número supera el tope versionado, o si hay un `QUARANTINE:` sin fila o una fila sin `test.fixme` |
| RQ-Q-03 | El tope inicial es el número de cuarentenas al cerrar esta fase, y **solo puede bajar** |

### 3.6 Job E2E bloqueante (sujeto a D-SP-1)

| ID | Requerimiento |
| --- | --- |
| RQ-J-01 | El job pasa a llamarse «E2E portal» y deja de tener `continue-on-error` y `|| true`: cualquier fallo no cuarentenado lo pone en rojo |
| RQ-J-02 | El job corre el script de RQ-Q-02 y publica en el resumen: pasadas, fallidas, omitidas (con motivo), cuarentenadas y flaky |
| RQ-J-03 | `retries: 0` en CI: un flaky cuenta como fallo |
| RQ-J-04 | Se retira `E2E_PORTAL_DEBT_BASELINE` |

### 3.7 B5 e integración (sujeto a D-SP-6)

| ID | Requerimiento |
| --- | --- |
| RQ-B-01 | B5 arma su esquema de prueba ejecutando las migraciones del runner tenant sobre un esquema efímero, en lugar de clonar un tenant existente con `LIKE` |
| RQ-B-02 | B5 corre en el job «Integration tests — API» de CI con sus 17 tests y pasa |
| RQ-B-03 | El gate de ese job falla si alguna spec `*.postgres.integration.spec.ts` se omite completa sin figurar en una lista explícita de omisiones esperadas, con su motivo |

### 3.8 Cobertura de contratos

| ID | Requerimiento |
| --- | --- |
| RQ-C-01 | `ContractCard`, `ContractDetailDrawer`, `ConvertExpedienteToContractDialog` y `CreateContractDialog` superan el 80 % de líneas, con pruebas de comportamiento (acciones, estados de carga y error, permisos), no de implementación |
| RQ-C-02 | Las pruebas nuevas no usan temporizadores reales ni dejan advertencias `act()` |

## 4. Criterios de aceptación

| CA | Criterio |
| --- | --- |
| CA-SP-01 | Matriz de triaje completa: 125 de 125 clasificados, con dos corridas |
| CA-SP-02 | La suite E2E del portal en CI da 0 fallos no cuarentenados en dos corridas consecutivas sobre el mismo commit |
| CA-SP-03 | Cuarentena ≤ tope, con todas sus filas completas y ninguna vencida |
| CA-SP-04 | El job «E2E portal» es bloqueante: un fallo introducido a propósito en una rama de prueba local lo pone en rojo (evidencia anexada, sin commitear el fallo) |
| CA-SP-05 | B5: 17 de 17 en CI; el gate falla si se omite una spec no declarada |
| CA-SP-06 | Los cuatro componentes ≥80 % de líneas, con conteo real |
| CA-SP-07 | CI de `main` en verde, con el job E2E ya bloqueante, sobre el commit final |

## 5. Fuera de alcance

- La variación de cobertura de `InventoryCategoryDrawer` (es de Inventario, en su turno de auditoría).
- E2E de `apps/web` (otro job, que ya es bloqueante: E2E Web Admin Smoke).
- Un entorno con API real para las specs `-live`: requiere staging (G7 diferido hasta la beta, ADR-095).

## 6. Decisiones del CTO (G0) — aprobadas el 2026-10-20

**✅ Las seis decisiones se aprobaron con la recomendación de AI-EM-ARCH.** §3 y §4 quedan como contrato congelado.

| # | Decisión | Opciones | Recomendación de AI-EM-ARCH | Motivo |
| --- | --- | --- | --- | --- |
| D-SP-1 | Meta del job E2E | **A:** bloqueante con 0 fallos fuera de cuarentena. **B:** seguir informativo con un trinquete de fallos que solo baja | **A** | Un contador informativo ya demostró que nadie lo mira: subió de 100 a 127 sin consecuencias (H1-H2) |
| D-SP-2 | Cuarentena | Permitida con registro, dueño, fecha límite de 30 días y tope decreciente vs. prohibida | **Permitida y acotada** | Sin cuarentena, A exige arreglar en esta fase regresiones de módulos que aún no están en su turno (D-SP-5) |
| D-SP-3 | Specs `-live` sin credenciales en CI | Omitir con motivo vs. darles credenciales y un tenant en CI | **Omitir con motivo** | Necesitan una API real que el job no levanta (H3); se reactivan cuando exista staging |
| D-SP-4 | Capturas de referencia de Linux | Generarlas en el contenedor oficial de Playwright y revisarlas vs. retirar la comparación visual | **Generarlas y revisarlas** | La comparación visual de Settings es evidencia de identidad; generarla en Windows no sirve para el runner de Linux |
| D-SP-5 | Regresiones en módulos con auditoría pendiente | Cuarentena con hallazgo para su turno vs. corregir ahora | **Cuarentena** | Respeta el orden de auditoría módulo por módulo; Inventario tiene una base que no está limpia |
| D-SP-6 | Fixture de B5 | Construir el esquema con las migraciones vs. proveer en CI un tenant fuente migrado | **Migraciones** | Elimina la dependencia de un tenant vivo y del estado de la base local; es como ya funcionan las demás integraciones de E4 |
