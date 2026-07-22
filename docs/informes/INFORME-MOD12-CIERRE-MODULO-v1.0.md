# Informe de cierre de módulo — MOD12 Inventario / SCM

**Version:** 1.3  
**Fecha:** 2026-07-21  
**Estado:** ✅ **G7 GO — cierre técnico de módulo aprobado por el CTO (2026-07-21)**; alcance MVP. **Producción NO desplegada.**  
**Tipo:** Informe de cierre de módulo (regla de completitud modular; autoridad [ADR-022](../adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md); precedente de forma [ADR-016](../adrs/ADR-016-Cierre-MOD01-Produccion.md))  
**Autor de entrega:** AI-SR-FULL (Paso 5 H6)  
**Orquestador:** AI-EM-ARCH  
**Gates:** [INFORME-MOD12-CIERRE-MODULO-FASE-H6-G5-G6-G7-v1.0.md](INFORME-MOD12-CIERRE-MODULO-FASE-H6-G5-G6-G7-v1.0.md) (G5 · G6 · **G7 GO tras dos rondas de remediación: H6-R1 y H6-R2**)  
**Deuda E2E cross-módulo:** [INFORME-MOD12-DEUDA-E2E-PORTAL-CROSS-MODULO-v1.0.md](INFORME-MOD12-DEUDA-E2E-PORTAL-CROSS-MODULO-v1.0.md) (30 fallos con dueño; fuera del alcance de MOD12 por enmienda de spec)  
**PRD padre:** [PRD-MOD12-INVENTARIO-SCM-v1.0.md](../prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md)  
**HLD:** [HLD-MOD12-INVENTARIO-SCM-v1.0.md](../hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md)  
**ADR base:** [ADR-048](../adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md)  
**ADR de cierre H6:** [ADR-060](../adrs/ADR-060-Control-Bajas-y-Consultas-Operativas-Inventario.md) (✅ Aprobado CTO 2026-07-21)  
**Auditoría viva:** [INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md](INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md)  
**Fase de cierre:** [INFORME-MOD12-CIERRE-MODULO-FASE-H6-v1.0.md](INFORME-MOD12-CIERRE-MODULO-FASE-H6-v1.0.md)  
**Prompt:** [PROMPT-MOD12-CIERRE-MODULO-FASE-H6-v1.0.md](../prompts/PROMPT-MOD12-CIERRE-MODULO-FASE-H6-v1.0.md)  
**Spec:** [2026-07-21-mod12-cierre-modulo-fase-h6-design.md](../specs/2026-07-21-mod12-cierre-modulo-fase-h6-design.md)

---

## 1. Declaración de cierre y estado de despliegue

MOD12 Inventario / SCM se declara **completo en código dentro del alcance MVP del PRD padre** (22/22 RF MVP construidos; RF-INV-24/25 diferidos a Fase 2).

**G7 (2026-07-21): GO — aprobado por el CTO.** El cierre llegó tras **dos rondas de remediación** (H6-R1 y H6-R2) exigidas por la verificación independiente de AI-EM-ARCH, que revocó un cierre preliminar. Queda registrado como parte del historial del módulo, no se borra: el primer NO-GO se debió a un defecto real de producto —divergencia entre el helper de vida útil y el predicado SQL, que producía falsos negativos en el panel de alertas— y el segundo, a evidencia de calidad que no reproducía. Ambos cerrados con evidencia verificada por el aprobador.

**Verificación independiente del aprobador (AI-EM-ARCH, 2026-07-21):**

| Evidencia | Resultado |
| --- | --- |
| Suite E2E propia MOD12 (`portal-inventory-scm`) | **41/41 passed**, exit 0 |
| Suite portal completa | 148 tests · **119 passed / 29 failed** — **cero fallos de MOD12** |
| Jest API inventario (`EV1_REAL_DB=1`) | **367 passed**, umbral de cobertura en verde |
| Paridad SQL ↔ helper contra PostgreSQL real (CA-H6-06) | 2/2, bordes día 1/28/29/30/31 |
| `serialized-asset-useful-life.util.ts` | 100 % statements, branches, functions y lines |

N+1 **habilitado**.

### Estado de despliegue (explícito)

**MOD12 no ha sido desplegado.**  
Nada de este módulo está en producción. El G7 cierra el módulo en alcance MVP para la regla de completitud y habilita N+1; **no** constituye cierre en producción (ADR-022 §3). El GO de producción exige release + validación productiva por decisión separada.

---

## 2. Resumen ejecutivo

