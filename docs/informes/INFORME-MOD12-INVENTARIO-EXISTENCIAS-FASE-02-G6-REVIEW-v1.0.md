# Informe G6 — MOD12 Existencias Fase 02 (experiencia, DS e identidad, QA)

**Version:** 1.0  
**Fecha:** 2026-07-18  
**Estado:** GO (condiciones remediadas por ejecutor 2026-07-18; ver addendum)  
**Protocolo:** Multiagente v1.2 etapa 6  
**Roles:** AI-PROD-UX · AI-DS-OWNER · AI-SR-QA  
**Entrada:** `INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-02-v1.0.md` (G5) + spec D-F2-1…5 / CA-F2-01…07  
**Prompt:** `docs/prompts/PROMPT-MOD12-EXISTENCIAS-REORDEN-FASE-02-v1.0.md`  
**Skills aplicadas:** `iwana-identity-ui-review` (modo review), `wcag-audit-patterns`, `system-vocabulary-review`  
**Modo de revisión:** código (read-only); E2E Playwright Existencias ejecutado post-review por el ejecutor  

---

## Addendum — remediación condiciones (2026-07-18)

El ejecutor (AI-SR-FULL / FE-PLATFORM) cerró las condiciones de §8:

| Condición | Estado | Evidencia |
| --- | --- | --- |
| DS-H1 `aria-live` barra | ✅ | `PurchaseSelectionBar` `role="status"` + `aria-live="polite"` |
| DS-H2 foco composer | ✅ | focus `#purchase-title` al consumir prefill |
| UX-H1 proveedor visible | ✅ | `supplierLabels` en `PurchaseComposerInitialValues` |
| UX-H2 Sin costo | ✅ | BE `estimatedLineValue: null` si cost 0; UI por `estimatedUnitCost` |
| UX-H3 pluralización | ✅ | «1 ítem» / «1 producto» |
| QA E2E | ✅ | Playwright Existencias **8/8** (valor Resumen + Reposición→composer→workbench) |

**Decisión G6 actualizada: GO** → listo para G7.

---

## 1. Resumen ejecutivo (review original)

La Fase 02 entrega un flujo operable **Reposición → composer de compras prellenado → workbench**, con anti doble pedido en backend y KPI de valor estimado en Resumen. No hay bloqueante de flujo ciego (acción primaria inoperable) ni violación de D-F2-1 (creación vía composer existente).

Sí hay **condiciones de cierre** antes de G7: (1) a11y del flujo no cumple del todo el contrato de diseño §4 (barra anunciada + foco al composer), (2) el nombre del proveedor preferido se pierde en el handoff al composer, (3) el label «Sin costo» no se muestra cuando el costo efectivo es 0, (4) E2E manual pendiente.

**Puntaje identidad/UX (DS-OWNER):** 67/100 (P0: 0, P1: 3, P2: 2, P3: 1) — banda «requiere trabajo antes de cerrar» si se aplican las condiciones; no exige rediseño.

---

## 2. Veredictos por rol

| Rol | Veredicto | Notas |
| --- | --- | --- |
| AI-PROD-UX | **GO condicionado** | Flujo principal correcto; handoff proveedor visible + copy «Sin costo» + pluralización son fricción importante |
| AI-DS-OWNER | **GO condicionado** | Tokens/primitives alineados; a11y del contrato §4 incompleta; sin P0 de identidad |
| AI-SR-QA | **GO condicionado** | CA-F2-01…06 en código/Jest; CA-F2-07 parcial (E2E manual no ejecutado); gaps a11y documentados |

---

## 3. Hallazgos por rol

### 3.1 AI-PROD-UX

#### Bloqueante

Ninguno. La tarea principal (seleccionar → generar → revisar en composer → crear) está cableada: `StockReplenishmentPanel` → `pendingComposerPrefill` → `PurchaseWorkspace.createInitialValues` → `openWorkbench(requestId)`.

#### Importante

