# Manual de Implementación - Identidad Corporativa iWana Network

**Fecha:** 25 de Enero, 2026  
**Versión:** 1.0  
**Propósito:** Guía técnica para implementar la identidad corporativa iWana en aplicaciones digitales

---

## Resumen Ejecutivo

### Objetivo

Este manual proporciona las especificaciones técnicas, componentes de código y procesos necesarios para implementar fielmente la identidad corporativa de iWana Network en todas las aplicaciones y productos digitales.

### Principios de Implementación

1. **Fidelidad de Marca:** Cada elemento debe reflejar la personalidad iWana
2. **Consistencia Visual:** Uniformidad en todos los puntos de contacto
3. **Escalabilidad Técnica:** Componentes reutilizables y mantenibles
4. **Performance Optimizada:** Implementación eficiente sin comprometer la calidad

---

## 1. Fundamentos de la Identidad iWana

### 1.1 Personalidad de Marca

| Atributo         | Descripción                   | Implementación Técnica                                           |
| ---------------- | ----------------------------- | ---------------------------------------------------------------- |
| **Fresca**       | Moderna, accesible, dinámica  | Colores vibrantes, animaciones fluidas, micro-interacciones      |
| **Vanguardista** | Innovación tecnológica        | Efectos glassmorphism, gradientes sutiles, patrones modernos     |
| **Minimalista**  | Enfoque en lo esencial        | Espacios en blanco generosos, jerarquía clara, elementos limpios |
| **Equilibrada**  | Tecnología + calidez orgánica | Formas redondeadas, transiciones naturales, contraste suave      |

### 1.2 Voz y Tono Digital

#### Características de Comunicación

- **Tecnológico pero Orgánico:** Terminología precisa con narrativa fluida
- **Eficiente:** Mensajes directos, sin elementos innecesarios
- **Profesional:** Confianza, experiencia y solidez
- **Palabras Clave:** Velocidad, Expertos, Conectividad, Calidad, Premium

#### Aplicación en UI

```typescript
// Ejemplos de microcopy alineado con la voz iWana
const iwanaCopy = {
  buttons: {
    primary: "Conectar Ahora",
    secondary: "Explorar Planes",
    tertiary: "Más Información",
  },
  loading: {
    connecting: "Estableciendo conexión...",
    processing: "Optimizando tu experiencia...",
    success: "¡Conectado con éxito!",
  },
  errors: {
    network: "Conexión interrumpida. Reintentando...",
    validation: "Verifica los datos ingresados",
    generic: "Algo no salió como esperábamos",
  },
};
```

---

## 2. Sistema de Design Tokens

### 2.1 Paleta de Colores Técnica

```typescript
// design-tokens/colors.ts
export const iwanaColors = {
  // Colores Principales
  primary: {
    DEFAULT: "#17163A",
    50: "#F8F8FB",
    100: "#E8E7F0",
    200: "#D1CFE1",
    300: "#A8A4C8",
    400: "#7B75AB",
    500: "#5A5190",
    600: "#4A4176",
    700: "#3D3461",
    800: "#342E52",
    900: "#17163A",
    950: "#0F0E24",
  },

  // Color de Acento
  secondary: {
    DEFAULT: "#A5C330",
    50: "#F7FCE8",
    100: "#EDF8CC",
    200: "#DCF19F",
    300: "#C5E668",
    400: "#B2D93C",
    500: "#A5C330",
    600: "#8BA020",
    700: "#6A7A1C",
    800: "#55621C",
    900: "#48531D",
    950: "#252E0B",
  },

  // Neutros
  neutral: {
    DEFAULT: "#AEAEAD",
    50: "#F9F9F9",
    100: "#F1F1F1",
    200: "#E4E4E4",
    300: "#D1D1D1",
    400: "#B8B8B8",
    500: "#AEAEAD",
    600: "#8A8A8A",
    700: "#6F6F6F",
    800: "#5C5C5C",
    900: "#4F4F4F",
    950: "#2E2E2E",
  },

  // Colores Funcionales
  background: "#FFFFFF",
  foreground: "#17163A",
  muted: "#AEAEAD",
  accent: "#A5C330",

  // Estados
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",
};
```

### 2.2 Tipografía Sistemática

