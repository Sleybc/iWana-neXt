# PROMPT — MOD04 Fase 3: Frontend, E2E y Documentacion

**Version:** 1.0  
**Estado:** Ejecutado  
**Fecha:** 2026-03-24  
**Generado por:** AI-EM-ARCH (Engineering Manager + Lead Architect)  
**Plantilla base:** docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md  
**Prerequisito:** Fase 1 y Fase 2 completadas y validadas

**Resultado:** fase ejecutada y validada; ver `docs/informes/INFORME-MOD04-REFACTOR-v1.0.md`.

## Modulo

- Nombre: Usuarios Internos
- Codigo: MOD04
- Fase: FASE-03-FRONTEND
- Version: 1.0
- Nombre de archivo destino: `PROMPT-MOD04-FASE3-FRONTEND-v1.0.md`

---

## 1. Objetivo exacto de la fase

**Resultado esperado:**  
Portal empresarial (apps/portal) alineado 1:1 con el backend refactorizado: desalineaciones API corregidas, busqueda integrada, reset password funcional, pagina de perfil propio implementada, tests E2E creados, documentacion actualizada.

**Lo que si entra:**
- Corregir api-client: path `changeEmail()`, payload con `currentPassword`, alineacion `resetPassword()`.
- Agregar metodos `getMe()` y `updateMe()` al api-client.
- Agregar input de busqueda en la tabla de usuarios (UsersTable).
- Implementar pagina de perfil propio (/dashboard/profile) con formulario de edicion.
- Cablear boton de reset password en UsersTable → llamar a PATCH /:id/password → mostrar password temporal.
- Tests E2E con Playwright para flujos criticos de gestion de usuarios.
- Actualizar HLD-MOD04 a v1.1 reflejando cambios de arquitectura.
- Crear/actualizar informe final de la iteracion.

**Lo que no entra:**
- Cambios en el backend — si hay bugs, documentar y escalar a una Fase 1 bis.
- Nuevos componentes del design system (@iwana/ui) — usar los existentes.
- Cambios en apps/web (consola de plataforma).
- i18n — diferido.

---

## 2. Artefactos de entrada obligatorios

- **PRD del modulo:** `docs/prds/PRD-MOD04-USUARIOS-INTERNOS-v1.1.md` — Secciones 7, 9, 11, 13
- **HLD del modulo:** `docs/hlds/HLD-MOD04-USUARIOS-INTERNOS-v1.0.md`
- **ADRs aplicables:** ADR-019, ADR-020, ADR-022, ADR-023 (TailAdmin shell)
- **Codigo fuente portal:** `apps/portal/src/` (componentes users/, lib/api-client.ts)
- **Codigo fuente backend:** `apps/api/src/modules/users/` (post-Fase 1 — referencia de contratos)
- **Prompts previos:** `PROMPT-MOD04-FASE1-BACKEND-v1.0`, `PROMPT-MOD04-FASE2-TESTS-v1.0`
- **Artefactos faltantes detectados:** Ninguno

---

## 3. Instrucciones para Sr. Dev Fullstack

### Paso 1 — Corregir api-client

Archivo: `apps/portal/src/lib/api-client.ts`

**Correccion D1: path de changeEmail**
```typescript
// ANTES (incorrecto)
changeEmail: async (id: string, data: { email: string }) => {
  return request<UserResponse>(`/users/${id}/email`, { method: 'PATCH', body: data });
}

// DESPUES (correcto)
changeEmail: async (id: string, data: { email: string; currentPassword: string; syncCompanyContactEmail?: boolean }) => {
  return request<UserResponse>(`/users/${id}/login-email`, { method: 'PATCH', body: data });
}
```

**Correccion D3: resetPassword alineado con backend**
```typescript
// Verificar que resetPassword use el path correcto y retorne temporaryPassword
resetPassword: async (id: string, data?: { password?: string }) => {
  return request<{ temporaryPassword: string }>(`/users/${id}/password`, {
    method: 'PATCH',
    body: data || {},
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}
```

**Agregar metodos nuevos:**
```typescript
getMe: async () => {
  return request<UserResponse>('/users/me', { method: 'GET' });
},

updateMe: async (data: Partial<UserProfileData>) => {
  return request<UserResponse>('/users/me', {
    method: 'PATCH',
    body: data,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
},
```

### Paso 2 — Agregar busqueda en UsersTable

Archivo: `apps/portal/src/components/users/UsersTable.tsx`

