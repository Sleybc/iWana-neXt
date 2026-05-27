# MOD00 roles de empresa en Access - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** redisenar `/dashboard/settings/access` para que sea una superficie enfocada en plantillas iniciales, roles de empresa y permisos, quitando de esa pantalla la asignacion de usuarios y los permisos efectivos por usuario.

**Architecture:** el boundary aprobado por ADR-040 no cambia. Access Control sigue siendo owner del catalogo, seeds, CRUD de roles y auditoria. Users sigue siendo la superficie operativa para alta/edicion de cuentas y asignacion de roles de empresa. Este plan corrige la IA y el handoff del portal, no mueve responsabilidades entre modulos.

**Tech Stack:** Next.js App Router, React Hook Form, Zod, Jest, Playwright, pnpm

---

## File Structure

### Portal access

- Modify: `apps/portal/src/components/settings/mod00-settings-labels.ts`
  Purpose: alinear copy visible al nuevo scope de la pantalla.
- Modify: `apps/portal/src/components/settings/AccessControlSettingsClient.tsx`
  Purpose: remover bloques de usuario, volver accionables las plantillas y reorganizar el editor.
- Modify: `apps/portal/src/components/settings/AccessControlSettingsClient.spec.tsx`
  Purpose: validar la nueva jerarquia, la ausencia de bloques de usuario y el flujo de creacion.
- Modify: `apps/portal/src/components/settings/SettingsAccessShortcuts.tsx`
  Purpose: asegurar que el shell describa la seccion como taller de roles, no como centro de asignaciones.
- Modify: `apps/portal/src/components/settings/SettingsClient.spec.tsx`
  Purpose: ajustar expectativas del shell si cambia el copy de shortcut.

### E2E y cierre

- Modify: `e2e/tests/portal-settings-access-governance.spec.ts`
  Purpose: validar la IA redisenada de la pantalla de roles.
- Modify: `e2e/tests/portal-users.spec.ts`
  Purpose: regresion corta para confirmar que la asignacion sigue en Users.
- Modify: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
  Purpose: registrar la correccion de drift entre producto, spec y handoff.

### Optional only if truly needed

- Modify: `apps/portal/src/components/access-control/EffectivePermissionsPanel.tsx`
  Purpose: solo si queda sin uso y conviene encapsular o reubicarlo; no tocarlo por defecto.

### Do not create

- No crear nuevo endpoint backend para `Usar como base` si el cliente puede precargar desde `listProfiles()`.
- No reintroducir selector de usuario en `/dashboard/settings/access`.
- No mover la asignacion de roles fuera de `/dashboard/users`.

---

## Task 1: Reencuadrar la pantalla de Access

**Files:**

- Modify: `apps/portal/src/components/settings/mod00-settings-labels.ts`
- Modify: `apps/portal/src/components/settings/AccessControlSettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/AccessControlSettingsClient.spec.tsx`

- [ ] **Step 1: Write the failing portal tests first**

Agregar o ajustar pruebas en `AccessControlSettingsClient.spec.tsx` para obligar esta IA:

```ts
it('does not render user assignment controls inside roles screen', async () => {
  renderAsAdmin(<AccessControlSettingsClient />);

  await screen.findByRole('heading', { name: 'Roles de empresa' });

  expect(screen.queryByRole('heading', { name: 'Asignación de roles' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Permisos efectivos' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Usuario')).not.toBeInTheDocument();
});
```

Agregar otra prueba para el nuevo subtitulo y jerarquia:

```ts
it('shows templates and custom roles as the primary entry points', async () => {
  renderAsAdmin(<AccessControlSettingsClient />);

  expect(await screen.findByText('Plantillas iniciales')).toBeInTheDocument();
  expect(screen.getByText('Roles personalizados')).toBeInTheDocument();
  expect(screen.getByText(/Diseña roles de empresa/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Remove mixed user blocks from the page**

En `AccessControlSettingsClient.tsx`:

1. Eliminar del layout principal el panel `Asignación de roles`.
2. Eliminar del layout principal `EffectivePermissionsPanel` para esta ruta.
3. Mantener `ProfileChangeEvidence` solo como bloque secundario al final o debajo del catalogo.
4. Cambiar el subtitulo para hablar solo de diseno de roles.

- [ ] **Step 3: Run focused portal tests**

Run:

```bash
pnpm --filter @iwana/portal test -- AccessControlSettingsClient
```

Expected: FAIL antes del cambio, PASS despues del reencuadre.

---

## Task 2: Volver accionables las plantillas iniciales

**Files:**

- Modify: `apps/portal/src/components/settings/AccessControlSettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/AccessControlSettingsClient.spec.tsx`

- [ ] **Step 1: Add failing tests for template actions**

Cubrir que cada plantilla visible expone al menos:

1. Nombre.
2. Categoria base compatible.
3. Conteo de permisos.
4. Boton `Ver accesos`.
5. Boton `Usar como base`.

Ejemplo:

```ts
it('renders actionable system templates', async () => {
  renderAsAdmin(<AccessControlSettingsClient />);

  const templateCard = await screen.findByText('Administrador general');
  expect(templateCard).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Ver accesos' }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole('button', { name: 'Usar como base' }).length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Implement template cards with preview hooks**

En `AccessControlSettingsClient.tsx`:

1. Convertir la grilla de plantillas en cards interactivas.
2. Mostrar badge de sistema y conteo de permisos.
3. Implementar una vista de preview simple: panel expandido, drawer ligero o bloque contextual en la misma pagina.
4. `Usar como base` debe precargar el flujo de creacion con datos de la plantilla elegida.

- [ ] **Step 3: Validate focused tests**

Run:

```bash
pnpm --filter @iwana/portal test -- AccessControlSettingsClient
```

---

## Task 3: Crear rol con selector de dos opciones

**Files:**

- Modify: `apps/portal/src/components/settings/AccessControlSettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/AccessControlSettingsClient.spec.tsx`

- [ ] **Step 1: Add failing tests for the creation selector**

```ts
it('opens a creation selector with template and blank-start options', async () => {
  renderAsAdmin(<AccessControlSettingsClient />);

  fireEvent.click(await screen.findByRole('button', { name: 'Crear rol' }));

  expect(screen.getByText('Usar una plantilla')).toBeInTheDocument();
  expect(screen.getByText('Empezar desde cero')).toBeInTheDocument();
});
```

- [ ] **Step 2: Implement the selector without overcomplicating the flow**

Regla de implementacion:

1. `Crear rol` abre un selector corto, no un wizard largo.
2. `Usar una plantilla` lleva a elegir plantilla y luego abre editor precargado.
3. `Empezar desde cero` abre editor vacio con todos los permisos desmarcados.
4. Si el formulario ya existe, reutilizarlo; no crear modales paralelos innecesarios.

- [ ] **Step 3: Add secondary actions inside the editor**

Agregar en el editor:

1. `Limpiar permisos`.
2. `Restablecer cambios`.

La primera deja el rol vacio. La segunda revierte al estado original del rol o la plantilla base.

---

## Task 4: Reducir densidad del editor y relegar referencias

**Files:**

- Modify: `apps/portal/src/components/settings/AccessControlSettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/mod00-settings-labels.ts`
- Modify: `apps/portal/src/components/settings/AccessControlSettingsClient.spec.tsx`

- [ ] **Step 1: Group permissions by module**

No dejar una pared plana de checkboxes. Agrupar por modulo con encabezados y conteo.

Modelo minimo aceptable:

1. Configuración
2. Organización
3. Usuarios
4. Acceso
5. WFM
6. Reservados futuros en bloque visual subordinado

- [ ] **Step 2: Demote catalog and history**

1. `Catálogo de permisos` debe quedar colapsado o debajo del editor.
2. `Historial de cambios` debe quedar al final y referirse a roles y permisos.
3. Ninguno de esos bloques debe competir con plantillas y roles personalizados en el primer viewport.

- [ ] **Step 3: Focused validation**

Run:

```bash
pnpm --filter @iwana/portal test -- AccessControlSettingsClient SettingsClient
```

---

## Task 5: Validate the corrected ownership in E2E and close the slice

**Files:**

- Modify: `e2e/tests/portal-settings-access-governance.spec.ts`
- Modify: `e2e/tests/portal-users.spec.ts`
- Modify: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

- [ ] **Step 1: Update access governance E2E**

Validar:

1. La ruta muestra `Roles de empresa`.
2. No muestra selector de usuario.
3. Las plantillas tienen acciones visibles.
4. El flujo `Crear rol` ofrece las dos opciones iniciales.

- [ ] **Step 2: Keep one regression in Users**

Agregar o mantener una prueba corta que confirme que la asignacion de roles de empresa sigue disponible en Users, para evitar que el equipo vuelva a mover ese ownership por accidente.

- [ ] **Step 3: Run final validation**

Run:

```bash
pnpm --filter @iwana/portal test -- AccessControlSettingsClient SettingsClient CreateUserModal.spec.tsx EditUserModal.spec.tsx
pnpm test:e2e:portal -- --grep "access governance|portal users"
```

Si Playwright focalizado no esta disponible o es muy costoso en el entorno, documentar la limitacion en el informe vivo y dejar al menos Jest verde para el slice.

---

## Definition of Done

- `/dashboard/settings/access` queda centrada en roles, plantillas y permisos.
- La pantalla ya no contiene asignacion de usuarios ni permisos efectivos por usuario.
- `Crear rol` abre un selector con `Usar una plantilla` y `Empezar desde cero`.
- Las plantillas son entendibles y accionables.
- El editor agrupa permisos por modulo y expone `Limpiar permisos` y `Restablecer cambios`.
- El catalogo y el historial quedan en segundo plano.
- Tests focalizados del portal verdes.
- Informe vivo actualizado con la correccion del drift documental.
