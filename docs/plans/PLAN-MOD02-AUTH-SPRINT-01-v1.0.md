# Plan MOD02 — Auth Empresarial de Tenant Activo

**Version:** 1.0
**Estado:** Cerrado
**Fecha:** 2026-03-16
**Convencion documental:** PLAN-MOD02-AUTH-SPRINT-01-v1.0.md

## Contexto

MOD01 cerró con toda la infraestructura de auth implementada (13 endpoints, guards, entities, middleware). MOD02 toma esa base y la convierte en un módulo operacional completo para empresas ya creadas. El análisis del código revela que **la mayoría del backend y frontend ya existe**, pero hay **6 brechas funcionales concretas** que impiden cumplir los criterios de aceptación del PRD-MOD02, más documentación y testing pendiente.

**Brechas identificadas en código:**
1. Login emite tokens a ADMIN/NOC/ACCOUNTANT sin MFA configurado (viola RF-AUTH-04, RF-MFA-04)
2. `refreshTokens()` no emite audit event (viola RF-AUD-02)
3. `resetPassword()` no emite audit event al completar (viola RF-AUD-02)
4. `registerFailedAttempt()` no emite ACCOUNT_LOCKED cuando bloquea la cuenta (viola RF-AUD-02)
5. `verifyEmail()` usa `AuditAction.UPDATE` genérico en vez de evento dedicado (viola RF-AUD-02)
6. Portal no tiene página de MFA setup — solo MFA verify (bloquea flujo de primer acceso ADMIN)

**Decisiones de diseño confirmadas:**
- MFA enforcement: emitir **token de alcance limitado** (`scope: 'mfa-setup'`) cuando ADMIN/NOC/ACCOUNTANT no tiene MFA. Este token solo permite `POST /auth/mfa/setup` y `POST /auth/mfa/verify`. Necesario porque estos endpoints son protegidos y requieren JWT.
- `passwordResetRequired`: mantener flujo actual (emite tokens con flag en JWT).
- Flujo primer acceso ADMIN: login → tokens con `passwordResetRequired` → change password → re-login → token limitado `mfa-setup` → setup MFA → re-login con TOTP → tokens completos → dashboard.

---

## Fase 1 — Documentación: PRD + HLD (pre-código)

### 1.1 Actualizar PRD-MOD02

**Archivo:** `docs/prds/PRD-MOD02-DEFINICION-v1.0.md`

Cambios:
- Agregar sección "Delta respecto a MOD01" — listar qué se hereda vs qué es nuevo
- Agregar ADR-023, ADR-025, ADR-026 a la lista de ADRs aplicables
- Detallar flujos E2E en Definition of Done
- Alinear cobertura a 85% (consistencia con MOD01)
- Cambiar estado de "En revisión" a "Aprobado para ejecución"

### 1.2 Crear HLD-MOD02

**Archivo nuevo:** `docs/hlds/HLD-MOD02-ARQUITECTURA-v1.0.md`

Contenido:
- Boundary explícito: separación documental, no de código (mismos módulos NestJS)
- Diagrama de secuencia: flujo de primer acceso ADMIN (login → change password → MFA setup → dashboard)
- Diagrama de secuencia: MFA enforcement por rol crítico con token limitado
- Mapa completo de audit events requeridos (16 + 3 nuevos)
- Contratos OpenAPI refinados (los 12 endpoints del PRD)
- Decisión: token `scope: 'mfa-setup'` para enforcement sin romper endpoints protegidos

---

## Fase 2 — Hardening Backend (brechas funcionales)

### 2.1 MFA Enforcement por Rol Crítico

**Problema:** Los endpoints `/auth/mfa/setup` y `/auth/mfa/verify` son protegidos (requieren JWT). No se puede enviar al usuario sin token a configurar MFA.

**Solución:** Emitir un **access token de alcance limitado** con `scope: 'mfa-setup'` cuando el usuario tiene rol con MFA obligatorio pero `mfaEnabled === false`. El JwtAuthGuard debe verificar que tokens con este scope solo puedan acceder a los endpoints de MFA setup/verify. No se emite refresh token.

