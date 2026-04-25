# Diseño del Prototipo Frontend — iWana neXt MOD01

**Fecha:** 2026-03-12
**Autor:** Claude Code (Modo Architect)
**Aprobado por:** Usuario (sesión de brainstorming)
**Apps en alcance:** `@iwana/web` (admin plataforma) + `@iwana/portal` (portal suscriptores)
**Enfoque elegido:** B — Light Professional + Dark Sidebar

---

## 1. Contexto y Decisiones

### Identidad de Marca
- **Primario:** Azul Noche `#17163A` — fondos sidebar, paneles de marca
- **Secundario decorativo:** Lima `#A5C330` — acentos, badges, indicadores activos
- **Secundario texto:** Lima accesible `#6A7A1C` — texto sobre fondo blanco (WCAG AA 6.2:1)
- **Tipografía:** Exo 2 (display/UI), JetBrains Mono (código)
- **Bordes:** `border-radius-2xl` = 1.5rem como radio estándar iWana
- **Efectos:** Glassmorphism en panel izquierdo del login; sombras suaves en cards

### Stack Técnico
- Next.js 16.1.6 (App Router, standalone)
- Tailwind CSS 4 (CSS-first, `@theme` en globals.css — NO tailwind.config.js)
- shadcn/ui + Radix Primitives + CVA
- react-hook-form + Zod + @hookform/resolvers
- Framer Motion (transiciones y animaciones)

### ADRs que aplican
- ADR-023: Auth híbrida (proxy cookie check + AuthProvider Client Context)
- ADR-025: react-hook-form + zod
- ADR-026: shadcn/ui + Radix Primitives + Tailwind 4 + CVA

---

## 2. Sistema Base de Layout

### Shell de Aplicación (post-login)

```
┌─────────────────────────────────────────────────────────┐
│ SIDEBAR (280px fijo)    │  CONTENIDO PRINCIPAL           │
│ bg: #17163A             │  bg: #F9FAFB (neutral-50)      │
│                         │                                │
│ [Logo iWana]            │  [Header: breadcrumb + acciones│
│                         │   notificaciones + avatar]     │
│ ● Dashboard    ◄ activo │                                │
│   Tenants               │  [Área de contenido dinámica]  │
│   Usuarios              │                                │
│   Auditoría             │                                │
│   Configuración         │                                │
│                         │                                │
│ ─────────────────        │                                │
│ [Avatar] Admin Name     │                                │
│ Logout                  │                                │
└─────────────────────────────────────────────────────────┘
```

**Sidebar — especificaciones:**
- Fondo: `#17163A`
- Logo: SVG iWana en la parte superior, padding `24px`
- Items de nav: texto `neutral-300`, hover `neutral-100`, ícono + label
- Item activo: barra vertical Lima `#A5C330` (4px) a la izquierda + fondo `rgba(165,195,48,0.1)`
- Footer: avatar circular, nombre de usuario, rol badge, botón logout
- Mobile: drawer deslizable (overlay), hamburger en header

**Header superior:**
- Fondo blanco, border-bottom `neutral-200`
- Breadcrumb dinámico según ruta
- Acciones: bell icon (notificaciones), avatar dropdown (perfil, cambiar contraseña, logout)

---

## 3. Pantalla de Login

### Layout Split-Screen

```
┌──────────────────────────────────────────────────────────┐
│ PANEL IZQUIERDO (40%)   │   PANEL DERECHO (60%)          │
│ Gradiente 135°          │   bg: #FFFFFF                  │
│ #17163A → #2D2A9E       │                                │
│                         │   ┌──────────────────────┐     │
│   [Logo SVG iWana]      │   │  Badge contexto       │     │
│                         │   │  ─────────────────    │     │
│   "Conecta tu mundo"    │   │  [Email input]        │     │
│   tagline               │   │  [Password input 👁]  │     │
│                         │   │                       │     │
│   ┌──────────────────┐  │   │  [Botón "Ingresar"]   │     │
│   │ Glassmorphism    │  │   │                       │     │
│   │ card con métrica │  │   │  ¿Olvidaste tu        │     │
│   │ o quote          │  │   │   contraseña?         │     │
│   └──────────────────┘  │   └──────────────────────┘     │
│                         │                                │
│ Solo visible en desktop │   Visible siempre              │
└──────────────────────────────────────────────────────────┘
```

### Diferenciación por App