- Agregar un `<Input>` de busqueda encima de la tabla con placeholder "Buscar por nombre, email o cargo...".
- Implementar debounce de 300ms para evitar llamadas excesivas.
- El valor del input se pasa como query param `search` a `usersApi.list()`.
- La busqueda se combina con los filtros existentes de status y role.
- Limpiar cursor al cambiar el termino de busqueda (volver a pagina 1).
- El input debe ser accesible: label, aria-describedby, icono de busqueda.

### Paso 3 — Cablear reset password

Archivo: `apps/portal/src/components/users/UsersTable.tsx` o `UsersClient.tsx`

- El boton "Reiniciar contraseña" ya podria existir en la tabla; si no, agregar un action button en el menu de acciones de cada fila.
- Al hacer clic:
  1. Mostrar dialogo de confirmacion: "¿Desea reiniciar la contraseña de {nombre}?"
  2. Llamar a `usersApi.resetPassword(id)`
  3. Mostrar modal con el password temporal generado y boton de copiar (patron identico al de CreateUserModal).
  4. Mensaje: "El usuario debera cambiar su contraseña en el proximo inicio de sesion."
- Manejar errores: 403 si ADMIN intenta resetear SYSTEM_ADMIN.

### Paso 4 — Implementar pagina de perfil propio

Archivos nuevos:
- `apps/portal/src/app/dashboard/profile/page.tsx` — pagina SSR wrapper
- `apps/portal/src/components/profile/ProfileClient.tsx` — componente cliente

**Funcionalidad:**
- Al cargar, llamar a `usersApi.getMe()` para obtener perfil actual.
- Formulario con react-hook-form + Zod para editar: firstName, lastName, phone, jobTitle, documentType, documentNumber, avatarUrl.
- Al guardar, llamar a `usersApi.updateMe(data)`.
- Mostrar toast de confirmacion tras guardar.
- No mostrar campos de role ni status (solo lectura, no editables).
- Accesible: labels, aria, focus management, dark mode completo.

**Agregar link en el sidebar/header:**
- Si el layout usa un menu lateral, agregar entrada "Mi perfil" que lleve a /dashboard/profile.
- Si hay un dropdown de usuario en el header, agregar "Mi perfil" como opcion.

### Paso 5 — Tests E2E con Playwright

Archivo: `e2e/tests/portal/users.spec.ts`

**Prerequisitos E2E:**
- Tenant aprovisionado con admin seed (ADR-020).
- Admin autenticado via login flow.

**Casos minimos (6-8 tests):**

```
describe('Gestion de usuarios — Portal', () => {
  test('Admin puede listar usuarios en la tabla')
  test('Admin puede crear usuario y ver password temporal')
  test('Admin puede editar nombre de un usuario')
  test('Admin puede suspender un usuario')
  test('Admin puede reiniciar password de un usuario')
  test('Admin puede buscar usuario por nombre')
  test('Admin puede eliminar usuario (soft delete)')
  test('Usuario no-admin puede ver y editar su perfil')
})
```

**Configuracion:**
- Usar `playwright.portal.config.ts` existente.
- Base URL: `http://localhost:3002`.
- Almacenar estado de autenticacion para reutilizar entre tests.

### Paso 6 — Actualizar documentacion

**HLD-MOD04 v1.1** — `docs/hlds/HLD-MOD04-USUARIOS-INTERNOS-v1.1.md`:
- Actualizar seccion de modelo de datos (emailHash mantenido como derivado, tipos de columna simplificados).
- Actualizar seccion de endpoints (agregar /me, /:id/password, search).
- Actualizar seccion de seguridad (cifrado solo mfaSecret, DT-01 documentada).
- Actualizar diagrama de secuencia si existe.
- Mantener referencia a v1.0 como version previa.

**Informe final** — `docs/informes/INFORME-MOD04-REFACTOR-v1.0.md`:
- Actualizar con resultados de Fase 3: frontend corregido, E2E creados, documentacion actualizada.
- Incluir metricas finales: total tests, cobertura, endpoints implementados.
- Incluir deuda tecnica pendiente (DT-01, DT-02).
- Decision de salida con firma.

---

## 4. Restricciones no negociables

