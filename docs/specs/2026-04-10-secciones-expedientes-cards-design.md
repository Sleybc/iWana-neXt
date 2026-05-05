# Diseño: Refactor Secciones del Expediente — Cards estilo Prototipo

> **Fecha**: 2026-04-10  
> **Estado**: Aprobado  
> **Módulo**: CRM → Expedientes → Tab Secciones

## 1. Objetivo

Reemplazar el acordeón actual del tab "Secciones" del expediente por un layout de **cards estilo prototipo** (`prototipo_datos_usuario.html`): cards siempre visibles con secciones cerradas como chips minimales con "+" y animación suave al expandir. Grid 2 columnas adaptativo. Todos los campos editables con botón "Guardar cambios" por sección.

## 2. Estado Actual

- **Archivo**: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- **Rango**: `tabSecciones` en líneas 1241-1978 (~737 líneas)
- **Componente actual**: Acordeón hand-rolled con `expandedSection` state (línea 506)
- **Secciones**: 8 (identification, contact, location, commercial_interest, technical_feasibility, legal_consent, billing, installation)
- **Definición**: `SECTIONS` constant (líneas 181-310)
- **Componente `SectionAccordion`**: Disponible en `@iwana/ui` pero NO usado actualmente
- **Edición**: Identificación tiene modo lock/unlock; resto siempre editable

## 3. Decisiones de Diseño

| Decisión                | Opción elegida                                                                  |
| ----------------------- | ------------------------------------------------------------------------------- |
| Patrón de visualización | Cards siempre visibles (expandir/colapsar)                                      |
| Secciones cerradas      | Card minimal con icono '+' en círculo gris, título MAYÚSCULAS                   |
| Secciones abiertas      | Card con icono circular verde, título bold, descripción, progress badge, campos |
| Modo de edición         | Siempre editable + botón "Guardar cambios" por sección                          |
| Layout                  | Grid 2 columnas adaptativo (1 col móvil, 2 col desktop)                         |
| Distribución columnas   | Izquierda (5/12): identification + contact. Derecha (7/12): resto               |
| Animación               | Transición suave al expandir/colapsar con `transition-all`                      |
| Componente base         | `SectionAccordion` de `@iwana/ui`                                               |

## 4. Arquitectura de Componentes

### 4.1 Refactor del `SectionAccordion` existente

El componente `SectionAccordion` de `@iwana/ui` ya implementa el patrón de acordeón. Se necesita una **extensión menor** para soportar el estilo de "card cerrada" con icono '+' en lugar del chevron por defecto cuando la sección está cerrada y sin datos.

**Cambios necesarios en `SectionAccordion`:**

- Agregar prop `variant?: 'default' | 'card'` para alternar entre estilo acordeón y estilo card del prototipo
- En variant `card`, las secciones cerradas muestran: icono '+' en círculo gris + título en MAYÚSCULAS + `tracking-wider`
- En variant `card`, las secciones abiertas muestran: icono en círculo verde-lima + título bold + descripción + progress badge
- Animación de expandir/colapsar suave con `transition-all` en max-height/opacity

### 4.2 Extracción de `tabSecciones` a componentes separados

El bloque de ~737 líneas será refactorizado en:

```
components/crm/expedientes/sections/
├── ExpedienteSections.tsx       # Contenedor grid 2 columnas + SectionAccordion
├── IdentificationSection.tsx     # Sección Identificación (lock/unlock)
├── ContactSection.tsx           # Sección Contacto
├── LocationSection.tsx           # Sección Ubicación
├── CommercialInterestSection.tsx # Sección Interés del cliente
├── TechnicalFeasibilitySection.tsx # Sección Viabilidad técnica (checkbox grids)
├── LegalConsentSection.tsx       # Sección Consentimiento
├── BillingSection.tsx            # Sección Facturación
└── InstallationSection.tsx      # Sección Instalación
```

### 4.3 Grid Layout

```tsx
<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
  {/* Columna izquierda: 5/12 */}
  <div className="lg:col-span-5 space-y-4">
    <SectionAccordion variant="card" items={[identificationItem, contactItem]} />
  </div>
  {/* Columna derecha: 7/12 */}
  <div className="lg:col-span-7 space-y-4">
    <SectionAccordion variant="card" items={[...restItems]} />
  </div>
</div>
```

