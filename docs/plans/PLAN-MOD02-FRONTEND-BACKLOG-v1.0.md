# Plan Técnico — MOD02 Frontend Backlog Ejecutable

**Versión:** 1.0
**Estado:** En revisión
**Fecha:** 2026-03-16
**Modo activo:** Mixto

## Trazabilidad

- PRD funcional: docs/prds/PRD-MOD02-DEFINICION-v1.0.md
- PRD frontend: docs/prds/PRD-MOD02-FRONTEND-v1.0.md
- HLD frontend: docs/hlds/HLD-MOD02-FRONTEND-v1.0.md
- Prompt de ejecución: docs/prompts/PROMPT-MOD02-FRONTEND-FASE-01-v1.0.md
- Sprint plan: docs/sprints/PLAN-MOD02-FRONTEND-SPRINT-01-v1.0.md

---

## Objetivo

Traducir el HLD y el prompt de ejecución de MOD02 frontend en un backlog técnico accionable por archivo y componente, priorizado para apps/portal como superficie canónica tenant-aware.

---

## Prioridad P0 — Flujo core de autenticación tenant-aware

### BT-01 — Estado y routing del login tenant-aware

**Archivos objetivo**

- apps/portal/src/components/auth/AuthProvider.tsx
- apps/portal/src/components/auth/LoginForm.tsx
- apps/portal/src/lib/api-client.ts

**Objetivo**

Garantizar que el login del portal interprete sin ambigüedad los cuatro estados de MOD02 y que cada uno dispare la redirección correcta.

**Criterios de cierre**

- `LoginResult` contiene los cuatro estados definidos en el PRD frontend.
- `LoginForm` redirige a `/dashboard`, `/auth/mfa/verify`, `/auth/change-password` o `/auth/mfa/setup` según el resultado.
- `AuthProvider` no deja `user` poblado para estados intermedios.

**Dependencias**

- Contrato backend de `POST /auth/login`
- `GET /auth/me`

### BT-02 — Persistencia segura del token temporal MFA setup

**Archivos objetivo**

- apps/portal/src/lib/api-client.ts
- apps/portal/src/components/auth/AuthProvider.tsx
- apps/portal/src/components/auth/MfaSetupForm.tsx

**Objetivo**

Separar formalmente la sesión completa del token temporal `mfa-setup` y evitar que este último habilite navegación autenticada.

**Criterios de cierre**

- El token temporal usa storage key dedicada.
- Se limpia en éxito, logout y expiración.
- No existe lectura accidental de ese token como access token normal.

---

## Prioridad P1 — Flujo primer acceso ADMIN

### BT-03 — Cambio obligatorio de contraseña

**Archivos objetivo**

- apps/portal/src/app/auth/change-password/page.tsx
- apps/portal/src/lib/api-client.ts

**Objetivo**

Cerrar el paso intermedio del primer acceso con validación fuerte, feedback accesible y navegación correcta al siguiente estado del flujo.

**Criterios de cierre**

- Cambio exitoso no deja al usuario en dashboard si el siguiente paso es re-login.
- Política de contraseña y confirmación están alineadas a las reglas vigentes.
- Los errores 401 y de conectividad muestran feedback claro.

### BT-04 — MFA setup con QR y verificación inicial

**Archivos objetivo**

- apps/portal/src/app/auth/mfa/setup/page.tsx
- apps/portal/src/components/auth/MfaSetupForm.tsx
- apps/portal/src/lib/api-client.ts

**Objetivo**

Completar el flujo MFA setup del primer acceso ADMIN usando token temporal y sin construir sesión completa antes del login final.

**Criterios de cierre**

- El QR carga correctamente.
- El usuario puede verificar el primer TOTP.
- El éxito limpia token temporal y redirige a login.
- Error 401 o 403 reinicia el flujo de forma controlada.

### BT-05 — MFA verify para login estándar

**Archivos objetivo**

- apps/portal/src/app/auth/mfa/verify/page.tsx
- apps/portal/src/components/auth/MfaVerifyForm.tsx
- apps/portal/src/components/auth/AuthProvider.tsx

