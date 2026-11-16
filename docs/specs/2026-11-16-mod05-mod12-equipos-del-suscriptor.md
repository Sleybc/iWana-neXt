# Spec — MOD05 Suscriptores · Equipos del suscriptor (fase 1)

**Versión:** 1.0
**Estado:** G0 aprobado por el usuario el 2026-11-16 («Apruebo el G0»)
**Fecha:** 2026-11-16
**Emisor:** AI-EM-ARCH (modo Product Architect + Orchestrator)
**Módulos:** MOD05 Suscriptores (portal, ficha) · MOD12 Inventario (lectura)
**Base:** [PRD-MOD12-ACTIVOS-COMODATO-v1.0](../prds/PRD-MOD12-ACTIVOS-COMODATO-v1.0.md) (5A y 5B cerradas) · [ficha estilo UISP](2026-11-10-mod05-ficha-suscriptor-estilo-uisp-ux.md) · [consumo de inventario por OT](2026-10-06-mod11-mod12-consumo-inventario-ot-design.md)
**Consultas:** `sr-backend` (factibilidad), `prod-ux` (flujo y estados), `ds-owner` (contrato de componente), 2026-11-16

---

## 0. Problema

Soporte, técnicos y auditoría no pueden ver en la ficha del suscriptor qué equipos tiene el cliente, qué materiales se le instalaron ni qué les pasó a esos equipos. MOD12 ya guarda todo eso, pero no tiene una lectura por suscriptor:

- `GET /inventory/loans?subscriberRefId=` devuelve los comodatos, pero solo con IDs, sin serial, MAC ni modelo (`asset-loan.service.ts:107-118`).
- Los materiales se guardan por OT. Solo los que tienen destino «instalado en cliente» quedan ligados al suscriptor, a través de su ubicación `CUSTOMER_SITE` (`customer-site-location.resolver.ts:26-33`).
- `asset_lifecycle_events` no guarda la OT (`047:606-622`). Por eso un reemplazo no se distingue de un retiro seguido de una instalación.
- La ficha solo muestra, en Servicios, el «Equipo instalado» que se copió al aprovisionar (`SubscriberTechnicalServiceSection.tsx:153`). Esa copia no cambia si se reemplaza el equipo.

## 1. Decisiones

| # | Decisión | Origen |
|---|---|---|
| D1 | Una **tarjeta «Equipos instalados»** en la Vista general y una **pestaña «Equipos»**, después de Servicios | Usuario, 2026-11-16 |
| D2 | Fase 1 **solo de lectura**. Desde la ficha no se registran reemplazos, retiros ni comodatos: el comodato lo produce la OT (D-F5-14) | Recomendación aceptada |
| D3 | Materiales: solo los de destino `INSTALLED_AT_CUSTOMER`. Incluir el consumo interno obligaría a ampliar D12 y ADR-067 | Recomendación aceptada |
| D4 | Permiso: `INVENTORY_STOCK_READ`, sin cambios de RBAC. La pestaña y la tarjeta solo se muestran con ese permiso, igual que Facturación con `BILLING_INVOICES_READ` | Recomendación aceptada |
| D5 | Fuente de verdad del equipo físico: **el comodato de MOD12**. El «Equipo instalado» de aprovisionamiento sigue siendo la configuración del servicio; no se fusionan | AI-EM-ARCH |
| D6 | Corregir el PRD de comodato: `/loans` también admite TECHNICIAN y AUDITOR, como ya dice la matriz (`access-control.constants.ts:946,991`). El código no cambia | AI-EM-ARCH |

## 2. Diseño

### 2.1 Lectura de MOD12

Endpoint nuevo `GET /inventory/subscribers/:subscriberRefId/equipment`, propiedad de MOD12. CRM no lee tablas de inventario. El tenant sale de `TenantContext` y el permiso es `INVENTORY_STOCK_READ`.

Respuesta:

