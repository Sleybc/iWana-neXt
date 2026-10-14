# Informe — Privacy · Fase 1 · Q3Δ Solicitudes

**Versión:** 1.2  
**Fecha:** 2026-10-14  
**Agente:** AI-SR-FULL · Q3Δ  
**Estado:** Entregado; el gate final de API cubrió también el guard de identidad para traslado.

## Resultado

Se completaron A10, A11, A13, A17 y A19 en `apps/api/src/modules/privacy/requests/**`, `apps/api/src/modules/privacy/ports/contract-impersonation.port.ts` y `packages/shared/src/schemas/privacy/requests*`. Los bloqueos de traslado y lectura de evidencia del informe v1.1 quedan resueltos por los contratos versionados del prompt v1.2. No surgió una nueva divergencia contractual ni se emitió `[BLOQUEO]`.

`transfer` ahora persiste el nombre de la entidad receptora en `transferred_to`, el motivo en el evento y el canal de respuesta. La transición exige identidad verificada, de acuerdo con la restricción de la DDL. `GET /privacy/requests/:id/evidence` firma evidencia solo con el firmador dedicado de privacidad, requiere `privacy.manage`, fija `Cache-Control: no-store` y registra auditoría explícita sin PII. La firma dura 300 segundos.

La radicación de consultas y reclamos admite verificación posterior. `POST /privacy/requests/:id/verify-identity` fija método, fecha, actor y evidencia, añade un evento sin cambiar el estado y rechaza la repetición o los estados no permitidos. La suplantación exige Party, método y entre 1 y 20 contratos impugnados; pasa la selección y el mismo `EntityManager` transaccional a `IContractImpersonationPort`. La integración de esta sesión usa el stub, como corresponde antes de Q5.

Se publicaron `IPrivacyRequestsReadPort.dueCounts(today)` y `PrivacyRequestsService.markDesisted(today, manager)`. El conteo distingue vencidas, próximas a vencer dentro de dos días hábiles y tareas de suplantación vencidas. El desistimiento actualiza y agrega el evento de forma idempotente, con actor nulo y auditoría de sistema.

No se editaron entidades ni migraciones, `privacy.module.ts` o archivos de CRM: pertenecen a Q1, Q2/Q5/Q6. Q2 actualizó la documentación OpenAPI de las rutas nuevas en su superficie.

## Criterios y evidencia

| Criterio                    | Resultado                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A10 — traslado              | Operativo y persistido; integración PostgreSQL comprueba estado, destino, canal y motivo.                                 |
| A11 — lectura de evidencia  | Ruta dedicada con permiso, firma de 300 s, `no-store`, 404 cuando falta evidencia y auditoría sin PII.                    |
| A13 — verificación diferida | Consulta/reclamo aceptan radicación sin método; endpoint de verificación prueba persistencia, evento y conflictos.        |
| A17 — suplantación          | DTO exige Party, método y contratos impugnados; el stub recibe IDs seleccionados y manager transaccional.                 |
| A19 — alertas               | `dueCounts` cubre vencimientos con calendario hábil; `markDesisted` se prueba idempotente con fechas que cruzan festivos. |
| R1–R6 y A2–A6 de v1.1       | Se conservan las reglas previas; las pruebas anteriores siguen dentro del gate API.                                       |

## Verificación

| Comando                                                                                                                        | Resultado real                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @iwana/api typecheck`                                                                                           | Correcto.                                                                                                                                                             |
| `pnpm --filter @iwana/shared typecheck`                                                                                        | Correcto.                                                                                                                                                             |
| Jest de `packages/shared/src/schemas/privacy/requests.spec.ts`                                                                 | 1 suite, 6 tests pasaron.                                                                                                                                             |
| Jest de `requests.service.postgres.integration.spec.ts` con `IWANA_DB_INTEGRATION_AVAILABLE=true` contra `127.0.0.1:5433/dbiw` | PostgreSQL real; schema efímero; 1 suite, 9 tests pasaron. Incluye traslado, identidad diferida, lectura de evidencia, contratos impugnados, conteos y desistimiento. |
| ESLint de los archivos TypeScript propiedad de Q3Δ                                                                             | Correcto.                                                                                                                                                             |
| `pnpm exec turbo run test --filter=@iwana/api --force`                                                                         | 350 suites pasaron, 4 omitidas; 4.847 tests pasaron, 15 omitidos; 0 cache hits, 4 tareas exitosas.                                                                    |

El gate final de API, ejecutado por Q5 después del guard, valida que el traslado se rechace si la identidad aún no está verificada, condición de la DDL para ese estado. La evidencia PostgreSQL (1 suite/9 tests) y shared (1 suite/6 tests) se conserva. No se hicieron commits.

## Deuda por severidad

| Severidad                    | Hallazgo                                                                                                                                                                                                         | Resolución requerida                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **P2 · dependencia de fase** | El stub de `IContractImpersonationPort` debe sustituirse por el adaptador CRM, que valida pertenencia y suspende contratos en la misma transacción. `IContractStandingReadPort` también espera su adaptador CRM. | Q5 implementa ambos adaptadores y cubre R5 de extremo a extremo. |
| **P2 · documental**          | Sigue pendiente el HLD de Privacy antes de G7, según el plan v1.2.                                                                                                                                               | AI-EM-ARCH emite `HLD-PRIVACY-v1.0`.                             |

No quedan bloqueos P1 de contrato atribuibles a Q3Δ.
