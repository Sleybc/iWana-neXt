# Informe vivo — MOD12 Inventario / SCM — Auditoría de estado del módulo

**Version:** 1.11
**Fecha:** 2026-07-21
**Estado:** Vigente — **MOD12 CERRADO en alcance MVP (G7 GO, CTO 2026-07-21)**; N+1 habilitado; producción **no desplegada**
**Modo activo:** Architect + EM (cierre) + Product Architect (arranque N+1)
**Autor:** AI-EM-ARCH
**Solicitado por:** CTO
**Clasificacion:** Confidencial — Uso interno
**PRD padre:** [PRD-MOD12-INVENTARIO-SCM-v1.0.md](../prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md)
**ADR base:** [ADR-048](../adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md)
**HLD:** [HLD-MOD12-INVENTARIO-SCM-v1.0.md](../hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md)
**Cierre de módulo:** [INFORME-MOD12-CIERRE-MODULO-v1.0.md](INFORME-MOD12-CIERRE-MODULO-v1.0.md) — ✅ **cerrado en alcance MVP (G7 GO, CTO 2026-07-21)**
**Gates H6:** [INFORME-MOD12-CIERRE-MODULO-FASE-H6-G5-G6-G7-v1.0.md](INFORME-MOD12-CIERRE-MODULO-FASE-H6-G5-G6-G7-v1.0.md) v1.2
**Remediación:** [PROMPT-MOD12-CIERRE-MODULO-FASE-H6-R1-v1.0.md](../prompts/PROMPT-MOD12-CIERRE-MODULO-FASE-H6-R1-v1.0.md)

---

## 1. Resumen ejecutivo y declaración de arranque

El CTO solicitó auditar MOD12 Inventario para determinar qué falta construir. La auditoría se ejecutó **contra código, no contra informes previos**: cada estado de esta tabla tiene ruta y línea verificable.

Conclusión: **MOD12 cerrado en alcance MVP** — H1–H7 y N1–N3 resueltos, 22/22 RF MVP construidos, con G7 GO del CTO el 2026-07-21. El cierre requirió **dos rondas de remediación** (H6-R1, H6-R2) tras un NO-GO del aprobador que destapó un defecto real de producto (falsos negativos en el panel de alertas por divergencia entre el helper de vida útil y el predicado SQL) y evidencia de calidad que no reproducía. Ambos cerrados con evidencia verificada de forma independiente.

> **Fase H5 — UX pestañas legacy — CERRADA (recomendación técnica GO, G7 2026-07-21).**
> Informes: [`INFORME-MOD12-UX-LEGACY-PESTANAS-FASE-H5-v1.0.md`](INFORME-MOD12-UX-LEGACY-PESTANAS-FASE-H5-v1.0.md) · G5/G6/G7 en `INFORME-MOD12-UX-LEGACY-PESTANAS-FASE-H5-*`.

> **Fase H6 — Cierre de módulo — CERRADA (G7 GO, CTO 2026-07-21)**, tras H6-R1 y H6-R2.
> Evidencia verificada por el aprobador: E2E propia de MOD12 **41/41**, suite portal 148 tests con **119 pass / 29 fail** (cero de MOD12), Jest API **367** con EV-1 contra PostgreSQL real, paridad SQL↔helper 2/2 en bordes de día 1/28/29/30/31, helper al 100 % de cobertura.
> **N+1 habilitado** (candidato: Billing / Facturación — numeración pendiente del CTO).
> **MOD12 no ha sido desplegado:** el cierre es técnico, en alcance MVP; no es GO de producción.
> Deuda viva con dueño: [`INFORME-MOD12-DEUDA-E2E-PORTAL-CROSS-MODULO-v1.0.md`](INFORME-MOD12-DEUDA-E2E-PORTAL-CROSS-MODULO-v1.0.md) — 29 tests del portal siguen rojos, ninguno de MOD12; concentración en MOD09 WFM (13).

### Auditoría de re-verificación 2026-07-21 (AI-EM-ARCH, gates ejecutados por el auditor)

Verificado contra código, con gates propios: **API inventario 339/339** (46 suites, incluidas las dos EV-1 contra PostgreSQL real con `EV1_REAL_DB=1`), **portal inventario 279/279** (59 suites), lint y typecheck limpios, migraciones 081 y 082 registradas en `runner.ts`, working tree limpio hasta `94a4dde1`. Los cierres de H1–H5 se sostienen en código. La auditoría abrió tres hallazgos nuevos (N1–N3) que condicionan el cierre del módulo — **resueltos en H6**.

## 2. Hallazgos

