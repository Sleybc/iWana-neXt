# Frontend Prototype — Plan de Implementación MOD01

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar el prototipo de producción del frontend para `@iwana/web` y `@iwana/portal`: login split-screen, MFA verify con OTP input, y dashboard inicial — usando la identidad iWana neXt completa.

**Architecture:** Light Professional + Dark Sidebar (Enfoque B). Sidebar `#17163A` fija + contenido blanco. Login split-screen con panel izquierdo con gradiente de marca y glassmorphism. Componentes en `@iwana/ui` con CVA, consumidos por ambas apps.

**Tech Stack:** Next.js 16.1.6 (App Router), Tailwind CSS 4 (CSS-first), shadcn/ui + Radix Primitives, CVA, react-hook-form + Zod, Framer Motion

**Diseño aprobado:** `docs/plans/2026-03-12-frontend-prototype-design.md`

---

## FASE 0 — Instalar dependencias

### Task 0: Instalar dependencias en apps y packages

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/portal/package.json`
- Modify: `packages/ui/package.json`
- Modify: `packages/shared/package.json`

**Step 1: Instalar dependencias en `@iwana/ui`**

```bash
cd c:/appiw
pnpm add --filter @iwana/ui class-variance-authority clsx tailwind-merge lucide-react @radix-ui/react-label @radix-ui/react-slot
```

**Step 2: Instalar dependencias en `@iwana/web`**

```bash
pnpm add --filter @iwana/web react-hook-form zod @hookform/resolvers framer-motion
```

**Step 3: Instalar dependencias en `@iwana/portal`**

```bash
pnpm add --filter @iwana/portal react-hook-form zod @hookform/resolvers framer-motion
```

**Step 4: Instalar dependencias de tipos**

```bash
pnpm add --filter @iwana/web -D @types/node
pnpm add --filter @iwana/portal -D @types/node
```

**Step 5: Verificar instalación**

```bash
pnpm install
```
Esperado: sin errores, lockfile actualizado.

**Step 6: Commit**

```bash
git add apps/web/package.json apps/portal/package.json packages/ui/package.json packages/shared/package.json pnpm-lock.yaml
git commit -m "chore(deps): instalar react-hook-form, zod, framer-motion, CVA, Radix UI"
```

---

## FASE 1 — Design System (`@iwana/ui`)

### Task 1: Utilidad `cn()` — merge de clases Tailwind

**Files:**
- Create: `packages/ui/src/lib/utils.ts`

**Step 1: Crear la utilidad**

```typescript
// packages/ui/src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina clases Tailwind resolviendo conflictos.
 * Uso: cn('px-4 py-2', condition && 'bg-blue-500', 'px-6') → 'py-2 bg-blue-500 px-6'
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Step 2: Exportar desde el barrel de ui**

Modificar `packages/ui/src/index.ts`:

```typescript
// Design tokens
export * from './tokens';

// Utilidades
export * from './lib/utils';
```

**Step 3: Commit**

```bash
git add packages/ui/src/lib/utils.ts packages/ui/src/index.ts
git commit -m "feat(ui): agregar utilidad cn() para merge de clases Tailwind"
```

---

### Task 2: Componente `Button`

**Files:**
- Create: `packages/ui/src/components/Button.tsx`
- Modify: `packages/ui/src/index.ts`

**Step 1: Crear componente con CVA**

```typescript
// packages/ui/src/components/Button.tsx
'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

/**
 * Componente Button del sistema de diseño iWana neXt.
 * Variantes: primary, secondary, ghost, destructive, link.
 * ADR-026: shadcn/ui + CVA.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-[#17163A] text-white hover:bg-[#232180] focus-visible:ring-[#17163A] active:bg-[#111040]',
        secondary:
          'border-2 border-[#17163A] text-[#17163A] bg-transparent hover:bg-[#17163A] hover:text-white focus-visible:ring-[#17163A]',
        ghost:
          'text-[#374151] hover:bg-[#F3F4F6] focus-visible:ring-[#17163A]',
        destructive:
          'bg-[#EF4444] text-white hover:bg-[#DC2626] focus-visible:ring-[#EF4444]',
        link:
          'text-[#6A7A1C] underline-offset-4 hover:underline focus-visible:ring-[#6A7A1C] p-0 h-auto',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        default: 'h-10 px-6 py-2',
        lg: 'h-12 px-8 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <>
            {/* Spinner accesible */}
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

**Step 2: Exportar**

Agregar a `packages/ui/src/index.ts`:
```typescript
export * from './components/Button';
```

**Step 3: Commit**

```bash
git add packages/ui/src/components/Button.tsx packages/ui/src/index.ts
git commit -m "feat(ui): componente Button con variantes CVA y estado loading"
```

---

### Task 3: Componente `Input`

**Files:**
- Create: `packages/ui/src/components/Input.tsx`
- Modify: `packages/ui/src/index.ts`

**Step 1: Crear componente**

```typescript
// packages/ui/src/components/Input.tsx
'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

