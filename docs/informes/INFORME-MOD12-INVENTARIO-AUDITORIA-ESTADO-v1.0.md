# Informe vivo — MOD12 Inventario / SCM — Auditoría de estado del módulo

**Version:** 1.2
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

Conclusión: **tres submódulos con roadmap propio están cerrados** — **Compras**, **Existencias** (F1–F4, G7 GO CTO 2026-07-20) y **Activos y comodato** (Fases 5A + 5B, **recomendación técnica GO — auditoría CTO independiente 2026-07-21**). El sistema **ya responde** las cuatro preguntas del PRD padre §1 vía ficha 360 y bandeja de comodatos.

> **Submódulo Activos y comodato — CERRADO (recomendación técnica GO, auditoría CTO 2026-07-21).**
> Informes: [`INFORME-MOD12-ACTIVOS-FICHA-360-FASE-05A-v1.0.md`](INFORME-MOD12-ACTIVOS-FICHA-360-FASE-05A-v1.0.md) · [`INFORME-MOD12-COMODATO-FASE-05B-v1.0.md`](INFORME-MOD12-COMODATO-FASE-05B-v1.0.md) · G5/G6/G7 en `INFORME-MOD12-ACTIVOS-COMODATO-FASE-05-*`.
> **Hueco abierto de MOD12 — H4** (vida útil + `StockLow`). **H3 cerrado** 2026-07-21. **H5** (pestañas legacy) después de H4.

> ~~**Fase siguiente: MOD12 Fase 5A — Ficha 360 del activo.**~~

## 2. Hallazgos

| # | Hallazgo | Evidencia en código | RF afectado | Severidad |
| --- | --- | --- | --- | --- |
| **H1** | ~~La ficha 360 del activo no existe.~~ **CERRADO (5A, 2026-07-21).** `GET /inventory/assets/:id` devuelve `SerializedAssetDetailRecord` compuesto. | `serialized-asset.service.ts` · informe 5A | RF-INV-20 | ~~Alta~~ **Cerrado** |
| **H2** | ~~El comodato no tiene registro propio.~~ **CERRADO (5B, 2026-07-21).** `AssetLoanService` escribe/lee `asset_loan_assignments`; bandeja portal; cierre en retorno/baja. | `asset-loan.service.ts` · informe 5B | RF-INV-12, RF-INV-13 | ~~Alta~~ **Cerrado** |
| **H3** | ~~Las bajas se aplican sin aprobación~~ **CERRADO (H3, 2026-07-21).** `WriteOffService` persiste documento; ledger solo en `approve`. | `write-off.service.ts` · migración 082 · informe H3 | RF-INV-19 | ~~Alta~~ **Cerrado** |
| **H4** | **La vida útil no calcula nada y `StockLow` no existe.** `usefulLifeMonths` / `warrantyUntil` se persisten y se muestran en el drawer, pero no hay umbral, alerta ni consulta de activos próximos a fin de vida. `StockLow` no aparece en ningún archivo del repositorio: la cobertura real es el *pull* de `GET /inventory/replenishment/suggestions` (Existencias F2), no un evento de dominio. `INVENTORY_EVENTS` solo emite eventos de catálogo (ítems y categorías); ningún movimiento de stock emite evento. | `services/asset-lifecycle.service.ts` (solo registra y lista); `events/inventory.events.ts`; grep `StockLow` → 0 resultados | RF-INV-18, RF-INV-22 | Media |
| **H5** | **Deuda UX en pestañas legacy.** `Movimientos` (venta / consumo interno / retorno) y `Bajas` conservan formularios con `<select>` nativos, fuera del patrón composer/PortalPanel adoptado por Compras, Salidas y Existencias. `InventoryClient.tsx` acumula 2.784 líneas y 11 pestañas de primer nivel. | `apps/portal/src/components/inventory/InventoryClient.tsx:2201-2500` | RNF (consistencia UI), RF-INV-14/15/16 | Media |
| **H6** | **No existe informe de cierre de MOD12 como módulo.** Hay cierres por fase de Compras y de Existencias; ninguno del módulo. ADR-016 (regla de completitud) exige cerrar N antes de abrir N+1. | `docs/informes/` | Gobierno | Media |
| **H7** | RF-INV-24 (evaluación de proveedores) y RF-INV-25 (IPAM/VLAN/QoS) siguen **fuera de alcance declarado** en el propio PRD (Fase 2). No son deuda: son alcance diferido. | PRD-MOD12-INVENTARIO-SCM §2 y §4 | RF-INV-24, RF-INV-25 | Informativo |

