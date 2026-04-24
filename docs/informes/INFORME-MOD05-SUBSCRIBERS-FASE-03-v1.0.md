# INFORME — MOD05 Subscribers Fase 03

**Version:** 1.1  
**Estado:** Completado  
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

## Corrección aplicada — normalización de campos en Suscriptores (Datos/Contacto/Dirección)

- **Objetivo:** alinear el módulo de Suscriptores con el requerimiento funcional de negocio para la pestaña Datos y el patrón de contacto del CRM.

- **Ajuste implementado (portal):**
  1. Se retiraron de la sección Datos los campos `fecha de nacimiento`, `estrato` y `segmento`.
  2. Se normalizó la sección Contacto a: `Correo principal`, `Teléfono principal`, `Contacto alternativo`, `Teléfono`.
  3. Se actualizó Dirección para incluir: `Departamento`, `Municipio`, `Dirección`, `Código postal`, `Barrio/Sector`, `Latitud`, `Longitud` y vista de mapa embebida (OSM).

- **Ajuste implementado (backend + contrato):**
  1. Se extendió `Subscriber` con `altContactName` y `altContactPhoneEncrypted`.
  2. Se extendieron DTOs, servicio y respuesta para soportar `altContactName` y `altContactPhone` (descifrado en salida).
  3. Se extendió el schema compartido (`@iwana/shared`) de create/update con los dos campos de contacto alternativo.
  4. Se agregó migración tenant `016_add_subscriber_alternate_contact_fields` y registro en `runner.ts`.
  5. Se actualizó el contrato de `SubscriberRecord` en el portal para mapear campos nuevos.

- **Archivos impactados principales:**
  - `packages/shared/src/schemas/subscriber.schema.ts`
  - `apps/api/src/modules/crm/subscribers/entities/subscriber.entity.ts`
  - `apps/api/src/modules/crm/subscribers/dto/create-subscriber.dto.ts`
  - `apps/api/src/modules/crm/subscribers/dto/update-subscriber.dto.ts`
  - `apps/api/src/modules/crm/subscribers/dto/subscriber-response.dto.ts`
  - `apps/api/src/modules/crm/subscribers/subscribers.service.ts`
  - `apps/api/src/modules/crm/subscribers/subscribers.controller.ts`
  - `packages/database/src/migrations/tenant/016_add_subscriber_alternate_contact_fields.ts`
  - `packages/database/src/migrations/tenant/runner.ts`
  - `apps/portal/src/lib/api-client.ts`
  - `apps/portal/src/components/crm/subscribers/SubscriberSections.tsx`

- **Validación ejecutada:**
  - `pnpm --filter @iwana/api typecheck` ✅
  - `pnpm --filter @iwana/portal typecheck` ✅
  - `pnpm --filter @iwana/api test -- src/modules/crm/subscribers/tests/subscribers.controller.spec.ts src/modules/crm/subscribers/tests/subscribers.service.spec.ts` ✅ (44 tests)

## Corrección aplicada — código postal de CRM visible en Suscriptores

- **Síntoma observado:** el `Código postal` capturado en CRM no aparecía en la ficha de Suscriptores.

- **Causa raíz confirmada:**
  1. En la conversión automática `Expediente -> Subscriber` no se estaba propagando `postalCode`.
  2. Los subscribers convertidos antes del ajuste quedaban con `postalCode` nulo aunque el expediente sí tenía valor.

- **Ajuste implementado (backend):**
  1. Se propagó `postalCode` en `SubscriberCreationService` al invocar `createFromExpediente()`.
  2. Se extendió el contrato interno de `SubscribersService.createFromExpediente()` para aceptar y persistir `postalCode`.
  3. Se añadió compatibilidad en `get360View()`: si el subscriber no tiene `postalCode` y el expediente vinculado sí, se hidrata para visualización inmediata.
  4. Se reforzaron tests unitarios de creación para validar la propagación de `postalCode` en natural y jurídica.

- **Archivos impactados:**
  - `apps/api/src/modules/crm/subscribers/subscriber-creation.service.ts`
  - `apps/api/src/modules/crm/subscribers/subscribers.service.ts`
  - `apps/api/src/modules/crm/subscribers/tests/subscriber-creation.service.spec.ts`

- **Validación ejecutada:**
  - `pnpm --filter @iwana/api typecheck` ✅
  - `pnpm --filter @iwana/api test -- src/modules/crm/subscribers/tests/subscriber-creation.service.spec.ts` ✅ (24 tests)

## Ajuste UI aplicado — retiro de porcentaje en títulos de sección

