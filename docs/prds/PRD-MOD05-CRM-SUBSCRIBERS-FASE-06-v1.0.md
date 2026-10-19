# PRD - MOD05 CRM Módulo Subscriber — Fase 06 (Lista operativa: servicio principal, cola de trabajo y vista lateral)

**Version:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-10-19
**Modo activo:** Product Architect + Architect
**Autor:** AI-EM-ARCH
**Aprobación:** CTO, 2026-10-19 — G0: D-F6-1 A (sin zona; ciudad del servicio principal), D-F6-2 regla RF-LO-02, D-F6-3 conteos globales, D-F6-4 diferir vistas guardadas, D-F6-5 teclado solo con foco en la tabla y D-F6-6 incluir los P3, según las recomendaciones de §9.1
**Origen:**
- cambios estructurales **E1** y **E2** de la [spec UX de Suscriptores](../specs/2026-10-18-mod05-suscriptores-ux-rediseno-spec.md) §4 (hallazgos D4, D8 y D13);
- pendientes P3 del [cierre de la Fase 05](../informes/INFORME-MOD05-CICLO-VIDA-CIERRE-v1.0.md) §4.

**PRD vigente:** [Fase 05 v1.2](PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.2.md). Esta fase no reemplaza requerimientos: agrega la proyección de la lista y la experiencia de cola de trabajo
**ADRs aplicables:** ADR-065 (paginación y orden), ADR-067 (proyección PII), ADR-075 (capas Z del portal), ADR-083 (RBAC granular), ADR-097 (puertos de lectura)
**ADR nuevo requerido:** ninguno. La lectura del catálogo de planes usa el puerto existente `PlanCatalogReadPort` (MOD06), al que se le agrega un método por lote
**Spec de componente:** [SPEC-PORTAL-SIDEPEEK-A11Y-v1.0](../specs/SPEC-PORTAL-SIDEPEEK-A11Y-v1.0.md)

---

## 1. Contexto y motivación

Con la Fase 05 el estado del suscriptor ya refleja sus servicios. Pero la lista sigue siendo un directorio: para saber qué plan tiene un cliente o actuar sobre él hay que abrir la ficha.

| # | Hecho verificado (2026-10-19, `main` en `ea49fb4c`) | Fuente |
| --- | --- | --- |
| H1 | `SubscriberListItem` ya trae `hasLiveContracts` mediante una subconsulta por fila. No trae plan ni punto de servicio | `subscribers.service.ts:621-700`; `subscriber.schema.ts:131` |
| H2 | El nombre del plan **no está en el contrato**: `plan_snapshot_json` de un contrato convertido desde expediente solo guarda `{ id, source }`. El nombre se resuelve por `plan_id` contra el catálogo de MOD06 | `contracts.service.ts:307`; `ServiciosTab.tsx` (resolución por id) |
| H3 | `PlanCatalogReadPort` solo expone `getActivePlans`, `getPlanById` y `createSnapshot`: no hay lectura por lote | `commercial/ports/plan-catalog-read.port.ts:31-40` |
| H4 | El contrato guarda la dirección, ciudad y departamento de instalación; no guarda coordenadas ni zona | `contract.entity.ts` |
| H5 | **No existe asignación de zona** en suscriptor, contrato ni expediente. `coverage_zones` es un círculo (centro y radio) y `checkAvailability` **ignora las coordenadas**: devuelve todos los nodos y zonas activos como disponibles | `coverage-zone.entity.ts:20-30`; `tenant-crm-read-adapter.service.ts:21-60` |
| H6 | `contactPending` y la completitud fiscal se derivan de columnas (`email_encrypted`, `phone_encrypted`, `vat_responsibility`, `rut_responsibilities`, DV, representante legal): se pueden contar en SQL sin descifrar | `subscriber-contact.util.ts`; `subscriber-fiscal-completeness.service.ts:22-34` |
| H7 | El portal ya tiene `PortalSidePeek` (spec congelada) y `GlobalSearch` usa `Ctrl/Cmd+K` en todo el documento | `portal-ui.tsx:1583`; `GlobalSearch.tsx:81-95` |
| H8 | La guarda de «foco diferido que no pisa al operador» está copiada en **seis** sitios, y `DialogTitle` de `@iwana/ui` no acepta `ref` | `Dialog.tsx`, `OperationalSidePeek.tsx` (`@iwana/ui`); `portal-ui.tsx`, `use-portal-side-drawer-a11y.ts`, `SessionRecoveryModal.tsx`, `SubscriberLifecycleDialog.tsx` (portal) |
| H9 | CA-LC-09 (403 con solo `CRM_EXPEDIENTES_MANAGE`) se prueba sobre el guard, no por HTTP. El repo ya tiene 58 specs HTTP con supertest (`*.controller.http.spec.ts`) | `contracts/tests/contracts.controller.spec.ts:436`; p. ej. `access-control.controller.http.spec.ts` |