### Nota de control interno sobre H3

H3 no es solo funcionalidad faltante: es un **agujero de control interno** y el **único hallazgo de severidad Alta que permanece abierto** tras cerrar Activos y comodato (H1/H2). La baja de inventario es la única operación que destruye valor sin contraparte, y hoy se ejecuta sin documento, sin aprobador y sin estado — aunque el movimiento en ledger, el motivo y el actor sí quedan registrados. Si MOD12 sale a producción antes de cerrar H3, debe declararse como **deuda alta aceptada** en el informe de cierre de módulo, con el mitigante vigente (ledger inmutable + `platform_audit_logs` vía `AuditInterceptor`, con actor y motivo).

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
| RF-INV-14 | Salida por venta con referencia comercial y evento | 🟡 | Movimiento `SALE` ✅; **evento de dominio para Billing/ERP ❌** (`events/inventory.events.ts` solo cubre catálogo) |
| RF-INV-15 | Consumo interno con centro de costo | ✅ | `POST /inventory/movements/internal-consumption` |
| RF-INV-16 | Retiro de cliente y tránsito | ✅ | `POST /inventory/returns` con `IN_TRANSIT` / `IN_TESTING` |
| RF-INV-17 | Clasificación del retorno | ✅ | `RETURN_TARGET_STATUSES`; `stock-ledger.service.ts` (transición de activo) |
| RF-INV-18 | Vida útil operativa con alertas por umbral | 🟡 | Estado derivado en ficha 360 (5A); **sin alertas/jobs** → H4 |
| RF-INV-19 | Baja con motivo, evidencia, actor y **aprobación** | ✅ | Documento + approve → ledger (H3) |
| RF-INV-20 | Ficha 360 del activo | ✅ | `SerializedAssetDetailRecord` (5A) |
| RF-INV-21 | Dashboard por bodega/técnico/cliente/categoría/estado | ✅ | `inventory-dashboard.service.ts` (segmentación por tipo de responsable; nombre legible diferido por boundary, decisión vigente en informe SCM F01 §8.6) |
| RF-INV-22 | Emitir `StockLow` bajo mínimo | 🟡 | Cubierto por *pull* (`GET /inventory/replenishment/suggestions`, F2); **evento push inexistente** → H4 |
| RF-INV-23 | Conteo físico y conciliación | ✅ | Existencias F3A: `cycle-count.service.ts`, mig. 071, ADR-054 |
| RF-INV-24 | Evaluación de proveedores | ⏸️ | Fase 2 del PRD padre |
| RF-INV-25 | IPAM / VLAN / QoS | ⏸️ | Fase 2 del PRD padre |

**Cobertura MVP:** 20 de 22 requisitos MVP construidos (91 %), 2 parciales (RF-INV-18 alertas → H4; RF-INV-19 aprobación bajas → **H3, único Alto abierto**). Evento venta RF-INV-14 pendiente (se agrupa con H4).

## 4. Submódulos cerrados (índice)