| Elemento | `@iwana/web` (admin) | `@iwana/portal` (suscriptores) |
|---|---|---|
| Badge contexto | "Administración de Plataforma" | "Portal de Suscriptores" |
| Panel izq. glassmorphism card | Métricas de plataforma | Beneficios del plan |
| Tagline | "Control total de tu red" | "Conecta tu mundo" |
| Endpoint | `POST /api/v1/auth/platform/login` | `POST /api/v1/auth/login` + header `X-Tenant-Slug` |

### Formulario — Especificaciones

**Campos:**
- Email: tipo `email`, autocomplete `email`, placeholder "tu@empresa.com"
- Password: tipo `password` con toggle visibility (ícono ojo), autocomplete `current-password`

**Validación Zod:**
```typescript
const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
})
```

**Estados del botón:**
- Default: fondo `#17163A`, texto blanco, hover fondo `#232180`
- Loading: spinner animado + texto "Ingresando..." + disabled
- Error: no cambia el botón — el error se muestra inline

**Manejo de errores:**
- 401 credenciales inválidas: "Correo o contraseña incorrectos"
- 429 rate limit: "Demasiados intentos. Espera 1 minuto."
- 500+ server error: "Error del servidor. Intenta de nuevo."
- Error inline debajo del formulario en rojo `#EF4444` con ícono

---

## 4. Pantalla MFA Verify

### Layout
- Misma estructura split-screen del login (continuidad visual)
- Panel izquierdo idéntico al login de la app correspondiente
- URL: `/auth/mfa/verify`
- Transición: fade-in del card con Framer Motion

### Card MFA

```
┌──────────────────────────────┐
│  🔐 Verificación en dos pasos│
│                              │
│  Ingresa el código de 6      │
│  dígitos de tu app           │
│  autenticadora               │
│                              │
│  [_] [_] [_] [_] [_] [_]   │
│                              │
│  ████████████░░░░ 18s        │  ← barra progreso TOTP
│                              │
│  [    Verificar    ]         │
│                              │
│  Usar código de respaldo     │
└──────────────────────────────┘
```

**Input OTP — especificaciones:**
- 6 campos individuales `48×48px`
- Solo dígitos numéricos (keydown filter)
- Auto-focus al siguiente campo al ingresar dígito
- Backspace: borra y regresa al campo anterior
- Paste: distribuye automáticamente los 6 dígitos
- Borde default: `#D1D5DB`, foco: `#17163A` (2px), error: `#EF4444`

**Barra de progreso TOTP:**
- Duración: 30 segundos
- Color: Lima `#A5C330` → amarillo → rojo cuando queda < 5s
- Texto: contador regresivo en segundos

**Estados de error:**
- Código incorrecto: shake animation en los 6 campos + "Código incorrecto. Intenta de nuevo."
- Código expirado: "Tu código expiró. Genera uno nuevo en tu app."
- Demasiados intentos: "Cuenta temporalmente bloqueada."

---

## 5. Dashboard Inicial

### `@iwana/web` — Dashboard SYSTEM_ADMIN

**Primera fila — Cards de métricas (4 cards):**

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Tenants      │ │ Usuarios     │ │ Jobs en cola │ │ Alertas      │
│ activos      │ │ registrados  │ │ BullMQ       │ │ del sistema  │
│              │ │              │ │              │ │              │
│  12 / 15     │ │  1,247       │ │  3           │ │  1 crítica   │
│              │ │              │ │              │ │              │
│ ↑ 2 esta sem │ │ ↑ 34 hoy     │ │ ✓ saludable  │ │ ⚠ ver ahora  │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

- Cards: fondo blanco, `border-radius-xl`, sombra suave iWana
- Ícono en esquina superior derecha (color semántico)
- Número principal: `text-4xl font-bold` en `#17163A`
- Subtexto: `text-sm` en `neutral-500`

**Segunda sección — Tabla de tenants:**

Columnas: Nombre | Slug | Status | Fecha creación | Acciones

Status badges:
- `ACTIVE` → verde `#22C55E`
- `PROVISIONING` → amarillo `#F59E0B`
- `PROVISIONING_FAILED` → rojo `#EF4444` + botón "Retry"
- `SUSPENDED` → gris `#9CA3AF`
- `INACTIVE` → gris claro

Acciones por fila: Ver detalle | Suspender | (Retry si aplica)

---

### `@iwana/portal` — Dashboard Admin/Suscriptor Tenant

**Header de tenant:**
- Logo del ISP (tenant) + nombre, debajo logo iWana pequeño "Powered by iWana"

**Cards según rol:**

*ADMIN del tenant:*
- Usuarios activos en el tenant
- Servicios contratados
- Facturas pendientes
- Estado del sistema

