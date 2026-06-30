# Usuarios Portal Fase 1 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ejecutar la primera fase del rediseño visual del módulo de usuarios del portal con énfasis en overlays compartidos, tabla consistente y pruebas focalizadas.

**Architecture:** la implementación se concentra en `apps/portal/src/components/users`, reutilizando primitives ya aprobadas en `@iwana/ui` y `portal-ui`. El alcance evita cambios de contrato y se apoya en refactors locales y verificables por componente.

**Tech Stack:** Next.js App Router, React, TypeScript estricto, `@iwana/ui`, Jest, Testing Library.

---

### Task 1: Migrar overlays a Dialog compartido

**Files:**
- Modify: `apps/portal/src/components/users/CreateUserModal.tsx`
- Modify: `apps/portal/src/components/users/EditUserModal.tsx`
- Modify: `apps/portal/src/components/users/UsersClient.tsx`
- Test: `apps/portal/src/components/users/CreateUserModal.spec.tsx`
- Test: `apps/portal/src/components/users/EditUserModal.spec.tsx`

- [ ] Reemplazar wrappers manuales con `Dialog` y `DialogContent`.
- [ ] Mantener títulos accesibles y cierre explícito.
- [ ] Cubrir cierre con Escape en al menos un modal por test focalizado.

### Task 2: Refinar tabla y estados vacíos

**Files:**
- Modify: `apps/portal/src/components/users/UsersTable.tsx`
- Test: `apps/portal/src/components/users/UsersTable.spec.tsx`

- [ ] Reemplazar el estado vacío plano por `PortalEmptyState`.
- [ ] Eliminar color hardcodeado del encabezado de tabla.
- [ ] Agrupar acciones por fila con `PortalActionToolbar`.

### Task 3: Validar la fase

**Files:**
- Test: `apps/portal/src/components/users/CreateUserModal.spec.tsx`
- Test: `apps/portal/src/components/users/EditUserModal.spec.tsx`
- Test: `apps/portal/src/components/users/UsersTable.spec.tsx`

- [ ] Ejecutar pruebas focalizadas de usuarios.
- [ ] Verificar manualmente en `/dashboard/users` apertura, cierre y estados vacíos.
- [ ] Registrar cualquier follow-up para Fase 2.