| ID | Hallazgo | Evidencia | Impacto |
| --- | --- | --- | --- |
| UX-H1 | Nombre del proveedor preferido no llega al composer | `StockReplenishmentPanel` solo setea `suggestedPartyRefId`; `purchaseRequestLinesToDraft` resuelve `suggestedPartyName` vía `supplierLabels`, pero `loadData` no llama `loadSupplierLabels` para preferidos del catálogo. `PurchaseDraftLinesTable` muestra «Sin proveedor sugerido» aunque el ID exista | El operador ve en Reposición «Proveedor Alfa» y en Compras «Sin proveedor sugerido»; fricción y desconfianza en el prefill (CA-F2-03 parcial en UX visible) |
| UX-H2 | Costo 0 no muestra «Sin costo» | BE: `estimatedUnitCost: null` si costo 0, pero `estimatedLineValue: '0.00'` (`replenishment.service.ts`). UI: formatea `estimatedLineValue` si `!= null` → moneda $0 en lugar de «Sin costo» (D-F2-4 label) | Lectura engañosa del costo estimado en la tabla de Reposición |
| UX-H3 | Pluralización en título autogenerado | `Reposición sugerida {fecha} — ${count} ítems…` produce «1 ítems»; justificación «1 productos» | Copy incorrecto en sentence case; afecta la primera impresión del composer |

#### Deuda aceptada

| ID | Hallazgo | Notas |
| --- | --- | --- |
| UX-D1 | Criticidad `out`: «Sin stock» en Reposición vs «Agotado» en Por producto | Misma semántica, dos labels; unificar en fase de vocabulario transversal |
| UX-D2 | Tipo visible en composer: «Compra para bodega» (label canónico de `REPLENISHMENT`) mientras el título dice «Reposición sugerida…» | No es enum crudo; posible alinear wording en copy futuro |
| UX-D3 | E2E manual / Playwright del flujo completo | Ya registrada en informe G5; no bloquea diseño, sí cierra evidencia viva |

### 3.2 AI-DS-OWNER (identidad + contrato visual)

#### Bloqueante

Ninguno (P0).

#### Importante (P1)

| ID | Hallazgo | Evidencia | Recomendación |
| --- | --- | --- | --- |
| DS-H1 | Barra de selección no anunciada | Spec §4: «barra de selección anunciada». `PurchaseSelectionBar` / `PortalActionToolbar` sin `role="status"` / `aria-live` | Anunciar cambios de conteo (`aria-live="polite"` en el span de conteo o status region) |
| DS-H2 | Sin foco programático al abrir el composer | Spec §4: «foco al abrir el composer». `PurchaseWorkspace` abre create mode; `PurchaseRequestComposer` / `PurchaseCreateModeShell` sin `.focus()` / `autoFocus` en título u heading | Tras `openCreateMode` + prefill, mover foco al `h1` del header o al input Título |

#### Deuda aceptada (P2/P3)

| ID | Hallazgo | Severidad |
| --- | --- | --- |
| DS-D1 | Columnas numéricas de Reposición sin `tabular-nums` / `font-mono` (sí presentes en draft de compras) | P3 |
| DS-D2 | Valor por categoría embebido en `secondary` del breakdown (legible, denso) | P2 aceptable para F2 |
| DS-D3 | Deuda residual Fase 1 (skeleton listados, drawer a11y) sin regresión nueva en F2 | Fuera de alcance F2 |

**Lo que sí está alineado:** tab «Reposición» con `portalModuleTabTriggerClassName`; estados empty/loading/error con `PortalEmptyState` / `PortalSkeletonBlock` / `PortalAlert`; KPI con `portalMetricCard*` + `portal-eyebrow-muted`; badges de criticidad con variantes `error`/`warning` (no lima como urgencia); checkboxes con `interactiveFocusClassName` y `aria-label` por ítem.

### 3.3 AI-SR-QA

#### Bloqueante

Ninguno de regresión funcional demostrable en código/Jest. **A11y crítico del contrato §4 incompleto** → tratado como condición (no como fallo ciego del CTA).

#### Importante

