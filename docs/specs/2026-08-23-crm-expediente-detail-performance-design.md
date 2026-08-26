# CRM Expediente Detail Performance Design

**Estado:** Propuesto para implementacion
**Version:** v1.0
**Fecha:** 2026-08-23
**Modulo:** MOD05 CRM / Expedientes

## Objetivo

Reducir el tiempo percibido y real al abrir el detalle de un expediente, eliminando la cascada de solicitudes, las consultas redundantes, la carga innecesaria de datos sensibles y la repeticion de resoluciones entre pestañas.

## Evidencia actual

### Frontend

- `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx:239-309` mantiene el skeleton hasta completar seis solicitudes CRM en serie: expediente, timeline, atribucion actual, historial de atribucion, responsabilidad actual e historial de responsabilidad.
- `apps/portal/src/components/crm/expedientes/useCrmInstallationFieldWork.ts:24-54` dispara dos solicitudes WFM al montar el detalle. No bloquea el estado `loading`, pero consume recursos antes de que el expediente sea utilizable.
- `apps/portal/src/components/crm/expedientes/SeguimientoTab.tsx:201-263` consulta intentos de contacto y resuelve catalogo al entrar en la pestaña.
- `apps/portal/src/components/crm/expedientes/sections/CommercialInterestSection.tsx:65-158` vuelve a resolver el plan, productos y servicios. La resolucion del plan se repite entre Gestion y Seguimiento.
- `apps/portal/src/app/dashboard/crm/expedientes/[id]/loading.tsx:1-8` y `page.tsx:615-622` duplican el skeleton del detalle.
- La pagina es un Client Component completo (`page.tsx:1`), aunque el render inicial depende principalmente de datos y solo una parte requiere interactividad.

### Backend

- `apps/api/src/modules/crm/expedientes/expedientes.controller.ts:141-156` calcula completitud y recomendacion fuera del servicio principal, mientras `apps/api/src/modules/crm/expedientes/expediente.service.ts:817-895` ya calcula completitud dentro de `findById()`.
- `apps/api/src/modules/crm/expedientes/pipeline-recommendation.service.ts:42-54` vuelve a cargar el expediente y vuelve a calcular completitud.
- `apps/api/src/modules/crm/expedientes/expediente.service.ts:821-824` carga relaciones completas de intentos, consentimientos, verificaciones y cambios de estado para un detalle que luego consulta esos datos por endpoints separados.
- `apps/api/src/modules/crm/expedientes/expediente.service.ts:1497-1504` hace que el timeline vuelva a invocar `findById()` y cargue el grafo completo antes de leer auditoria.
- La respuesta observada de `GET /crm/expedientes/:id` fue de aproximadamente `24.5 KB` descomprimidos e incluyo bloques de completitud repetidos.

### Medicion local

Caso real en `http://localhost:3002`, sin throttling y con usuario autenticado:

- LCP observado al abrir un detalle: `2165 ms`.
- Solicitudes iniciales: dos solicitudes WFM en paralelo y seis solicitudes CRM que el codigo espera secuencialmente.
- La primera llamada del expediente duro aproximadamente `392 ms`; las solicitudes siguientes se encadenaron hasta responsabilidad e historial.
- En desarrollo, React Strict Mode produjo solicitudes repetidas `200/304` para WFM, expediente, timeline, atribucion y responsabilidad.
- Al abrir `Gestion`, la resolucion del plan genero llamadas al buscador y al catalogo. Al cambiar a `Seguimiento`, el mismo plan volvio a resolverse.
- Al entrar y salir de `Seguimiento`, `/contact-attempts` se solicito nuevamente.

## Direccion de arquitectura

Se adopta un enfoque de **bootstrap minimo + carga progresiva por superficie**.

### 1. Bootstrap especializado del detalle

Agregar el contrato especializado `GET /crm/expedientes/:id/bootstrap` para la pantalla de detalle. El endpoint no reemplaza inmediatamente el `GET /crm/expedientes/:id` usado por otros consumidores.

El bootstrap entrega solo lo necesario para mostrar `Vista general` y habilitar sus acciones:

