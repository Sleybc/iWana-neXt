# Informe MOD05 E-3 · G4 revisión de seguridad

| Campo       | Valor                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| Fecha       | 2026-10-15                                                                                                                 |
| Responsable | AI-SEC-ENG                                                                                                                 |
| Resultado   | **NO-GO**                                                                                                                  |
| Alcance     | Revisión estática del manejo de fallos de conversión, permisos del retry, exposición de datos y boundary Modulith para G4. |

## Decisión

**NO-GO** por una ampliación explícita de roles en una ruta POST de escritura que contradice ADR-083 D2. También queda abierta una observación de auditoría sobre el retry y una aclaración de boundary para la lectura de postcondición entre servicios. El banner, la proyección `conversionFailure`, el filtro D3, el flujo de autenticación/CSRF y los logs revisados no exponen PII, payload ni códigos crudos.

## Hallazgos

### SEC-G4-01 · POST retry amplía el techo de roles — Alta, bloqueante

`apps/api/src/modules/crm/expedientes/expedientes.controller.ts:297-303` declara `POST :id/retry-conversion` con `@Roles(ADMIN, SALES, SUPPORT, SYSTEM_ADMIN)` y `CRM_EXPEDIENTES_MANAGE`. Es una operación con efectos: `retryConversionEvent` reemite el evento y `emitPipelineEventSafely` incrementa o resuelve el registro de fallo (`apps/api/src/modules/crm/expedientes/expediente.service.ts:1303-1335, 3044-3075`). El informe G1 confirma que SALES y SUPPORT con ese permiso pueden ejecutar el endpoint (`INFORME-MOD05-E3-G1-v1.0.md:15-16`).

ADR-083 D2 define `@Roles` como techo estructural y reserva las ampliaciones deliberadas al caso de lectura; exige que endpoints de escritura conserven `@Roles` estricto (`ADR-083-Convergencia-RBAC-Granular-Modulos-Operativos.md:47-49`). Su regla de implementación prohíbe ampliar `@Roles` de escritura en este ciclo (`ADR-083-Convergencia-RBAC-Granular-Modulos-Operativos.md:122-125`). El permiso granular no elimina esa restricción. La configuración actual contradice el ADR aprobado y amplía el conjunto de roles que puede reintentar conversiones cuando reciban el permiso.

**Criterio de salida:** alinear el rol del POST con el techo aprobado o resolver primero el cambio mediante la gobernanza/ADR correspondiente. No se propone una excepción de seguridad.

### SEC-G4-02 · Acción de retry excluida de la auditoría automática — Media

La ruta POST lleva `@SkipAudit()` (`apps/api/src/modules/crm/expedientes/expedientes.controller.ts:297-303`). El interceptor global omite el registro al encontrar esa metadata (`apps/api/src/modules/audit/audit.interceptor.ts:110-120`); el propio decorador documenta el uso para handlers con auditoría propia o lectura que no requiere rastro (`apps/api/src/modules/audit/decorators/skip-audit.decorator.ts:3-10`). En el flujo de `retryConversionEvent` y `emitPipelineEventSafely` no aparece un `auditService.log`; el retry modifica/inserta `crm_conversion_failures` y puede fallar antes de cualquier cambio de Subscriber (`apps/api/src/modules/crm/expedientes/expediente.service.ts:1303-1335, 3044-3082`). Las auditorías downstream de Subscriber no registran el intento fallido ni el incremento de intentos.

La exclusión automática está documentada para handlers que emiten auditoría propia o para operaciones de solo lectura que no requieren rastro (`apps/api/src/modules/audit/decorators/skip-audit.decorator.ts:3-10`). El retry no satisface ninguno de esos supuestos en el flujo revisado; necesita un rastro de auditoría que registre actor y resultado con datos mínimos. El logger técnico puede seguir sin payload/PII. Este hallazgo no cambia el NO-GO principal.

### SEC-G4-03 · Lectura de postcondición entre servicios sin regla explícita en ADR-027 — Aclaración requerida

`ExpedienteService.pipelineEventHasEffect` consulta directamente `SubscribersService.findByExpedienteId` para comprobar los eventos `ready-for-installation` y `activated` (`apps/api/src/modules/crm/expedientes/expediente.service.ts:3085-3092`). ADR-027 adopta la conversión por eventos intra-módulo y descarta las llamadas directas servicio→servicio sin eventos (`ADR-027-Conversion-Expediente-Subscriber-Two-Stage.md:13-19, 23-30`), pero no define si una lectura de postcondición después de emitir un evento es una excepción válida. El informe de gates G4 también registra que no hay revisión boundary posterior del diff actual (`INFORME-MOD05-E3-E4-GATES-v1.2.md:94-103`).

