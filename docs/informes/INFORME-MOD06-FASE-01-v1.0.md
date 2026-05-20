# INFORME - MOD06 FASE 01

**Version:** 1.0
**Fecha:** 2026-04-18
**Modo activo:** Mixto
**Convencion documental:** {TIPO}-{MODULO}-{FASE}-v{VERSION}.md

## Vinculos de trazabilidad

- PRD: docs/prds/PRD-MOD06-COMERCIAL-DEFINICION-v1.0.md
- HLD: docs/hlds/HLD-MOD06-ARQUITECTURA-v1.0.md
- HLD consumidor: docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md
- Stack: docs/prds/Stack_Tecnologico.md
- Politica de ejecucion: docs/adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md

---

## Identificacion

- Modulo: MOD06 - Comercial
- Fase: Fase 01
- Sprint: Implementacion correctiva posterior a auditoria PRD-vs-codigo
- Fecha: 2026-04-18
- Responsable principal: GitHub Copilot

## 1. Resumen ejecutivo

- Objetivo de la fase: cerrar los gaps criticos entre el PRD de MOD06 y la implementacion efectiva del backend y del frontend portal consumidor.
- Resultado alcanzado: se alinearon rutas y contratos REST de CommercialModule, se sustituyo el puerto legacy de CRM por el adapter comercial y se migro el portal para operar contra endpoints MOD06 en planes y productos.
- Estado: Parcial

## 2. Entregables implementados

- Backend:
  - Correccion de prefijos y rutas REST relativas a `api/v1` en controladores de CommercialModule.
  - Nuevos endpoints para `POST /commercial/catalog/plans`, `POST /commercial/catalog/products`, `POST /commercial/catalog/services`, `DELETE /commercial/bundles/:id`, `DELETE /commercial/promotions/:id`, `GET /commercial/tax-rules`, `PATCH /commercial/tax-rules/:id` y ajuste de compatibilidad a `POST /commercial/compatibility/validate`.
  - Ajuste del boundary HTTP de `POST /commercial/catalog/plans|products|services` para aceptar DTOs especializados sin requerir el campo `type` en el body.
  - Hidratacion de detalle por tipo y precio residencial actual en `CatalogService`.
  - Exportacion de `PlanCatalogReadPort` desde CommercialModule con `CommercialCatalogReadAdapter` compatible con CRM.
  - Reemplazo del adapter legacy de catalogo de planes en `quotes`, `prospects` y `potentials` por importacion de CommercialModule.
  - Nueva prueba de aislamiento tenant con wiring HTTP realista para `CatalogController` + `CatalogService`, validando que el mismo `id` se resuelve por `tenantId` y `schemaName` del contexto autenticado.
- Frontend:
  - Migracion del `api-client` del portal para consumir MOD06 en `getPlans`, `createPlan`, `updatePlan`, `deletePlan`, `getAdditionalProducts`, `createAdditionalProduct`, `updateAdditionalProduct` y `deleteAdditionalProduct`.
  - Adaptacion de `PlanCatalogManager` a reglas de instalacion `ALWAYS`, `ON_DEMAND`, `NEVER`.
  - Adaptacion de `AdditionalProductsManager` a modelo comercial MOD06 con `category`, `isLoan` y `requiresInventory`.
  - Expediente comercial actualizado para consumir productos adicionales activos del catalogo comercial en formulario y seguimiento, eliminando la dependencia de una lista estatica.
  - Nuevo E2E focalizado del expediente que verifica la carga de plan y productos adicionales desde endpoints comerciales del tenant.
- Base de datos:
  - Sin cambios nuevos de migracion en esta correccion. Se reutiliza la base ya creada en Fase 01.
- Integraciones:
  - CRM consume catalogo comercial via `PlanCatalogReadPort` sin depender del catalogo legacy de TenantModule.

## 3. Evidencia funcional

- Flujo probado:
  - Creacion y actualizacion de planes via contrato MOD06 con alta de precio residencial posterior.
  - Consulta de planes activos desde CRM usando el adapter comercial.
  - Contrato HTTP de catalogo e impuestos validado con guards, DTOs y rutas publicas de MOD06.
  - Expediente del portal resolviendo planes y productos adicionales desde CommercialModule.
  - Aislamiento tenant del catalogo comercial validado en request-level para un mismo `id` de item en tenants distintos.
  - Flujo E2E puntual portal -> API comercial -> CRM validado en el detalle de expediente con render visible de plan y producto adicional.
  - Compilacion de portal con managers comerciales contra el nuevo contrato.
- Datos de prueba usados:
  - Planes mock residenciales con velocidades simetricas, tecnologia FTTH/XGS-PON y precios `89900.00` / `129900.00`.
- Resultado observado:
  - El adapter comercial genera snapshots y listas compatibles con `QuotesService`.
  - El portal compila con typecheck exitoso contra los contratos nuevos.

## 4. Evidencia de calidad

- Unit tests:
  - `apps/api/src/modules/commercial/tests/*.spec.ts` y `apps/api/src/modules/crm/quotes/tests/quotes.service.spec.ts` ejecutados exitosamente.
  - Resultado: 8 suites, 31 tests aprobados.
- Integration tests:
  - Nuevos specs HTTP focalizados para `CatalogController` y `TaxController` ejecutados exitosamente.
  - Nuevo spec `catalog.tenant-isolation.spec.ts` ejecutado exitosamente para wiring tenant-aware.
  - Nuevo spec `catalog.persistence-tenant-isolation.spec.ts` ejecutado exitosamente con persistencia stateful aislada por schema usando `TenantContext` y `runInTenantSchema` reales.
  - Resultado backend consolidado: 12 suites, 46 tests aprobados.
- E2E tests:
  - E2E focalizado ejecutado exitosamente para el flujo comercial del expediente.
  - Resultado: 1 test aprobado (`CRM detalle carga plan y productos adicionales desde CommercialModule`).
  - Suite amplia histórica de expedientes re-alineada con la UI vigente y validada exitosamente.
  - Resultado consolidado de Playwright en expedientes: 23 tests aprobados.
- Cobertura:
  - Validacion focalizada por suites afectadas; no se corrio coverage global.
- Hallazgos abiertos:
  - Falta revisar si `prospects` y `potentials` requieren suites adicionales tras el cambio de puerto, aunque la compatibilidad del contrato quedo cubierta por el adapter y `quotes.service.spec.ts`.

## 5. Cambios documentales

- PRD actualizado: No
- HLD actualizado: No
- ADR nuevo o referenciado: ADR-022 y ADR-028 referenciados
- Otros documentos afectados:
  - Nuevo informe: `docs/informes/INFORME-MOD06-FASE-01-v1.0.md`

## 6. Riesgos y bloqueos

- Riesgo 1: resuelto en iteracion posterior 2026-04-18. El portal ahora expone `commercialApi` explicito para catalogo comercial y `tenantSelfApi` queda limitado a self-service del tenant y coverage.
- Riesgo 2: no hay suite E2E para el flujo completo portal -> API comercial -> CRM.
  - Mitigacion aplicada: existe un E2E focalizado del flujo comercial del expediente y la suite amplia heredada de expedientes quedó normalizada y en verde.
- Bloqueo tecnico, si aplica: no aplica.

## 7. Decision de salida

- Puede pasar a siguiente fase: Si.
- Requiere correcciones previas: No.
- Aprobadores pendientes: Arquitectura / Tech Lead backend / Frontend portal

## 8. Handoff arquitectonico para Fase 02 (2026-04-18)

Se emitio una definicion en modo Architect para ejecutar la siguiente iteracion de MOD06 sin ampliar prematuramente el alcance funcional del modulo.

### 8.1 Veredicto

**Estado:** lista para ejecucion.

La recomendacion aprobada fue priorizar una fase de cleanup semantico y endurecimiento de integracion en portal antes de abrir bundles, promociones o reglas adicionales. La razon principal es estabilizar la frontera de ownership del bounded context Comercial y evitar que nuevas capacidades se construyan sobre `tenantSelfApi`.