#### 2.1a — Modificar `login()` en AuthService

**Archivo:** `apps/api/src/modules/auth/auth.service.ts` (~línea 257, después de validar MFA)

```typescript
// Después de la verificación de MFA existente (línea 273), agregar:
const MFA_REQUIRED_ROLES = [UserRole.ADMIN, UserRole.NOC, UserRole.ACCOUNTANT];

if (MFA_REQUIRED_ROLES.includes(user.role as UserRole) && !user.mfaEnabled) {
  // Emitir token limitado solo para configurar MFA
  const { accessToken } = this.signAccessToken(user, 'mfa-setup');
  return { accessToken, mfaSetupRequired: true, refreshToken: '' };
}
```

#### 2.1b — Modificar `signAccessToken()` para soportar scope

**Archivo:** `apps/api/src/modules/auth/auth.service.ts` (método privado `signAccessToken`)

Agregar parámetro opcional `scope?: string` al payload JWT.

#### 2.1c — Modificar JwtAuthGuard para verificar scope

**Archivo:** `apps/api/src/modules/auth/guards/jwt-auth.guard.ts`

Agregar lógica: si el token tiene `scope: 'mfa-setup'`, solo permitir acceso a rutas `/auth/mfa/setup` y `/auth/mfa/verify`. Rechazar con 403 cualquier otra ruta.

#### 2.1d — Agregar `mfaSetupRequired` a AuthResponse

**Archivo:** `apps/api/src/modules/auth/interfaces/auth-response.interface.ts`

Agregar campo opcional `mfaSetupRequired?: boolean`.

**Archivos impactados:**
- `apps/api/src/modules/auth/auth.service.ts` — lógica de enforcement + signAccessToken
- `apps/api/src/modules/auth/guards/jwt-auth.guard.ts` — scope check
- `apps/api/src/modules/auth/interfaces/auth-response.interface.ts` — nuevo campo
- `apps/api/src/modules/auth/interfaces/jwt-payload.interface.ts` — agregar `scope?`

### 2.2 Audit Events Faltantes

**Archivo principal:** `apps/api/src/modules/auth/auth.service.ts`

**2.2a** Agregar enum values nuevos en `packages/shared/src/enums/audit-action.enum.ts`:
- `REFRESH = 'REFRESH'`
- `EMAIL_VERIFIED = 'EMAIL_VERIFIED'`
- `PASSWORD_RESET_COMPLETED = 'PASSWORD_RESET_COMPLETED'`

**2.2b** Agregar audit calls en auth.service.ts:
1. `refreshTokens()` (~línea 375): audit `REFRESH` tras rotación exitosa
2. `resetPassword()` (~línea 626): audit `PASSWORD_RESET_COMPLETED` tras reset exitoso
3. `registerFailedAttempt()` (~línea 935): audit `ACCOUNT_LOCKED` cuando `newAttempts >= MAX_FAILED_ATTEMPTS`
4. `verifyEmail()` (~línea 715): cambiar `AuditAction.UPDATE` → `AuditAction.EMAIL_VERIFIED`

### 2.3 Cookie-parser Import (DT-BE-05, menor)

**Archivo:** `apps/api/src/main.ts`
Migrar `require('cookie-parser')` a import estático ESM.

---

## Fase 3 — Frontend: Flujo Primer Acceso ADMIN

### 3.1 Página MFA Setup en Portal

**Archivo nuevo:** `apps/portal/src/app/auth/mfa/setup/page.tsx`

Página que:
- Usa el token limitado (`scope: mfa-setup`) recibido en login para autenticar
- Llama a `POST /auth/mfa/setup` para obtener QR + secret
- Muestra QR code con instrucciones de configuración del authenticator
- Campo OTP (6 dígitos) para verificar primer código
- Llama a `POST /auth/mfa/verify` para activar MFA
- Tras éxito: limpia el token limitado y redirige a `/auth/login` para login completo con TOTP

Reutilizar: `OtpInput` de `@iwana/ui`, patrón visual de las páginas existentes en portal.

### 3.2 AuthProvider — Manejar `mfaSetupRequired`