Cada `SectionAccordion` permite abrir múltiples secciones a la vez (comportamiento tipo card, no acordeón de una sola sección). Se modifica el estado de `expandedSection` de `string | null` a `Set<string>` para permitir múltiples secciones abiertas.

### 4.4 Estado: de `expandedSection` a `expandedSections`

```ts
// ANTES:
const [expandedSection, setExpandedSection] = useState<SectionId>('identification');

// DESPUÉS:
const [expandedSections, setExpandedSections] = useState<Set<SectionId>>(
  new Set(['identification', 'contact']),
);
```

Toggle: si está en el set → cerrar; si no → agregar.

### 4.5 Estilo de Card Cerrada (Sección minimizada)

Cuando una sección está cerrada (no en `expandedSections`), se renderiza como:

```tsx
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
        <PlusIcon className="h-4 w-4" />
      </div>
      <h3
        className="font-bold text-sm text-gray-600 uppercase tracking-wider
        group-hover:text-iwana-primary transition-colors"
      >
        {section.label}
      </h3>
    </div>
  </div>
</div>
```

### 4.6 Estilo de Card Abierta (Sección expandida)

```tsx
<div
  className="bg-white rounded-[20px] p-6 shadow-[var(--shadow-iwana-soft)]
  border border-gray-50"
>
  <div className="flex items-center space-x-2 mb-6 border-b border-gray-50 pb-4">
    <div
      className="w-8 h-8 rounded-full bg-iwana-secondary/10
      text-iwana-secondary flex items-center justify-center"
    >
      <SectionIcon className="text-lg" />
    </div>
    <h2 className="text-lg font-bold">{section.label}</h2>
  </div>
  {/* progress badge */}
  {/* campos del formulario */}
  {/* botón Guardar cambios */}
</div>
```

### 4.7 Botón Guardar por Sección

Cada sección abierta tiene un botón "Guardar cambios" al final que solo guarda los campos de esa sección. Se mantiene la función `handleSaveSection` existente.

## 5. Responsabilidad del Cambio

| Archivo                                                                               | Cambio                                            |
| ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `packages/ui/src/components/SectionAccordion.tsx`                                     | Agregar `variant: 'card'` con estilo de prototipo |
| `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`                         | Reemplazar `tabSecciones` con componentes nuevos  |
| `apps/portal/src/components/crm/expedientes/sections/ExpedienteSections.tsx`          | Nuevo: contenedor grid                            |
| `apps/portal/src/components/crm/expedientes/sections/IdentificationSection.tsx`       | Nuevo: sección Identificación                     |
| `apps/portal/src/components/crm/expedientes/sections/ContactSection.tsx`              | Nuevo: sección Contacto                           |
| `apps/portal/src/components/crm/expedientes/sections/LocationSection.tsx`             | Nuevo: sección Ubicación                          |
| `apps/portal/src/components/crm/expedientes/sections/CommercialInterestSection.tsx`   | Nuevo: sección Interés                            |
| `apps/portal/src/components/crm/expedientes/sections/TechnicalFeasibilitySection.tsx` | Nuevo: sección Viabilidad                         |
| `apps/portal/src/components/crm/expedientes/sections/LegalConsentSection.tsx`         | Nuevo: sección Legal                              |
| `apps/portal/src/components/crm/expedientes/sections/BillingSection.tsx`              | Nuevo: sección Facturación                        |
| `apps/portal/src/components/crm/expedientes/sections/InstallationSection.tsx`         | Nuevo: sección Instalación                        |

## 6. No-Cambios

- Se mantiene la estructura de datos `SECTIONS` existente
- Se mantiene `completenessCalculation` y los dimgroups existentes
- Se mantiene `handleSaveSection` con la misma lógica de validación
- Los campos existentes (inputs, selects, checkbox grids) se reutilizan sin cambios
- La sección de Identificación conserva su lógica de lock/unlock
- Los roles y permisos (`canManageAttribution`, etc.) no cambian

## 7. Criterios de Éxito

1. Las 8 secciones se muestran como cards estilo prototipo en grid 2 columnas
2. Secciones cerradas muestran solo icono '+' + título en MAYÚSCULAS
3. Click en sección cerrada la expande con animación suave
4. Click en sección abierta la colapsa
5. Múltiples secciones pueden estar abiertas simultáneamente
6. Botón "Guardar cambios" por sección funcional
7. Responsive: 1 columna en móvil, 2 en desktop
8. Progress badges visibles en secciones abiertas
9. Sin regresión en la funcionalidad de guardado existente