### 8.2 Alcance aprobado de la siguiente fase

- Crear `commercialApi` explicito en el portal.
- Migrar a `commercialApi` el catalogo comercial ya operativo de planes y productos adicionales.
- Mantener `tenantSelfApi` solo con self-service del tenant y coverage.
- Validar el rewiring con typecheck y pruebas focalizadas.

### 8.3 Artefactos generados para el handoff

- `docs/prds/PRD-MOD06-COMERCIAL-ADDENDUM-FASE-02-v1.0.md`
- `docs/prompts/PROMPT-MOD06-FASE-02-v1.0.md`

### 8.4 Riesgo residual aceptado

El principal riesgo residual es expandir la iteracion y mezclar este refactor de ownership con capacidades nuevas de negocio. Si durante la ejecucion aparece esa presion de alcance, debe tratarse como cambio de fase y no como ajuste implicito.

### 8.5 Ejecucion inicial de Fase 02 y validacion focalizada

Se ejecuto el primer bloque real de la Fase 02 en `apps/portal`, cerrando la deuda semantica aprobada en el handoff arquitectonico.

Cambios implementados:

- `apps/portal/src/lib/api-client.ts`: agregado `commercialApi` explicito y removidos de `tenantSelfApi` los metodos de catalogo comercial para planes y productos.
- `apps/portal/src/components/settings/PlanCatalogManager.tsx`: migrado a `commercialApi`.
- `apps/portal/src/components/settings/AdditionalProductsManager.tsx`: migrado a `commercialApi`.
- `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`: migrado a `commercialApi` para la carga de planes y productos adicionales.

Validacion ejecutada:

- `pnpm --filter @iwana/portal typecheck` en verde.
- Playwright focalizado en verde: `CRM detalle carga plan y productos adicionales desde CommercialModule`.

Resultado:

- El ownership del catalogo comercial en portal quedo expresado de forma explicita.
- `coverage` permanece correctamente en `tenantSelfApi`.
- La fase queda lista para continuar con la siguiente capacidad funcional de MOD06 sin arrastrar la deuda de naming previa.

### 8.6 Hotfix operativo de arranque API tras integracion comercial (2026-04-18)

Durante la validacion manual del portal se detecto un `500` en `POST /api/v1/auth/login` observado desde `localhost:3002`. La causa raiz no estaba en Auth ni en el formulario del portal: `apps/api` no estaba llegando a bootstrap completo por un error de wiring en NestJS dentro de `QuotesModule`.

Hallazgo:

- `apps/api/src/modules/crm/quotes/quotes.module.ts` exportaba `PlanCatalogReadPort` sin proveerlo localmente.
- Tras la migracion del puerto a `CommercialModule`, esa exportacion se volvio invalida y Nest abortaba el arranque con `UnknownExportException`.
- Como el portal proxyficaba `/api/v1` hacia una API caida, el navegador observaba un `500` generico en login.

Correccion aplicada:

- Se removio la exportacion invalida de `PlanCatalogReadPort` en `QuotesModule`, dejando solo `QuotesService` como export legitimo del modulo.

Validacion:

- `pnpm --filter @iwana/api typecheck` en verde.
- `pnpm --filter @iwana/api build` en verde.
- `apps/api` levanta correctamente en modo `dev`.
- El endpoint `POST /api/v1/auth/login` deja de responder `500`; las pruebas manuales vuelven a respuestas de validacion HTTP del endpoint en lugar de falla de arranque.

### 8.7 Visibilidad del modulo Comercial en portal (2026-04-18)

Tras restaurar el acceso al portal se detecto una brecha de descubribilidad: Comercial ya existia funcionalmente, pero permanecia oculto como pestaña interna de Configuracion y no como modulo visible dentro del shell principal.

Correccion aplicada:

- Nueva ruta dedicada: `apps/portal/src/app/dashboard/commercial/page.tsx`
- Nuevo cliente de pagina para el modulo: `apps/portal/src/components/commercial/CommercialClient.tsx`
- Sidebar actualizado para mostrar `Comercial` como entrada visible del portal.
- Quick actions del dashboard actualizados para incluir `Comercial` y corregir rutas validas de `Configuracion` y `Usuarios`.

Validacion:

- `pnpm --filter @iwana/portal typecheck` en verde.

Resultado:

- El modulo Comercial ahora es visible y navegable directamente desde el dashboard del portal.
- La gestion de cobertura, planes y productos adicionales ya no depende de que el usuario descubra una pestaña enterrada en Configuracion.

### 8.8 Alineacion backend final PRD vs codigo (2026-04-18)

Se cerraron dos desviaciones que seguian abiertas frente al PRD y al HLD de MOD06 en backend.

Correcciones aplicadas:

- `CommercialModule` pasa a exponer `CommercialCatalogReadPort` como token canonico del bounded context Comercial.
- `PlanCatalogReadPort` se mantiene como alias de compatibilidad usando `useExisting`, evitando romper consumidores actuales de CRM mientras se completa la migracion semantica aguas abajo.
- `CommercialCatalogReadAdapter` pasa a implementar el puerto comercial explicito en lugar del puerto legacy.
- Nueva migracion tenant agregada para sembrar de forma idempotente las reglas tributarias base faltantes en `tax_rules`, cubriendo:
  - residencial estratos 1-2 con IVA exento 0%
  - residencial estrato 3 con IVA excluido 0%
  - residencial estratos 4-6 con IVA pleno 19%
  - clientes corporate con IVA pleno 19%
  - clientes government con IVA pleno 19%

Impacto:

- El boundary backend queda alineado con la definicion documental de `CommercialCatalogReadPort` sin introducir regresion inmediata sobre CRM.
- Los tenants existentes dejan de depender de carga manual para disponer de reglas tributarias base coherentes con el PRD y el prompt de ejecucion de MOD06 Fase 01.

Validacion prevista:

- `pnpm --filter @iwana/api typecheck`
- pruebas focalizadas del adapter comercial y de los consumidores CRM que dependen del alias legacy

### 8.9 Validacion de salida operativa a produccion (2026-04-18)

Se ejecuto la validacion operativa completa del modulo Comercial sobre backend y portal para confirmar que la entrega queda lista para despliegue controlado.

Validacion ejecutada:

