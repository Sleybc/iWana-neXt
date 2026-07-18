# INFORME — MOD12 Compras · Auditoría UX / UI / vocabulario

**Versión:** 1.0
**Estado:** Review G6 — pendiente priorización / prompt de remediación
**Fecha:** 2026-07-17
**Módulo:** MOD12 Inventario / SCM — Compras (portal)
**Modo:** código (skills `iwana-identity-ui-review` + `system-vocabulary-review`)
**Protocolo:** [Protocolo Multiagente v1.2](../roles/Protocolo_Colaboracion_Multiagente_v1.md)
**Roles en esta pasada:** AI-PROD-UX · AI-DS-OWNER · (consulta FE-PLATFORM) · orquestación EM-ARCH

## Resumen ejecutivo

El workbench de Compras sostiene el flujo punta a punta (cotizar → aprobar → adjudicar → órdenes → recibir) con primitives del portal y sin violaciones duras de contraste/`dark:bg-gray-*`. El riesgo dominante es **fricción de journey + vocabulario técnico**: CTAs acoplados a pestaña, Cotizar sobrecargado, comparación sin proveedor, diálogo anidado al generar OC, y mezcla «oferta / cotización / RFQ / OC / landed».

**Puntaje UI:** 61/100 (P0: 0, P1: 4, P2: 5, P3: 3) → `100 − 40 − 15 − 3`
**Puntaje vocabulario (cualitativo):** no apto para cierre G6 hasta P0/P1 de copy.

**Tarea principal:** trabajar una solicitud de punta a punta.

## Protocolo multiagente (esta pasada)

| Rol | Responsabilidad en la review | Entregable |
| --- | --- | --- |
| AI-PROD-UX | Flujo, carga cognitiva, next-action, empty states | Hallazgos Usabilidad/UX |
| AI-DS-OWNER | Tokens, primitives, Firma iWana, estados requeridos | Hallazgos Identidad/Ingeniería/contrato |
| system-vocabulary | Copy humano, sin enums/siglas internas | Hallazgos de lenguaje |
| AI-FE-PLATFORM | (siguiente) remediación de código | Prompt G4 de pulido |
| AI-SR-QA | (siguiente) RTL/E2E de copy y a11y foco | CA de remediación |
| AI-EM-ARCH | Prioriza fase de remediación vs deuda | Gate G4 |

## Hallazgos críticos (P0)

Ninguno de bloqueo total de tarea. Hay **P0 de vocabulario** (claridad / fuga de IDs) listados abajo como P0-V.

### [P0-V][Vocabulario] «landed» y `partyRefId` visibles
- **Evidencia:** `ApprovalDecisionPanel.tsx` («Monto estimado (landed)»); `QuoteShippingFields.tsx`; fallbacks `order.partyRefId` en lista Órdenes y selector de recepción.
- **Impacto:** Comprador no técnico no entiende el monto; puede ver UUID de proveedor.
- **Recomendación:** «Monto estimado (con envío)» / «Total con envío»; fallback «Proveedor no identificado».
- **Esfuerzo:** S

## Hallazgos P1

### [P1][Usabilidad] CTA primaria solo si la pestaña activa coincide
- **Evidencia:** footer de `PurchaseRequestWorkbenchDrawer.tsx` gated por `activeTab`.
- **Impacto:** Se ve el contenido del paso sin la acción principal.
- **Recomendación:** CTA de etapa según next-action / estado, no solo tab.
- **Esfuerzo:** M

### [P1][Accesibilidad] Diálogos anidados workbench + OC
- **Evidencia:** `PurchaseWorkspace.tsx` abre dos `Dialog` a la vez.
- **Impacto:** Foco/Escape ambiguos en el paso Generar órdenes.
- **Recomendación:** Un solo overlay; OC como panel del workbench o cerrar el primero.
- **Esfuerzo:** M

### [P1][Usabilidad] Comparación sin nombre de proveedor
- **Evidencia:** `QuoteComparisonPanel.tsx` solo `quoteNumber` + montos.
- **Impacto:** No se decide «quién ofrece mejor» de un vistazo.
- **Recomendación:** Nombre de proveedor + número; prop `supplierLabels`.
- **Esfuerzo:** S

### [P1][Accesibilidad] Chips / links sin foco visible
- **Evidencia:** chips «Usar {quote}» en `AwardLinesPanel`; «Usar esta cotización» en `QuoteComparisonPanel`.
- **Recomendación:** `interactiveFocusClassName` o `Button` del sistema.
- **Esfuerzo:** S

