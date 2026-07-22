# Informe — MOD12 Inventario / SCM — Cierre de módulo — Fase H6

**Version:** 1.0  
**Fecha:** 2026-07-21  
**Estado:** ✅ Fase H6 cerrada — G5 GO · G6 GO con deuda · **G7 CTO aprobado 2026-07-21**  
**Modo activo:** Ejecución multiagente (AI-SR-FULL líder · AI-FE-PLATFORM · AI-SR-QA consultivo)  
**Orquestador:** AI-EM-ARCH  
**ADR:** [ADR-060](../adrs/ADR-060-Control-Bajas-y-Consultas-Operativas-Inventario.md) (✅ Aprobado CTO 2026-07-21)  
**Prompt:** [PROMPT-MOD12-CIERRE-MODULO-FASE-H6-v1.0.md](../prompts/PROMPT-MOD12-CIERRE-MODULO-FASE-H6-v1.0.md)  
**Spec:** [2026-07-21-mod12-cierre-modulo-fase-h6-design.md](../specs/2026-07-21-mod12-cierre-modulo-fase-h6-design.md) (D-H6-1…9 · CA-H6-01…08)  
**Auditoría de origen:** [INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md](INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md) (N1, N2, N3, H6)  
**Informe de cierre de módulo:** [INFORME-MOD12-CIERRE-MODULO-v1.0.md](INFORME-MOD12-CIERRE-MODULO-v1.0.md)  
**Gates:** [INFORME-MOD12-CIERRE-MODULO-FASE-H6-G5-G6-G7-v1.0.md](INFORME-MOD12-CIERRE-MODULO-FASE-H6-G5-G6-G7-v1.0.md)

---

## 1. Resumen ejecutivo

La Fase H6 cierra los hallazgos N1–N3 y H6 de la auditoría: RBAC de aprobación/rechazo de bajas exclusivo de `ADMIN`, alertas de vida útil resueltas en SQL con exclusión de estados terminales, gateo de UI alineado al patrón `canAdjustStock`, triaje E2E del cluster G6-P2-01 (12/12 arnés corregido) e informe de cierre de módulo.

**Veredicto de fase (implementación):** GO técnico para handoff G5 → AI-EM-ARCH.  
**Sin DDL.** Segregación aprobador ≠ solicitante intacta. Shape de alertas intacto.

---

## 2. Paso 1 — Triaje E2E (D-H6-8 · CA-H6-07) · AI-SR-QA

### 2.1 Entorno y totales

| Ítem | Valor |
| --- | --- |
| Comando | `npx playwright test --config e2e/playwright.portal.config.ts` |
| Baseline suite portal | **107 passed / 41 failed / 0 skipped** (~17.7 min) |
| Cluster G6-P2-01 (+ comodato) post-fix | **12/12 passed** |
| Defecto funcional compras/RFQ | **0** |
| Fallos ajenos remanentes | **~29** (WFM, settings, comercial, assurance, users, tax) — deuda de suite, no STOP H6 |

Fuente: entrega AI-SR-QA Paso 1 (2026-07-21). Deuda origen: G6-P2-01 en [INFORME-MOD12-ACTIVOS-COMODATO-FASE-05-G6-REVIEW-v1.0.md](INFORME-MOD12-ACTIVOS-COMODATO-FASE-05-G6-REVIEW-v1.0.md).

### 2.2 Tabla fallo a fallo (cluster compras/RFQ/proveedores + comodato)

| # | Spec | Test (resumen) | Error observado | Causa raíz | Clasificación | Módulo | Acción |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `portal-inventory-scm.spec.ts` | crea producto comprable → solicitud de compra | timeout tab `/^Catálogo \(\d+\)/` | Composer ya no usa tabs+checkbox; UI es búsqueda `Buscar producto` | **arnés** | MOD12 compras | Corregido en H6 |
| 2 | idem | crea categoría, producto → solicitud | mismo timeout Catálogo | misma causa #1 | **arnés** | MOD12 compras | Corregido |
| 3 | idem | muestra workspace de compras → líneas | mismo timeout Catálogo | misma causa #1 | **arnés** | MOD12 compras | Corregido |
| 4 | idem | instala vía OT → comodato → retornar | `selectOption` sobre combobox `@iwana/ui` | harness usaba `<select>` nativo; UI es combobox | **arnés** | MOD12 activos | Corregido |
| 5 | idem | completa OC, recepción → retorno | TDZ `request` + tab Recepciones | mock POST OC: `const request` sombreaba `route.request()`; UI exige CTA drawer + click tab Recepciones | **arnés** | MOD12 compras | Corregido |
| 6 | idem | crea solicitud de proyecto → líneas | timeout Catálogo | misma causa #1 | **arnés** | MOD12 compras | Corregido |
| 7 | idem | aprueba urgencia con excepción | no ve título en dialog | assert acoplado a copy; título solo en Resumen | **arnés** | MOD12 compras | Corregido |
| 8 | idem | ejecuta flujo RFQ → PDF | no halla CTA RFQ / download | disclosure Cotizar colapsa ronda; PDF es por invitación `./invitations/:id/pdf` | **arnés** | MOD12 RFQ | Corregido |
| 9 | idem | rechaza invitar BLOCKED (RF-PROV-08) | timeout CTA RFQ | misma causa disclosure #8 | **arnés** | MOD12 RFQ/proveedores | Corregido |
| 10 | idem | rechaza emitir OC BLOCKED (RF-PROV-08) | TDZ `request` + sin mensaje 400 | mismo bug mock #5; enforcement mock no ejecutaba | **arnés** | MOD12 compras/proveedores | Corregido |
| 11 | idem | adjudica líneas → genera OC | timeout tab `Órdenes` | tab Órdenes no está en fase Decidir; CTA footer basta | **arnés** | MOD12 compras | Corregido |
| 12 | idem | registra / bloquea proveedores | timeout label `Número de documento` | alta default NIT → label `Número de NIT` | **arnés** | MOD12 proveedores | Corregido |

