# Informe MOD11 — consola de registro de material Q1 · SR-QA

**Versión:** 1.0  
**Fecha:** 2026-10-11  
**Estado:** **NO-GO — la vista autenticada del API no coincide con `tenant_iwana`**  
**Commit/PR:** no creados.

## Resumen

La sesión autenticada quedó disponible con rol `TECHNICIAN` y esquema `tenant_iwana`. La bandeja mostró OTE-20260828-001 y abrí su detalle. La respuesta nueva del API y la consola muestran «Instalación estándar v1» con tres requisitos; la fila de esa misma orden en PostgreSQL, esquema `tenant_iwana`, conserva la v3 con seis requisitos que exige Q1. Recargué y volví a abrir el detalle: el API respondió HTTP 200 y volvió a entregar v1.

La discrepancia es bloqueante para una prueba de escritura: no registré el router ni consumibles contra una plantilla diferente a la aprobada. La consulta de solo lectura confirma 0 usos en la orden, `XC220-TEST-0031` en `ASSIGNED_TO_TECHNICIAN` y 0 comodatos abiertos. No hubo POST de material ni cambios de datos en esta reanudación.

## Preflight y evidencia de divergencia

| Fuente | OTE-20260828-001 | Requisitos |
| --- | --- | --- |
| PostgreSQL `tenant_iwana.execution_orders` | `IN_PROGRESS`, versión 7, plantilla «Instalación estándar v3», versión de plantilla 3 | Seis claves: `installed-equipment`, `service-test`, `work-photo`, `CUSTOMER_SIGNATURE`, `installation-activity`, `installation-materials` |
| API autenticada `GET /api/v1/tasks/execution-orders/{id}` | HTTP 200, `IN_PROGRESS`, versión 7, plantilla «Instalación estándar v1», versión de plantilla 1 | Tres claves: `installation-activity`, `work-photo`, `CUSTOMER_SIGNATURE` |
| Consola del portal tras recarga y reapertura | «Instalación estándar v1 · v1» | Muestra actividad, evidencia fotográfica y firma; no presenta el snapshot v3 esperado |
| Sesión | Rol `TECHNICIAN`, `schemaName=tenant_iwana` | Identidad y ámbito coinciden con la prueba autorizada |

La consulta posterior, de solo lectura, encontró 0 registros en `execution_order_item_usage` para la OT, el serial aún asignado al técnico y 0 filas de préstamo abiertas para ese serial.

## Resultado por criterio de Q1

| Criterio | Resultado | Evidencia / límite |
| --- | --- | --- |
| 1. Registrar `XC220-TEST-0031`; confirmar, retirarlo de la lista, requisito «Cumplido» y comodato abierto | **Bloqueado; no ejecutado** | La fuente que serviría el registro muestra plantilla v1 y no ofrece el requisito `installed-equipment` de la v3. La base confirma 0 usos y 0 comodatos abiertos. |
| 2. Registrar 2 patchcord y 1 roseta como registros separados; confirmar saldos 4→2 y 2→1 | **Bloqueado; no ejecutado** | No se enviaron POST de consumibles. La orden no presenta `installation-materials` desde el API autenticado. |
| 3. Forzar fallo y demostrar reintento sin duplicado | **No ejecutado** | No es seguro ejercitar idempotencia sobre una orden cuya plantilla servida contradice el preflight. |
| 4. Ver 375/1280 px, tema claro/oscuro, teclado/foco y hoja dentro de 812 px | **Pendiente** | No se completó el flujo autenticado de material. Las capturas existentes son únicamente de la pantalla pública de inicio de sesión. |
| 5. Regresión del historial, reverso y tres pantallas con `RadioCardGroup` | **Automatizada aprobada; navegador pendiente** | Pasaron las suites frescas reportadas en el informe F; no se certifica regresión visual de navegador en esta corrida. |

## Criterios §16.6 y condiciones técnicas

Las suites de la ola 2 continúan aportando evidencia automatizada, no sustituyen el recorrido real de Q1. La discrepancia de la plantilla impidió evaluar en UI los ocho criterios de §16.6 y estas condiciones durante la operación:

- Presentación elegida por `trackingMode`.
- Registro de filas en serie, con versión vigente antes de cada envío y un reintento ante `412`.
- Clave de idempotencia estable por fila, reutilizada al reintentar.

## Regresión ejecutada previamente

Las corridas frescas y sin caché reportadas por F1/F2 fueron:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/portal exec jest --no-cache --runInBand src/components/operations/ --reporters=summary` | 44 suites, 780 tests aprobados |
| `pnpm --filter @iwana/portal exec jest --no-cache --runInBand src/components/inventory/QuoteShippingFields.spec.tsx src/components/commercial/catalog/PlanCatalogFormPeek.spec.tsx src/components/scheduling/ExhaustedAttemptsDecisionDialog.spec.tsx --reporters=summary` | 3 suites, 8 tests aprobados |
| `pnpm --filter @iwana/ui exec jest --no-cache --runInBand src/components/RadioCardGroup.spec.tsx --reporters=summary` | 1 suite, 4 tests aprobados |
| `pnpm --filter @iwana/portal exec jest --no-cache --runInBand src/lib/api-client.spec.ts --reporters=summary` | 1 suite, 18 tests aprobados |

Jest emitió avisos conocidos de `ts-jest` (`allowJs`) y deprecación de `punycode`; no causaron fallos. El informe F también registró `typecheck --force` 8/8 y `audit-ui.mjs` sin hallazgos.

## Evidencia visual disponible

Estas capturas del intento previo documentan solo la página pública de login; no demuestran responsive ni estados de la consola de materiales:

- [Login, 375×812, tema claro](assets/MOD11-Q1-login-375x812-light.png)
- [Login, 375×812, tema oscuro](assets/MOD11-Q1-login-375x812-dark.png)
- [Login, 1280×812, tema claro](assets/MOD11-Q1-login-1280x812-light.png)
- [Login, 1280×812, tema oscuro](assets/MOD11-Q1-login-1280x812-dark.png)
- [Foco por teclado en login, 375×812](assets/MOD11-Q1-login-focus-375-light.png)
- [Captura inicial del portal](assets/MOD11-Q1-00-login.png)

No se añadieron capturas autenticadas de la hoja: el detalle no expone la v3 necesaria para el recorrido aprobado y no se avanzó con acciones de material.

## Dictamen y condición de reanudación

**Q1 queda en NO-GO.** La sesión ya no es el bloqueo. Para reanudar, el `GET /api/v1/tasks/execution-orders/{id}` del portal debe servir en `tenant_iwana` la versión 3 y las seis claves del snapshot que existen en PostgreSQL. Después hay que recargar la consola, confirmar que ambos lados coinciden y repetir el preflight de serial, usos y existencias antes de emitir cualquier registro.

No se modificó código ni se creó un commit.
