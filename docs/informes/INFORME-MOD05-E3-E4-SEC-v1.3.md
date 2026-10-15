# [SEC-REVIEW] MOD05 E-3 · H4

| Campo       | Valor                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Fecha       | 2026-10-15                                                                                                                         |
| Responsable | AI-SEC-ENG                                                                                                                         |
| Resultado   | **GO para SEC-G4-01/02 y la aclaración SEC-G4-03**                                                                                 |
| Alcance     | Revisión estática de autorización del retry, audit trail, PII en payload/logs, pipeline HTTP relacionado y aclaración de boundary. |

## Decisión

Los controles de seguridad solicitados para H4 están corregidos: `retry-conversion` conserva exactamente el techo de roles y permiso de `fb3d41ee`; la prueba HTTP demuestra 403 para SALES/SUPPORT y acceso permitido para ADMIN; la acción del Portal aplica el mismo techo; y el servicio registra `CONVERSION_RETRY` con actor y valores acotados. No encontré PII en el payload de auditoría ni en los logs revisados.

ADR-027 ya aclara que la lectura de postcondición dentro de CRM está permitida. El GO de este informe se limita a la revisión de seguridad H4: el gate general H4 sigue **NO-GO** por D1, que reporta 103/106 líneas ejecutables cambiadas cubiertas y tres líneas API pendientes (`INFORME-MOD05-E3-E4-GATES-v1.3.md`, sección «Líneas ejecutables cambiadas»).

## Hallazgos H4

### SEC-G4-01 · Techo RBAC del retry — Cerrado

`apps/api/src/modules/crm/expedientes/expedientes.controller.ts:297-303` aplica `@Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)` y `@Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)`. La comparación con `git show fb3d41ee:apps/api/src/modules/crm/expedientes/expedientes.controller.ts` confirma que ambos decoradores coinciden con el baseline. El controlador conserva `JwtAuthGuard`, `RolesGuard` y `PermissionsGuard` en `:104-106`, valida el parámetro con `ParseUUIDPipe` y pasa `user.sub` al servicio.

`apps/api/src/modules/crm/expedientes/expedientes.controller.fase2.http.spec.ts:155-184` verifica en HTTP que SALES y SUPPORT, incluso con `CRM_SUBSCRIBERS_MANAGE`, reciben 403 y no invocan el servicio; ADMIN con ese permiso recibe 201 y el actor llega como argumento.

