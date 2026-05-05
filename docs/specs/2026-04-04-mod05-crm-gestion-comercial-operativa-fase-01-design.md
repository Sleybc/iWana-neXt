# Diseno Tecnico - MOD05 CRM Gestion Comercial y Operativa (Fase 01)

**Fecha:** 2026-04-04  
**Estado:** Propuesto y validado en sesion  
**PRD principal:** `docs/prds/PRD-MOD05-CRM-GESTION-COMERCIAL-OPERATIVA-v1.0.md`  
**Prompt de ejecucion:** `docs/prompts/PROMPT-MOD05-CRM-GESTION-COMERCIAL-OPERATIVA-FASE-01-v1.0.md`  
**Artefactos base:**

- `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md`
- `docs/prds/PRD-MOD05-CRM-ORIGEN-ATRIBUCION-v1.1.md`
- `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`
- `docs/informes/INFORME-MOD05-ATRIBUCION-INCENTIVOS-FASE1-v1.0.md`

---

## 1. Objetivo de la fase

Implementar la unificacion funcional y visual de `Interes comercial` + `Atribucion comercial` en un solo bloque de detalle llamado `Gestion comercial y operativa`, preservando separacion semantica y tecnica entre:

1. Origen de la oportunidad.
2. Originador comercial.
3. Responsable actual.
4. Historial comercial.
5. Historial operativo.

---

## 2. Decisiones de diseno aprobadas

### 2.1 Enfoque de migracion

Se adopta **Enfoque B (corte total inmediato)**:

- Se eliminan contratos `assign` en API y portal.
- Se migra completamente a contratos `responsibility` en esta fase.
- No se deja alias temporal de endpoint.

### 2.2 Permisos de reasignacion en fase 01

Por decision de producto para esta fase:

- La reasignacion del responsable actual queda habilitada para todos los roles autenticados del CRM.
- La restriccion futura por rol se difiere a una fase posterior.

### 2.3 UX de responsabilidad

El responsable actual se debe exponer en formato legible:

- Nombre visible.
- Rol visible.
- Fecha de ultima asignacion.

No se acepta mostrar solo UUID en la experiencia principal.

---

## 3. Arquitectura y boundaries

### 3.1 Principio rector

La unificacion es de experiencia de usuario, no de semantica de dominio.

Se mantienen separados:

- `ExpedienteRecord.currentResponsible*` para estado operativo actual.
- `OperationalResponsibilityHistory` para transferencias operativas.
- `SalesAttribution` para historial comercial de originador.

### 3.2 Boundary de MOD05

- No se cruzan boundaries con otros modulos.
- La resolucion de nombre/rol del usuario se realiza sobre fuentes de usuarios existentes bajo el mismo contexto autorizado.
- Multi-tenant por schema se conserva (`TenantContext` + `runInTenantSchema`/patron equivalente vigente).

### 3.3 Anti-colision semantica

- `Originador comercial` y `Responsable actual` no comparten modelo ni endpoint.
- `Canal de captacion` y `Detalle de origen` permanecen en `Origen de la oportunidad`.

---

## 4. Modelo de datos y migraciones

### 4.1 Cambios en `expediente_records`

Agregar columnas:

- `current_responsible_user_id uuid null`
- `current_responsible_assigned_at timestamptz null`

### 4.2 Nueva tabla operativa

Crear `operational_responsibility_history` con:

- `id uuid pk`
- `tenant_id uuid not null`
- `expediente_id uuid not null fk -> expediente_records(id)`
- `previous_responsible_user_id uuid null`
- `new_responsible_user_id uuid not null`
- `changed_by uuid not null`
- `changed_at timestamptz not null default now()`
- `notes varchar(255) null`

Indices:

- `idx_op_resp_hist_tenant_expediente_changed_at` sobre `(tenant_id, expediente_id, changed_at desc)`
- `idx_op_resp_hist_tenant_new_responsible` sobre `(tenant_id, new_responsible_user_id)`

### 4.3 Migracion de datos legacy

Backfill inicial:

- Si `assigned_to` existe, copiar a `current_responsible_user_id`.
- Si aplica copia, asignar `current_responsible_assigned_at = updated_at` como fallback conservador.

Nota: la columna legacy `assigned_to` puede mantenerse de forma transitoria a nivel fisico para rollback tecnico, pero queda fuera del contrato funcional.

---

## 5. Contratos API destino

### 5.1 Endpoints nuevos oficiales

1. `GET /api/v1/crm/expedientes/:id/responsibility`
2. `PATCH /api/v1/crm/expedientes/:id/responsibility`
3. `GET /api/v1/crm/expedientes/:id/responsibility/history`

