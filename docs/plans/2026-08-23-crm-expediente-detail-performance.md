# CRM Expediente Detail Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reducir la latencia al abrir un expediente mediante un bootstrap CRM minimo, carga progresiva por pestaña, consultas backend reutilizables y eliminacion de datos duplicados o innecesarios.

**Architecture:** Se añadira `GET /crm/expedientes/:id/bootstrap` sin romper inicialmente `GET /crm/expedientes/:id`. El bootstrap devolvera una proyeccion segura para `Vista general`; timeline, contactos, historiales, catalogo y WFM se resolveran bajo demanda. El backend reutilizara una instancia del expediente y un unico calculo de completitud, mientras el frontend deduplicara cargas por tenant e ID.

**Tech Stack:** NestJS, TypeORM, PostgreSQL por schema tenant, Next.js App Router, React, TypeScript estricto, Jest, Supertest y Playwright.

---

## Fuente y linea base

- Especificacion aprobada: `docs/specs/2026-08-23-crm-expediente-detail-performance-design.md`.
- Pantalla: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`.
- Endpoint actual: `apps/api/src/modules/crm/expedientes/expedientes.controller.ts:141-156`.
- Medicion local de referencia: LCP `2165 ms`, seis solicitudes CRM secuenciales, dos solicitudes WFM paralelas, respuesta principal de aproximadamente `24.5 KB` descomprimidos.
- No modificar ni revertir cambios ajenos existentes en el working tree.

## Mapa de archivos

### Backend

- Crear `apps/api/src/modules/crm/expedientes/dto/expediente-detail-bootstrap.dto.ts`: tipos de respuesta segura del bootstrap.
- Crear `apps/api/src/modules/crm/expedientes/expediente-detail-bootstrap.service.ts`: orquestacion de lectura del bootstrap.
- Modificar `apps/api/src/modules/crm/expedientes/expedientes.controller.ts`: exponer `GET /:id/bootstrap` y documentarlo en OpenAPI.
- Modificar `apps/api/src/modules/crm/expedientes/expedientes.module.ts`: registrar el servicio y los modulos CRM de lectura necesarios.
- Modificar `apps/api/src/modules/crm/expedientes/expediente.service.ts`: añadir proyeccion base sin relaciones completas ni ciphertext.
- Modificar `apps/api/src/modules/crm/expedientes/completeness-calculator.service.ts`: calcular desde snapshot precargado sin volver a leer expediente, consentimientos, cobertura y cotizaciones.
- Modificar `apps/api/src/modules/crm/expedientes/pipeline-recommendation.service.ts`: aceptar expediente y completitud precargados.
- Modificar `apps/api/src/modules/crm/expedientes/expediente.service.ts` y su controlador: separar timeline de `findById()` y aplicar paginacion estable.
- Modificar `apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts`, `expediente.service.spec.ts` y crear tests del nuevo servicio.
- Modificar `apps/api/src/modules/crm/attributions/attributions.service.ts` y `apps/api/src/modules/crm/responsibilities/responsibilities.service.ts` solo para exponer lecturas batch o con `QueryRunner` reutilizable, sin duplicar consultas ni romper sus endpoints.
- Revisar `apps/api/src/modules/wfm/services/visit-requests.service.ts` y `apps/api/src/modules/wfm/tests/visit-requests.controller.http.spec.ts` para retirar reconciliacion global de un GET puntual.

### Frontend

- Modificar `apps/portal/src/lib/api-client.ts`: tipos `ExpedienteDetailBootstrap` y `crmApi.getExpedienteBootstrap()`.
- Crear `apps/portal/src/components/crm/expedientes/ExpedienteDetailSkeleton.tsx`: skeleton unico para ruta y fallback cliente.
- Modificar `apps/portal/src/app/dashboard/crm/expedientes/[id]/loading.tsx`: reutilizar el skeleton.
- Modificar `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`: cargar bootstrap, desbloquear `Vista general`, diferir WFM y montar tabs bajo demanda.
- Modificar `apps/portal/src/components/crm/expedientes/useCrmInstallationFieldWork.ts`: añadir habilitacion posterior al bootstrap y cancelacion/deduplicacion.
- Crear `apps/portal/src/lib/expediente-catalog-cache.ts`: cache por tenant e ID para resolucion de plan, producto y servicio.
- Modificar `apps/portal/src/components/crm/expedientes/SeguimientoTab.tsx` y `apps/portal/src/components/crm/expedientes/sections/CommercialInterestSection.tsx`: compartir el resolver y evitar llamadas repetidas.
- Modificar `apps/portal/src/components/crm/expedientes/ExpedienteTimelinePanel.tsx`: consumir eventos paginados unificados.
- Modificar `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.spec.tsx`, crear `expediente-catalog-cache.spec.ts` y ampliar las pruebas de `SeguimientoTab` y timeline.
- Modificar `e2e/tests/portal-crm-expedientes.spec.ts`: cubrir carga inicial y ausencia de solicitudes bloqueantes duplicadas.

### Documentacion y evidencia

- Crear `docs/informes/INFORME-MOD05-EXPEDIENTE-DETALLE-PERFORMANCE-v1.0.md`: informe de cierre de esta optimizacion.
- Registrar mediciones comparables antes y despues: requests, duracion, bytes, LCP y tiempo hasta `Vista general` util.

---

## Task 1: Fijar contrato y regresiones de linea base

**Files:**

- Modify: `apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts`
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.spec.tsx`
- Modify: `apps/portal/src/lib/api-client.spec.ts`
- Test: `e2e/tests/portal-crm-expedientes.spec.ts`

