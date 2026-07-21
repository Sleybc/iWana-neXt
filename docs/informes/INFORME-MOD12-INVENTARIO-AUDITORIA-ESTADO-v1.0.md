# Informe vivo — MOD12 Inventario / SCM — Auditoría de estado del módulo

**Version:** 1.5
**Fecha:** 2026-07-21
**Estado:** Vigente — índice único de estado de MOD12
**Modo activo:** Architect + EM (auditoría) + Product Architect (definición de fase siguiente)
**Autor:** AI-EM-ARCH
**Solicitado por:** CTO
**Clasificacion:** Confidencial — Uso interno
**PRD padre:** [PRD-MOD12-INVENTARIO-SCM-v1.0.md](../prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md)
**ADR base:** [ADR-048](../adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md)
**HLD:** [HLD-MOD12-INVENTARIO-SCM-v1.0.md](../hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md)

---

## 1. Resumen ejecutivo y declaración de arranque

El CTO solicitó auditar MOD12 Inventario para determinar qué falta construir. La auditoría se ejecutó **contra código, no contra informes previos**: cada estado de esta tabla tiene ruta y línea verificable.

Conclusión: **cinco submódulos con roadmap propio están cerrados** — **Compras**, **Existencias**, **Activos y comodato**, **Bajas con aprobación** (H3) y **Vida útil / StockLow / eventos** (H4, **recomendación técnica GO — G7 2026-07-21**).

> **Submódulo Vida útil / StockLow / eventos — CERRADO (recomendación técnica GO, G7 2026-07-21).**
> Informes: [`INFORME-MOD12-VIDA-UTIL-STOCKLOW-FASE-H4-v1.0.md`](INFORME-MOD12-VIDA-UTIL-STOCKLOW-FASE-H4-v1.0.md) · G5/G6/G7 en `INFORME-MOD12-VIDA-UTIL-STOCKLOW-FASE-H4-*`.
> **Hueco abierto de MOD12 — H5** (pestañas legacy Movimientos/Bajas). **H6** (informe cierre módulo) después.

## 2. Hallazgos

| # | Hallazgo | Evidencia en código | RF afectado | Severidad |
| --- | --- | --- | --- | --- |
| **H1** | ~~La ficha 360 del activo no existe.~~ **CERRADO (5A, 2026-07-21).** `GET /inventory/assets/:id` devuelve `SerializedAssetDetailRecord` compuesto. | `serialized-asset.service.ts` · informe 5A | RF-INV-20 | ~~Alta~~ **Cerrado** |
| **H2** | ~~El comodato no tiene registro propio.~~ **CERRADO (5B, 2026-07-21).** `AssetLoanService` escribe/lee `asset_loan_assignments`; bandeja portal; cierre en retorno/baja. | `asset-loan.service.ts` · informe 5B | RF-INV-12, RF-INV-13 | ~~Alta~~ **Cerrado** |
| **H3** | ~~Las bajas se aplican sin aprobación~~ **CERRADO (H3, 2026-07-21).** `WriteOffService` persiste documento; ledger solo en `approve`. | `write-off.service.ts` · migración 082 · informe H3 | RF-INV-19 | ~~Alta~~ **Cerrado** |
| **H4** | ~~La vida útil no calcula nada y `StockLow` no existe.~~ **CERRADO (H4, 2026-07-21).** Endpoint + panel alertas; `inventory.stock-low` + `inventory.asset-sold`; listener log. | publisher + `UsefulLifeAlertsPanel` · informe H4 | RF-INV-14, RF-INV-18, RF-INV-22 | ~~Media~~ **Cerrado** |
| **H5** | **Deuda UX en pestañas legacy.** `Movimientos` (venta / consumo interno / retorno) y `Bajas` conservan formularios con `<select>` nativos, fuera del patrón composer/PortalPanel adoptado por Compras, Salidas y Existencias. `InventoryClient.tsx` acumula 2.784 líneas y 11 pestañas de primer nivel. | `apps/portal/src/components/inventory/InventoryClient.tsx:2201-2500` | RNF (consistencia UI), RF-INV-14/15/16 | Media |
| **H6** | **No existe informe de cierre de MOD12 como módulo.** Hay cierres por fase de Compras y de Existencias; ninguno del módulo. ADR-016 (regla de completitud) exige cerrar N antes de abrir N+1. | `docs/informes/` | Gobierno | Media |
| **H7** | RF-INV-24 (evaluación de proveedores) y RF-INV-25 (IPAM/VLAN/QoS) siguen **fuera de alcance declarado** en el propio PRD (Fase 2). No son deuda: son alcance diferido. | PRD-MOD12-INVENTARIO-SCM §2 y §4 | RF-INV-24, RF-INV-25 | Informativo |

