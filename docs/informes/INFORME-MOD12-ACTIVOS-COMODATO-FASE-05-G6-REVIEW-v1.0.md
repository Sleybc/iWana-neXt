# Informe G6 — MOD12 Activos y comodato Fases 05A + 05B (experiencia, DS, QA)

**Version:** 1.0  
**Fecha:** 2026-07-21  
**Estado:** ✅ **G6 GO** — habilita G7  
**Protocolo:** Multiagente v1.3 etapa 6  
**Roles:** AI-PROD-UX · AI-DS-OWNER · AI-SR-QA (consolidado AI-EM-ARCH)  
**Entrada:** G5 `INFORME-MOD12-ACTIVOS-COMODATO-FASE-05-G5-AUDITORIA-ARCH-v1.0.md`  
**PRD:** `docs/prds/PRD-MOD12-ACTIVOS-COMODATO-v1.0.md` · Spec D-F5-1…14

---

## 1. Resumen ejecutivo

Fases 05A (Ficha 360) y 05B (Comodato) cumplen criterios de experiencia, design system e identidad iWana, vocabulario en español, referencias opacas sin PII, y suites completas de inventario en verde. E2E específicos de la fase pasan. Sin P0/P1 abiertos.

**Decisión G6: GO** → habilita G7 (cierre EM-ARCH / CTO).

---

## 2. Veredictos por rol

| Rol | Veredicto | Notas |
| --- | --- | --- |
| **AI-PROD-UX** | **GO** | Drawer 7 secciones con empty states explicativos; bandeja Comodatos como subvista Activos (H5 respetado); deep-link kardex `?tab=stock&serializedAssetId=`; flujo OT→comodato→retorno coherente |
| **AI-DS-OWNER** | **GO** | Patrón `portal-eyebrow`, tablas y chips alineados a Existencias; labels centralizados `inventory-labels.ts`; refs opacas `formatInventoryOpaqueRef` |
| **AI-SR-QA** | **GO** | Suites módulo completas + E2E ficha 360 y comodato en verde |

---

## 3. Evidencia QA (checklist MOD12 G6/G7)

| Gate | Comando | Resultado (2026-07-21) |
| --- | --- | --- |
| API inventario completa | `npx jest src/modules/inventory` | **303 passed**, 3 skipped (39/40 suites) |
| Portal inventario completa | `npx jest src/components/inventory` | **266 passed** (57 suites) |
| Lint / typecheck | `pnpm lint` · `pnpm typecheck` | ✅ Limpio |
| E2E ficha 360 (5A) | `portal-inventory-scm.spec.ts -g "ficha 360"` | ✅ PASS |
| E2E comodato OT→retorno (5B) | `portal-inventory-scm.spec.ts -g "comodato"` | ✅ PASS (cableado UI con mocks; ver EV-1 para ciclo transaccional) |
| EV-1 comodato (5B, DB real) | `EV1_REAL_DB=1 … asset-loan.transactional.ev1.spec.ts` | ✅ **3/3** passed (post-auditoría A2) |

---

## 4. Criterios CA revisados en UI

| CA | Validación G6 |
| --- | --- |
| CA-5A-01…08 | Drawer: origen compra, timeline, movimientos, vida útil, empty states, comodato vacío pre-5B / vivo post-5B |
| CA-5B-01…05 | Bandeja Comodatos, estado abierto/cerrado, acceso ficha 360, E2E ciclo completo |

---

## 5. Deuda aceptada (P2/P3 — no bloqueante)

| ID | Severidad | Nota |
| --- | --- | --- |
| G6-P2-01 | P2 | 11 E2E preexistentes fallidos en compras/RFQ/proveedores (ajenos a 5A/5B) |
| G6-P3-01 | P3 | OpenAPI sin schema completo `SerializedAssetDetailRecord` (G5-05A-02) |
| G6-P3-02 | P3 | Paginación «Ver más» sin scroll infinito — suficiente para MVP |
| G6-P3-03 | P3 | Equipos pre-5B sin comodato histórico — copy operativo pendiente en runbook |

---

## 6. Decisión

**G6 GO** → G7 AI-EM-ARCH (re-verificación independiente + recomendación cierre CTO).
