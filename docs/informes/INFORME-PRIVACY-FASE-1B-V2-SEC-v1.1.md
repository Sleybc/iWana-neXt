# [SEC-REVIEW] Informe V2′ — Privacy Fase 1b

**Fecha:** 2026-10-16  
**Revisor:** AI-SEC-ENG (`sec-eng`)  
**Base revisada:** `aeedeffc..0af184d4` (`HEAD`) y cambios locales no confirmados de B1/B3  
**Resultado:** **NO-GO — G4 pendiente**

## Alcance y método

Se leyeron `AGENTS.md`, `.github/copilot-instructions.md`, el plan v1.3, los prompts de Fase 1b v1.0–v1.3, el launcher v1.4, `security-auditor/SKILL.md` y `backend-security-coder/SKILL.md`. Se inspeccionaron por separado el diff `aeedeffc..HEAD` y el delta local actual; las correcciones de esta ola están sin confirmar y no se atribuyen a `HEAD`.

La revisión se limitó a H1–H3 y los controles de permisos, auditoría y subrecursos de la fila V2′. No se ejecutaron suites en este encargo. La ruta del informe estaba libre al comprobar `Test-Path docs/informes/INFORME-PRIVACY-FASE-1B-V2-SEC-v1.1.md` (`False`). No se modificaron código, contratos ni pruebas y no se hizo commit. El informe no contiene PII, ciphertext, HMAC ni claves reales.

## Veredicto H1–H3

### H1 — edición por sección: corregido en el delta local

`PATCH /crm/subscribers/:id/section/:section` llama `assertNotBlocked(id)` antes de editar y proyecta con `readAccess.canSeeBlocked`, sin forzar la respuesta completa: `apps/api/src/modules/crm/subscribers/subscribers.controller.ts:448-458`. La prueba HTTP añadida verifica 409, ausencia de datos en el cuerpo y que no se invoque la mutación: `subscribers.controller.fase2.http.spec.ts:484-505`.

El informe B3 registra para esa suite HTTP **1 suite, 26 pruebas, 0 fallos**; no reejecuté esa suite en V2′.

### H2 — auditoría atómica de supresión: corregido en el delta local

`transition` bloquea la solicitud y procesa la supresión dentro de `withPrivacyTenant` con el mismo `EntityManager`: `apps/api/src/modules/privacy/requests/requests.service.ts:736-742,813-825`. `resolveSuppression` pasa ese manager a los participantes y a `AuditService.logWithin`: `:991-1027,1051-1065`. `logWithin` persiste con el manager entregado y propaga los errores de `manager.save`: `apps/api/src/modules/audit/audit.service.ts:42-75`.

La integración añadida induce un fallo en `logWithin` y comprueba que la solicitud conserve `EN_TRAMITE`, que `erased_at` siga nulo y que no persista la fila de prueba del participante: `apps/api/src/modules/privacy/requests/requests.service.postgres.integration.spec.ts:328-366`. La existencia del test no acredita por sí sola que se haya ejecutado en esta ola; no afirmo resultado de ejecución.

### H3 — lecturas bloqueadas con auditoría fail-closed: corregido en el delta local

Los tres módulos usan una transacción tenant corta y `logWithin`; si falla la auditoría, responden con error estático `503 PRIVACY_AUDIT_UNAVAILABLE` antes de devolver el resultado: suscriptores (`subscribers.controller.ts:629-640`), expedientes (`expedientes.controller.ts:870-881`) y contratos (`contracts.service.ts:517-528`). Los listados esperan la auditoría antes de construir la respuesta con datos; los registros y la descarga de soporte esperan su auditoría antes de responder/descargar (`expedientes.controller.ts:452-479,492-500,589-600`). La URL firmada de soporte contractual tampoco se devuelve antes de completar la auditoría (`contracts.service.ts:892-926`).

La evidencia conserva la fuente de autorización (`grantedBy`) para las lecturas individuales y los subrecursos; los listados incluyen `blockedServed` cuando se sirvieron filas bloqueadas. Ejemplos: `subscribers.controller.ts:606-624` y `:568-603`; `expedientes.controller.ts:804-823`; `contracts.service.ts:494-528`. Esto coincide con la separación de metadatos de v1.1 §5.2.

Las pruebas unitarias cubren fallo de auditoría sin entregar datos en suscriptores (`subscribers.controller.spec.ts:510-518`), expedientes (`expedientes.controller.spec.ts:492-512`) y contratos (`contracts.service.spec.ts:265-286`). La prueba parametrizada de expedientes comprueba las seis lecturas autorizadas y la auditoría previa, incluida la descarga (`expedientes.controller.spec.ts:410-490`).

## Controles adicionales de la fila V2′

### Permiso `crm.blocked_data.read`

En el código CRM, `CRM_BLOCKED_DATA_READ` se consulta en los resolutores de acceso de lectura de suscriptores, expedientes y contratos. Las mutaciones usan permisos de gestión propios y las rutas de edición revisadas llaman `assertNotBlocked`; el permiso de lectura especial no se usa directamente como permiso de escritura. La migración 151 crea el perfil «Facturación y cobro» con restricción `ACCOUNTANT` y le asigna ese permiso: `packages/database/src/migrations/tenant/151_seed_blocked_data_permission.ts:34-76`.

