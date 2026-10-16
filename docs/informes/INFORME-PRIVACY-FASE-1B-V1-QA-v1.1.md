# Informe V1 QA — Privacy Fase 1b

**Fecha:** 2026-10-16  
**Estado:** Suite escrita; ejecución bloqueada por precondición de base no verificable.  
**Plan:** `docs/plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md` v1.3  
**Prompt:** `PROMPT-PRIVACY-FASE-1B-v1.3.md`; launcher `PROMPT-PRIVACY-FASE-1B-LAUNCH-v1.4.md`  
**Propiedad V1:** `e2e/tests/portal-privacy-fase-1b-live.spec.ts` e informe presente.

## Resultado

Se escribió una suite Playwright contra la API y el portal reales. Los cuatro escenarios cubren:

1. Prospecto sin Party → solicitud `SUPRIMIR` → vista previa → resolución → expediente, visita, evento, orden de trabajo y orden de ejecución anonimizados; solicitud, historial y consentimiento conservados; encabezado e insignia visibles.
2. Ex suscriptor dentro de retención → rechazo `DEBER_LEGAL_CONSERVACION` → listado redactado, búsqueda por documento y texto sin coincidencia, y mutación bloqueada. Los seis subrecursos devuelven 403 sin permiso especial y 200 para `privacy.read` y `crm.blocked_data.read`, con auditoría por `ExpedienteRecord`, id del expediente, cinco acciones `LIST_ACCESS` y una `RECORD_ACCESS` por permiso.
3. Contrato vigente → rechazo `DEBER_CONTRACTUAL` sin marca de bloqueo; el detalle y el timeline continúan disponibles.
4. Traslado radicado 45 días antes → insignia «Traslado extemporáneo».

La fixture usa valores aleatorios por corrida y nombres/direcciones/correos de prueba; los actores creados por API se eliminan en `afterEach`. La suite requiere variables de entorno explícitas `E2E_PRIVACY_ADMIN_EMAIL` y `E2E_PRIVACY_ADMIN_PASSWORD`; no hay fallback a credenciales de auditor. Antes de sembrar datos, exige rol `ADMIN` y permisos efectivos `privacy.manage` y `privacy.read`. El perfil contable se comprueba por su permiso de catálogo y por la lectura completa auditada.

## Matriz R1–R16 ↔ test

La matriz diferencia lo ejercitado por la nueva suite de las comprobaciones complementarias existentes en el código. Las referencias complementarias son localización de cobertura, no resultado de una ejecución de esta actuación.

