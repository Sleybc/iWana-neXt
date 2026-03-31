# Spec: Sección "Seguridad de la cuenta" - ProfileForm

**Fecha:** 2026-03-30  
**Autor:** EM + Architect  
**Estado:** Aprobado

---

## 1. Contexto

El formulario de perfil (`apps/web/src/components/profile/ProfileForm.tsx`) tiene una sección "Email de acceso" que actualmente:

- Muestra el email cifrado (no visible para el usuario)
- Solo permite cambiar el email con contraseña actual
- No tiene sección para cambiar contraseña

### Problema identificado

- El email actual no se puede mostrar porque está cifrado con AES-256-GCM en la base de datos
- No existe opción de cambiar contraseña para usuarios de plataforma

### Decisiones tomadas

- **A + B:** Mantener la sección de email (mostrando el email cifrado/visible) Y agregar sección de cambiar contraseña
- Ambos flujos requieren contraseña actual para validación

---

## 2. Diseño propuesto

### Layout: Sección "Seguridad de la cuenta"

```
┌─────────────────────────────────────────────────────────┐
│ 🔐 Seguridad de la cuenta                               │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│                                                         │
│ 📧 Email de acceso                                      │
│    [email@ejemplo.com]  (texto plano, solo lectura)     │
│                                                         │
│    [Cambiar email de acceso]                            │
│                                                         │
│    ┌─────────────────────────────────────────────────┐  │
│    │ Nuevo email de acceso:                          │  │
│    │ [________________________]                      │  │
│    │                                                 │  │
│    │ Contraseña actual:                              │  │
│    │ [________________________]                      │  │
│    │                                                 │  │
│    │            [Cancelar]  [Actualizar email]      │  │
│    └─────────────────────────────────────────────────┘  │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│                                                         │
│ 🔑 Cambiar contraseña                                    │
│    (requiere contraseña actual)                          │
│                                                         │
│    Contraseña actual:                                    │
│    [________________________]                           │
│                                                         │
│    Nueva contraseña:                                     │
│    [________________________]                           │
│                                                         │
│    Confirmar nueva contraseña:                           │
│    [________________________]                           │
│                                                         │
│            [Cancelar]  [Cambiar contraseña]             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Componentes

#### Sección Email de acceso

- **Display de email:** Muestra email del perfil (viene del API como texto plano, ya descifrado por el backend)
- **Botón "Cambiar email":** Toggle que expande/colapsa el formulario de cambio de email
- **Formulario (colapsable por defecto):**
  - Campo "Nuevo email de acceso" (type=email)
  - Campo "Contraseña actual" (type=password)
  - Botones "Cancelar" y "Actualizar email"

#### Sección Cambiar contraseña

- **Botón "Cambiar contraseña":** Toggle que expande/colapsa el formulario
- **Formulario (colapsable por defecto):**
  - Campo "Contraseña actual" (type=password)
  - Campo "Nueva contraseña" (type=password, min 10 chars)
  - Campo "Confirmar nueva contraseña" (type=password, debe coincidir)
  - Botones "Cancelar" y "Cambiar contraseña"

### Estados de cada sección

| Estado    | Descripción                                               |
| --------- | --------------------------------------------------------- |
| Collapsed | Muestra solo el título + email/description + botón toggle |
| Expanded  | Muestra el formulario completo                            |
| Loading   | Botón deshabilitado con spinner                           |
| Success   | Mensaje verde, sección colapsa automáticamente            |
| Error     | Mensaje rojo inline debajo del formulario                 |

### Validaciones

#### Cambio de email

- Email: formato válido (Zod schema)
- Contraseña actual: mínimo 10 caracteres
- API: valida que no exista otro usuario con ese email

#### Cambio de contraseña

- Contraseña actual: mínimo 10 caracteres
- Nueva contraseña: mínimo 10 caracteres, máximo 128
- Confirmar contraseña: debe ser idéntica a nueva contraseña
- API: valida contraseña actual contra hash bcrypt

---

## 3. Arquitectura de componentes

### Archivos a modificar

| Archivo                                           | Cambio                                    |
| ------------------------------------------------- | ----------------------------------------- |
| `apps/web/src/components/profile/ProfileForm.tsx` | Rediseño completo de la sección seguridad |

### Nuevos esquemas Zod

```typescript
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(10, 'Debe tener al menos 10 caracteres').max(128),
    newPassword: z.string().min(10, 'Debe tener al menos 10 caracteres').max(128),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });
```

### Estados del componente

```typescript
// Email section
const [isEmailSectionExpanded, setIsEmailSectionExpanded] = useState(false);

// Password section
const [isPasswordSectionExpanded, setIsPasswordSectionExpanded] = useState(false);

// Estados de guardado (ya existen)
const [isSaving, setIsSaving] = useState(false);
const [isSavingEmail, setIsSavingEmail] = useState(false);

// Mensajes (ya existen)
const [serverError, setServerError] = useState<string | null>(null);
const [successMessage, setSuccessMessage] = useState<string | null>(null);
const [emailError, setEmailError] = useState<string | null>(null);
const [emailSuccessMessage, setEmailSuccessMessage] = useState<string | null>(null);
```

### API calls

| Operación                 | Endpoint                         | Método |
| ------------------------- | -------------------------------- | ------ |
| Obtener perfil            | `/platform-users/me`             | GET    |
| Actualizar perfil (email) | `/platform-users/me/login-email` | PATCH  |
| Actualizar perfil (datos) | `/platform-users/me`             | PATCH  |
| Cambiar contraseña        | `/auth/change-password`          | POST   |

---

## 4. Flujos de usuario

### Flujo: Cambiar email de acceso

1. Usuario hace clic en "Cambiar email de acceso"
2. Formulario se expande
3. Usuario ingresa nuevo email + contraseña actual
4. Usuario hace clic en "Actualizar email"
5. API valida y actualiza
6. Éxito: mensaje verde, formulario colapsa, se refreshProfile()
7. Error: mensaje rojo inline

### Flujo: Cambiar contraseña

1. Usuario hace clic en "Cambiar contraseña"
2. Formulario se expande
3. Usuario ingresa contraseña actual + nueva + confirmar
4. Validación client-side (confirmPassword coincide)
5. Usuario hace clic en "Cambiar contraseña"
6. API valida contraseña actual y actualiza hash bcrypt
7. Éxito: mensaje verde, formulario colapsa, logout automático (requiere re-login)
8. Error: mensaje rojo inline

---

## 5. Consideraciones de seguridad

- Contraseña actual siempre requerida para modificar credentials
- Nueva contraseña mínimo 10 caracteres (política existente)
- Logout automático tras cambio de contraseña (invalidar tokens)
- Rate limiting en backend (existente)
- Auditoría de cambios (existente via AuditService)

---

## 6. Criterios de aceptación

- [ ] Email de acceso se muestra en texto plano (descifrado del API)
- [ ] Botón toggle expande/colapsa sección de email
- [ ] Formulario de cambio de email requiere: nuevo email + contraseña actual
- [ ] Botón toggle expande/colapsa sección de contraseña
- [ ] Formulario de cambio de contraseña requiere: actual + nueva + confirmar
- [ ] Validación client-side: confirmPassword debe coincidir
- [ ] Mensajes de éxito/error se muestran inline
- [ ] Tras éxito, sección colapsa automáticamente
- [ ] Tras cambio de contraseña exitoso, usuario debe hacer logout/login
- [ ] Tests unitarios pasando
- [ ] Lint y typecheck pasando