/**
 * Componente Input del sistema de diseño iWana neXt.
 * Con soporte para label, helper text, error message y password toggle.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, helperText, error, id, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);
    const inputId = id || React.useId();
    const isPassword = type === 'password';
    const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-[#374151]"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <input
            id={inputId}
            type={inputType}
            ref={ref}
            className={cn(
              'flex h-10 w-full rounded-xl border bg-white px-3 py-2 text-sm text-[#111827]',
              'placeholder:text-[#9CA3AF]',
              'transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17163A] focus-visible:border-transparent',
              'disabled:cursor-not-allowed disabled:opacity-50',
              error
                ? 'border-[#EF4444] focus-visible:ring-[#EF4444]'
                : 'border-[#D1D5DB] hover:border-[#9CA3AF]',
              isPassword && 'pr-10',
              className
            )}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#374151] focus:outline-none"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-[#EF4444] flex items-center gap-1">
            <svg className="h-3 w-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${inputId}-helper`} className="text-xs text-[#6B7280]">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input };
```

**Step 2: Exportar**

Agregar a `packages/ui/src/index.ts`:
```typescript
export * from './components/Input';
```

**Step 3: Commit**

```bash
git add packages/ui/src/components/Input.tsx packages/ui/src/index.ts
git commit -m "feat(ui): componente Input con label, error state y password toggle"
```

---

### Task 4: Componente `Card`

**Files:**
- Create: `packages/ui/src/components/Card.tsx`
- Modify: `packages/ui/src/index.ts`

**Step 1: Crear componente**

```typescript
// packages/ui/src/components/Card.tsx
import * as React from 'react';
import { cn } from '../lib/utils';

/**
 * Componente Card del sistema de diseño iWana neXt.
 * Variantes: default (blanco), glass (glassmorphism sobre oscuro).
 */

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'glass' }>(
  ({ className, variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl',
        variant === 'default' && 'bg-white shadow-[0_1px_3px_0_rgba(23,22,58,0.1),0_1px_2px_0_rgba(23,22,58,0.06)]',
        variant === 'glass' && 'bg-white/10 backdrop-blur-md border border-white/20',
        className
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight text-[#17163A]', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardContent, CardFooter };
```

**Step 2: Exportar**

Agregar a `packages/ui/src/index.ts`:
```typescript
export * from './components/Card';
```

**Step 3: Commit**

```bash
git add packages/ui/src/components/Card.tsx packages/ui/src/index.ts
git commit -m "feat(ui): componente Card con variantes default y glass"
```

---

### Task 5: Componente `Badge`

**Files:**
- Create: `packages/ui/src/components/Badge.tsx`
- Modify: `packages/ui/src/index.ts`

**Step 1: Crear componente**

```typescript
// packages/ui/src/components/Badge.tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

/**
 * Componente Badge del sistema de diseño iWana neXt.
 * Usado principalmente en tablas para estados de tenants y usuarios.
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        success: 'bg-green-100 text-green-800',
        warning: 'bg-amber-100 text-amber-800',
        error:   'bg-red-100 text-red-800',
        info:    'bg-blue-100 text-blue-800',
        neutral: 'bg-gray-100 text-gray-600',
        primary: 'bg-[#EEEEFA] text-[#17163A]',
        lime:    'bg-[#EAF5CC] text-[#6A7A1C]',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
```

**Step 2: Exportar**

Agregar a `packages/ui/src/index.ts`:
```typescript
export * from './components/Badge';
```

**Step 3: Commit**

```bash
git add packages/ui/src/components/Badge.tsx packages/ui/src/index.ts
git commit -m "feat(ui): componente Badge con variantes semánticas"
```

---

### Task 6: Componente `OtpInput`

**Files:**
- Create: `packages/ui/src/components/OtpInput.tsx`
- Modify: `packages/ui/src/index.ts`

**Step 1: Crear componente**

```typescript
// packages/ui/src/components/OtpInput.tsx
'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

/**
 * Componente OTP de 6 dígitos para flujo MFA.
 * - Auto-avance al siguiente campo al ingresar dígito
 * - Backspace regresa al campo anterior
 * - Paste distribuye automáticamente los 6 dígitos
 */
interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
  className?: string;
}

export function OtpInput({ length = 6, value, onChange, error, disabled, className }: OtpInputProps) {
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(length, '').split('').slice(0, length);

  const handleChange = (index: number, char: string) => {
    if (!/^\d*$/.test(char)) return;
    const newDigits = [...digits];
    newDigits[index] = char.slice(-1);
    const newValue = newDigits.join('');
    onChange(newValue);
    if (char && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        onChange(newDigits.join(''));
        inputRefs.current[index - 1]?.focus();
      } else {
        const newDigits = [...digits];
        newDigits[index] = '';
        onChange(newDigits.join(''));
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange(pasted.padEnd(length, ''));
    const nextIndex = Math.min(pasted.length, length - 1);
    inputRefs.current[nextIndex]?.focus();
  };

  return (
    <div className={cn('flex gap-3', className)} role="group" aria-label="Código OTP">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digits[i] || ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          aria-label={`Dígito ${i + 1} de ${length}`}
          className={cn(
            'w-12 h-12 text-center text-lg font-semibold rounded-xl border-2 transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-offset-1',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error
              ? 'border-[#EF4444] text-[#EF4444] focus:ring-[#EF4444]'
              : 'border-[#D1D5DB] text-[#17163A] focus:border-[#17163A] focus:ring-[#17163A]',
            digits[i] && !error && 'border-[#17163A] bg-[#EEEEFA]'
          )}
        />
      ))}
    </div>
  );
}
```

**Step 2: Exportar**

Agregar a `packages/ui/src/index.ts`:
```typescript
export * from './components/OtpInput';
```

**Step 3: Commit**

```bash
git add packages/ui/src/components/OtpInput.tsx packages/ui/src/index.ts
git commit -m "feat(ui): componente OtpInput para flujo MFA con auto-avance y paste"
```

---

## FASE 2 — Shared: Schemas Zod y mensajes

### Task 7: Schemas Zod de autenticación

**Files:**
- Create: `packages/shared/src/schemas/auth.schema.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Crear schemas**

```typescript
// packages/shared/src/schemas/auth.schema.ts
import { z } from 'zod';

/**
 * Schemas Zod para formularios de autenticación.
 * Usados con react-hook-form + @hookform/resolvers/zod.
 * Mensajes de error en español colombiano.
 */

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'El correo es requerido')
    .email('Ingresa un correo electrónico válido'),
  password: z
    .string()
    .min(1, 'La contraseña es requerida')
    .min(8, 'La contraseña debe tener al menos 8 caracteres'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const mfaVerifySchema = z.object({
  code: z
    .string()
    .length(6, 'El código debe tener exactamente 6 dígitos')
    .regex(/^\d{6}$/, 'El código solo puede contener dígitos'),
});

export type MfaVerifyFormValues = z.infer<typeof mfaVerifySchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'La contraseña actual es requerida'),
    newPassword: z
      .string()
      .min(8, 'La nueva contraseña debe tener al menos 8 caracteres')
      .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
      .regex(/[0-9]/, 'Debe contener al menos un número')
      .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial'),
    confirmPassword: z.string().min(1, 'Confirma tu nueva contraseña'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
```

**Step 2: Instalar zod en @iwana/shared**

```bash
pnpm add --filter @iwana/shared zod
```

**Step 3: Exportar**

Agregar a `packages/shared/src/index.ts`:
```typescript
// Schemas Zod (frontend)
export * from './schemas/auth.schema';
```

**Step 4: Commit**

```bash
git add packages/shared/src/schemas/auth.schema.ts packages/shared/src/index.ts packages/shared/package.json pnpm-lock.yaml
git commit -m "feat(shared): schemas Zod de autenticación login, MFA y cambio de contraseña"
```

---

## FASE 3 — `@iwana/web`: Login de plataforma

### Task 8: API client para `@iwana/web`

**Files:**
- Create: `apps/web/src/lib/api-client.ts`

**Step 1: Crear cliente HTTP**

```typescript
// apps/web/src/lib/api-client.ts

/**
 * Cliente HTTP para @iwana/web — Portal Administrativo.
 * Conecta con la API en /api/v1 (proxy Next.js o directo en dev).
 * Endpoint de autenticación de plataforma: POST /auth/platform/login
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'include',
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.code ?? 'UNKNOWN', body.message ?? 'Error del servidor');
  }

  return res.json() as Promise<T>;
}

export interface PlatformLoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

export const authApi = {
  /**
   * Login de plataforma (SYSTEM_ADMIN / IWANA_SUPPORT).
   * POST /api/v1/auth/platform/login
   */
  platformLogin: (email: string, password: string) =>
    request<PlatformLoginResponse>('/auth/platform/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  /**
   * Verificar código MFA.
   * POST /api/v1/auth/mfa/verify
   */
  mfaVerify: (code: string) =>
    request<{ accessToken: string }>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
};
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/api-client.ts
git commit -m "feat(web): API client para autenticación de plataforma"
```

---

### Task 9: Pantalla de Login — `@iwana/web`

**Files:**
- Create: `apps/web/src/app/auth/login/page.tsx`
- Create: `apps/web/src/components/auth/LoginForm.tsx`
- Create: `apps/web/src/components/auth/LoginBrandPanel.tsx`

**Step 1: Crear el panel de marca (lado izquierdo)**

```typescript
// apps/web/src/components/auth/LoginBrandPanel.tsx
import type { ReactNode } from 'react';

/**
 * Panel izquierdo del login — identidad iWana neXt.
 * Gradiente Azul Noche → Azul Medio + glassmorphism card.
 * Solo visible en pantallas lg+.
 */
interface LoginBrandPanelProps {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
}

export function LoginBrandPanel({
  title = 'Control total de tu red',
  subtitle = 'Plataforma OSS/BSS para operadores ISP colombianos',
  children,
}: LoginBrandPanelProps) {
  return (
    <div
      className="hidden lg:flex lg:w-2/5 flex-col justify-between p-10 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #17163A 0%, #2D2A9E 100%)' }}
    >
      {/* Patrón de fondo decorativo */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, #A5C330 1px, transparent 0)`,
          backgroundSize: '40px 40px',
        }}
        aria-hidden="true"
      />

      {/* Logo */}
      <div className="relative z-10">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(165, 195, 48, 0.2)' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#A5C330" />
              <path d="M2 17l10 5 10-5" stroke="#A5C330" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 12l10 5 10-5" stroke="#A5C330" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-white font-bold text-xl tracking-tight">iWana neXt</span>
        </div>
      </div>

      {/* Contenido central */}
      <div className="relative z-10 flex-1 flex flex-col justify-center gap-8">
        <div>
          <h1 className="text-3xl font-bold text-white leading-tight">{title}</h1>
          <p className="mt-3 text-base" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {subtitle}
          </p>
        </div>

        {/* Glassmorphism card con métrica */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
          }}
        >
          {children ?? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-[#A5C330]" aria-hidden="true" />
                <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  Plataforma operativa
                </span>
              </div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                "Conecta tu mundo con tecnología de punta para ISPs colombianos"
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10">
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          © 2026 iWana Technologies. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Crear el formulario de login**

```typescript
// apps/web/src/components/auth/LoginForm.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { loginSchema, type LoginFormValues } from '@iwana/shared';
import { Button } from '@iwana/ui';
import { Input } from '@iwana/ui';
import { authApi, ApiError } from '@/lib/api-client';

/**
 * Formulario de login para el portal administrativo de plataforma.
 * Conecta con POST /api/v1/auth/platform/login
 * Valida con Zod + react-hook-form (ADR-025).
 */

// Mensajes de error legibles para el usuario
const errorMessages: Record<number, string> = {
  401: 'Correo o contraseña incorrectos.',
  403: 'No tienes permisos para acceder a esta plataforma.',
  429: 'Demasiados intentos fallidos. Espera 1 minuto e intenta de nuevo.',
};

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setServerError(null);
    try {
      await authApi.platformLogin(data.email, data.password);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(
          errorMessages[err.status] ?? 'Ocurrió un error inesperado. Intenta de nuevo.'
        );
      } else {
        setServerError('Error de conexión. Verifica tu red e intenta de nuevo.');
      }
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-5"
      noValidate
      aria-label="Formulario de inicio de sesión"
    >
      <Input
        label="Correo electrónico"
        type="email"
        placeholder="admin@plataforma.com"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />

      <Input
        label="Contraseña"
        type="password"
        placeholder="••••••••"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />

      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          <svg className="h-4 w-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span>{serverError}</span>
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        loading={isSubmitting}
        className="w-full mt-1"
      >
        {isSubmitting ? 'Ingresando...' : 'Ingresar'}
      </Button>

      <div className="text-center">
        <a
          href="/auth/forgot-password"
          className="text-sm text-[#6A7A1C] hover:underline underline-offset-4 focus:outline-none focus:underline"
        >
          ¿Olvidaste tu contraseña?
        </a>
      </div>
    </form>
  );
}
```

**Step 3: Crear la página**

```typescript
// apps/web/src/app/auth/login/page.tsx
import type { Metadata } from 'next';
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Iniciar sesión — iWana neXt Admin',
  description: 'Acceso al portal de administración de plataforma iWana neXt',
};

/**
 * Página de login del portal administrativo.
 * Layout split-screen: panel de marca (izq, solo desktop) + formulario (der).
 */
export default function LoginPage() {
  return (
    <main className="min-h-screen flex" aria-label="Página de inicio de sesión">
      <LoginBrandPanel />

      {/* Panel derecho — formulario */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm">
          {/* Badge de contexto */}
          <div className="mb-8 flex flex-col items-center gap-3">
            {/* Logo mobile (visible solo cuando el panel izq está oculto) */}
            <div className="flex lg:hidden items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#17163A] flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#A5C330" />
                  <path d="M2 17l10 5 10-5" stroke="#A5C330" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="font-bold text-[#17163A]">iWana neXt</span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EEEEFA] px-3 py-1 text-xs font-medium text-[#17163A]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A5C330]" aria-hidden="true" />
              Administración de Plataforma
            </span>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-[#17163A]">Bienvenido de nuevo</h2>
            <p className="mt-1 text-sm text-[#6B7280]">
              Ingresa tus credenciales para continuar
            </p>
          </div>

          <LoginForm />
        </div>
      </div>
    </main>
  );
}
```

**Step 4: Actualizar redirect de la página raíz**

Modificar `apps/web/src/app/page.tsx`:

```typescript
// apps/web/src/app/page.tsx
import { redirect } from 'next/navigation';

/**
 * Ruta raíz — redirige al login o dashboard según sesión.
 * La lógica de auth guard se aplica en middleware.ts.
 */
export default function HomePage() {
  redirect('/auth/login');
}
```

**Step 5: Commit**

```bash
git add apps/web/src/app/auth/login/page.tsx apps/web/src/components/auth/ apps/web/src/app/page.tsx
git commit -m "feat(web): pantalla de login split-screen con identidad iWana y validación Zod"
```

---

### Task 10: Pantalla MFA Verify — `@iwana/web`

**Files:**
- Create: `apps/web/src/app/auth/mfa/verify/page.tsx`
- Create: `apps/web/src/components/auth/MfaVerifyForm.tsx`

**Step 1: Crear formulario MFA**

```typescript
// apps/web/src/components/auth/MfaVerifyForm.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { OtpInput } from '@iwana/ui';
import { Button } from '@iwana/ui';
import { authApi, ApiError } from '@/lib/api-client';

/**
 * Formulario de verificación MFA (TOTP 6 dígitos).
 * Se muestra después de un login exitoso cuando el usuario tiene MFA activo.
 * Incluye countdown timer de 30 segundos para el código TOTP.
 */

const TOTP_INTERVAL = 30;

export function MfaVerifyForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(TOTP_INTERVAL);

  // Countdown sincronizado con el reloj TOTP (múltiplos de 30s desde epoch)
  useEffect(() => {
    const update = () => {
      const now = Math.floor(Date.now() / 1000);
      setSecondsLeft(TOTP_INTERVAL - (now % TOTP_INTERVAL));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const progress = (secondsLeft / TOTP_INTERVAL) * 100;
  const isUrgent = secondsLeft <= 5;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;

    setLoading(true);
    setError(null);
    setHasError(false);

    try {
      await authApi.mfaVerify(code);
      router.push('/dashboard');
    } catch (err) {
      setHasError(true);
      setCode('');
      if (err instanceof ApiError) {
        if (err.status === 401) setError('Código incorrecto. Intenta de nuevo.');
        else if (err.status === 429) setError('Demasiados intentos. Cuenta temporalmente bloqueada.');
        else setError('Error al verificar el código. Intenta de nuevo.');
      } else {
        setError('Error de conexión. Verifica tu red.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit cuando los 6 dígitos están completos
  useEffect(() => {
    if (code.length === 6 && !loading) {
      handleSubmit(new Event('submit') as unknown as React.FormEvent);
    }
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-6" noValidate>
      <OtpInput
        value={code}
        onChange={(v) => { setCode(v); setHasError(false); setError(null); }}
        error={hasError}
        disabled={loading}
        className="justify-center"
      />

      {/* Barra de progreso TOTP */}
      <div className="w-full flex flex-col gap-1.5">
        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${progress}%`,
              backgroundColor: isUrgent ? '#EF4444' : secondsLeft <= 10 ? '#F59E0B' : '#A5C330',
            }}
            role="progressbar"
            aria-valuenow={secondsLeft}
            aria-valuemin={0}
            aria-valuemax={TOTP_INTERVAL}
            aria-label="Tiempo restante del código"
          />
        </div>
        <p className="text-xs text-center" style={{ color: isUrgent ? '#EF4444' : '#6B7280' }}>
          {isUrgent
            ? `⚠ El código expira en ${secondsLeft}s — genera uno nuevo`
            : `El código expira en ${secondsLeft}s`}
        </p>
      </div>

      {error && (
        <div role="alert" className="w-full flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <svg className="h-4 w-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      <Button type="submit" size="lg" loading={loading} disabled={code.length !== 6} className="w-full">
        {loading ? 'Verificando...' : 'Verificar código'}
      </Button>

      <button
        type="button"
        className="text-sm text-[#6B7280] hover:text-[#374151] underline-offset-4 hover:underline"
        onClick={() => router.push('/auth/backup-code')}
      >
        Usar código de respaldo
      </button>
    </form>
  );
}
```

**Step 2: Crear la página**

```typescript
// apps/web/src/app/auth/mfa/verify/page.tsx
import type { Metadata } from 'next';
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';
import { MfaVerifyForm } from '@/components/auth/MfaVerifyForm';

