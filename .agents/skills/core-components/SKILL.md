---
name: core-components
description: Sistema de componentes y patrones visuales para iWana neXt. Use cuando se construya UI web, se apliquen tokens de diseno o se definan primitivas reutilizables del frontend del proyecto.
---

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

Los nombres exactos pueden variar segun la implementacion del sistema, pero las categorias deben existir:

- spacing: `space-1`, `space-2`, `space-4`, `space-6`
- typography: `text-xs`, `text-sm`, `text-base`, `text-lg`
- color semantico: `fg-default`, `fg-muted`, `bg-surface`, `border-subtle`, `accent-primary`, `status-danger`
- radius: `radius-sm`, `radius-md`, `radius-lg`

## Primitives esperadas

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
