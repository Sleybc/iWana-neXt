# Informe CRM Expediente — Optimización Task 3

**Fecha:** 2026-08-24  
**Estado:** Implementación frontend y E2E CRM verificadas  
**Agente:** AI-FE-PLATFORM

## Alcance

Se reforzó la pantalla de detalle CRM contra el bootstrap tipado existente, sin
modificar backend, endpoints, migraciones ni boundaries WFM.

## Implementación

- Mock E2E del bootstrap seguro para expedientes abiertos, listos para instalación
  y convertidos; la proyección inicial no incluye datos operativos pesados.
- `ExpedienteDetailSummary` incluye `dataConsentRevoked` y la página conserva el
  estado real recibido por bootstrap para el banner de consentimiento/conversión.
- El bootstrap seguro incluye `additionalProductIds` y `additionalServiceIds`; no se
  incorpora `sourceDetail` a la proyección segura.
- Carga diferida real mediante `next/dynamic` para Gestión y Seguimiento.
- Seguimiento consume el resumen seguro y carga únicamente timeline/activities,
  historial de atribución, historial de responsabilidad e intentos de contacto;
  Gestión conserva la carga legacy completa bajo demanda.
- Las cargas de página, tabs y cambios de expediente usan generaciones monotónicas;
  solo la última generación puede escribir estado o marcar una pestaña como cargada/error;
  una carga invalidada vuelve a `idle` para permitir reintento al regresar a la pestaña.
- Las cargas paralelas de bootstrap, Gestión y Seguimiento se observan con
  `Promise.allSettled`, incluso cuando una generación anterior queda invalidada, evitando
  rechazos no observados sin permitir escrituras stale.
- Cache/deduplicación en memoria con scope tenant, TTL de cinco minutos e invalidación
  al cambiar o limpiar el tenant, incluyendo eventos `storage` entre tabs, para
  catálogos, intentos de contacto y estado WFM;
  las respuestas WFM se comparten entre las instancias del detalle y sus acciones.
- WFM no hace fetch inicial implícito: las acciones invocan `load()` de forma explícita,
  con retry real, requestRef invalidado al settle/error y protección contra respuestas
  obsoletas al cambiar de expediente o forzar una nueva consulta. Una solicitud creada
  o reutilizada exitosamente invalida su cache WFM específico por tenant/expediente.
- El cliente normaliza arrays nullable del bootstrap a `[]` en el boundary HTTP para
  mantener un contrato seguro para la UI sin modificar el backend desde este rol.
- `loadExpediente` propaga éxito o fallo y descarta respuestas obsoletas cuando cambia
  el expediente activo.
- Tabs con `aria-controls`, `aria-labelledby`, `tabpanel`, foco administrado y
  navegación por teclado.
- Mapper de mensajes CRM permitidos; se retiraron `console.error(err)` y exposición
  arbitraria de `err.message`/`details` en la superficie de expedientes, incluyendo
  WFM y los fallbacks de landing.
- Cobertura de tests para tabs accesibles, loading/error, retry, refresh fallido,
  deduplicación y cache de catálogos.

## Archivos principales

- `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.spec.tsx`
- `apps/portal/src/components/crm/expedientes/ExpedienteTabsContainer.tsx`
- `apps/portal/src/components/crm/expedientes/expediente-detail-cache.ts`
- `apps/portal/src/components/crm/expedientes/useCrmInstallationFieldWork.ts`
- `apps/portal/src/components/crm/expedientes/crm-error-message.ts`
- `e2e/tests/portal-crm-expedientes.spec.ts`

## Verificación

- Tests focalizados finales: **10 suites, 58 tests aprobados**.
- Typecheck de `@iwana/portal`: aprobado.
- Prettier del repositorio ejecutado únicamente sobre los archivos afectados por Task 3.
- ESLint de `@iwana/portal`: sin errores; permanecen 44 warnings de reglas de hooks y
  promesas no flotantes en el workspace portal, incluidos paneles legacy y algunos
  componentes CRM existentes.
- Auditoría UI mecánica: sin hallazgos deterministas; un aviso heurístico P3 sobre
  un spinner local de DocumentSupport fue descartado porque no es la carga primaria
  de la página ni de una tabla.
- `git diff --check` de los archivos de esta fase: aprobado; solo persisten avisos
  informativos de conversión CRLF. El workspace global conserva avisos de whitespace
  en archivos preexistentes de otros agentes.
- E2E CRM con `e2e/playwright.portal.config.ts`: **12 pruebas aprobadas**. El servidor
  inició correctamente con Playwright y los flujos de creación, detalle, agenda,
  consentimiento, filtros, contactos, viabilidad, soportes, CommercialModule,
  identificación y conversión quedaron verificados.

## Límites y pendientes

- No se hizo commit.
- El workspace contiene cambios preexistentes de múltiples agentes; no se tocaron ni
  se limpiaron esos cambios.