1. No modificar backend — si hay bugs, documentar y escalar.
2. No usar PII real en datos de test ni en screenshots.
3. Tailwind 4 CSS-first — no agregar `tailwind.config.js`.
4. Accesibilidad WCAG 2.2 AA — labels, focus, contraste, aria.
5. Todo texto sobre fondo blanco con color secundario debe usar `iwana-secondary-700` (no el verde base).
6. No importar componentes de apps/web — solo de @iwana/ui y components locales del portal.
7. Formularios con react-hook-form + Zod; no validacion manual.
8. api-client debe mantener el patron existente de request() con retry ante 401.
9. Tests E2E no deben depender de datos hardcodeados — crear datos via API o seed.
10. Comentarios en espanol para logica no trivial.

---

## 5. Entregables tecnicos obligatorios

| # | Archivo | Accion |
| --- | --- | --- |
| 1 | `apps/portal/src/lib/api-client.ts` | Corregir changeEmail, resetPassword; agregar getMe, updateMe |
| 2 | `apps/portal/src/components/users/UsersTable.tsx` | Agregar input de busqueda con debounce |
| 3 | `apps/portal/src/components/users/UsersClient.tsx` | Cablear reset password flow |
| 4 | `apps/portal/src/app/dashboard/profile/page.tsx` | Crear pagina wrapper |
| 5 | `apps/portal/src/components/profile/ProfileClient.tsx` | Crear componente de perfil |
| 6 | `e2e/tests/portal/users.spec.ts` | Crear tests E2E (6-8 casos) |

---

## 6. Entregables documentales obligatorios

| # | Archivo | Accion |
| --- | --- | --- |
| 1 | `docs/hlds/HLD-MOD04-USUARIOS-INTERNOS-v1.1.md` | Crear nueva version |
| 2 | `docs/informes/INFORME-MOD04-REFACTOR-v1.0.md` | Actualizar con resultados finales |

---

## 7. Criterios de aceptacion

| CA | Descripcion | Como verificar |
| --- | --- | --- |
| CA-01 | api-client changeEmail usa path `/login-email` y envia currentPassword | Inspeccionar codigo + test E2E |
| CA-02 | api-client resetPassword retorna temporaryPassword | Test E2E o manual |
| CA-03 | Busqueda en tabla filtra por nombre, email, cargo | Escribir en input → tabla se filtra |
| CA-04 | Reset password muestra dialog + password temporal copiable | Test E2E |
| CA-05 | Pagina /dashboard/profile carga perfil del usuario autenticado | Navegar como NOC → ver datos |
| CA-06 | Editar perfil propio guarda cambios | Modificar nombre → guardar → recargar → verificar |
| CA-07 | Tests E2E pasan en verde | `pnpm test:e2e:portal` → 0 failures |
| CA-08 | HLD v1.1 refleja modelo de datos actualizado | Revision documental |
| CA-09 | Informe final incluye metricas de cobertura y deuda tecnica | Revision documental |
| CA-10 | Portal compila sin errores | `pnpm --filter @iwana/portal build` → exit 0 |
| CA-11 | Lint y typecheck limpios en portal | `pnpm --filter @iwana/portal lint` → 0 errores |

---

## 8. Criterio de stop/go

- **Detenerse inmediatamente si:**
  - Un endpoint del backend no responde segun el contrato del PRD v1.1 (bug en Fase 1).
  - La estructura del layout/sidebar del portal ha cambiado significativamente y no permite agregar rutas.
  - Los tests E2E no pueden autenticarse con el admin seed.
- **Documentar causa en:** `docs/informes/INFORME-MOD04-REFACTOR-v1.0.md` con etiqueta `[BLOQUEADO-FASE3]`.
- **Escalar a:** CTO si el bloqueo afecta la integridad del flujo de autenticacion o boundaries.
- **Recomendacion esperada:** Proponer fix puntual documentado antes de escalar.

---

## 9. Criterio de salida de la fase

- [ ] Portal compilando: `pnpm --filter @iwana/portal build` → exit 0
- [ ] api-client alineado 1:1 con backend (0 desalineaciones)
- [ ] Busqueda funcional en tabla de usuarios
- [ ] Reset password funcional con dialog y password copiable
- [ ] Pagina de perfil propio operativa (/dashboard/profile)
- [ ] Tests E2E pasando: `pnpm test:e2e:portal` → 0 failures
- [ ] HLD v1.1 creado y archivado
- [ ] Informe final actualizado con metricas y deuda tecnica
- [ ] Lint y typecheck limpios

---

*Prompt generado por AI-EM-ARCH. Vinculado a PRD-MOD04 v1.1, PROMPT-MOD04-FASE1-BACKEND-v1.0 y PROMPT-MOD04-FASE2-TESTS-v1.0.*