**Archivo:** `apps/portal/src/components/auth/AuthProvider.tsx`

Cambio: en el método `login()`, detectar `mfaSetupRequired === true` en la respuesta y:
- Almacenar el token limitado en localStorage (solo para MFA setup)
- NO marcar al usuario como autenticado (el token es de alcance limitado)
- Retornar nuevo `LoginResult`: `'mfa_setup_required'`

### 3.3 LoginForm — Manejar redirect a MFA Setup

**Archivo:** `apps/portal/src/components/auth/LoginForm.tsx`

Agregar caso para `'mfa_setup_required'` → `router.push('/auth/mfa/setup')`.

### 3.4 API Client — Agregar MFA Setup Methods al Portal

**Archivo:** `apps/portal/src/lib/api-client.ts`

Agregar a `authApi`:
- `mfaSetup(tenantSlug?)` → `POST /auth/mfa/setup` con header `Authorization: Bearer <limited-token>`
- `mfaVerifySetup(totpCode, tenantSlug?)` → `POST /auth/mfa/verify`

(Estos ya existen en `apps/web/src/lib/api-client.ts` — replicar patrón)

### 3.5 Flujo Secuencial Completo del Primer Acceso ADMIN

```
1. Login con credenciales temporales
   → Backend: tokens con passwordResetRequired=true en JWT
   → Frontend: AuthProvider retorna 'password_reset_required'
   → LoginForm redirige a /auth/change-password

2. Cambia password en /auth/change-password
   → Backend: POST /auth/change-password revoca todos los refresh tokens
   → Frontend: redirige a /auth/login

3. Re-login con nueva password (ADMIN sin MFA)
   → Backend: token limitado scope='mfa-setup' + mfaSetupRequired=true, SIN refresh token
   → Frontend: AuthProvider retorna 'mfa_setup_required'
   → LoginForm redirige a /auth/mfa/setup

4. Configura MFA en /auth/mfa/setup (usa token limitado)
   → POST /auth/mfa/setup → QR + secret
   → POST /auth/mfa/verify con TOTP → MFA activado
   → Frontend: limpia token limitado, redirige a /auth/login

5. Login final con password + TOTP
   → Backend: tokens completos (access + refresh)
   → Frontend: AuthProvider retorna 'authenticated'
   → Dashboard
```

---

## Fase 4 — Testing

### 4.1 Tests Unitarios Backend (auth.service.spec.ts)

Tests nuevos para:
- `login()` con ADMIN sin MFA → retorna `mfaSetupRequired: true`
- `login()` con SUPPORT sin MFA → login normal (no es rol crítico)
- `refreshTokens()` → emite audit REFRESH
- `resetPassword()` → emite audit PASSWORD_RESET_COMPLETED
- `registerFailedAttempt()` con 5to intento → emite audit ACCOUNT_LOCKED
- `verifyEmail()` → emite audit EMAIL_VERIFIED (no UPDATE)

### 4.2 Tests de Integración HTTP

Verificar respuestas HTTP para:
- `POST /auth/login` con ADMIN sin MFA → 200 con `mfaSetupRequired`
- `POST /auth/login` con ADMIN + MFA configurado pero sin TOTP → 200 con `mfaRequired`
- Verificar que los nuevos audit events se escriben correctamente

### 4.3 Tests E2E Playwright

**Archivos nuevos:**
- `e2e/tests/portal-admin-first-access.spec.ts` — flujo completo: login temporal → change password → MFA setup → dashboard
- `e2e/tests/portal-password-recovery.spec.ts` — forgot password → reset → login

(Usando mocks de API, consistente con E2E existentes)

---

## Fase 5 — Documentación de Cierre

### 5.1 Informe de Sprint

**Archivo nuevo:** `docs/informes/INFORME-MOD02-SPRINT-01-v1.0.md`

Contenido:
- Entregables implementados vs PRD
- Verificación de los 10 criterios de aceptación (PRD §8)
- Evidencia de tests (cobertura, E2E)
- Deuda técnica residual

### 5.2 OpenAPI Verificación