### 5.2 Endpoint removido

- Eliminar `PATCH /api/v1/crm/expedientes/:id/assign` del controller, servicio y cliente portal.

### 5.3 DTOs de entrada

- `UpdateResponsibilityDto`
  - `responsibleUserId: uuid`
  - `notes?: string` (opcional)

### 5.4 Contrato de salida legible

`GET .../responsibility` debe retornar tanto IDs como denormalizados de lectura:

- `currentResponsibleUserId`
- `currentResponsibleAssignedAt`
- `currentResponsible: { userId, name, role }`

`GET .../responsibility/history` debe retornar eventos con:

- `previousResponsible: { userId, name, role } | null`
- `newResponsible: { userId, name, role }`
- `changedByActor: { userId, name, role }`
- `changedAt`
- `notes`

Fallback obligatorio si usuario no resoluble: `Usuario no disponible`.

### 5.5 Reglas de negocio API

1. Reasignacion siempre manual.
2. Cada reasignacion crea evento de historial operativo.
3. Reasignacion no altera originador comercial ni `sales_attributions`.
4. No se automatiza por estado en esta fase.

---

## 6. Diseno frontend (Portal)

### 6.1 Vista objetivo

En `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx` se reemplaza la lectura fragmentada por una sola seccion:

- **Titulo:** `Gestion comercial y operativa`

### 6.2 Jerarquia visual obligatoria

1. Responsable actual
2. Interes del cliente
3. Origen de la oportunidad
4. Atribucion comercial
5. Historial comercial
6. Historial operativo

### 6.3 Reglas UX clave

- `Responsable actual` en cabecera del bloque con CTA visible de reasignacion.
- `Originador comercial` en subbloque separado, nunca al mismo nivel principal del responsable.
- `Canal de captacion` + `Detalle de origen` juntos en bloque de origen.
- Historiales en dos bloques independientes, nunca timeline unica mezclada.

### 6.4 API client portal

Actualizar `apps/portal/src/lib/api-client.ts`:

- Remover `assignExpediente`.
- Agregar:
  - `getResponsibility(id)`
  - `updateResponsibility(id, dto)`
  - `getResponsibilityHistory(id, params?)`
- Agregar tipos:
  - `ResponsibilitySnapshot`
  - `OperationalResponsibilityHistoryItem`

### 6.5 Labels y metadata UI

Actualizar nomenclatura en `apps/portal/src/components/crm/expedientes/expediente-ui.ts` y textos de la pantalla para mantener:

- `Interes del cliente`
- `Origen de la oportunidad`
- `Gestion comercial y operativa`

---

## 7. Testing minimo y evidencia esperada

### 7.1 Backend

1. Reasignar responsable crea historial operativo.
2. Reasignar responsable no cambia originador comercial.
3. Correccion originador mantiene restriccion existente por admin.
4. `GET responsibility` y `GET responsibility/history` retornan formato legible.
5. `assign` ya no existe como contrato activo.

### 7.2 Frontend

1. Seccion unificada renderiza sin duplicidad conceptual.
2. `Responsable actual` aparece arriba.
3. `Originador comercial` aparece separado.
4. `Canal de captacion` y `Detalle de origen` se leen dentro de origen.
5. Bloques separados para historial comercial y operativo.

### 7.3 Verificacion transversal

- No mezcla de historiales comercial/operativo.
- No automatizacion de reasignacion por pipeline.
- Sin introduccion de logica de incentivos/comisiones.

---

## 8. Riesgos y mitigaciones

1. **Ruptura por retiro de `/assign`:**
   - Mitigacion: buscar referencias en monorepo y migrar todas en el mismo PR.
2. **Backfill inconsistente desde `assigned_to`:**
   - Mitigacion: migracion idempotente + prueba con datos legacy.
3. **Usuarios no resolubles en respuesta legible:**
   - Mitigacion: fallback de nombre/rol controlado.

---

## 9. Criterios de aceptacion trazables

1. Se distingue claramente `quien tiene el caso ahora` de `quien trajo el cliente`.
2. El origen no se confunde con atribucion ni reasignacion interna.
3. El responsable actual cambia manualmente.
4. Cambio de responsable queda en historial operativo.
5. Cambio de originador queda en historial comercial.
6. La UI opera con una sola seccion coherente y no dos bloques superpuestos.

---

## 10. Fuera de alcance explicito

1. Motor de incentivos y bonificaciones.
2. Liquidacion de comisiones.
3. Automatizacion por estado para reasignacion.
4. Cambio de boundaries de MOD05.
