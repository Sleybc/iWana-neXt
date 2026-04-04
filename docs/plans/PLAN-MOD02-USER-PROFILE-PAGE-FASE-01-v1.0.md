# User Profile Page Implementation Plan

**Version:** 1.0
**Estado:** Cerrado
**Fecha:** 2026-03-17
**Convencion documental:** PLAN-MOD02-USER-PROFILE-PAGE-FASE-01-v1.0.md

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Crear la página `/profile` en `apps/portal` donde el usuario autenticado puede ver y editar sus datos personales, y cambiar su contraseña — accesible desde el dropdown del header.

**Architecture:** Ruta nueva `/profile` con un componente cliente (`ProfileClient`) que orquesta tres secciones: header con Gravatar, formulario de datos personales (`PATCH /api/v1/users/:id`) y formulario de cambio de contraseña (`POST /api/v1/auth/change-password`). El MD5 para Gravatar se calcula inline en el cliente sin dependencias externas. El backend no requiere ningún cambio.

**Tech Stack:** Next.js App Router, React Hook Form, Zod, `@iwana/ui` (Card, Badge, Button, Input), Tailwind 4, `authApi.changePassword()` ya existe en `api-client.ts`.

---

## Task 1: Agregar `userApi` en `api-client.ts`

**Files:**
- Modify: `apps/portal/src/lib/api-client.ts`

El portal no tiene aún métodos para `GET /users/:id` ni `PATCH /users/:id`. Los añadimos.

**Step 1: Leer el archivo para ubicar el punto de inserción**

Abre `apps/portal/src/lib/api-client.ts`. Al final del archivo encontrarás los objetos `authApi`, `tenantSelfApi`, `dashboardApi`, `auditApi`. Añade `userApi` justo antes del último export o al final del archivo.

**Step 2: Añadir interfaces y el objeto `userApi`**

Agrega al final de `apps/portal/src/lib/api-client.ts`:

```ts
// ── Perfil del usuario autenticado ────────────────────────────────────────────

/** Campos de perfil retornados por GET /users/:id */
export interface UserProfile {
  id: string;
  role: string;
  status: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  jobTitle: string | null;
  avatarUrl: string | null;
  mfaEnabled: boolean;
  emailVerified: boolean;
  createdAt: string;
}

/** Campos actualizables por el propio usuario */
export interface UpdateProfileDto {
  firstName?: string;
  lastName?: string;
  phone?: string;
  jobTitle?: string;
}

/**
 * API de perfil del usuario autenticado.
 * Usa el sub del JWT como userId — nunca un id externo.
 * NUNCA llamar a /tenants/:id desde el portal.
 */
export const userApi = {
  /** Obtiene el perfil del usuario autenticado */
  getMe: (userId: string) =>
    request<ApiEnvelope<UserProfile>>(`/users/${userId}`).then((r) => r.data),

  /** Actualiza datos personales del usuario autenticado */
  updateMe: (userId: string, dto: UpdateProfileDto) =>
    request<ApiEnvelope<UserProfile>>(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }).then((r) => r.data),
};
```

**Step 3: Verificar typecheck**

```bash
pnpm --filter @iwana/portal typecheck
```

Expected: sin errores.

**Step 4: Commit**

```bash
git add apps/portal/src/lib/api-client.ts
git commit -m "feat(portal): agregar userApi en api-client para perfil de usuario"
```

---

## Task 2: Utilidad MD5 para Gravatar

**Files:**
- Create: `apps/portal/src/lib/gravatar.ts`

Gravatar requiere el MD5 del email en minúsculas. Implementamos la función inline (sin dependencias) siguiendo el algoritmo RFC 1321.

**Step 1: Crear el archivo**

