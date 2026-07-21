# SPEC — MOD12 Activos y comodato · Ficha 360 y ciclo de vida del comodato — Fase 05

**Versión:** 1.0
**Estado:** Diseño emitido — G4 ejecutable para 5A al aprobar el PRD (5B bloqueada por ADR-016)
**Fecha:** 2026-07-21
**Módulo:** MOD12 Inventario / SCM — submódulo Activos y comodato
**Autor:** AI-EM-ARCH
**PRD:** [PRD-MOD12-ACTIVOS-COMODATO-v1.0.md](../prds/PRD-MOD12-ACTIVOS-COMODATO-v1.0.md)
**Auditoría de origen:** [INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md](../informes/INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md) (H1, H2)
**ADR:** ninguno requerido — ver D-F5-11
**Prompts:** [5A](../prompts/PROMPT-MOD12-ACTIVOS-FICHA-360-FASE-05A-v1.0.md) (**ejecutable**) · [5B](../prompts/PROMPT-MOD12-COMODATO-FASE-05B-v1.0.md) (no ejecutable)

## 1. Problema

Toda la materia prima de la trazabilidad de un activo está escrita y ninguna es consultable por activo: los eventos de ciclo de vida no tienen consumidor, el kardex no se puede filtrar por activo, el origen de compra vive disperso entre OC y recepción, y la tabla de comodatos está vacía porque nadie la escribe. `GET /inventory/assets/:id` devuelve una fila cruda.

## 2. Objetivo

Que un usuario de soporte abra un equipo por serial y vea, en una pantalla: qué es, dónde está, quién lo tiene, qué le ha pasado, de qué compra vino y a qué cliente está entregado.

## 3. Decisiones de diseño (D-F5)

| ID | Decisión | Justificación |
| --- | --- | --- |
| **D-F5-1** | **Carga compuesta en una sola llamada.** `GET /inventory/assets/:id` devuelve las cinco secciones en una respuesta, no cinco endpoints. | La ficha se abre completa; partirla multiplica round-trips y estados de carga en el drawer. Las consultas están todas acotadas por un activo. |
| **D-F5-2** | **Timeline y movimientos paginados desde la primera versión**, con `limit` por defecto 20 y tope 100; parámetros `lifecyclePage/lifecycleLimit` y `movementsPage/movementsLimit` en el query. | Un CPE con años de operación acumula cientos de eventos. Paginar después obliga a cambiar el shape otra vez. |
| **D-F5-3** | **El ciclo de vida y los movimientos son secciones paralelas, sin enlace entre sí.** | `asset_lifecycle_events` no guarda `stock_movement_id`. Correlacionar por timestamp sería adivinar. Se declara la limitación; la columna se propone junto con la próxima migración del módulo (ver PRD §9). |
| **D-F5-4** | **Filtro `serializedAssetId` en el kardex** con el mismo patrón `EXISTS (SELECT 1 FROM stock_movement_lines …)` ya usado para `itemId` y `locationId` en `StockMovementQueryService.list`. | Consistencia con lo vigente; reutiliza el enriquecimiento de líneas ya implementado. |
| **D-F5-5** | **La sección de movimientos de la ficha reutiliza `StockMovementQueryService.list`** con el filtro nuevo, no una consulta propia. | Un solo lugar donde vive la forma del kardex; evita divergencia de shape. |
| **D-F5-6** | **Origen de compra resuelto dentro de MOD12.** Se parte de `serialized_assets.purchase_order_ref` y de la línea de recepción que creó el activo; el proveedor se muestra con `supplier_profiles` (perfil propio del módulo) por `partyRefId` + `displayName`. Si no se puede resolver, la sección devuelve `null` y la UI muestra «Sin origen de compra registrado». | El proveedor ya tiene perfil dentro de MOD12; no hace falta salir a Parties. Nunca inventar el dato. |
| **D-F5-7** | **Vida útil como estado derivado, calculado en el servidor**: `vigente` si quedan más de 3 meses, `por-vencer` si quedan 3 o menos, `vencida` si `monthsRemaining ≤ 0`, `sin-dato` si falta `usefulLifeMonths` o `purchaseDate`. La garantía se muestra como fecha con su propio estado vencida/vigente. | Que el umbral viva en el servidor evita dos verdades. **No genera alertas ni jobs**: eso es H4. |
| **D-F5-8** | **Compatibilidad de shape:** los campos actuales de `SerializedAsset` se conservan en la raíz del nuevo registro; lo nuevo se agrega como secciones anidadas. | El drawer del portal ya consume el endpoint; así el cambio es aditivo y los tests existentes siguen siendo válidos. |
| **D-F5-9** | **Sin resolución de identidades cross-module.** Suscriptor, contrato, técnico y OT se muestran como referencia (UUID abreviado) con su etiqueta de tipo. La UI dice «Suscriptor · a1b2…c3d4», nunca un nombre. | Boundary CRM/WFM/Tasks; mismo criterio ya decidido para RF-INV-21. Además evita PII (Ley 1581). |
| **D-F5-10** | **La sección Comodato se construye en 5A, vacía.** El contrato `AssetLoanRecord` y el estado vacío se entregan en 5A; 5B solo llena la tabla. | Evita rehacer el drawer dos veces y congela el contrato antes de escribir datos. |
| **D-F5-11** | **Sin ADR.** Ninguna fase crea bounded context, entidad, migración ni patrón. Si 5B necesita columna nueva (p. ej. fecha esperada de recuperación), **se detiene y se escala**. | Precedente Existencias F1/F2 (sin ADR) vs. F3A/F3B/F4 (con ADR por entidad/invariante/columna). |
| **D-F5-12** | **(5B) El comodato se escribe en la misma transacción del movimiento**, dentro de `recordMovementWithManager`, tomando `stockMovementId` como clave de idempotencia. Nunca en un job posterior ni en un listener de evento. | RNF-INV-03/04: un comodato sin movimiento (o al revés) es corrupción de datos que nadie detecta. |
| **D-F5-13** | **(5B) Ciclo del comodato:** se abre en `EXECUTION_ORDER` con `finalDisposition = INSTALLED_AT_CUSTOMER`; se cierra (`removed_at = now`) en `RETURN` y en `WRITE_OFF` del mismo activo, buscando el comodato abierto (`removed_at IS NULL`). Si no hay comodato abierto, el retorno **no falla**: sigue su curso sin cerrar nada. | El retorno es una operación de bodega; bloquearlo por un dato de trazabilidad ausente sería peor que la trazabilidad incompleta. Los activos instalados antes de 5B no tienen comodato (limitación declarada). |
| **D-F5-14** | **(5B) Sin endpoints de escritura de comodato.** Solo `GET /inventory/loans`. | El comodato es efecto, no acción: `CUSTOMER_SITE` no es destino manual (regla vigente, informe SCM F01 §10.3). |

