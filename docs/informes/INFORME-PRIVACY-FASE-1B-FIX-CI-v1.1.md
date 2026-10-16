# Informe — Corrección del CI de privacidad Fase 1b · portal · v1.1

**Fecha:** 2026-10-16  
**Agente:** `fe-platform`  
**Base indicada por el prompt:** `main` en `8f393c1d`  
**Ruta del informe:** verificada libre antes de crear este archivo.

## Resultado

Se corrigieron las fixtures del detalle de expediente para incluir `privacyRestricted: false`, `privacyMarks: []`, `anonymizedAt: null` y `anonymizedRequestId: null`. Se añadió una prueba que elimina `privacyRestricted` del bootstrap sintético y fija el comportamiento fail-closed: aparece «Datos bloqueados», no se muestra el valor personal sintético y no se solicita el detalle pesado.

`page.tsx` y los contratos permanecen intactos. El mock local de `ExpedienteHeader` ahora reproduce su redacción cuando recibe `privacyRestricted`; la cobertura propia del componente real se mantiene en su spec. En tres casos existentes de roles se precisó la aserción: se permite la consulta de `privacy.read` para decidir la presentación del enlace de privacidad y se comprueba que no se consulta `crm.subscribers.manage`. No se retiraron aserciones de acceso a acciones ni de ausencia de llamadas de conversión.

## Evidencia de pruebas

La reproducción anterior al cambio en la spec de la página dio **30 fallos, 1 aprobado, 31 tests**: el bootstrap sin `privacyRestricted` se trataba como bloqueado. Tras el cambio, la spec completa pasó con **1 suite y 32 tests aprobados**.

| Verificación                                       | Resultado                                                                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @iwana/portal exec jest --no-cache` | **303 suites aprobadas**; **3.042 tests aprobados, 1 omitido, 3.043 total**; 0 snapshots; salida 0.                                            |
| `pnpm --filter @iwana/portal typecheck`            | Pasó (`tsc --noEmit`), salida 0.                                                                                                               |
| `pnpm exec turbo run test --force --continue`      | **10/10 tareas exitosas; 0 en caché; salida 0.** Las tareas incluyen dependencias de build de Turbo además de los paquetes con suites de test. |

Totales observados en los paquetes con tarea `test` durante la corrida Turbo:

| Paquete         |                                Suites |                                      Tests |
| --------------- | ------------------------------------: | -----------------------------------------: |
| `@iwana/api`    | 383 aprobadas, 4 omitidas (387 total) | 5.204 aprobados, 15 omitidos (5.219 total) |
| `@iwana/db`     |                          67 aprobadas |                              397 aprobados |
| `@iwana/portal` |                         303 aprobadas |   3.042 aprobados, 1 omitido (3.043 total) |
| `@iwana/shared` |                          19 aprobadas |                              173 aprobados |
| `@iwana/ui`     |                           5 aprobadas |                               34 aprobados |
| `@iwana/web`    |                          36 aprobadas |                              229 aprobados |
| `@iwana/worker` |                          20 aprobadas |                              169 aprobados |

`@iwana/config` y `@iwana/storage` no declaran script `test`, por lo que no tienen suites ni conteos de test que reportar.

Jest emitió en Turbo el aviso de terminación forzada de un worker del portal; el paquete y el comando completo terminaron con éxito. La corrida completa del portal también terminó con código 0.

## Inventario de otras fixtures del portal

- `apps/portal/src/components/crm/expedientes/sections/ExpedienteSections.spec.tsx`: la fixture base se construye con solo `id` y `documentSupports`, y se fuerza a `ExpedienteRecord`. Omite `privacyRestricted`, `privacyMarks`, `anonymizedAt` y `anonymizedRequestId`. El componente verifica `privacyRestricted` por truthiness; por eso la omisión no equivale al valor bloqueado. Es una deuda preexistente de fixture y prueba, no se modificó en este encargo.
- `apps/portal/src/components/crm/expedientes/SeguimientoTab.spec.tsx`: los casos pasan un `Pick<ExpedienteDetailSummary>` limitado a campos operativos. No son fixtures completos del expediente ni prueban su guarda de privacidad.
- `apps/portal/src/components/crm/subscribers/crm-contract-dialogs.portal.spec.tsx`, `mod05-iva-punto-servicio-ui.spec.tsx` y `stratum-evidence-upload.portal.spec.tsx`: usan `Subscriber360Response['expedienteSummary']`. La forma declarada actualmente para ese resumen no incluye los campos de privacidad del expediente completo; no se añadieron campos al contrato.
- `apps/portal/src/components/crm/expedientes/ExpedienteConversionBanner.spec.tsx`: el `subscriberSummary` es una proyección `ExpedienteSubscriberSummary` con `id`, `status` y `fullName`, sin los campos de privacidad. Su tipo actual no la define como detalle completo.

Las fixtures completas de suscriptor revisadas ya incluyen los indicadores aplicables a su tipo (`privacyRestricted`, `anonymizedAt` y `anonymizedRequestId`). Las fixtures de contrato revisadas incluyen `titularAnonymizedAt`.

## Deuda

- **Deuda nueva introducida:** ninguna (P0: 0, P1: 0, P2: 0, P3: 0).
- **Hallazgo preexistente P2:** la fixture parcial de `ExpedienteSections.spec.tsx` no modela privacidad y la guarda del componente no trata la ausencia de `privacyRestricted` como bloqueada. Conviene completar esa fixture y fijar el caso fail-closed en una tarea posterior.
- Las proyecciones parciales restantes quedan inventariadas como tales; para ampliar sus campos se requiere una decisión de contrato fuera del alcance de esta corrección.

## Alcance de cambios

En este encargo se modificó únicamente `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.spec.tsx` y se creó este informe. No se modificaron contratos ni `page.tsx`; todos los valores añadidos a fixtures son sintéticos. No se creó commit.