```typescript
type ExpedienteDetailBootstrap = {
  expediente: ExpedienteDetailSummary;
  completeness: CompletenessResult;
  pipelineRecommendation: PipelineRecommendation | null;
  operationalMetadata: ExpedienteOperationalMetadata;
  currentAttribution: SalesAttributionRecord | null;
  responsibility: ResponsibilitySnapshot | null;
  subscriberSummary: SubscriberSummary | null;
};
```

La proyeccion debe excluir relaciones completas, ciphertext, campos de auditoria interna y datos PII que no sean necesarios para esta superficie. La autorizacion debe conservar el aislamiento por tenant y las reglas de rol existentes.

El servicio de bootstrap debe reutilizar una unica instancia cargada del expediente y un unico resultado de completitud. La recomendacion de pipeline recibira esos valores como entrada, en lugar de consultar y calcular nuevamente.

### 2. Shell progresivo del detalle

El estado inicial de la pagina se divide en:

- **Bloqueante:** bootstrap especializado y datos necesarios para `Vista general`.
- **No bloqueante:** estado de trabajo WFM, timeline, historiales, contactos, documentos y resolucion de catalogo.
- **Bajo demanda:** componentes pesados de `Gestion`, `Seguimiento` y el mapa de viabilidad.

El skeleton de detalle se consolidara en un componente reutilizable para que `loading.tsx` y el fallback del Client Component no mantengan markup duplicado.

### 3. Una fuente para el historial

El timeline se convertira en una proyeccion paginada del servidor con eventos tipados de pipeline, sistema, atribucion, responsabilidad y contacto. `SeguimientoTab` no debe combinar el mismo contacto desde `/timeline` y `/contact-attempts`.

La primera iteracion puede conservar endpoints de escritura existentes. Luego de crear un contacto, la pestaña invalida o recarga una sola pagina del timeline. Los endpoints separados de historial se mantienen temporalmente para compatibilidad, pero dejan de ser parte de la carga inicial.

### 4. Catalogo compartido

La resolucion de plan, productos y servicios se centralizara mediante un contrato batch de catalogo o un resolver compartido con cache de promesas por tenant e ID. `CommercialInterestSection` y `SeguimientoTab` no realizaran resoluciones independientes para los mismos IDs.

### 5. WFM diferido

La consulta de trabajo de campo se habilitara despues de que el bootstrap haya pintado la pantalla. Su estado seguira controlando exclusivamente el CTA de instalacion. La lectura no debe ejecutar reconciliaciones globales ni escrituras amplias dentro de un GET puntual del expediente.

## Trabajo backend requerido

1. Crear DTO/proyeccion `ExpedienteDetailBootstrap` y un servicio de lectura especializado.
2. Separar `findById()` de la carga de relaciones completas y evitar que el endpoint de detalle serialize colecciones no solicitadas.
3. Permitir que `CompletenessCalculator` calcule desde un contexto precargado; mantener el metodo batch existente para listados.
4. Cambiar `PipelineRecommendationService` para aceptar expediente y completitud ya resueltos cuando sea invocado desde bootstrap.
5. Rediseñar `getTimelineSummary()` para no llamar `findById()`, usar consultas acotadas y paginacion estable.
6. Revisar la proyeccion de consentimientos para que el detalle general no pueda eludir la ocultacion de `ipAddress` aplicada por el endpoint especializado.
7. Eliminar la exposicion de ciphertext del contrato de lectura general y revisar los tests que actualmente congelan ese comportamiento.
8. Medir con `EXPLAIN (ANALYZE, BUFFERS)` las consultas de hijos, auditoria, atribucion y responsabilidad antes de agregar o modificar indices.
9. Revisar el acceso cross-module de CRM hacia Users y de WFM hacia Expedientes. La optimizacion no debe consolidar una violacion de boundary existente.

## Trabajo frontend requerido