export const metadata: Metadata = {
  title: 'Verificación MFA — iWana neXt Admin',
};

export default function MfaVerifyPage() {
  return (
    <main className="min-h-screen flex" aria-label="Verificación en dos pasos">
      <LoginBrandPanel
        title="Verificación en dos pasos"
        subtitle="Tu cuenta está protegida con autenticación de dos factores"
      />

      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-[#EEEEFA] flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-[#17163A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-[#17163A]">Verificación en dos pasos</h2>
            <p className="mt-1 text-sm text-[#6B7280]">
              Ingresa el código de 6 dígitos de tu app autenticadora
            </p>
          </div>

          <MfaVerifyForm />
        </div>
      </div>
    </main>
  );
}
```

**Step 3: Commit**

```bash
git add apps/web/src/app/auth/mfa/ apps/web/src/components/auth/MfaVerifyForm.tsx
git commit -m "feat(web): pantalla MFA verify con OTP input y countdown TOTP"
```

---

### Task 11: Dashboard Layout con Sidebar — `@iwana/web`

**Files:**
- Create: `apps/web/src/app/dashboard/layout.tsx`
- Create: `apps/web/src/components/layout/Sidebar.tsx`
- Create: `apps/web/src/components/layout/Header.tsx`

**Step 1: Crear Sidebar**

```typescript
// apps/web/src/components/layout/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@iwana/ui';

/**
 * Sidebar de navegación del portal administrativo.
 * Fondo Azul Noche #17163A. Acento Lima para ítem activo.
 */

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/tenants',
    label: 'Tenants',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    href: '/users',
    label: 'Usuarios',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    href: '/audit',
    label: 'Auditoría',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Configuración',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden lg:flex w-[280px] flex-col flex-shrink-0 h-screen sticky top-0"
      style={{ backgroundColor: '#17163A' }}
      aria-label="Navegación principal"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(165,195,48,0.2)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#A5C330" />
            <path d="M2 17l10 5 10-5" stroke="#A5C330" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 12l10 5 10-5" stroke="#A5C330" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <span className="text-white font-bold text-sm">iWana neXt</span>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Admin</p>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-3 py-4" aria-label="Menú principal">
        <ul className="space-y-1" role="list">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative',
                    isActive
                      ? 'text-white'
                      : 'hover:bg-white/5'
                  )}
                  style={{
                    color: isActive ? 'white' : 'rgba(255,255,255,0.6)',
                    backgroundColor: isActive ? 'rgba(165,195,48,0.12)' : undefined,
                  }}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full"
                      style={{ backgroundColor: '#A5C330' }}
                      aria-hidden="true"
                    />
                  )}
                  <span className={cn(isActive ? 'text-[#A5C330]' : '')}>{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer de usuario */}
      <div className="px-4 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-[#A5C330] flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-[#17163A]">SA</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">System Admin</p>
            <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>Plataforma</p>
          </div>
          <button
            type="button"
            className="text-white/40 hover:text-white/80 transition-colors"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