**Objetivo**

Cerrar el login con TOTP para usuarios que ya tienen MFA configurado.

**Criterios de cierre**

- Se consume el contexto temporal correcto del login pendiente.
- El login se completa y luego recién se carga `/auth/me`.
- No quedan sesiones intermedias huérfanas.

---

## Prioridad P2 — Recuperación de contraseña y pantallas complementarias

### BT-06 — Forgot-password con UX neutra

**Archivos objetivo**

- apps/portal/src/app/auth/forgot-password/page.tsx
- apps/portal/src/lib/api-client.ts

**Objetivo**

Garantizar que la UI de recuperación no revele existencia de cuenta y mantenga consistencia visual y accesible.

**Criterios de cierre**

- El mensaje al usuario es neutro y no filtrante.
- Se conserva tenant slug cuando aplique.
- El formulario tiene loading y feedback claro.

### BT-07 — Reset-password con retorno a login

**Archivos objetivo**

- apps/portal/src/app/auth/reset-password/page.tsx
- apps/portal/src/lib/api-client.ts

**Objetivo**

Completar la redefinición de contraseña con token temporal y cerrar la experiencia hacia login.

**Criterios de cierre**

- Se envía token de reset con el contrato correcto.
- La nueva contraseña valida reglas mínimas.
- El éxito retorna al login sin estados residuales.

### BT-08 — Verify email y coherencia de flujos auxiliares

**Archivos objetivo**

- apps/portal/src/app/auth/verify-email/page.tsx
- apps/portal/src/lib/api-client.ts

**Objetivo**

Mantener consistencia de las pantallas auxiliares de auth con el resto del módulo.

**Criterios de cierre**

- Flujo compatible con tenant slug.
- Mensajes y estados consistentes con la política del módulo.

---

## Prioridad P3 — Calidad transversal

### BT-09 — Accesibilidad mínima WCAG 2.2 AA

**Archivos objetivo**

- apps/portal/src/components/auth/LoginForm.tsx
- apps/portal/src/components/auth/MfaSetupForm.tsx
- apps/portal/src/components/auth/MfaVerifyForm.tsx
- apps/portal/src/app/auth/change-password/page.tsx
- apps/portal/src/app/auth/forgot-password/page.tsx
- apps/portal/src/app/auth/reset-password/page.tsx

**Objetivo**

Verificar labels, foco, errores, aria-live y navegación por teclado en formularios críticos.

**Criterios de cierre**

- Todos los campos críticos tienen label o nombre accesible.
- Los errores son anunciables y visibles.
- No hay bloqueos evidentes de navegación por teclado.

### BT-10 — E2E críticos de portal

**Archivos objetivo**

- e2e/tests/portal-admin-first-access.spec.ts
- e2e/tests/portal-password-recovery.spec.ts

**Objetivo**

Respaldar con evidencia automatizada los flujos críticos del módulo.

**Criterios de cierre**

- Las suites representan los pasos del PRD frontend.
- Los mocks o dependencias del entorno quedan documentados.
- Los resultados se referencian en docs/quality/ o docs/informes/.

---

## Fuera de backlog de esta fase

- Convertir apps/web en superficie tenant-aware.
- Introducir `/auth/mfa/setup` en apps/web como obligación del sprint actual.
- Refactor global de design system fuera de necesidades puntuales del módulo.

---

## Secuencia recomendada de ejecución

1. BT-01
2. BT-02
3. BT-03
4. BT-04
5. BT-05
6. BT-06
7. BT-07
8. BT-08
9. BT-09
10. BT-10

---

## Criterio de stop/go

- Stop si aparece necesidad de tocar apps/web como auth tenant-aware.
- Stop si el backend deja de respetar el contrato documentado para `/auth/login`, `/auth/mfa/setup` o `/auth/mfa/verify`.
- Go si apps/portal puede cerrar los flujos core sin reabrir boundary ni requerir ADR nuevo.