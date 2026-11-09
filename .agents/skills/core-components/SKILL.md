---
name: core-components
description: "API e inventario real de @iwana/ui y criterios para nuevas primitives; dueña única de los tokens. Usar cuando se crea o cambia una primitive de packages/ui o se define un token. No usar para estilos de una pantalla (→ tailwind-patterns) ni para su aspecto visual (→ iwana-identity-ui-review)."
---

## Inventario real de @iwana/ui (verificado 2026-11-08)

> Fuente única: `packages/ui/src/index.ts` (138 exportaciones públicas: 93 valores y 45 tipos). Importar solo desde `@iwana/ui`; el paquete expone además `@iwana/ui/styles/globals.css` (`packages/ui/package.json`). Si este inventario discrepa de `index.ts`, manda `index.ts`.

### Componentes (por archivo de `packages/ui/src/components/`)

| Archivo | Exportaciones públicas |
|---|---|
| `Alert.tsx` | `Alert`, `AlertTitle`, `AlertDescription`, `alertVariants` |
| `Avatar.tsx` | `Avatar` (más `getInitials`, reexportada de `@iwana/shared`) |
| `Badge.tsx` | `Badge`, `badgeVariants` |
| `Button.tsx` | `Button`, `buttonVariants` |
| `Calendar.tsx` | `Calendar` |
| `Card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter` |
| `CheckboxCard.tsx` | `CheckboxCard` |
| `DatePicker.tsx` | `DatePicker` |
| `Dialog.tsx` | `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogClose` |
| `DropdownMenu.tsx` | `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuHeader`, `DropdownMenuItem`, `DropdownMenuSeparator`, `dropdownMenuItemVariants` |
| `FormField.tsx` | `FormField` |
| `FormSection.tsx` | `FormFieldset`, `FormPanel`, `FormSectionTitle` |
| `FormStatus.tsx` | `FormStatus` |
| `Input.tsx` | `Input` |
| `ModalLayer.tsx` | `ModalLayer`, `overlayEdgeClassName` |
| `MultiSelect.tsx` | `MultiSelect` |
| `OperationalSidePeek.tsx` | `OperationalSidePeek` |
| `OtpInput.tsx` | `OtpInput` |
| `Popover.tsx` | `Popover`, `PopoverTrigger`, `PopoverContent` |
| `ProgressMeter.tsx` | `ProgressMeter` |
| `RadioCardGroup.tsx` | `RadioCardGroup` |
| `SearchHighlight.tsx` | `SearchHighlight`, `SearchSnippetPill`, `parseSearchHighlight` |
| `SectionAccordion.tsx` | `SectionAccordion` |
| `SectionHeader.tsx` | `SectionHeader` |
| `Select.tsx` | `Select` |
| `ShellSearchSheet.tsx` | `ShellSearchSheet` |
| `Tabs.tsx` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `tabsTriggerVariants` |
| `ThemeProvider.tsx` | `ThemeProvider`, `useTheme` |
| `ThemeToggle.tsx` | `ThemeToggle` |
| `auth/AuthPremiumShell.tsx` | `AuthPremiumShell` |
| `auth/AuthBrandHeader.tsx` | `AuthBrandHeader` |
| `auth/auth-form-styles.ts` | 16 constantes `AUTH_FORM_*_CLASS` (clases del formulario de autenticación) |

Los tipos (`*Props`, `AvatarSize`, `AvatarVariant`, `FormStatusState`, `ModalLayerAlign`, `MultiSelectOption`, `RadioCardOption`, `RadioCardOptionBase`, `SearchHighlightSegment`, `SelectOption`, `SectionAccordionItemProps`, etc.) salen del mismo archivo que su componente.

### Utilidades, hooks y providers (fuera de `components/`)

| Origen | Exportaciones públicas |
|---|---|
| `lib/utils.ts` | `cn` |
| `focus.ts` | `interactiveFocusClassName`, `headerIconControlClassName` |
| `skeleton.tsx` | `SkeletonBlock` |
| `hooks/use-deferred-initial-focus.ts` | `useDeferredInitialFocus` (más los tipos `DeferredFocusCleanup`, `DeferredFocusEligibility`, `DeferredFocusScheduler`) |
| `theme-bootstrap.ts` | `THEME_STORAGE_KEY`, `THEME_BOOTSTRAP_SCRIPT`, `resolveThemeFromStorage`, `applyHtmlThemeClass`, tipo `ThemeName` |

