---
name: frontend-dev-guidelines
description: Frontend standards for iWana neXt with Next.js App Router, React Server Components, TypeScript estricto, accesibilidad, i18n y diseno orientado al sistema de componentes del proyecto. Use cuando se implementen pantallas, componentes, formularios o flujos frontend dentro del stack real del repo.
---

# Frontend Development Guidelines

## Proposito

Este skill define como debe implementarse el frontend de iWana neXt dentro de un stack basado en Next.js App Router, React Server Components, TypeScript estricto, accesibilidad y modularidad consistente con el repo.

## Usar este skill cuando

- se creen paginas, layouts o componentes en apps web del repo
- se implemente una feature de frontend en Next.js App Router
- se revisen patrones de datos, estados de UI o arquitectura de componentes
- se quiera validar alineacion con accesibilidad, i18n y sistema visual

## No usar este skill cuando

- la tarea sea exclusivamente backend
- la solucion pertenezca a React Native o a otra plataforma no web
- la decision principal sea de infraestructura, monorepo o seguridad backend

## Principios no negociables

1. Server Components por defecto.
2. Client Components solo cuando haya interaccion, estado local del navegador o APIs del cliente.
3. Next.js App Router es la referencia de routing y composicion.
4. TypeScript estricto, sin any salvo excepcion justificada.
5. Accesibilidad e i18n se consideran requisitos base, no extras.
6. Reutilizar componentes y tokens del sistema antes de introducir UI ad hoc.

## Doctrina de arquitectura

### 1. App Router primero

- las rutas viven bajo `app/`
- `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` y `not-found.tsx` son primitives del framework
- no introducir routers alternos si el problema ya lo resuelve App Router

### 2. Datos cerca del servidor

- si los datos se pueden resolver en servidor, hacerlo en el arbol server-first
- usar Client Components para interacciones enriquecidas o estados efimeros, no por costumbre
- evitar trasladar fetches al cliente sin una razon clara de UX o reactividad

### 3. Boundaries explicitos

- `features/` para logica de dominio de frontend
- `components/` para primitivas compartidas y composicion reutilizable
- `lib/` o `shared/` para utilidades transversales
- evitar imports cruzados arbitrarios entre features

### 4. Sistema visual consistente

- priorizar `core-components` y `tailwind-patterns` o el sistema visual vigente del repo
- usar tokens semanticos y variables del sistema
- evitar hardcodes de color, spacing y typography

## Checklist de implementacion

### Nueva pagina

- [ ] ubicada en `app/`
- [ ] decide correctamente si es Server o Client Component
- [ ] maneja `loading.tsx` o skeletons cuando aplique
- [ ] maneja `error.tsx` o errores de forma consistente
- [ ] considera SEO, metadata y accesibilidad
- [ ] evita fetches duplicados en cliente y servidor

### Nuevo componente

- [ ] props tipadas y minimas
- [ ] sin estado local innecesario
- [ ] sin strings hardcodeados si son visibles al usuario
- [ ] usa roles, labels y semantica HTML correctos
- [ ] usa componentes compartidos antes de crear variantes duplicadas

### Nueva feature

- [ ] estructura por feature coherente
- [ ] contratos de datos tipados
- [ ] formularios con validacion consistente
- [ ] feedback de error y exito claro
- [ ] lista para pruebas unitarias y E2E

## Patrones recomendados

### Server Component por defecto

```tsx
import { getCustomers } from "@/features/customers/server/get-customers";
import { CustomerTable } from "@/features/customers/components/customer-table";

export default async function CustomersPage() {
  const customers = await getCustomers();

  return <CustomerTable customers={customers} />;
}
```

### Client Component solo cuando se justifica

```tsx
"use client";

import { useState } from "react";

interface SearchBoxProps {
  initialValue?: string;
}

export function SearchBox({ initialValue = "" }: SearchBoxProps) {
  const [value, setValue] = useState(initialValue);

  return (
    <input
      aria-label="Buscar clientes"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}
```

### Estructura sugerida

```text
app/
  clientes/
    page.tsx
    loading.tsx
    error.tsx

features/
  clientes/
    components/
    server/
    hooks/
    schemas/
    types/
    index.ts

components/
  ui/
  feedback/
  layout/
```

## Accesibilidad e i18n

- usar HTML semantico antes que divs sin rol
- preferir `button`, `nav`, `main`, `section`, `label`, `table` cuando corresponda
- todo control interactivo debe tener nombre accesible
- no introducir texto visible hardcodeado si la feature debe ser traducible
- validar contraste, foco visible y navegacion por teclado
- coordinar con `wcag-audit-patterns` e `i18n-localization`

## Rendimiento

- lazy load solo para bloques pesados o realmente diferibles
- no usar `useMemo` o `useCallback` por reflejo; solo si hay evidencia o costo real
- evitar componentes client innecesarios que rompan el server-first
- minimizar hydration cost y JS entregado al navegador
- tratar CLS, LCP y errores de streaming como bugs de producto

## Anti-patrones

- usar TanStack Router u otro router paralelo a App Router
- introducir MUI como supuesto por defecto del skill
- trasladar toda la data al cliente por comodidad
- duplicar componentes compartidos dentro de features
- usar cualquier estilo hardcodeado si ya existe token equivalente
- mezclar logica de datos, presentacion y side effects sin boundaries claros
- depender de patrones mobile o React Native en el frontend web del repo

## Integracion con otras skills

- `core-components` para el sistema visual y primitives
- `tailwind-patterns` para tokens y estrategia de estilos cuando aplique
- `testing-patterns` para pruebas unitarias, integracion y E2E
- `wcag-audit-patterns` para validacion de accesibilidad
- `i18n-localization` para internacionalizacion y localizacion

## Formularios — Estándar del repo

El stack canónico de formularios es `react-hook-form` + `zod` + `@hookform/resolvers`. No usar alternativas ad hoc.

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginForm) => { /* llamar api-client */ };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}
    </form>
  );
}
```

## Autenticación frontend — Patrón híbrido (ADR-023)

El modelo de auth es híbrido:

1. **Proxy cookie check (servidor)** — Next.js middleware o layout verifica la cookie httpOnly antes de renderizar.
2. **AuthProvider (cliente)** — Contexto React que expone `{ user, isLoading, logout }` via `useAuth()`.

```typescript
// Usar useAuth() en Client Components para acceder al usuario actual
'use client';
import { useAuth } from '@/components/auth/AuthProvider';

export function UserMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return <button onClick={logout}>{user.email}</button>;
}
```

No reimplementar lógica de sesión fuera del `AuthProvider` — toda la gestión de tokens y refresh está encapsulada en `src/lib/api-client.ts`.