| Submódulo | Alcance | Cierre |
| --- | --- | --- |
| Catálogo maestro de artículos | Ítems, categorías, prefijos, SKU compuesto | `INFORME-MOD12-CATALOGO-MAESTRO-ARTICULOS-FASE-01-v1.0.md`, `...-CATEGORIAS-FASE-02-v1.0.md`; ADR-INV-SKU-COMPUESTO |
| Proveedores | Alta de proveedor vía puerto de Parties, perfiles, estados | `INFORME-MOD12-PROVEEDORES-ALTA-FASE-05-v1.0.md`; ADR-052 |
| Compras | Solicitud → RFQ → cotización por línea → adjudicación multi-proveedor → OC → recepciones multi-OC; compra de mostrador; PDF de RFQ con Firma iWana | ~24 informes `INFORME-MOD12-COMPRAS-*`; ADR-050, ADR-051, ADR-053 |
| Bodegas y salidas | CRUD de ubicaciones, topes de custodia móvil, `StockIssue` con despacho idempotente | `INFORME-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md` §8 y §10 |
| Existencias | F1 kardex + ajustes · F2 reposición + valor · F3A conteo físico · F3B reservas efectivas · F4 costeo promedio móvil | `INFORME-MOD12-INVENTARIO-EXISTENCIAS-DEFINICION-v1.0.md`; ADR-054, ADR-055, ADR-059; G7 GO CTO 2026-07-20 |
| Activos y comodato | F5A ficha 360 · F5B comodato transaccional + bandeja | `INFORME-MOD12-ACTIVOS-FICHA-360-FASE-05A-v1.0.md`, `INFORME-MOD12-COMODATO-FASE-05B-v1.0.md`, `INFORME-MOD12-ACTIVOS-COMODATO-FASE-05-CIERRE-G7-v1.0.md`; sin ADR nuevo |

## 5. Backlog priorizado

| Orden | Trabajo | Hallazgos | Justificación de la prioridad |
| --- | --- | --- | --- |
| ~~**1**~~ | ~~Fase 5A + 5B~~ | ~~H1, H2~~ | **Cerrado 2026-07-21** |
| **1** | **Vida útil + alertas + eventos de dominio** | H4, RF-INV-14 | **Siguiente fase MOD12** (post H3) |
| 2 | Deuda UX de pestañas legacy | H5 | Después de H4 |
| ~~**1**~~ | ~~**Bajas con aprobación (H3)**~~ | ~~H3~~ | **Cerrado 2026-07-21** |
| 4 | Informe de cierre de MOD12 | H6 | Al cerrar H3/H4 según priorización CTO. |
| — | Evaluación de proveedores, IPAM | H7 | Fase 2 del PRD padre; sin acción hasta repriorización del CTO. |

## 6. Impacto declarado (perfil AI-EM-ARCH §8)

- **Multi-tenant:** sin cambio de estrategia. Todo el trabajo pendiente vive en schema tenant y se resuelve con los helpers vigentes (`runInTenantSchema`, `SET LOCAL search_path` por transacción). Las rutas nuevas exigen prueba de aislamiento (patrón `supplier-profile.isolation.spec.ts`).
- **Seguridad:** H3 es el único hallazgo con impacto de control interno (baja sin aprobación). El resto no altera la superficie de autenticación ni el RBAC vigente. La ficha 360 amplía la superficie de **lectura** de un activo: se mantiene ADMIN/NOC/SUPPORT, coherente con `GET /assets/:id` actual.
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
| PRD H3 — Bajas con aprobación | `docs/prds/PRD-MOD12-BAJAS-APROBACION-v1.0.md` | Emitido — **EJECUTABLE** |
| Prompt H3 | `docs/prompts/PROMPT-MOD12-BAJAS-APROBACION-FASE-H3-v1.0.md` | **EJECUTABLE** |
| Spec H3 | `docs/specs/2026-07-21-mod12-bajas-aprobacion-fase-h3-design.md` | Congelada |

## 8. Historial

| Fecha | Cambio |
| --- | --- |
| 2026-07-21 | v1.0 — auditoría de estado de MOD12 contra código; hallazgos H1–H7; mapa RF-INV-01…25; backlog priorizado; decisión del CTO: siguiente fase = Ficha 360 + comodato. Emitidos PRD, spec y prompts 5A/5B. |
| 2026-07-21 | **Addendum** — Fases 5A + 5B ejecutadas; H1/H2 cerrados; RF-INV-12/13/20 ✅; G5/G6 GO; recomendación técnica GO G7; informe maestro actualizado. |
| 2026-07-21 | **v1.1** — Priorización explícita post-cierre Activos/comodato: **H3** = único Alto abierto y siguiente fase (control interno, no funcionalidad); **H4** y **H5** en orden posterior. Remediación B1–B3 (tests write-off, RF-ACT-09, G7 v1.4). |
| 2026-07-21 | **v1.2** — H3 ejecutado; RF-INV-19 ✅; H3 cerrado; siguiente hueco **H4**. |