| Requisito                                                             | Suite V1 / test asociado                                                                                                                                                                                                            | Límite y referencia complementaria                                                                                                                       |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 — rechazo legal bloquea; contractual no                            | Escenarios 2 y 3.                                                                                                                                                                                                                   | Casos del servicio PostgreSQL: `requests.service.postgres.integration.spec.ts:568`, `:606`.                                                              |
| R2 — confirmar y anonimizar en transacción                            | Escenario 1 envía `confirm: true` y los IDs de la vista previa; verifica la salida anonimizada.                                                                                                                                     | El rollback por residuales y por fallo de auditoría no se provoca en el E2E: integración `requests.service.postgres.integration.spec.ts:287`, `:328`.    |
| R3 — prospecto sin Party                                              | Escenario 1 crea prospecto sin `partyId`, espera el expediente candidato y resuelve.                                                                                                                                                | No cubre colisión HMAC con suscriptor; CLI tiene prueba de prospecto en `anonymize-titular.postgres.integration.spec.ts:330`.                            |
| R4 — lista de candidatos coincide en resolve                          | Escenario 1 repite en `resolve` exactamente los IDs devueltos por la vista previa.                                                                                                                                                  | No introduce una escritura concurrente entre vista previa y resolución; esta carrera no queda demostrada por V1.                                         |
| R5 — cuenta activa impide supresión                                   | No es un caso de esta suite.                                                                                                                                                                                                        | Prueba de participante/CLI `anonymize-titular.postgres.integration.spec.ts:664`; el bloqueo de cuenta activa no se ejecutó en esta actuación.            |
| R6 — conservar solicitud, eventos, autorizaciones, marcas y registros | Escenario 1 consulta la solicitud resuelta y su evento, y conserva el consentimiento aceptado.                                                                                                                                      | La suite no inspecciona directamente tablas internas; conservación de evidencia de autorización en `anonymize-titular.postgres.integration.spec.ts:535`. |
| R7 — anonimización operativa WFM/tasks                                | Escenario 1 comprueba visita, evento, orden de trabajo y orden de ejecución.                                                                                                                                                        | Cadena completa y relaciones WFM/tasks en `anonymize-titular.postgres.integration.spec.ts:907`.                                                          |
| R8 — datos redactados o completos según permiso y lectura auditada    | Escenario 2 valida listado y 360 redactados para SALES, TECHNICIAN y ACCOUNTANT sin perfil; seis subrecursos 403/200 y auditoría para ambos permisos de lectura.                                                                    | HTTP de seis rutas y permisos: `expedientes.controller.fase2.http.spec.ts:223`, `:277`; `subscribers.controller.fase2.http.spec.ts:415`.                 |
| R9 — búsqueda excluye titular bloqueado                               | Escenario 2 hace búsqueda exacta por documento y búsqueda libre por texto; ambas excluyen al suscriptor.                                                                                                                            | —                                                                                                                                                        |
| R10 — bloqueo de mutaciones, incluso con permiso de lectura           | Escenario 2 espera 409 `PRIVACY_DATA_BLOCKED` al editar con SALES y con ACCOUNTANT que tiene el perfil contable.                                                                                                                    | Cobertura HTTP de mutaciones de expediente/suscriptor: `expedientes.controller.fase2.http.spec.ts:387`; `subscribers.controller.fase2.http.spec.ts:472`. |
| R11 — traslado tardío derivado del evento                             | Escenario 4 verifica la insignia «Traslado extemporáneo» en portal.                                                                                                                                                                 | La ejecución del traslado depende de la API real y no se realizó por el bloqueo descrito abajo.                                                          |
| R12 — bloqueo derivado de marcas, sin puerto legado                   | Escenario 2 usa una solicitud rechazada por retención y verifica los accesos bloqueados.                                                                                                                                            | Búsqueda estática `rg -n "IPersonalDataBlockPort" apps packages`: sin coincidencias (exit code 1). No es una prueba de runtime.                          |
| R13 — CLI comparte participantes                                      | No es un caso de la suite API/portal.                                                                                                                                                                                               | CLI de prospecto e idempotencia: `anonymize-titular.postgres.integration.spec.ts:330`.                                                                   |
| R14 — contratos/cotizaciones anonimizados y conservados               | No se crea contrato en el flujo de supresión del prospecto; el contrato vigente del escenario 3 solo se rechaza.                                                                                                                    | Prueba CLI de contratos/cotizaciones: `anonymize-titular.postgres.integration.spec.ts:756`.                                                              |
| R15 — marca de anonimización visible                                  | Escenario 1 verifica `anonymizedAt`, encabezado «Anonimizado» e insignia «Titular anonimizado».                                                                                                                                     | Componente cubierto por `ExpedienteHeader.spec.tsx:42`; V1 no ejecutó ese test unitario.                                                                 |
| R16 — perfil contable permite leer datos bloqueados                   | Escenario 2 asigna perfil de facturación a ACCOUNTANT, comprueba 200, PII completa en 360 y `grantedBy: CRM_BLOCKED_DATA_READ`; sin ese perfil, ACCOUNTANT queda redactado/bloqueado. SALES y TECHNICIAN también quedan bloqueados. | Catálogo del permiso en `access-permission-catalog.invariant.spec.ts:292`; esos tests no se ejecutaron aquí.                                             |

## Verificación ejecutada

- La ruta del informe estaba libre antes de escribirlo: `Test-Path docs/informes/INFORME-PRIVACY-FASE-1B-V1-QA-v1.1.md` → `False`.
- `pnpm exec prettier --write e2e/tests/portal-privacy-fase-1b-live.spec.ts` → exit code 0; archivo sin cambios de formato.
- `pnpm exec eslint e2e/tests/portal-privacy-fase-1b-live.spec.ts` → exit code 0; sin hallazgos.
- Comprobación de `api()` frente a productores: `/crm/subscribers/search` devuelve `{ data: rows[] }` tanto en búsqueda exacta como libre; `/crm/subscribers` también proyecta filas en `data`. `/audit-logs` responde `{ data, nextCursor, total }`. `api()` desenvuelve `data`, por eso la suite trata esos resultados como arreglos.
- Las seis rutas de `ExpedientesController` registran `ExpedienteRecord` e id de expediente; cinco usan `LIST_ACCESS` y la descarga de archivo usa `RECORD_ACCESS`.
- El selector «Anonimizado» corresponde al `<h2>` de `ExpedienteHeader`; el texto «Titular anonimizado» lo produce `PrivacyAnonymizedBadge`.
- `findAuditEntries` filtra `entityType=ExpedienteRecord` y el mismo `entityId` usado por las seis rutas; la auditoría del 360 de suscriptor consulta `entityType=Subscriber` y el id del suscriptor.

## [BLOQUEO] Ejecución E2E

El launcher exige esperar a B1/B3/B4 y a la migración de `dbiw` hasta tenant 151. La comprobación de base fue de solo lectura y falló antes de poder consultar la migración: `connect ECONNREFUSED 127.0.0.1:5432`. No hay evidencia de que el tenant de prueba esté en 151.

Por esa precondición, no se arrancó API ni se ejecutó Playwright, no se sembraron fixtures y no se obtuvo conteo real de suites/tests. El comando de ejecución pendiente, cuando se acredite la precondición, es:

```powershell
pnpm exec playwright test --config=e2e/playwright.portal.config.ts e2e/tests/portal-privacy-fase-1b-live.spec.ts --retries=0
```

No se hicieron cambios de producto o contratos, no se guardaron PII, ciphertext, HMAC ni claves reales y no se creó commit.
