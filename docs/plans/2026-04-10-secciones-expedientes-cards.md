# Secciones del Expediente — Cards estilo Prototipo — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el acordeón del tab Secciones del expediente por cards estilo prototipo con secciones cerradas como chips minimales con "+" y animación suave al expandir. Grid 2 columnas adaptativo.

**Architecture:** Refactor `tabSecciones` (737 líneas) en componentes independientes que usan `SectionAccordion` de `@iwana/ui` con variante `card`. Extraer cada sección a su propio componente. Migrar estado de `expandedSection: string | null` a `expandedSections: Set<SectionId>` para permitir múltilpes secciones abiertas.

**Tech Stack:** React, TypeScript, Next.js App Router, Tailwind CSS, @iwana/ui (SectionAccordion, Input, Select, Button)

---

## File Structure

| File                                                                                  | Action | Responsibility                                                                        |
| ------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------- | --------------------------------- |
| `packages/ui/src/components/SectionAccordion.tsx`                                     | Modify | Agregar prop `variant: 'default'                                                      | 'card'` con estilos del prototipo |
| `apps/portal/src/components/crm/expedientes/sections/ExpedienteSections.tsx`          | Create | Contenedor grid 2 columnas, estado `expandedSections`                                 |
| `apps/portal/src/components/crm/expedientes/sections/IdentificationSection.tsx`       | Create | Sección Identificación con lock/unlock                                                |
| `apps/portal/src/components/crm/expedientes/sections/ContactSection.tsx`              | Create | Sección Contacto                                                                      |
| `apps/portal/src/components/crm/expedientes/sections/LocationSection.tsx`             | Create | Sección Ubicación                                                                     |
| `apps/portal/src/components/crm/expedientes/sections/CommercialInterestSection.tsx`   | Create | Sección Interés del cliente                                                           |
| `apps/portal/src/components/crm/expedientes/sections/TechnicalFeasibilitySection.tsx` | Create | Sección Viabilidad técnica (checkbox grids)                                           |
| `apps/portal/src/components/crm/expedientes/sections/LegalConsentSection.tsx`         | Create | Sección Consentimiento                                                                |
| `apps/portal/src/components/crm/expedientes/sections/BillingSection.tsx`              | Create | Sección Facturación                                                                   |
| `apps/portal/src/components/crm/expedientes/sections/InstallationSection.tsx`         | Create | Sección Instalación                                                                   |
| `apps/portal/src/components/crm/expedientes/sections/types.ts`                        | Create | Tipos compartidos: SectionId, SectionConfig, FieldLabels, etc.                        |
| `apps/portal/src/components/crm/expedientes/sections/constants.ts`                    | Create | Constantes extraídas: SECTIONS, FIELD_LABELS, FIELD_PLACEHOLDERS, etc.                |
| `apps/portal/src/components/crm/expediente/sections/SectionFieldRenderer.tsx`         | Create | Renderer genérico de campos (Input/Select/Checkbox grid)                              |
| `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`                         | Modify | Reemplazar `tabSecciones` con componente `<ExpedienteSections>`, eliminar ~737 líneas |

---

### Task 1: Agregar variante `card` al componente `SectionAccordion`

**Files:**

- Modify: `packages/ui/src/components/SectionAccordion.tsx`

- [ ] **Step 1: Agregar prop `variant` al tipo `SectionAccordionProps`**

Agregar `'default' | 'card'` como prop opcional con default `'default'`:

```tsx
interface SectionAccordionProps {
  items: SectionAccordionItemProps[];
  defaultOpen?: string;
  openId?: string | null;
  onOpenChange?: (id: string | null) => void;
  variant?: 'default' | 'card';
  className?: string;
}
```

- [ ] **Step 2: Implementar estilos de variante `card`**

En variante `card`, secciones cerradas (no expandidas, `isEmpty` true) se muestran como:

```tsx
{
  /* Card cerrada: icono + en círculo gris + título en mayúsculas */
}
<div
  className="bg-white rounded-[20px] px-6 py-4 shadow-sm border border-gray-50
  hover:shadow-md hover:border-iwana-secondary/30 transition-all cursor-pointer group"
>
  <div className="flex items-center justify-between">
    <div className="flex items-center space-x-3">
      <div
        className="w-8 h-8 rounded-full bg-gray-100 text-iwana-secondary
        flex items-center justify-center"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <h3
        className="font-bold text-sm text-gray-600 uppercase tracking-wider
        group-hover:text-iwana-primary transition-colors"
      >
        {item.label}
      </h3>
    </div>
  </div>
</div>;
```