```typescript
// design-tokens/typography.ts
export const iwanaTypography = {
  fontFamily: {
    sans: ["Exo 2", "Inter", "SF Pro Display", "system-ui", "sans-serif"],
    mono: ["JetBrains Mono", "Fira Code", "monospace"],
    display: ["Exo 2", "sans-serif"],
  },

  fontWeight: {
    thin: "100",
    light: "300",
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
    extrabold: "800",
  },

  fontSize: {
    xs: ["0.75rem", { lineHeight: "1rem" }],
    sm: ["0.875rem", { lineHeight: "1.25rem" }],
    base: ["1rem", { lineHeight: "1.5rem" }],
    lg: ["1.125rem", { lineHeight: "1.75rem" }],
    xl: ["1.25rem", { lineHeight: "1.75rem" }],
    "2xl": ["1.5rem", { lineHeight: "2rem" }],
    "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
    "4xl": ["2.25rem", { lineHeight: "2.5rem" }],
    "5xl": ["3rem", { lineHeight: "1" }],
    "6xl": ["3.75rem", { lineHeight: "1" }],
  },

  letterSpacing: {
    tighter: "-0.05em",
    tight: "-0.025em",
    normal: "0em",
    wide: "0.025em",
    wider: "0.05em",
    widest: "0.1em",
  },
};
```

### 2.3 Espaciado y Layout

```typescript
// design-tokens/spacing.ts
export const iwanaSpacing = {
  // Espaciado Base (múltiplos de 4px)
  spacing: {
    px: "1px",
    0: "0px",
    0.5: "0.125rem", // 2px
    1: "0.25rem", // 4px
    1.5: "0.375rem", // 6px
    2: "0.5rem", // 8px
    2.5: "0.625rem", // 10px
    3: "0.75rem", // 12px
    3.5: "0.875rem", // 14px
    4: "1rem", // 16px
    5: "1.25rem", // 20px
    6: "1.5rem", // 24px
    7: "1.75rem", // 28px
    8: "2rem", // 32px
    9: "2.25rem", // 36px
    10: "2.5rem", // 40px
    11: "2.75rem", // 44px
    12: "3rem", // 48px
    14: "3.5rem", // 56px
    16: "4rem", // 64px
    20: "5rem", // 80px
    24: "6rem", // 96px
    28: "7rem", // 112px
    32: "8rem", // 128px
    36: "9rem", // 144px
    40: "10rem", // 160px
    44: "11rem", // 176px
    48: "12rem", // 192px
    52: "13rem", // 208px
    56: "14rem", // 224px
    60: "15rem", // 240px
    64: "16rem", // 256px
    72: "18rem", // 288px
    80: "20rem", // 320px
    96: "24rem", // 384px
  },

  // Bordes Redondeados (Característica iWana)
  borderRadius: {
    none: "0px",
    sm: "0.125rem", // 2px
    DEFAULT: "0.25rem", // 4px
    md: "0.375rem", // 6px
    lg: "0.5rem", // 8px
    xl: "0.75rem", // 12px
    "2xl": "1rem", // 16px - Estándar iWana
    "3xl": "1.5rem", // 24px - iWana Large
    "4xl": "2rem", // 32px - iWana XL
    full: "9999px", // Completamente redondeado
  },
};
```

---

## 3. Configuración de Tailwind CSS

### 3.1 Configuración Principal

> Nota de vigencia: la referencia actual del proyecto usa **Tailwind CSS v4 + shadcn/ui**. La configuración base del design system debe seguir el enfoque **CSS-first** y no depender como fuente primaria de `tailwind.config.js`.