### Nota de control interno sobre H3 (histórica)

H3 era un **agujero de control interno** — la baja de inventario se ejecutaba sin documento ni aprobador. **Cerrado 2026-07-21** con `WriteOffService`, migración 082 y flujo portal solicitud→aprobación. Bajas pre-H3 permanecen solo en ledger (sin backfill).

## 3. Trazabilidad RF-INV-01…25 contra código

Leyenda: ✅ construido · 🟡 parcial · ❌ no construido · ⏸️ fuera de alcance declarado.

| RF | Requisito | Estado | Evidencia |
| --- | --- | --- | --- |
| RF-INV-01 | Item master físico | ✅ | `inventory-item.service.ts`; catálogo maestro Fase 01/02 |
| RF-INV-02 | Consumible / serializado / activo fijo | ✅ | `InventoryTrackingMode`; ramas en recepción y ajustes |
| RF-INV-03 | Solicitud de compra | ✅ | `purchasing.service.ts`; `POST /purchasing/requests` |
| RF-INV-04 | Cotizaciones por solicitud | ✅ | `rfq.service.ts`, `supplier_quote_lines` (mig. 069) |
| RF-INV-05 | Aprobación y OC con consecutivo | ✅ | `POST /purchasing/requests/:id/approve`, `POST /purchasing/orders` |
| RF-INV-06 | Recepción con faltantes/dañados y lotes/seriales | ✅ | `goods-receipt.service.ts:129,317` (`quantityShortage`, `quantityDamaged`) |
| RF-INV-07 | Ledger inmutable con idempotency key | ✅ | `stock-ledger.service.ts`; `uq_stock_movements_tenant_idempotency_key` |
| RF-INV-08 | Balance sin saldos negativos | ✅ | `stock-balance.service.ts` (`applyDeltaWithManager`), constraint 073 |
| RF-INV-09 | Tipos de bodega | ✅ | `StockLocationType`; `stock-location.service.ts` |
| RF-INV-10 | Transferencia con acta digital | ✅ | `handoffReference` / `handoffNotes` obligatorios (DT-INV-07 resuelto) |
| RF-INV-11 | Topes por técnico/cuadrilla | ✅ | validación de `maxCapacity` en destino móvil (DT-INV-08 resuelto) |
| RF-INV-12 | Instalación en cliente como comodato | ✅ | `asset-loan.service.ts` + hook OT `INSTALLED_AT_CUSTOMER` (5B) |
| RF-INV-13 | Comodato vinculado a suscriptor/contrato | ✅ | `asset_loan_assignments`; `GET /inventory/loans` (5B) |
| RF-INV-14 | Salida por venta con referencia comercial y evento | ✅ | Movimiento `SALE` + `inventory.asset-sold` (H4); consumidor Billing diferido |
| RF-INV-15 | Consumo interno con centro de costo | ✅ | `POST /inventory/movements/internal-consumption` |
| RF-INV-16 | Retiro de cliente y tránsito | ✅ | `POST /inventory/returns` con `IN_TRANSIT` / `IN_TESTING` |
| RF-INV-17 | Clasificación del retorno | ✅ | `RETURN_TARGET_STATUSES`; `stock-ledger.service.ts` (transición de activo) |
| RF-INV-18 | Vida útil operativa con alertas por umbral | ✅ | Endpoint + panel (H4); jobs/notificaciones fuera de MVP |
| RF-INV-19 | Baja con motivo, evidencia, actor y **aprobación** | ✅ | Documento + approve → ledger (H3) |
| RF-INV-20 | Ficha 360 del activo | ✅ | `SerializedAssetDetailRecord` (5A) |
| RF-INV-21 | Dashboard por bodega/técnico/cliente/categoría/estado | ✅ | `inventory-dashboard.service.ts` (segmentación por tipo de responsable; nombre legible diferido por boundary, decisión vigente en informe SCM F01 §8.6) |
| RF-INV-22 | Emitir `StockLow` bajo mínimo | ✅ | `inventory.stock-low` (`below-minimum` / `below-reorder`) + pull F2 |
| RF-INV-23 | Conteo físico y conciliación | ✅ | Existencias F3A: `cycle-count.service.ts`, mig. 071, ADR-054 |
| RF-INV-24 | Evaluación de proveedores | ⏸️ | Fase 2 del PRD padre |
| RF-INV-25 | IPAM / VLAN / QoS | ⏸️ | Fase 2 del PRD padre |