En variante `card`, secciones abiertas (expandidas) se muestran como:

```tsx
<div className="bg-white rounded-[20px] p-6 shadow-[var(--shadow-iwana-soft)] border border-gray-50">
  <div className="flex items-center space-x-2 mb-6 border-b border-gray-50 pb-4">
    <div
      className="w-8 h-8 rounded-full bg-iwana-secondary/10 text-iwana-secondary
      flex items-center justify-center"
    >
      {item.icon}
    </div>
    <h2 className="text-lg font-bold">{item.label}</h2>
    {item.description && <p className="text-xs text-gray-500 truncate">{item.description}</p>}
  </div>
  {item.progress != null && (
    <span
      className={cn(
        'px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 mb-4',
        isComplete ? 'bg-[#EDF8CC] text-[#48531D]' : 'bg-gray-100 text-gray-500',
      )}
    >
      {isComplete && <CheckIcon />}
      {item.progress}%
    </span>
  )}
  <div className="mt-4">{item.children}</div>
</div>
```

- [ ] **Step 3: Implementar multi-expansión en variante `card`**

En variante `card`, múltiples secciones pueden estar abiertas simultáneamente. Agregar props `openIds?: Set<string>` y `onOpenChange?: (ids: Set<string>) => void`. En variante `card`, el toggle agrega/remueve del set en lugar de reemplazar.

- [ ] **Step 4: Ejecutar typecheck del paquete UI**

Run: `pnpm --filter @iwana/ui typecheck`
Expected: PASS sin errores

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/SectionAccordion.tsx
git commit -m "feat(ui): add card variant to SectionAccordion with multi-expand support"
```

---

### Task 2: Crear tipos y constantes extraídas

**Files:**

- Create: `apps/portal/src/components/crm/expedientes/sections/types.ts`
- Create: `apps/portal/src/components/crm/expedientes/sections/constants.ts`

- [ ] **Step 1: Crear `types.ts` con los tipos extraídos**

```tsx
// apps/portal/src/components/crm/expedientes/sections/types.ts
import { LucideIcon } from 'lucide-react';
import {
  AcquisitionChannel,
  DocumentType,
  EvaluationSource,
  TechnicalConfidence,
  TechnologyOption,
} from '@iwana/shared';

export type SectionId =
  | 'identification'
  | 'contact'
  | 'location'
  | 'commercial_interest'
  | 'technical_feasibility'
  | 'legal_consent'
  | 'billing'
  | 'installation';

export interface SectionConfig {
  id: SectionId;
  label: string;
  description: string;
  icon: LucideIcon;
  renderFields(): string[];
  payloadFields(): string[];
  completionFields(): string[];
}