```css
/* apps/web/app/globals.css o packages/ui/src/styles.css */
@import url("https://fonts.googleapis.com/css2?family=Exo+2:wght@100;400;700&display=swap");
@import "tailwindcss";

@theme {
  --color-iwana-primary: rgb(23 22 58);
  --color-iwana-secondary: rgb(165 195 48);
  --color-iwana-neutral: rgb(174 174 173);
  --color-iwana-background: rgb(255 255 255);
  --color-iwana-foreground: rgb(23 22 58);
  --color-iwana-muted: rgb(245 245 245);
  --color-iwana-success: rgb(34 197 94);
  --color-iwana-warning: rgb(245 158 11);
  --color-iwana-error: rgb(239 68 68);
  --font-sans: "Exo 2", sans-serif;
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --shadow-iwana:
    0 1px 3px 0 rgba(23, 22, 58, 0.1), 0 1px 2px 0 rgba(23, 22, 58, 0.06);
  --shadow-iwana-lg:
    0 10px 15px -3px rgba(23, 22, 58, 0.1),
    0 4px 6px -2px rgba(23, 22, 58, 0.05);
}

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 244 45% 16%;
    --primary: 244 45% 16%;
    --primary-foreground: 0 0% 100%;
    --secondary: 74 61% 48%;
    --secondary-foreground: 244 45% 16%;
    --muted: 210 20% 96%;
    --muted-foreground: 215 16% 47%;
    --accent: 74 61% 48%;
    --accent-foreground: 244 45% 16%;
    --destructive: 0 84% 60%;
    --border: 214 32% 91%;
    --input: 214 32% 91%;
    --ring: 244 45% 16%;
    --radius: 0.75rem;
  }

  body {
    background: rgb(255 255 255);
    color: rgb(23 22 58);
    font-family: "Exo 2", sans-serif;
  }
}
```

### 3.2 CSS Variables Globales

```css
/* styles/globals.css */
@import url("https://fonts.googleapis.com/css2?family=Exo+2:wght@100;400;700&display=swap");
@import "tailwindcss";

@layer base {
  :root {
    /* Colores iWana como CSS Variables */
    --iwana-primary: 23 22 58;
    --iwana-secondary: 165 195 48;
    --iwana-neutral: 174 174 173;
    --iwana-background: 255 255 255;
    --iwana-foreground: 23 22 58;

    /* Espaciado base */
    --iwana-spacing-unit: 0.25rem;

    /* Transiciones */
    --iwana-transition: all 200ms ease-out;
  }

  * {
    @apply border-iwana-neutral/20;
  }

  body {
    @apply bg-iwana-background text-iwana-foreground font-sans;
    font-feature-settings:
      "rlig" 1,
      "calt" 1;
  }

  /* Scrollbar personalizado */
  ::-webkit-scrollbar {
    @apply w-2;
  }

  ::-webkit-scrollbar-track {
    @apply bg-iwana-neutral/10;
  }

  ::-webkit-scrollbar-thumb {
    @apply bg-iwana-primary/20 rounded-full;
  }

  ::-webkit-scrollbar-thumb:hover {
    @apply bg-iwana-primary/30;
  }
}

@layer components {
  /* Clases utilitarias iWana */
  .iwana-glass {
    @apply bg-white/80 backdrop-blur-iwana border border-white/20;
  }

  .iwana-gradient {
    background: linear-gradient(135deg, rgb(23 22 58) 0%, rgb(165 195 48) 100%);
  }

  .iwana-text-gradient {
    @apply bg-gradient-to-r from-iwana-primary to-iwana-secondary bg-clip-text text-transparent;
  }
}
```

---

## 4. Componentes Base iWana

### 4.1 Sistema de Botones

```tsx
// components/ui/IwanaButton.tsx
import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Clases base
  "inline-flex items-center justify-center rounded-2xl font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Botón primario - Verde Lima sobre texto Azul Profundo
        primary:
          "bg-iwana-secondary text-iwana-primary hover:bg-iwana-secondary/90 shadow-iwana-md hover:shadow-iwana-lg",

        // Botón secundario - Azul Profundo sobre texto blanco
        secondary:
          "bg-iwana-primary text-white hover:bg-iwana-primary/90 shadow-iwana-md hover:shadow-iwana-lg",

        // Botón fantasma - Borde Verde Lima
        ghost:
          "border-2 border-iwana-secondary bg-transparent text-iwana-primary hover:bg-iwana-secondary/10",

        // Botón de enlace
        link: "text-iwana-primary underline-offset-4 hover:underline hover:text-iwana-secondary",

        // Botón destructivo
        destructive:
          "bg-iwana-error text-white hover:bg-iwana-error/90 shadow-iwana-md",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-6 text-base",
        lg: "h-13 px-8 text-lg",
        xl: "h-15 px-10 text-xl",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface IwanaButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const IwanaButton = React.forwardRef<HTMLButtonElement, IwanaButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);

IwanaButton.displayName = "IwanaButton";

export { IwanaButton, buttonVariants };
```

### 4.2 Sistema de Tarjetas