```

**Step 2: Crear Header**

```typescript
// apps/web/src/components/layout/Header.tsx
import type { ReactNode } from 'react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

/**
 * Header de página para el portal administrativo.
 * Muestra título de sección y acciones opcionales.
 */
export function Header({ title, subtitle, actions }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
      <div>
        <h1 className="text-xl font-semibold text-[#17163A]">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </header>
  );
}
```

**Step 3: Crear layout del dashboard**

```typescript
// apps/web/src/app/dashboard/layout.tsx
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';

/**
 * Layout de las páginas autenticadas del portal administrativo.
 * Sidebar fija izquierda + área de contenido scrollable.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-auto">
        {children}
      </div>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add apps/web/src/components/layout/ apps/web/src/app/dashboard/layout.tsx
git commit -m "feat(web): layout del dashboard con sidebar iWana (dark sidebar + contenido claro)"
```

---

### Task 12: Dashboard inicial — `@iwana/web`

**Files:**
- Create: `apps/web/src/app/dashboard/page.tsx`
- Create: `apps/web/src/components/dashboard/MetricCard.tsx`
- Create: `apps/web/src/components/dashboard/TenantsTable.tsx`

**Step 1: Crear MetricCard**

```typescript
// apps/web/src/components/dashboard/MetricCard.tsx
import type { ReactNode } from 'react';
import { Card, CardContent } from '@iwana/ui';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  icon: ReactNode;
  iconColor?: string;
  iconBg?: string;
}

/**
 * Card de métrica para el dashboard administrativo.
 * Muestra un KPI con ícono, valor y variación.
 */