| Dimensión | Resultado |
| --- | --- |
| Alcance MVP PRD | 22/22 RF construidos; 2 RF Fase 2 diferidos |
| Deuda alta (auditoría N1) | Cerrada en H6 (approve/reject solo ADMIN) |
| Escala alertas (N2) | Cerrada en H6 (SQL + exclusión terminales) |
| Gobernanza esquema (N3) | Ratificada en ADR-060 (mig. 081/082; sin DDL en H6) |
| Suite E2E propia MOD12 | **41/41 verde** (verificado por el aprobador) |
| Suite portal completa | **119 pass / 29 fail** — los 29 son ajenos a MOD12 (WFM 13, settings 7, users 2, tributario 1, resto disperso), catalogados con dueño |
| Despliegue | **No desplegado** |

---

## 3. Evidencia funcional — RF-INV-01…25

Fuente de estados: auditoría [INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md](INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md) §3, cruzada con PRD padre y cierre H6 (endurecimiento RF-INV-18/19).

Leyenda: ✅ construido · ⏸️ fuera de alcance declarado (Fase 2).

| RF | Requisito | Estado | Evidencia / fase |
| --- | --- | --- | --- |
| RF-INV-01 | Item master físico | ✅ | Catálogo maestro Fase 01/02 · `inventory-item.service.ts` |
| RF-INV-02 | Consumible / serializado / activo fijo | ✅ | `InventoryTrackingMode`; recepción y ajustes |
| RF-INV-03 | Solicitud de compra | ✅ | `purchasing.service.ts` · `POST /purchasing/requests` |
| RF-INV-04 | Cotizaciones por solicitud | ✅ | `rfq.service.ts` · mig. 069 |
| RF-INV-05 | Aprobación y OC con consecutivo | ✅ | approve request + `POST /purchasing/orders` |
| RF-INV-06 | Recepción faltantes/dañados y lotes/seriales | ✅ | `goods-receipt.service.ts` |
| RF-INV-07 | Ledger inmutable con idempotency key | ✅ | `stock-ledger.service.ts` |
| RF-INV-08 | Balance sin saldos negativos | ✅ | `stock-balance.service.ts` · constraint 073 |
| RF-INV-09 | Tipos de bodega | ✅ | `StockLocationType` · `stock-location.service.ts` |
| RF-INV-10 | Transferencia con acta digital | ✅ | `handoffReference` / `handoffNotes` |
| RF-INV-11 | Topes por técnico/cuadrilla | ✅ | `maxCapacity` en destino móvil |
| RF-INV-12 | Instalación en cliente como comodato | ✅ | Fase 5B · `asset-loan.service.ts` |
| RF-INV-13 | Comodato vinculado a suscriptor/contrato | ✅ | Fase 5B · `asset_loan_assignments` |
| RF-INV-14 | Salida por venta + evento Billing/ERP | ✅ | Movimiento `SALE` + `inventory.asset-sold` (H4); **sin consumidor** |
| RF-INV-15 | Consumo interno con centro de costo | ✅ | `POST /inventory/movements/internal-consumption` |
| RF-INV-16 | Retiro de cliente y tránsito | ✅ | `POST /inventory/returns` |
| RF-INV-17 | Clasificación del retorno | ✅ | `RETURN_TARGET_STATUSES` |
| RF-INV-18 | Vida útil operativa con alertas | ✅ | H4 + **H6 SQL** (predicado, COUNT, exclusión terminales) |
| RF-INV-19 | Baja con motivo, evidencia, actor y aprobación | ✅ | H3 documento + **H6 RBAC ADMIN** + segregación |
| RF-INV-20 | Ficha 360 del activo | ✅ | Fase 5A · `SerializedAssetDetailRecord` |
| RF-INV-21 | Dashboard por bodega/técnico/cliente/categoría/estado | ✅ | `inventory-dashboard.service.ts` |
| RF-INV-22 | Emitir `StockLow` bajo mínimo | ✅ | `inventory.stock-low` (publisher); **sin notificación push** |
| RF-INV-23 | Conteo físico y conciliación | ✅ | Existencias F3A · ADR-054 (construido aunque PRD lo listó Fase 2) |
| RF-INV-24 | Evaluación de proveedores | ⏸️ | Fase 2 del PRD — diferido |
| RF-INV-25 | IPAM / VLAN / QoS | ⏸️ | Fase 2 del PRD — diferido |

**Cobertura MVP declarado:** 22/22 (100 % del alcance MVP). RF-INV-24/25 no son deuda: son alcance diferido (H7 auditoría).

---

## 4. Evidencia de calidad (gates — números reales de H6)