```tsx
// components/ui/IwanaCard.tsx
import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva(
  // Clases base - Formas redondeadas características de iWana
  "rounded-2xl transition-all duration-200",
  {
    variants: {
      variant: {
        // Tarjeta estándar
        default:
          "bg-white shadow-iwana-md hover:shadow-iwana-lg border border-iwana-neutral/10",

        // Tarjeta con efecto glassmorphism
        glass: "iwana-glass shadow-iwana-lg",

        // Tarjeta con gradiente sutil
        gradient:
          "bg-gradient-to-br from-white to-iwana-neutral/5 shadow-iwana-md hover:shadow-iwana-lg border border-iwana-neutral/10",

        // Tarjeta destacada
        featured: "bg-iwana-primary text-white shadow-iwana-xl",

        // Tarjeta plana
        flat: "bg-iwana-neutral/5 border border-iwana-neutral/20",
      },
      padding: {
        none: "p-0",
        sm: "p-4",
        md: "p-6",
        lg: "p-8",
        xl: "p-10",
      },
      hover: {
        none: "",
        lift: "hover:-translate-y-1",
        scale: "hover:scale-[1.02]",
        glow: "hover:shadow-iwana-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "md",
      hover: "lift",
    },
  },
);

export interface IwanaCardProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const IwanaCard = React.forwardRef<HTMLDivElement, IwanaCardProps>(
  ({ className, variant, padding, hover, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(cardVariants({ variant, padding, hover, className }))}
        {...props}
      />
    );
  },
);

IwanaCard.displayName = "IwanaCard";

export { IwanaCard, cardVariants };
```

### 4.3 Navegación Principal

```tsx
// components/layout/IwanaNavbar.tsx
import React, { useState } from "react";
import { IwanaButton } from "../ui/IwanaButton";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  active?: boolean;
}

interface IwanaNavbarProps {
  logo?: React.ReactNode;
  items?: NavItem[];
  ctaText?: string;
  ctaHref?: string;
  className?: string;
}

export const IwanaNavbar: React.FC<IwanaNavbarProps> = ({
  logo,
  items = [],
  ctaText = "Contactar",
  ctaHref = "/contacto",
  className,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className={cn("fixed top-4 left-4 right-4 z-50", className)}>
      <div className="iwana-glass rounded-2xl shadow-iwana-lg px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Logo */}
          <div className="flex items-center space-x-2">
            {logo || (
              <img
                src="/iwana-logo.png"
                alt="Iwana Network"
                className="h-8 w-auto"
              />
            )}
          </div>

          {/* Navegación Desktop */}
          <div className="hidden md:flex items-center space-x-8">
            {items.map((item, index) => (
              <a
                key={index}
                href={item.href}
                className={cn(
                  "text-iwana-primary hover:text-iwana-secondary transition-colors duration-200 font-medium",
                  item.active && "text-iwana-secondary",
                )}
              >
                {item.label}
              </a>
            ))}
          </div>

          {/* CTA Button */}
          <div className="flex items-center space-x-4">
            <IwanaButton
              variant="primary"
              size="sm"
              onClick={() => (window.location.href = ctaHref)}
            >
              {ctaText}
            </IwanaButton>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 text-iwana-primary hover:text-iwana-secondary transition-colors"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden mt-4 pt-4 border-t border-iwana-neutral/20">
            <div className="flex flex-col space-y-3">
              {items.map((item, index) => (
                <a
                  key={index}
                  href={item.href}
                  className={cn(
                    "text-iwana-primary hover:text-iwana-secondary transition-colors duration-200 font-medium py-2",
                    item.active && "text-iwana-secondary",
                  )}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};
```

---

## 5. Patrones de Layout

### 5.1 Layout Principal

```tsx
// components/layout/IwanaLayout.tsx
import React from "react";
import { IwanaNavbar } from "./IwanaNavbar";
import { IwanaFooter } from "./IwanaFooter";

interface IwanaLayoutProps {
  children: React.ReactNode;
  navItems?: Array<{ label: string; href: string; active?: boolean }>;
  showNavbar?: boolean;
  showFooter?: boolean;
}

export const IwanaLayout: React.FC<IwanaLayoutProps> = ({
  children,
  navItems,
  showNavbar = true,
  showFooter = true,
}) => {
  return (
    <div className="min-h-screen bg-iwana-background font-sans">
      {/* Navbar flotante */}
      {showNavbar && <IwanaNavbar items={navItems} />}

      {/* Contenido principal con padding para navbar flotante */}
      <main
        className={cn(
          "relative",
          showNavbar && "pt-24", // Espacio para navbar flotante
          showFooter && "pb-16",
        )}
      >
        {children}
      </main>

      {/* Footer */}
      {showFooter && <IwanaFooter />}
    </div>
  );
};
```