- `equipment[]`: un elemento por cada comodato del suscriptor, abierto o cerrado. Campos: `loanId`, `assetId`, `itemName`, `model`, `serialNumber`, `macAddress`, `status` (`SerializedAssetStatus`), `installedAt`, `removedAt | null`, `executionOrderRefId | null`, `contractRefId | null`, y los estados derivados de garantía y vida útil que ya usa la ficha 360.
- `materials`, paginado: líneas positivas en la ubicación `CUSTOMER_SITE` del suscriptor que no correspondan a un activo serializado. Se excluyen los movimientos reversados y los propios reversos: un material devuelto por reverso no cuenta como instalado (AI-EM-ARCH, consulta de A2, 2026-11-16). Campos: `movementId`, `movementNumber`, `occurredAt`, `itemName`, `quantity`, `unitOfMeasure`, `executionOrderRefId | null`.
- `history`, paginado y del más reciente al más antiguo: eventos de `asset_lifecycle_events` de esos activos. Solo entran los que caen **dentro del periodo de cada comodato**, de `installed_at` a `removed_at`, incluido el evento de cierre. Así no aparece la historia del equipo con otro cliente ni en bodega. Campos: `id`, `assetId`, `serialNumber`, `eventType`, `occurredAt`. **No incluye `notes`**, porque es texto libre y puede llevar datos personales.

El contrato es aditivo: tipos en `@iwana/shared` y OpenAPI. Se congela antes de que empiece el portal (plan, bloque A1). Si el plan de consulta lo exige, va una migración tenant de índices en `asset_loan_assignments (tenant_id, subscriber_ref_id)`, con la siguiente numeración libre. No hay tablas ni columnas nuevas, ni ADR.

### 2.2 Portal

- **Pestaña «Equipos»** (después de Servicios):
  - **Equipos instalados**: tabla con comodatos abiertos. Columnas: Equipo (modelo), Serial, MAC, Estado, Desde y menú ⋯. El interruptor «Mostrar retirados» añade los cerrados, con su fecha de retiro.
  - **Materiales usados**: tabla con Fecha, Material, Cantidad y OT, paginada.
  - **Historial de equipos**: línea de tiempo con filtro por equipo y «Ver más».
- **Tarjeta «Equipos instalados»** en la Vista general, columna izquierda, debajo de Servicios: hasta 3 equipos abiertos y el enlace «Ver todo», que abre la pestaña.
- **Menú ⋯ por equipo**:
  - «Ver ficha del equipo» abre el `SerializedAssetDetailDrawer` existente, sin componente nuevo.
  - «Ver OT» se muestra si hay `executionOrderRefId` y el usuario tiene `OPERATIONS_EXECUTION_ORDERS_READ`.
  - Un comodato cerrado se muestra como «Retirado», en gris, y no con el estado actual del equipo, para no revelar el de otro cliente.
  - Los materiales se paginan con «Cargar más».
  - «Copiar serial» y «Copiar MAC».
- **Etiquetas:** se reutilizan las de `apps/portal/src/components/inventory/inventory-labels.ts`. Ahí mismo se agrega la función que asigna una variante de `Badge` a cada estado.

### 2.3 Estados

| Estado | Qué se ve |
|---|---|
| Vacío | «Este suscriptor no tiene equipos registrados». No hay botón para crear: el alta nace en la OT |
| Filtro sin resultados | «Ningún evento coincide con el filtro» y «Quitar filtro» |
| Cargando | Skeleton con la rejilla de la tabla |
| Error | `PortalAlert` compacto con «Reintentar». La cabecera se mantiene y el foco vuelve al título |
| Sin permiso | No aparecen ni la pestaña ni la tarjeta (D4) |
| Titular anonimizado | Equipos e historial visibles, sin acciones que lleven a datos del titular |

Badge por estado: en comodato → `info`; retirado o devuelto → `neutral`; en reparación → `warning`; perdido o dado de baja → `error`. No se crean tokens nuevos.

### 2.4 Vocabulario

Se usa: «Equipos», «Equipos instalados», «Materiales usados», «Historial de equipos», «En comodato», «Retirado», «Instalación», «Retorno» (la etiqueta compartida de `inventory-labels.ts` para el evento `RETURNED`, sin cambio local), «Reparación», «Ver ficha del equipo», «Ver OT».

Nunca aparecen en pantalla: «activo serializado», «loan», «kardex» ni nombres de enums.

## 3. Contrato de componente `PortalTimeline`

Propuesto por `ds-owner`, que lo congela en el bloque DS. Ya hay cuatro timelines hechas a mano: `SerializedAssetDetailDrawer.tsx:373`, `TaskTimeline.tsx`, `ExpedienteTimelinePanel.tsx:491` y `SubscriberActivityCard.tsx:325`. No se crea una quinta.

