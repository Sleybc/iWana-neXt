# INFORME — MOD05 Subscribers Fase 03

**Version:** 1.6  
**Estado:** Completado  
**Fecha:** 2026-05-14

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

## Corrección aplicada — normalización de municipios y ubicaciones en Suscriptores

**Fecha:** 2026-05-11

- **Síntoma observado:** en la tabla de `/dashboard/crm/subscribers` y en vistas de contratos se mostraban ubicaciones en formato técnico (`UPPER_SNAKE_CASE`), por ejemplo `SAN_ANTONIO_DEL_TEQUENDAMA` y `EL_COLEGIO`.
- **Causa raíz confirmada:** render directo de `city` / `department` / `installationCity` / `installationDepartment` sin pasar por una utilidad de presentación; la lógica estaba dispersa y sin prueba de regresión en el módulo de suscriptores.
- **Ajuste implementado (portal):**
  1. Se centralizó el formateo en `subscriber-ui.ts` con `formatLocationLabel()` y `formatSubscriberLocation()`.
  2. El formateo usa primero etiquetas canónicas del catálogo (`DEPARTAMENTOS`) y, si no hay match, aplica fallback en sentence case español (`_`/`-` -> espacio + conectores en minúscula).
  3. Se reemplazó render crudo por util central en lista de suscriptores, `ContractCard` y `ContractDetailDrawer`.
  4. Se agregó test unitario de regresión para municipios conocidos y valores no catalogados.
- **Archivos impactados:**
  - `apps/portal/src/components/crm/subscribers/subscriber-ui.ts`
  - `apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx`
  - `apps/portal/src/components/crm/subscribers/ContractCard.tsx`
  - `apps/portal/src/components/crm/subscribers/ContractDetailDrawer.tsx`
  - `apps/portal/src/components/crm/subscribers/subscriber-ui.spec.ts`
- **Validación ejecutada:**
  - `pnpm --filter @iwana/portal test -- subscriber-ui.spec.ts` ✅ (3 tests)
  - `pnpm --filter @iwana/portal lint` ✅

## Corrección aplicada — propagación de nombre completo a Identificación en Expedientes

**Fecha:** 2026-05-14

- **Síntoma observado:** al crear una oportunidad desde `/dashboard/crm/expedientes`, el campo `Nombre completo` se persistía en el expediente, pero la sección `Identificación` abría vacía en `Nombres` / `Apellidos` o `Razón social`; el usuario debía reescribir manualmente la información ya capturada.
- **Causa raíz confirmada:** el flujo de creación rápida solo persistía `fullName`, mientras la hidratación del detalle y el formulario de identificación del portal trabajaban con `firstName`, `lastName` y `companyName` sin una derivación intermedia desde `fullName`.
- **Ajuste implementado (portal):**
  1. Se creó una derivación compartida que usa `fullName` como semilla de identificación cuando los campos específicos todavía están vacíos.
  2. Para persona natural, la derivación aplica heurística simple: última palabra como apellido y el resto como nombres.
  3. Para persona jurídica, la derivación hidrata `companyName` desde `fullName` sin pisar valores persistidos.
  4. La vista de detalle reutiliza la misma derivación cuando el usuario cambia `Tipo de persona`, evitando que tenga que volver a digitar el nombre base.
  5. Se agregaron pruebas unitarias de regresión para derivación natural, derivación jurídica, no sobreescritura de datos persistidos y reutilización al cambiar el tipo de persona.