*SUBSCRIBER:*
- Mi plan activo (nombre, velocidad, vencimiento)
- Estado de conexión (online/offline con indicador)
- Último consumo
- Próxima factura

---

## 6. Componentes Compartidos

### Button (CVA variants)
- `primary`: bg `#17163A`, texto blanco — acciones principales
- `secondary`: border `#17163A`, texto `#17163A` — acciones secundarias
- `ghost`: sin borde, texto `#374151` — acciones terciarias
- `destructive`: bg `#EF4444` — acciones destructivas
- `link`: texto `#6A7A1C`, subrayado — navegación inline
- Sizes: `sm`, `default`, `lg`
- Loading state: spinner + disabled integrado

### Input
- Border: `#D1D5DB`, foco: ring `#17163A` (2px), error: border + texto `#EF4444`
- Label siempre visible (no placeholder como único label)
- Helper text / error message debajo del campo
- Password variant: con toggle ojo

### Card
- Fondo blanco, `border-radius-xl`, sombra iWana
- Variants: `default`, `glass` (glassmorphism sobre oscuro)

### Badge
- Variants por color semántico: success, warning, error, info, neutral
- Tamaño compacto para tablas

### OTP Input
- Componente dedicado para el flujo MFA

---

## 7. Navegación y Rutas

### `@iwana/web`
```
/                       → redirect a /auth/login
/auth/login             → Login SYSTEM_ADMIN
/auth/mfa/verify        → MFA verify
/dashboard              → Dashboard principal (protegida)
/tenants                → Lista de tenants
/tenants/[id]           → Detalle de tenant
/users                  → Gestión de usuarios de plataforma
/audit                  → Log de auditoría
/settings               → Configuración de plataforma
```

### `@iwana/portal`
```
/                       → redirect a /auth/login
/auth/login             → Login tenant (necesita X-Tenant-Slug)
/auth/mfa/verify        → MFA verify
/dashboard              → Dashboard tenant (protegida)
/services               → Servicios del suscriptor
/billing                → Facturación
/support                → Soporte / PQR
/profile                → Perfil y configuración personal
```

---

## 8. AuthProvider y Protección de Rutas

Según ADR-023 (auth híbrida):

- **Proxy cookie check** en middleware Next.js: verifica cookie antes de renderizar página
- **AuthProvider** (Client Context): provee `user`, `tenant`, `role` a componentes cliente
- Redirect a `/auth/login` si no autenticado
- Redirect a `/dashboard` si ya autenticado intentando acceder a `/auth/login`
- Token refresh automático (silent refresh antes de expiración)

---

## 9. Responsive

| Breakpoint | Comportamiento |
|---|---|
| Mobile (< 768px) | Panel izquierdo oculto en login; sidebar como drawer; cards en 1 columna |
| Tablet (768-1024px) | Panel izquierdo login visible; sidebar colapsada a solo íconos |
| Desktop (> 1024px) | Layout completo según diseño |

---

## 10. Accesibilidad

- Contraste mínimo WCAG AA en todos los textos
- `#A5C330` solo para elementos decorativos (nunca para texto sobre blanco)
- `#6A7A1C` para texto Lima sobre blanco (6.2:1)
- Focus ring visible en todos los elementos interactivos
- Labels siempre visibles (no solo placeholders)
- aria-labels en iconos sin texto
- Gestión de foco en transiciones (MFA card recibe foco al montar)

---

## Archivos a Crear

### Nuevos componentes en `@iwana/ui`
- `components/Button.tsx`
- `components/Input.tsx`
- `components/Card.tsx`
- `components/Badge.tsx`
- `components/OtpInput.tsx`

### `@iwana/web`
- `src/app/auth/login/page.tsx`
- `src/app/auth/mfa/verify/page.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/layout.tsx` (sidebar + header)
- `src/components/auth/LoginForm.tsx`
- `src/components/auth/MfaVerifyForm.tsx`
- `src/components/dashboard/MetricCard.tsx`
- `src/components/dashboard/TenantsTable.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/Header.tsx`
- `src/lib/api-client.ts`
- `src/providers/AuthProvider.tsx`
- `src/middleware.ts`

### `@iwana/portal`
- Estructura espejo de `@iwana/web` con adaptaciones de rol
- `src/app/auth/login/page.tsx`
- `src/app/auth/mfa/verify/page.tsx`
- `src/app/dashboard/page.tsx`
- Componentes dashboard diferenciados por rol (ADMIN vs SUBSCRIBER)

### `@iwana/shared`
- `src/schemas/auth.schema.ts` (Zod schemas para login y MFA)
- `src/messages/es-CO.ts` (strings de UI en español colombiano)
