# SPEC — PortalSidePeek a11y + PortalDataTableHead (portal-local)

**Versión:** 1.0  
**Estado:** Congelado para Fase E MOD06  
**Fecha:** 2026-07-22  
**Dueño de contrato:** AI-DS-OWNER  
**Congelado por:** AI-EM-ARCH (consulta [DS-OWNER](2ec5de81-f240-433c-9411-cd576fddf294) + desempate)  
**Prompt de fase:** [PROMPT-MOD06-UI-FASE-E-v1.0](../prompts/PROMPT-MOD06-UI-FASE-E-v1.0.md)  
**Carril:** rápido (sin cambio de marca, alcance ni boundary)

---

## 1. Premisa corregida (desempate EM-ARCH)

El prompt Fase E recomendaba envolver `@radix-ui/react-dialog` asumiendo que ese es el base del `Dialog` de `@iwana/ui`.

**Hecho verificado:** `packages/ui/src/components/Dialog.tsx` es implementación propia (`createPortal` + focus trap + Escape + restauración + scroll lock). En `@iwana/ui` solo hay Radix para `label` / `popover` / `slot`.

| Decisión | Veredicto |
| --- | --- |
| Introducir `@radix-ui/react-dialog` en Fase E | **Rechazado** — dependencia nueva → ADR / CTO |
| Corregir a11y de `PortalSidePeek` | **Aprobado** — espejo o composición del `Dialog` existente, o implementación manual equivalente |
| API pública de `PortalSidePeek` | **Estable** — sin breaking props |

---

## 2. Contrato `PortalSidePeek`

**Archivo:** `apps/portal/src/components/shared/portal-ui.tsx`

### 2.1 API pública (preservar)

| Prop | Tipo | Obligatorio |
| --- | --- | --- |
| `open` | `boolean` | sí |
| `onClose` | `() => void` | sí |
| `title` | `string` | sí |
| `description` | `ReactNode` | no |
| `eyebrow` | `string` | no |
| `children` | `ReactNode` | sí |
| `footer` | `ReactNode` | no |
| `className` | `string` | no |

No exponer props de Radix/`Dialog` en la superficie pública en esta fase. Si se compone `Dialog` internamente, el adaptador traduce `onOpenChange(false)` → `onClose()`.

### 2.2 Garantías a11y (paridad con `Dialog` de `@iwana/ui`)

- Al abrir: foco al primer focusable del panel (o contenedor `tabIndex={-1}`).
- Confinar Tab / Shift+Tab dentro del panel.
- Escape → `onClose` (solo capa superior si hay stacking).
- Al cerrar: restaurar foco al trigger previo.
- Scroll lock del `body` mientras `open`.
- `aria-labelledby` con **id único por instancia** (`useId` — cierra hallazgo 5).
- `aria-describedby` si hay `description`.
- Overlay clic → `onClose`; botón cerrar con `aria-label` en español.

### 2.3 Restricciones visuales (Firma iWana §2.7)

- Anclaje derecho, altura completa, `max-w-lg`.
- `shadow-iwana-soft`, borde izquierdo, header / body scroll / footer opcional.
- Eyebrow vía `portal-eyebrow`; tipografía de título actual.
- No centrar como modal; no cambiar tokens de marca; no inventar sombra/radio/color paralelo.

### 2.4 No-regresión

Test de teclado: Tab confinado + Escape cierra. Si un consumidor dependía del comportamiento roto (foco que *no* se movía), escalar a EM-ARCH — no absorber.

---

## 3. Contrato `PortalDataTableHead` (portal-local)

**Dónde:** `apps/portal/src/components/shared/portal-ui.tsx`  
**No** promover a `@iwana/ui` en Fase E (espera `DataTable` enterprise).

### 3.1 Anatomía

`<th>` con `scope` por defecto `"col"` y `className` base = `portalDataTableHeadClassName`.

### 3.2 Props mínimas

- Extiende `React.ThHTMLAttributes<HTMLTableCellElement>`.
- `children`
- `className?` (merge con el token)
- `scope?` — default `"col"`; override solo con justificación

### 3.3 Migración Fase E

Consumidores en `apps/portal/src/components/commercial/` migran  
`<th className={portalDataTableHeadClassName}>` → `<PortalDataTableHead>`.  
El class-token puede permanecer exportado para casos edge.

---

## 4. Consumidores conocidos (commercial)

**Side peek:** Bundles, Promotions, Compatibility, TaxApplication, TaxCatalog, PlanCatalog, AdditionalProducts, AdditionalServices.

**Tablas:** las 7 del módulo (incl. PlanCatalog que ya tenía `scope="col"`).

---

## 5. Notificación post-congelación

- **AI-FE-PLATFORM** — ejecuta H1, H3, H5 contra este contrato.
- **AI-SR-QA** — verifica tests de teclado y `scope="col"` por construcción.