- **Ubicación:** `apps/portal/src/components/shared/portal-ui.tsx`, no `@iwana/ui`, porque solo la usa el portal.
- **Props:** `label` (`aria-label` del `<ol>`) e `items[]` con `{ id, title, at, detail?, meta?, action?, tone?: 'current' | 'past' }`. Además `busy`, `error` + `onRetry`, `hasMore` + `onLoadMore` + `loadingMore`, y `empty`.
- **Anatomía:** línea vertical y nodo anillado. Nodo actual en `bg-iwana-secondary`, pasados en `bg-iwana-primary/20`. Fecha en `<time>` con `font-mono`.
- **Estados:** cargando (3 filas de skeleton), vacío, error con reintento y foco al título, y «Ver más» ocupado mientras carga. El foco solo se pinta en `action`, con `interactiveFocusClassName`.
- **Fuera de la primitive:** las etiquetas de los tipos de evento. Las pone quien la usa.

Las cuatro timelines existentes no migran en esta fase: quedan como deuda de consolidación de `fe-platform`.

### 3.1 Contrato congelado v1.1 (`ds-owner`, 2026-11-16, carril rápido)

Sustituye al borrador anterior. Cambios frente a él, todos aditivos: `at` en ISO con `formatAt`; `headingRef` para el foco en error; error con lista ya cargada; «Ver más» reutiliza `PortalTablePagination`; pares de modo oscuro; `aria-current`. Registro en Firma §9.

```ts
export interface PortalTimelineItem {
  id: string;
  title: string;                 // etiqueta ya traducida por quien la usa
  at: string;                    // ISO 8601; va a <time dateTime>
  detail?: ReactNode | undefined;
  meta?: ReactNode | undefined;
  action?: ReactNode | undefined; // Button size="sm" className="min-h-11", o enlace con interactiveFocusClassName
  tone?: 'current' | 'past' | undefined; // por defecto 'past'
}
export interface PortalTimelineProps {
  label: string;                 // aria-label del <ol>
  items: readonly PortalTimelineItem[];
  empty: ReactNode;              // PortalEmptyState embedded; vacío y filtro sin resultados los decide quien la usa
  busy?: boolean | undefined;
  error?: string | null | undefined; // título del PortalAlert
  onRetry?: (() => void) | undefined;
  headingRef?: RefObject<HTMLElement | null> | undefined; // título de la sección, con tabIndex={-1}
  hasMore?: boolean | undefined;
  onLoadMore?: (() => void) | undefined;
  loadingMore?: boolean | undefined;
  formatAt?: ((iso: string) => string) | undefined; // por defecto es-CO, dateStyle y timeStyle 'short'
  className?: string | undefined;
}
```

- **Anatomía:** `<ol aria-label={label}>` con línea vertical `before:bg-gradient-to-b before:from-gray-200 before:to-transparent dark:before:from-dark-border`. Cada `<li>`: nodo `aria-hidden` (`h-3 w-3 rounded-full border-4 border-white ring-1 ring-gray-100 dark:border-dark-surface-2 dark:ring-dark-border`), `current` en `bg-iwana-secondary`, `past` en `bg-iwana-primary/20 dark:bg-iwana-primary-400/20`. Fila título (`text-sm font-medium text-gray-900 dark:text-white`) y `<time dateTime={at}>` (`font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400`). Debajo `detail` y `meta` (`text-sm text-gray-600 dark:text-gray-300`) y `action`.
- **Estados:**
  - Cargando, `busy` sin items: 3 filas de skeleton con la anatomía (nodo y dos líneas `PortalSkeletonBlock`), `role="status"` y «Cargando…» `sr-only`.
  - Recargando, `busy` con items: la lista se mantiene con `aria-busy` y `portalDataBusyRegionClassName`.
  - Vacío: se pinta `empty` si no hay items, ni `busy`, ni `error`.
  - Error sin items: `PortalAlert variant="error" density="compact"` con «Reintentar» (`Button variant="secondary" size="sm" className="min-h-11"`). Al pulsarlo se llama `onRetry` y el foco va a `headingRef`.
  - Error con items: la lista se mantiene y el mismo aviso compacto va entre la lista y «Ver más».
  - Ver más: `PortalTablePagination` con `loadMoreLabel="Ver más"`, `loading={loadingMore}` y `hasMore`. Al terminar la carga, el foco vuelve al botón; si ya no hay más, va al `<ol>` (`tabIndex={-1}`, sin anillo).
  - Hover, active, disabled y success no aplican a la fila, que es de solo lectura. Los de `action` son los de `Button`.