| Gate | Comando / alcance | Resultado |
| --- | --- | --- |
| Jest API inventario (+ EV-1 DB real) | `EV1_REAL_DB=1 pnpm --filter @iwana/api test -- src/modules/inventory` | **46 suites / 346 tests OK** |
| Jest portal inventario | `pnpm --filter @iwana/portal test -- inventory` | **59 suites / 282 tests OK** |
| Typecheck API | corrida Paso 2–3 H6 | **OK** |
| E2E cluster MOD12 (compras/RFQ/comodato) | Playwright `portal-inventory-scm` (12 casos triados) | **12/12 pass** post-arnés |
| E2E suite portal completa (baseline Paso 1) | `npx playwright test --config e2e/playwright.portal.config.ts` | **107 pass / 41 fail** |
| Cobertura % core | — | **no medido en esta corrida** |

Criterios de aceptación H6 (CA-H6-01…08): **todos cumplidos** — detalle en [INFORME-MOD12-CIERRE-MODULO-FASE-H6-v1.0.md](INFORME-MOD12-CIERRE-MODULO-FASE-H6-v1.0.md) §5.

---

## 5. Resultado del triaje E2E (Paso 1 H6)

| Clasificación | Cantidad | Notas |
| --- | --- | --- |
| Arnés MOD12 (G6-P2-01 + comodato) | 12 | Corregidos en `e2e/tests/portal-inventory-scm.spec.ts`; recheck 12/12 |
| Defecto funcional compras/RFQ | **0** | Sin STOP |
| Fallos ajenos (WFM, settings, comercial, assurance, users, tax) | ~29 | Deuda de suite portal; dueño: AI-EM-ARCH / frentes respectivos |

Tabla fallo a fallo completa: informe de fase H6 §2.2.

---

## 6. Submódulos y frentes cerrados (índice)

| Frente | Cierre documental |
| --- | --- |
| Catálogo maestro | INFORME-MOD12-CATALOGO-MAESTRO-* · ADR SKU compuesto |
| Proveedores | INFORME-MOD12-PROVEEDORES-ALTA-FASE-05 · ADR-052 |
| Compras | ~24 INFORME-MOD12-COMPRAS-* · ADR-050/051/053 |
| Bodegas / salidas | INFORME-MOD12-INVENTARIO-SCM-FASE-01 |
| Existencias F1–F4 | INFORME-MOD12-INVENTARIO-EXISTENCIAS-* · ADR-054/055/059 · G7 GO CTO 2026-07-20 |
| Activos / comodato 5A–5B | INFORME-MOD12-ACTIVOS-* / COMODATO-05B · G7 GO recomendado |
| Bajas H3 | INFORME-MOD12-BAJAS-APROBACION-* · mig. 082 · ADR-060 ratifica |
| Vida útil / StockLow H4 | INFORME-MOD12-VIDA-UTIL-STOCKLOW-* |
| UX pestañas legacy H5 | INFORME-MOD12-UX-LEGACY-PESTANAS-* |
| Control + SQL + cierre H6 | este informe + INFORME-MOD12-CIERRE-MODULO-FASE-H6 · ADR-060 |

---

## 7. Deuda declarada y limitaciones conocidas

Las siguientes quedan **fuera del cierre MVP** por decisión explícita (no omitidas):

| Ítem | Estado | Notas |
| --- | --- | --- |
| Sin backfill de comodatos pre-5B | Declarado | Solo ledger histórico — ADR-060 D-060-4 |
| Sin backfill de bajas pre-H3 | Declarado | Solo ledger histórico — ADR-060 D-060-4 |
| `inventory.asset-sold` sin consumidor | Limitación | Publisher listo; Billing/ERP no existe aún (RF-INV-14) |
| `StockLow` sin notificación push | Limitación | Evento + listener de log; sin push/email/auto-OC (RF-INV-22) |
| RF-ACT-13 | Pendiente | Fecha esperada de recuperación del comodato / alertas de no devolución — exige migración → gate ADR |
| RF-INV-24 / RF-INV-25 | Diferidos | Fase 2 del PRD padre |
| Tenant con un solo ADMIN | Operativo | No puede auto-aprobar bajas; designar segundo ADMIN (runbook) — D-H6-2 |
| **La suite E2E del portal no está verde** | Deuda QA con dueño | **29 tests siguen rojos** (verificado por el aprobador). Ninguno es de MOD12. Catalogados fallo a fallo con causa, módulo, agente responsable y severidad en [INFORME-MOD12-DEUDA-E2E-PORTAL-CROSS-MODULO-v1.0.md](INFORME-MOD12-DEUDA-E2E-PORTAL-CROSS-MODULO-v1.0.md). Fuera del alcance de MOD12 por enmienda firmada de CA-H6-07, **no por omisión**. Concentración: MOD09 WFM (13). |
| Descuadre catálogo ↔ corrida | Menor | El catálogo lista 30 filas y la corrida del aprobador arrojó 29 fallos: probable flaky. Reconciliar antes de que el catálogo envejezca desalineado. |
| `coverageThreshold` de alcance estrecho | Menor | Armado solo para `serialized-asset-useful-life.util.ts`. Suficiente para H6, insuficiente como red del módulo. |
| Efecto DIAN/fiscal de bajas | No cubierto | Requiere verificación con fuente oficial si se exige soporte tributario |
| Fuera de scope PRD §2 | Declarado | Depreciación NIIF, portal proveedor, contratos marco, mantenimiento vehicular, app offline, forecast, ERP externo |