## 2. Objetivo de la fase

Que el operador resuelva desde la lista lo que hoy le obliga a abrir la ficha: ver qué servicio tiene cada cliente, atender una cola («suspendidos», «contacto pendiente») con un clic y actuar sobre un suscriptor sin perder su lugar en la lista.

## 3. Alcance

**Dentro:**
- servicio principal en la proyección de la lista y del lookup exacto;
- conteos de cola en un endpoint propio;
- chips de cola, panel «Más filtros» y nueva disposición de columnas;
- vista lateral desde la fila, con las acciones de ciclo de vida de la Fase 05;
- navegación por teclado acotada a la tabla;
- dos P3 técnicos de la Fase 05: la prueba HTTP de CA-LC-09 y la consolidación de la guarda de foco en `@iwana/ui`.

**Fuera:**
- zona de cobertura (D-F6-1): depende del dominio de red (E8);
- vistas guardadas por usuario (D-F6-4);
- lista en tarjetas para móvil (E3), cambio de plan (E5), tabs Soporte y Facturación (E6, E7);
- pendientes no técnicos de la Fase 05: Q1 (jurídico), Q2 (comercial) y la corrida del CLI de inconsistencias antes de la beta.

## 4. Personas y casos de uso

| CU | Caso de uso |
| --- | --- |
| CU-LO-01 | Ver en la lista el plan y la ubicación del servicio principal de cada suscriptor |
| CU-LO-02 | Entrar a una cola de trabajo con un clic y ver cuántos casos tiene |
| CU-LO-03 | Revisar a un suscriptor en una vista lateral y suspender o reactivar sus servicios sin salir de la lista |
| CU-LO-04 | Recorrer la lista con el teclado y abrir la ficha |

## 5. Requerimientos funcionales

### 5.1 Servicio principal (sujeto a D-F6-2)

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-LO-01 | Cada `SubscriberListItem` gana `primaryService: { contractId, planName, status, city, alias } \| null` y `otherLiveServicesCount: number` | MVP |
| RF-LO-02 | Regla del principal: el contrato `ACTIVE` con `start_date` más antigua; si no hay, el `SUSPENDED` más antiguo; si no hay, el `DRAFT` más reciente; si no hay ninguno, `null`. Empate por `created_at` y luego `id` | MVP |
| RF-LO-03 | `planName` se resuelve por lote con un método nuevo `PlanCatalogReadPort.getPlansByIds(tenantId, schemaName, ids)`: **una** consulta por página, nunca una por fila. Plan inexistente o inactivo → `planName = null` y la UI muestra «Plan no disponible» | MVP |
| RF-LO-04 | La proyección respeta la de privacidad vigente (ADR-067): un suscriptor restringido o anonimizado conserva `primaryService.status` y `planName`, pero no `alias` ni `city` | MVP |
| RF-LO-05 | El lookup exacto (`POST /search` con documento, teléfono o correo) devuelve los mismos campos | MVP |