### [P1][Vocabulario] RFQ / OC / oferta↔cotización
- **Evidencia:** títulos «RFQ», botones «Aprobar OC», mezcla «Nueva oferta» vs «Registrar cotización».
- **Recomendación:** Convención única abajo.
- **Esfuerzo:** S–M

## Hallazgos P2 (selección)

| Tema | Evidencia | Remedio | Esfuerzo |
| --- | --- | --- | --- |
| Cotizar sobrecargado (RFQ + comparación + manual) | Workbench tab Cotizar | Un camino dominante; secundario colapsado | M |
| Tabs planos sin gramática de workflow | 7 tabs genéricos | Stepper / 3 estados Firma iWana | L |
| Textareas locales vs `portalTextareaClassName` | Varios paneles | Unificar primitive | S |
| Recepción CTA fuera del footer sticky | `GoodsReceiptPanel` | Alinear al footer del workbench | M |
| «impactar inventario», «Necesidades abastecibles», «Nivel de política» | next-action / labels | Copy accionable | S |

## Hallazgos P3 (agregados)

`tabular-nums` en montos; badge «Resumen rápido» uppercase; skeleton genérico al cargar detalle.

## Convención de vocabulario (congelar)

| Concepto | Usar en producto |
| --- | --- |
| Documento del proveedor | **Cotización** (no «oferta» en UI final) |
| Ronda formal | **Solicitud / ronda de cotización** (no «RFQ») |
| Pedido al proveedor | **Orden de compra** (no «OC») |
| Productos + flete | **Total con envío** (no «landed») |
| Proveedor | Nombre visible (nunca `partyRefId`) |
| Nivel | Comprador / Jefe de compras / Dirección (mapa completo) |

## Quick wins (orden sugerido)

1. Copy P0: landed → con envío; fallback proveedor; mapa approvalLevel.
2. Proveedor en `QuoteComparisonPanel` + foco en chips.
3. Unificar oferta→cotización y RFQ/OC en strings visibles.
4. `portalTextareaClassName` + `tabular-nums`.

## Mejoras estratégicas (fase siguiente)

1. Shell de journey: stepper + CTA desacoplada de tab (PROD-UX + FE).
2. Un solo overlay para generar órdenes (DS-OWNER contrato side-peek / FE).
3. Primitive «fila operativa» en `portal-ui` (DS-OWNER → FE).

## Por verificar

1. Foco/Escape real con dos diálogos abiertos.
2. Cobertura runtime de `supplierLabels` vs UUID.
3. Contraste badges prioridad en dark.

## Veredicto

**Aprobada con cambios (bloqueantes de copy + quick wins P1 a11y/usabilidad).** No requiere rediseño total de paneles, sí **remediación de shell + unificación de lenguaje** antes de cerrar G6 de experiencia del módulo Compras.

## Siguiente gate

EM-ARCH: emitir prompt G4 «MOD12 Compras · Pulido UX/vocabulario Fase 23» con alcance = quick wins + comparación con proveedor + CTAs; dejar stepper/overlay como Fase 24 si se prioriza.

## Addendum — pasada final skills (2026-07-17)

Reconfirmado con `iwana-identity-ui-review` + `ui-ux-pro-max` (subordinada): mismos P0–P1; `window.confirm` en recepción entra en Fase 23; stepper Cotizar queda Fase 24. Prompt: [PROMPT Fase 23](../prompts/PROMPT-MOD12-COMPRAS-PULIDO-UX-VOCABULARIO-FASE-23-v1.0.md).

### Remediación Fase 23 (2026-07-17)

Cerrada en [INFORME Fase 23](./INFORME-MOD12-COMPRAS-PULIDO-UX-VOCABULARIO-FASE-23-v1.0.md): copy, comparación con proveedor, foco, CTA next-action, overlay único OC, primitives. Stepper Cotizar permanece en Fase 24.

### Gate Fase 24 (GO CTO 2026-07-17 — cerrada)

Shell de journey (3 fases) + progressive disclosure de Cotizar:

- Spec: [2026-07-17-mod12-compras-journey-shell-cotizar-fase24-design.md](../specs/2026-07-17-mod12-compras-journey-shell-cotizar-fase24-design.md) — **aprobada CTO**
- Prompt: [PROMPT-MOD12-COMPRAS-JOURNEY-SHELL-COTIZAR-FASE-24-v1.0.md](../prompts/PROMPT-MOD12-COMPRAS-JOURNEY-SHELL-COTIZAR-FASE-24-v1.0.md)
- Informe: [INFORME Fase 24](./INFORME-MOD12-COMPRAS-JOURNEY-SHELL-COTIZAR-FASE-24-v1.0.md)