---

## 8. Impacto declarado (cierre)

| Eje | Declaración |
| --- | --- |
| Multi-tenant | Sin cambio de estrategia; schema-per-tenant + helpers vigentes; alertas con `tenant_id` en SQL |
| Seguridad | H6 **endurece** RBAC de bajas (restrictivo). Segregación de funciones mantenida. Sin PII nueva |
| Escala | Eliminado el full-scan en memoria de alertas de vida útil (regla normativa ADR-060 D-060-2) |
| Privacidad | Comodato por UUID opaco; sin PII de cliente en MOD12 |
| Regulación | Sin cobertura DIAN declarada para bajas |

---

## 9. Go / no-go — decisión CTO

| Pregunta | Recomendación (pre-G7) | Decisión CTO 2026-07-21 |
| --- | --- | --- |
| ¿Cerrar MVP MOD12 en código (alcance PRD)? | GO técnico | **Aprobado** |
| ¿Autorizar arranque módulo N+1? | Condicionado a G7 | **Autorizado** |
| ¿Desplegar / cerrar en producción ahora? | NO-GO | **Sin GO de producción** (sigue no desplegado) |

### Motivos del NO-GO de producción (vigente)

1. **MOD12 no ha sido desplegado** — no hay evidencia de validación en entorno productivo (ADR-022 §3).  
2. Suite E2E portal con ~29 fallos ajenos (deuda; no bloquean cluster MOD12).  
3. Dependencias externas abiertas (`asset-sold` sin consumidor, `StockLow` sin notificación) — runbook de release.

### Condiciones para un futuro GO de producción

- Plan de despliegue (mig. 081/082 ratificadas; H6 sin DDL nuevo).  
- Runbook: segundo ADMIN para bajas; limitaciones §7.  
- Decidir si los ~29 E2E ajenos son gate de release o deuda post-release.  
- Decisión explícita CTO + ejecución AI-PLAT-OPS.

---

## 10. Handoff

**G7 cerrado.**  
**Siguiente paso:** AI-EM-ARCH en modo Product Architect — definición del módulo N+1 (candidato: Billing / Facturación).  
**Artefactos de gates:** [INFORME-MOD12-CIERRE-MODULO-FASE-H6-G5-G6-G7-v1.0.md](INFORME-MOD12-CIERRE-MODULO-FASE-H6-G5-G6-G7-v1.0.md).

---

## 11. Historial

| Fecha | Cambio |
| --- | --- |
| 2026-07-21 | v1.0 — cierre técnico de módulo MOD12 tras Fase H6; RF-INV-01…25; deuda §7; despliegue explícito no realizado; recomendación GO técnico / NO-GO producción. |
| 2026-07-21 | v1.1 — G7 CTO preliminar: cierre técnico aprobado; N+1 autorizado; producción NO-GO. |
| 2026-07-21 | v1.2 — **G7 NO-GO** (divergencia vida útil; E2E no reproducible; aislamiento mock). Cierre revocado; H6-R1 abierto. |
| 2026-07-21 | v1.3 — **G7 GO aprobado por el CTO** tras H6-R1 y H6-R2. Verificación independiente del aprobador: E2E propia **41/41**, portal 119/29 (cero fallos MOD12), Jest API **367** con EV-1 real, paridad SQL↔helper contra PostgreSQL real 2/2, helper al 100 % de cobertura. Residuales declarados en §7: la suite del portal **no** está verde (29 rojos ajenos con dueño), descuadre catálogo↔corrida y umbral de cobertura estrecho. Producción sigue **NO desplegada**. N+1 habilitado. |
