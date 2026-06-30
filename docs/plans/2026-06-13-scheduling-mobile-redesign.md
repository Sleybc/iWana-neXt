# Rediseño de Densidad Móvil y Saneamiento de Programación Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimizar la densidad del dashboard de Programación en dispositivos móviles mediante un patrón de pestañas en el Toolbar y corregir regresiones visuales de identidad (tracking y gradientes).

**Architecture:** Refactorización de componentes de React en `apps/portal` para introducir lógica de pestañas condicional y actualización de clases de Tailwind para alineación con el sistema de diseño de iWana.

**Tech Stack:** React, Next.js App Router, TailwindCSS, Lucide React, @iwana/ui.

---

### Task 1: Saneamiento de Identidad (Tracking y Gradientes)

**Files:**
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx`
- Modify: `apps/portal/src/components/scheduling/SchedulingSummaryStrip.tsx`

- [ ] **Step 1: Corregir tracking en SchedulingClient**

Reemplazar `tracking-[0.18em]` por `tracking-tight` en el PageHeader badge.

```tsx
// apps/portal/src/components/scheduling/SchedulingClient.tsx

// Buscar:
<Badge variant="primary" className="px-3 py-1 text-[11px] uppercase tracking-[0.18em]">
  {formatWfmDayLabel(new Date())}
</Badge>

// Reemplazar por:
<Badge variant="primary" className="px-3 py-1 text-[11px] font-bold uppercase tracking-tight">
  {formatWfmDayLabel(new Date())}
</Badge>
```

- [ ] **Step 2: Corregir tracking y gradientes en SchedulingSummaryStrip**

Sustituir el tracking exagerado y los gradientes `rgba` hardcodeados por tokens semánticos de iWana.

```tsx
// apps/portal/src/components/scheduling/SchedulingSummaryStrip.tsx

// Buscar en Badge de "Lectura en tiempo real":
<Badge variant="neutral" className="px-3 py-1 text-[11px] uppercase tracking-[0.12em]">
  Lectura en tiempo real
</Badge>

// Reemplazar por:
<Badge variant="neutral" className="px-3 py-1 text-[11px] font-bold uppercase tracking-tight">
  Lectura en tiempo real
</Badge>

// Buscar en SummaryCard (eyebrow):
<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
  {eyebrow}
</p>

// Reemplazar por:
<p className="text-[11px] font-bold uppercase tracking-tight text-iwana-secondary-700 dark:text-iwana-secondary-400">
  {eyebrow}
</p>

// Buscar en SummaryCard (gradientes):
highlighted
  ? 'bg-[radial-gradient(circle_at_top_right,rgba(165,195,48,0.22),transparent_36%)]'
  : 'bg-[radial-gradient(circle_at_top_right,rgba(165,195,48,0.14),transparent_34%)]'

// Reemplazar por (usando el color secundario de iWana):
highlighted
  ? 'bg-[radial-gradient(circle_at_top_right,var(--color-iwana-secondary-500_/_0.2),transparent_40%)]'
  : 'bg-[radial-gradient(circle_at_top_right,var(--color-iwana-secondary-500_/_0.1),transparent_35%)]'
```

- [ ] **Step 3: Commit**

```bash
git add apps/portal/src/components/scheduling/SchedulingClient.tsx apps/portal/src/components/scheduling/SchedulingSummaryStrip.tsx
git commit -m "style(scheduling): fix tracking regression and hardcoded gradients"
```

---

### Task 2: Responsive Grid en Summary Strip

**Files:**
- Modify: `apps/portal/src/components/scheduling/SchedulingSummaryStrip.tsx`

- [ ] **Step 1: Ajustar clases de grid para móviles pequeños**

Asegurar que las tarjetas no se desborden en dispositivos estrechos.

```tsx
// apps/portal/src/components/scheduling/SchedulingSummaryStrip.tsx

// Buscar:
<div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">

// Reemplazar por (añadiendo grid-cols-1 explícito para móvil):
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
```

- [ ] **Step 2: Reducir tamaño de fuente de valores en móvil**

```tsx
// apps/portal/src/components/scheduling/SummaryCard

// Buscar:
<p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">{value}</p>