- **Archivos impactados:**
  - `apps/portal/src/components/crm/expedientes/sections/constants.ts`
  - `apps/portal/src/components/crm/expedientes/sections/index.ts`
  - `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
  - `apps/portal/src/components/crm/expedientes/sections/constants.spec.ts`
- **Validación ejecutada:**
  - `runTests` focalizado sobre `apps/portal/src/components/crm/expedientes/sections/constants.spec.ts` ✅ (6 tests)
  - `pnpm --filter @iwana/portal typecheck` ✅

### Refinamiento posterior — heurística para personas naturales

- **Ajuste aplicado:** se refinó la separación automática de `fullName` para personas naturales con reglas explícitas por cantidad de palabras.
  1. Dos palabras: un nombre y un apellido.
  2. Tres palabras: se admite el caso ambiguo entre `dos nombres + un apellido` y `un nombre + dos apellidos`; la heurística prioriza `dos nombres + un apellido` cuando la segunda palabra coincide con nombres propios frecuentes y, en caso contrario, asume `un nombre + dos apellidos`.
  3. Cuatro palabras: dos nombres y dos apellidos.
  4. Cinco o más palabras: se preserva el patrón extendido dejando las dos últimas como apellidos.
- **Cobertura agregada:** regresiones unitarias para 2, 3 y 4 palabras en `constants.spec.ts`.
- **Validación ejecutada:**
  - `runTests` focalizado sobre `apps/portal/src/components/crm/expedientes/sections/constants.spec.ts` ✅ (9 tests)
  - `pnpm --filter @iwana/portal typecheck` ✅

## Corrección aplicada — completitud cruzada entre Dirección y Validación técnica

**Fecha:** 2026-05-14

- **Síntoma observado:** al completar el formulario de `Dirección`, la sección quedaba en `75%`; luego, al registrar coordenadas desde `Validación técnica`, la sección `Dirección` subía a `100%`, aunque esas coordenadas no se capturan en el formulario de ubicación.
- **Causa raíz confirmada:** el backend de completitud estaba tratando coordenadas o referencias de ubicación como requisito de la sección `Dirección`, y el fallback del portal también incluía `latitude` y `longitude` dentro de `completionFields` de la sección `location`.
- **Ajuste implementado:**
  1. API: la completitud de `Dirección` se alineó con los campos visibles del formulario de ubicación: `department`, `municipality`, `address`, `postalCode`, `stratum` y `neighborhood`.
  2. API: se removió la dependencia de coordenadas para completar la sección `Dirección`; las coordenadas permanecen asociadas al flujo de `Validación técnica`.
  3. Portal: se eliminaron `latitude` y `longitude` de `renderFields`, `payloadFields` y `completionFields` de la sección `location`.
  4. Se agregaron pruebas de regresión para validar que `Dirección` puede llegar a `100%` sin coordenadas y que `Validación técnica` no altera ese porcentaje por cruce de campos.
- **Archivos impactados:**
  - `apps/api/src/modules/crm/expedientes/expediente-section-completeness.service.ts`
  - `apps/api/src/modules/crm/expedientes/tests/completeness-calculator.service.spec.ts`
  - `apps/portal/src/components/crm/expedientes/sections/constants.ts`
  - `apps/portal/src/components/crm/expedientes/sections/constants.spec.ts`
- **Validación ejecutada:**
  - `runTests` focalizado sobre `apps/api/src/modules/crm/expedientes/tests/completeness-calculator.service.spec.ts` ✅ (4 tests)
  - `runTests` focalizado sobre `apps/portal/src/components/crm/expedientes/sections/constants.spec.ts` ✅ (10 tests)
  - `pnpm --filter @iwana/api typecheck` ✅
  - `pnpm --filter @iwana/portal typecheck` ✅

### Ajuste posterior — Viabilidad técnica exige coordenadas

- **Síntoma observado:** tras separar correctamente la sección `Dirección`, la sección `Viabilidad técnica` seguía marcando `100%` aunque no tuviera coordenadas registradas.
- **Causa raíz confirmada:** el cálculo de completitud técnica solo evaluaba `feasibility`, `candidateTechnologies`, `evaluationSource` y `technicalConfidence`; las coordenadas se capturaban en la UI pero no participaban en el porcentaje de completitud.
- **Ajuste implementado:**
  1. API: se agregó un requisito explícito de `Coordenadas de validación` dentro de la sección `technicalFeasibility`, cumplido solo cuando existen `latitude` y `longitude`.
  2. Portal: se añadieron `latitude` y `longitude` a `completionFields` de `technical_feasibility` para alinear el fallback local con la completitud del backend.
  3. Se agregaron regresiones unitarias para asegurar que `Viabilidad técnica` no marque `100%` si faltan coordenadas y que la configuración del portal también las exija.
- **Validación ejecutada:**
  - `runTests` focalizado sobre `apps/api/src/modules/crm/expedientes/tests/completeness-calculator.service.spec.ts` ✅ (5 tests)
  - `runTests` focalizado sobre `apps/portal/src/components/crm/expedientes/sections/constants.spec.ts` ✅ (11 tests)
  - `pnpm --filter @iwana/api typecheck` ✅
  - `pnpm --filter @iwana/portal typecheck` ✅