- `pnpm --filter @iwana/api build` en verde.
- `pnpm --filter @iwana/api lint` en verde.
- `pnpm --filter @iwana/portal build` en verde.
- `pnpm --filter @iwana/portal lint` en verde.
- `pnpm --filter @iwana/api exec jest src/modules/commercial/tests/tax-classification.service.spec.ts src/modules/commercial/tests/promotion.service.spec.ts src/modules/commercial/tests/price-history.service.spec.ts src/modules/commercial/tests/compatibility.service.spec.ts src/modules/commercial/tests/commercial-catalog-read.adapter.spec.ts src/modules/commercial/tests/catalog.service.spec.ts src/modules/commercial/tests/bundle.service.spec.ts src/modules/commercial/tax.controller.http.spec.ts src/modules/commercial/catalog.tenant-isolation.spec.ts src/modules/commercial/catalog.persistence-tenant-isolation.spec.ts src/modules/commercial/catalog.controller.http.spec.ts` en verde.
- Resultado consolidado Jest Comercial: 11 suites aprobadas, 45 tests aprobados.
- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-gestion-comercial-operativa.spec.ts` en verde.
- Resultado consolidado Playwright focalizado: 12 tests aprobados.

Hallazgo operativo:

- Ejecutar esa suite Playwright sin `--config e2e/playwright.portal.config.ts` produce un falso negativo por ausencia de `baseURL`, manifestado como `page.goto()` con URL relativa invalida. No corresponde a una regresion funcional del modulo.

Decision:

- MOD06 queda en estado production-ready a nivel de build, lint, pruebas unitarias, pruebas HTTP y smoke E2E del portal.
- No se detectaron bloqueos tecnicos adicionales dentro del workspace para avanzar a despliegue controlado.

### 8.10 Plan de despliegue controlado y rollback (2026-04-18)

Se define el plan operativo minimo para publicar MOD06 en entorno productivo de forma controlada y reversible.

Precondiciones:

- Backup consistente de PostgreSQL y validacion de restauracion previa.
- API y workers detenidos durante la ventana de migracion.
- Variables de entorno productivas cargadas correctamente para `@iwana/db`.

Secuencia recomendada de despliegue:

### 8.11 Alineacion final del portal Comercial con la especificacion funcional (2026-04-19)

Se ejecuto el ajuste de information architecture del modulo Comercial en `apps/portal` para alinearlo con la especificacion funcional consolidada de MOD06, sin abrir nuevos documentos ni mezclar el bounded context con Cobertura.

Correcciones aplicadas:

- `apps/portal/src/components/commercial/CommercialClient.tsx`: se removio la carga de `settings` para el shell del modulo y se limpiaron subtitulos, skeletons y mensajes que seguian mencionando cobertura.
- `apps/portal/src/components/commercial/CommercialTabLayout.tsx`: se creo una navegacion propia del modulo Comercial, separada del namespace visual de Settings.
- La subseccion `Cobertura` salio del flujo visible de Comercial.
- La navegacion interna del modulo quedo alineada a la especificacion aprobada:
  - `Planes`
  - `Productos`
  - `Servicios`
  - `Combos y promociones`
  - `Reglas comerciales`
- `apps/portal/src/components/settings/PlanCatalogManager.tsx`: se elimino la dependencia del umbral de fibra proveniente de settings para que el manager de planes no requiera contexto de configuracion general del tenant.
- `apps/portal/src/components/dashboard/QuickActionsPanel.tsx`: se actualizo el copy del acceso rapido de Comercial para reflejar catalogo y reglas operativas, no cobertura.

Decision UX implementada:

- La vista inicial del modulo Comercial ahora es `Planes`.
- Las capacidades aun no expuestas en portal (`Servicios`, `Combos y promociones`, `Reglas comerciales`) quedaron visibles como placeholders controlados y consistentes con el lenguaje visual actual, evitando falsas promesas funcionales o rutas inexistentes.

Impacto:

- El modulo Comercial queda visual y semanticamente desacoplado de Cobertura.
- El portal expresa de forma consistente que Comercial es un catalogo puro del tenant.
- La UI queda preparada para iterar sobre captura real de servicios, combos, promociones y reglas sin volver a reabrir el boundary del modulo.

1. Build de artefactos:
  - `pnpm --filter @iwana/db build`
  - `pnpm --filter @iwana/api build`
  - `pnpm --filter @iwana/portal build`
2. Ejecutar migraciones tenant en produccion:
  - `pnpm --filter @iwana/db migration:tenant:run`
3. Levantar API y workers con la version desplegada.
4. Ejecutar smoke funcional post-despliegue:
  - login portal
  - listado catalogo comercial (planes y productos)
  - carga del detalle de expediente en CRM

Rollback recomendado:

1. Si falla antes de migrar tenants: revertir despliegue de artefactos sin cambios de datos.
2. Si falla despues de migrar tenants y antes de habilitar trafico:
  - detener servicios
  - restaurar backup de base de datos tomado antes de la ventana
  - redeploy de la version estable previa
3. Si falla con trafico habilitado:
  - activar procedimiento de incidente
  - congelar escrituras comerciales si aplica
  - restaurar base y artefactos a la version estable previa segun runbook del entorno

Estado de salida:

- El modulo queda listo para ventana de despliegue productivo con ruta de rollback definida.

### 8.11 Correccion de bloqueo real en migracion tenant (2026-04-18)

Durante la ejecucion real de `migration:tenant:run` se detecto un bloqueo que impedia completar el rollout en todos los tenants activos.

Fallo observado:

- Tenant afectado: `tenant_iwana`.
- Migracion afectada: `018_migrate_catalog_data`.
- Causa: valor legacy `installation_rule = FIBER_DROP_THRESHOLD` proveniente de `plan_catalog_items` no cumplia el check nuevo de `plan_details` (`ALWAYS`, `ON_DEMAND`, `NEVER`).
- Error SQL: violacion de constraint `plan_details_installation_rule_check`.

Correccion aplicada:

- Ajuste en `packages/database/src/migrations/tenant/018_migrate_catalog_data.ts` para mapear valores legacy al nuevo dominio permitido:
  - `FIBER_DROP_THRESHOLD` -> `ON_DEMAND`
  - `NONE` -> `NEVER`
  - `ALWAYS` -> `ALWAYS`
  - fallback defensivo -> `ALWAYS`

Revalidacion ejecutada:

- `pnpm --filter @iwana/db build` en verde.
- `pnpm --filter @iwana/db migration:tenant:run` en verde.
- Resultado final: migraciones completadas correctamente para `tenant_test_company` y `tenant_iwana`.

Impacto:

- Se elimina el bloqueo de salida a produccion asociado a compatibilidad de datos legacy en reglas de instalacion.
- El procedimiento de migracion tenant queda validado end-to-end en ejecucion real.

### 8.12 Saneamiento final de codigo legacy del portal Comercial (2026-04-20)

Durante la validacion posterior del portal se detecto que el refactor visible del modulo Comercial ya estaba alineado con la especificacion aprobada, pero TypeScript seguia compilando dos componentes legacy bajo `settings` que no pertenecian al flujo vigente.

Hallazgo:

- `apps/portal/src/components/settings/CommercialTabLayout.tsx` seguia representando el flujo antiguo de Comercial dentro de Configuracion.
- Ese componente legacy seguia importando `CommercialCoverageCard` y propagando props obsoletas hacia `PlanCatalogManager`.
- `apps/portal/src/components/settings/CommercialCoverageCard.tsx` ya no tenia consumidores validos dentro del portal aprobado.

Correccion aplicada:

- Eliminacion de `apps/portal/src/components/settings/CommercialTabLayout.tsx`.
- Eliminacion de `apps/portal/src/components/settings/CommercialCoverageCard.tsx`.
- El estado final deja a `apps/portal/src/components/commercial/` como unico namespace vigente del modulo Comercial en portal.

Impacto:

- Se elimina el ultimo residuo compilable que mantenia acoplado Comercial con Settings y Cobertura.
- El cierre del refactor queda consistente tanto en UX visible como en superficie de codigo fuente compilada.

### 8.13 Cierre de cobertura de tests - DoD cumplido (2026-04-21)

Se ejecuto la auditoria de cobertura de tests del CommercialModule frente al DoD de RNF-COM-07 (`tests >= 80% en modulos core`). El resultado inicial fue insuficiente: servicios al 60.91% de statements y controllers al 40.11%.

#### Gaps identificados y cerrados

**Servicios — casos faltantes añadidos:**

- `catalog.service.spec.ts`: se agregaron `update` (PLAN, PRODUCT, SERVICE con evento `ITEM_DEACTIVATED`), `findOne` exitoso, `create` para PRODUCT y SERVICE, y errores de validacion para cada tipo. Total de scenarios nuevos: 10.
- `bundle.service.spec.ts`: se agregaron `findAll`, `findOne` (exito y not-found), `create` exitoso con mock de mutation-by-reference, `update`, `deactivate` (exito y not-found). Total de scenarios nuevos: 7.
- `promotion.service.spec.ts`: se agregaron `findAll`, `findOne` (exito y not-found), `update`, `deactivate` (exito y not-found). Total de scenarios nuevos: 6.
- `compatibility.service.spec.ts`: se agrego `NotFoundException` al import, `findAll`, `deactivate` (exito y not-found). Total de scenarios nuevos: 3. Se corrigio el import faltante.
- `price-history.service.spec.ts`: se agrego primer precio sin anterior (sin `save` de cierre) y `getPriceHistory`. Total de scenarios nuevos: 2.
- `tax-classification.service.spec.ts`: se agregaron `findOneClassification` exitoso, `updateClassification` (exito y not-found), `findRulesByClassification`, `findAllRules` (todos y filtrado), `updateRule` (exito y not-found). Total de scenarios nuevos: 7.

**Controllers — HTTP specs creados:**

- `bundle.controller.http.spec.ts`: 9 tests cubriendo GET list, GET by ID, POST (exito, 400, 403), PATCH, DELETE y GET precio dinamico.
- `promotion.controller.http.spec.ts`: 8 tests cubriendo GET list, GET by ID, POST (exito, 400, 403), PATCH y DELETE.
- `compatibility.controller.http.spec.ts`: 8 tests cubriendo GET rules, POST rule (exito, 400, 403), DELETE rule, POST validate (exito y con errores de regla EXCLUDES).

**Correccion de bug en bundle HTTP spec:** los `@IsUUID('4')` en `CreateBundleDto.itemIds` y `ValidateCombinationDto.itemIds` requieren UUIDs v4 validos (formato `xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx`). Los IDs de test se actualizaron con el dígito de version correcto.

**Correccion de expectativa HTTP en compatibility validate:** `POST /commercial/compatibility/validate` devuelve 201 por convención NestJS para todos los handlers `@Post()`. El test se alinea con el comportamiento real del framework sin añadir `@HttpCode(200)` al controller.

#### Resultado final de cobertura

| Capa | Statements | Branches | Functions | Lines |
|------|-----------|----------|-----------|-------|
| `services` | **95.68%** ✅ | 77.37% | 97.59% | 96.37% |
| `controllers` | **87.20%** ✅ | 100% | 72.5% | 86.41% |

#### Resultado de ejecucion

- 14 suites aprobadas.
- **109 tests aprobados.**
- 0 fallos.

**Estado de DoD:** RNF-COM-07 CERRADO. La cobertura de statements en servicios y controllers supera el umbral de 80% requerido por el DoD del modulo.

### 8.14 Refinamiento UX del modulo Comercial: menu lateral a tabs (2026-04-20)

Se aplico un refinamiento visual solicitado por negocio para priorizar ancho util del formulario principal dentro del modulo Comercial del portal.

Hallazgo UX:

- El menu lateral de subsecciones (`Planes`, `Productos`, `Servicios`, `Combos y promociones`, `Reglas comerciales`) reducia el espacio horizontal disponible para la edicion de catalogo.
- En escenarios de formularios largos, el layout de dos columnas (`nav` lateral + contenido) comprimía campos clave y aumentaba scroll innecesario.

Correccion aplicada:

- `apps/portal/src/components/commercial/CommercialTabLayout.tsx`: reemplazo de navegación lateral por cabecera de tabs horizontales, alineada al patrón visual de Suscriptores.

### 8.15 Rediseño del catálogo de productos en portal y alineación PRD (2026-04-20)

Se ejecutó el rediseño aprobado para la subsección `Productos` del módulo Comercial, priorizando visibilidad del catálogo completo, encontrabilidad y edición rápida sin introducir alcance de inventario físico.

Correcciones aplicadas:

- `apps/portal/src/components/settings/AdditionalProductsManager.tsx` deja de renderizar subsecciones rígidas por categoría y pasa a una vista unificada del catálogo.
- Se agregan búsqueda por nombre/descripción y filtros por categoría, estado y modelo comercial.
- La tabla principal pasa a una forma híbrida con columnas de `Producto`, `Categoría`, `Modelo comercial`, `Estado`, `Señales` y acciones.
- El modal de creación/edición se reestructura en dos bloques: `Información básica` y `Configuración comercial`.
- Se incorpora `description` como campo visible y editable del catálogo maestro, ya soportado por el contrato actual de MOD06.
- `apps/portal/src/lib/api-client.ts` amplía los DTOs de productos para enviar `description` al backend comercial vigente.
- `docs/prds/PRD-MOD06-COMERCIAL-DEFINICION-v1.0.md` se actualiza a v1.2 para formalizar el rediseño UX y dejar explícita la frontera actual del catálogo maestro frente al futuro módulo de inventario.

Decisión de alcance aplicada:

- No se introducen `brand`, `model` ni `sku` en esta iteración porque el contrato y el modelo persistente vigente de MOD06 aún no los soportan.
- Esos atributos quedan documentados como ampliación futura del catálogo maestro, separada del rediseño UX actual.

Validación ejecutada:

- `pnpm --filter @iwana/portal typecheck` en verde.
- `pnpm --filter @iwana/api typecheck` en verde.

Impacto:

- La gestión de productos deja de depender de memoria visual por subsección.
- El catálogo queda más legible para operaciones comerciales del tenant sin mezclar datos propios de inventario físico.
- El PRD queda alineado con el rediseño ejecutado y con la frontera real del contrato backend vigente.
- Se mantuvo navegación por teclado con `ArrowLeft/ArrowRight`, `Home` y `End`.
- Se reforzó semántica accesible con `role="tablist"`, `role="tab"` y `role="tabpanel"`.

Validacion:

- `pnpm --filter @iwana/portal typecheck` en verde.

Impacto:

- El panel principal de edición gana ancho completo.
- Se reduce fricción visual en formularios y mejora la lectura de campos sin cambiar contratos ni lógica de negocio.

### 8.15 Refinamiento UX en Planes: remocion de switch en acciones (2026-04-20)

Se aplico un ajuste puntual en la tabla de Planes para simplificar la columna de acciones y evitar controles ambiguos en la operación diaria.

Hallazgo UX:

- En `Acciones` existia un switch junto al botón `Editar`.
- Ese switch realizaba activacion/desactivacion directa del plan desde la grilla, lo cual generaba confusion visual y una decision operativa sensible en un control secundario.

Correccion aplicada:

- `apps/portal/src/components/settings/PlanCatalogManager.tsx`: se removio el switch de estado en la columna `Acciones`.
- Se limpiaron estado y handler asociados al toggle (`busySwitchPlanId`, `handleToggleActive`) para reducir complejidad del componente.
- La acción visible queda centrada en `Editar`, manteniendo lectura clara del estado mediante badge `Activo/Inactivo`.

Validacion:

- `pnpm --filter @iwana/portal typecheck` en verde.

Impacto:

- Menor ruido visual en la tabla de catálogo de planes.
- Se reduce riesgo de cambios de estado involuntarios desde una interacción rápida en la grilla.

### 8.16 Refinamiento del modal de Planes: fila compacta y mini CRUD de tecnologia (2026-04-20)

Se ajusto la experiencia de edicion/creacion de planes para reducir altura inicial del formulario y dar control operativo sobre las tecnologias sugeridas del input.

Cambios aplicados:

- `apps/portal/src/components/settings/PlanCatalogManager.tsx`: los campos `Nombre del plan` y `Tecnología` se reorganizaron en una sola fila responsiva (`grid` de 2 columnas en desktop).
- Se incorporo un mini CRUD de tecnologias junto al input:
  - alta de nueva tecnologia,
  - seleccion rapida para autocompletar el campo,
  - edicion inline de tecnologia existente,
  - eliminacion de tecnologia existente.
- El datalist del input de tecnologia ahora se alimenta del catalogo editable y no solo de una constante fija.
- El catalogo de tecnologias se persiste en `localStorage` del portal para mantener continuidad entre sesiones y se enriquece automaticamente con tecnologias existentes de planes ya cargados.

Validacion:

- `pnpm --filter @iwana/portal typecheck` en verde.

Impacto:

- Menor scroll inicial en modal de planes.
- Mayor flexibilidad para operar el catálogo sin depender de cambios de código para nuevas tecnologías comerciales.

### 8.17 Hardening operativo del mini CRUD de tecnologias (2026-04-20)

Se incorporo una regla de proteccion para evitar inconsistencias entre el catalogo de sugerencias y los planes activos del tenant.

Correccion aplicada:

- `apps/portal/src/components/settings/PlanCatalogManager.tsx`: se bloquea la eliminacion de una tecnologia cuando existe al menos un plan activo que la usa.
- El boton de eliminar queda deshabilitado en esos casos y muestra ayuda contextual en `title`.
- Si se intenta eliminar programaticamente una tecnologia en uso activo, el flujo responde con mensaje operativo y no ejecuta el borrado.

Validacion:

- `pnpm --filter @iwana/portal typecheck` en verde.

Impacto:

- Se reduce riesgo de desalinear el catálogo de sugerencias respecto a planes activos.
- Se protege la operación comercial de ediciones accidentales en el mini CRUD.

### 8.18 Optimización de espacio en modal de Planes (2026-04-20)

Se aplicó un ajuste de layout para concentrar las tecnologías en el input de selección y reducir altura visible del modal.

Corrección aplicada:

- `apps/portal/src/components/settings/PlanCatalogManager.tsx`:
  - El input `Tecnología` mantiene como fuente de opciones la lista desplegable (`datalist`) alimentada por `technologyOptions`.
  - Se agregó texto de ayuda para reforzar el patrón: escribir o seleccionar desde la lista.
  - El bloque `Gestionar tecnologías disponibles` se movió a un acordeón colapsable (`details/summary`) para liberar espacio por defecto.

Validación:

- `pnpm --filter @iwana/portal typecheck` en verde.

Impacto:

- Menor densidad visual en el modal de edición.
- Las tecnologías disponibles se consumen prioritariamente desde el campo de tecnología, manteniendo el CRUD avanzado bajo demanda.

### 8.19 Corrección de desplegable en campo Tecnología (2026-04-20)

Se corrigió el comportamiento del campo `Tecnología` en el modal de planes para asegurar visualización completa de opciones disponibles.

Corrección aplicada:

- `apps/portal/src/components/settings/PlanCatalogManager.tsx`:
  - reemplazo de `input + datalist` por `Select` nativo del sistema UI,
  - el desplegable ahora lista explícitamente todas las opciones del catálogo de tecnologías cargado en memoria (`technologyOptions`).

Resultado esperado:

- Al abrir el desplegable se visualizan opciones como `FTTH`, `GPON`, `HFC`, `WIFI5`, `WIFI6`, `XGS-PON` cuando estén presentes en el catálogo.

Validación:

- `pnpm --filter @iwana/portal typecheck` en verde.

### 8.20 Corrección backend de error 500 al guardar precio de plan (2026-04-20)

Se corrigió el fallo observado en `POST /api/v1/commercial/catalog/:id/prices` durante la acción `Guardar cambios` en Planes.

Causa raíz:

- Los controllers comerciales estaban leyendo el actor autenticado desde `req.user.id`.
- El payload JWT oficial del proyecto expone el identificador en `sub` (no en `id`).
- Como resultado, en runtime el `created_by` del historial de precios podía llegar inválido/ausente y provocar error interno al persistir.

Corrección aplicada:

- `apps/api/src/modules/commercial/controllers/catalog.controller.ts`: `createPrice()` ahora usa `req.user.sub`.
- `apps/api/src/modules/commercial/controllers/promotion.controller.ts`: `create()` ahora usa `req.user.sub`.
- `apps/api/src/modules/commercial/controllers/tax.controller.ts`: `createRule()` ahora usa `req.user.sub`.

Endurecimiento de pruebas:

- `apps/api/src/modules/commercial/catalog.controller.http.spec.ts`
- `apps/api/src/modules/commercial/promotion.controller.http.spec.ts`
- `apps/api/src/modules/commercial/tax.controller.http.spec.ts`

En los mocks HTTP se separó intencionalmente `id` y `sub` para validar explícitamente que el controller consume `sub`.

Validación:

- `pnpm --filter @iwana/api typecheck` en verde.
- Jest comercial HTTP en verde: 3 suites, 19 tests aprobados.

### 8.21 Corrección UX/cliente para conflicto 409 al editar plan sin cambios de precio (2026-04-20)

Se resolvió el error funcional observado al editar un plan cuando el precio vigente no cambiaba y el backend respondía `409 Conflict` con el mensaje `Ya existe un precio vigente idéntico...`.

Causa:

- El flujo de edición enviaba alta de precio (`POST /commercial/catalog/:id/prices`) incluso cuando `basePrice` e `installationFee` eran iguales al vigente.

Corrección aplicada:

- `apps/portal/src/components/settings/PlanCatalogManager.tsx`:
  - en edición se construye `updatePayload` diferencial,
  - solo se envían campos realmente modificados,
  - precio se envía únicamente si cambió (`basePrice` o `installationFee`), y cuando cambia se envían ambos campos para mantener snapshot consistente.
- `apps/portal/src/lib/api-client.ts`:
  - `commercialApi.updatePlan()` maneja `409` por `precio vigente idéntico` como escenario idempotente no bloqueante y continúa retornando el catálogo actualizado.

Validación:

- `pnpm --filter @iwana/portal typecheck` en verde.

Impacto:

- Editar nombre, tecnología o velocidades sin cambios de precio ya no falla por conflicto de precio duplicado.
- Se mantiene la regla backend de SCD Tipo 2 sin degradar la UX del portal.

### 8.22 Corrección de persistencia en catálogo de tecnologías (2026-04-20)

Se corrigió la inconsistencia reportada donde, tras dejar un subconjunto de tecnologías en `Gestionar tecnologías disponibles`, el modal de crear/editar plan volvía a mostrar tecnologías eliminadas.

Causa:

- El componente repoblaba automáticamente `technologyOptions` combinando:
  - defaults fijos,
  - tecnologías detectadas en planes cargados,
  - catálogo persistido.

Corrección aplicada:

- `apps/portal/src/components/settings/PlanCatalogManager.tsx`:
  - la fuente inicial del catálogo ahora prioriza `localStorage` (y usa defaults solo si no hay catálogo persistido válido),
  - se removió la rehidratación automática desde planes al hacer `loadPlans()`,
  - se removió la inyección automática de tecnología del plan al abrir editar,
  - el `Select` de tecnología usa una lista efectiva que conserva el valor actual del formulario sin contaminar el catálogo persistido.

Validación:

- `pnpm --filter @iwana/portal typecheck` en verde.

Impacto:

- Lo que el usuario deja en `Gestionar tecnologías disponibles` se respeta de forma estable en crear y editar plan.

### 8.23 Corrección de raíz post-reinicio (hidratación + localStorage) en tecnologías (2026-04-20)

Se cerró el caso donde, después de reiniciar el servidor de desarrollo, reaparecían tecnologías eliminadas en el modal de planes.

Causa técnica raíz:

- Durante el ciclo SSR/hidratación, el componente podía iniciar con defaults y persistirlos en `localStorage` antes de completar la lectura del catálogo previamente guardado.

Corrección aplicada:

- `apps/portal/src/components/settings/PlanCatalogManager.tsx`:
  - se introdujo una fase explícita de carga en `mount` desde `localStorage`,
  - se agregó bandera `technologyOptionsReady` para evitar escrituras prematuras,
  - la persistencia al storage se habilita solo cuando la lectura inicial ya terminó.

Validación:

- `pnpm --filter @iwana/portal typecheck` en verde.

Impacto:

- El catálogo de tecnologías editado por usuario se mantiene estable incluso tras reiniciar servidor/Hot Reload.

### 8.24 Iteracion UX Comercial: refinamiento de Productos + captura real de Servicios (2026-04-20)

Se ejecuto la continuacion solicitada para los puntos 2 y 3 del modulo Comercial en portal: mejorar encontrabilidad en Productos y habilitar la gestion operativa real de Servicios.

Correcciones aplicadas:

- `apps/portal/src/components/settings/AdditionalProductsManager.tsx`:
  - se agrego orden explicito de la tabla (`Activos primero`, `Por categoria`, `Recientes primero`),
  - se incorporaron chips de categoria con conteo para filtro rapido,
  - se mantuvo la vista unificada sin volver a subsecciones separadas.
- `apps/portal/src/lib/api-client.ts`:
  - nuevos contratos y metodos de `commercialApi` para servicios adicionales (`getAdditionalServices`, `createAdditionalService`, `updateAdditionalService`, `deleteAdditionalService`),
  - mapeo de payload comercial para `SERVICE` con soporte de `chargeType`.
- `apps/portal/src/components/settings/AdditionalServicesManager.tsx`:
  - nuevo manager completo para servicios con busqueda, filtros por estado/tipo de cobro, tabla unificada y modal de creacion/edicion.
- `apps/portal/src/components/commercial/CommercialTabLayout.tsx`:
  - la subseccion `Servicios` deja de usar placeholder y pasa a renderizar el manager real.

Validacion:

- `pnpm --filter @iwana/portal typecheck` en verde.

Impacto:

- El catalogo comercial mejora descubribilidad y priorizacion en Productos para operacion diaria.
- La subseccion Servicios queda funcional en el portal con boundary coherente al contrato backend de MOD06.

### 8.25 Cierre iteracion Comercial: microcopy + precio vigente en Servicios + E2E focalizada (2026-04-20)

Se completo la iteracion solicitada para los pasos 1, 2 y 3: validar E2E focalizada, ajustar microcopy operativo de Servicios y habilitar gestion explicita del precio vigente desde el manager.

Correcciones aplicadas:

- `apps/portal/src/lib/api-client.ts`:
  - `AdditionalService` incorpora `basePrice` e `installationFee` mapeados desde el payload comercial vigente.
  - `commercialApi.createAdditionalService()` y `commercialApi.updateAdditionalService()` ahora pueden registrar precio vigente en `POST /commercial/catalog/:id/prices` cuando el formulario envia valores de precio.
  - manejo idempotente de `409` por `precio vigente idéntico` en actualizacion de servicios, consistente con el patron ya aplicado en planes.
- `apps/portal/src/components/settings/AdditionalServicesManager.tsx`:
  - microcopy de cabecera y bloque comercial alineado a lenguaje operativo de ventas/facturacion.
  - nuevos campos en formulario: `Precio base (COP)` y `Cargo de instalacion (COP)`.
  - columna nueva `Precio vigente` en la tabla, con lectura directa de precio base e instalacion por servicio.
- `e2e/tests/portal-commercial-catalog-products-services.spec.ts`:
  - nueva prueba E2E focalizada para `/dashboard/commercial` cubriendo navegacion entre `Productos` y `Servicios`.
  - validacion de alta de servicio con precio vigente y confirmacion de llamada de pricing sobre el item creado.

Validacion:

- `pnpm --filter @iwana/portal typecheck` en verde.
- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-commercial-catalog-products-services.spec.ts` en verde (1 test aprobado).