export function MetricCard({ title, value, change, icon, iconColor = '#17163A', iconBg = '#EEEEFA' }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="mt-1 text-3xl font-bold text-[#17163A]">{value}</p>
            {change && (
              <p className="mt-1 text-xs text-gray-500">{change}</p>
            )}
          </div>
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
            style={{ backgroundColor: iconBg, color: iconColor }}
            aria-hidden="true"
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Crear TenantsTable**

```typescript
// apps/web/src/components/dashboard/TenantsTable.tsx
import { Badge } from '@iwana/ui';
import { Card, CardHeader, CardTitle, CardContent } from '@iwana/ui';

type TenantStatus = 'ACTIVE' | 'PROVISIONING' | 'PROVISIONING_FAILED' | 'SUSPENDED' | 'INACTIVE';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  createdAt: string;
}

const statusConfig: Record<TenantStatus, { label: string; variant: 'success' | 'warning' | 'error' | 'neutral' }> = {
  ACTIVE:               { label: 'Activo',             variant: 'success'  },
  PROVISIONING:         { label: 'Provisionando',      variant: 'warning'  },
  PROVISIONING_FAILED:  { label: 'Error provisión',    variant: 'error'    },
  SUSPENDED:            { label: 'Suspendido',         variant: 'neutral'  },
  INACTIVE:             { label: 'Inactivo',           variant: 'neutral'  },
};

// Datos estáticos para el prototipo — se reemplazarán con datos reales
const mockTenants: Tenant[] = [
  { id: '1', name: 'Primera Empresa ISP', slug: 'primeraempresa', status: 'ACTIVE', createdAt: '2026-03-10' },
  { id: '2', name: 'Demo ISP',           slug: 'demoisp',         status: 'PROVISIONING_FAILED', createdAt: '2026-03-11' },
];

/**
 * Tabla de tenants para el dashboard administrativo.
 * Muestra estado con badges semánticos y acción de retry.
 */
export function TenantsTable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tenants de la plataforma</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Lista de tenants">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Slug</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Creado</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {mockTenants.map((tenant) => {
                const { label, variant } = statusConfig[tenant.status];
                return (
                  <tr key={tenant.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-[#17163A]">{tenant.name}</td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-500">{tenant.slug}</td>
                    <td className="px-6 py-4">
                      <Badge variant={variant}>{label}</Badge>
                    </td>
                    <td className="px-6 py-4 text-gray-500">{tenant.createdAt}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a href={`/tenants/${tenant.id}`} className="text-xs text-[#6A7A1C] hover:underline">
                          Ver detalle
                        </a>
                        {tenant.status === 'PROVISIONING_FAILED' && (
                          <button
                            type="button"
                            className="text-xs font-medium text-white bg-[#EF4444] hover:bg-[#DC2626] px-2 py-1 rounded-lg transition-colors"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 3: Crear la página del dashboard**

```typescript
// apps/web/src/app/dashboard/page.tsx
import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { TenantsTable } from '@/components/dashboard/TenantsTable';

export const metadata: Metadata = {
  title: 'Dashboard — iWana neXt Admin',
};

/**
 * Dashboard principal del portal administrativo.
 * Muestra métricas de plataforma y tabla de tenants.
 * Sprint 1: datos estáticos. Sprint 2+: conectar con endpoints reales.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col flex-1">
      <Header
        title="Dashboard"
        subtitle="Resumen de la plataforma iWana neXt"
      />

      <main className="flex-1 p-6 space-y-6">
        {/* Métricas */}
        <section aria-label="Métricas de plataforma">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Tenants activos"
              value="1 / 2"
              change="1 nuevo esta semana"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              }
            />
            <MetricCard
              title="Usuarios registrados"
              value="1"
              change="Admin de plataforma"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              }
              iconBg="#EAF5CC"
              iconColor="#6A7A1C"
            />
            <MetricCard
              title="Jobs en cola"
              value="0"
              change="Sistema saludable"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              }
              iconBg="#DCFCE7"
              iconColor="#22C55E"
            />
            <MetricCard
              title="Alertas"
              value="1"
              change="1 tenant en error"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              }
              iconBg="#FEF2F2"
              iconColor="#EF4444"
            />
          </div>
        </section>

        {/* Tabla de tenants */}
        <section aria-label="Tenants de la plataforma">
          <TenantsTable />
        </section>
      </main>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/page.tsx apps/web/src/components/dashboard/
