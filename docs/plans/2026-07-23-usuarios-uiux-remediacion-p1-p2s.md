# Usuarios UI/UX — Plan de remediación P1 + P2-S

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los 3 bloqueantes P1 (UI-01/02/03) y el lote quick-win P2-S (UI-06/08/11/12) + copy (UI-13/14) del informe `INFORME-USUARIOS-UIUX-AUDITORIA-v1.0.md`, dejando el frontend de Usuarios en condición de go de cierre de módulo (ADR-016).

**Architecture:** Carril rápido de UI (protocolo §3bis): sin cambio de alcance, boundary ni tokens de marca. Consume primitives existentes (`Button`, `portalFieldClassName`, tokens de tabla, `PortalAlert`, `interactiveFocusClassName`). No introduce `PortalCredentialReveal` en este lote salvo que DS-OWNER lo exija en la consulta de contrato; default = parche inline de salvaguardas (UI-02) y diferir primitive a Prioridad 3.

**Tech Stack:** Next.js App Router (portal), React 19, Tailwind v4 CSS-first, Jest + Testing Library, primitives en `apps/portal/src/components/portal-ui.tsx`, labels en `apps/portal/src/lib/user-labels.ts`.

**Gobierno:** AI-EM-ARCH (Orquestador). R = AI-FE-PLATFORM. C = AI-DS-OWNER / AI-PROD-UX (decisiones congeladas antes de Task 1). V = AI-SR-QA en G6. Sin prompt de ejecución no hay implementación (G4 — este plan es el prompt).

**Fuente:** `docs/informes/INFORME-USUARIOS-UIUX-AUDITORIA-v1.0.md` §5–§6.

---

## Decisiones congeladas (EM-ARCH + Design Layer)

| ID | Decisión | Estado |
| --- | --- | --- |
| UI-09 | **Desempate EM-ARCH:** baja a **P3**. Firma 2.3 empaqueta filtros-URL con DataTable enterprise (aún no adoptado en Usuarios). Fuera de lote; planificar con §2.3. | Congelada (desempate tras PROD-UX) |
| UI-18 | **(b)** Lima = CTA de página (`Button variant="lime"` en header). Navy = submits de modal/sección (`variant="primary"`). Cancelar = ghost/outline. No pintar submits en lima. | Congelada por DS-OWNER |
| UI-03 | Helper `getPortalDocumentTypeLabel` + `PORTAL_DOCUMENT_TYPE_LABELS` en `user-labels.ts`. Labels: CC→Cédula de ciudadanía, CE→Cédula de extranjería, PASAPORTE→Pasaporte, PEP→PEP, PTP→PTP, NIT_PERSONA→NIT persona. No importar desde CRM. | Congelada por DS-OWNER |
| UI-13/14 | Tildes aprobadas. MFA→«Verificación en dos pasos». Restablecer correo→«Cambiar correo». Permisos efectivos→«Accesos finales de esta cuenta». | Congelada por DS-OWNER |
| UI-07 | **Diferir** `PortalCredentialReveal` a Prioridad 3. Este lote: solo parche inline UI-02. | Congelada por DS-OWNER |
| UI-10 | Canónica = `KeyRound`→`ResetPasswordDialog`→reveal UsersClient. Retirar sección password de Edit en P3. **Fuera de este lote.** | Congelada por PROD-UX |
| UI-02 | Aviso `PortalAlert` warning: título «Contraseña de un solo uso»; desc. «Esta contraseña solo se muestra una vez…». Confirm cierre: «¿Ya guardaste la contraseña temporal?…» / Seguir aquí · Ya la guardé. Cierre libre solo tras Copiar o ack. Aplica CreateUserModal + UsersClient (incl. post-reset). | Congelada por PROD-UX |
| UI-08 | Primera vez: «Aún no hay usuarios» + CTA «Nuevo usuario». Con filtros: «Sin resultados» + «Limpiar filtros». `PortalEmptyState`. | Congelada por PROD-UX |
| UI-04/05/19 | Fuera de este lote (M/L). | Congelada |

**Restricciones globales**

