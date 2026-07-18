# PROMPT DE EJECUCIÓN — MOD12 Compras · Journey shell + Cotizar — Fase 24

**Versión:** 1.0  
**Gate:** G4/G5 cerrado — GO CTO 2026-07-17 · implementado  
**Ejecutor:** AI-FE-PLATFORM (portal). Matriz D3 congelada por CTO (no alterar sin escalar).  
**Spec (leer primero):** [2026-07-17-mod12-compras-journey-shell-cotizar-fase24-design.md](../specs/2026-07-17-mod12-compras-journey-shell-cotizar-fase24-design.md)  
**Predecesor cerrado:** [INFORME Fase 23](../informes/INFORME-MOD12-COMPRAS-PULIDO-UX-VOCABULARIO-FASE-23-v1.0.md)  
**Precedencia:** `AGENTS.md` → esta spec → este prompt.  
**Skills:** `iwana-identity-ui-review`, `senior-ui-systems-designer`, `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `core-components`, `tailwind-patterns`, `system-vocabulary-review`, `testing-patterns`. `ui-ux-pro-max` solo como checklist subordinado a iWana.

---

## 0. Objetivo en una línea

Sustituir la navegación plana de 7 tabs del workbench por un **shell de 3 fases** (Preparar / Decidir / Abastecer) y aplicar **progressive disclosure** en Cotizar, sin tocar backend.

---

## 1. Restricciones (STOP si se violan)

1. **NO** modificar API, DTOs, OpenAPI, migraciones ni workers.  
2. **NO** inventar tokens nuevos en `@iwana/ui` / Tailwind config. Reutilizar `Tabs`, `Button`, `PortalAlert`, `interactiveFocusClassName`, patrones de accordion/`details` ya usados en portal.  
3. **NO** romper CA-23 (copy, overlay único OC, next-action, proveedor en comparación, focus rings).  
4. **NO** eliminar paneles: solo reagrupar. Los 7 contenidos (`summary`…`receipts`) siguen existiendo.  
5. **NO** reintroducir «RFQ», «OC», «oferta», «landed» ni `partyRefId` crudo en UI.  
6. Texto visible en **español, sentence case**.  
7. D1–D3 aprobados por CTO (2026-07-17). Si la implementación necesita alterar la matriz → **STOP** y escalar a AI-EM-ARCH.

---

## 2. Entregables

| # | Entregable |
| --- | --- |
| A | Helpers de fase en `purchase-workbench.ts` + tests |
| B | Shell 3 fases en `PurchaseRequestWorkbenchDrawer.tsx` |
| C | Progressive disclosure zona Cotizar (matriz D3) |
| D | RTL CA-24 + typecheck |
| E | Informe `docs/informes/INFORME-MOD12-COMPRAS-JOURNEY-SHELL-COTIZAR-FASE-24-v1.0.md` |

---

## 3. Implementación

### 3.1 `purchase-workbench.ts`

Añadir (nombres orientativos; alinear al estilo del archivo):

```ts
export type PurchaseWorkbenchPhase = 'prepare' | 'decide' | 'fulfill';

export const PURCHASE_WORKBENCH_PHASE_LABELS: Record<PurchaseWorkbenchPhase, string> = {
  prepare: 'Preparar',
  decide: 'Decidir',
  fulfill: 'Abastecer',
};

export const PURCHASE_WORKBENCH_PHASE_TABS: Record<PurchaseWorkbenchPhase, PurchaseWorkbenchTab[]> = {
  prepare: ['summary', 'lines'],
  decide: ['cotizar', 'approval', 'awards'],
  fulfill: ['orders', 'receipts'],
};