git commit -m "feat(web): dashboard inicial con métricas y tabla de tenants"
```

---

## FASE 4 — `@iwana/portal`: Portal de Suscriptores

### Task 13: API client para `@iwana/portal`

**Files:**
- Create: `apps/portal/src/lib/api-client.ts`

**Step 1: Crear cliente HTTP del portal**

```typescript
// apps/portal/src/lib/api-client.ts

/**
 * Cliente HTTP para @iwana/portal — Portal de Suscriptores.
 * Requiere header X-Tenant-Slug para identificar el tenant.
 * Endpoint de autenticación: POST /auth/login
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Obtiene el slug del tenant desde la URL, variable de entorno,
 * o subdomain en producción.
 */
function getTenantSlug(): string {
  return process.env.NEXT_PUBLIC_TENANT_SLUG ?? 'default';
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Slug': getTenantSlug(),
      ...options?.headers,
    },
    credentials: 'include',
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.code ?? 'UNKNOWN', body.message ?? 'Error del servidor');
  }

  return res.json() as Promise<T>;
}

export const authApi = {
  tenantLogin: (email: string, password: string) =>
    request<{ accessToken: string; user: { id: string; email: string; name: string; role: string } }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) }
    ),
  mfaVerify: (code: string) =>
    request<{ accessToken: string }>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
};
```

**Step 2: Commit**

```bash
git add apps/portal/src/lib/api-client.ts
git commit -m "feat(portal): API client con X-Tenant-Slug para autenticación de tenant"
```

---

### Task 14: Login, MFA y Dashboard de `@iwana/portal`

**Files:**
- Create: `apps/portal/src/app/auth/login/page.tsx`
- Create: `apps/portal/src/app/auth/mfa/verify/page.tsx`
- Create: `apps/portal/src/app/dashboard/layout.tsx`
- Create: `apps/portal/src/app/dashboard/page.tsx`
- Create: `apps/portal/src/components/auth/LoginBrandPanel.tsx`
- Create: `apps/portal/src/components/auth/LoginForm.tsx`
- Create: `apps/portal/src/components/auth/MfaVerifyForm.tsx`
- Create: `apps/portal/src/components/layout/Sidebar.tsx`
- Modify: `apps/portal/src/app/page.tsx`

**Step 1: Panel de marca del portal**

```typescript
// apps/portal/src/components/auth/LoginBrandPanel.tsx
/**
 * Panel izquierdo del login del portal de suscriptores.
 * Tono ligeramente más cálido/accesible que el admin.
 */
