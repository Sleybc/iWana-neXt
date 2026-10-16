# [SEC-REVIEW] Informe V2″ — Privacy Fase 1b

**Fecha:** 2026-10-16  
**Revisor:** AI-SEC-ENG (`sec-eng`)  
**Base revisada:** `aeedeffc..0af184d4` (`HEAD`) más los cambios locales no confirmados de B3  
**Resultado:** **GO G4**, con una observación P2 no bloqueante

## Alcance y método

Se leyeron `AGENTS.md`, `.github/copilot-instructions.md`, el plan v1.4, los prompts de Fase 1b v1.0–v1.4, el launcher v1.5 y las skills `security-auditor` y `backend-security-coder`. Se inspeccionaron por separado el rango de commits y el working tree actual; las guardas R10 revisadas están en cambios locales, no en `HEAD`.

Se hizo inventario de cada handler mutante (`POST`, `PATCH`, `PUT`, `DELETE`) de `SubscribersController`, `ContractsController` y `ExpedientesController`, y se revisaron el decorador/guard dueño de cada módulo, la prueba por reflexión, la prueba HTTP de mutaciones y los cambios de fixture de H12. No ejecuté suites en esta revisión. B3 reporta **8 suites, 283 pruebas aprobadas, 0 fallos**, incluidas **68 pruebas** del fixture HTTP de expedientes; la corrida completa de API y Turbo sigue coordinada por la raíz. La ruta del informe estaba libre al comprobar `Test-Path docs/informes/INFORME-PRIVACY-FASE-1B-V2-SEC-v1.2.md` (`False`). No edité código ni pruebas, no hice commit y no incluí PII, ciphertext, HMAC ni claves reales.

## R10 — inventario de rutas mutantes

El inventario actual contiene 32 handlers mutantes: 29 tienen `@GuardBlockedTitular(...)`; los tres restantes coinciden con las excepciones cerradas de v1.4.

| Controller | Rutas con guarda y resolver |
| --- | --- |
| Suscriptores | `PATCH /crm/subscribers/:id` (`params.id`); `PATCH /crm/subscribers/:id/section/:section` (`params.id`); `DELETE /crm/subscribers/:id` (`params.id`); `PATCH /crm/subscribers/:id/status` (`params.id`). Decoradores: `subscribers.controller.ts:422-483`. |
| Contratos | `POST /crm/subscribers/:subscriberId/contracts` (`params.subscriberId`); `POST /crm/subscribers/:subscriberId/contracts/from-expediente` (`params.subscriberId`); `POST /crm/contracts` (`body.subscriberId`); `PATCH /crm/contracts/:id`; `PATCH /crm/contracts/:id/service-point`; `POST /crm/contracts/:id/stratum-evidence`; `DELETE /crm/contracts/:id/stratum-evidence`; `DELETE /crm/contracts/:id`; `POST /crm/contracts/:id/{activate,suspend,reactivate,terminate,archive}` (estas usan `params.id`). Decoradores: `contracts.controller.ts:70-457`. |
| Expedientes | `PATCH /crm/expedientes/:id/sections/:section`; `PATCH /crm/expedientes/:id/status`; `POST /crm/expedientes/:id/reactivate`; `POST /crm/expedientes/:id/retry-conversion`; `POST /crm/expedientes/:id/document-supports/:documentKey/upload`; `PATCH /crm/expedientes/:id/document-supports/:documentKey/:versionId/status`; `DELETE /crm/expedientes/:id/document-supports/:documentKey/:versionId`; `POST /crm/expedientes/:id/contact-attempts`; `POST /crm/expedientes/:id/consents`; `PATCH /crm/expedientes/:id/consents/:consentId/revoke`; `POST /crm/expedientes/:id/coverage-checks`; `PATCH /crm/expedientes/:id/installation-operational-refs`. Todas usan `params.id`; decoradores: `expedientes.controller.ts:302-740`. |

Las únicas excepciones son `POST /crm/subscribers` y `POST /crm/expedientes` (creación nueva, D-H15 queda como deuda explícita), y `POST /crm/subscribers/search` (lectura). Coinciden exactamente con `CLOSED_EXCEPTIONS` en `apps/api/src/modules/crm/tests/crm-blocked-mutations.arch.spec.ts:13-17`.

### Guards y resolución del titular

Los decoradores locales de cada módulo adjuntan la metadata `privacy:blocked-titular-guard` y `UseGuards` con su guard dueño: suscriptores (`subscribers/guards/guard-blocked-titular.decorator.ts:1-15`), contratos (`contracts/guards/guard-blocked-titular.decorator.ts:1-15`) y expedientes (`expedientes/guards/guard-blocked-titular.decorator.ts:1-17`). Las instancias están registradas en sus respectivos módulos (`subscribers.module.ts:21,41`; `contracts.module.ts:13,26`; `expedientes.module.ts:28,56`).

