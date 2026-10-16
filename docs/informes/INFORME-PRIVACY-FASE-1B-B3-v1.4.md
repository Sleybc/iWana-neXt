# INFORME — `privacy` Fase 1b · B3 · Mutaciones de titulares bloqueados

**Fecha:** 2026-10-16  
**Agente:** AI-SR-FULL (`sr-backend`)  
**Encargo:** §2 / H11 y H12 de `PROMPT-PRIVACY-FASE-1B-v1.4.md`  
**Estado:** implementación y gates de pruebas completados; **[BLOQUEO]** para health contra `dbiw` migrada hasta 151 por migraciones tenant ausentes.

## Alcance y gobernanza

Se leyeron `AGENTS.md`, `.github/copilot-instructions.md`, el plan de Fase 1b v1.4, los prompts v1.0–v1.4 y las skills asignadas (`nestjs-expert`, `backend-security-coder`, `testing-patterns`). La ruta de este informe se comprobó libre antes de escribirlo. No se incluyeron PII ni claves y no se hizo commit.

## §2 — R10 v1.4: guarda general de mutaciones

Los tres módulos CRM tienen decoradores locales `@GuardBlockedTitular(...)` que escriben la metadata exacta `privacy:blocked-titular-guard` y aplican su guarda como guard de método Nest. Mantener cada guarda junto al módulo dueño evita dependencias cruzadas entre suscriptores, contratos y expedientes.

- **Suscriptores:** `@GuardBlockedTitular()` resuelve `params.id`, carga el suscriptor y sus marcas activas; ante `DATOS_BLOQUEADOS` sin anonimización lanza 409 `PRIVACY_DATA_BLOCKED` antes del handler. Cubre actualización, edición por sección, borrado y transición de estado (`subscribers.controller.ts:422-483`; guarda en `guards/subscribers-blocked-titular.guard.ts:21-55`).
- **Contratos:** los resolvers cubren `params.id`, `params.subscriberId` y `body.subscriberId`; se delega la comprobación al servicio del módulo antes de cada handler de mutación. Quedan cubiertas creación para suscriptor, creación desde expediente, creación directa, actualización, punto de servicio, soportes de estrato y transiciones (`contracts.controller.ts:71-457`; guarda en `guards/contracts-blocked-titular.guard.ts:15-52`).
- **Expedientes:** `@GuardBlockedTitular()` resuelve `params.id`, verifica la fecha de anonimización y las marcas del expediente ligado. Cubre secciones, estados, reactivación, conversión, documentos, contactos, consentimientos, cobertura y referencias operativas (`expedientes.controller.ts:303-740`; guarda en `guards/expedientes-blocked-titular.guard.ts:20-54`).
- Las llamadas sueltas a `assertNotBlocked` en los controllers se migraron a la guarda. El test de arquitectura recorre por reflexión `PATH_METADATA` y `METHOD_METADATA` cada mutación de los tres controllers y acepta solo las tres excepciones cerradas del contrato: `POST /crm/subscribers`, `POST /crm/subscribers/search` y `POST /crm/expedientes` (`tests/crm-blocked-mutations.arch.spec.ts:1-55`).

El test HTTP ejercita transición, borrado, subrecurso, mutación contractual y actualización de suscriptor. SALES atraviesa la guarda con la autorización de rol real de las rutas elegidas. ACCOUNTANT con `crm.blocked_data.read` y un actor con `privacy.read` usan una sustitución de `RolesGuard` limitada al harness para aislar la regla de privacidad; `PermissionsGuard` sigue comprobando permisos de gestión. Una petición adicional conserva 403 para ACCOUNTANT cuando se usa el RBAC real en `PATCH /crm/contracts/:id`. Las cinco familias/operaciones retornan 409 con `PRIVACY_DATA_BLOCKED` y los spies de mutación siguen sin llamadas (`tests/crm-blocked-mutations.http.spec.ts:39-216`).

## H12 — fixtures HTTP y Swagger de expedientes

El fixture HTTP provee `DataSource` con un query runner sintético, el contexto de tenant y `AuditService.logWithin`. `runInTenantSchema` se simula ejecutando su callback con el manager del fixture. Las lecturas autorizadas comprueban el registro dentro de la transacción antes de responder y que no usen `AuditService.log`; el caso 403 conserva además la aserción negativa de `log` y comprueba que tampoco se invoque `logWithin` (`expedientes.controller.fase2.http.spec.ts:125-200,303-365`). El spec Swagger provee `DataSource`, `logWithin` y la guarda que necesita el controller (`tests/expedientes.swagger.spec.ts:1-46`).

El fixture HTTP de contratos incluye `assertSubscriberNotBlockedForMutation`, conserva el POST 201 autorizado y comprueba que la guarda se ejecute; un caso bloqueado espera 409 y confirma que `create` no escriba (`crm-subrecursos.controller.fase2.http.spec.ts:130-190,430-465`).

## Evidencia focalizada

Comando ejecutado sin Turbo:

```text
pnpm --filter @iwana/api exec jest src/modules/crm/tests/crm-blocked-mutations.arch.spec.ts src/modules/crm/tests/crm-blocked-mutations.http.spec.ts src/modules/crm/subscribers/tests/subscribers.controller.spec.ts src/modules/crm/subscribers/subscribers.controller.fase2.http.spec.ts src/modules/crm/expedientes/tests/expedientes.controller.spec.ts src/modules/crm/expedientes/expedientes.controller.fase2.http.spec.ts src/modules/crm/expedientes/tests/expedientes.swagger.spec.ts src/modules/crm/contracts/tests/contracts.controller.spec.ts src/modules/crm/contracts/tests/contracts.service.spec.ts src/modules/crm/crm-subrecursos.controller.fase2.http.spec.ts --runInBand
```

**Resultado:** 10 suites aprobadas, 316 tests aprobados, 0 fallos. La suite HTTP H12 de expedientes aporta 68 tests aprobados. La corrida incluye el fixture de contratos y el spec Swagger. `prettier --check` de los archivos B3 pasó; `git diff --check -- apps/api/src/modules/crm` no informó errores.

### Suites completas y base de datos

- **Suite API completa sin caché:** 385 suites aprobadas, 4 omitidas y 0 fallidas; 5.229 tests aprobados, 15 omitidos y 0 fallidos. Conteo de la corrida compartida del árbol final, documentada en [B1 v1.3](INFORME-PRIVACY-FASE-1B-B1-v1.3.md) y [V4 v1.2](INFORME-PRIVACY-FASE-1B-V4-GATES-v1.2.md).
- **Turbo tests sin caché:** `pnpm exec turbo run test --force --continue` terminó con 10/10 tareas exitosas, 0/10 cacheadas y ninguna fallida. Conteos por paquete constan en V4 v1.2.
- **[BLOQUEO] API `/health` contra `dbiw` migrada a 151:** la consulta de precondición de solo lectura confirma que las migraciones tenant 149, 150 y 151 faltan en los 21 schemas tenant. No se ejecutaron migraciones ni se inició API/Playwright contra esa base; no se afirma un resultado de health. La precondición del tenant sigue pendiente del CTO.

## Estado

La regla general de mutaciones bloqueadas y H12 tienen evidencia focalizada verde. La corrida final compartida API/Turbo está verde, sin fallos y sin cache hits. El bloqueo de health contra `dbiw` permanece vigente por las migraciones 149–151 ausentes; no se ejecutaron migraciones ni se declara ese gate de entorno como cumplido.