### Lo que NO existe hoy

No importar nada de esta lista desde `@iwana/ui`: `Textarea`, `Checkbox` suelto (existe `CheckboxCard`), `Toast`, `Table`, `Sidebar`, `PageHeader` (existe `SectionHeader`), `MetricCard`, `Stack`, `Inline`, `Container`, `Section`, `Text`, `Heading`, `Label`, `EmptyState`, `Modal` (existen `Dialog` y `ModalLayer`). Las primitives del portal (`PortalPanel`, `PortalAlert`, `PortalEmptyState`, `PortalSkeletonBlock`) viven en `apps/portal/src/components/shared/portal-ui.tsx`, no en `@iwana/ui`. Una primitive nueva se añade a `packages/ui/src/index.ts` (la implementa fe-platform) y se refleja aquí en el mismo cambio.

### Cómo verificar este inventario

Resolver las exportaciones del módulo `packages/ui/src/index.ts` con el compilador de TypeScript (`checker.getExportsOfModule`) y compararlas con las tablas anteriores. Además, cada archivo de `components/*.tsx` (salvo `*.spec.tsx`) y de `components/auth/` debe estar exportado por `index.ts`. Un componente listado que no exista, o una exportación pública ausente de las tablas, invalida este inventario.

### Base del sistema de diseño

- **shadcn/ui + Radix Primitives** — ADR-023: base de composición de componentes
- **CVA (class-variance-authority)** — variantes de componentes (`buttonVariants`, `badgeVariants`, `alertVariants`, `tabsTriggerVariants`, `dropdownMenuItemVariants`)
- **Tailwind 4 CSS-first** — tokens en `@theme {}` de `globals.css`, sin `tailwind.config.js`

# Core Components

## Proposito

Este skill gobierna el uso del sistema de componentes del frontend web de iWana neXt. Su objetivo es reducir UI ad hoc, centralizar tokens y mantener consistencia visual, semantica y accesible.

## Reglas base

1. Preferir componentes del sistema antes que HTML o wrappers nuevos.
2. Usar tokens semanticos para color, spacing, radius, shadow y typography.
3. Mantener semantica HTML y accesibilidad desde la primitive.
4. No introducir patrones de React Native ni APIs mobile.
5. Toda nueva primitive debe justificar por que no puede componerse con las existentes.

## Tokens

`core-components` es la **dueña única de los tokens** del frontend. Ninguna otra skill los define ni los copia: `tailwind-patterns` e `iwana-identity-ui-review` los citan por nombre y remiten aquí. Esta skill tampoco transcribe valores: los valores viven solo en la fuente. Un token nuevo o cambiado se propone al Design System Owner (ds-owner) con justificación, impacto y plan de migración; nunca valores paralelos.

| Qué | Dónde vive (fuente) |
|---|---|
| Tokens vivos (Tailwind 4 CSS-first, `@theme`) | `packages/ui/src/styles/globals.css:25` |
| Escalas de marca: primario `--color-iwana-primary-*` (l.27), secundario `--color-iwana-secondary-*` (l.41), neutral `--color-iwana-neutral-*` (l.58) | `globals.css:27-70` |
| Superficie y semánticos (`--color-iwana-background`, `-foreground`, `-success`, `-warning`, `-error`) | `globals.css:72-100` |
| Radios (`--radius-sm` a `--radius-full`) | `globals.css:102-108` |
| Superficies y bordes oscuros (`--color-dark-surface*`, `--color-dark-border*`) | `globals.css:127-133` |
| Sombras (`--shadow-iwana*`) | `globals.css:137-142` |
| Capas de apilamiento (`--z-*`, ADR-075 Adenda A) | `globals.css:144-181` |
| Velo modal (`--color-veil`) | `globals.css:188` (claro) y `globals.css:218` (oscuro, regla `.dark` de la l.217) |
| Tipografía (`--font-sans`, `--font-display`, `--font-mono`) | `globals.css:192-194`; fuentes en `packages/ui/src/styles/fonts/` |
| Variante `dark` (clase `.dark` en `<html>`) | `globals.css:318`; arranque en `packages/ui/src/theme-bootstrap.ts` |

