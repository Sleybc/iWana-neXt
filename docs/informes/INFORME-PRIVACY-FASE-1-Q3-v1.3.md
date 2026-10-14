# INFORME — Privacy Habeas Data · Fase 1 · Q3Δ2

**Versión:** 1.3  
**Fecha:** 2026-10-14  
**Estado:** Entregado  
**Alcance:** Adenda A22 en el servicio de solicitudes; sin cambios de contrato ni de migración.

## Resultado

`transfer` permite trasladar una solicitud sin identidad verificada. `reject` admite el rechazo sin identidad únicamente con `legalBasis = SOLICITANTE_NO_LEGITIMADO`; cualquier otro fundamento devuelve HTTP 422 con código `PRIVACY_REQUEST_IDENTITY_REQUIRED`. `complete` conserva el requisito de identidad y su guardia existente.

La validación ocurre antes de las comprobaciones de conservación y de cualquier escritura de rechazo, por lo que un rechazo no permitido no deja cambios. Los schemas compartidos no necesitaron modificaciones.

Cuando la identidad está pendiente, `SOLICITANTE_NO_LEGITIMADO` también prevalece sobre la regla R3/R4 de conservación: el servicio omite la consulta de titularidad y retención, que presupone identificar al titular. Una prueba de regresión cubre `SUPRIMIR` con un Party vinculado, pero identidad pendiente.

## Evidencia

| Verificación                                                                              | Resultado real                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prueba unitaria A22                                                                       | 1 suite, 5 tests aprobados: rechazo por falta de legitimación, prioridad frente a R3/R4, rechazo por otro fundamento, traslado sin identidad y guardia de `complete`.                                                                                                                                                 |
| Integración de solicitudes contra PostgreSQL real (`127.0.0.1:5433/dbiw`, schema efímero) | 1 suite, 10 tests aprobados. El fixture incluye los dos CHECK de A22; verifica persistencia de `NO_PROCEDENTE` permitido y `TRASLADADA` sin identidad, 422 sin escritura para otro fundamento y el requisito de identidad para completar. Se ejecutó después de que Q1Δ2 confirmara `up/down/up` de la migración 146. |
| `pnpm exec turbo run test --filter=@iwana/api --force`                                    | 351 suites aprobadas, 4 omitidas; 4.852 tests aprobados, 15 omitidos; 4 tareas exitosas, 0 en caché.                                                                                                                                                                                                                  |
| `pnpm --filter @iwana/api typecheck`                                                      | Correcto.                                                                                                                                                                                                                                                                                                             |
| ESLint y Prettier de los tres archivos de Q3Δ2                                            | Correctos.                                                                                                                                                                                                                                                                                                            |

## Deuda nueva por severidad

Ninguna.

Sigue pendiente, como deuda documental heredada del informe Q3 v1.2 y del plan, emitir `HLD-PRIVACY-v1.0` antes de G7 (P2). No se hicieron commits.