### 2.3 Fixes de arnés aplicados

Archivo: `e2e/tests/portal-inventory-scm.spec.ts`

- `addCatalogProductToDraft` → búsqueda tipada `Buscar producto`
- `openRfqRoundSection` + mock `GET ./invitations/:id/pdf`
- TDZ POST `/purchasing/orders` (`httpRequest` / `route.request()`)
- Comodato/retorno: `selectComboboxOption`
- Urgencia: abrir por fila `PR-000200`
- Adjudicación/OC: CTA footer / drawer + tab Recepciones
- Proveedores: label `Número de NIT`

### 2.4 Deuda remanente de suite portal (~29 ajenos)

No hay `[STOP]` por compras/RFQ. Escala a AI-EM-ARCH como **deuda de suite portal** (no bloquea H6):

| Área | Spec(s) aprox. | Naturaleza |
| --- | --- | --- |
| WFM scheduling | `portal-wfm-scheduling.spec.ts` (~14) | locators `Lista`, `Decisiones pendientes`, drag&drop |
| Settings / access / empresa / federated / org / WFM sites | `portal-settings-*` (~8) | timeouts / copy UI |
| Comercial | `portal-commercial-*` (2) | strict mode `heading Comercial` ×2 |
| Assurance / users / tax | `portal-assurance` (1), `portal-users` (2), `portal-tax-simulator` (1) | ajenos a MOD12 |

---

## 3. Pasos 2–3 — Backend (AI-SR-FULL)

### 3.1 Control de bajas (D-H6-1, D-H6-2 · N1)

| Cambio | Evidencia |
| --- | --- |
| `POST .../write-offs/:id/approve` → `@Roles(UserRole.ADMIN)` | `inventory.controller.ts` |
| `POST .../write-offs/:id/reject` → `@Roles(UserRole.ADMIN)` | idem |
| OpenAPI | descripción «Exclusivo de ADMIN (ADR-060 / D-H6-1)» en ambas rutas |
| Solicitud y consultas | siguen `ADMIN, NOC, SUPPORT` |
| `assertApproverDistinct` | **intacto** en `write-off.service.ts` (también entre ADMINs) |

### 3.2 Alertas de vida útil en SQL (D-H6-4…6 · N2)

| Cambio | Evidencia |
| --- | --- |
| QueryBuilder SQL | predicado `purchase_date + useful_life_months * INTERVAL '1 month'` |
| Exclusión terminales | `NOT IN (WRITTEN_OFF, LOST, SOLD)` |
| Paginación | `COUNT` + `LIMIT/OFFSET` en SQL (sin `Array.slice` del universo) |
| Umbral único | `USEFUL_LIFE_ALERT_THRESHOLD_MONTHS` en `serialized-asset-useful-life.util.ts` (paridad helper ↔ SQL) |
| Shape respuesta | intacto: `{ data, total, page, pageSize, limit }` |
| Orden | `updated_at DESC` (sin cambio declarado) |
| DDL | **ninguno** (D-H6-7 / ADR-060) |

### 3.3 Archivos backend tocados

- `apps/api/src/modules/inventory/inventory.controller.ts`
- `apps/api/src/modules/inventory/services/serialized-asset.service.ts`
- `apps/api/src/modules/inventory/services/serialized-asset-useful-life.util.ts`
- `apps/api/src/modules/inventory/tests/inventory.controller.http.spec.ts`
- `apps/api/src/modules/inventory/tests/write-off.service.spec.ts`
- `apps/api/src/modules/inventory/tests/useful-life-alerts.service.spec.ts`
- `apps/api/src/modules/inventory/tests/useful-life-alerts.isolation.spec.ts`

### 3.4 Verificación backend