Reglas:

- No hay tokens en TypeScript: `packages/ui/src/tokens/` se retiró el 2026-11-08 (spec `2026-11-08-ui-tokens-fuente-unica-spec.md`, D1). Un valor de token se lee de `globals.css`; si alguien necesita un espejo TS, es un contrato nuevo de esta skill, generado desde `globals.css`, nunca una copia a mano.
- El hex de marca no aparece en código de pantalla ni en otras skills: se cita el token por nombre. Única excepción: la tabla hex → token de `iwana-identity-ui-review/references/tokens.md`, copia derivada de `globals.css` que usa `scripts/audit-ui.mjs` para detectar hex sin tokenizar; si diverge, manda `globals.css`.
- La regla de contraste del lima sobre fondo claro está en el comentario de accesibilidad de `globals.css:18-23` y en `iwana-identity-ui-review/references/tokens.md`.
- Las categorías abstractas (`space-*`, `fg-*`, `bg-surface`, `accent-primary`) que citaba la versión anterior no existen como tokens; usar los nombres reales de la tabla.

## Primitives objetivo (roadmap; NO exportadas hoy)

Solo las del inventario real existen. La lista siguiente es intencion de diseno; antes de usar cualquiera, comprobar que esta en `packages/ui/src/index.ts`.

### Layout

- `Stack`
- `Inline`
- `Container`
- `Section`

### Typography

- `Text`
- `Heading`
- `Label`

### Acciones y formularios

- `Button`
- `Input`
- `Select`
- `Textarea`
- `Checkbox`
- `FormField`

### Superficies y feedback

- `Card`
- `Badge`
- `Alert`
- `EmptyState`
- `Skeleton`

## Patrones recomendados

> Los ejemplos usan primitives objetivo (`Section`, `Stack`, `Heading`, `Text`, `EmptyState`) que aun no existen y un import `@/components/ui` inexistente: ilustran la forma de la API, no codigo ejecutable. El import real es `@iwana/ui`.

### Layout de seccion

```tsx
import { Section, Stack, Heading, Text } from "@/components/ui";

export function CustomerSummary() {
  return (
    <Section>
      <Stack gap="space-3">
        <Heading level={2}>Resumen del cliente</Heading>
        <Text tone="muted">Informacion consolidada del contrato activo.</Text>
      </Stack>
    </Section>
  );
}
```

### Accion primaria

```tsx
<Button variant="primary" size="md">
  Guardar cambios
</Button>
```

### Campo de formulario

```tsx
<FormField label="Correo" error={errors.email} hint="Usa el correo corporativo">
  <Input name="email" type="email" autoComplete="email" />
</FormField>
```

### Estado vacio

```tsx
<EmptyState
  title="No hay contratos"
  description="Crea el primer contrato para este suscriptor."
  action={<Button variant="primary">Crear contrato</Button>}
/>
```

## Anti-patrones

```tsx
// MAL - hardcode visual
<div style={{ padding: 16, color: '#202020' }} />

// BIEN - tokens y primitive compartida
<Section padding="space-4" tone="default" />

// MAL - primitive mobile ajena al stack
import { View, Text } from 'react-native';

// BIEN - primitives del sistema web
import { Section, Text } from '@/components/ui';
```

## Criterios de calidad para nuevas primitives

- API pequena y consistente
- nombre semantico, no visualista
- soporte de estados disabled, loading o error cuando aplique
- focus visible y navegacion por teclado
- composicion simple antes que configuracion excesiva
- pruebas basicas de render, accesibilidad y variantes

## Integracion con otras skills

- `frontend-dev-guidelines` para arquitectura de pantalla y composicion
- `tailwind-patterns` para estrategia de tokens y clases utilitarias
- `testing-patterns` para pruebas de variantes y estados
- `wcag-audit-patterns` para accesibilidad y semantica
