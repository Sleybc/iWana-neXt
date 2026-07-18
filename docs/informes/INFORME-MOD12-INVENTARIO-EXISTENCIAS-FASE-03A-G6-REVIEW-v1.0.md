# Informe G6 — MOD12 Existencias Fase 03A (experiencia, DS e identidad, QA)

**Version:** 1.0  
**Fecha:** 2026-07-18  
**Estado:** GO (condiciones remediadas en la misma sesión; ver addendum)  
**Protocolo:** Multiagente v1.2 etapa 6  
**Roles:** AI-PROD-UX · AI-DS-OWNER · AI-SR-QA  
**Entrada:** `INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-03A-v1.0.md` (G5) + spec D-F3A-1…10 / CA-F3A-01…09  
**Prompt:** `docs/prompts/PROMPT-MOD12-EXISTENCIAS-CONTEO-FISICO-FASE-03A-v1.0.md`  
**Skills aplicadas:** `iwana-identity-ui-review` (modo review), `wcag-audit-patterns`, `system-vocabulary-review`  
**Modo de revisión:** código + Playwright Conteos / Existencias

---

## Addendum — remediación y evidencia (2026-07-18)

| Condición / ítem | Estado | Evidencia |
| --- | --- | --- |
| Migración 071 en schema tenant | ✅ | `stock_counts` + `stock_count_lines` + `CreateStockCounts0710000000000` en `tenant_iwana` |
| E2E crear→capturar→cerrar (ADMIN) | ✅ | Playwright `Portal Inventario / Conteos` |
| E2E NOC sin «Cerrar conteo» + cancelar | ✅ | Mismo describe |
| Existencias (ajuste ADMIN + Reposición «Agotado») | ✅ | 8/8 |
| Categorías en formulario de Conteos | ✅ | `loadCategories` también al activar tab `counts` |
| `canClose` / `canAdjust` por rol ADMIN | ✅ | `InventoryClient` + sesión E2E ADMIN |

**Decisión G6: GO** → listo para G7.

---

## 1. Resumen ejecutivo

La Fase 03A entrega un flujo operable **Conteos → crear → capturar → cerrar (ADMIN) / cancelar**, con documento `CNT-######`, KPIs por estado, labels en español y cierre que emite ajuste de ledger (`inventory.cycle-count` / `CYCLE_COUNT`). No hay bloqueante de flujo ciego ni violación de D-F3A-6/8 (RBAC close solo ADMIN; pestaña de primer nivel).

La deuda residual es menor: confirmaciones vía `window.confirm` (paridad con otros flujos operativos) y ausencia de foco automático al primer campo al abrir «Nuevo conteo».

**Puntaje identidad/UX (DS-OWNER):** 78/100 (P0: 0, P1: 0, P2: 1, P3: 2) — banda «aceptable para cerrar» con deuda no bloqueante.

---

## 2. Veredictos por rol

| Rol | Veredicto | Notas |
| --- | --- | --- |
| AI-PROD-UX | **GO** | Flujo principal cableado; close oculto a NOC; aviso post-cierre visible |
| AI-DS-OWNER | **GO** | Tokens/primitives `Portal*`, badges y tabla alineados; sin P0/P1 |
| AI-SR-QA | **GO** | CA-F3A-01…09 cubiertos en Jest + E2E; migración 071 verificada en DB |

---

## 3. Hallazgos por rol

### 3.1 AI-PROD-UX

#### Bloqueante

Ninguno.

#### Importante (remediado)

| ID | Hallazgo | Remedio |
| --- | --- | --- |
| UX-H1 | Selector de categoría vacío si el operador no visitó Catálogo antes | `loadCategories` también cuando `activeTab === 'counts'` |

#### Deuda aceptada

| ID | Hallazgo | Notas |
| --- | --- | --- |
| UX-D1 | Confirmación de cierre/cancelación con `window.confirm` | Funcional; candidato a diálogo `Portal` en pulido transversal |
| UX-D2 | Sin foco inicial al combobox Bodega al entrar a crear | No bloquea; mejora AA de contexto |

### 3.2 AI-DS-OWNER

#### Bloqueante / P0–P1

Ninguno.

#### Deuda

| ID | Hallazgo | Severidad |
| --- | --- | --- |
| DS-D1 | KPIs con contenedores bordeados (patrón operativo aceptable) | P3 |
| DS-D2 | `aria-label` del Select Bodega queda subordinado al `label` («Bodega») | P3 — no rompe uso; nombre accesible correcto vía label |

### 3.3 AI-SR-QA

| CA | Evidencia |
| --- | --- |
| CA-F3A-01…06 | `cycle-count.service.spec.ts` + servicio |
| CA-F3A-07 | HTTP close solo ADMIN; UI `canClose`; E2E NOC sin botón |
| CA-F3A-08 | Migración 071 + runner; tablas presentes en `tenant_iwana` |
| CA-F3A-09 | Gates G5 + Playwright Conteos 2/2 y Existencias 8/8 |

---

## 4. Vocabulario visible

| Concepto | Label | OK |
| --- | --- | --- |
| Tab | Conteos | ✅ |
| Estados | En conteo / Cerrado / Cancelado | ✅ |
| Acciones | Nuevo conteo / Guardar cantidades / Cerrar conteo / Cancelar conteo | ✅ |
| Criticidad F2 (regresión) | Agotado (no «Sin stock») | ✅ E2E |

Sin enums crudos en UI final.

---

## 5. Accesibilidad (muestra)

| Control | Resultado |
| --- | --- |
| Tab Conteos + deep-link `tab=counts` | OK |
| Combobox Bodega / inputs de cantidad con label | OK |
| Close confirmado antes de mutar stock | OK (`confirm`) |
| Cerrar oculto sin permiso | OK (`canClose`) |

---

## 6. Decisión G6

### **G6: GO**

Lista para **G7** (AI-EM-ARCH recomienda; CTO aprueba). Deuda UX-D1/D2 y DS-D1/D2 no bloquean cierre de fase.

**Path del informe:** `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-03A-G6-REVIEW-v1.0.md`