export function LoginBrandPanel() {
  return (
    <div
      className="hidden lg:flex lg:w-2/5 flex-col justify-between p-10 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #17163A 0%, #534FD4 100%)' }}
    >
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, #A5C330 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(165,195,48,0.2)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#A5C330" />
            <path d="M2 17l10 5 10-5" stroke="#A5C330" strokeWidth="2" strokeLinecap="round" />
            <path d="M2 12l10 5 10-5" stroke="#A5C330" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <span className="text-white font-bold text-xl">iWana neXt</span>
      </div>

      <div className="relative z-10 flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold text-white leading-tight">Conecta tu mundo</h1>
          <p className="mt-3 text-base" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Accede a tu portal de suscriptor y gestiona tus servicios de conectividad
          </p>
        </div>
        <div
          className="rounded-2xl p-5"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-[#A5C330]" aria-hidden="true" />
            <span className="text-sm font-medium text-white">Tu conexión te espera</span>
          </div>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Gestiona tu plan, consulta facturas y reporta incidencias desde un solo lugar.
          </p>
        </div>
      </div>

      <div className="relative z-10">
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          © 2026 iWana Technologies
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Formulario de login del portal**

```typescript
// apps/portal/src/components/auth/LoginForm.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { loginSchema, type LoginFormValues } from '@iwana/shared';
import { Button, Input } from '@iwana/ui';
import { authApi, ApiError } from '@/lib/api-client';

const errorMessages: Record<number, string> = {
  401: 'Correo o contraseña incorrectos.',
  404: 'No encontramos una cuenta con ese correo.',
  429: 'Demasiados intentos. Espera 1 minuto.',
};

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setServerError(null);
    try {
      await authApi.tenantLogin(data.email, data.password);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(errorMessages[err.status] ?? 'Error inesperado. Intenta de nuevo.');
      } else {
        setServerError('Error de conexión. Verifica tu red.');
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      <Input label="Correo electrónico" type="email" placeholder="tu@email.com" autoComplete="email" error={errors.email?.message} {...register('email')} />
      <Input label="Contraseña" type="password" placeholder="••••••••" autoComplete="current-password" error={errors.password?.message} {...register('password')} />

      {serverError && (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <svg className="h-4 w-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
          {serverError}
        </div>
      )}

      <Button type="submit" size="lg" loading={isSubmitting} className="w-full mt-1">
        {isSubmitting ? 'Ingresando...' : 'Ingresar'}
      </Button>

      <div className="text-center">
        <a href="/auth/forgot-password" className="text-sm text-[#6A7A1C] hover:underline underline-offset-4">
          ¿Olvidaste tu contraseña?
        </a>
      </div>
    </form>
  );
}
```

**Step 3: Páginas de auth del portal**

```typescript
// apps/portal/src/app/auth/login/page.tsx
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <main className="min-h-screen flex">
      <LoginBrandPanel />
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="flex lg:hidden items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#17163A] flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5z" fill="#A5C330" /></svg>
              </div>
              <span className="font-bold text-[#17163A]">iWana neXt</span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF5CC] px-3 py-1 text-xs font-medium text-[#6A7A1C]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A5C330]" aria-hidden="true" />
              Portal de Suscriptores
            </span>
          </div>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-[#17163A]">Bienvenido</h2>
            <p className="mt-1 text-sm text-[#6B7280]">Ingresa a tu portal de servicios</p>
          </div>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
```

**Step 4: Dashboard del portal (suscriptor)**

```typescript
// apps/portal/src/app/dashboard/page.tsx
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@iwana/ui';

/**
 * Dashboard del portal de suscriptores.
 * Sprint 1: datos estáticos de ejemplo.
 * Sprint 2+: conectar con GET /users/me y endpoints de servicios.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <div>
          <h1 className="text-xl font-semibold text-[#17163A]">Mi Portal</h1>
          <p className="text-sm text-gray-500">Bienvenido, Juan García</p>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-6">
        {/* Estado del servicio */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Mi plan activo</p>
                  <p className="mt-1 text-xl font-bold text-[#17163A]">Plan Hogar 100M</p>
                  <p className="text-xs text-gray-500 mt-1">Vence: 31 mar 2026</p>
                </div>
                <Badge variant="success">Activo</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Estado conexión</p>
                  <p className="mt-1 text-xl font-bold text-[#17163A]">En línea</p>
                  <p className="text-xs text-gray-500 mt-1">↓ 98.7 Mbps · ↑ 49.2 Mbps</p>
                </div>
                <div className="w-3 h-3 rounded-full bg-[#22C55E] mt-1" aria-label="Conectado" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Próxima factura</p>
                  <p className="mt-1 text-xl font-bold text-[#17163A]">$89.900</p>
                  <p className="text-xs text-gray-500 mt-1">Vence: 5 abr 2026</p>
                </div>
                <Badge variant="warning">Pendiente</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Accesos rápidos */}
        <Card>
          <CardHeader>
            <CardTitle>Accesos rápidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Ver facturas',    href: '/billing'  },
                { label: 'Soporte / PQR',  href: '/support'  },
                { label: 'Cambiar plan',   href: '/services' },
                { label: 'Mi perfil',      href: '/profile'  },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="flex items-center justify-center rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-[#17163A] hover:border-[#17163A] hover:bg-[#EEEEFA] transition-all"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
```

**Step 5: Layout y sidebar del portal (simplificado)**

```typescript
// apps/portal/src/app/dashboard/layout.tsx
import type { ReactNode } from 'react';

// Sidebar del portal (igual que @iwana/web pero con nav de suscriptor)
// Sprint 1: layout básico. Sprint 2: componente compartido en @iwana/ui.
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar portal */}
      <aside className="hidden lg:flex w-[240px] flex-col flex-shrink-0 h-screen sticky top-0" style={{ backgroundColor: '#17163A' }}>
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(165,195,48,0.2)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5z" fill="#A5C330" /></svg>
          </div>
          <span className="text-white font-bold text-sm">iWana neXt</span>
        </div>
        <nav className="flex-1 px-3 py-4">
          <ul className="space-y-1">
            {[
              { href: '/dashboard', label: 'Inicio'     },
              { href: '/services',  label: 'Servicios'  },
              { href: '/billing',   label: 'Facturación'},
              { href: '/support',   label: 'Soporte'    },
              { href: '/profile',   label: 'Mi perfil'  },
            ].map((item) => (
              <li key={item.href}>
                <a href={item.href} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="flex-1 flex flex-col overflow-auto">{children}</div>
    </div>
  );
}
```

**Step 6: Redirect raíz del portal y page MFA**

```typescript
// apps/portal/src/app/page.tsx
import { redirect } from 'next/navigation';
export default function HomePage() { redirect('/auth/login'); }
```

```typescript
// apps/portal/src/app/auth/mfa/verify/page.tsx
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';
// Reusar el MfaVerifyForm — misma lógica que @iwana/web
// Para Sprint 1 importar directamente; Sprint 2+ mover a @iwana/ui
import { MfaVerifyForm } from '@/components/auth/MfaVerifyForm';

export default function MfaVerifyPage() {
  return (
    <main className="min-h-screen flex">
      <LoginBrandPanel />
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-[#EEEEFA] flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-[#17163A]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </div>
            <h2 className="text-2xl font-bold text-[#17163A]">Verificación en dos pasos</h2>
            <p className="mt-1 text-sm text-[#6B7280]">Ingresa el código de 6 dígitos</p>
          </div>
          <MfaVerifyForm />
        </div>
      </div>
    </main>
  );
}
```

Crear `apps/portal/src/components/auth/MfaVerifyForm.tsx` — copiar el mismo contenido del Task 10 Step 1, cambiando la importación de `api-client` a `@/lib/api-client` (ya es correcto).

**Step 7: Commit**

```bash
git add apps/portal/src/
git commit -m "feat(portal): login, MFA verify y dashboard inicial del portal de suscriptores"
```

---

## FASE 5 — Verificación y typecheck

### Task 15: Verificar builds

**Step 1: Typecheck de todos los packages**

```bash
cd c:/appiw
pnpm --filter @iwana/ui typecheck
pnpm --filter @iwana/shared typecheck
pnpm --filter @iwana/web typecheck
pnpm --filter @iwana/portal typecheck
```

Esperado: 0 errores TypeScript en todos los packages.

**Step 2: Build de apps**

```bash
pnpm --filter @iwana/web build
pnpm --filter @iwana/portal build
```

Esperado: build exitoso sin errores.

**Step 3: Corregir errores si los hay**

Si hay errores de tipos: corregir en el archivo indicado y volver al step 1.
Si hay errores de importación: verificar que todos los `export` en `@iwana/ui/src/index.ts` y `@iwana/shared/src/index.ts` estén correctos.

**Step 4: Verificar en dev**

```bash
# En terminales separadas:
pnpm --filter @iwana/web dev
pnpm --filter @iwana/portal dev
```

Navegar a:
- `http://localhost:3001/auth/login` → Login admin
- `http://localhost:3001/auth/mfa/verify` → MFA admin
- `http://localhost:3001/dashboard` → Dashboard admin
- `http://localhost:3002/auth/login` → Login portal
- `http://localhost:3002/dashboard` → Dashboard portal

**Step 5: Commit final**

```bash
git add -A
git commit -m "feat(frontend): prototipo completo MOD01 — login, MFA y dashboard para web y portal"
```

---

## Resumen de archivos creados

### `@iwana/ui`
- `src/lib/utils.ts` — cn() helper
- `src/components/Button.tsx`
- `src/components/Input.tsx`
- `src/components/Card.tsx`
- `src/components/Badge.tsx`
- `src/components/OtpInput.tsx`

### `@iwana/shared`
- `src/schemas/auth.schema.ts` — Zod schemas

### `@iwana/web`
- `src/lib/api-client.ts`
- `src/app/page.tsx` (modificado → redirect)
- `src/app/auth/login/page.tsx`
- `src/app/auth/mfa/verify/page.tsx`
- `src/app/dashboard/layout.tsx`
- `src/app/dashboard/page.tsx`
- `src/components/auth/LoginBrandPanel.tsx`
- `src/components/auth/LoginForm.tsx`
- `src/components/auth/MfaVerifyForm.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/Header.tsx`
- `src/components/dashboard/MetricCard.tsx`
- `src/components/dashboard/TenantsTable.tsx`

### `@iwana/portal`
- `src/lib/api-client.ts`
- `src/app/page.tsx` (modificado → redirect)
- `src/app/auth/login/page.tsx`
- `src/app/auth/mfa/verify/page.tsx`
- `src/app/dashboard/layout.tsx`
- `src/app/dashboard/page.tsx`
- `src/components/auth/LoginBrandPanel.tsx`
- `src/components/auth/LoginForm.tsx`
- `src/components/auth/MfaVerifyForm.tsx`
