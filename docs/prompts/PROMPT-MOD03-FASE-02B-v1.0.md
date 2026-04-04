# PROMPT — MOD03 Configuracion Empresarial Fase 02-B

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-03-24  
**Modo activo:** Mixto  
**Generado por:** AI-EM-ARCH

## Vinculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- PRD del modulo: `docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md` (v1.1)
- HLD del modulo: `docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md` (v1.1)
- Sprint plan: `docs/sprints/PLAN-MOD03-FASE-02B-SPRINT-01-v1.0.md`
- Prompt Fase 02 previo: `docs/prompts/PROMPT-MOD03-CONFIGURACION-EMPRESA-FASE-02-v1.0.md`
- Informe de auditoria: `docs/informes/INFORME-MOD03-AUDITORIA-ESTADO-v1.0.md`
- ADRs aplicables: ADR-016, ADR-018, ADR-019, ADR-022, ADR-023

## Modulo

- Nombre: Configuracion Empresarial — Cierre Cobertura + E2E
- Codigo: MOD03
- Fase: FASE-02B
- Version: 1.0
- Fecha: 2026-03-24
- Nombre de archivo destino: `docs/prompts/PROMPT-MOD03-FASE-02B-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** Cerrar las brechas identificadas en la auditoria de MOD03 Fase 02: completar el ABM frontend de cobertura comercial (nodos y zonas) con mapa interactivo Leaflet, agregar endpoints DELETE (soft-delete) en backend, y crear suite E2E completa para cobertura y planes con validacion de roles.

- **Lo que SI entra:**
  - Endpoints DELETE para nodos y zonas de cobertura (soft-delete)
  - Unit tests para los nuevos endpoints DELETE
  - Metodos `deleteCoverageNode()` y `deleteCoverageZone()` en el API client del portal
  - Componentes ABM: `CoverageNodeTable`, `CoverageZoneTable`, `CoverageNodeDialog`, `CoverageZoneDialog`
  - Extraccion de `CoverageCheckSection` como componente independiente
  - Refactorizacion de `CommercialCoverageCard` como orquestador de sub-componentes
  - Mapa interactivo con `leaflet` + `react-leaflet` (Client Component, SSR disabled)
  - Tests E2E Playwright para CRUD de cobertura, CRUD de planes, roles NOC read-only, factibilidad

- **Lo que NO entra:**
  - Cambios en entidades o migraciones de base de datos (ya existen y son correctas)
  - Cambios en el flujo de autenticacion o tenancy
  - Modificaciones al `PlanCatalogManager` (ya esta completo, solo se valida via E2E)
  - Nuevos boundaries o bounded contexts
  - Integraciones con otros modulos
  - Cambios en apps/web — solo apps/portal y apps/api

---

## 2. Artefactos de entrada obligatorios

| Artefacto | Ubicacion | Estado |
| --- | --- | --- |
| PRD MOD03 v1.1 | `docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md` | Actualizado |
| HLD MOD03 v1.1 | `docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md` | Actualizado |
| Sprint plan Fase 02-B | `docs/sprints/PLAN-MOD03-FASE-02B-SPRINT-01-v1.0.md` | Nuevo |
| Informe auditoria | `docs/informes/INFORME-MOD03-AUDITORIA-ESTADO-v1.0.md` | Existente |
| ADR-016, ADR-018, ADR-019, ADR-022, ADR-023 | `docs/adrs/` | Vigentes |
| Artefactos faltantes detectados | Ninguno | — |

---

## 3. Instrucciones para Sr. Dev Fullstack

### Fase A — Backend DELETE endpoints (P0)

Lee el PRD v1.1 secciones 4.6 (RF-CE-27 a RF-CE-29) y el HLD v1.1 secciones 4.3 y 6 antes de empezar.

1. **Abrir** `apps/api/src/modules/tenant/tenant.service.ts`. Implementar dos metodos:
   - `removeCoverageNode(tenantId: string, nodeId: string)`: soft-delete (setea `deletedAt` + `isActive = false`). Usa `runInTenantSchema()`. Registra con `AuditService`.
   - `removeCoverageZone(tenantId: string, zoneId: string)`: mismo patron.
   - Ambos deben ser idempotentes: si el registro ya tiene `deletedAt`, no debe fallar.
   - Retornar el `CoverageAdminConfig` actualizado (sin registros soft-deleted).

2. **Abrir** `apps/api/src/modules/tenant/tenant.controller.ts`. Agregar:
   ```
   @Delete('me/coverage/nodes/:nodeId')
   @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
   @Roles(UserRole.TENANT_ADMIN)
   async removeCoverageNode(@Param('nodeId', ParseUUIDPipe) nodeId: string, @Req() req)
   ```
   ```
   @Delete('me/coverage/zones/:zoneId')
   @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
   @Roles(UserRole.TENANT_ADMIN)
   async removeCoverageZone(@Param('zoneId', ParseUUIDPipe) zoneId: string, @Req() req)
   ```
   **CRITICO:** usar `UserRole.TENANT_ADMIN` (enum), NUNCA string literal `'tenant_admin'` — causa 403 silencioso.

3. **Escribir unit tests** en `apps/api/src/modules/tenant/tenant.service.spec.ts`:
   - Test: `removeCoverageNode` setea `deletedAt` y `isActive=false`
   - Test: nodo soft-deleted no aparece en `getCoverage()`
   - Test: intentar borrar nodo de otro tenant lanza error
   - Test: `removeCoverageZone` con mismo patron

4. **Verificar:** `pnpm --filter @iwana/api test` — todos los tests pasan.

### Fase B — Frontend: API client + ABM Tables + Dialogs (P1)

Lee `PlanCatalogManager.tsx` completo antes de empezar — es el patron de referencia para TODOS los componentes de esta fase.

5. **Abrir** `apps/portal/src/lib/api-client.ts`. Agregar:
   ```typescript
   deleteCoverageNode(nodeId: string): Promise<CoverageAdminConfig>
   deleteCoverageZone(zoneId: string): Promise<CoverageAdminConfig>
   ```
   Replicar exactamente el patron de `deletePlan()`.

6. **Crear** `apps/portal/src/components/settings/CoverageNodeDialog.tsx`:
   - Usar `Dialog` de `@iwana/ui` (importar desde `@iwana/ui`)
   - Schema Zod: `name` (string, min 1, max 150), `latitude` (number, -90 a 90), `longitude` (number, -180 a 180), `isActive` (boolean, default true)
   - `react-hook-form` con `@hookform/resolvers/zod`
   - Props: `open`, `onOpenChange`, `node?: CoverageNodeConfig` (si existe = editar, si no = crear), `onSubmit`
   - Pre-llenar lat/lng cuando se abre desde click en mapa
   - `data-testid="node-dialog"`
   - Textos en espanol

7. **Crear** `apps/portal/src/components/settings/CoverageZoneDialog.tsx`:
   - Mismo patron que paso 6
   - Schema Zod: `name`, `centerLatitude` (-90 a 90), `centerLongitude` (-180 a 180), `radiusKm` (number, 0.1 a 300), `isActive`
   - `data-testid="zone-dialog"`

8. **Crear** `apps/portal/src/components/settings/CoverageNodeTable.tsx`:
   - Tabla HTML accesible con columnas: Nombre, Latitud, Longitud, Estado, Acciones
   - Props: `nodes: CoverageNodeConfig[]`, `onEdit(node)`, `onDelete(nodeId)`, `onToggle(nodeId, isActive)`, `canEdit: boolean`
   - Si `canEdit=false`: ocultar columna Acciones
   - `data-testid="coverage-node-table"`, botones con `data-testid="node-edit-btn-{id}"` y `data-testid="node-delete-btn-{id}"`
   - Badges de estado (Activo=verde, Inactivo=gris)

9. **Crear** `apps/portal/src/components/settings/CoverageZoneTable.tsx`:
   - Mismo patron. Columnas: Nombre, Lat Centro, Lng Centro, Radio km, Estado, Acciones
   - `data-testid="coverage-zone-table"`

10. **Crear** `apps/portal/src/components/settings/CoverageCheckSection.tsx`:
    - Extraer la funcionalidad de validador de factibilidad que actualmente esta en `CommercialCoverageCard.tsx`
    - Self-contained. Props: `onCheck(lat, lng) => CoverageCheckResponse`, `canEdit: boolean`
    - `data-testid="coverage-check-section"`

11. **Refactorizar** `apps/portal/src/components/settings/CommercialCoverageCard.tsx`:
    - Convertirlo en orquestador que compone: `CoverageNodeTable`, `CoverageZoneTable`, `CoverageNodeDialog`, `CoverageZoneDialog`, `CoverageCheckSection`
    - Estado local: `nodes[]`, `zones[]`, `isNodeDialogOpen`, `isZoneDialogOpen`, `editingNode`, `editingZone`
    - Callbacks: `handleCreateNode`, `handleEditNode`, `handleDeleteNode`, `handleToggleNode`, y equivalentes para zonas
    - Contadores dinamicos basados en el array actual
    - Botones "Agregar nodo" y "Agregar zona" con `data-testid="add-node-btn"` y `data-testid="add-zone-btn"`
    - `canEdit` prop para RBAC — NOC/ACCOUNTANT/SUPPORT ven todo en modo read-only
    - Mantener llamadas a API client existentes — no cambiar la firma

12. **Verificar:** `pnpm typecheck` sin errores. `pnpm lint` sin warnings nuevos.

### Fase C — Mapa Interactivo Leaflet (P2)

13. **Instalar dependencias:**
    ```bash
    pnpm --filter @iwana/portal add leaflet react-leaflet
    pnpm --filter @iwana/portal add -D @types/leaflet
    ```
    Ejecutar `pnpm audit` para verificar que no hay CVEs nuevas.

14. **Resolver marker icons de Leaflet para Next.js:**
    - Copiar `marker-icon.png`, `marker-icon-2x.png`, `marker-shadow.png` de `node_modules/leaflet/dist/images/` a `apps/portal/public/leaflet/`
    - O configurar `L.icon()` con rutas absolutas en el componente

15. **Crear** `apps/portal/src/components/settings/CoverageMap.tsx`:
    - Directiva `'use client'` obligatoria
    - Importar CSS de Leaflet: `import 'leaflet/dist/leaflet.css'`
    - Props: `nodes: CoverageNodeConfig[]`, `zones: CoverageZoneConfig[]`, `onNodeClick(node)`, `onMapClick(latlng: {lat, lng})`, `readonly: boolean`
    - Centro por defecto: Bogota (4.6097, -74.0817), zoom 12
    - Markers: azul para activos, gris para inactivos. Popup con nombre del nodo
    - Circles: para cada zona, centrado en (centerLat, centerLng), radio = radiusKm * 1000 (Leaflet usa metros)
    - Event handler `useMapEvents` de `react-leaflet` para click en mapa → `onMapClick()`
    - Si `readonly=true`: no emitir `onMapClick`
    - `data-testid="coverage-map"`, alto minimo 400px

16. **Crear** `apps/portal/src/components/settings/CoverageMapWrapper.tsx`:
    - Import con `next/dynamic`:
      ```typescript
      import dynamic from 'next/dynamic'
      const CoverageMap = dynamic(() => import('./CoverageMap'), { ssr: false })
      ```
    - Pasar todas las props transparentemente
    - Mostrar skeleton/placeholder durante carga del mapa

17. **Integrar en CommercialCoverageCard:**
    - Agregar `CoverageMapWrapper` debajo de las tablas
    - `onNodeClick` → abrir `CoverageNodeDialog` en modo edicion con el nodo
    - `onMapClick` → abrir `CoverageNodeDialog` en modo creacion con lat/lng pre-llenados
    - `readonly={!canEdit}`
    - Actualizar mapa tras mutaciones (crear/editar/borrar nodo o zona)

18. **Verificar:** `pnpm typecheck` y `pnpm lint` pasan. Verificacion manual: mapa se renderiza, markers aparecen, click funciona.

### Fase D — E2E Tests Playwright (P3)

19. **Abrir** `e2e/tests/portal-settings-empresa.spec.ts`. Agregar los siguientes tests. Cada test debe usar mocks de API (patron de `page.route()` ya existente en el archivo):

20. **Test: ADMIN crea nodo de cobertura**
    - Navegar a Configuracion > Comercial > Cobertura
    - Click en `[data-testid="add-node-btn"]`
    - Llenar nombre, latitud, longitud en `[data-testid="node-dialog"]`
    - Click guardar
    - Mock: `POST /tenants/me/coverage/nodes` → retorna config actualizada
    - Verificar: nuevo nodo aparece en `[data-testid="coverage-node-table"]`

21. **Test: ADMIN edita nodo existente**
    - Click en `[data-testid="node-edit-btn-{id}"]`
    - Modificar nombre
    - Guardar
    - Mock: `PATCH /tenants/me/coverage/nodes/:id`
    - Verificar: nombre actualizado en tabla

22. **Test: ADMIN elimina nodo**
    - Click en `[data-testid="node-delete-btn-{id}"]`
    - Confirmar eliminacion
    - Mock: `DELETE /tenants/me/coverage/nodes/:id`
    - Verificar: nodo desaparece de la tabla

23. **Test: ADMIN CRUD completo de zona**
    - Crear zona con nombre + centro + radio
    - Editar zona
    - Eliminar zona
    - Mocks de POST/PATCH/DELETE para zonas

24. **Test: ADMIN CRUD completo de plan**
    - Crear plan con nombre + tecnologia + velocidades + precio
    - Editar plan
    - Eliminar plan
    - Valida `PlanCatalogManager` existente sin regresiones

25. **Test: NOC ve cobertura en read-only**
    - Login como NOC
    - Navegar a Comercial
    - Verificar: NO existen botones `[data-testid="add-node-btn"]`, `[data-testid="add-zone-btn"]`
    - Verificar: NO existen botones de editar/eliminar en tablas
    - Verificar: tablas SI muestran datos

26. **Test: validador de factibilidad**
    - Ingresar coordenadas en `[data-testid="coverage-check-section"]`
    - Mock: `GET /tenants/me/coverage/check?latitude=X&longitude=Y` → matches
    - Verificar: resultado muestra nodos/zonas que cubren

27. **Verificar:** `pnpm test:e2e:portal` — todos los tests pasan.

### Fase E — Documentacion (P4)

28. **Actualizar** `docs/informes/INFORME-MOD03-AUDITORIA-ESTADO-v1.0.md`:
    - Marcar brechas cerradas
    - Agregar seccion de resultados post-implementacion

29. **Crear** `docs/informes/INFORME-MOD03-FASE-02B-v1.0.md`:
    - Documentar: endpoints DELETE agregados, componentes implementados, decision Leaflet, cobertura E2E
    - Riesgos cerrados y pendientes
    - Metricas: lineas de codigo, tests agregados, cobertura

---

## 4. Restricciones no negociables

1. **Modulith:** todo permanece dentro de `TenantModule`. No crear bounded contexts nuevos.
2. **Multi-tenant:** NUNCA hardcodear tenantId ni schemaName. Siempre resolver desde `TenantContext` / JWT claims.
3. **Roles:** usar siempre `UserRole.*` (enum), NUNCA strings literales en `@Roles()`.
4. **Sin PII real:** ningun dato real en tests, seeds ni documentacion.
5. **TypeORM:** sin `synchronize: true`. No se requieren migraciones nuevas (tablas ya existen).
6. **SSR Leaflet:** `CoverageMap` DEBE ser Client Component con import via `next/dynamic({ ssr: false })`. Leaflet accede a `window` y falla en SSR.
7. **Seguridad:** endpoints DELETE protegidos con `JwtAuthGuard` + `RolesGuard` + `AbacGuard`. Solo `TENANT_ADMIN`.
8. **Soft-delete:** DELETE nunca borra registros fisicamente. Setea `deletedAt` + `isActive = false`.
9. **Idem patron:** replicar exactamente los patrones de `PlanCatalogManager.tsx` y `deletePlan()` para consistencia.
10. **Accesibilidad:** tablas con `<thead>`, botones con `aria-label`, dialogs con foco correcto.

---

## 5. Entregables tecnicos obligatorios

| Entregable | Ubicacion |
| --- | --- |
| Endpoints DELETE nodos y zonas | `apps/api/src/modules/tenant/tenant.controller.ts` |
| Metodos soft-delete en service | `apps/api/src/modules/tenant/tenant.service.ts` |
| Unit tests DELETE | `apps/api/src/modules/tenant/tenant.service.spec.ts` |
| API client delete methods | `apps/portal/src/lib/api-client.ts` |
| CoverageNodeTable | `apps/portal/src/components/settings/CoverageNodeTable.tsx` |
| CoverageZoneTable | `apps/portal/src/components/settings/CoverageZoneTable.tsx` |
| CoverageNodeDialog | `apps/portal/src/components/settings/CoverageNodeDialog.tsx` |
| CoverageZoneDialog | `apps/portal/src/components/settings/CoverageZoneDialog.tsx` |
| CoverageCheckSection | `apps/portal/src/components/settings/CoverageCheckSection.tsx` |
| CommercialCoverageCard refactorizado | `apps/portal/src/components/settings/CommercialCoverageCard.tsx` |
| CoverageMap | `apps/portal/src/components/settings/CoverageMap.tsx` |
| CoverageMapWrapper | `apps/portal/src/components/settings/CoverageMapWrapper.tsx` |
| Marker icons Leaflet | `apps/portal/public/leaflet/` |
| Tests E2E | `e2e/tests/portal-settings-empresa.spec.ts` |

---

## 6. Entregables documentales obligatorios

| Entregable | Ubicacion |
| --- | --- |
| Informe de auditoria actualizado | `docs/informes/INFORME-MOD03-AUDITORIA-ESTADO-v1.0.md` |
| Informe de sprint | `docs/informes/INFORME-MOD03-FASE-02B-v1.0.md` |

- Si durante la implementacion cambia algo aprobado en PRD o HLD, documentar el desvio en el informe y escalar.
- Si el trabajo es correccion sobre un informe existente, actualizar ese informe, no crear uno nuevo.

---

## 7. Criterios de aceptacion

| ID | Criterio | Caso de uso PRD |
| --- | --- | --- |
| CA-CE-09 | ADMIN crea nodo de cobertura y este aparece en tabla y mapa | CU-06 |
| CA-CE-10 | ADMIN edita nodo y los cambios se reflejan en tabla y mapa | CU-06 |
| CA-CE-11 | ADMIN elimina nodo (soft-delete) y deja de aparecer | CU-07 |
| CA-CE-12 | ADMIN crea zona de cobertura con radio visible en mapa | CU-08 |
| CA-CE-13 | ADMIN elimina zona de cobertura igual que nodo | CU-07 |
| CA-CE-14 | Click en mapa vacio abre dialog de creacion con lat/lng | CU-09 |
| CA-CE-15 | Click en marker abre dialog edicion del nodo | CU-09 |
| CA-CE-16 | NOC/ACCOUNTANT/SUPPORT ven config read-only sin acciones | CU-10 |
| CA-CE-17 | Validador de factibilidad muestra matches correctos | CU-11 |

---

## 8. Criterio de stop/go

- **STOP inmediato si:**
  - Se necesita modificar entidades o migraciones ya aplicadas → escalar al EM
  - Se detecta conflicto de boundary con otro modulo
  - `pnpm audit` reporta CVEs criticas tras instalar Leaflet
  - Los tests existentes de Fase 01/02 se rompen con los cambios

- **Documentar causa en:** `docs/informes/INFORME-MOD03-FASE-02B-v1.0.md`
- **Escalar a:** AI-EM-ARCH (Engineering Manager)
- **Recomendacion esperada:** proponer solucion alternativa con impacto documentado

---

## 9. Criterio de salida de la fase

| Dimension | Criterio de salida |
| --- | --- |
| Backend validado | Endpoints DELETE operativos. `pnpm --filter @iwana/api test` con nuevos tests pasando. |
| Frontend validado | ABM de cobertura (nodos + zonas) con tablas, dialogs y mapa Leaflet funcional. `pnpm typecheck` sin errores. |
| Patron replicado | `CoverageNodeDialog`, `CoverageZoneDialog`, tablas y delete siguen exactamente el patron de `PlanCatalogManager`. |
| Tests en verde | `pnpm --filter @iwana/api test` + `pnpm test:e2e:portal` completos, sin flaky tests. |
| Roles validados | E2E confirmando ADMIN con CRUD y NOC con read-only. |
| Documentacion archivada | Informe de sprint creado. Informe de auditoria actualizado. |
| Sin regresiones | Tests de Fase 01 y Fase 02 existentes siguen pasando. |
| Seguridad | `pnpm audit` sin CVEs criticas. Sin PII en tests ni docs. |

---

_Documento emitido en Modo Mixto — AI-EM-ARCH_  
_Fecha: 2026-03-24_