No concluyo una infracción definitiva: solicito que AI-EM-ARCH/boundary-reviewer establezca si la lectura es parte permitida de la verificación de resultado o si debe exponerse mediante una proyección/contrato del módulo.

## Controles revisados

### D3 — Códigos de error acotados: cumple

`pipelineErrorCode` acepta el código solo si cumple `^[A-Z][A-Z0-9_]{2,63}$`; cualquier valor restante, error HTTP sin ese código o error inesperado cae a `CONVERSION_FAILED` (`apps/api/src/modules/crm/expedientes/expediente.service.ts:3098-3109`). Esto evita persistir o registrar texto libre desde el error.

### D2 — UUID técnico en logs: excepción aceptada, no bloquea

La decisión de §7.1 D2 declara que los UUID técnicos de soporte no bloquean y que un cambio de política requeriría un ADR transversal (`PROMPT-MOD05-E3-CONTACTO-PENDIENTE-v1.0.md:172`). Los logs revisados incluyen nombre de evento, UUID del expediente y código de dominio, pero no nombre, documento, correo, teléfono, dirección, payload, mensaje de excepción ni stack (`apps/api/src/modules/crm/expedientes/expediente.service.ts:3058-3065, 3078-3080`). Esta excepción se acepta para esta revisión y no se reabre como hallazgo.

### Proyección API y banner: cumplen privacidad de fallo

El bootstrap selecciona únicamente `eventName`, `errorCode`, `attempts` y `lastFailedAt` del fallo pendiente y los devuelve como `conversionFailure`; no proyecta payload ni identificadores del Subscriber (`apps/api/src/modules/crm/expedientes/expediente-detail-bootstrap.service.ts:291-309`; DTO `apps/api/src/modules/crm/expedientes/dto/expediente-detail-bootstrap.dto.ts:54-59, 288-300`). Esta revisión se refiere a la proyección del fallo; el expediente conserva los campos propios de su detalle autorizado.

El banner traduce códigos conocidos a copy fijo y usa un mensaje genérico para cualquier otro valor; no renderiza `errorCode`, `eventName`, UUID, intentos ni payload (`apps/portal/src/components/crm/expedientes/ExpedienteConversionBanner.tsx:12-27, 47-76`). El manejador captura los errores sin interpolarlos y presenta mensajes fijos al recargar o reintentar (`apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx:957-978`).

### Retry: autenticación, CSRF y permiso conservados

El controlador mantiene `JwtAuthGuard`, `RolesGuard` y `PermissionsGuard` (`apps/api/src/modules/crm/expedientes/expedientes.controller.ts:104-107`); la acción del portal requiere estado de permisos listo y `CRM_EXPEDIENTES_MANAGE` antes de ofrecer o ejecutar retry (`apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx:289-291, 957-966`). El cliente llama el POST mediante el wrapper común (`apps/portal/src/lib/api-client.ts:6180-6187`), que añade `X-Tenant-Slug`, exige `X-Requested-With: XMLHttpRequest` en mutaciones autenticadas y usa `credentials: 'include'` (`apps/portal/src/lib/api-client.ts:741-762`).

La protección del permiso y el wrapper común se conservan. La ampliación de `@Roles` identificada en SEC-G4-01 permanece bloqueante bajo ADR-083.

## Evidencia y límites

Fuentes revisadas: `AGENTS.md`; prompt E-3 §7.1 D2/D3 y bloque G4; ADR-083 y ADR-027; informes G1 (`INFORME-MOD05-E3-G1-v1.0.md`), G2 (`INFORME-MOD05-E3-G2-v1.0.md`), G3 (`INFORME-MOD05-E3-E4-QA-v1.2.md`) y G4 (`INFORME-MOD05-E3-E4-GATES-v1.2.md`); skills `security-auditor` y `backend-security-coder` leídas como documentación.

Comandos de lectura/verificación usados: `rg`, `Get-Content`, `Test-Path` y `git diff --check`. `git diff --check` terminó sin errores de whitespace. No se ejecutaron tests ni pruebas contra servicios; la revisión de este informe es estática. El informe G4 existente registra lint/typecheck/tests Turbo verdes sin caché, pero integración API y gates de cobertura con NO-GO; esos resultados son evidencia reportada por G4, no una corrida de esta revisión.

La ruta `docs/informes/INFORME-MOD05-E3-E4-SEC-v1.2.md` estaba libre antes de crear este informe. No se editaron código, tests ni configuración y no se hizo commit.
