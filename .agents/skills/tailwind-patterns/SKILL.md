---
name: tailwind-patterns
description: Patrones Tailwind para iWana neXt con tokens semanticos, composicion mantenible y frontend web coherente con el sistema visual del repo.
---

## Tailwind 4 CSS-first en iWana neXt

> **Crítico:** Este proyecto usa **Tailwind 4** con configuración CSS-first.
> **No existe `tailwind.config.js`** — intentar crearlo o editarlo es incorrecto.

### Cómo funciona Tailwind 4 en este repo

Los tokens se definen en `packages/ui/src/styles/globals.css` con `@theme {}`:

```css
/* globals.css */
@import "tailwindcss";   /* Activa Tailwind 4 */

@theme {
  --color-iwana-primary: #17163A;
  --color-iwana-secondary: #A5C330;
  --color-iwana-secondary-700: #6A7A1C; /* Usar para texto — contraste 6.2:1 */
  --font-sans: 'Exo 2', system-ui, sans-serif;
  /* ... más tokens ... */
}
```

El CSS global se importa en el layout raíz:
```typescript
import '@iwana/ui/styles/globals.css';
```

### Regla de contraste obligatoria

| Token | Valor | Contraste sobre blanco | Usar para |
|---|---|---|---|
| `iwana-secondary` | `#A5C330` | 2.3:1 ❌ FAIL WCAG AA | Solo decorativo (fondos, bordes) |
| `iwana-secondary-700` | `#6A7A1C` | 6.2:1 ✅ PASS WCAG AA | Texto sobre fondo blanco |

### Dark mode

Los tokens de superficie dark están en `@theme`:
- `dark-surface`: color de fondo principal en modo oscuro
- `dark-surface-2`: fondo de cards y elementos elevados

Aplicar con `dark:` prefix de Tailwind:
```html
<div class="bg-white dark:bg-dark-surface">...</div>
```

### CVA para variantes de componentes

```typescript
import { cva } from 'class-variance-authority';

const button = cva(
  'inline-flex items-center rounded-md font-medium transition-colors',
  {
    variants: {
      variant: {
        primary: 'bg-iwana-primary text-white hover:bg-iwana-primary-700',
        secondary: 'bg-iwana-secondary-700 text-white hover:bg-iwana-secondary-700/90',
      },
      size: {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);
```

# Tailwind Patterns

## Proposito

Usa esta skill cuando necesites construir o revisar estilos utilitarios en el frontend web del proyecto.

El objetivo no es acumular clases por inercia. El objetivo es usar Tailwind de forma mantenible, con tokens semanticos, componentes reutilizables y decisiones visuales coherentes con el sistema de UI del repo.

## Cuando usarla

Activa esta skill para tareas como:

- Nuevas pantallas o componentes en apps web.
- Limpieza de classNames largas o repetidas.
- Definicion de tokens y estilos reutilizables.
- Layouts responsive, estados interactivos y jerarquia visual.
- Revisión de consistencia visual entre features.

## Reglas del repo

### 1. Tailwind debe servir al sistema, no reemplazarlo

- Usa Tailwind para implementar el lenguaje visual definido.
- No conviertas cada componente en una lista irrepetible de utilidades.
- Cuando aparezca repeticion real, abstrae en componente o primitive reutilizable.

### 2. Prefiere tokens y semantica sobre arbitrariedad

- Colores, spacing y tipografia deben reflejar decisiones del sistema.
- Reduce valores arbitrarios a los casos donde aportan una razon clara.
- Mantén consistencia entre componentes equivalentes.

### 3. Responsive y estados forman parte del componente

- No dejes responsive, hover, focus o empty states para despues.
- Los estados interactivos deben ser claros, accesibles y previsibles.

## Patrones preferidos

### Composicion

- classNames legibles y ordenadas con criterio estable.
- Primitives o componentes cuando el patron se repite.
- Layouts construidos con intención, no por acumulación accidental.

### Tokens

- nombres semanticos donde el stack lo permita
- spacing, radios y sombras consistentes
- variantes visuales definidas por componente cuando corresponda

### Responsividad

- mobile first
- cambios de layout justificados por contenido real
- evitar breakpoints por reflejo si el componente no lo necesita

### Accesibilidad visual

- foco visible
- contraste razonable
- estados disabled, loading y error distinguibles
- no depender solo del color para comunicar estado

### Identidad operativa iWana

- Usa `iwana-primary` para estructura y confianza; usa `iwana-secondary` como acento visual, no como texto sobre blanco.
- Para texto con acento sobre fondo claro, usa `iwana-secondary-700` por contraste AA.
- Mantén superficies limpias y suaves: radios iWana, sombras sutiles y bordes de baja intensidad.
- Usa `iwana-glass` o `backdrop-blur` solo en overlays, drawers, controles flotantes o capas sobre contenido. No lo apliques masivamente en tablas, formularios o paneles estaticos.
- Evita proliferar valores arbitrarios como `tracking-[0.22em]`; si el patron se repite, conviertelo en utility o primitive compartida.

## Checklist de revision

- El componente mantiene coherencia visual con el sistema del repo.
- No hay proliferacion innecesaria de valores arbitrarios.
- Las clases repetidas ya muestran un camino de abstraccion.
- Responsive y estados estan resueltos.
- El resultado sigue siendo legible y mantenible.
- La solucion respeta accesibilidad visual.

## Heuristica para revisar codigo

Busca y corrige estas señales:

- className enorme y dificil de leer
- multiples valores arbitrarios sin razon clara
- mismo patron repetido en varios componentes
- estilos que contradicen tokens o primitives existentes
- uso decorativo de blur, gradientes o glass sin mejorar jerarquia ni accion
- interacciones sin focus visible o estados inconsistentes

## Anti-patrones

Evita:

- usar Tailwind como sustituto de criterio de diseño
- crear componentes visualmente distintos para el mismo rol sin justificarlo
- resolver todo con utilidades arbitrarias antes de mirar el sistema existente
- esconder deuda visual dentro de helpers opacos
- sacrificar accesibilidad por pulido estetico

## Escalacion

Usa [ESCALACION AL CTO] si:

- una decision visual exige cambiar el sistema base o tokens transversales del producto
- existe conflicto fuerte entre identidad visual, accesibilidad y restricciones del negocio