### 5.2 Conteos de cola (sujeto a D-F6-3)

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-LO-06 | `GET /crm/subscribers/queue-counts` devuelve `{ active, suspended, contactPending, fiscalIncomplete, withoutLiveServices }` en **una** consulta con `COUNT(*) FILTER (...)` | MVP |
| RF-LO-07 | Los conteos son globales del tenant: no dependen de la búsqueda ni de los filtros activos. Excluyen anonimizados y respetan el filtro de partes bloqueadas igual que la lista | MVP |
| RF-LO-08 | `fiscalIncomplete` replica en SQL la regla de `subscriber-fiscal-completeness.service.ts` y solo cuenta suscriptores no cancelados; un test de paridad compara ambas implementaciones sobre los mismos datos | MVP |
| RF-LO-09 | Mismo permiso que la lista (`CRM_SUBSCRIBERS_READ`) | MVP |

### 5.3 Lista y filtros

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-LO-10 | Columnas: **Suscriptor** (nombre; debajo, documento y tipo · segmento en texto secundario), **Servicio principal** (plan; debajo, ciudad y «+N servicios»), **Estado**, **Creado**. Tipo y Segmento dejan de ser columnas | MVP |
| RF-LO-11 | Chips de cola con su conteo: Activos, Suspendidos, Contacto pendiente, Datos fiscales incompletos, Sin servicios vigentes. Un solo chip activo a la vez, con `aria-pressed`, reflejado en la URL (`?queue=`) y combinable con la búsqueda de texto | MVP |
| RF-LO-12 | La API de la lista acepta los filtros que los chips necesitan y hoy no existen: `contactPending`, `fiscalIncomplete` y `withoutLiveServices` (booleanos), con la misma regla SQL de RF-LO-06 | MVP |
| RF-LO-13 | «Más filtros» (divulgación progresiva) agrupa Tipo de persona, Segmento y Estrato. Un resumen muestra los filtros activos y permite quitarlos uno a uno | MVP |
| RF-LO-14 | En el modo de búsqueda exacta (QW1) los chips se ocultan, como ya ocurre con los filtros | MVP |

### 5.4 Vista lateral

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-LO-15 | Clic en la fila (fuera del enlace del nombre) o `Enter` sobre la fila activa abre `PortalSidePeek` con: identidad y estado, contacto, servicios vivos con su estado y último motivo, avisos (contacto o datos fiscales pendientes) y el enlace «Abrir ficha». El enlace del nombre sigue navegando a la ficha | MVP |
| RF-LO-16 | Acciones en la vista lateral: «Suspender servicios» o «Reactivar servicios» según el estado, con el diálogo de la Fase 05 (`SubscriberLifecycleDialog`). Al terminar, la fila y los conteos se actualizan sin recargar la página | MVP |
| RF-LO-17 | La vista lateral carga el detalle bajo demanda (`getById` y contratos), con skeleton; el suscriptor abierto queda en la URL (`?peek=<id>`) para que recargar o compartir conserve el contexto | MVP |
| RF-LO-18 | Con `privacyRestricted` la vista lateral muestra solo identidad, estado y la alerta, igual que la ficha | MVP |

### 5.5 Teclado (sujeto a D-F6-5)

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-LO-19 | Con el foco dentro de la tabla: flechas arriba y abajo mueven la fila activa (roving tabindex), `Enter` abre la vista lateral, `Esc` la cierra y devuelve el foco a la fila. **Sin atajos de un solo carácter globales** (WCAG 2.1.4); la búsqueda global sigue en `Ctrl/Cmd+K` | MVP |