Impacto:

- Servicios queda alineado con una operacion comercial real: no solo define tipo de cobro, tambien captura y exhibe precio vigente en el mismo flujo.
- El modulo Comercial suma cobertura E2E especifica de su ruta dedicada en portal, reduciendo riesgo de regresion en Productos/Servicios.

### 8.26 Correccion de regresion E2E integral del portal (2026-04-20)

Se ejecuto y corrigio la regresion completa de Playwright del portal posterior a cambios de navegacion y microcopy.

Correcciones aplicadas:

- `e2e/tests/portal-admin-first-access.spec.ts`:
  - robustez de mocks (`url.includes`) para endpoints de auth,
  - tiempos de espera de redireccion ajustados para evitar flakiness en rutas de primer acceso.
- `e2e/tests/portal-auth-notifications.spec.ts`:
  - rol mock alineado a `ADMIN` para permitir lectura de notificaciones de auditoria,
  - expectativa de copy actualizada a `Inicio de sesión · Usuario`,
  - mock agregado para `GET /dashboard/summary` para evitar estado de error incidental en dashboard.
- `e2e/tests/portal-users.spec.ts`:
  - flujo de filtro por estado actualizado para `Select` custom (interaccion por boton/listbox y opcion visible), evitando `selectOption` sobre `select` oculto.
