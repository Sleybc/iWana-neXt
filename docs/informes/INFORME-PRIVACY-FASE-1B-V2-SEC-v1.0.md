# INFORME — `privacy` Fase 1b · V2 · Revisión de seguridad

**Fecha:** 2026-10-16  
**Revisor:** AI-SEC-ENG  
**Base revisada:** `aeedeffc..0af184d4` (`HEAD`)  
**Resultado:** **NO-GO — G4 falla** por dos hallazgos altos.

## Alcance y método

Revisión estática ASVS Level 2 del diff, con foco en supresión, proyección de PII, permisos de datos bloqueados, búsqueda, parametrización, claves, auditoría, evidencia de autorizaciones y guardas del portal. Se leyó `AGENTS.md`, el bootstrap Copilot, el plan v1.2, los prompts de Fase 1b v1.0–v1.2, el launcher v1.3, el perfil AI-SEC-ENG, el protocolo multiagente, el HLD de privacidad, ADR-094, el PRD de suscriptores y las skills asignadas.

No ejecuté pruebas: V2 es revisión de seguridad. No se modificaron código, contratos ni tests. El informe se creó tras confirmar que la ruta no existía. No se incluyeron valores personales, ciphertext, HMAC ni claves.

## Hallazgos

### [SEC-REVIEW] Hallazgo 1

**Archivo:** `apps/api/src/modules/crm/subscribers/subscribers.controller.ts:447-448`  
**Severidad:** Alta (P1)  
**OWASP ASVS:** V4 — control de acceso; V8 — protección de datos.  
**Hallazgo:** El diff cambió `updateSection` para devolver `sanitizeResponse(updated, [], true)`, lo que fuerza la proyección completa. La ruta no llama `assertNotBlocked` antes de editar, a diferencia de `PATCH /crm/subscribers/:id` en la línea 427. El servicio de sección valida el payload y llama a `update`, pero no comprueba la marca (`subscribers.service.ts:1344-1378`). Un usuario con el permiso ordinario de gestión puede editar una sección de un suscriptor bloqueado y recibir PII completa sin `privacy.read` ni `crm.blocked_data.read`; tampoco obtiene el 409 previsto para mutaciones bloqueadas. Esto elude el carácter de solo lectura de `crm.blocked_data.read` y la protección R10.  
**Corrección requerida:** aplicar la comprobación de marca antes de la edición de sección y no forzar `canSeeBlocked` en su respuesta. Añadir cobertura HTTP para perfil de gestión sin permiso de lectura bloqueada.

### [SEC-REVIEW] Hallazgo 2

**Archivo:** `apps/api/src/modules/privacy/requests/requests.service.ts:1046-1051`; `apps/api/src/modules/audit/audit.service.ts:14-20,42-46,90-138`  
**Severidad:** Alta (P1)  
**OWASP ASVS:** V7 — registro y monitoreo de seguridad.  
**Hallazgo:** `resolveSuppression` ejecuta la auditoría mediante `AuditService.log()`. Aunque la llamada ocurre dentro del callback de la transacción de anonimización, `log()` crea una transacción independiente y absorbe fallos; la supresión y su estado pueden confirmarse sin que quede el evento de auditoría. El HLD exige que la auditoría forme parte de la transacción cuando el efecto es atómico (`docs/hlds/HLD-PRIVACY-HABEAS-DATA-v1.0.md:157`). La llamada no cumple esa garantía y contradice el comentario de `requests.service.ts:983-985`, que afirma que cualquier fallo revierte todo. La misma limitación afecta a la garantía de persistencia de `grantedBy` y `blockedServed` en las nuevas lecturas de datos bloqueados, cuyos helpers también llaman `AuditService.log()`.
**Corrección requerida:** para la supresión, escribir con `AuditService.logWithin()` usando el manager transaccional y propagar el fallo para que revierta los cambios. Para accesos sensibles, definir y probar el tratamiento fail-closed/fail-safe de la auditoría conforme al HLD.

## Verificaciones sin hallazgo adicional

