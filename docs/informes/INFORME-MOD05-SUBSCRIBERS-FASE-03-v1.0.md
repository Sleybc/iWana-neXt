# INFORME — MOD05 Subscribers Fase 03

**Version:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-04-17

## Alcance ejecutado

1. Conversión two-stage basada en eventos de pipeline (`LISTO_PARA_INSTALACION`, `CLIENTE_ACTIVO`, `DESCARTADO`).
2. Migración tenant `015_add_subscriber_conversion_fields` con columnas de trazabilidad e índice por `tenant_id + expediente_id`.
3. Extensión de `Subscriber` con `expedienteId`, `convertedAt`, `activatedAt`, `manualOverrideReason`.
4. API subscriber 360 extendida con `quotes`, `arcoRequests`, `expedienteSummary` y `timelineSeed`.
5. Endpoint de guardado por sección: `PATCH /crm/subscribers/:id/section/:section` con validación Zod por sección.
6. Filtro de expedientes abiertos: exclusión por defecto de `CLIENTE_ACTIVO` y `DESCARTADO`; override con `includeCompleted=true`.
7. Refuerzo de alta manual: validación de `manualOverrideReason` y restricción administrativa.
8. Extensión inicial del portal subscriber detail a 6 tabs (estructura 360 y placeholders honestos).

## Archivos clave modificados

- `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- `apps/api/src/modules/crm/expedientes/expedientes.controller.ts`
- `apps/api/src/modules/crm/expedientes/events/expediente-pipeline.events.ts`
- `apps/api/src/modules/crm/subscribers/subscribers.service.ts`
- `apps/api/src/modules/crm/subscribers/subscribers.controller.ts`
- `apps/api/src/modules/crm/subscribers/subscriber-creation.service.ts`
- `apps/api/src/modules/crm/subscribers/listeners/*`
- `apps/api/src/modules/crm/subscribers/entities/subscriber.entity.ts`
- `packages/database/src/migrations/tenant/015_add_subscriber_conversion_fields.ts`
- `packages/database/src/migrations/tenant/runner.ts`
- `packages/shared/src/schemas/subscriber.schema.ts`
- `apps/portal/src/lib/api-client.ts`
- `apps/portal/src/components/crm/subscribers/SubscriberDetailClient.tsx`

## Evidencia técnica

1. `pnpm --filter @iwana/api typecheck` ✅
2. `pnpm --filter @iwana/portal typecheck` ✅
3. `pnpm --filter @iwana/api test -- src/modules/crm/subscribers/tests/subscribers.controller.spec.ts src/modules/crm/subscribers/tests/subscriber-creation.service.spec.ts` ✅

## Riesgos / pendientes inmediatos

1. Completar tests de integración HTTP para flujo expediente→subscriber y endpoint por sección.
2. Profundizar contenido real de tabs Servicios/Financiero/Cumplimiento/Seguimiento en portal con datos de bounded context.
3. Ajustar wiring de consumidores de eventos para métricas/auditoría avanzada en operación.

## Corrección aplicada — transición a cliente activo desde portal

- **Síntoma observado:** transición bloqueada con `INVALID_STATUS_TRANSITION` y faltantes de instalación.
- **Causa raíz:** en UI del expediente no se estaban renderizando ni guardando las secciones operativas `billing` e `installation`; por eso no era posible completar datos que el backend exige para avanzar en pipeline.
- **Ajuste implementado en portal:**
  1. Se reactivaron las secciones `Facturación` e `Instalación` en la vista de expediente.
  2. Se añadió mapeo de campos operativos en configuración de secciones (`paymentMethod`, `billingCycle`, `fiscalName`, `installationAddress`, `siteContactName`, `siteContactPhone`).
  3. Se alineó la agrupación de completitud operacional del frontend con secciones operativas reales (`billing` + `installation`).
  4. Se ampliaron formularios de secciones para capturar `fiscalName` y `siteContactPhone`.

- **Archivos impactados:**
  - `apps/portal/src/components/crm/expedientes/sections/constants.ts`
  - `apps/portal/src/components/crm/expedientes/sections/ExpedienteSections.tsx`
  - `apps/portal/src/components/crm/expedientes/sections/BillingSection.tsx`
  - `apps/portal/src/components/crm/expedientes/sections/InstallationSection.tsx`

- **Validación:** `pnpm --filter @iwana/portal typecheck` ✅

## Corrección aplicada — persistencia y target de transición

- **Síntoma observado:** aun con secciones operativas visibles, el portal seguía enviando una transición inválida y el backend respondía con validación de `LISTO_PARA_INSTALACION`.
- **Causa raíz confirmada:**
  1. `loadExpediente()` pisaba `transitionTarget` con `response.data.status` tras cada recarga, incluyendo después de guardar secciones; eso hacía que el botón “Aplicar transición” intentara reenviar el estado actual.
  2. `findById()` no descifraba `siteContactPhoneEncrypted`, y `buildDraftValues()` no reutilizaba el valor hidratado del expediente; el dato operativo quedaba invisible al recargar.
  3. Los tests de `ExpedienteService` no estaban inyectando `EventEmitter2`, dejando la regresión sin cobertura ejecutable.

- **Ajuste implementado:**
  1. Portal: sugerencia automática del siguiente estado del pipeline y preservación de la selección del usuario entre recargas.
  2. Portal: guard clause para no disparar transiciones al mismo estado.
  3. API: `validateTransition()` acepta no-op cuando `targetStatus === expediente.status`, evitando 400 espurios.
  4. API: `findById()` ahora descifra `siteContactPhoneEncrypted` y el contrato portal hidrata `siteContactPhone`.
  5. Portal: `NotificationBell` deja de consultar `GET /audit-logs` para roles sin permiso (`ADMIN`, `SYSTEM_ADMIN`), eliminando el `401/403` espurio en consola para usuarios tenant no autorizados.
  6. Tests: regresiones nuevas para transición no-op y descifrado de `siteContactPhone`, además del wiring faltante de `EventEmitter2`.

- **Archivos impactados:**
  - `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
  - `apps/portal/src/lib/api-client.ts`
  - `apps/portal/src/components/crm/expedientes/sections/constants.ts`
  - `apps/portal/src/components/layout/NotificationBell.tsx`
  - `apps/api/src/modules/crm/expedientes/status-transition.service.ts`
  - `apps/api/src/modules/crm/expedientes/expediente.service.ts`
  - `apps/api/src/modules/crm/expedientes/tests/status-transition.service.spec.ts`
  - `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`

- **Validación:**
  - `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/status-transition.service.spec.ts src/modules/crm/expedientes/tests/expediente.service.spec.ts` ✅
  - `pnpm --filter @iwana/api typecheck` ✅
  - `pnpm --filter @iwana/api lint` ✅
  - `pnpm --filter @iwana/portal typecheck` ✅
  - `pnpm --filter @iwana/portal lint` ✅