export function getPurchaseWorkbenchPhase(tab: PurchaseWorkbenchTab): PurchaseWorkbenchPhase;
export function getSuggestedPurchaseWorkbenchPhase(
  detail: PurchaseRequestDetailRecord | null,
): PurchaseWorkbenchPhase;
```

- `getSuggestedPurchaseWorkbenchPhase` = fase de `getPurchaseNextAction(detail)?.suggestedTab` (default `prepare`).  
- Tests unitarios del mapeo tab↔fase y fase sugerida por status (extender `purchase-workbench.spec.ts`).

### 3.2 Shell — `PurchaseRequestWorkbenchDrawer.tsx`

1. Navegación primaria: control de **3 fases** (no 7 `TabsTrigger` de primer nivel).  
2. Sub-navegación: solo tabs de `PURCHASE_WORKBENCH_PHASE_TABS[activePhase]`.  
3. Al cambiar de fase, si el `activeTab` actual no pertenece a la fase, seleccionar el primer tab de esa fase **o** el `suggestedTab` si cae en la fase.  
4. Al abrir/cargar detalle: sincronizar fase con `getSuggestedPurchaseWorkbenchPhase`.  
5. Deshabilitar avance a fases “futuras” cuando el next-action aún no las habilita (definir con la matriz de la spec; mínimo: no forzar enable de `fulfill` si la solicitud no está `APPROVED` / `CONVERTED_TO_PO`). Revisión de fases pasadas siempre permitida.  
6. Mantener banner + footer next-action F23; evitar tres CTAs primarios simultáneos (banner secondary / footer primary, o unificar según DS).  
7. a11y: roles/labels claros («Fase del flujo», «Sección Preparar», etc.); foco visible.

### 3.3 Progressive disclosure — zona Cotizar

En el `TabsContent`/`panel` de `cotizar` (puede ser helper local en el drawer o wrapper pequeño):

1. Implementar la matriz D3 de la spec (`hasActiveRfq` → invitaciones; else `quotes.length` → comparación; else `canAddQuote` → manual).  
2. Bloques no primarios: colapsados por defecto, expansibles, con título humano.  
3. Preservar C1: alta manual bloqueada con alerta si hay ronda activa.  
4. No cambiar contratos de `RfqInvitationsPanel` / `QuoteComparisonPanel` salvo props de presentación si hacen falta.

### 3.4 Tests (mínimo)

| Caso | Expectativa |
| --- | --- |
| Shell | 3 botones/tabs de fase; no 7 triggers de primer nivel con labels Resumen…Recepciones |
| Apertura DRAFT | Fase Decidir (o la que mapee next-action a `cotizar`) |
| Apertura APPROVED con awards pendientes | Fase Decidir + sub-tab Adjudicación o fase correcta según next-action |
| Cotizar + RFQ activa | Invitaciones visibles/expandidas; manual no como formulario paralelo expandido |
| Cotizar + quotes sin RFQ activa | Comparación primaria |
| Regresión | CA-23-04/05 siguen verdes en suites existentes |

---

## 4. Verificación

```bash
pnpm --filter @iwana/portal exec jest --testPathPattern="purchase-workbench|PurchaseRequestWorkbenchDrawer|RfqInvitationsPanel|QuoteComparisonPanel|ApprovalDecisionPanel" --no-coverage
pnpm --filter @iwana/portal exec tsc --noEmit
```

---

## 5. Informe de cierre

Crear/actualizar:

`docs/informes/INFORME-MOD12-COMPRAS-JOURNEY-SHELL-COTIZAR-FASE-24-v1.0.md`

Con: objetivo, decisiones D1–D3 aplicadas, tabla CA-24, resultados de verificación, deuda restante (side-peek DS, fila operativa).

Actualizar addendum en [auditoría UX](../informes/INFORME-MOD12-COMPRAS-UX-UI-VOCABULARIO-AUDITORIA-v1.0.md) apuntando al informe F24 al cerrar.

---

## 6. Definition of Done

- [x] CA-24-01…10 cumplidos  
- [x] Suites §4 en verde + typecheck  
- [x] Informe vivo F24  
- [x] Sin regresiones F20–F23 (overlay, copy, next-action)