- **Atomicidad de datos e irreversibilidad:** `transition` bloquea la solicitud con `FOR UPDATE` y ejecuta `resolveSuppression` en `withPrivacyTenant` (`requests.service.ts:737-741,808-821`). El adaptador requiere transacción activa, recalcula los candidatos y compara el conjunto recibido antes de aplicar; cualquier residual produce error (`crm-personal-data-erasure.adapter.ts:83-117,232-237`). La solicitud y las marcas de anonimización tienen triggers inmutables en las migraciones 149 y 150. La atomicidad de los cambios de datos sí está cubierta; la garantía de auditoría queda abierta por el Hallazgo 2.
- **PII/HMAC y errores:** la vista previa expone IDs candidatos y conteos, no el HMAC; los errores de erasure revisados son mensajes/códigos estáticos. Las búsquedas y comparaciones usan parámetros enlazados. Las respuestas de solicitudes reservan los datos descifrados al permiso de gestión de privacidad conforme al HLD. No encontré HMAC ni valores personales en los payloads de auditoría de supresión.
- **Permiso de solo lectura:** `CRM_BLOCKED_DATA_READ` solo aparece en resolutores de lectura en los controllers de suscriptores, expedientes y contratos. La migración 151 lo asigna únicamente a la plantilla «Facturación y cobro», con restricción `ACCOUNTANT` y ese permiso (`151_seed_blocked_data_permission.ts:50-76`). El Hallazgo 1 describe el bypass indirecto desde una respuesta de mutación.
- **Seis subrecursos:** timeline, soportes, descarga de archivo, intentos de contacto, consentimientos y comprobaciones de cobertura invocan `assertSubresourceReadAccess` antes de leer. La función responde 403 para un bloqueado sin permiso y conserva `grantedBy`; las listas registran `blockedServed` en el payload (`expedientes.controller.ts:448,487,586,628,667,722,767-791,794-812`). La lectura del archivo ocurre después de autorizar.
- **Enumeración por búsqueda:** la búsqueda textual y exacta de suscriptores pasa `excludeBlocked` cuando falta permiso (`subscribers.controller.ts:329-362`); el servicio excluye por lista parametrizada de IDs (`subscribers.service.ts:596-602,914-920`) y falla con 503 si no dispone de marcas (`935-942`). La búsqueda de expedientes excluye titulares bloqueados mediante `NOT EXISTS` con array enlazado (`expedientes.controller.ts:170-182`; `expediente.service.ts:715-723`).
- **Filtro `<> ALL`:** las listas se enlazan como parámetro tipado `uuid[]`; no se interpola input en SQL (`subscribers.service.ts:596-602,914-919`; `crm-titular-erasure.participant.ts:286-291`).
- **Claves:** la carga de AES y HMAC de anonimización usa `ConfigService` mediante `loadErasureKeys` (`titular-erasure-sql.ts:46-52`); el CLI usa también los helpers de configuración (`anonymize-titular.ts:1188-1194`). No encontré claves hardcodeadas en el diff.
- **Evidencia de autorizaciones:** el participante Media solo selecciona evidencia de estrato y de ejecución; el conjunto de evidencia de privacidad no genera actualización (`media-titular-erasure.participant.ts:40-67,78-83`). La integración del CLI comprueba que la evidencia de autorización sigue activa y que la fila no cambia (`anonymize-titular.postgres.integration.spec.ts:535-587`).
- **Fixture WFM:** `visit-requests.service.spec.ts:785` usa una etiqueta constante dentro del objeto construido por la prueba; no procede de una respuesta, DB ni fixture externo. No se encontró registro de su envío a logs.
- **Fail-closed del portal:** `page.tsx:275` trata como restringido cualquier valor distinto de `false` y no monta las pestañas cuando está restringido (`1561-1605`). `ExpedienteSections.tsx:62` usa una guarda truthy; su única llamada productiva está dentro de ese gate y el tipo API requiere `privacyRestricted: boolean`. No observé bypass en el flujo actual. Como hardening de baja prioridad, la guarda del componente también podría denegar cuando falte el valor.

## Decisión

**NO-GO para G4:** hay dos hallazgos altos. El más directo permite acceso a PII de un titular bloqueado mediante una mutación sin permiso de lectura especial. La auditoría de supresión tampoco tiene garantía transaccional ni de persistencia ante error. Corregir ambos antes de declarar G4 verde; los otros controles enumerados no presentan hallazgos en esta revisión estática.