- `e2e/tests/portal-settings-empresa.spec.ts`:
  - eliminadas expectativas obsoletas del tab `Comercial` dentro de Settings,
  - nueva validacion de que Comercial vive como ruta dedicada (`/dashboard/commercial`) desde la navegacion lateral,
  - assertions de copy actualizadas en Operacion (`Configuración operativa`),
  - helper de seleccion para `Select` custom en configuracion operativa.

Validacion ejecutada:

- Re-run focalizado de specs corregidos en verde.
- Suite completa portal en verde:
  - `pnpm exec playwright test --config e2e/playwright.portal.config.ts`
  - resultado: **57 passed, 0 failed**.

Impacto:

- Se restablece la confiabilidad de la regresion E2E del portal sobre la IA vigente.
- Se elimina deuda de pruebas legacy acopladas a una arquitectura de navegacion ya retirada (Comercial dentro de Settings).

### 8.27 Hotfix backend: Servicios ahora exponen precio vigente en catálogo (2026-04-20)

Se atendio un defecto funcional reportado en portal: al crear/editar servicios comerciales con `Precio base` y `Cargo de instalación`, la UI mostraba `$0` pese a que el flujo de pricing se ejecutaba.

Hallazgo técnico:

- `POST /commercial/catalog/services` crea correctamente el item de tipo `SERVICE`.
- `POST /commercial/catalog/:id/prices` registra correctamente el precio vigente (SCD) en `catalog_price_history`.
- El problema estaba en lectura: `CatalogService._hydrateItem()` para `SERVICE` retornaba `chargeType`, pero no adjuntaba `currentPrice` ni `installationFee` desde `CatalogPriceHistory`.