- Solo archivos bajo `apps/portal/src/components/users/**`, `apps/portal/src/lib/user-labels.ts` (o helper vocabulario acordado), specs asociadas, y a lo sumo un export en `portal-ui.tsx` si DS-OWNER exige primitive.
- No tocar `apps/api/**`, nginx, ni otros módulos.
- No commit salvo que el humano lo pida.
- Texto visible en español, sentence case, sin enums crudos.
- Skills: `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `tailwind-patterns`, `iwana-identity-ui-review` (modo diseño al implementar), `system-vocabulary-review`, `testing-patterns`.

---

## Mapa de archivos

**Modificar (esperado)**

- `apps/portal/src/components/users/UsersTable.tsx` — UI-01, UI-06, UI-08, UI-12, copy MFA
- `apps/portal/src/components/users/EditUserModal.tsx` — UI-01, UI-12, copy
- `apps/portal/src/components/users/UsersClient.tsx` — UI-02
- `apps/portal/src/components/users/CreateUserModal.tsx` — UI-02, copy
- `apps/portal/src/components/users/UserProfileFields.tsx` — UI-03
- `apps/portal/src/components/users/BulkImportUsersModal.tsx` — UI-11
- `apps/portal/src/lib/user-labels.ts` (o ruta que fije DS-OWNER) — helper DocumentType + labels
- Specs existentes bajo `apps/portal/src/components/users/*.spec.*` si los hay

**No tocar en este lote:** ResetPasswordDialog (salvo copy si UI-14 lo exige), refactor Button masivo (UI-04), inputs masivos (UI-05), PortalCredentialReveal (UI-07 default).

---

### Task 1: UI-01 — Contraste MFA AA

**Files:**
- Modify: `UsersTable.tsx` (~284, 288, 294)
- Modify: `EditUserModal.tsx` (~695)
- Test: specs de tabla/modal si existen; smoke visual no requerido aquí

- [ ] **Step 1:** Sustituir `text-green-600` → `text-emerald-700` y `text-amber-600` → `text-amber-700` en textos MFA; conservar `dark:*-400`.
- [ ] **Step 2:** No cambiar iconos `amber-600` (1.4.11, no texto).
- [ ] **Step 3:** Verificar que no queden `text-green-600`/`text-amber-600` en esos spans de estado MFA.

---

### Task 2: UI-03 — Etiquetas DocumentType (sin enum crudo)

**Files:**
- Modify: `user-labels.ts` (o helper acordado por DS-OWNER)
- Modify: `UserProfileFields.tsx` (~140-143)
- Reutilizar mapa de `subscriber-ui.ts` si DS-OWNER lo aprueba

- [ ] **Step 1:** Añadir `getDocumentTypeLabel(dt: DocumentType): string` con tabla aprobada (mínimo `NIT_PERSONA` → etiqueta humana).
- [ ] **Step 2:** En el `<select>`, `value={dt}` (enum) y children = label humana.
- [ ] **Step 3:** Test unitario del helper (o actualización de spec de perfil) que falle si se renderiza `NIT_PERSONA` como texto visible.

---

### Task 3: UI-02 — Salvaguardas reveal individual

**Files:**
- Modify: `UsersClient.tsx` (~586-633)
- Modify: `CreateUserModal.tsx` (éxito / reveal ~278-313)
- Patrón de referencia: `BulkImportUsersModal.tsx` (`confirmClose === 'secrets'`, ~937-941)

**AC congelados (PROD-UX):**

- Aviso obligatorio (`PortalAlert` `warning`): título `Contraseña de un solo uso`; descripción `Esta contraseña solo se muestra una vez. El usuario deberá cambiarla en el próximo inicio de sesión.`
- Confirmación de cierre: título `Contraseña temporal`; descripción `¿Ya guardaste la contraseña temporal? No podrás verla de nuevo.`; acciones `Seguir aquí` | `Ya la guardé`
- Overlay / Escape / X → confirmación si hay secreto y no ack/copiado
- Tras `Copiar` o `Entendido` / `Ya la guardé` → cierre libre
- Cubrir éxito Create **y** reveal post-create / post-reset en UsersClient

- [ ] **Step 1:** Añadir `PortalAlert` warning con copy exacto.
- [ ] **Step 2:** Implementar `secretsSaved` / confirmClose paridad bulk.
- [ ] **Step 3:** CTA `Entendido` cierra sin segunda confirmación.
- [ ] **Step 4:** Test o checklist QA de los 6 escenarios del informe PROD-UX.

---

### Task 4: UI-06 + UI-12 — Tokens de tabla y foco

**Files:**
- Modify: `UsersTable.tsx` (shell, head, row hover, search focus)
- Modify: `EditUserModal.tsx` (focus de input ~92)

- [ ] **Step 1:** Consumir `portalDataTableShellClassName`, `PortalDataTableHead` / `portalDataTableHeadClassName`, `portalTableRowHoverClassName`.
- [ ] **Step 2:** Eliminar `hover:bg-[#fbfcf8]`.
- [ ] **Step 3:** Sustituir `focus:ring-iwana-secondary/35` por `interactiveFocusClassName` en búsqueda tabla y campo Edit citado.

---

### Task 5: UI-08 — Empty state bifurcado

**Files:**
- Modify: `UsersTable.tsx` (~213-226; `hasActiveFilters` ya en ~93)

**Copy congelado (PROD-UX / Firma 2.6):** usar `PortalEmptyState` + `action`.

| Rama | Título | Descripción | CTA |
| --- | --- | --- | --- |
| `!hasActiveFilters` | Aún no hay usuarios | Crea el primer usuario interno para gestionar los accesos de tu equipo. | Primario: Nuevo usuario |
| `hasActiveFilters` | Sin resultados | Ningún usuario coincide con los filtros actuales. | Outline: Limpiar filtros |

- [ ] **Step 1:** Rama filtros → Limpiar filtros (clear status/role/search).
- [ ] **Step 2:** Rama primera vez → Nuevo usuario (abre create).
- [ ] **Step 3:** Blob lima opcional solo en primera vez; nunca en sin resultados.

---

### Task 6: UI-11 — Contraste restricción CSV

**Files:**
- Modify: `BulkImportUsersModal.tsx` (~716)

- [ ] **Step 1:** `text-gray-400` → `text-gray-500` en el texto de restricciones CSV.

---

### Task 7: UI-13 + UI-14 — Copy / vocabulario

**Files:** literales en Create/Edit/UserProfileFields/UsersTable/CompanyRolesAssignmentSection según informe

- [ ] **Step 1:** Corregir tildes (UI-13) desde fuente.
- [ ] **Step 2:** Aplicar labels aprobados por DS-OWNER (MFA, cambio de correo, permisos).
- [ ] **Step 3:** Grep de los literales incorrectos en `components/users` → 0 hits.

---

### Task 8: Verificación local FE

- [ ] **Step 1:** `pnpm --filter @iwana/portal test` acotado a specs de users tocadas (o jest paths).
- [ ] **Step 2:** Lint/typecheck del paquete portal si el cambio lo amerita.
- [ ] **Step 3:** Reporte de fase a EM-ARCH: archivos tocados, IDs cerrados, gaps, sin PII.

---

## Fuera de lote (registrado, no implementar aquí)

UI-04, UI-05, UI-07 (primitive), UI-09, UI-10, UI-15…UI-19, Prioridad 3 refactor.

## Criterio stop/go (G5 hacia G6)

- **GO a QA** si UI-01, UI-02, UI-03 cerrados con evidencia en repo + P2-S del lote aplicados.
- **NO-GO** si queda enum crudo visible, contraste MFA en `-600`, o reveal individual cerrable sin aviso/confirmación.
- G6: AI-SR-QA verifica AC; G7: EM-ARCH consolida go/no-go de módulo Usuarios frontend.

### Estado de ejecución (2026-07-23)

| Gate | Resultado |
| --- | --- |
| G5 (FE-PLATFORM) | GO — lote implementado; 11 suites / 44 tests |
| G6 (SR-QA) | **GO con deuda aceptada** (automatización UI-02 #5/#6; gap E2E) |
| G7 (EM-ARCH) | **GO** cierre frontend Usuarios; **GO** cierre módulo Usuarios (ADR-016) con deuda P3/P2-M diferida — ver informe §10 |