export type DraftValues = Record<string, string>;
```

- [ ] **Step 2: Crear `constants.ts` con las constantes extraídas**

Extraer de `page.tsx` líneas 84-427:

- `FIELD_LABELS`
- `FIELD_PLACEHOLDERS`
- `IDENTIFICATION_FIELDS_BASE`, `IDENTIFICATION_FIELDS_NATURAL`, `IDENTIFICATION_FIELDS_JURIDICA`
- `getIdentificationRelevantFields()`
- `SECTIONS` (con `renderFields`, `payloadFields`, `completionFields` adaptados a funciones)
- `DIMENSION_SECTION_GROUPS`
- `DOCUMENT_TYPE_OPTIONS`
- `ACQUISITION_CHANNEL_OPTIONS`
- `TECHNICAL_VIABILITY_RESULT_OPTIONS`
- `TECHNOLOGY_OPTION_OPTIONS`
- `TECHNICAL_CONFIDENCE_OPTIONS`
- `EVALUATION_SOURCE_OPTIONS`
- `DEPARTAMENTO_DEFAULT`, `DEPARTAMENTOS`
- `getMunicipiosByDepartamento()`
- `defaultProducts`
- `calculateSectionCompletion()`
- `calculateDimensionCompletion()`
- `buildDraftValues()`

Todas las constantes deben ser importables desde `./constants`. Los imports de `@iwana/shared` y `expediente-ui` se mueven aquí.

- [ ] **Step 3: Verificar que no hay errores de importación**

Run: `pnpm --filter @iwana/portal typecheck`
Expected: PASS (aún no se usan los archivos, pero typecheck debe pasar)

- [ ] **Step 4: Commit**

```bash
git add apps/portal/src/components/crm/expedientes/sections/types.ts apps/portal/src/components/crm/expedientes/sections/constants.ts
git commit -m "feat(portal): extract section types and constants for expediente sections refactor"
```

---

### Task 3: Crear `SectionFieldRenderer` genérico

**Files:**

- Create: `apps/portal/src/components/crm/expedientes/sections/SectionFieldRenderer.tsx`

- [ ] **Step 1: Crear el renderer genérico de campos**

Extraer la lógica de renderizado genérico (líneas 1692-1956 del `page.tsx`) en un componente reutilizable que recibe:

```tsx
interface SectionFieldRendererProps {
  section: SectionConfig;
  draftValues: DraftValues;
  onChange: (field: string, value: string) => void;
  onCandidateTechnologyToggle?: (technology: string, checked: boolean) => void;
  hasPersistedData?: boolean;
}
```

El componente maneja los casos especiales por field name:

- `personType`: no se renderiza (se maneja en IdentificationSection aparte)
- `altContactName`: full width con separador
- `altContactPhone`: `type="tel"`, `maxLength={10}`, `pattern="3[0-9]{9}"`, helperText
- `department`: Select con `DEPARTAMENTOS` (disabled)
- `municipality`: Select con `getMunicipiosByDepartamento(draftValues.department)`
- `latitude`/`longitude`: Input `type="number"` con `step="0.0000001"`
- `additionalProductIds`: checkbox grid con `defaultProducts`
- `acquisitionChannel`: Select con `ACQUISITION_CHANNEL_OPTIONS`
- Default: Input genérico

- [ ] **Step 2: Commit**

```bash
git add apps/portal/src/components/crm/expedientes/sections/SectionFieldRenderer.tsx
git commit -m "feat(portal): create generic SectionFieldRenderer component"
```

---

### Task 4: Crear componentes de cada sección (batch)

**Files:**

- Create: 8 archivos de componentes (uno por sección)
- Create: `apps/portal/src/components/crm/expedientes/sections/index.ts` (barrel export)

Cada componente recibe props mínimas:

```tsx
interface SectionProps {
  draftValues: DraftValues;
  onChange: (field: string, value: string) => void;
  saving: boolean;
  onSave: () => void;
}
```

Excepciones:

- `IdentificationSection`: tiene `lockedSections` y `onUnlockIdentification` extra
- `TechnicalFeasibilitySection`: tiene `onCandidateTechnologyToggle` extra

- [ ] **Step 1: Crear `ContactSection.tsx`** — Sección más simple, 4 campos
- [ ] **Step 2: Crear `LocationSection.tsx`** — Con department/municipality dinámico y latitude/longitude
- [ ] **Step 3: Crear `CommercialInterestSection.tsx`** — Con additionalProductIds checkbox grid y acquisitionChannel
- [ ] **Step 4: Crear `TechnicalFeasibilitySection.tsx`** — Con checkbox grid de technologies, textarea de observations
- [ ] **Step 5: Crear `LegalConsentSection.tsx`** — 1 campo (identityVerified)
- [ ] **Step 6: Crear `BillingSection.tsx`** — 2 campos (paymentMethod, billingCycle)
- [ ] **Step 7: Crear `InstallationSection.tsx`** — 2 campos (installationAddress, siteContactName)
- [ ] **Step 8: Crear `IdentificationSection.tsx`** — La más compleja: lock/unlock, personType condicional, natural vs juridica
- [ ] **Step 9: Crear `index.ts` con barrel exports**
- [ ] **Step 10: Commit**

```bash
git add apps/portal/src/components/crm/expedientes/sections/
git commit -m "feat(portal): create individual section components for expediente"
```

---

### Task 5: Crear `ExpedienteSections` contenedor con grid y SectionAccordion

**Files:**

- Create: `apps/portal/src/components/crm/expedientes/sections/ExpedienteSections.tsx`

- [ ] **Step 1: Crear el componente contenedor**

El componente:

1. Recibe `expediente`, `completeness`, `draftValues`, `handleDraftChange`, `handleSaveSection`, `handleCandidateTechnologyToggle`, `lockedSections`, `setLockedSections`, `loading`, `savingSection`
2. Maneja estado local `expandedSections: Set<SectionId>` (default: `new Set(['identification', 'contact'])`)
3. Computa `sectionCompletionById` y `sectionItems` para `SectionAccordion`
4. Renderiza grid 2 columnas:

```tsx
<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
  <div className="lg:col-span-5 space-y-4">
    <SectionAccordion
      variant="card"
      items={[identificationItem, contactItem]}
      openIds={expandedSections}
      onOpenChange={handleToggleSection}
    />
  </div>
  <div className="lg:col-span-7 space-y-4">
    <SectionAccordion
      variant="card"
      items={rightColumnItems}
      openIds={expandedSections}
      onOpenChange={handleToggleSection}
    />
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/portal/src/components/crm/expedientes/sections/ExpedienteSections.tsx
git commit -m "feat(portal): create ExpedienteSections container with grid layout"
```

---

### Task 6: Integrar `ExpedienteSections` en `page.tsx` y eliminar `tabSecciones` inline

**Files:**

- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`