**Cobertura MVP:** 22 de 22 requisitos MVP construidos (100 %) en alcance declarado. Consumidor Billing/ERP y notificaciones push quedan fuera de H4 (publisher listo).

## 4. Submódulos cerrados (índice)

| Submódulo | Alcance | Cierre |
| --- | --- | --- |
| Catálogo maestro de artículos | Ítems, categorías, prefijos, SKU compuesto | `INFORME-MOD12-CATALOGO-MAESTRO-ARTICULOS-FASE-01-v1.0.md`, `...-CATEGORIAS-FASE-02-v1.0.md`; ADR-INV-SKU-COMPUESTO |
| Proveedores | Alta de proveedor vía puerto de Parties, perfiles, estados | `INFORME-MOD12-PROVEEDORES-ALTA-FASE-05-v1.0.md`; ADR-052 |
| Compras | Solicitud → RFQ → cotización por línea → adjudicación multi-proveedor → OC → recepciones multi-OC; compra de mostrador; PDF de RFQ con Firma iWana | ~24 informes `INFORME-MOD12-COMPRAS-*`; ADR-050, ADR-051, ADR-053 |
| Bodegas y salidas | CRUD de ubicaciones, topes de custodia móvil, `StockIssue` con despacho idempotente | `INFORME-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md` §8 y §10 |
| Existencias | F1 kardex + ajustes · F2 reposición + valor · F3A conteo físico · F3B reservas efectivas · F4 costeo promedio móvil | `INFORME-MOD12-INVENTARIO-EXISTENCIAS-DEFINICION-v1.0.md`; ADR-054, ADR-055, ADR-059; G7 GO CTO 2026-07-20 |
| Activos y comodato | F5A ficha 360 · F5B comodato transaccional + bandeja | `INFORME-MOD12-ACTIVOS-FICHA-360-FASE-05A-v1.0.md`, `INFORME-MOD12-COMODATO-FASE-05B-v1.0.md`, `INFORME-MOD12-ACTIVOS-COMODATO-FASE-05-CIERRE-G7-v1.0.md`; sin ADR nuevo |
| Bajas con aprobación | H3 documento + approve/reject + portal | `INFORME-MOD12-BAJAS-APROBACION-FASE-H3-v1.0.md`, `INFORME-MOD12-BAJAS-APROBACION-FASE-H3-CIERRE-G7-v1.0.md`; migración 082 |
| Vida útil / StockLow / eventos | H4 alertas + publisher + panel | `INFORME-MOD12-VIDA-UTIL-STOCKLOW-FASE-H4-v1.0.md`, `INFORME-MOD12-VIDA-UTIL-STOCKLOW-FASE-H4-CIERRE-G7-v1.0.md` |

## 5. Backlog priorizado

| Orden | Trabajo | Hallazgos | Justificación de la prioridad |
| --- | --- | --- | --- |
| ~~**1**~~ | ~~Fase 5A + 5B~~ | ~~H1, H2~~ | **Cerrado 2026-07-21** |
| ~~**1**~~ | ~~**Bajas con aprobación (H3)**~~ | ~~H3~~ | **Cerrado 2026-07-21** |
| ~~**1**~~ | ~~**Vida útil + StockLow + eventos (H4)**~~ | ~~H4~~ | **Cerrado 2026-07-21** |
| **1** | Deuda UX de pestañas legacy | H5 | **Siguiente fase MOD12** |
| 2 | Informe de cierre de MOD12 | H6 | Tras H5 o según priorización CTO |
| — | Evaluación de proveedores, IPAM | H7 | Fase 2 del PRD padre; sin acción hasta repriorización del CTO. |

## 6. Impacto declarado (perfil AI-EM-ARCH §8)