| # | Hallazgo | Evidencia en código | RF afectado | Severidad |
| --- | --- | --- | --- | --- |
| **H1** | ~~La ficha 360 del activo no existe.~~ **CERRADO (5A, 2026-07-21).** `GET /inventory/assets/:id` devuelve `SerializedAssetDetailRecord` compuesto. | `serialized-asset.service.ts` · informe 5A | RF-INV-20 | ~~Alta~~ **Cerrado** |
| **H2** | ~~El comodato no tiene registro propio.~~ **CERRADO (5B, 2026-07-21).** `AssetLoanService` escribe/lee `asset_loan_assignments`; bandeja portal; cierre en retorno/baja. | `asset-loan.service.ts` · informe 5B | RF-INV-12, RF-INV-13 | ~~Alta~~ **Cerrado** |
| **H3** | ~~Las bajas se aplican sin aprobación~~ **CERRADO (H3, 2026-07-21).** `WriteOffService` persiste documento; ledger solo en `approve`. | `write-off.service.ts` · migración 082 · informe H3 | RF-INV-19 | ~~Alta~~ **Cerrado** |
| **H4** | ~~La vida útil no calcula nada y `StockLow` no existe.~~ **CERRADO (H4, 2026-07-21).** Endpoint + panel alertas; `inventory.stock-low` + `inventory.asset-sold`; listener log. | publisher + `UsefulLifeAlertsPanel` · informe H4 | RF-INV-14, RF-INV-18, RF-INV-22 | ~~Media~~ **Cerrado** |
| **H5** | ~~Deuda UX pestañas legacy.~~ **CERRADO (H5, 2026-07-21).** `MovementsWorkspace` + solicitar baja en `WriteOffsPanel`; cero `<select>` nativos en inventory/. | `MovementsWorkspace.tsx` · informe H5 | RNF | ~~Media~~ **Cerrado** |
| **H6** | ~~No existe informe de cierre de MOD12 como módulo.~~ **CERRADO (H6 + G7 CTO 2026-07-21).** Informe de fase, cierre de módulo y gates G5/G6/G7 emitidos. | `INFORME-MOD12-CIERRE-MODULO-*.md` | Gobierno | ~~Media~~ **Cerrado** |
| **H7** | RF-INV-24 (evaluación de proveedores) y RF-INV-25 (IPAM/VLAN/QoS) siguen **fuera de alcance declarado** en el propio PRD (Fase 2). No son deuda: son alcance diferido. | PRD-MOD12-INVENTARIO-SCM §2 y §4 | RF-INV-24, RF-INV-25 | Informativo |
| **N1** | ~~Aprobación de bajas abierta a NOC/SUPPORT.~~ **CERRADO (H6).** `approve`/`reject` → `@Roles(UserRole.ADMIN)`; segregación intacta; gateo UI. | `inventory.controller.ts` · informe H6 | RF-INV-19 | ~~Alta~~ **Cerrado** |
| **N2** | ~~Alertas de vida útil O(n) sin excluir terminales.~~ **CERRADO (H6).** QueryBuilder SQL + exclusión WRITTEN_OFF/LOST/SOLD + COUNT/LIMIT. | `serialized-asset.service.ts` · informe H6 | RF-INV-18, RNF-INV-08 | ~~Media~~ **Cerrado** |
| **N3** | ~~Migraciones 081/082 y contrato de bajas sin ADR.~~ **CERRADO.** Ratificado en ADR-060 (CTO 2026-07-21); H6 sin DDL nuevo. | ADR-060 | Gobierno | ~~Media~~ **Cerrado** |

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
| ~~**1**~~ | ~~Deuda UX de pestañas legacy~~ | ~~H5~~ | **Cerrado 2026-07-21** |
| ~~**1**~~ | ~~**Fase H6 — Cierre de módulo**~~ | ~~N1, N2, N3, H6~~ | **Cerrado 2026-07-21 (G7 CTO)** |
| — | Evaluación de proveedores, IPAM | H7 | Fase 2 del PRD padre; sin acción hasta repriorización del CTO. |
| — | Arranque módulo N+1 | — | **Autorizado CTO 2026-07-21.** Candidato: Billing / Facturación (numeración formal pendiente). |

### Qué queda fuera del cierre del módulo (declarado, no omitido)

Al cerrar H6, MOD12 queda completo **como MVP dentro del alcance declarado**. Permanecen fuera por decisión explícita:

- RF-INV-24 y RF-INV-25 — Fase 2 del PRD padre.
- Fuera de scope desde el PRD padre §2: depreciación contable NIIF, portal de proveedor, contratos marco, mantenimiento vehicular, app móvil offline, forecast predictivo, integración con ERP externo.
- RF-ACT-13 — fecha esperada de recuperación del comodato y alertas de no devolución (exige migración → gate ADR).
- Dependencias de otros módulos: `inventory.asset-sold` publica sin consumidor (Billing no existe aún) y el listener de `StockLow` solo registra log, no notifica.
- Sin backfill de comodatos anteriores a 5B ni de bajas anteriores a H3 (ADR-060 D-060-4).
- **Despliegue:** nada de MOD12 se ha desplegado. G7 cierra MVP en código y autoriza N+1; **no** es GO de producción.

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
| PRD H5 — UX pestañas legacy | `docs/prds/PRD-MOD12-UX-LEGACY-PESTANAS-v1.0.md` | MVP cerrado — G7 GO recomendado |
| Prompt H5 | `docs/prompts/PROMPT-MOD12-UX-LEGACY-PESTANAS-FASE-H5-v1.0.md` | **CERRADO** |
| Spec H5 | `docs/specs/2026-07-21-mod12-ux-legacy-pestanas-fase-h5-design.md` | Congelada |
| **ADR-060 — Control de bajas, consultas operativas y ratificación de esquema** | `docs/adrs/ADR-060-Control-Bajas-y-Consultas-Operativas-Inventario.md` | ✅ **Aprobado CTO 2026-07-21** |
| Spec H6 — Cierre de módulo | `docs/specs/2026-07-21-mod12-cierre-modulo-fase-h6-design.md` | Congelada |
| Prompt H6 | `docs/prompts/PROMPT-MOD12-CIERRE-MODULO-FASE-H6-v1.0.md` | **CERRADO** (G7 CTO 2026-07-21) |
| Informe cierre módulo | `docs/informes/INFORME-MOD12-CIERRE-MODULO-v1.0.md` | ✅ Cerrado MVP |
| Gates H6 G5/G6/G7 | `docs/informes/INFORME-MOD12-CIERRE-MODULO-FASE-H6-G5-G6-G7-v1.0.md` | ✅ G7 CTO |

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
| 2026-07-21 | **v1.6** — H5 cerrado (MovementsWorkspace + WriteOffs form + cero select nativos); siguiente **H6**. |
| 2026-07-21 | **v1.8** — **CTO aprueba ADR-060.** Quedan ratificadas las migraciones 081/082 y el cambio de contrato de bajas; adoptadas D-060-1 (aprobación de bajas solo ADMIN, sin relajar segregación), D-060-2 (consultas en SQL + regla normativa contra carga en memoria) y D-060-4 (sin backfill). Fase **H6 EJECUTABLE**; destinatario AI-SR-FULL. |
| 2026-07-21 | **v1.7** — Auditoría de re-verificación (AI-EM-ARCH) con gates propios: API 339/339 incluidas las EV-1 contra DB real, portal 279/279, lint/typecheck limpios. H1–H5 se sostienen en código. **Tres hallazgos nuevos: N1** (aprobación de bajas abierta a NOC/SUPPORT, Alta, control interno), **N2** (alertas de vida útil con carga O(n) del tenant y sin excluir estados terminales) y **N3** (migraciones 081/082 y cambio de contrato de bajas sin ADR). Emitidos **ADR-060** (Propuesto), spec y prompt de la **Fase H6 — Cierre de módulo**, que incorpora además el triaje de los 11 E2E rojos de compras/RFQ nunca atribuidos desde la Fase 05. H6 bloqueada hasta aprobación del ADR por el CTO. |
| 2026-07-21 | **v1.9** — H6 + G7 CTO preliminar: N1/N2/N3/H6 entregados; cierre técnico declarado; N+1 autorizado. |
| 2026-07-21 | **v1.10** — **G7 NO-GO:** divergencia vida útil (B1), E2E no reproducible (B2), aislamiento mock (B3). Enmiendas D-H6-5/CA-H6-07. Prompt **H6-R1** ejecutable. N+1 suspendido. |
| 2026-07-21 | **v1.11** — **MOD12 CERRADO (G7 GO, CTO)** tras H6-R1 y H6-R2. Verificación independiente del aprobador con Chromium ya instalado: E2E propia 41/41, portal 119/29 sin fallos de MOD12, Jest API 367 con EV-1 real, paridad contra PostgreSQL 2/2, helper 100 % y `coverageThreshold` armado. Informes falsos de la ronda anterior **retractados**, no editados. Deuda cross-módulo catalogada con dueño (30 filas). N+1 habilitado; producción sigue no desplegada. |