| ID | Hallazgo | Evidencia |
| --- | --- | --- |
| QA-H1 | A11y flujo Reposición incompleto vs AC de diseño | Checkboxes OK; barra sin live region; foco composer ausente |
| QA-H2 | CA-F2-03 UX visible del proveedor | ID prellenado (PASS contractual estricto); nombre visible FAIL parcial |
| QA-H3 | E2E manual no ejecutado | Informe G5: «No ejecutado»; Swagger cubierto por spec, no sustituye smoke vivo |

#### Deuda aceptada

| ID | Hallazgo |
| --- | --- |
| QA-D1 | Suites Jest API/portal reportadas PASS en G5 (no re-ejecutadas en esta review read-only) |
| QA-D2 | Spec de `PurchaseWorkspace` mockea tipo con enum crudo en texto de test — no afecta UI producto |

---

## 4. Veredicto CA-F2-01…07

| CA | Estado | Evidencia |
| --- | --- | --- |
| CA-F2-01 | **Pass** | `ReplenishmentService.listSuggestions`: filtro `available + pending < reorderPoint`, fórmula D-F2-3, orden por criticidad; cubierto en `replenishment.service.spec.ts` |
| CA-F2-02 | **Pass** | Pendiente = OC `APPROVED`/`PARTIALLY_RECEIVED` + líneas solicitud `OPEN`/`PENDING_QUOTE`/`AWARDED`; specs anti doble pedido |
| CA-F2-03 | **Parcial** | Prefill `REPLENISHMENT` / `REPLENISHMENT_SUGGESTION` / `suggestedPartyRefId` + cantidades editables (`StockReplenishmentPanel.spec`). Fallo UX: nombre de proveedor no visible en composer (UX-H1). Usuario sí puede editar antes de crear |
| CA-F2-04 | **Pass** (código) | `PurchaseWorkspace.handleCreateRequest` → `openWorkbench(requestId)` si `result.ok && requestId`. **Sin smoke E2E manual** en esta sesión |
| CA-F2-05 | **Pass** | BE `estimatedTotalValue` + `estimatedValue` por categoría; portal KPI «Valor estimado de inventario» + secondary en breakdown; `formatInventoryCurrency`. Label «Sin costo» en tabla Reposición **parcial** (UX-H2) — no invalida el KPI del Resumen |
| CA-F2-06 | **Pass** | GET `@Roles(ADMIN, NOC, SUPPORT)`; HTTP spec 200/403; creación conserva `POST /purchasing/requests` |
| CA-F2-07 | **Parcial** | G5: Jest módulo inventario API 235 PASS, portal focal PASS, lint/typecheck PASS, swagger path documentado. **Falta E2E manual** declarado en G5 |

---

## 5. Accesibilidad WCAG 2.2 AA — flujo Reposición

| Control | Resultado | Criterio | Evidencia |
| --- | --- | --- | --- |
| Checkboxes con nombre accesible | **Pass** | 1.3.1 / 4.1.2 | `aria-label` «Seleccionar todos…» y «Seleccionar {SKU} {nombre}»; inputs de cantidad con `aria-label` |
| Foco visible en interactivos de tabla | **Pass** (básico) | 2.4.7 | `interactiveFocusClassName` en checkboxes; `Input` del DS para cantidades |
| Barra de selección anunciada | **Fail** | 4.1.3 Status Messages | Conteo «N productos seleccionados» sin `aria-live` / `role="status"` |
| Foco al abrir composer tras generar | **Fail** | 2.4.3 Focus Order (contexto nuevo) | Cambio de tab + modo create sin mover foco al composer/header |
| Estados loading / empty / error | **Pass** | 1.3.1 / 4.1.3 (errores) | Skeleton; empty «Sin ítems bajo punto de reorden»; `PortalAlert` con `role="alert"` |
| Contraste badges criticidad | **Pass** (asumido vía Badge DS) | 1.4.3 | Variantes `error`/`warning` del sistema; sin `text-iwana-secondary` suelto en textos de acento nuevos |