La excepción observada está en las dos transiciones de estado señaladas por B3: esas rutas no rechazan titulares bloqueados aunque el usuario tenga el permiso ordinario de gestión. Se detallan abajo; no son una autorización de escritura otorgada por `crm.blocked_data.read`, sino una omisión de guardas de privacidad.

### Seis subrecursos de expediente

`assertSubresourceReadAccess` comprueba marca y permisos antes de consultar cada subrecurso, devuelve 403 `PRIVACY_DATA_BLOCKED` si falta `privacy.read` y `crm.blocked_data.read`, y conserva `grantedBy` cuando permite la lectura: `apps/api/src/modules/crm/expedientes/expedientes.controller.ts:777-801`. Las seis rutas invocan esa guarda antes de leer: `:458`, `:497`, `:596`, `:638`, `:677` y `:732`.

Hay pruebas HTTP fuente para las seis rutas, SALES/TECHNICIAN/ACCOUNTANT sin permiso especial (403), y ambos permisos autorizados (200 con auditoría): `expedientes.controller.fase2.http.spec.ts:223-328`. La suite Playwright nueva cubre los mismos seis 403 por rol y las lecturas con ambos permisos: `e2e/tests/portal-privacy-fase-1b-live.spec.ts:664-675,861-901`. V1 documenta que la ejecución real quedó bloqueada antes de consultar la versión del tenant porque PostgreSQL no aceptó conexión (`ECONNREFUSED 127.0.0.1:5432`); por ello, estos casos tienen cobertura escrita, pero no resultado E2E runtime acreditado en esta revisión.

### Fixture HTTP de expedientes — evidencia de prueba insuficiente

La suite `expedientes.controller.fase2.http.spec.ts` crea el módulo de prueba sin proveer `DataSource` (`:137-155`), aunque el constructor actual de `ExpedientesController` lo exige (`expedientes.controller.ts:124-132`). Además, su `auditMock` solo declara `log` (`:125`), mientras la rama de lectura bloqueada llama `logWithin`. Por tanto, esta suite no acredita actualmente las respuestas 200 auditadas de los lectores autorizados y es probable que falle al compilar el módulo o al ejecutar esa rama. No la ejecuté; el hallazgo se basa en la discrepancia estática.

**Severidad: Media (P2, evidencia/gate).** Actualizar el fixture para proporcionar el `DataSource` y el mock transaccional, y ejecutar la suite sin caché. Este punto no invalida la guarda 403 observada en el código, pero deja sin evidencia fiable de esta suite la matriz 200 y el rastro de auditoría.

## Hallazgos altos confirmados de B3 — fuera del delta asignado

### [SEC-REVIEW] P1 — transición de estado de suscriptor omite el bloqueo

**Archivo:** `apps/api/src/modules/crm/subscribers/subscribers.controller.ts:481-504`; `apps/api/src/modules/crm/subscribers/subscribers.service.ts:859-866`  
**Evidencia:** `PATCH /crm/subscribers/:id/status` llama al servicio de transición sin `assertNotBlocked`. El servicio persiste el cambio de estado; la comprobación de privacidad y la auditoría `RECORD_ACCESS`, si aplica, ocurren después de la mutación (`controller.ts:492-503`). La proyección puede redactar la respuesta, pero no revierte ni rechaza el cambio ya realizado.

**Impacto:** una identidad con el permiso normal de gestión puede cambiar el estado de un suscriptor bloqueado. La lectura autorizada de los datos no debe habilitar una mutación y tampoco debe ser necesaria para que el servidor aplique la guarda.

**Contrato:** v1.1 §5.3 enumera las rutas de mutación explícitas y no lista `PATCH /:id/status`; el R10 general de v1.0 y la política de datos bloqueados requieren una resolución del emisor sobre esta transición. B3 también la marca P1 fuera de su propiedad. Hasta que se amplíe el contrato y se demuestre el rechazo, G4 no puede aprobarse.

### [SEC-REVIEW] P1 — transiciones de contrato omiten el bloqueo

**Archivo:** `apps/api/src/modules/crm/contracts/contracts.controller.ts:396-458`; `apps/api/src/modules/crm/contracts/contracts.service.ts:999-1053`  
**Evidencia:** `activate`, `suspend`, `reactivate`, `terminate` y `archive` delegan en `_transition`. Este método carga el contrato, valida la transición de estado y persiste `entity.status` (`:1004-1043`) sin comprobar el bloqueo del suscriptor. El permiso de gestión de la ruta autoriza la transición, pero no sustituye la guarda de privacidad.

**Impacto:** puede cambiarse el estado de un contrato perteneciente a un suscriptor bloqueado. B3 reporta el hallazgo como P1 y fuera de su delta; v1.1 §5.3 enumera mutaciones contractuales, pero no estas transiciones. Se requiere decisión del emisor, guardas y pruebas antes del GO de seguridad.

## Decisión G4

**NO-GO.** H1, H2 y H3 están corregidos en el delta local según la revisión estática y las pruebas nuevas inspeccionadas. Persisten los dos hallazgos altos P1 de transiciones de estado confirmados por B3; ambos permiten cambiar estado sobre titulares bloqueados y requieren una decisión/acción del emisor. El fixture HTTP de expedientes añade un hallazgo medio de evidencia de auditoría no fiable. La suite E2E de los seis subrecursos sigue sin resultado runtime por la precondición de PostgreSQL documentada por V1.

No se modificó código, contratos ni pruebas; no se incluyeron datos personales, ciphertext, HMAC ni claves reales; no se hizo commit.