- [ ] **Step 1: Importar `ExpedienteSections`**

Agregar import en la sección de imports del componente.

- [ ] **Step 2: Reemplazar `tabSecciones` (líneas 1241-1978) con**

```tsx
const tabSecciones = (
  <ExpedienteSections
    expediente={expediente}
    completeness={completeness}
    draftValues={draftValues}
    onDraftChange={handleDraftChange}
    onSaveSection={handleSaveSection}
    onCandidateTechnologyToggle={handleCandidateTechnologyToggle}
    lockedSections={lockedSections}
    onUnlockIdentification={() =>
      setLockedSections((prev) => {
        const next = new Set(prev);
        next.delete('identification');
        return next;
      })
    }
    savingSection={savingSection}
  />
);
```

- [ ] **Step 3: Eliminar código inline obsoleto**

Eliminar del `page.tsx`:

- Las ~737 líneas de `tabSecciones` (1241-1978)
- Las constantes movidas a `constants.ts`: `FIELD_LABELS`, `FIELD_PLACEHOLDERS`, `SECTIONS`, etc. (líneas 84-427)
- Las funciones movidas: `handleDraftChange`, `handleCandidateTechnologyToggle`, `handleSaveSection` (líneas 676-789)
- Las funciones helper: `getIdentificationRelevantFields`, `hasPersistedIdentificationData`, `calculateSectionCompletion`, `calculateDimensionCompletion`, `buildDraftValues`, `getProtectedFieldHelper`, `getCandidateTechnologiesFromDraft` (líneas 169-443)
- Los estados locales: `expandedSection`, `savingSection`, `lockedSections` (mover a `ExpedienteSections`)

**IMPORTANTE:** No eliminar los estados compartidos que usa `tabVistaGeneral` o `tabSeguimiento`: `expediente`, `completeness`, `actionMessage`, `draftValues`.

- [ ] **Step 4: Ejecutar typecheck**

Run: `pnpm --filter @iwana/portal typecheck`
Expected: PASS

- [ ] **Step 5: Ejecutar lint**

Run: `pnpm --filter @iwana/portal lint`
Expected: PASS (puede haber warnings de imports no usados, corregirlos)

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx
git commit -m "feat(portal): replace inline tabSecciones with ExpedienteSections component"
```

---

### Task 7: Verificación visual y de funcionalidad

**Files:** Ningún archivo nuevo

- [ ] **Step 1: Abrir el navegador en `http://localhost:3002/dashboard/crm/expedientes/{id}`**
- [ ] **Step 2: Navegar al tab "Secciones"**
- [ ] **Step 3: Verificar layout**: Grid 2 columnas en desktop, 1 columna en móvil
- [ ] **Step 4: Verificar secciones cerradas**: Icono '+' en círculo gris, título en MAYÚSCULAS, hover con borde verde lima
- [ ] **Step 5: Verificar secciones abiertas**: Icono en círculo verde-lima, título bold, progress badge, campos editables
- [ ] **Step 6: Verificar toggle**: Click en sección cerrada → se expande, click en header abierto → se colapsa
- [ ] **Step 7: Verificar múltiples secciones abiertas simultáneamente**
- [ ] **Step 8: Verificar botón "Guardar cambios"** en cada sección abierta
- [ ] **Step 9: Verificar sección Identificación**: lock/unlock funciona, campos natural vs juridica
- [ ] **Step 10: Verificar sección Viabilidad técnica**: checkbox grid de technologies, textarea de observations
- [ ] **Step 11: Ejecutar tests existentes**

Run: `pnpm --filter @iwana/portal test -- --passWithNoTests`
Expected: PASS