La UI está alineada: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx:290-293` requiere permisos listos, rol ADMIN/SYSTEM_ADMIN y `CRM_SUBSCRIBERS_MANAGE`. El banner solo muestra el botón si recibe esa autorización (`apps/portal/src/components/crm/expedientes/ExpedienteConversionBanner.tsx:47-59`); a los demás les muestra el motivo y «Pide a un administrador que reintente la conversión». Las pruebas de página cubren ambos roles habilitados y la ausencia del permiso (`apps/portal/src/app/dashboard/crm/expedientes/[id]/page.spec.tsx:561-619`), además de SALES sin acción (`:622-625`); el test del banner verifica el texto fijo y la ausencia del botón (`apps/portal/src/components/crm/expedientes/ExpedienteConversionBanner.spec.tsx:101-145`).

### SEC-G4-02 · Auditoría del retry y exposición de PII — Cerrado

`apps/api/src/modules/crm/expedientes/expediente.service.ts:1303-1316` registra explícitamente acción `CONVERSION_RETRY`, entidad `Expediente`, `entityId`, actor (`userId`) y solo `{ eventName, resolved, errorCode }`. La operación registra también los resultados sin evento y sin fallo pendiente (`:1327-1339`) y el resultado del intento (`:1342-1349`). El controlador conserva `@SkipAudit()` para excluir el interceptor automático, y el servicio emite su propio registro explícito.

El valor persistido de `errorCode` procede del estado pendiente. El único escritor encontrado lo genera mediante `pipelineErrorCode`, que solo acepta códigos con patrón `^[A-Z][A-Z0-9_]{2,63}$` y usa `CONVERSION_FAILED` como fallback (`apps/api/src/modules/crm/expedientes/expediente.service.ts:3054-3056, 3112-3124`). La prueba unitaria cubre un código inválido con salto de línea y verifica que no se persista el texto recibido (`apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts:3544-3565`). `AuditService.log` sanitiza `oldValue/newValue` antes de guardar y resuelve schema desde `TenantContext` (`apps/api/src/modules/audit/audit.service.ts:92-119`).

La integración PostgreSQL comprueba dos filas persistidas con actor, acción, entidad y los tres valores permitidos; también afirma que no contienen documento, correo, teléfono ni nombre sintético del titular (`apps/api/src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts:812-854`). Los logs del emisor contienen únicamente el nombre de evento, UUID técnico del expediente, código de dominio y resultado operativo (`apps/api/src/modules/crm/expedientes/expediente.service.ts:3071-3079, 3091-3094`); no interpolan payload, nombre, documento, correo, teléfono, dirección, mensaje de excepción ni stack. El UUID técnico está cubierto por la disposición D2 del prompt E-3 §7.1 (`PROMPT-MOD05-E3-CONTACTO-PENDIENTE-v1.0.md:171-173`) y no reabre el hallazgo anterior.

### SEC-G4-03 · Lectura de postcondición — Aclarada

La aclaración de ADR-027 permite una lectura de postcondición de solo lectura dentro del bounded context CRM después de emitir el evento, y precisa que la alternativa descartada se refiere a escrituras directas (`ADR-027-Conversion-Expediente-Subscriber-Two-Stage.md:32-38`). La implementación consultada usa `SubscribersService.findByExpedienteId` solo para verificar el efecto esperado (`apps/api/src/modules/crm/expedientes/expediente.service.ts:3099-3106`). No queda observación abierta por SEC-G4-03.

## Pipeline de request y observación no bloqueante

Los componentes del pipeline revisados están configurados: Nginx redirige HTTP a HTTPS y negocia TLS 1.3 (`nginx/nginx.prod.conf:42-68`); `JwtStrategy` exige RS256, expiración, issuer y audience, y valida la correspondencia entre `type`, `iss` y `aud` (`apps/api/src/modules/auth/strategies/jwt.strategy.ts:39-50, 82-94`); el controlador aplica JWT/RBAC/permisos; el middleware obtiene tenant/schema desde claims firmados de tenant (`apps/api/src/modules/tenant/tenant.middleware.ts:68-87`); y el bootstrap aplica `ValidationPipe` global (`apps/api/src/main.ts:42-55`). El limitador global está configurado a 100 solicitudes por minuto (`apps/api/src/app.module.ts:155-164, 251-254`).

**[SEC-REVIEW] Archivo: `apps/api/src/app.module.ts` | Línea: 274-282**

**Severidad: Media · SLA: próximo sprint.**

**Hallazgo:** `TenantMiddleware` es middleware de Nest/Express y se ejecuta antes de los guards globales; el `ThrottlerGuard` está registrado como `APP_GUARD`. Por ello, la resolución tenant ocurre antes del limitador: con un token ausente o inválido y un `X-Tenant-Slug`, `TenantMiddleware.use` llama `findBySlug` (`apps/api/src/modules/tenant/tenant.middleware.ts:90-120`) y puede responder 404 antes de que el guard aplique la cuota. Nginx no declara `limit_req` en el location `/api/` (`nginx/nginx.prod.conf:101-127`). Una ráfaga de solicitudes anónimas con slugs variables puede provocar trabajo de resolución de tenant fuera de la cuota global. Es una condición preexistente, no introducida por H1.

**OWASP:** ASVS L2, limitación de recursos; STRIDE: denegación de servicio.

**Acción recomendada:** aplicar una cuota por IP antes de la resolución tenant (en el borde o middleware temprano), conservando la cuota autenticada por sujeto/tenant después de verificar JWT. Esta observación es independiente y no cambia el GO de SEC-G4-01/02/03.

La semántica de auditoría es la establecida por el servicio existente: `AuditService.log` intenta persistir y registra un warning si falla, sin cancelar la operación principal (`apps/api/src/modules/audit/audit.service.ts:119-127`). La integración H1 confirma persistencia en el camino normal; esta revisión estática no valida disponibilidad de la base de auditoría.

## Evidencia y límites

Fuentes revisadas: `AGENTS.md`; perfil AI-SEC-ENG Parte II; Protocolo de Colaboración §6; PRD MOD05 y HLD MOD05; ADR-083 D2; ADR-027 y su aclaración; prompt E-3 §8; informes E4-SEC v1.2, E4-GATES v1.2, H1, H2, H3 y E4-GATES v1.3; skills `security-auditor` y `backend-security-coder` leídas como documentación.

La evidencia de pruebas se toma de los informes H1–H3 y del gate H4 v1.3; no se ejecutaron pruebas en esta revisión de solo lectura. No se modificaron código, tests ni configuración. No se hizo commit.

La ruta `docs/informes/INFORME-MOD05-E3-E4-SEC-v1.3.md` estaba libre antes de crear este informe.