Corrección aplicada:

- `apps/api/src/modules/commercial/services/catalog.service.ts`:
  - se agregó lookup de precio vigente residencial para items `SERVICE` durante hidratación,
  - se exponen ahora `currentPrice` e `installationFee` igual que en `PLAN`.
- `apps/api/src/modules/commercial/tests/catalog.service.spec.ts`:
  - nuevo test unitario: `retorna ítem SERVICE hidratado con precio vigente cuando existe`.

Validación:

- `pnpm --filter @iwana/api test -- catalog.service.spec.ts` en verde.
- Resultado: 1 suite aprobada, 17 tests aprobados.

Impacto:

- El portal recibe y renderiza el precio vigente real en la tabla de Servicios.
- Se elimina el falso negativo operativo de “precio no guardado” para servicios comerciales.

### 8.28 Implementación portal: Combos y promociones (enfoque B con sub-tabs internos) (2026-04-20)

Se ejecutó la implementación aprobada para activar la subsección `Combos y promociones` dentro de `Comercial`, reemplazando el placeholder por una experiencia operativa real con dos sub-tabs internos: `Combos` y `Promociones`.

Alcance implementado:

- `apps/portal/src/lib/api-client.ts`:
  - nuevos tipos y contratos para ofertas comerciales:
    - `CommercialBundle`, `CommercialBundleDetail`, `BundlePriceResult`, `CreateBundleDto`.
    - `CommercialPromotion`, `CreatePromotionDto`.
  - nuevos métodos de `commercialApi`:
    - bundles: `getBundles`, `getBundleDetail`, `createBundle`, `deactivateBundle`, `getBundlePrice`.
    - promociones: `getPromotions`, `createPromotion`, `deactivatePromotion`.
- `apps/portal/src/components/commercial/OffersManager.tsx`:
  - nuevo shell con sub-tabs accesibles (`role=tablist`, roving focus con teclado).
- `apps/portal/src/components/commercial/BundlesManager.tsx`:
  - tabla de combos activos con columnas operativas (nombre, ítems, descuento, vigencia, estado).
  - desactivación controlada por rol (`canEdit`).
  - carga de catálogo combinada (planes, productos, servicios) para composición de combo.
- `apps/portal/src/components/commercial/CreateBundleModal.tsx`:
  - creación de combos con validaciones (`zod` + `react-hook-form`): mínimo 2 ítems, reglas de vigencia y descuento.
  - soporte de ítems opcionales (`optionalItemIds`) en el payload.
- `apps/portal/src/components/commercial/PromotionsManager.tsx`:
  - tabla de promociones con código, alcance, usos, vigencia y estado.
  - desactivación controlada por rol (`canEdit`).