### 5.2 Secciones Hero

```tsx
// components/sections/IwanaHero.tsx
import React from "react";
import { IwanaButton } from "../ui/IwanaButton";
import { IwanaCard } from "../ui/IwanaCard";

interface IwanaHeroProps {
  title: string;
  subtitle?: string;
  description?: string;
  primaryCTA?: {
    text: string;
    href: string;
  };
  secondaryCTA?: {
    text: string;
    href: string;
  };
  backgroundPattern?: boolean;
}

export const IwanaHero: React.FC<IwanaHeroProps> = ({
  title,
  subtitle,
  description,
  primaryCTA,
  secondaryCTA,
  backgroundPattern = true,
}) => {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
      {/* Background Pattern */}
      {backgroundPattern && (
        <div className="absolute inset-0 -z-10">
          {/* Blobs decorativos */}
          <div className="absolute top-20 left-10 w-72 h-72 bg-iwana-secondary/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-iwana-primary/5 rounded-full blur-3xl"></div>
        </div>
      )}

      <div className="max-w-4xl mx-auto text-center space-y-8">
        {/* Subtitle */}
        {subtitle && (
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-iwana-secondary/10 text-iwana-secondary font-medium text-sm">
            {subtitle}
          </div>
        )}

        {/* Title */}
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-iwana-primary leading-tight">
          {title}
        </h1>

        {/* Description */}
        {description && (
          <p className="text-xl md:text-2xl text-iwana-neutral max-w-2xl mx-auto leading-relaxed">
            {description}
          </p>
        )}

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
          {primaryCTA && (
            <IwanaButton
              variant="primary"
              size="lg"
              onClick={() => (window.location.href = primaryCTA.href)}
            >
              {primaryCTA.text}
            </IwanaButton>
          )}

          {secondaryCTA && (
            <IwanaButton
              variant="ghost"
              size="lg"
              onClick={() => (window.location.href = secondaryCTA.href)}
            >
              {secondaryCTA.text}
            </IwanaButton>
          )}
        </div>
      </div>
    </section>
  );
};
```

---

## 6. Animaciones y Micro-interacciones

### 6.1 Configuración de Framer Motion

```tsx
// lib/animations.ts
import { Variants } from "framer-motion";

// Animaciones de entrada suaves (característica iWana)
export const fadeInUp: Variants = {
  initial: {
    opacity: 0,
    y: 20,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94], // Easing suave
    },
  },
};

export const fadeInScale: Variants = {
  initial: {
    opacity: 0,
    scale: 0.95,
  },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: "easeOut",
    },
  },
};

// Animación de contenedor para elementos hijos
export const staggerContainer: Variants = {
  animate: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

// Hover effects para tarjetas
export const cardHover: Variants = {
  rest: {
    scale: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: "easeOut",
    },
  },
  hover: {
    scale: 1.02,
    y: -4,
    transition: {
      duration: 0.2,
      ease: "easeOut",
    },
  },
};
```

### 6.2 Componente Animado

```tsx
// components/ui/IwanaAnimatedCard.tsx
import React from "react";
import { motion } from "framer-motion";
import { IwanaCard, IwanaCardProps } from "./IwanaCard";
import { cardHover } from "@/lib/animations";

interface IwanaAnimatedCardProps extends IwanaCardProps {
  children: React.ReactNode;
  animateOnHover?: boolean;
}

export const IwanaAnimatedCard: React.FC<IwanaAnimatedCardProps> = ({
  children,
  animateOnHover = true,
  ...cardProps
}) => {
  return (
    <motion.div
      variants={animateOnHover ? cardHover : undefined}
      initial="rest"
      whileHover="hover"
      animate="rest"
    >
      <IwanaCard {...cardProps}>{children}</IwanaCard>
    </motion.div>
  );
};
```

---

## 7. Checklist de Implementación

### 7.1 Configuración Inicial

#### Setup de Proyecto