- [ ] **Step 1: Añadir el caso rojo del endpoint bootstrap en el controller spec**

Agregar al mock de `ExpedienteService` el metodo `getDetailBootstrap` y probar el metodo privado/publico del controller con la forma:

```typescript
expedienteServiceMock.getDetailBootstrap.mockResolvedValue({
  expediente: { id: 'exp-1' },
  completeness: {},
  pipelineRecommendation: null,
  operationalMetadata: {},
  currentAttribution: null,
  responsibility: null,
  subscriberSummary: null,
});

await expect(controller.getBootstrap('exp-1')).resolves.toEqual({
  data: expect.objectContaining({ expediente: expect.any(Object) }),
});
```

- [ ] **Step 2: Añadir el caso rojo del portal**

En `page.spec.tsx`, reemplazar temporalmente el mock de carga inicial por `getExpedienteBootstrap` y verificar que `Vista general` aparece sin esperar ninguna de estas funciones antiguas:

```typescript
expect(crmApiMock.getExpedienteBootstrap).toHaveBeenCalledWith('exp-1');
expect(crmApiMock.getExpedienteTimeline).not.toHaveBeenCalled();
expect(crmApiMock.getAttributionHistory).not.toHaveBeenCalled();
expect(crmApiMock.getResponsibilityHistory).not.toHaveBeenCalled();
```

- [ ] **Step 3: Ejecutar los casos para confirmar el rojo**

Ejecutar:

```text
pnpm.cmd --filter @iwana/api exec jest --runInBand src/modules/crm/expedientes/tests/expedientes.controller.spec.ts
pnpm.cmd --filter @iwana/portal exec jest --runInBand src/app/dashboard/crm/expedientes/[id]/page.spec.tsx
```

Resultado esperado: fallan por el metodo y contrato bootstrap inexistentes, sin modificar todavia el endpoint legado.

---

## Task 2: Implementar el bootstrap seguro y sin recalculo triple

**Files:**