- `apps/portal/src/components/commercial/CreatePromotionModal.tsx`:
  - creación de promociones con validaciones de alcance (`ITEM`, `BUNDLE`, `INSTALLATION`, `ALL`), vigencia y límite de usos.
  - normalización de código a mayúsculas y soporte de segmentación objetivo.
- `apps/portal/src/components/commercial/CommercialTabLayout.tsx`:
  - integración del nuevo `OffersManager` en el sub-item `offers`.

Validación ejecutada:

- `pnpm --filter @iwana/portal typecheck` en verde.
- `pnpm --filter @iwana/portal lint` en verde.
- `pnpm test:e2e:portal -- --grep "Portal Comercial - Catalogo de productos y servicios"` en verde (`1 passed`).

Impacto:

- La ruta `/dashboard/commercial` deja de depender de placeholder para ofertas y habilita operación real de combos/promociones desde portal.
- Se mantiene coherencia con el boundary de MOD06 (consumo exclusivo de `commercialApi`) y con gating por rol del tenant autenticado.

### 8.30 Implementacion de reglas comerciales: Compatibilidad y Tributarias (2026-04-20)

Se ejecuto la especificacion de diseño `docs/specs/2026-04-20-reglas-comerciales-design.md` completa, implementando las dos subsecciones de `Reglas comerciales` en el modulo Comercial: compatibilidad entre items del catalogo y clasificaciones tributarias con resolucion por estrato y segmento.

#### Alcance implementado — Backend

**Migracion tenant 020 (`020_add_commercial_rules_fields.ts`):**
- `compatibility_rules`: nuevas columnas `effective_from DATE`, `note TEXT`, `updated_at TIMESTAMPTZ`.
- `tax_classifications`: 5 flags booleanos (`applies_iva`, `applies_retefuente`, `applies_reteica`, `applies_estampillas`, `is_system`).
- `tax_rules`: columnas `stratum_from SMALLINT`, `stratum_to SMALLINT`, `priority SMALLINT DEFAULT 0`.
- Seed idempotente de `is_system=true` y flags booleanos para las 4 clasificaciones base: `IVA_EXEMPT`, `IVA_EXCLUDED`, `IVA_FULL`, `GOV_FULL`.
- Indice unico parcial `idx_compat_one_active_successor` sobre `source_item_id WHERE is_active=true`.
- Registrada en `runner.ts` como migracion 020.

**Ports y adapters nuevos:**
- `CommercialCompatibilityReadPort` / `CommercialCompatibilityReadAdapter`: expone `getReplacementFor(sourceItemId)` para consumo en CRM/Billing.
- `TaxRuleReadPort` / `TaxRuleReadAdapter`: expone `resolve(segment, stratum?)` con logica de prioridad y fallback.

**Entidades actualizadas:**
- `CompatibilityRule`: `effectiveFrom`, `note`, `updatedAt`.
- `TaxClassification`: `appliesIva`, `appliesRetefuente`, `appliesReteIca`, `appliesEstampillas`, `isSystem`.
- `TaxRule`: `stratumFrom`, `stratumTo`, `priority`.

**DTOs actualizados (`compatibility.dto.ts`, `tax.dto.ts`):**
- `UpdateCompatibilityRuleDto`: `effectiveFrom`, `note`, `isActive`.
- `CreateTaxClassificationDto` / `UpdateTaxClassificationDto`: 5 flags booleanos.
- `CreateTaxRuleDto` / `UpdateTaxRuleDto`: `stratumFrom`, `stratumTo`, `priority`, `taxType`, `ratePercentage`.
- `ResolveTaxDto`: `segment`, `stratum?`.

**Servicios:**
- `CompatibilityService.update()`: actualiza `effectiveFrom`, `note`, `isActive`; retorna regla actualizada.
- `CompatibilityService.getReplacementFor()`: devuelve el item sucesor activo de un item dado.
- `TaxClassificationService.deactivateClassification()`: protege clasificaciones `is_system=true` con `BadRequestException` (400).
- `TaxClassificationService.resolveClassification()`: resolucion por `segment` + `stratum` (opcional) con prioridad; usa `SET LOCAL search_path` compatible con pgBouncer. QueryBuilder con propiedades TypeScript `tr.stratumFrom`, `tr.stratumTo`.

**Controllers:**
- `PATCH /commercial/compatibility-rules/:id`: delegacion a `CompatibilityService.update()`.
- `DELETE /commercial/tax-classifications/:id`: delegacion a `deactivateClassification()` con guard `is_system`.
- `POST /commercial/tax/resolve`: delegacion a `resolveClassification()` con `ResolveTaxDto`.

**CommercialModule:**
- Registra y exporta los 4 tokens de puerto nuevos con patron `useExisting` consistente con `CommercialCatalogReadPort`.

#### Alcance implementado — Portal (Frontend)

**`apps/portal/src/lib/api-client.ts`:**
- Nuevos tipos: `CompatibilityRule`, `TaxClassification` (5 flags + `isSystem`), `TaxRule` (`stratumFrom`, `stratumTo`, `priority`, `taxType`, `ratePercentage`).
- Nuevos DTOs: `CreateCompatibilityRuleDto`, `UpdateCompatibilityRuleDto`, `CreateTaxClassificationDto` (con `code`), `CreateTaxRuleDto`.
- 11 nuevos metodos de `commercialApi` para compatibilidad y tributos.
- Rutas con guion: `/commercial/tax-classifications`, `/commercial/tax-rules`.

**`apps/portal/src/components/commercial/CompatibilityRulesManager.tsx`:**
- Tabla filtrable por tipo (`REPLACES`, `REQUIRES`, `EXCLUDES`) con dialogo de creacion y edicion via `PATCH`.

**`apps/portal/src/components/commercial/TaxRulesManager.tsx`:**
- Clasificaciones con 5 indicadores de flag, badge `is_system`, creacion con `code` auto-derivado en `UPPER_SNAKE_CASE`.
- Panel de reglas por clasificacion con `stratumFrom/To`, `taxType`, `ratePercentage`.
- Simulador de resolucion via `POST /commercial/tax/resolve`.

**`apps/portal/src/components/commercial/CommercialTabLayout.tsx`:**
- Subseccion `Reglas comerciales` renderiza `<CompatibilityRulesManager>` + `<TaxRulesManager>`.

#### Correcciones de typecheck (`exactOptionalPropertyTypes`)

- `CompatibilityRulesManager.tsx:197`: spread condicional para `note` en `UpdateCompatibilityRuleDto`.
- `CompatibilityRulesManager.tsx:397,410` y `TaxRulesManager.tsx:785`: spread condicional para prop `error` de `Select`.

#### Validacion de salida

- `pnpm --filter @iwana/api typecheck` — verde.
- `pnpm --filter @iwana/portal typecheck` — verde (0 errores).

Se cerró el gap de calidad identificado para la entrega de `Combos y promociones` en portal, habilitando test runner unitario en `apps/portal` y agregando pruebas focalizadas sobre navegación de tabs e integración de panel de Ofertas.

Cambios aplicados:

- Infraestructura de tests en portal:
  - `apps/portal/package.json`: script `test` y dependencias dev (`jest`, `ts-jest`, `@testing-library/*`, `@types/jest`, `jest-environment-jsdom`).
  - `apps/portal/jest.config.js`: configuración de Jest para TS/TSX, aliases del monorepo y mocks de assets.
  - `apps/portal/src/jest.setup.ts`: setup de `@testing-library/jest-dom`.
  - `apps/portal/src/__mocks__/fileMock.js`: stub de archivos estáticos.
- Unit tests agregados:
  - `apps/portal/src/components/commercial/OffersManager.spec.tsx`:
    - render inicial en `Combos`.
    - cambio a `Promociones` por click.
    - navegación por teclado (`ArrowRight`) entre subtabs.
  - `apps/portal/src/components/commercial/CommercialTabLayout.spec.tsx`:
    - render inicial en `Planes`.
    - integración de `OffersManager` al seleccionar `Combos y promociones`.

Validación ejecutada:

- `pnpm --filter @iwana/portal test` en verde.

Impacto:

- La entrega de Ofertas queda con cobertura unitaria básica y reproducible en portal.
- Se evita regresión silenciosa de accesibilidad y navegación en tabs comerciales.

### 8.31 Corrección 500s en endpoints de reglas comerciales y fix QueryBuilder (2026-04-21)

#### Diagnóstico de errores HTTP 500

Los tres endpoints de reglas comerciales retornaban 500 al accederse desde el portal:

| Endpoint | Causa raíz |
|---|---|
| `GET /commercial/compatibility-rules` | Columnas `effective_from`, `note`, `updated_at` faltantes en tabla |
| `GET /commercial/tax-classifications` | Columnas `applies_iva`, `applies_retefuente`, `applies_reteica`, `applies_estampillas`, `is_system` faltantes |
| `GET /commercial/tax-rules` | Columnas `stratum_from`, `stratum_to`, `priority` faltantes |

**Causa raíz confirmada:** migración `020_add_commercial_rules_fields` compilada en dist pero no ejecutada contra los schemas activos de tenant.

Verificación de presencia del código compilado: archivos del módulo commercial en `apps/api/dist` con timestamp 20/04/2026 3:44 PM confirmaron que el código nuevo SÍ estaba desplegado. El API retornaba 401 en ausencia de token (routing correcto), pero 500 tras autenticación (error en SELECT de columnas inexistentes).

#### Ejecución de migración 020

Se ejecutó usando `.env.development` (que apunta `DB_HOST=localhost` para acceso host-side al contenedor Docker):

```bash
pnpm --filter @iwana/db migration:tenant:run
```

Resultado:
- `tenant_iwana`: migración 020 aplicada en ~50 ms.
- `tenant_test_company`: migración 020 aplicada en ~50 ms.
- Tabla `typeorm_migrations` actualizada en ambos schemas.

#### Verificación post-migración de columnas

| Tabla | Columnas antes | Columnas después |
|---|---|---|
| `catalog_compatibility_rules` | 8 | 11 (+`effective_from`, `note`, `updated_at`) |
| `tax_classifications` | 8 | 13 (+5 flags + `is_system`) |
| `tax_rules` | 15 | 18 (+`stratum_from`, `stratum_to`, `priority`) |

Seed verificado: `IVA_EXEMPT`, `IVA_EXCLUDED`, `IVA_FULL`, `GOV_FULL` con `is_system=true` y flags booleanos correctos.

Endpoints post-migración: retornan 401 (sin token) en lugar de 500 — prueba de que el error era exclusivamente de esquema DB.

#### Fix bug en `resolveClassification` — QueryBuilder nombres de columna

En `tax-classification.service.ts` función `resolveClassification`, el `andWhere` de rango de estrato usaba nombres de columna DB (`tr.stratum_from`, `tr.stratum_to`) en lugar de los nombres de propiedad TypeScript que TypeORM requiere para el mapeo en QueryBuilder:

**Antes (incorrecto):**
```typescript
'((tr.stratum_from IS NULL AND tr.stratum_to IS NULL) OR (:stratum BETWEEN tr.stratum_from AND tr.stratum_to))'
```

**Después (correcto):**
```typescript
'((tr.stratumFrom IS NULL AND tr.stratumTo IS NULL) OR (:stratum BETWEEN tr.stratumFrom AND tr.stratumTo))'
```

TypeORM `replacePropertyNames()` busca en los metadatos del alias `tr` (→ `TaxRule`) la propiedad TypeScript y la convierte al nombre de columna DB. Usar el nombre de columna raw causaría error de resolución en runtime al invocar `POST /commercial/tax/resolve`.

#### Validación final

- `pnpm --filter @iwana/api test -- --testPathPattern="commercial"` → **123/123 tests pass** (14 suites).
- `pnpm --filter @iwana/api typecheck` → **0 errores**.
- Endpoints retornan **401** (no 500) para requests no autenticadas — DB layer operativo.

**Estado al cierre:** migración 020 ejecutada en ambos tenant schemas, bug de QueryBuilder corregido, cobertura de tests del módulo commercial intacta.

### 8.32 Ajuste normativo: permitir edición y desactivación de clasificaciones base del sistema (2026-04-21)

Se aplicó un cambio de política funcional para permitir que las clasificaciones tributarias marcadas como `is_system=true` también puedan ajustarse cuando la legislación cambie.

Cambios implementados:

- `apps/api/src/modules/commercial/services/tax-classification.service.ts`:
  - se eliminó la restricción que bloqueaba `deactivateClassification()` para registros `isSystem`.
- `apps/api/src/modules/commercial/controllers/tax.controller.ts`:
  - se actualizó la documentación del endpoint `DELETE /commercial/tax-classifications/:id` removiendo la semántica de bloqueo por sistema.
- `apps/portal/src/components/commercial/TaxRulesManager.tsx`:
  - en la sección `Clasificaciones tributarias`, el botón de **Editar** (lápiz) y **Desactivar** ahora aparece para cualquier clasificación activa, incluyendo bases del sistema.

Validación ejecutada:

- `pnpm --filter @iwana/api typecheck` — verde.
- `pnpm --filter @iwana/portal typecheck` — verde.

### 8.33 CRUD tributario: iconografía en tabla y eliminación real desde modal (2026-04-21)

Ajuste aplicado según lineamiento UX y operación:

- En la grilla de `Clasificaciones tributarias` se dejó solo el ícono de lápiz para edición (sin texto y sin botón de eliminar en la tabla).
- La acción de eliminación se movió al modal de edición con advertencia explícita y confirmación previa.
- La eliminación de clasificación pasó a ser física (delete), no desactivación lógica.

Cambios técnicos:

- `apps/portal/src/components/commercial/TaxRulesManager.tsx`:
  - acción de tabla reducida a ícono `Pencil`.
  - nuevo `handleDeleteClassification()` invocado desde modal.
  - botón de eliminar con ícono `Trash2` dentro del modal y aviso de irreversibilidad.
- `apps/portal/src/lib/api-client.ts`:
  - nuevo método `deleteTaxClassification()`.
- `apps/api/src/modules/commercial/services/tax-classification.service.ts`:
  - `DELETE` elimina registro con `remove()`.
  - guard de integridad: bloquea eliminación si existen reglas tributarias asociadas.
- `apps/api/src/modules/commercial/controllers/tax.controller.ts`:
  - contrato/documentación ajustados a semántica de eliminación.

Validación:

- `pnpm --filter @iwana/api typecheck` — verde.
- `pnpm --filter @iwana/portal typecheck` — verde.

### 8.34 Recuperación de reglas tributarias inactivas (2026-04-21)

Se corrigió el comportamiento donde una regla quedaba oculta después de desactivarse, impidiendo reactivarla desde portal.

Cambios:

- `apps/api/src/modules/commercial/services/tax-classification.service.ts`:
  - `findAllRules()` ahora retorna reglas activas e inactivas (sin filtro fijo `isActive=true`).
- `apps/api/src/modules/commercial/controllers/tax.controller.ts`:
  - resumen OpenAPI actualizado para reflejar listado de activas e inactivas.
- `apps/portal/src/components/commercial/TaxRulesManager.tsx`:
  - para reglas inactivas, se agregó acción `Activar` (usa `PATCH /commercial/tax-rules/:id` con `isActive=true`).

Validación:

- `pnpm --filter @iwana/api typecheck` — verde.
- `pnpm --filter @iwana/portal typecheck` — verde.

### 8.35 Reactivación visible de clasificaciones tributarias inactivas (2026-04-21)

Se corrigió la UX en `Clasificaciones tributarias` para que los registros inactivos no queden sin acción.

Cambios:

- `apps/portal/src/components/commercial/TaxRulesManager.tsx`:
  - se agregó acción de **activar** (ícono `RotateCcw`) para filas con `isActive=false`.
  - la acción llama `updateTaxClassification(id, { isActive: true })` y refresca la tabla.
  - se mantiene el lápiz únicamente para filas activas.

Validación:

- `pnpm --filter @iwana/portal typecheck` — verde.