- [ ] Instalar dependencias: `tailwindcss`, `@tailwindcss/postcss`, `class-variance-authority`, `clsx`, `tailwind-merge`
- [ ] Inicializar shadcn/ui con `pnpm dlx shadcn@latest init`
- [ ] Configurar Tailwind CSS v4 con tokens iWana y variables compatibles con shadcn/ui
- [ ] Importar fuente Exo 2 desde Google Fonts
- [ ] Configurar CSS variables globales
- [ ] Crear estructura de carpetas para componentes

#### Design Tokens

- [ ] Implementar paleta de colores completa
- [ ] Configurar tipografía con pesos correctos
- [ ] Definir espaciado y border radius
- [ ] Crear sombras personalizadas
- [ ] Configurar transiciones estándar

### 7.2 Componentes Base

#### Elementos UI

- [ ] Implementar sistema de botones con variantes
- [ ] Crear componente de tarjetas flexible
- [ ] Desarrollar navegación responsive
- [ ] Configurar layout principal
- [ ] Crear sección hero reutilizable

#### Estados y Interacciones

- [ ] Definir estados hover consistentes
- [ ] Implementar focus states accesibles
- [ ] Configurar loading states
- [ ] Crear error states
- [ ] Definir success states

### 7.3 Verificación de Calidad

#### Visual

- [ ] Verificar contraste de colores (mínimo 4.5:1)
- [ ] Comprobar consistencia tipográfica
- [ ] Validar espaciado y alineación
- [ ] Revisar responsive design
- [ ] Testear en diferentes navegadores

#### Funcional

- [ ] Verificar navegación por teclado
- [ ] Testear screen readers
- [ ] Validar performance de animaciones
- [ ] Comprobar tiempos de carga
- [ ] Testear en dispositivos móviles

#### Marca

- [ ] Verificar adherencia a manual de identidad
- [ ] Comprobar uso correcto del logo
- [ ] Validar personalidad de marca en micro-copy
- [ ] Revisar consistencia de voz y tono
- [ ] Confirmar diferenciación competitiva

---

## 8. Mantenimiento y Evolución

### 8.1 Versionado de Design System

```typescript
// design-system/version.ts
export const IWANA_DESIGN_SYSTEM_VERSION = "1.0.0";

export const designSystemChangelog = {
  "1.0.0": {
    date: "2026-01-25",
    changes: [
      "Implementación inicial del sistema de diseño iWana",
      "Componentes base sobre shadcn/ui: Button, Card, Navbar",
      "Tokens de diseño completos",
      "Configuración Tailwind CSS v4 + shadcn/ui",
    ],
  },
};
```

### 8.2 Proceso de Actualización

#### Flujo de Cambios

1. **Propuesta:** Documentar cambio necesario
2. **Diseño:** Crear mockups/prototipos
3. **Review:** Validar con manual de identidad
4. **Implementación:** Desarrollar componentes
5. **Testing:** Verificar calidad y accesibilidad
6. **Documentación:** Actualizar Storybook
7. **Release:** Versionar y comunicar cambios

#### Herramientas de Monitoreo

- **Chromatic:** Visual regression testing
- **Storybook:** Documentación viva de componentes
- **Lighthouse:** Performance y accesibilidad
- **Bundle Analyzer:** Optimización de tamaño

---

## Conclusión

Este manual proporciona las bases técnicas completas para implementar la identidad corporativa de iWana Network en aplicaciones digitales. La combinación de design tokens sistemáticos, componentes reutilizables y procesos de calidad asegura que cada implementación mantenga la fidelidad de marca mientras permite escalabilidad y mantenibilidad técnica.

### Beneficios de esta Implementación:

1. **Consistencia Garantizada:** Tokens centralizados previenen desviaciones
2. **Desarrollo Acelerado:** Componentes reutilizables reducen tiempo de desarrollo
3. **Calidad Asegurada:** Procesos de verificación mantienen estándares
4. **Escalabilidad Técnica:** Arquitectura permite crecimiento controlado

### Próximos Pasos:

1. Implementar configuración base siguiendo checklist
2. Desarrollar componentes adicionales según necesidades
3. Establecer proceso de review con design system
4. Configurar herramientas de monitoreo continuo
5. Crear documentación específica del proyecto

La implementación exitosa de este sistema garantizará que todas las aplicaciones de iWana Network reflejen consistentemente la promesa de marca: conectividad de vanguardia con la calidez y eficiencia que caracteriza a la empresa.