- Create: `apps/api/src/modules/crm/expedientes/dto/expediente-detail-bootstrap.dto.ts`
- Create: `apps/api/src/modules/crm/expedientes/expediente-detail-bootstrap.service.ts`
- Modify: `apps/api/src/modules/crm/expedientes/expedientes.controller.ts`
- Modify: `apps/api/src/modules/crm/expedientes/expedientes.module.ts`
- Modify: `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- Modify: `apps/api/src/modules/crm/expedientes/completeness-calculator.service.ts`
- Modify: `apps/api/src/modules/crm/expedientes/pipeline-recommendation.service.ts`
- Test: `apps/api/src/modules/crm/expedientes/tests/expediente-detail-bootstrap.service.spec.ts`
- Test: `apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts`

- [ ] **Step 1: Definir el contrato tipado**

Crear interfaces de respuesta sin propiedades `*Encrypted`, relaciones completas ni campos internos:

```typescript
export interface ExpedienteDetailSummary {
  id: string;
  status: ExpedienteStatus;
  fullName: string;
  personType: string | null;
  address: string | null;
  municipality: string | null;
  department: string | null;
  postalCode: string | null;
  stratum: number | null;
  latitude: number | null;
  longitude: number | null;
  interestedPlanId: string | null;
  additionalProductIds: string[];
  additionalServiceIds: string[];
  acquisitionChannel: string;
  source: string;
  sourceDetail: string | null;
  statusChangedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpedienteDetailBootstrapResponse {
  expediente: ExpedienteDetailSummary;
  completeness: CompletenessResult;
  pipelineRecommendation: PipelineRecommendation | null;
  operationalMetadata: ExpedienteOperationalMetadata;
  currentAttribution: SalesAttributionRecord | null;
  responsibility: ResponsibilitySnapshot | null;
  subscriberSummary: ExpedienteSubscriberSummary | null;
}
```

- [ ] **Step 2: Escribir pruebas de una sola carga**

El test del servicio debe comprobar que una llamada a `getDetailBootstrap('exp-1')`:

```typescript
expect(completenessCalculator.calculateFromContext).toHaveBeenCalledTimes(1);
expect(pipelineRecommendationService.getRecommendationFromContext).toHaveBeenCalledTimes(1);
expect(result.expediente).not.toHaveProperty('contactAttempts');
expect(result.expediente).not.toHaveProperty('documentNumberEncrypted');
```

El test debe cubrir expediente inexistente y respuesta con `subscriberSummary` opcional.

- [ ] **Step 3: Añadir lectura base proyectada**

Implementar `ExpedienteService.findDetailBase(id)` con `select` explícito y sin `relations`. El método debe mantener `TenantContext.getOrThrow()` y `runInTenantSchema`; no debe llamar `findById()`.

- [ ] **Step 4: Añadir cálculo de completitud desde contexto precargado**

Implementar `CompletenessCalculator.calculateFromContext(context)` para recibir expediente, consentimientos, verificaciones y cotizaciones ya cargados. Mantener `calculate(id)` para consumidores existentes y hacerlo delegar al mismo núcleo sin duplicar reglas de negocio.

- [ ] **Step 5: Añadir recomendación desde contexto**

Implementar `PipelineRecommendationService.getRecommendationFromContext(expediente, completeness)` y hacer que `getRecommendation(id)` siga disponible para consumidores existentes.

- [ ] **Step 6: Orquestar las lecturas actuales independientes**

Crear `ExpedienteDetailBootstrapService.getDetailBootstrap(id)` para cargar la base y contexto de completitud una sola vez; resolver atribución actual, responsabilidad y resumen de suscriptor en paralelo cuando no compartan el mismo `QueryRunner`:

```typescript
const [currentAttribution, responsibility, subscriberSummary] = await Promise.all([
  this.attributionsService.getCurrentAttribution(id),
  this.responsibilitiesService.getResponsibility(id),
  this.subscribersService.findSummaryByExpedienteId(id),
]);
```

La metadata operativa debe provenir de una lectura acotada, no de `getTimelineSummary()`.

- [ ] **Step 7: Exponer el endpoint**

Agregar en el controller, antes de `@Get(':id')`, un handler con los mismos roles de lectura:

```typescript
@Get(':id/bootstrap')
@Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
@ApiOperation({ summary: 'Obtener bootstrap seguro del detalle del expediente' })
async getBootstrap(@Param('id', ParseUUIDPipe) id: string) {
  return { data: await this.expedienteDetailBootstrapService.getDetailBootstrap(id) };
}
```

- [ ] **Step 8: Ejecutar backend**

```text
pnpm.cmd --filter @iwana/api exec jest --runInBand src/modules/crm/expedientes/tests/expediente-detail-bootstrap.service.spec.ts src/modules/crm/expedientes/tests/expedientes.controller.spec.ts src/modules/crm/expedientes/tests/completeness-calculator.service.spec.ts
pnpm.cmd --filter @iwana/api typecheck
```

Resultado esperado: tests en verde y una sola invocacion de completitud en el bootstrap.

---

## Task 3: Corregir proyeccion sensible y compatibilidad del endpoint legado

**Files:**

- Modify: `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- Modify: `apps/api/src/modules/crm/expedientes/expedientes.controller.ts`
- Modify: `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`
- Modify: `apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts`
- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.spec.tsx`

- [ ] **Step 1: Añadir regresiones de seguridad**

Probar que el bootstrap no contiene `ipAddress`, `documentNumberEncrypted`, `phonePrimaryEncrypted`, `emailPrimaryEncrypted`, `contactAttempts`, `consents`, `coverageChecks` ni `statusChanges`. Probar además que el endpoint de consentimientos conserva la proyeccion de IP solo para roles administrativos.

- [ ] **Step 2: Separar tipos de lectura**

En `api-client.ts`, introducir `ExpedienteDetailSummary` como tipo distinto de `ExpedienteRecord`; no reutilizar `ExpedienteRecord` para prometer campos sensibles que el endpoint seguro no devuelve.

- [ ] **Step 3: Revisar consumidores del endpoint legado**

Verificar con Grep los consumidores actuales de `crmApi.getExpediente()`: scheduling, solicitudes pendientes y sincronizacion de agenda. Mantener el contrato legado durante esta fase o migrar cada consumidor a una proyeccion aprobada antes de retirar campos.

- [ ] **Step 4: Ejecutar seguridad y contratos**

```text
pnpm.cmd --filter @iwana/api exec jest --runInBand src/modules/crm/expedientes/tests/expediente.service.spec.ts src/modules/crm/expedientes/tests/expedientes.controller.spec.ts
pnpm.cmd --filter @iwana/portal exec jest --runInBand src/lib/api-client.spec.ts
```

Resultado esperado: no se filtran ciphertext ni IP por el bootstrap y no se rompe ningun consumidor legado.

---

## Task 4: Migrar el detalle al bootstrap y eliminar el critical path secundario

**Files:**

- Modify: `apps/portal/src/lib/api-client.ts`
- Create: `apps/portal/src/components/crm/expedientes/ExpedienteDetailSkeleton.tsx`
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/loading.tsx`
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- Modify: `apps/portal/src/components/crm/expedientes/useCrmInstallationFieldWork.ts`
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.spec.tsx`

- [ ] **Step 1: Añadir el cliente tipado**

Agregar al objeto `crmApi`:

```typescript
getExpedienteBootstrap: (id: string, tenantSlug?: string) =>
  request<{ data: ExpedienteDetailBootstrapResponse }>(
    `/crm/expedientes/${id}/bootstrap`,
    { returnFullResponse: true },
    tenantSlug,
  ),
```

- [ ] **Step 2: Consolidar skeletons**

Extraer las tres cajas de `page.tsx:615-621` a `ExpedienteDetailSkeleton`. `loading.tsx` debe renderizar el mismo componente y conservar `aria-busy="true"`.

- [ ] **Step 3: Cambiar la carga inicial**

Reemplazar la secuencia de `getExpediente`, `getExpedienteTimeline`, atribucion e historiales por una sola llamada a `getExpedienteBootstrap`. El estado inicial debe hidratar `expediente`, `completeness`, `pipelineRecommendation`, metadata, atribucion actual y responsabilidad desde `response.data`.

- [ ] **Step 4: Mantener recargas de escritura seguras**

Después de guardar o cambiar estado, recargar bootstrap. No volver a bloquear la pantalla con timeline, historiales o contactos; esas fuentes se invalidan solo si la pestaña activa lo necesita.

- [ ] **Step 5: Diferir WFM**

Cambiar `useCrmInstallationFieldWork` para aceptar `enabled: boolean`, iniciar solo cuando `enabled && expedienteId`, cancelar el efecto anterior y mantener `EMPTY_FIELD_WORK` mientras carga. La pagina pasara `enabled={!loading && expediente !== null}`.

- [ ] **Step 6: Verificar comportamiento del shell**

Añadir al spec:

```typescript
await waitFor(() => expect(screen.getByText('Acción recomendada ahora')).toBeInTheDocument());
expect(crmApiMock.getExpedienteBootstrap).toHaveBeenCalledTimes(1);
expect(crmApiMock.getExpedienteTimeline).not.toHaveBeenCalled();
expect(crmApiMock.getResponsibilityHistory).not.toHaveBeenCalled();
```

- [ ] **Step 7: Ejecutar portal**

```text
pnpm.cmd --filter @iwana/portal exec jest --runInBand src/app/dashboard/crm/expedientes/[id]/page.spec.tsx
pnpm.cmd --filter @iwana/portal typecheck
pnpm.cmd --filter @iwana/portal lint
```

Resultado esperado: `Vista general` se muestra con una solicitud CRM bloqueante y los warnings existentes no aumentan.

---

## Task 5: Cargar tabs bajo demanda y compartir catalogo

**Files:**

- Create: `apps/portal/src/lib/expediente-catalog-cache.ts`
- Create: `apps/portal/src/lib/expediente-catalog-cache.spec.ts`
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- Modify: `apps/portal/src/components/crm/expedientes/SeguimientoTab.tsx`
- Modify: `apps/portal/src/components/crm/expedientes/sections/CommercialInterestSection.tsx`
- Modify: `apps/portal/src/components/crm/expedientes/ExpedienteTabsContainer.tsx`
- Test: `apps/portal/src/components/crm/expedientes/SeguimientoTab.spec.tsx`

- [ ] **Step 1: Escribir cache deduplicada**

El cache debe usar una clave tenant-safe y deduplicar promesas activas:

```typescript
export interface ExpedienteCatalogLabel {
  name: string;
  description?: string | null;
}

export function getExpedienteCatalogItem(
  tenantSlug: string,
  id: string,
  load: () => Promise<ExpedienteCatalogLabel>,
): Promise<ExpedienteCatalogLabel>;

export function clearExpedienteCatalogCache(tenantSlug: string, ids?: string[]): void;
```

El test debe llamar dos veces con el mismo tenant e ID y verificar que `load` se ejecuta una sola vez; tenants distintos deben conservar entradas separadas.

- [ ] **Step 2: Sustituir resoluciones repetidas**

Cambiar ambos componentes para usar el cache; conservar fallback de nombre no disponible y cancelar la actualización de estado cuando el componente se desmonte.

- [ ] **Step 3: Cargar componentes pesados bajo demanda**

Reemplazar imports estaticos de `ExpedienteSections` y `SeguimientoTab` por imports dinamicos compatibles con Client Components y `Suspense`. El tab activo debe mostrar un fallback accesible mientras descarga su codigo.

- [ ] **Step 4: Asegurar que tabs no monten contenido inactivo**

Mantener `ExpedienteTabsContainer` renderizando solo el contenido de `resolvedActiveTab`; los tabs deben conservar estado de seleccion y no disparar efectos al construir nodos inactivos.

- [ ] **Step 5: Probar navegacion de tabs**

Verificar que:

```typescript
fireEvent.click(screen.getByRole('tab', { name: 'Gestion' }));
fireEvent.click(screen.getByRole('tab', { name: 'Seguimiento' }));
expect(crmApiMock.getPlanById).toHaveBeenCalledTimes(1);
```

- [ ] **Step 6: Ejecutar pruebas**

```text
pnpm.cmd --filter @iwana/portal exec jest --runInBand src/lib/expediente-catalog-cache.spec.ts src/components/crm/expedientes/SeguimientoTab.spec.tsx src/app/dashboard/crm/expedientes/[id]/page.spec.tsx
```

Resultado esperado: no se repite la resolucion del mismo catalogo al cambiar de pestaña.

---

## Task 6: Consolidar timeline, contactos e historiales

**Files:**

- Create: `apps/api/src/modules/crm/expedientes/dto/expediente-timeline.dto.ts`
- Modify: `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- Modify: `apps/api/src/modules/crm/expedientes/expedientes.controller.ts`
- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/components/crm/expedientes/SeguimientoTab.tsx`
- Modify: `apps/portal/src/components/crm/expedientes/ExpedienteTimelinePanel.tsx`
- Test: `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`
- Test: `apps/portal/src/components/crm/expedientes/SeguimientoTab.spec.tsx`

- [ ] **Step 1: Fijar DTO paginado**

Definir `GET /crm/expedientes/:id/timeline?page=1&limit=5&filter=all` con eventos tipados y metadata de pagina. Cada evento de contacto debe contener los campos que `ContactEntry` necesita: canal, resultado, duracion, notas y actor.

- [ ] **Step 2: Eliminar `findById()` del timeline**

Consultar directamente cambios de estado, intentos de contacto, responsabilidades, atribuciones y auditoria con filtros por expediente y orden estable `fecha DESC, id DESC`. No cargar consentimientos, cobertura ni el resto del grafo.

- [ ] **Step 3: Evitar duplicidad de contactos**

Eliminar de `SeguimientoTab` el `loadAttempts()` inicial para el timeline. La respuesta unificada sera la fuente de visualizacion; los endpoints de escritura se conservan y, tras crear contacto, se recarga la pagina actual del timeline.

- [ ] **Step 4: Mantener filtros y paginacion**

Trasladar filtros `all`, `contact`, `asignaciones`, `pipeline` y `system` al servidor. El componente no debe descargar todo para aplicar `slice()` local salvo que el servidor indique una pagina completa pequeña.

- [ ] **Step 5: Probar unicidad**

Crear una fixture con un cambio de estado y un contacto; verificar que cada evento aparece una vez y que el endpoint no invoca `findById()` ni carga relaciones no solicitadas.

- [ ] **Step 6: Ejecutar API y portal**

```text
pnpm.cmd --filter @iwana/api exec jest --runInBand src/modules/crm/expedientes/tests/expediente.service.spec.ts src/modules/crm/expedientes/tests/expedientes.controller.spec.ts
pnpm.cmd --filter @iwana/portal exec jest --runInBand src/components/crm/expedientes/SeguimientoTab.spec.tsx
```

---

## Task 7: Corregir lectura WFM y boundaries involucrados

**Files:**

- Modify: `apps/portal/src/components/crm/expedientes/useCrmInstallationFieldWork.ts`
- Modify: `apps/api/src/modules/wfm/services/visit-requests.service.ts`
- Modify: `apps/api/src/modules/wfm/wfm.controller.ts` solo si la matriz de roles aprobada confirma que el CTA requiere el permiso
- Modify: `apps/api/src/modules/wfm/tests/visit-requests.controller.http.spec.ts`
- Modify: `apps/api/src/modules/wfm/services/visit-requests.service.spec.ts`
- Review: `apps/api/src/modules/wfm/wfm.module.ts`
- Review: `apps/api/src/modules/wfm/services/visit-requests.service.ts`

- [ ] **Step 1: Añadir regresion de lectura sin escritura global**

El test debe espiar el metodo de reconciliacion usado por `list` y verificar que una lectura filtrada por `originRef` no ejecuta un `UPDATE` global de solicitudes abiertas.

- [ ] **Step 2: Mover reconciliacion fuera del GET**

Mantener la reconciliacion en el flujo de escritura/job existente o crear una operacion explicita de mantenimiento; `GET /wfm/visit-requests` debe limitarse a leer el origen solicitado.

- [ ] **Step 3: Validar rol SALES**

Ejecutar el endpoint con los roles ADMIN y SALES en tests HTTP. Si `wfm/events` no esta autorizado para SALES, el hook debe usar una proyeccion WFM aprobada para CRM o el cambio de permisos debe documentarse antes de modificar `wfm.controller.ts`.

- [ ] **Step 4: Verificar boundary**

No importar `ExpedientesModule` directamente desde WFM. Si la lectura actual requiere datos CRM, usar un puerto/read model tipado; registrar cualquier cambio de boundary en el informe de cierre.

---

## Task 8: Medir consultas e indices con evidencia

**Files:**

- Review: `packages/database/src/migrations/tenant/001_create_expediente_records.ts`
- Review: `packages/database/src/migrations/tenant/089_pagination_ordering_indexes.ts`
- Review: `apps/api/src/modules/crm/expedientes/entities/*.entity.ts`
- Create: `docs/informes/INFORME-MOD05-EXPEDIENTE-DETALLE-PERFORMANCE-v1.0.md`

- [ ] **Step 1: Capturar consultas del bootstrap**

Usar el harness de integracion del repositorio para registrar conteos de `SELECT`, `INSERT`, `UPDATE`, transacciones tenant y tablas consultadas para `GET /crm/expedientes/:id/bootstrap`.

- [ ] **Step 2: Ejecutar planes de consulta**

Aplicar `EXPLAIN (ANALYZE, BUFFERS)` a las consultas de expediente, hijos, atribucion, responsabilidad y auditoria con una fixture de alta cardinalidad. Guardar tiempos, rows removed, scans, sorts y buffers en el informe.

- [ ] **Step 3: Crear migracion solo si el plan lo justifica**

Si los planes muestran scans o sorts evitables, crear la siguiente migracion tenant numerada disponible con indices compuestos para el predicado y orden reales. La migracion debe incluir `up`, `down`, nombre estable, prueba de paridad y no asumir un schema tenant hardcodeado.

- [ ] **Step 4: Verificar regresion de migraciones**

```text
pnpm.cmd --filter @iwana/db build
pnpm.cmd --filter @iwana/db migration:tenant:run
pnpm.cmd --filter @iwana/db exec jest --runInBand src/migrations/tenant/migration-order.spec.ts src/migrations/tenant/migration-parity.util.spec.ts
```

No agregar indices por intuicion si `EXPLAIN` no demuestra beneficio.

---

## Task 9: Validacion E2E, rendimiento y cierre documental

**Files:**

- Modify: `e2e/tests/portal-crm-expedientes.spec.ts`
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.spec.tsx`
- Create: `docs/informes/INFORME-MOD05-EXPEDIENTE-DETALLE-PERFORMANCE-v1.0.md`
- Review: `docs/specs/2026-08-23-crm-expediente-detail-performance-design.md`

- [ ] **Step 1: Medir request graph en Playwright**

Registrar requests desde el click en `Abrir` hasta que aparezca `Acción recomendada ahora`:

```typescript
const requests: string[] = [];
page.on('request', (request) => {
  if (request.url().includes('/api/v1/')) requests.push(request.url());
});
const start = Date.now();
await page.getByRole('link', { name: 'Abrir' }).first().click();
await expect(page.getByText('Acción recomendada ahora')).toBeVisible();
const shellMs = Date.now() - start;
```

Verificar que el critical path contiene un solo bootstrap y no contiene WFM, timeline ni historiales.

- [ ] **Step 2: Medir frio y caliente**

Ejecutar el flujo con cache fria y caliente, sin guardar tokens ni PII en artefactos. Comparar `click -> shell visible`, `shell -> Vista general util`, `tab -> contenido listo`, requests y bytes contra la linea base de `2165 ms`.

- [ ] **Step 3: Ejecutar matrices de rol**

Repetir con ADMIN, SALES y SUPPORT. Confirmar proyeccion sensible, estado del CTA WFM, carga de Gestion y Seguimiento, y ausencia de errores silenciosos que oculten datos necesarios.

- [ ] **Step 4: Ejecutar validacion del monorepo**

```text
pnpm.cmd --filter @iwana/api test
pnpm.cmd --filter @iwana/portal test
pnpm.cmd --filter @iwana/portal typecheck
pnpm.cmd --filter @iwana/portal lint
pnpm.cmd exec playwright test e2e/tests/portal-crm-expedientes.spec.ts
```

Resultado esperado: cobertura funcional conservada, sin aumento de warnings relevantes, y al menos `40%` de mejora en tiempo hasta contenido util o solicitudes bloqueantes frente a la linea base comparable.

- [ ] **Step 5: Actualizar informe de cierre**

Documentar archivos modificados, contratos, consultas antes/despues, mediciones, controles de seguridad, boundaries revisados, pruebas ejecutadas y riesgos residuales. No incluir tokens, connection strings, PII ni payloads sensibles.

---

## Orden de ejecucion y checkpoints

1. Task 1 fija regresiones y contrato.
2. Task 2 implementa el bootstrap backend y pasa los tests de servicio/controller.
3. Task 3 cierra proyeccion sensible y compatibilidad.
4. Task 4 migra el shell frontend y elimina el critical path actual.
5. Task 5 hace lazy loading y cache compartido.
6. Task 6 consolida timeline y contactos.
7. Task 7 corrige WFM y boundaries.
8. Task 8 mide DB y solo agrega indices demostrados.
9. Task 9 valida E2E, rendimiento y documentacion.

Cada checkpoint debe dejar pruebas de la tarea en verde antes de continuar. No realizar un refactor masivo de frontend y backend en una sola edicion; mantener los contratos aditivos hasta completar la migracion de consumidores.

## Auto-revision del plan

- La especificacion queda cubierta por tareas de bootstrap, shell progresivo, tabs, timeline, catalogo, WFM, seguridad, boundaries, medicion SQL, E2E y cierre documental.
- No quedan marcadores `TBD`, `TODO` ni instrucciones genericas sin archivo, prueba o comando asociado.
- Los nombres usados son consistentes: `getDetailBootstrap`, `getExpedienteBootstrap`, `calculateFromContext` y `getRecommendationFromContext` representan el mismo flujo entre capas.
- El endpoint legado se conserva durante la migracion y el bootstrap es aditivo.
- Los indices se condicionan a evidencia de `EXPLAIN`; no se prescribe una migracion especulativa.