### 5.6 P3 heredados de la Fase 05

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-LO-20 | Spec HTTP `contracts.controller.http.spec.ts`: un usuario con `CRM_EXPEDIENTES_MANAGE` y sin `CRM_SUBSCRIBERS_MANAGE` recibe 403 en `suspend`, `reactivate` y `terminate`; con `CRM_SUBSCRIBERS_MANAGE`, la petición pasa el guard | MVP |
| RF-LO-21 | Hook `useDeferredInitialFocus` en `@iwana/ui` con la guarda vigente (enfocar en el siguiente frame solo si el foco no se movió, cancelar el frame en el cleanup). Lo adoptan los seis sitios de H8, sin cambio de comportamiento | MVP |
| RF-LO-22 | `DialogTitle` acepta `ref` (`forwardRef`), y `SubscriberLifecycleDialog` deja de buscar el título con `querySelector` | MVP |

## 6. Requerimientos no funcionales

| ID | Requerimiento |
| --- | --- |
| RNF-LO-01 | Lista con 100 filas (tope actual): como máximo **tres consultas principales** por página (filas, conteo total y planes por lote). Las lecturas delegadas en los puertos de Party/Privacy se miden y reportan por separado; no forman parte de este límite. La verificación cuenta ambas categorías |
| RNF-LO-02 | La subconsulta del principal usa el índice existente `idx_contracts_tenant_subscriber`; `EXPLAIN` sin barrido secuencial de `contracts` en el tenant de desarrollo |
| RNF-LO-03 | Sin PII nueva en logs ni en la URL: `?peek=` lleva el id del suscriptor, nunca documento, nombre ni contacto |
| RNF-LO-04 | Vista lateral y chips según SPEC-PORTAL-SIDEPEEK-A11Y y las recetas §2 y §9 de `iwana-identity-ui-review`; `audit-ui.mjs` en 0 |
| RNF-LO-05 | Contrato compartido sin deriva entre `@iwana/shared`, API y portal |

## 7. Contratos (borrador)

```ts
// @iwana/shared — subscriber.schema.ts
primaryService: z.object({
  contractId: z.string().uuid(),
  planName: z.string().nullable(),
  status: z.nativeEnum(ContractStatus),
  city: z.string().nullable(),
  alias: z.string().nullable(),
}).nullable(),
otherLiveServicesCount: z.number().int().min(0),

// GET /crm/subscribers/queue-counts
SubscriberQueueCountsSchema = z.object({
  active: z.number().int(), suspended: z.number().int(),
  contactPending: z.number().int(), fiscalIncomplete: z.number().int(),
  withoutLiveServices: z.number().int(),
});

// MOD06 — PlanCatalogReadPort
abstract getPlansByIds(tenantId: string, schemaName: string, ids: string[]): Promise<Map<string, { id: string; name: string; active: boolean }>>;
```

Sin migraciones: todo se deriva de columnas existentes.

## 8. Criterios de aceptación

| CA | Criterio |
| --- | --- |
| CA-LO-01 | Un suscriptor con un contrato activo y uno suspendido muestra el activo como principal y «+1 servicio» |
| CA-LO-02 | Una página de 100 filas hace como máximo tres consultas principales (filas, conteo total y planes por lote); las lecturas de Party/Privacy se contabilizan y reportan aparte (RNF-LO-01) |
| CA-LO-03 | Un plan borrado del catálogo muestra «Plan no disponible» sin romper la fila |
| CA-LO-04 | Los cinco conteos coinciden con la lista filtrada por cada chip sobre los mismos datos, y `fiscalIncomplete` coincide con el servicio de completitud (test de paridad) |
| CA-LO-05 | Cambiar de chip actualiza la URL; recargar conserva el chip y la vista lateral abierta |
| CA-LO-06 | Suspender desde la vista lateral actualiza la fila y el conteo de «Suspendidos» sin recargar |
| CA-LO-07 | La tabla se recorre con flechas, `Enter` abre la vista lateral y `Esc` devuelve el foco a la fila; ninguna tecla sola actúa fuera de la tabla |
| CA-LO-08 | La vista lateral de un suscriptor restringido no muestra contacto ni servicios |
| CA-LO-09 | RF-LO-20 por HTTP con supertest |
| CA-LO-10 | Los seis sitios de H8 usan el hook y sus tests existentes siguen verdes; el hook tiene sus propios tests (frame cancelado al desmontar, no pisa un foco movido) |