Los guards resuelven `params.id`/`params.subscriberId`/`body.subscriberId` según la ruta, validan UUID y consultan el titular dentro del tenant. Si hay `DATOS_BLOQUEADOS` activo y el titular no está anonimizado, lanzan 409 `PRIVACY_DATA_BLOCKED` antes del handler; no consultan el permiso de lectura especial. La ausencia del puerto de marcas en contratos o expedientes produce 503, y los errores de consulta se propagan; no hay fallback que permita la escritura (`subscribers-blocked-titular.guard.ts:21-55`; `contracts-blocked-titular.guard.ts:15-53`; `expedientes-blocked-titular.guard.ts:20-54`). Las ramas de anonimización permiten operar porque R10 no bloquea titulares ya anonimizados.

## Prueba por reflexión

`crm-blocked-mutations.arch.spec.ts:19-55` recorre los métodos propios de los tres controllers, usa `METHOD_METADATA` y `PATH_METADATA`, y considera mutantes `POST`, `PATCH`, `PUT` y `DELETE`. Para cada ruta no exceptuada, agrega la firma a `missing` si falta la metadata de bloqueo o si no hay guards de método; `expect(missing).toEqual([])` hace fallar la suite. Por tanto, una nueva ruta mutante sin `@GuardBlockedTitular` entra al inventario y rompe la prueba. La inspección del código confirma los 29 decoradores actuales y las tres excepciones cerradas.

La prueba HTTP añadida ejercita cinco familias (transición, borrado, subrecurso, contrato y suscriptor) con SALES, ACCOUNTANT que posee `crm.blocked_data.read` y un actor con `privacy.read`; devuelve 409 y verifica que los spies de mutación no se llamen (`crm-blocked-mutations.http.spec.ts:159-216`). El test conserva una verificación independiente de 403 cuando ACCOUNTANT no supera el RBAC real (`:218-229`). Esto cubre las dos transiciones que motivaron H11 y confirma que los permisos de lectura no eximen R10.

## H12 — fixture HTTP y fuerza de las aserciones

Los fixtures HTTP de fase 2 proveen `DataSource`, `QueryRunner`, contexto tenant y `AuditService.logWithin`. El test de lecturas autorizadas de expedientes conserva el 200, verifica `runInTenantSchema` y el `EntityManager` transaccional, y exige `grantedBy`, `blockedServed` donde aplica y que no se use `log()` (`expedientes.controller.fase2.http.spec.ts:125-200,330-366`). El par de suscriptores también verifica `logWithin` para la lectura privilegiada (`subscribers.controller.fase2.http.spec.ts:422-465`). No se redujeron las aserciones de respuesta positiva ni de auditoría exitosa. El spec Swagger de expedientes, sin embargo, conserva un fixture incompleto.

### [SEC-REVIEW] Observación P2 — H12 deja incompleto un fixture y una aserción negativa

**Archivos:** `apps/api/src/modules/crm/expedientes/tests/expedientes.swagger.spec.ts:19-33`; `apps/api/src/modules/crm/expedientes/expedientes.controller.ts:124-133`; `apps/api/src/modules/crm/expedientes/tests/expedientes.controller.fase2.http.spec.ts:311-324`.  
**Evidencia:** (1) El módulo de prueba Swagger registra el controller y mocks de sus dependencias en `expedientes.swagger.spec.ts:19-33`, pero no registra el token `DataSource`; el constructor exige `@InjectDataSource()` en `expedientes.controller.ts:132`. El mock de `AuditService` de ese fixture solo implementa `log` (`expedientes.swagger.spec.ts:31`), no `logWithin`. B1 reportó que la ejecución activa de ese spec falla durante la resolución del provider `DataSource`. (2) En el HTTP spec, el mock ya define `logWithin` (`expedientes.controller.fase2.http.spec.ts:129-132`), pero las seis rutas de lectura denegadas solo comprueban `auditMock.log` en la línea 323. Esa aserción no detecta una llamada accidental a `logWithin` antes del 403. La prueba sí conserva el 403, el código de error y que no se invoque el método de lectura del subrecurso.  
**Impacto:** el fixture Swagger no permite compilar su módulo de prueba en el estado reportado, y la comprobación negativa de auditoría HTTP no cubre el método transaccional incorporado por C3. No observé un bypass en la protección actual.  
**Acción recomendada:** completar el fixture Swagger con `DataSource` y `logWithin`, y comprobar `expect(auditMock.logWithin).not.toHaveBeenCalled()` en la rama HTTP denegada. Es un gap de fixture/evidencia de pruebas; no alcanza severidad alta.

## Decisión G4

**GO.** No encontré rutas mutantes sin guarda fuera de las tres excepciones documentadas. H11 queda corregido: ambas transiciones de estado y las rutas de borrado/subrecursos enumeradas en v1.4 aplican la misma regla, independientemente de `privacy.read` o `crm.blocked_data.read`. La reflexión detecta una ruta futura sin metadata o guard y la prueba HTTP verifica que no haya escrituras para los casos cubiertos. No quedan hallazgos críticos ni altos en el alcance V2″; la observación P2 de H12 queda abierta y no bloquea G4 según el criterio del plan v1.4 (cero críticos y altos).

La corrida completa de API y Turbo permanece pendiente en la raíz; este informe no sustituye ese gate. No hubo cambios de código/tests ni commit.