1. Agregar `crmApi.getExpedienteBootstrap()` con un contrato tipado y usarlo solo en el detalle CRM.
2. Hacer que la pantalla desbloquee `Vista general` con el bootstrap, sin esperar WFM ni historiales.
3. Diferir `useCrmInstallationFieldWork` hasta que el expediente este disponible y el shell inicial haya terminado.
4. Cargar `SeguimientoTab` y `ExpedienteSections` bajo demanda, manteniendo fallback accesible.
5. Evitar doble efecto en desarrollo mediante cancelacion de fetch, deduplicacion por clave y pruebas de Strict Mode. No ocultar el problema solo suprimiendo warnings.
6. Consolidar el skeleton duplicado entre `loading.tsx` y `page.tsx`.
7. Sustituir la combinacion local de cinco fuentes de timeline por el contrato unificado paginado.
8. Compartir el resolver de catalogo entre Gestion y Seguimiento.
9. Evaluar prefetch de detalle solo despues de medir el costo de red y la tasa real de apertura; no prefetchear ocho solicitudes secundarias.

## Contratos y compatibilidad

- El endpoint existente se conserva durante la migracion porque tiene consumidores en scheduling y solicitudes pendientes.
- El nuevo bootstrap se versiona mediante el contrato tipado del portal y OpenAPI.
- No se cambia el modelo de tenancy: todas las lecturas deben resolver el schema desde `TenantContext` y ejecutar `SET LOCAL search_path` dentro de la transaccion aprobada.
- Los endpoints de escritura de contacto, atribucion y responsabilidad no cambian en la primera fase.

## Criterios de aceptacion

- La apertura inicial bloquea como maximo una solicitud de bootstrap CRM; WFM y datos de pestañas no forman parte del critical path.
- La pantalla muestra header, resumen, recomendacion y acciones generales sin esperar timeline, historiales ni catalogo.
- No se repite completitud dentro del mismo bootstrap.
- El bootstrap no devuelve relaciones completas ni ciphertext; consentimientos respetan la proyeccion por rol.
- En desarrollo, el flujo no deja solicitudes duplicadas sin cancelar o deduplicar bajo Strict Mode.
- Cambiar entre Gestion y Seguimiento no repite la misma resolucion de catalogo para el mismo tenant e ID.
- Volver a entrar en Seguimiento no repite contactos si la pagina no fue invalidada.
- El timeline no muestra el mismo contacto dos veces.
- Las pruebas de contrato, seguridad, integración y E2E cubren el nuevo flujo.
- En una medicion comparable a la linea base, el tiempo hasta contenido util y el numero de solicitudes bloqueantes mejoran al menos un `40%`, sin regresion de accesibilidad.

## Estrategia de validacion

- Instrumentar numero de solicitudes, duracion, bytes de respuesta y consultas SQL por endpoint.
- Añadir prueba de integracion que verifique una sola carga de expediente y completitud por bootstrap.
- Añadir prueba de seguridad que confirme ausencia de IP y ciphertext para roles no autorizados.
- Añadir prueba de contrato para proyeccion y paginacion del timeline.
- Añadir pruebas de portal para carga progresiva, cancelacion/deduplicacion y cache de catalogo.
- Ejecutar Playwright en frio y caliente con usuario ADMIN y SALES, midiendo `click -> shell visible`, `shell -> Vista general util` y `tab -> contenido listo`.
- Ejecutar `EXPLAIN (ANALYZE, BUFFERS)` con fixture de expediente de alta cardinalidad antes de cerrar indices.

## Fuera de alcance

- Reescribir toda la pagina como Server Component en esta iteracion.
- Cambiar el diseño visual o el flujo de negocio del expediente.
- Introducir un cache global persistente sin una decision de tenancy y consistencia.
- Resolver todos los boundaries cross-module fuera de las rutas tocadas por este flujo.

## Riesgos

- El contrato actual de `GET /crm/expedientes/:id` es consumido fuera de esta pagina; por eso la migracion debe ser aditiva.
- La consolidacion del timeline puede requerir una version de DTO para no romper filtros y renderizadores existentes.
- Diferir WFM puede mostrar el CTA en estado de carga durante algunos milisegundos; debe existir un estado accesible y no bloquear el resto de la pantalla.
- La reduccion de relaciones del detalle debe probarse con los roles ADMIN, SALES y SUPPORT para evitar regresiones de autorizacion.