## 9. Dependencias, riesgos y decisiones

### 9.1 Decisiones del CTO (G0) — aprobadas el 2026-10-19

**✅ Las seis decisiones se aprobaron con la recomendación de AI-EM-ARCH.** Las secciones §5 y §7 quedan como contrato congelado.

| # | Decisión | Opciones | Recomendación de AI-EM-ARCH | Motivo |
| --- | --- | --- | --- | --- |
| D-F6-1 | ¿Columna «Zona»? | **A:** no mostrar zona; mostrar la ciudad del servicio principal y registrar H5 como hallazgo para MOD06/tenant. **B:** calcular la zona por coordenadas del suscriptor contra los círculos de `coverage_zones`. **C:** agregar `coverage_zone_id` al contrato | **A** | No hay dato fiable: ninguna entidad guarda la zona y el chequeo de cobertura ignora las coordenadas (H5). B adivinaría con círculos que se solapan; C fija un modelo que corresponde al dominio de red (E8, nodos y OLT). Mostrar una zona inventada es peor que no mostrarla |
| D-F6-2 | Regla del servicio principal | RF-LO-02 vs. elegirlo a mano por suscriptor | **RF-LO-02** | Es determinista y no pide datos nuevos. Si un cliente PyME necesita otro principal, se resuelve con E5 o una fase posterior |
| D-F6-3 | Alcance de los conteos | Globales del tenant vs. dependientes de los filtros activos | **Globales** | Los chips responden «cuánto trabajo hay»; si dependieran de la búsqueda cambiarían con cada tecla y costarían una consulta por cambio |
| D-F6-4 | Vistas guardadas | Ahora, con persistencia por usuario, vs. diferirlas | **Diferir** | Necesitan persistencia por usuario que hoy no existe. Los chips y la URL compartible (filtros y chip en la URL) cubren el caso frecuente |
| D-F6-5 | Atajos de teclado | Solo con foco en la tabla vs. atajos globales (`/`, `j`, `k`) con interruptor en preferencias | **Solo con foco en la tabla** | Cumple WCAG 2.1.4 sin construir preferencias de usuario y no compite con `Ctrl/Cmd+K` |
| D-F6-6 | P3 de la Fase 05 dentro de esta fase | Incluir RF-LO-20 a RF-LO-22 vs. encargo aparte | **Incluir** | Son pequeños e independientes, y la vista lateral es consumidora directa de la guarda de foco: consolidarla antes evita una séptima copia |

### 9.2 Hallazgo para otro dueño

| Hallazgo | Dueño | Acción |
| --- | --- | --- |
| H5: `checkAvailability` ignora las coordenadas y devuelve todo como disponible | MOD06 Comercial / tenant | Registrar en su backlog; afecta la factibilidad de cobertura del expediente, no solo esta lista |

### 9.3 Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La subconsulta del principal degrada la lista | RNF-LO-01, RNF-LO-02 y CA-LO-02 |
| `fiscalIncomplete` en SQL diverge de la regla del servicio | Test de paridad (RF-LO-08) |
| Cambiar el puerto de MOD06 rompe su adaptador | El método es aditivo; `contract-drift-reviewer` y `boundary-reviewer` en la verificación |
| La consolidación del hook cambia el foco en pantallas ajenas | Sin cambio de comportamiento; los tests existentes de los seis sitios deben seguir verdes sin editarse |

## 10. Definición de terminado (DoD)

- RF-LO-01 a RF-LO-22 implementados; CA-LO-01 a CA-LO-10 verificados con conteo real.
- OpenAPI actualizado (`queue-counts` y filtros nuevos); sin deriva de contratos.
- Gates Before Merge en local; commit y push; **CI de `main` en verde** sobre el commit final; informe de cierre.