// Reemplazar por:
<p className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">{value}</p>
```

- [ ] **Step 3: Commit**

```bash
git add apps/portal/src/components/scheduling/SchedulingSummaryStrip.tsx
git commit -m "style(scheduling): optimize summary strip grid for small mobile screens"
```

---

### Task 3: Implementación de Tabs en SchedulingToolbar (Móvil)

**Files:**
- Modify: `apps/portal/src/components/scheduling/SchedulingToolbar.tsx`

- [ ] **Step 1: Añadir estado de pestaña activa**

```tsx
// apps/portal/src/components/scheduling/SchedulingToolbar.tsx

// Importar useState:
import { useState } from 'react';

// Dentro de SchedulingToolbar:
const [activeMobileTab, setActiveMobileTab] = useState<'agenda' | 'filters'>('agenda');
```

- [ ] **Step 2: Implementar disparadores de pestañas (solo visibles en móvil < xl)**

Añadir el componente de navegación segmentada antes del contenido principal.

```tsx
// apps/portal/src/components/scheduling/SchedulingToolbar.tsx

// Insertar antes de <div className="space-y-4">:
<div className="flex border-b border-gray-200 dark:border-dark-border xl:hidden mb-4">
  <button
    onClick={() => setActiveMobileTab('agenda')}
    className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
      activeMobileTab === 'agenda'
        ? 'border-iwana-primary text-iwana-primary'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`}
  >
    Agenda
  </button>
  <button
    onClick={() => setActiveMobileTab('filters')}
    className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
      activeMobileTab === 'filters'
        ? 'border-iwana-primary text-iwana-primary'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`}
  >
    Filtros
  </button>
</div>
```

- [ ] **Step 3: Condicionar visibilidad de secciones**

```tsx
// apps/portal/src/components/scheduling/SchedulingToolbar.tsx

// Sección de Navegación de Tiempo (Día/Mes/Etiqueta):
<div className={`flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between ${activeMobileTab === 'agenda' ? 'flex' : 'hidden xl:flex'}`}>
  {/* ... contenido existente ... */}
</div>

// Sección de Filtros (Grid de Selects):
<div className={`grid gap-3 md:grid-cols-2 xl:grid-cols-5 ${activeMobileTab === 'filters' ? 'grid' : 'hidden xl:grid'}`}>
  {/* ... contenido existente ... */}
</div>
```

- [ ] **Step 4: Commit**

```bash
git add apps/portal/src/components/scheduling/SchedulingToolbar.tsx
git commit -m "feat(scheduling): implement mobile-first tabbed toolbar"
```

---

### Task 4: Consistencia de Superficies y Jerarquía

**Files:**
- Modify: `apps/portal/src/components/scheduling/SchedulingDashboard.tsx`
- Modify: `apps/portal/src/components/scheduling/SchedulingSummaryStrip.tsx`

- [ ] **Step 1: Unificar fondos de tarjetas secundarias**

Eliminar variaciones de opacidad (white/75) para usar superficies sólidas del sistema.

```tsx
// apps/portal/src/components/scheduling/SchedulingSummaryStrip.tsx

// Buscar en SummaryCard:
className={`rounded-3xl border bg-white/75 p-5 shadow-iwana backdrop-blur-xl dark:bg-dark-surface-2/80 ...

// Reemplazar por:
className={`rounded-3xl border bg-white p-5 shadow-iwana dark:bg-dark-surface-2 ...
```

- [ ] **Step 2: Ajustar espaciado entre secciones en el Dashboard**

```tsx
// apps/portal/src/components/scheduling/SchedulingDashboard.tsx

// Buscar:
<div className="space-y-6">

// Reemplazar por (reduciendo espacio en móvil):
<div className="space-y-4 sm:space-y-6">
```

- [ ] **Step 3: Commit**

```bash
git add apps/portal/src/components/scheduling/SchedulingDashboard.tsx apps/portal/src/components/scheduling/SchedulingSummaryStrip.tsx
git commit -m "style(scheduling): unify card surfaces and refine vertical rhythm"
```

---

### Task 5: Verificación Visual y Accesibilidad

- [ ] **Step 1: Validar etiquetas de accesibilidad**

Asegurar que los botones de pestañas tengan `aria-label` si no tienen texto descriptivo suficiente (en este caso lo tienen).

- [ ] **Step 2: Prueba manual de responsividad**

Verificar en DevTools (simulación móvil) que el Toolbar solo muestra una sección a la vez y que las métricas no se rompen.

- [ ] **Step 3: Commit final**

```bash
git commit --allow-empty -m "chore(scheduling): verified mobile density improvements"
```