Revisar decoradores Swagger en `AuthController` para completitud vs PRD.

---

## Verificación de Criterios de Aceptación (PRD §8)

| # | Criterio | Cómo se verifica | Fase |
|---|----------|-------------------|------|
| 1 | Usuario ACTIVE puede login y obtener tokens | Tests existentes + E2E | 4 |
| 2 | Roles MFA obligatorio no login sin TOTP | **Tarea 2.1** + tests | 2+4 |
| 3 | ADMIN primer acceso: cambiar password + activar MFA | **Tareas 2.1 + 3.1-3.4** + E2E | 2+3+4 |
| 4 | Refresh revocado/reutilizado → revoca familia | Tests existentes | 4 |
| 5 | Logout invalida JTI + revoca refresh | Tests existentes | 4 |
| 6 | TenantMiddleware impide tenant no resoluble | Tests existentes | 4 |
| 7 | Eventos sensibles trazados en audit_logs | **Tarea 2.2** + tests | 2+4 |
| 8 | OpenAPI cubre todos los endpoints | Revisión manual | 5 |
| 9 | No logs con credenciales/tokens/PII | Revisión + test | 4 |
| 10 | Backend, frontend, DB, docs alineados | Informe de cierre | 5 |

---

## Archivos Críticos

### Modificar
- `apps/api/src/modules/auth/auth.service.ts` — MFA enforcement + signAccessToken scope + audit events
- `apps/api/src/modules/auth/guards/jwt-auth.guard.ts` — verificar scope 'mfa-setup'
- `apps/api/src/modules/auth/interfaces/auth-response.interface.ts` — campo mfaSetupRequired
- `apps/api/src/modules/auth/interfaces/jwt-payload.interface.ts` — campo scope opcional
- `apps/api/src/modules/auth/auth.service.spec.ts` — tests nuevos
- `packages/shared/src/enums/audit-action.enum.ts` — 3 enum values nuevos
- `apps/portal/src/components/auth/AuthProvider.tsx` — manejar mfaSetupRequired
- `apps/portal/src/components/auth/LoginForm.tsx` — redirect a /auth/mfa/setup
- `apps/portal/src/lib/api-client.ts` — agregar mfaSetup/mfaVerifySetup
- `docs/prds/PRD-MOD02-DEFINICION-v1.0.md` — actualizar estado + delta

### Crear
- `docs/hlds/HLD-MOD02-ARQUITECTURA-v1.0.md`
- `apps/portal/src/app/auth/mfa/setup/page.tsx`
- `e2e/tests/portal-admin-first-access.spec.ts`
- `e2e/tests/portal-password-recovery.spec.ts`
- `docs/informes/INFORME-MOD02-SPRINT-01-v1.0.md`

### Verificar (sin cambios esperados)
- `apps/api/src/modules/auth/auth.controller.ts` — OpenAPI decorators completitud
- `apps/api/src/modules/tenant/tenant.middleware.ts` — ya funcional

---

## Verificación End-to-End

### Backend
```bash
# Tests unitarios + integración
pnpm --filter @iwana/api test

# Verificar cobertura >= 85%
pnpm --filter @iwana/api test -- --coverage

# TypeScript strict
pnpm typecheck

# Lint
pnpm lint
```

### Frontend
```bash
# Build portal (verifica compilación)
pnpm --filter @iwana/portal build

# Build web
pnpm --filter @iwana/web build
```

### E2E
```bash
# E2E portal
pnpm test:e2e:portal

# E2E web
pnpm test:e2e
```

### Manual (con infraestructura levantada)
1. `pnpm dev` — levantar todo el stack
2. Crear tenant via API → ADMIN con password temporal
3. Login en portal con credenciales temporales → verificar redirect a change-password
4. Cambiar password → verificar redirect a login
5. Re-login → verificar que retorna mfaSetupRequired y redirige a MFA setup
6. Configurar MFA → verificar QR + código TOTP
7. Login final con TOTP → verificar acceso a dashboard
8. Verificar audit_logs del tenant: LOGIN, PASSWORD_CHANGED, MFA_ENABLED, LOGIN registrados