- **Accesibilidad:** `tone="current"` añade `aria-current="step"` al `<li>`. El color del nodo es redundante y no lleva información sola (WCAG 1.4.1). El nodo y la línea son decorativos: el lima sobre blanco da 2,0:1 y no se usa como texto. Solo `action` y «Ver más» reciben foco, con objetivo de al menos 44 px. Los textos cumplen AA en los dos modos: `gray-500` sobre blanco 4,8:1 y `gray-400` sobre `dark-surface-2` 6,2:1.
- **Tokens:** no se crea ninguno. Todos existen en `globals.css`: `--color-iwana-secondary` (l.44), `--color-iwana-primary` (l.29), `--color-iwana-primary-400` (l.34), `--font-mono` (l.195) y `--color-dark-*` (l.127-134).
- **Fuera de v1.1 (aditivo después):** marcador con icono por tipo y paginación numerada, que usa `ExpedienteTimelinePanel`. Ese panel puede componer `PortalTablePager` debajo con `hasMore` omitido.

## 4. Seguridad y datos

- **Aislamiento por tenant:** las consultas filtran por `tenant_id`, que viene del contexto. Una prueba de integración demuestra que el suscriptor de otro tenant devuelve una lista vacía.
- **Datos personales:** MOD12 no resuelve el nombre del titular ni devuelve `notes`. El serial y la MAC no identifican al titular por sí solos, pero sí ligados a `subscriberRefId`.
- **Bloqueo (DATOS_BLOQUEADOS):** `sec-eng` dictamina si este endpoint debe respetarlo. Hoy solo CRM y Billing lo hacen. Si el dictamen es afirmativo, se cierra en esta fase usando el puerto que ya usan las proyecciones.

## 5. Criterios de aceptación

| # | Criterio |
|---|---|
| CA-1 | Con `INVENTORY_STOCK_READ`, la Vista general muestra hasta 3 equipos instalados sin cambiar de pestaña |
| CA-2 | Sin el permiso no aparecen ni la tarjeta ni la pestaña, y las demás pestañas no cambian |
| CA-3 | La pestaña muestra equipos, materiales e historial a partir de una sola llamada al endpoint, y las páginas siguientes se piden aparte |
| CA-4 | El historial no incluye eventos de un equipo fuera del periodo de comodato del suscriptor (prueba de integración con un equipo que pasó por dos clientes) |
| CA-5 | El suscriptor de otro tenant no ve nada (prueba de integración) |
| CA-6 | «Ver ficha del equipo» abre el drawer existente de MOD12. Es la vista de Inventario, con su historia completa, y la protege el mismo permiso `INVENTORY_STOCK_READ`, así que no amplía el acceso. Con el titular anonimizado la acción no se ofrece, porque el drawer pinta `notes`, texto libre que podría reidentificarlo (condición C1 de `sec-eng`). El recorte de R1 rige para la pestaña, no para ese drawer (AI-EM-ARCH, consulta de F2, 2026-11-16) |
| CA-7 | Los estados de §2.3 están cubiertos por pruebas de componente; «vacío» y «filtro sin resultados» se distinguen |
| CA-8 | WCAG 2.2 AA: tabla con encabezados, menú ⋯ operable con teclado, objetivos de 44 px; `audit-ui.mjs` sin hallazgos |
| CA-9 | Ninguna pestaña, acción ni dato de la ficha desaparece (CA-1 de la spec de la ficha estilo UISP) |

## 6. Fase 2 (fuera de alcance; cada punto necesita su G0)

- Reemplazo como evento propio, con motivo de cierre del comodato y la OT en el evento. Exige migración y ADR.
- «Propiedad del cliente»: los equipos vendidos hoy no quedan ligados al suscriptor (`stock-ledger.service.ts:1231-1268`).
- «Pendiente de retiro» para cobranza (RF-ACT-13: columna nueva y ADR).
- Vínculo de ticket con equipo, para crear un ticket sobre un equipo y verlo en la ficha.
- Aviso cuando el serial de aprovisionamiento no coincide con el comodato.
- Patrón de fallas por modelo o lote, para NOC.
- Restringir a los técnicos a los suscriptores de sus OT (cambio de RBAC).

## 7. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Presentar en la pestaña, como propia del suscriptor, la historia del equipo con otro cliente | Recorte por periodo de comodato (CA-4). El drawer de Inventario queda fuera de este recorte (CA-6) |
| R2 | Consultas lentas en tenants grandes | `EXPLAIN` con el suscriptor de más comodatos; índice solo si hace falta |
| R3 | Una quinta timeline hecha a mano | Bloque DS antes de F; `audit-ui.mjs` |
| R4 | Dos fuentes distintas para el equipo | D5: la pestaña nombra el comodato; aprovisionamiento conserva su rótulo |
| R5 | Fuga por bloqueo de datos | Dictamen de `sec-eng` (§4) |