```text
EV1_REAL_DB=1 pnpm --filter @iwana/api test -- src/modules/inventory
→ 46 suites / 346 tests OK
typecheck API → OK
```

**Cobertura %:** no medido en esta corrida (se citan conteos de tests anteriores).

---

## 4. Paso 4 — UI (AI-FE-PLATFORM · D-H6-3)

| Cambio | Evidencia |
| --- | --- |
| `WriteOffsPanel` prop `canApprove` | oculta Aprobar/Rechazar si no ADMIN |
| `InventoryClient` | `canApprove={canAdjustStock}` (`user?.role === UserRole.ADMIN`) |
| Specs CA-H6-03 | ADMIN muestra acciones; NOC/SUPPORT las ocultan |

```text
pnpm --filter @iwana/portal test -- inventory
→ 59 suites / 282 tests OK
```

El gateo de UI **no sustituye** `@Roles`: el API sigue siendo autoridad (403 → `mapInventoryError`).

---

## 5. Evidencia CA-H6-01…08

| CA | Criterio | Estado | Evidencia |
| --- | --- | --- | --- |
| **CA-H6-01** | NOC/SUPPORT → 403 en approve/reject; ADMIN distinto aprueba | ✅ | `inventory.controller.http.spec.ts`; `write-off.service.spec.ts` |
| **CA-H6-02** | ADMIN solicitante → 400 al auto-aprobar | ✅ | `write-off.service.spec.ts` (`assertApproverDistinct`) |
| **CA-H6-03** | Portal oculta Aprobar/Rechazar a no-ADMIN | ✅ | `InventoryClient.spec.ts` (ADMIN / NOC / SUPPORT) |
| **CA-H6-04** | Terminales WRITTEN_OFF/LOST/SOLD fuera de alertas | ✅ | `useful-life-alerts.service.spec.ts` |
| **CA-H6-05** | `total` de COUNT; página ≤ `pageSize` desde SQL | ✅ | `useful-life-alerts.service.spec.ts` |
| **CA-H6-06** | SQL ↔ `calculateUsefulLife` en 4 bordes | ✅ | `useful-life-alerts.service.spec.ts` + util compartido |
| **CA-H6-07** | Suite E2E propia verde o fallos atribuidos | ✅ | Cluster 12/12 verde; ~29 ajenos atribuidos (§2.4) |
| **CA-H6-08** | Gates Jest inventario API+portal; typecheck | ✅ | 46/346 API · 59/282 portal · typecheck OK |

**Lint monorepo / suite portal completa post-backend:** no re-ejecutados en esta entrega documental; baseline E2E y Jest citados arriba son de Pasos 1–4 de la misma fase.

---

## 6. Restricciones respetadas

| Restricción | Cumplimiento |
| --- | --- |
| Sin DDL / sin índice nuevo | ✅ |
| Segregación aprobador ≠ solicitante (también ADMIN) | ✅ no relajada |
| Shape de alertas intacto | ✅ |
| Multi-tenant + `tenant_id` en SQL + aislamiento | ✅ `useful-life-alerts.isolation.spec.ts` |
| Sin PII en logs/fixtures/mensajes | ✅ |
| Append-only en archivos compartidos | ✅ (sin tocar contratos congelados de shape) |
| Informes G5/G6/G7 **no** emitidos por implementador | ✅ — solo handoff |

---

## 7. Hallazgos de auditoría cerrados en H6

| Hallazgo | Resolución |
| --- | --- |
| **N1** | Approve/reject solo ADMIN + UI gate |
| **N2** | Alertas en SQL + exclusión terminales + umbral único |
| **N3** | Ratificado por ADR-060 (mig. 081/082 + contrato bajas); H6 sin DDL nuevo |
| **H6** | Este informe + [INFORME-MOD12-CIERRE-MODULO-v1.0.md](INFORME-MOD12-CIERRE-MODULO-v1.0.md) |

---

## 8. Gates G5 → G7

**Estado:** cerrados. Ver [INFORME-MOD12-CIERRE-MODULO-FASE-H6-G5-G6-G7-v1.0.md](INFORME-MOD12-CIERRE-MODULO-FASE-H6-G5-G6-G7-v1.0.md).

| Gate | Veredicto |
| --- | --- |
| G5 | GO |
| G6 | GO con deuda aceptada |
| G7 | **CTO 2026-07-21:** cierre técnico aprobado; N+1 autorizado; producción NO-GO (no desplegado) |

**Estado de despliegue:** MOD12 **no ha sido desplegado**.

---

## 9. Historial

| Fecha | Cambio |
| --- | --- |
| 2026-07-21 | v1.0 — entrega Fase H6: triaje E2E, RBAC bajas, alertas SQL, gateo UI, evidencia CA-H6-01…08, handoff G5. |
| 2026-07-21 | G5/G6/G7 cerrados — CTO aprueba cierre técnico y autoriza N+1. |
