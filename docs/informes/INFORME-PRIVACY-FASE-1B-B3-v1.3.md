# INFORME — `privacy` Fase 1b · B3 · Cambios de backend

**Fecha:** 2026-10-16  
**Agente:** AI-SR-FULL (`sr-backend`)  
**Encargo:** C1, C3 y C5 de `PROMPT-PRIVACY-FASE-1B-v1.3.md`  
**Resultado:** C1/C3/C5 implementados. Dos hallazgos adicionales P1 de autorización de transiciones quedan fuera de este delta y requieren resolución del emisor. Las pruebas focalizadas pasan; el gate completo de API falla en dos suites.

## Alcance y evidencia

Se leyeron `AGENTS.md`, `.github/copilot-instructions.md`, el plan v1.3, los prompts de Fase 1b v1.0–v1.3, el launcher v1.4 y las skills asignadas (`nestjs-expert`, `backend-security-coder`, `testing-patterns`). La ruta del informe no existía antes de crearlo. No se incluyeron PII ni claves reales y no se hizo commit.

Pruebas focalizadas ejecutadas sin Turbo:

- `pnpm --filter @iwana/api exec jest src/modules/crm/subscribers/tests/subscribers.controller.spec.ts src/modules/crm/expedientes/tests/expedientes.controller.spec.ts src/modules/crm/contracts/tests/contracts.service.spec.ts src/modules/crm/contracts/tests/contracts.controller.spec.ts --runInBand` — **4 suites, 179 tests, 0 fallos**.
- `pnpm --filter @iwana/api exec jest src/modules/crm/subscribers/subscribers.controller.fase2.http.spec.ts --runInBand` — **1 suite HTTP, 26 tests, 0 fallos**. Incluye el PATCH por sección bloqueado: 409, sin cuerpo de datos y sin invocar la mutación.
- `git diff --check` — sin errores.

Evidencia agregada ejecutada por la raíz:

- `pnpm exec turbo run test --force --continue` — **9/10 tareas exitosas, 0 cache hits**; falla la tarea API. El gate Turbo queda **fallido**.
- Corrida independiente de API — **381 suites pasaron, 2 fallaron, 4 omitidas; 5,149 tests pasaron, 69 fallaron, 15 omitidos**. Fallan `expedientes.controller.fase2.http.spec.ts` y `expedientes.swagger.spec.ts`, atribuidas en V2 a un fixture `DataSource` obsoleto (hallazgo P2).
- Arranque real de API: `GET /api/v1/health` respondió **HTTP 200**.

No se recibieron cifras agregadas de typecheck, lint o build; no se declaran esos gates.

## C1 — edición por sección y proyecciones completas

`PATCH /crm/subscribers/:id/section/:section` invoca `assertNotBlocked` antes de resolver permisos o escribir, y devuelve `sanitizeResponse` con `readAccess.canSeeBlocked` (`subscribers.controller.ts:448-458`). La prueba HTTP confirma 409 y cuerpo sin datos para un actor de ventas con permiso de gestión sin lectura especial (`subscribers.controller.fase2.http.spec.ts:484-505`). La edición completa también conserva su comprobación (`subscribers.controller.ts:432-436`).

Inventario de proyecciones con datos completos o potencialmente completos:

- **Suscriptores:** no quedan llamadas `sanitizeResponse(..., true)`. Detalle (`subscribers.controller.ts:406-413`), edición (`:432-436`), sección (`:454-458`), estado (`:486-503`) y 360° (`:529-534`) pasan el resultado de `resolveBlockedReadAccess`; los detalles y 360° auditan antes de devolver el cuerpo. El listado usa `projectSubscriberForList(..., readAccess.canSeeBlocked)` y espera a `logListAccess` (`:142-185`). La creación usa el valor predeterminado restrictivo de `sanitizeResponse` (`:134`).
- **Expedientes:** no se fuerza `true`. Listado y detalle pasan `readAccess.canSeeBlocked` después de la auditoría correspondiente (`expedientes.controller.ts:206-213,239-292`); las ramas restringidas pasan `false` y eliminan sus resúmenes derivados (`:241-255,282`).
- **Contratos:** las lecturas de lista y registro reciben el permiso resuelto (`contracts.service.ts:322-397`) y registran acceso antes de devolver filas bloqueadas (`:407-417,494-528`). Las respuestas de mutación pasan por `projectContractForMutation(..., false)`, que redacta siempre un titular aún bloqueado y añade `titularAnonymizedAt` (`:486-490`); no hay mutaciones con proyección completa forzada.

## C3 — lecturas bloqueadas fail-closed

