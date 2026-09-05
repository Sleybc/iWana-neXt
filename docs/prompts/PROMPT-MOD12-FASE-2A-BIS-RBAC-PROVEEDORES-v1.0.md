# PROMPT DE EJECUCIÓN — MOD12 Fase 2A-bis · Corrección del gate RBAC de Proveedores

**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` v1.2 *(en revisión — la regla de destino la respalda `AGENTS.md` → Documentation Rules)*
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Fecha:** 2026-09-02
**Versión:** 1.0

## Módulo

- **Nombre:** Inventario / SCM — gate de la pestaña Proveedores
- **Código:** MOD12 (`/dashboard/inventory?tab=suppliers`)
- **Fase:** 2A-bis — corrección de defecto RBAC (independiente de la federación)
- **Destinatarios:** **AI-SR-FULL** (implementación) + **AI-SEC-ENG** (revisión reforzada — toca superficie de autorización)
- **Puede correr en paralelo** con la Fase 2A. Si 2A entrega el gate por grupo, esta corrección queda absorbida allí; se emite por separado para que no se pierda si 2A se difiere.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** alinear la visibilidad en UI de la pestaña **Proveedores** con el permiso que
su backend realmente exige, eliminando un 403 que hoy sufre el usuario en operación normal.

**El defecto, verificado el 2026-09-02:**

| Capa | Permiso exigido hoy | Archivo |
| --- | --- | --- |
| Visibilidad de la pestaña | `INVENTORY_STOCK_READ` (gate de página) | `apps/portal/src/app/dashboard/inventory/layout.tsx` |
| `GET /purchasing/suppliers` (listar) | **`INVENTORY_PURCHASING_READ`** | `apps/api/src/modules/inventory/purchasing.controller.ts` |
| `GET /purchasing/suppliers/:partyRefId` | **`INVENTORY_PURCHASING_READ`** | ídem |
| `POST /purchasing/suppliers` (alta) | **`INVENTORY_PURCHASING_MANAGE`** | ídem |
| `PATCH` / `POST …/status` | **`INVENTORY_PURCHASING_MANAGE`** | ídem |

Consecuencia: un rol con solo `inventory.stock.read` **ve la pestaña Proveedores y recibe 403** al
usarla. `SuppliersPanel` ya muestra el mensaje de error, pero el flujo no debería llegar ahí.

**Lo que sí entra:** alinear el gate de visibilidad de `suppliers` con `INVENTORY_PURCHASING_READ`,
con la misma semántica fail-open del Sidebar, y su cobertura de tests.

**Lo que no entra:**
- Cambiar el backend. **Ya es correcto**: `PermissionsGuard` sigue siendo la barrera real y no se toca.
- Mover Proveedores de módulo, de ruta o de `?tab`.
- Crear permisos granulares nuevos.
- Activar el alias federado ni tocar el registry de Settings.

---

## 2. Artefactos de entrada obligatorios

- **PRD:** `docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md` · `docs/prds/PRD-MOD12-PROVEEDORES-v1.0.md` (Aprobado)
- **HLD:** `docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md`
- **ADRs aplicables:**
  - `ADR-084` v1.1 (**Aprobado**) — D3 y Regla 3 fijan el gate por grupo y registran este defecto
  - `ADR-083` (**Aprobado**) — navegación derivada de permisos efectivos; sin permisos nuevos
  - `ADR-052` (**Aprobado**) — alta de proveedor por puerto comando Parties
  - `ADR-040` (**Aprobado**) — boundaries
- **Spec de gramática de gates:** `docs/specs/2026-08-28-mod00-convergencia-nav-gates-ux.md` v1.2 (Aprobado) — «ocultar lo no efectivo»; deep-link a sección oculta produce pantalla de acceso restringido que explica el motivo
- **Plan:** `docs/plans/2026-09-01-inventario-maestros-ubicacion-inventory-vs-settings.md` v1.2, §Fase 2A-bis
- **Referencia de implementación:** `filterInventoryNavGroups` en `apps/portal/src/components/inventory/inventory-nav.ts:78-87` y su consumo en `InventoryClient.tsx` (gate CA-GATE-06 de Compras, ya cableado en R1) — **reutilizar ese mecanismo, no inventar otro**

---

## 3. Instrucciones

1. Extender el gate de navegación para que `suppliers` exija `INVENTORY_PURCHASING_READ`, con la
   **misma semántica** que ya aplica a `purchasing`: se oculta solo con permisos efectivos resueltos
   (`ready`, set no vacío, rol no-ADMIN, sin la llave); visible en loading, degradado y tripwire.
2. Cubrir el deep-link: `/dashboard/inventory?tab=suppliers` sin el permiso debe resolver según la
   gramática de la spec de gates, no dejar al usuario ante un 403 crudo.
3. Verificar que el backend **sigue rechazando** — la corrección de UI no debe interpretarse como
   la barrera.
4. Cubrir con tests el rol solo-stock, el rol con purchasing y el ADMIN.
5. **AI-SEC-ENG:** revisión reforzada. Confirmar que no se introduce bypass, que no se amplía
   ninguna superficie de autorización y que ocultar en UI no sustituye la validación de servidor.

---

## 4. Restricciones no negociables

1. **No tocar `purchasing.controller.ts` ni ningún guard del backend.** Es correcto; el defecto es de UI.
2. **Sin permisos nuevos** (`SUPPLIERS_READ` y similares están prohibidos — ADR-084 Regla 2, ADR-083).
3. **Fail-open preservado:** ocultar solo con permisos efectivos resueltos. Nunca ocultar en loading.
4. Sin cambios de ruta, de `?tab`, de modelo de datos ni del registry de Settings.
5. Si la Fase 2A ya introdujo el gate por grupo «Abastecimiento», **integrarse con él** en lugar de
   duplicar lógica.

---

## 5. Entregables técnicos

- Gate de `suppliers` en `apps/portal/src/components/inventory/inventory-nav.ts` (+ su consumo).
- Tests: `inventory-nav.spec.ts`, `InventoryClient.spec.tsx`.
- Sin migraciones, sin cambios de OpenAPI, sin cambios de backend.

## 6. Entregables documentales

- Actualizar el informe vigente relacionado (`INFORME-INVENTORY-MODULE-SUBNAV-v1.1.md` si 2A está en
  curso; en otro caso, nota en `INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md`, el índice vivo
  de estado). **No crear informe nuevo** para una corrección de defecto.
- Evidencia de la revisión de AI-SEC-ENG.

---

## 7. Criterios de aceptación

- **CA-2Ab-01:** un rol con solo `inventory.stock.read` (permisos efectivos resueltos, no-ADMIN) **no ve** la pestaña Proveedores.
- **CA-2Ab-02:** un rol con `inventory.purchasing.read` sí la ve y opera sin 403.
- **CA-2Ab-03:** ADMIN la ve siempre.
- **CA-2Ab-04:** con permisos en loading, degradados o tripwire, la pestaña permanece visible (fail-open, criterio del Sidebar).
- **CA-2Ab-05:** deep-link `?tab=suppliers` sin permiso resuelve según la gramática de gates, sin 403 crudo.
- **CA-2Ab-06:** el backend sigue devolviendo 403 a `GET /purchasing/suppliers` sin el permiso — verificado explícitamente. La UI no es la barrera.
- **CA-2Ab-07:** sin permisos nuevos en `access-permission-key.enum.ts` (`git diff` vacío en ese archivo).

## 8. Criterio de stop/go

**Detenerse inmediatamente si:**
- La corrección exigiera crear un permiso nuevo o modificar el backend.
- AI-SEC-ENG detecta que el cambio amplía cualquier superficie de autorización.
- Se descubre que otros tabs sufren el mismo desalineo — en ese caso, **inventariarlos y escalar**
  antes de corregir uno por uno.

**Documentar causa en:** el informe vigente relacionado, §Bloqueos.
**Escalar a:** AI-EM-ARCH con etiqueta `[BLOQUEO]` antes de cerrar la sesión.
**Recomendación esperada:** alcance corregido del gate, o propuesta de tratamiento uniforme si el
desalineo resulta ser sistémico.

## 9. Criterio de salida de la fase

- **Frontend validado:** `pnpm --filter @iwana/portal test src/components/inventory/inventory-nav.spec.ts src/components/inventory/InventoryClient.spec.tsx` en verde, **con `Cached: 0`**.
- **Backend sin cambios:** `git diff --stat apps/api` vacío.
- **Seguridad:** visto bueno de AI-SEC-ENG registrado.
- **Calidad:** `pnpm --filter @iwana/portal typecheck && pnpm lint` en verde.
- **Documentación archivada:** informe vigente actualizado.

---

## Impacto declarado (AI-EM-ARCH)

- **Multi-tenant:** sin impacto.
- **Seguridad:** **mejora de coherencia, sin cambio de superficie**. No había fuga de datos — el backend siempre rechazó; lo que se corrige es una UI que ofrecía una acción imposible. PoLP preservado; sin permisos nuevos.
- **Escala:** sin impacto.
- **Regulación:** sin impacto.