```ts
// apps/portal/src/lib/gravatar.ts

/**
 * Calcula el hash MD5 de un string (algoritmo RFC 1321).
 * Usado exclusivamente para generar URLs de Gravatar.
 * No usar para criptografía — solo para identificación de avatar.
 */
function md5(input: string): string {
  function safeAdd(x: number, y: number): number {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }
  function bitRotateLeft(num: number, cnt: number): number {
    return (num << cnt) | (num >>> (32 - cnt));
  }
  function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  const str = unescape(encodeURIComponent(input));
  const x: number[] = [];
  for (let i = 0; i < str.length * 8; i += 8) {
    x[i >> 5] = (x[i >> 5] ?? 0) | ((str.charCodeAt(i / 8) & 0xff) << i % 32);
  }
  x[str.length * 8 >> 5] = (x[str.length * 8 >> 5] ?? 0) | (0x80 << (str.length * 8) % 32);
  x[(((str.length * 8 + 64) >>> 9) << 4) + 14] = str.length * 8;

  let [a, b, c, d] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];

  for (let i = 0; i < x.length; i += 16) {
    const [oa, ob, oc, od] = [a, b, c, d];
    a = md5ff(a,b,c,d,x[i+0]??0,7,-680876936); d=md5ff(d,a,b,c,x[i+1]??0,12,-389564586); c=md5ff(c,d,a,b,x[i+2]??0,17,606105819); b=md5ff(b,c,d,a,x[i+3]??0,22,-1044525330);
    a = md5ff(a,b,c,d,x[i+4]??0,7,-176418897); d=md5ff(d,a,b,c,x[i+5]??0,12,1200080426); c=md5ff(c,d,a,b,x[i+6]??0,17,-1473231341); b=md5ff(b,c,d,a,x[i+7]??0,22,-45705983);
    a = md5ff(a,b,c,d,x[i+8]??0,7,1770035416); d=md5ff(d,a,b,c,x[i+9]??0,12,-1958414417); c=md5ff(c,d,a,b,x[i+10]??0,17,-42063); b=md5ff(b,c,d,a,x[i+11]??0,22,-1990404162);
    a = md5ff(a,b,c,d,x[i+12]??0,7,1804603682); d=md5ff(d,a,b,c,x[i+13]??0,12,-40341101); c=md5ff(c,d,a,b,x[i+14]??0,17,-1502002290); b=md5ff(b,c,d,a,x[i+15]??0,22,1236535329);
    a = md5gg(a,b,c,d,x[i+1]??0,5,-165796510); d=md5gg(d,a,b,c,x[i+6]??0,9,-1069501632); c=md5gg(c,d,a,b,x[i+11]??0,14,643717713); b=md5gg(b,c,d,a,x[i+0]??0,20,-373897302);
    a = md5gg(a,b,c,d,x[i+5]??0,5,-701558691); d=md5gg(d,a,b,c,x[i+10]??0,9,38016083); c=md5gg(c,d,a,b,x[i+15]??0,14,-660478335); b=md5gg(b,c,d,a,x[i+4]??0,20,-405537848);
    a = md5gg(a,b,c,d,x[i+9]??0,5,568446438); d=md5gg(d,a,b,c,x[i+14]??0,9,-1019803690); c=md5gg(c,d,a,b,x[i+3]??0,14,-187363961); b=md5gg(b,c,d,a,x[i+8]??0,20,1163531501);
    a = md5gg(a,b,c,d,x[i+13]??0,5,-1444681467); d=md5gg(d,a,b,c,x[i+2]??0,9,-51403784); c=md5gg(c,d,a,b,x[i+7]??0,14,1735328473); b=md5gg(b,c,d,a,x[i+12]??0,20,-1926607734);
    a = md5hh(a,b,c,d,x[i+5]??0,4,-378558); d=md5hh(d,a,b,c,x[i+8]??0,11,-2022574463); c=md5hh(c,d,a,b,x[i+11]??0,16,1839030562); b=md5hh(b,c,d,a,x[i+14]??0,23,-35309556);
    a = md5hh(a,b,c,d,x[i+1]??0,4,-1530992060); d=md5hh(d,a,b,c,x[i+4]??0,11,1272893353); c=md5hh(c,d,a,b,x[i+7]??0,16,-155497632); b=md5hh(b,c,d,a,x[i+10]??0,23,-1094730640);
    a = md5hh(a,b,c,d,x[i+13]??0,4,681279174); d=md5hh(d,a,b,c,x[i+0]??0,11,-358537222); c=md5hh(c,d,a,b,x[i+3]??0,16,-722521979); b=md5hh(b,c,d,a,x[i+6]??0,23,76029189);
    a = md5hh(a,b,c,d,x[i+9]??0,4,-640364487); d=md5hh(d,a,b,c,x[i+12]??0,11,-421815835); c=md5hh(c,d,a,b,x[i+15]??0,16,530742520); b=md5hh(b,c,d,a,x[i+2]??0,23,-995338651);
    a = md5ii(a,b,c,d,x[i+0]??0,6,-198630844); d=md5ii(d,a,b,c,x[i+7]??0,10,1126891415); c=md5ii(c,d,a,b,x[i+14]??0,15,-1416354905); b=md5ii(b,c,d,a,x[i+5]??0,21,-57434055);
    a = md5ii(a,b,c,d,x[i+12]??0,6,1700485571); d=md5ii(d,a,b,c,x[i+3]??0,10,-1894986606); c=md5ii(c,d,a,b,x[i+10]??0,15,-1051523); b=md5ii(b,c,d,a,x[i+1]??0,21,-2054922799);
    a = md5ii(a,b,c,d,x[i+8]??0,6,1873313359); d=md5ii(d,a,b,c,x[i+15]??0,10,-30611744); c=md5ii(c,d,a,b,x[i+6]??0,15,-1560198380); b=md5ii(b,c,d,a,x[i+13]??0,21,1309151649);
    a = md5ii(a,b,c,d,x[i+4]??0,6,-145523070); d=md5ii(d,a,b,c,x[i+11]??0,10,-1120210379); c=md5ii(c,d,a,b,x[i+2]??0,15,718787259); b=md5ii(b,c,d,a,x[i+9]??0,21,-343485551);
    a = safeAdd(a, oa); b = safeAdd(b, ob); c = safeAdd(c, oc); d = safeAdd(d, od);
  }

  return [a, b, c, d]
    .flatMap((n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff])
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Genera la URL de Gravatar para un email.
 * Usa identicon como fallback — nunca imagen rota.
 *
 * @param email - Email del usuario (puede ser hash ofuscado del JWT)
 * @param size - Tamaño en px (default: 192)
 */
export function gravatarUrl(email: string, size = 192): string {
  const hash = md5(email.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
}
```