- **Solicitud funcional:** eliminar el indicador `100%` del lado derecho en los encabezados de `Identificación`, `Contacto` y `Dirección` dentro de la vista de Suscriptores.
- **Implementación:** se retiró el badge de completitud en `SectionCard` y se eliminó el cálculo de porcentaje no usado en el componente.
- **Archivo impactado:**
  - `apps/portal/src/components/crm/subscribers/SubscriberSections.tsx`
- **Validación ejecutada:**
  - `pnpm --filter @iwana/portal typecheck` ✅

## Ajuste UI aplicado — vista general en español y formato amigable

- **Solicitud funcional atendida:**
  1. En `Identidad del suscriptor`, mostrar `Estado`, `Tipo` y `Segmento` en español y con sentence case.
  2. En `Origen del expediente`, mostrar una referencia amigable del expediente y mantener el identificador completo como código interno.
  3. Mostrar `Estado` del expediente en formato legible (no `UPPER_SNAKE_CASE`).

- **Implementación (portal):**
  1. Se usaron metadatos existentes (`SUBSCRIBER_STATUS_META`, `PERSON_TYPE_META`, `CUSTOMER_SEGMENT_META`) para renderizar labels de negocio en español.
  2. Se aplicó `formatExpedienteStatus()` para el estado del expediente en la vista general.
  3. Se creó referencia amigable de expediente con patrón `EXP-<primer bloque UUID>` y se conserva `Código interno` completo en texto auxiliar.

- **Gobernanza actualizada:**
  1. Se agregó regla explícita en `AGENTS.md` para UI copy en español + sentence case y prohibición de enums crudos en `UPPER_SNAKE_CASE` en vistas finales.

- **Archivos impactados:**
  - `apps/portal/src/components/crm/subscribers/SubscriberDetailClient.tsx`
  - `AGENTS.md`

- **Validación ejecutada:**
  - `pnpm --filter @iwana/portal typecheck` ✅

## Ajuste UI aplicado — Interés del cliente con productos y servicios adicionales

**Fecha:** 2026-04-24

- **Solicitud funcional:** reemplazar el checklist de productos adicionales en `/dashboard/crm/expedientes/:id` por una experiencia más clara, y agregar selección de servicios adicionales en la sección `Interés del cliente`.
- **Implementación:** se reutilizó `MultiCatalogPicker` para productos y servicios adicionales, con búsqueda local y chips de selección. La sección conserva `additionalProductIds` y agrega `additionalServiceIds` como arrays persistidos vía `crmApi.updateExpedienteSection`.
- **Archivos impactados:**
  - `apps/portal/src/components/crm/expedientes/sections/CommercialInterestSection.tsx`
  - `apps/portal/src/components/crm/expedientes/sections/constants.ts`
  - `apps/portal/src/components/crm/expedientes/sections/ExpedienteSections.tsx`
  - `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- **Validación ejecutada:**
  - `npx tsc --noEmit` en `apps/portal` ✅

## Feature completada — Fase 3 UI: CatalogPicker, ContractDetailDrawer, CreateContractDialog

**Fecha:** 2026-04-24

### Componentes creados

1. **CatalogPicker<T> y MultiCatalogPicker<T>** (pps/portal/src/components/shared/CatalogPicker.tsx):
   - Selectores genéricos reutilizables con búsqueda local, overlay click-outside, soporte dark mode.
   - CatalogPicker (selección simple) y MultiCatalogPicker (multi-selección con tags).

2. **ContractDetailDrawer** (pps/portal/src/components/crm/subscribers/ContractDetailDrawer.tsx):
   - Drawer lateral de lectura + edición inline de contratos.
   - Secciones: plan contratado, instalación, facturación, datos fiscales, metadatos.
   - Botones de transición de estado (activar/suspender/reactivar/terminar/archivar) con confirmación por variante.
   - Modo edición con formularios completos y guardado vía contractsApi.update.

3. **CreateContractDialog** (pps/portal/src/components/crm/subscribers/CreateContractDialog.tsx):
   - Modal completo para crear nuevo contrato desde cero.
   - Selector de plan (CatalogPicker), productos y servicios adicionales (MultiCatalogPicker).
   - Carga catálogo vía commercialApi en montaje.
   - Snapshot del plan capturado en planSnapshotJson.

### Componentes actualizados

4. **ConvertExpedienteToContractDialog**: plan de interés pre-seleccionado con picker visual.
5. **ContractCard**: nuevo prop onViewDetail + botón "Ver detalle →".
6. **ServiciosTab**: wiring completo — importa y renderiza drawer + diálogo crear contrato; reemplaza TODOs.

### Validación

- 
px tsc --noEmit en pps/portal ✅ (sin errores)
- Corregido xactOptionalPropertyTypes en payloads con spread condicional.
