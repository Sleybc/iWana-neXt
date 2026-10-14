# INFORME — Privacy Fase 1a · R5

**Versión:** 1.0  
**Fecha:** 2026-10-14  
**Responsable:** AI-SR-FULL  
**Estado:** COMPLETO

## Resultado

`sanitizeResponse()` ahora incluye `partyId` (`string | null`) en todas las respuestas que usan la lista blanca, incluida la respuesta de detalle y la ficha 360°. La propiedad se mantiene dentro del objeto del suscriptor en la envoltura `{ data }` existente. No se añadió a registros de auditoría ni a logs.

Se añadieron verificaciones de controlador para `partyId` presente y nulo en el detalle y en la ficha 360°. También se serializa la entrada de auditoría en las pruebas y se comprueba que no contenga el nombre de campo ni el valor del identificador.

## Verificación

| Comando                                                                                                                      | Resultado                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @iwana/api exec jest --runInBand --no-cache src/modules/crm/subscribers/tests/subscribers.controller.spec.ts` | 1 suite aprobada, **21 tests aprobados**.                                                                                         |
| `pnpm exec turbo run test --filter=@iwana/api --force`                                                                       | **372 suites aprobadas**, 4 omitidas; **4.963 tests aprobados**, 15 omitidos. Turbo: 4 tareas exitosas, **0 cache hits**. Exit 0. |

La ruta del informe estaba libre antes de crearlo. No se modificaron archivos fuera de la propiedad R5, ni se detectó deuda nueva en el alcance de este bloque.