**Step 2: Verificar typecheck**

```bash
pnpm --filter @iwana/portal typecheck
```

Expected: sin errores.

**Step 3: Commit**

```bash
git add apps/portal/src/lib/gravatar.ts
git commit -m "feat(portal): agregar utilidad gravatar para avatar de usuario"
```

---

## Task 3: Componente `ProfileHeader`

**Files:**
- Create: `apps/portal/src/components/profile/ProfileHeader.tsx`

Header visual con avatar Gravatar, nombre completo, rol y estado.

**Step 1: Crear el componente**

```tsx
// apps/portal/src/components/profile/ProfileHeader.tsx
import Image from 'next/image';
import { Badge } from '@iwana/ui';
import { gravatarUrl } from '@/lib/gravatar';
import type { UserProfile } from '@/lib/api-client';

interface ProfileHeaderProps {
  profile: UserProfile;
  /** Email del JWT para generar el avatar Gravatar */
  email: string;
  /** Etiqueta legible del rol */
  roleLabel: string;
}

function statusVariant(status: string): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'SUSPENDED') return 'error';
  return 'neutral';
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    ACTIVE: 'Activo',
    SUSPENDED: 'Suspendido',
    INACTIVE: 'Inactivo',
  };
  return labels[status] ?? status;
}

/**
 * Encabezado del perfil: avatar Gravatar, nombre, rol y estado.
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0
 */
export function ProfileHeader({ profile, email, roleLabel }: ProfileHeaderProps) {
  const fullName =
    [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Sin nombre configurado';
  const avatarSrc = gravatarUrl(email, 192);

  return (
    <div className="flex items-center gap-6 p-6 rounded-xl border border-gray-200 bg-white dark:border-dark-border-2 dark:bg-dark-surface-2">
      {/* Avatar */}
      <div className="relative shrink-0">
        <Image
          src={avatarSrc}
          alt={`Avatar de ${fullName}`}
          width={96}
          height={96}
          className="rounded-full ring-4 ring-iwana-primary/20"
          unoptimized
        />
        <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-green-400 border-2 border-white dark:border-dark-surface-2" />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">{fullName}</h1>
        {profile.jobTitle && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{profile.jobTitle}</p>
        )}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Badge variant="primary">{roleLabel}</Badge>
          <Badge variant={statusVariant(profile.status)}>{statusLabel(profile.status)}</Badge>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verificar typecheck**

```bash
pnpm --filter @iwana/portal typecheck
```

**Step 3: Commit**

```bash
git add apps/portal/src/components/profile/ProfileHeader.tsx
git commit -m "feat(portal): agregar componente ProfileHeader con Gravatar"
```

---

## Task 4: Formulario de datos personales `PersonalInfoForm`

**Files:**
- Create: `apps/portal/src/components/profile/PersonalInfoForm.tsx`

**Step 1: Crear el componente**

```tsx
// apps/portal/src/components/profile/PersonalInfoForm.tsx
'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent } from '@iwana/ui';
import { userApi, type UserProfile, type UpdateProfileDto } from '@/lib/api-client';