## 4. Flujo UX (5A)

Superficie: `SerializedAssetDetailDrawer` en la pestaña **Activos**, reconstruido por secciones. Sin pantalla nueva, sin pestaña nueva.

1. **Cabecera** — ítem (SKU · nombre), serial, MAC, asset tag, estado del activo con su etiqueta en español.
2. **Dónde y quién** — ubicación actual (código · nombre · tipo) y custodio (tipo de responsable + referencia). Cuando está en cliente: «En sitio de cliente · Suscriptor a1b2…c3d4».
3. **Origen de compra** — OC, fecha de compra, proveedor, costo de recepción. Estado vacío: «Sin origen de compra registrado».
4. **Vida útil y garantía** — meses transcurridos / restantes con su estado (chip), fecha de garantía. Estado vacío: «Sin datos de vida útil».
5. **Ciclo de vida** — timeline descendente: etiqueta del evento, transición de estado, ubicación, fecha, actor. Paginado con «Ver más».
6. **Movimientos** — filas del kardex que tocan el activo (número, origen legible, fecha, cantidad con signo, costo unitario) + enlace «Ver en kardex» que abre la pestaña Existencias filtrada por el activo.
7. **Comodatos** — tabla vacía en 5A: «Sin comodatos registrados».

Todo el texto visible en español, sentence case, sin enums crudos; etiquetas nuevas en `inventory-labels.ts` (ya existe `getSerializedAssetStatusLabel` como patrón).

## 5. Contrato

Congelado en el PRD §7. Resumen: `GET /inventory/assets/:id` → `SerializedAssetDetailRecord` (campos actuales en la raíz + `item`, `currentLocation`, `purchaseOrigin`, `usefulLife`, `lifecycle`, `movements`, `loans`); `GET /inventory/movements` gana el filtro opcional `serializedAssetId`.

## 6. Impacto y riesgos

| Eje | Declaración |
| --- | --- |
| Multi-tenant | Sin cambio: `runInTenantSchema` + `tenant_id` en todas las consultas. Prueba de aislamiento obligatoria sobre `GET /assets/:id` con el nuevo shape. |
| Seguridad | Solo lectura; RBAC sin cambios (ADMIN, NOC, SUPPORT). |
| Privacidad | Ninguna sección resuelve identidades; sin PII en respuesta, logs ni fixtures. |
| Escala | Cinco consultas por apertura, todas por activo y con índices existentes (`idx_asset_lifecycle_events_asset`, `idx_serialized_assets_*`, `idx_stock_movements_tenant_created_at`). Paginación desde el día uno (D-F5-2). |
| Regulación | Sin impacto. |

**Riesgo principal:** que la ficha se convierta en un endpoint pesado por acumulación de secciones futuras. Mitigación: D-F5-2 (paginación) y la regla de que toda sección nueva llegue paginada o acotada.

## 7. Criterios de aceptación

Los del PRD §8 (CA-5A-01…08). El criterio de stop de la fase: **si el ejecutor concluye que hace falta una migración**, se detiene y escala a AI-EM-ARCH — la fase está definida como aditiva y sin DDL.