- **Multi-tenant:** sin cambio de estrategia. Todo el trabajo pendiente vive en schema tenant y se resuelve con los helpers vigentes (`runInTenantSchema`, `SET LOCAL search_path` por transacción). Las rutas nuevas exigen prueba de aislamiento (patrón `supplier-profile.isolation.spec.ts`).
- **Seguridad:** H3 cerrado — bajas con aprobación de segundo usuario. El resto no altera la superficie de autenticación ni el RBAC vigente.
- **Privacidad (Ley 1581):** el comodato referencia al suscriptor por UUID opaco. MOD12 **no** resuelve ni almacena nombre, documento ni dirección del cliente: esa resolución es de CRM. La bandeja de comodatos muestra referencia y etiqueta mínima. Sin PII en logs ni fixtures.
- **Escala:** la ficha 360 compone varias consultas por activo. A escala objetivo (miles de tenants, cientos de miles de activos) el riesgo es el timeline del ledger por activo: exige paginación de servidor y apoyo en índices existentes; se fija en el spec de diseño.
- **Regulación:** sin impacto regulatorio directo. La baja de inventario tiene efecto contable/fiscal potencial (DIAN) que **no** se declara cubierto — requiere verificación con fuente oficial cuando se aborde H3.

## 7. Artefactos emitidos por esta auditoría

| Artefacto | Ruta | Estado |
| --- | --- | --- |
| Este informe (índice único de MOD12) | `docs/informes/INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md` | Vigente |
| PRD del submódulo Activos y comodato | `docs/prds/PRD-MOD12-ACTIVOS-COMODATO-v1.0.md` | MVP cerrado — G7 GO recomendado |
| Prompt Fase 5A | `docs/prompts/PROMPT-MOD12-ACTIVOS-FICHA-360-FASE-05A-v1.0.md` | **CERRADO** |
| Prompt Fase 5B | `docs/prompts/PROMPT-MOD12-COMODATO-FASE-05B-v1.0.md` | **CERRADO** |
| PRD H3 — Bajas con aprobación | `docs/prds/PRD-MOD12-BAJAS-APROBACION-v1.0.md` | MVP cerrado — G7 GO recomendado |
| Prompt H3 | `docs/prompts/PROMPT-MOD12-BAJAS-APROBACION-FASE-H3-v1.0.md` | **CERRADO** |
| Spec H3 | `docs/specs/2026-07-21-mod12-bajas-aprobacion-fase-h3-design.md` | Congelada |
| PRD H4 — Vida útil / StockLow / eventos | `docs/prds/PRD-MOD12-VIDA-UTIL-STOCKLOW-v1.0.md` | MVP cerrado — G7 GO recomendado |
| Prompt H4 | `docs/prompts/PROMPT-MOD12-VIDA-UTIL-STOCKLOW-FASE-H4-v1.0.md` | **CERRADO** |
| Spec H4 | `docs/specs/2026-07-21-mod12-vida-util-stocklow-fase-h4-design.md` | Congelada — aprobado CTO |

## 8. Historial

| Fecha | Cambio |
| --- | --- |
| 2026-07-21 | v1.0 — auditoría de estado de MOD12 contra código; hallazgos H1–H7; mapa RF-INV-01…25; backlog priorizado; decisión del CTO: siguiente fase = Ficha 360 + comodato. Emitidos PRD, spec y prompts 5A/5B. |
| 2026-07-21 | **Addendum** — Fases 5A + 5B ejecutadas; H1/H2 cerrados; RF-INV-12/13/20 ✅; G5/G6 GO; recomendación técnica GO G7; informe maestro actualizado. |
| 2026-07-21 | **v1.1** — Priorización explícita post-cierre Activos/comodato: **H3** = único Alto abierto y siguiente fase (control interno, no funcionalidad); **H4** y **H5** en orden posterior. Remediación B1–B3 (tests write-off, RF-ACT-09, G7 v1.4). |
| 2026-07-21 | **v1.2** — H3 ejecutado; RF-INV-19 ✅; H3 cerrado; siguiente hueco **H4**. |
| 2026-07-21 | **v1.3** — G7 GO recomendado H3; migración 082 aplicada; PRD/prompt H3 cerrados; cobertura MVP 95 %. |
| 2026-07-21 | **v1.4** — Emitidos PRD/spec/prompt H4 (umbrales C, vida útil A, eventos B); fase **EJECUTABLE**. |
| 2026-07-21 | **v1.5** — H4 G5+G6+G7 GO recomendado; RF-INV-14/18/22 ✅; cobertura MVP 100 % alcance; siguiente **H5**. |