const schema = z.object({
  firstName: z.string().max(100).optional().or(z.literal('')),
  lastName: z.string().max(100).optional().or(z.literal('')),
  phone: z
    .string()
    .regex(/^\+\d{7,15}$/, 'Formato E.164 requerido (ej: +573001234567)')
    .optional()
    .or(z.literal('')),
  jobTitle: z.string().max(150).optional().or(z.literal('')),
});

type FormValues = z.infer<typeof schema>;

interface PersonalInfoFormProps {
  profile: UserProfile;
  userId: string;
  onUpdated: (updated: UserProfile) => void;
}

/**
 * Formulario de edición de datos personales del usuario autenticado.
 * Llama a PATCH /api/v1/users/:id con los campos del perfil.
 */
export function PersonalInfoForm({ profile, userId, onUpdated }: PersonalInfoFormProps) {
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      phone: profile.phone ?? '',
      jobTitle: profile.jobTitle ?? '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    setSuccess(false);
    try {
      // Convertir strings vacíos a undefined para no enviar campos vacíos
      const dto: UpdateProfileDto = {
        firstName: values.firstName || undefined,
        lastName: values.lastName || undefined,
        phone: values.phone || undefined,
        jobTitle: values.jobTitle || undefined,
      };
      const updated = await userApi.updateMe(userId, dto);
      onUpdated(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setServerError('No fue posible guardar los cambios. Intenta de nuevo.');
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-5">
          Datos personales
        </h2>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Nombre */}
            <div>
              <label
                htmlFor="firstName"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Nombre
              </label>
              <input
                id="firstName"
                type="text"
                autoComplete="given-name"
                {...register('firstName')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-white focus:outline-none focus:ring-2 focus:ring-iwana-primary"
              />
              {errors.firstName && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {errors.firstName.message}
                </p>
              )}
            </div>

            {/* Apellido */}
            <div>
              <label
                htmlFor="lastName"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Apellido
              </label>
              <input
                id="lastName"
                type="text"
                autoComplete="family-name"
                {...register('lastName')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-white focus:outline-none focus:ring-2 focus:ring-iwana-primary"
              />
              {errors.lastName && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {errors.lastName.message}
                </p>
              )}
            </div>

            {/* Teléfono */}
            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Teléfono <span className="text-gray-400 font-normal">(E.164)</span>
              </label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+573001234567"
                {...register('phone')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-white focus:outline-none focus:ring-2 focus:ring-iwana-primary"
              />
              {errors.phone && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {errors.phone.message}
                </p>
              )}
            </div>

            {/* Cargo */}
            <div>
              <label
                htmlFor="jobTitle"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Cargo
              </label>
              <input
                id="jobTitle"
                type="text"
                autoComplete="organization-title"
                {...register('jobTitle')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-white focus:outline-none focus:ring-2 focus:ring-iwana-primary"
              />
              {errors.jobTitle && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {errors.jobTitle.message}
                </p>
              )}
            </div>
          </div>

          {serverError && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-3">
              {serverError}
            </p>
          )}

          {success && (
            <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-4 py-3">
              ✓ Perfil actualizado correctamente.
            </p>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !isDirty}
              className="rounded-lg bg-iwana-primary px-5 py-2 text-sm font-medium text-white hover:bg-iwana-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Verificar typecheck**

```bash
pnpm --filter @iwana/portal typecheck
```

**Step 3: Commit**

```bash
git add apps/portal/src/components/profile/PersonalInfoForm.tsx
git commit -m "feat(portal): agregar formulario PersonalInfoForm para datos personales"
```

---

## Task 5: Formulario de cambio de contraseña `ChangePasswordForm`

**Files:**
- Create: `apps/portal/src/components/profile/ChangePasswordForm.tsx`

**Step 1: Crear el componente**

```tsx
// apps/portal/src/components/profile/ChangePasswordForm.tsx
'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent } from '@iwana/ui';
import { authApi, ApiError } from '@/lib/api-client';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'La contraseña actual es requerida'),
    newPassword: z
      .string()
      .min(10, 'La nueva contraseña debe tener al menos 10 caracteres')
      .max(128, 'Máximo 128 caracteres'),
    confirmPassword: z.string().min(1, 'Confirma la nueva contraseña'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

/**
 * Formulario de cambio de contraseña del usuario autenticado.
 * Llama a POST /api/v1/auth/change-password.
 */
export function ChangePasswordForm() {
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    setSuccess(false);
    try {
      await authApi.changePassword(values.currentPassword, values.newPassword);
      setSuccess(true);
      reset();
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setServerError('La contraseña actual es incorrecta.');
      } else {
        setServerError('No fue posible cambiar la contraseña. Intenta de nuevo.');
      }
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-5">
          Cambiar contraseña
        </h2>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 max-w-md">
          {/* Contraseña actual */}
          <div>
            <label
              htmlFor="currentPassword"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Contraseña actual
            </label>
            <input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              {...register('currentPassword')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-white focus:outline-none focus:ring-2 focus:ring-iwana-primary"
            />
            {errors.currentPassword && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {errors.currentPassword.message}
              </p>
            )}
          </div>

          {/* Nueva contraseña */}
          <div>
            <label
              htmlFor="newPassword"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Nueva contraseña
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              {...register('newPassword')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-white focus:outline-none focus:ring-2 focus:ring-iwana-primary"
            />
            {errors.newPassword && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {errors.newPassword.message}
              </p>
            )}
          </div>

          {/* Confirmar contraseña */}
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Confirmar nueva contraseña
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-white focus:outline-none focus:ring-2 focus:ring-iwana-primary"
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          {serverError && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-3">
              {serverError}
            </p>
          )}

          {success && (
            <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-4 py-3">
              ✓ Contraseña actualizada correctamente.
            </p>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-iwana-primary px-5 py-2 text-sm font-medium text-white hover:bg-iwana-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Actualizando...' : 'Actualizar contraseña'}
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Verificar typecheck**

```bash
pnpm --filter @iwana/portal typecheck
```

**Step 3: Commit**

```bash
git add apps/portal/src/components/profile/ChangePasswordForm.tsx
git commit -m "feat(portal): agregar formulario ChangePasswordForm"
```

---

## Task 6: Orchestrador `ProfileClient` y página `/profile`

**Files:**
- Create: `apps/portal/src/components/profile/ProfileClient.tsx`
- Create: `apps/portal/src/app/profile/page.tsx`

**Step 1: Crear `ProfileClient`**

```tsx
// apps/portal/src/components/profile/ProfileClient.tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProfileHeader } from './ProfileHeader';
import { PersonalInfoForm } from './PersonalInfoForm';
import { ChangePasswordForm } from './ChangePasswordForm';
import { userApi, type UserProfile } from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';

/** Mapea UserRole a etiqueta legible — igual que DropdownUser */
function roleToLabel(role: string): string {
  const labels: Record<string, string> = {
    ADMIN: 'Administrador',
    NOC: 'Operador NOC',
    ACCOUNTANT: 'Contabilidad',
    SUPPORT: 'Soporte',
    SALES: 'Ventas',
    TECHNICIAN: 'Técnico',
    HR: 'Recursos Humanos',
    AUDITOR: 'Auditor',
    SUBSCRIBER: 'Suscriptor',
  };
  return labels[role] ?? role;
}

/**
 * Componente cliente del perfil del usuario autenticado.
 * Carga el perfil desde GET /users/:sub y compone los formularios.
 */
export function ProfileClient() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user?.sub) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await userApi.getMe(user.sub);
      setProfile(data);
    } catch {
      setError('No fue posible cargar tu perfil. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.sub]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1">
        <PageHeader title="Mi perfil" subtitle="Cargando tu información..." />
        <main className="flex-1 p-6 space-y-6">
          <div className="h-36 rounded-xl bg-gray-100 dark:bg-dark-surface-3 animate-pulse" />
          <div className="h-64 rounded-xl bg-gray-100 dark:bg-dark-surface-3 animate-pulse" />
          <div className="h-56 rounded-xl bg-gray-100 dark:bg-dark-surface-3 animate-pulse" />
        </main>
      </div>
    );
  }

  if (error || !profile || !user) {
    return (
      <div className="flex flex-col flex-1">
        <PageHeader title="Mi perfil" subtitle="Error al cargar" />
        <main className="flex-1 p-6">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  {error ?? 'No se pudo cargar el perfil.'}
                </p>
                <button
                  type="button"
                  onClick={() => void loadProfile()}
                  className="text-sm text-red-700 dark:text-red-400 underline mt-2 hover:no-underline"
                >
                  Reintentar
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <PageHeader title="Mi perfil" subtitle="Gestiona tu información personal y seguridad" />

      <main className="flex-1 p-6 space-y-6 max-w-3xl">
        {/* Header con avatar Gravatar */}
        <ProfileHeader
          profile={profile}
          email={user.emailHash}
          roleLabel={roleToLabel(user.role)}
        />

        {/* Datos personales */}
        <PersonalInfoForm
          profile={profile}
          userId={user.sub}
          onUpdated={(updated) => setProfile(updated)}
        />

        {/* Cambio de contraseña */}
        <ChangePasswordForm />
      </main>
    </div>
  );
}
```

**Step 2: Crear `page.tsx`**

```tsx
// apps/portal/src/app/profile/page.tsx
import { ProfileClient } from '@/components/profile/ProfileClient';