Los tres módulos registran lecturas autorizadas de datos bloqueados mediante `logWithin` dentro de un `runInTenantSchema` corto. Ante fallo, responden 503 `PRIVACY_AUDIT_UNAVAILABLE` con mensaje estático y sin el resultado sensible. En suscriptores esto cubre registros, 360°, listados y búsqueda (`subscribers.controller.ts:568-629`); en expedientes, listas, detalle/bootstrap y subrecursos (`expedientes.controller.ts:804-879`); en contratos, listas, registro y acceso firmado a evidencia (`contracts.service.ts:387-417,494-528,892-925`).

Los seis subrecursos de expediente validan permisos antes de leer. Timeline, soportes, intentos, consentimientos y verificaciones esperan auditoría de lista antes de responder; la descarga espera auditoría de registro antes de `response.download` (`expedientes.controller.ts:400-477,481-499,578-600,618-640,665-679,719-734`). La prueba parametrizada comprueba la auditoría previa en las seis rutas y que un fallo no entrega consentimientos (`expedientes.controller.spec.ts:410-506`).

Las lecturas sin datos bloqueados mantienen su ruta de auditoría normal (`AuditService.log`) en los controllers de suscriptores y expedientes. Para resultados bloqueados, la rama estricta se completa antes de que el controller devuelva la proyección.

## C5 — respuestas de contrato

Las creaciones, actualización, service-point, carga/retiro de evidencia de estrato y transiciones proyectan la respuesta dentro de su transacción mediante `projectContractForMutation` (`contracts.service.ts:159,274,659,731,821,853,871,1043`). La proyección incorpora la fecha de anonimización del suscriptor y redacta si el titular sigue bloqueado. El DTO publica el campo como fecha nullable requerida por el esquema (`contract-response.dto.ts:36-37`). Las pruebas cubren la marca en respuestas de mutación (`contracts.service.spec.ts:1732` y los casos de creación/actualización focalizados).

## Hallazgos adicionales P1 — fuera del delta asignado

### Transición del estado del suscriptor sin rechazo por bloqueo

**Archivo:** `apps/api/src/modules/crm/subscribers/subscribers.controller.ts:486-503`; `apps/api/src/modules/crm/subscribers/subscribers.service.ts:859-866`; `apps/api/src/modules/crm/subscribers/subscriber-status-transition.service.ts:120-184`  
**Severidad:** Alta (P1)  
**Evidencia:** `PATCH /crm/subscribers/:id/status` llama `transitionStatus` y el servicio persiste `status` sin consultar `assertNotBlocked` ni las marcas de privacidad. El controller puede devolver la proyección con el permiso real, pero la auditoría de lectura no impide la mutación. Un actor que satisfaga el permiso de gestión puede cambiar el estado de un titular bloqueado; tener `crm.blocked_data.read` no debe convertir la transición en permitida. R10 de v1.1 §5.3 nombra explícitamente `PATCH /crm/subscribers/:id`, no esta ruta. La v1.3 C1 limita el cambio asignado a `updateSection`; no se modificó esta transición.

### Transiciones de contrato sin rechazo por bloqueo

**Archivo:** `apps/api/src/modules/crm/contracts/contracts.controller.ts:396-460`; `apps/api/src/modules/crm/contracts/contracts.service.ts:678-680,930-946,999-1043`  
**Severidad:** Alta (P1)  
**Evidencia:** `activate`, `suspend`, `reactivate`, `terminate` y `archive` delegan a `_transition`, que cambia y persiste `entity.status` sin comprobar el estado de privacidad del suscriptor. Sí hay comprobaciones en rutas de edición, service-point y carga de evidencia (`contracts.controller.ts:222,244,290`), pero no en las transiciones. Por tanto, el estado contractual sí puede cambiar para un contrato de titular bloqueado si el actor cumple el permiso de gestión. R10 de v1.1 §5.3 enumera ciertas mutaciones de contrato, pero no las transiciones. No se cambió este comportamiento porque el delta B3 v1.3 asigna C1/C3/C5 y el emisor debe extender el contrato.

Ambos hallazgos se reportan al emisor para un delta y quedan como condición pendiente de autorización para el GO de seguridad. No se amplió la propiedad de este cambio.

## Estado final de B3

C1, C3 y C5 tienen pruebas focalizadas verdes. La revisión de proyecciones no encontró proyección completa incondicional. La suite completa de API y el gate Turbo están fallidos por las dos suites indicadas; el arranque real de API está verificado con HTTP 200. Los dos hallazgos adicionales P1 requieren una decisión del emisor y una asignación posterior.