**Veredicto a11y del flujo:** no cumple el contrato explícito de la spec §4. No impide uso a usuarios videntes con teclado (pueden tabular), pero **no es AA completo** para mensajes de estado ni foco de contexto. Condición de cierre G6→G7.

---

## 6. Vocabulario

| Elemento | Evaluación |
| --- | --- |
| Tab / empty / CTA / KPI | Sentence case español correcto: «Reposición», «Sin ítems bajo punto de reorden», «Generar solicitud de compra (N)», «Valor estimado de inventario» |
| Criticidad | Mapeada vía `getReplenishmentCriticalityLabel` — sin enums crudos en UI |
| `requestType` / `sourceKind` | Enums solo en código/contratos; UI usa labels («Compra para bodega», «Sugerencia») |
| Defectos copy | «1 ítems» / «1 productos» (UX-H3); inconsistencia «Sin stock» vs «Agotado» (UX-D1) |
| Errores API | Mensajes amigables en `mapInventoryError` del panel |

**Veredicto vocabulario:** cumple regla de hierro (sin enums crudos visibles). Deuda menor de pluralización y alineación de sinónimos de criticidad.

---

## 7. Trazabilidad D-F2

| Decisión | Cumplimiento |
| --- | --- |
| D-F2-1 Sin endpoint de creación propio | **Sí** — composer + `POST /purchasing/requests` |
| D-F2-2 Anti doble pedido | **Sí** — BE + tests |
| D-F2-3 Cantidad sugerida / MOQ / múltiplo | **Sí** — BE + tests |
| D-F2-4 Fallback costo + label sin costo | **Parcial** — cálculo OK; label UI en tabla Reposición incorrecto cuando costo = 0 |
| D-F2-5 Prefill sin params URL | **Sí** — `pendingComposerPrefill` en `InventoryClient` |

---

## 8. Condiciones para elevar a GO pleno / G7

Orden sugerido (esfuerzo S–M):

1. **A11y (DS-H1 + DS-H2):** `aria-live` en barra de selección; foco al header/título del composer al consumir `createInitialValues`.
2. **Proveedor (UX-H1):** al generar, sembrar `supplierLabels` con `preferredSupplier.displayName` o pasar el nombre al draft (`suggestedPartyName`).
3. **Sin costo (UX-H2):** en UI preferir `estimatedUnitCost == null` → «Sin costo» (o nullificar `estimatedLineValue` en BE cuando unit cost es 0).
4. **Copy (UX-H3):** pluralización «ítem(s)» / «producto(s)».
5. **QA:** smoke E2E manual (o Playwright mínimo) Reposición → composer → crear → workbench + KPI valor en Resumen.

Ningún fix se aplicó en esta sesión (review prioriza informe; no hay bloqueante trivial de 1 línea de flujo).

---

## 9. Decisión G6

### **G6: GO condicionado**

- **GO** para continuar hacia remediación corta y G7: alcance F2 entregado, sin P0 de flujo ni de identidad, CA centrales en pass/parcial documentado.
- **Condicionado** a cerrar DS-H1, DS-H2, UX-H1 y UX-H2 (y preferiblemente UX-H3 + smoke E2E) antes del dictamen G7 de cierre de fase.

Si EM-ARCH prefiere no acumular deuda a11y del contrato §4, el veredicto equivalente operativo es **NO-GO hasta remediación S** de DS-H1/DS-H2 + UX-H1; el equipo de review unifica en **GO condicionado** por paridad con G6 Fase 1 (deuda a11y residual aceptada con condiciones explícitas).

---

## 10. RACI de este gate

| Rol | Responsabilidad |
| --- | --- |
| AI-PROD-UX | Flujo, handoff composer, copy operativo |
| AI-DS-OWNER | Identidad, tokens, a11y AA del contrato §4 |
| AI-SR-QA | Matriz CA, evidencia Jest/Swagger, gaps E2E |
| AI-SR-FULL / FE | Remediaciones condicionantes (fuera de esta sesión) |
| AI-EM-ARCH | Consolida G7 tras condiciones |

---

**Path del informe:** `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-02-G6-REVIEW-v1.0.md`