/**
 * Página de perfil del usuario autenticado.
 * Datos personales + cambio de contraseña.
 * Avatar generado via Gravatar (sin upload de archivos).
 */
export default function ProfilePage() {
  return <ProfileClient />;
}
```

**Step 3: Verificar typecheck**

```bash
pnpm --filter @iwana/portal typecheck
```

**Step 4: Commit**

```bash
git add apps/portal/src/components/profile/ProfileClient.tsx apps/portal/src/app/profile/page.tsx
git commit -m "feat(portal): agregar ProfileClient y ruta /profile"
```

---

## Task 7: Añadir "Mi perfil" en `DropdownUser`

**Files:**
- Modify: `apps/portal/src/components/layout/DropdownUser.tsx`

**Step 1: Añadir el ítem de navegación**

En `DropdownUser.tsx`, dentro del `<ul>` con las opciones de navegación, añadir antes de "Configuración de empresa":

```tsx
<li role="none">
  <Link
    href="/profile"
    role="menuitem"
    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-surface-4 dark:hover:text-white"
  >
    <UserIcon className="w-4 h-4" aria-hidden="true" />
    Mi perfil
  </Link>
</li>
```

El icono `UserIcon` ya está importado en el archivo como `User as UserIcon`.

**Step 2: Verificar typecheck**

```bash
pnpm --filter @iwana/portal typecheck
```

**Step 3: Commit**

```bash
git add apps/portal/src/components/layout/DropdownUser.tsx
git commit -m "feat(portal): agregar ítem Mi perfil en DropdownUser"
```

---

## Task 8: Configurar dominio Gravatar en `next.config`

**Files:**
- Modify: `apps/portal/next.config.ts` (o `next.config.js` — verificar cuál existe)

Next.js con el componente `<Image>` requiere que los dominios externos estén autorizados.

**Step 1: Verificar el archivo de configuración**

```bash
ls apps/portal/next.config.*
```

**Step 2: Agregar dominio de Gravatar**

En la sección `images.remotePatterns` (o `images.domains`), añadir:

```ts
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: 'www.gravatar.com',
      pathname: '/avatar/**',
    },
  ],
},
```

Si el archivo ya tiene `remotePatterns`, añadir la entrada al array existente.

**Step 3: Verificar typecheck**

```bash
pnpm --filter @iwana/portal typecheck
```

**Step 4: Commit**

```bash
git add apps/portal/next.config.*
git commit -m "feat(portal): autorizar dominio gravatar.com en next.config"
```

---

## Task 9: Verificación final

**Step 1: Correr typecheck completo del portal**

```bash
pnpm --filter @iwana/portal typecheck
```

Expected: 0 errores.

**Step 2: Correr lint**

```bash
pnpm --filter @iwana/portal lint
```

Expected: 0 errores.

**Step 3: Verificar que los tests del API siguen pasando**

```bash
pnpm --filter @iwana/api test --passWithNoTests
```

Expected: todos los tests pasando (sin regresiones — no tocamos el backend).

**Step 4: Verificar rutas en el navegador**

Con el servidor corriendo (`pnpm --filter @iwana/portal dev`):
- `localhost:3002/profile` debe cargar la página
- El dropdown del header debe mostrar "Mi perfil"
- El formulario de datos personales debe precargarse con los datos del usuario
- El formulario de cambio de contraseña debe funcionar de forma independiente
