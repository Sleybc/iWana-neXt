# Diseño — Página de Perfil de Usuario (`/profile`)

**Fecha:** 2026-03-17
**Módulo:** MOD02 — Portal Empresarial
**Estado:** Aprobado

---

## Contexto

El portal empresarial (`apps/portal`) necesita una página donde el usuario autenticado pueda ver y editar su perfil personal y cambiar su contraseña. Accesible desde el dropdown del header.

## Decisiones de diseño

- **Ruta:** `/profile` (nueva, protegida por layout existente)
- **Avatar:** Gravatar generado en cliente con MD5 del email del JWT — sin infraestructura de upload, sin endpoints nuevos
- **Layout:** Sin tabs — dos Cards en la misma página (datos personales + cambio de contraseña), inspirado en el prototipo de referencia
- **Acceso:** Ítem "Mi perfil" en `DropdownUser.tsx` → `Link href="/profile"`
- **Sin cambios en el backend** — el backend ya tiene todo:
  - `GET /api/v1/users/:id` — precarga del formulario
  - `PATCH /api/v1/users/:id` — actualiza perfil personal
  - `POST /api/v1/auth/change-password` — cambia contraseña

---

## Arquitectura de componentes

```
apps/portal/src/app/profile/
  page.tsx                        ← RSC wrapper (sin lógica)

apps/portal/src/components/profile/
  ProfileClient.tsx               ← 'use client' orchestrador
  ProfileHeader.tsx               ← Avatar Gravatar + nombre + badges
  PersonalInfoForm.tsx            ← Formulario datos personales
  ChangePasswordForm.tsx          ← Formulario cambio de contraseña
```

---

## Sección 1 — Header de perfil (`ProfileHeader`)

- Avatar circular 96px — URL: `https://www.gravatar.com/avatar/<MD5(email.trim().toLowerCase())>?s=192&d=identicon`
- MD5 calculado inline en el cliente (función de ~10 líneas, sin dependencia externa)
- Nombre completo: `${firstName} ${lastName}` — si no tiene nombre, muestra email ofuscado (`a***@dominio.com`)
- Badge de rol: mapeo `UserRole → label` (Administrador, Operador NOC, etc.)
- Badge de estado del usuario

---

## Sección 2 — Datos personales (`PersonalInfoForm`)

**Campos:**
| Campo | Validación | Backend field |
|---|---|---|
| Nombre | opcional, max 100 | `firstName` |
| Apellido | opcional, max 100 | `lastName` |
| Teléfono | opcional, regex E.164 `+573001234567` | `phone` |
| Cargo | opcional, max 150 | `jobTitle` |

**Flujo:**
1. Al montar `ProfileClient`: `GET /api/v1/users/:sub` → precarga `react-hook-form` con `defaultValues`
2. Submit → `PATCH /api/v1/users/:sub` con solo los campos modificados
3. Éxito: toast "Perfil actualizado" + re-fetch para sincronizar header
4. Error: mensaje inline bajo el campo o banner de error

**Schema Zod:**
```ts
z.object({
  firstName: z.string().max(100).optional().or(z.literal('')),
  lastName:  z.string().max(100).optional().or(z.literal('')),
  phone:     z.string().regex(/^\+\d{7,15}$/).optional().or(z.literal('')),
  jobTitle:  z.string().max(150).optional().or(z.literal('')),
})
```

---

## Sección 3 — Cambio de contraseña (`ChangePasswordForm`)

**Campos:**
| Campo | Validación |
|---|---|
| Contraseña actual | requerida |
| Nueva contraseña | min 10, max 128 chars |
| Confirmar contraseña | debe coincidir con nueva |

**Flujo:**
1. Submit → `POST /api/v1/auth/change-password` con `{ currentPassword, newPassword }`
2. Éxito: limpiar los 3 campos + toast "Contraseña actualizada"
3. Error 401/403: "Contraseña actual incorrecta"
4. Error genérico: banner de error con descripción

**Schema Zod:**
```ts
z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(10).max(128),
  confirmPassword: z.string(),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
})
```

---

## Cambios en componentes existentes

### `DropdownUser.tsx`
Añadir ítem antes de "Cerrar sesión":
```tsx
<Link href="/profile">
  <User className="w-4 h-4" /> Mi perfil
</Link>
```

### `api-client.ts`
Añadir dos métodos:
```ts
userApi.getMe(userId: string): Promise<UserProfile>
userApi.updateMe(userId: string, dto: UpdateProfileDto): Promise<UserProfile>
```
`changePasswordApi` ya existe via `authApi.changePassword()` o se añade ahí.

---

## Seguridad

- El `userId` para `PATCH` y `GET` se obtiene de `user.sub` (JWT) — nunca de la URL ni de input del usuario
- El email para Gravatar se obtiene del JWT (`user.email`) — puede ser el hash ofuscado; en ese caso el Gravatar fallback `identicon` garantiza que siempre hay imagen
- Ningún campo PII se loguea en consola

---

## Archivos a crear/modificar

| Operación | Archivo |
|---|---|
| CREAR | `apps/portal/src/app/profile/page.tsx` |
| CREAR | `apps/portal/src/components/profile/ProfileClient.tsx` |
| CREAR | `apps/portal/src/components/profile/ProfileHeader.tsx` |
| CREAR | `apps/portal/src/components/profile/PersonalInfoForm.tsx` |
| CREAR | `apps/portal/src/components/profile/ChangePasswordForm.tsx` |
| MODIFICAR | `apps/portal/src/components/layout/DropdownUser.tsx` |
| MODIFICAR | `apps/portal/src/lib/api-client.ts` |
