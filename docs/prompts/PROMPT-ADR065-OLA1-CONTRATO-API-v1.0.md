# PROMPT — ADR-065 Ola 1: Contrato unico + deuda critica de backend

**Version:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-07-24
**Modo activo:** Architect (AI-EM-ARCH delega a AI-SR-FULL)
**Generado por:** AI-EM-ARCH
**Ejecutor previsto:** AI-SR-FULL
**ADR:** [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md) (Aprobado CTO 2026-07-24)
**ADR relacionado:** [ADR-066](../adrs/ADR-066-Migraciones-No-Transaccionales-Runner.md) (Aprobado CTO 2026-07-24)
**Plan padre:** [2026-07-24-paginacion-numerada-adopcion.md](../plans/2026-07-24-paginacion-numerada-adopcion.md)
**Archivo destino:** docs/prompts/PROMPT-ADR065-OLA1-CONTRATO-API-v1.0.md
**Skills requeridas:** `nestjs-expert`, `backend-security-coder`, `postgresql`, `openapi-spec-generation`, `testing-patterns`

---

## 1. Objetivo exacto de la fase

Crear el contrato unico de paginacion `ListMeta` / `ListResponse<T>` en `@iwana/shared`, normalizar los 35 endpoints de listado del Modulith para que todos emitan ese contrato, cerrar los cuatro defectos preexistentes (DEF-1 a DEF-4), y establecer la infraestructura de `sortBy`/`sortDir` con lista blanca declarada por servidor.

### Resultado esperado

Todos los endpoints de listado del Modulith devuelven el mismo envelope. Las tres utilidades de paginacion duplicadas estan retiradas. Los cuatro defectos estan cerrados. La infraestructura de orden por columna esta lista para que la Ola 2 la active con indices.

### Lo que si entra

- Contrato `ListMeta` / `ListResponse<T>` en `packages/shared/src/dto/pagination.dto.ts`.
- Helper comun `apps/api/src/common/pagination/` con `clampPage`, `buildPageMeta`, codificadores de cursor unificados.
- Retirar `commercial/utils/commercial-pagination.ts`, `inventory/utils/inventory-pagination.ts`, `taxation/utils/taxation-pagination.ts` (~380 lineas duplicadas).
- DEF-1: desempate por `id` en los 7 endpoints que ordenan sin tiebreaker.
- DEF-2: clamp `page * limit <= 10_000` en los 35 endpoints.
- DEF-3: arreglo del cursor keyset de auditoria (reemplazar `id < cursor` UUID por cursor compuesto `(createdAt, id)`).
- DEF-4: bajar `slaBreachStatus` a SQL via `CASE` en `tickets.service.ts`; retirar paginacion in-memory de `expediente.service.ts:666-669`.
- `sortBy` + `sortDir` con lista blanca por recurso; `sortableFields` y `sort` en `meta`.
- Capping de los 9 endpoints unbounded (max 100 filas) + los 6 de cardinalidad baja.
- Dual-emit: campos `page`/`total` planos + `meta` en la misma respuesta durante un sprint.
- OpenAPI: `ListMetaDto` compartido, `@ApiQuery` de `page`, `sortBy`, `sortDir`.

### Lo que no entra

- Crear indices de soporte para la paginacion (Ola 2).
- Modificar `runner.ts` para migraciones no transaccionales (ADR-066 lo gobierna; se implementa en Ola 2).
- Cambiar el frontend (Ola 3+).
- Anadir `page` a los endpoints keyset (Ola 6).
- El orden por columna efectivo con `aria-sort` en frontend (Ola 3+).
- Los pickers con soft-cap (plan independiente E-4).

---

## 2. Artefactos de entrada obligatorios

- ADR-065 (especialmente §Decision 10: contrato `ListMeta`, §Decision 11: cota `page`, §Decision 12: desempate `id`, §Decision 17-22: orden)
- ADR-066 (flag `transactional` en runner — para referencia de Ola 2)
- Plan de adopcion: [2026-07-24-paginacion-numerada-adopcion.md](../plans/2026-07-24-paginacion-numerada-adopcion.md)
- Spec UX: [2026-07-24-paginacion-numerada-ux.md](../specs/2026-07-24-paginacion-numerada-ux.md)
- Contrato DS: [2026-07-24-paginacion-numerada-ds-contrato.md](../specs/2026-07-24-paginacion-numerada-ds-contrato.md)
- Stack: `docs/prds/Stack_Tecnologico.md`
- Gobernanza: `AGENTS.md`

---

## 3. Pasos de implementacion

### Paso 1 — Contrato `ListMeta` / `ListResponse<T>` en `@iwana/shared`

**Archivo a crear:** `packages/shared/src/dto/pagination.dto.ts`

```typescript
export interface ListMeta {
  nextCursor: string | null;
  total: number;
  totalIsEstimate: boolean;
  page: number | null;
  limit: number;
  totalPages: number | null;
  hasMore: boolean;
  mode: 'page' | 'cursor';
  capabilities: {
    randomAccess: boolean;
    sortableFields: string[];
  };
  sort: { by: string; dir: 'asc' | 'desc' } | null;
}

export interface ListResponse<T> {
  data: T[];
  meta: ListMeta;
}
```

Re-exportar desde `packages/shared/src/index.ts`.

### Paso 2 — Helper comun en `apps/api/src/common/pagination/`

**Archivos a crear:**

`apps/api/src/common/pagination/clamp-page.ts`:
```typescript
export const MAX_PAGE_OFFSET = 10_000;
export function clampPage(page: number, limit: number): { page: number; limit: number } {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const safePage = Math.max(1, page);
  if (safePage * safeLimit > MAX_PAGE_OFFSET) {
    throw new BadRequestException(`page * limit must not exceed ${MAX_PAGE_OFFSET}`);
  }
  return { page: safePage, limit: safeLimit };
}
```

`apps/api/src/common/pagination/build-page-meta.ts`:
```typescript
export function buildPageMeta(params: {
  total: number;
  page: number;
  limit: number;
  randomAccess?: boolean;
  sortableFields?: string[];
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}): ListMeta { /* ... */ }
```

`apps/api/src/common/pagination/cursor-codec.ts`:
- Unificar `encodePayload`/`decodePayload` (identicos en 3 archivos).
- Unificar `encodeDateIdCursor`/`decodeDateIdCursor`/`buildDateIdNextCursor` (identicos en 2 archivos).
- Exportar `encodeSortNameIdCursor`, `decodeSortNameIdCursor`, `buildSortNameIdNextCursor` (de inventory).
- Exportar `encodeCodeIdCursor`, `decodeCodeIdCursor`, `buildCodeIdNextCursor` (de taxation).

`apps/api/src/common/pagination/index.ts`: re-exportar todo.

### Paso 3 — DEF-1: Desempate por `id` en 7 endpoints

**Archivos a modificar:**

| # | Archivo:Linea | Cambio |
|---|---|---|
| 1 | `subscribers.service.ts:295` | `.orderBy('s.createdAt', 'DESC').addOrderBy('s.id', 'DESC')` |
| 2 | `tickets.service.ts:310` | `.orderBy('st.created_at', 'DESC').addOrderBy('st.id', 'DESC')` |
| 3 | `visit-requests.service.ts:177-179` | Anadir `.addOrderBy('vr.id', 'ASC')` al final del triple `CASE/ASC/DESC` |
| 4 | `write-off.service.ts:260` | `.orderBy('writeOff.created_at', 'DESC').addOrderBy('writeOff.id', 'DESC')` |
| 5 | `supplier-profile.service.ts:190` | `.orderBy('sp.created_at', 'DESC').addOrderBy('sp.id', 'DESC')` |
| 6 | `asset-loan.service.ts:140` | `.orderBy('loan.installed_at', 'DESC').addOrderBy('loan.id', 'DESC')` |
| 7 | `party.service.ts:102` | Anadir `.orderBy('party.createdAt', 'DESC').addOrderBy('party.id', 'DESC')` (hoy sin ORDER BY) |

### Paso 4 — DEF-2: clamp `page * limit <= 10_000` universal

- `responsibilities.service.ts:146`: importar y usar `clampPage` del helper comun.
- `tenant.service.ts:264`: reemplazar el `offset > 10000` manual por `clampPage`.
- Verificar que los 11 endpoints que ya usan `clampPage` migren a la version unificada del helper comun.

### Paso 5 — DEF-3: Cursor keyset de auditoria

**Archivos a modificar:**

`audit-query.service.ts` y `platform-audit.service.ts`:

- Reemplazar `where['id'] = LessThan(cursor)` por un cursor compuesto codificado en base64url que contenga `{ createdAt: string, id: string }`.
- El WHERE equivalente:
  ```sql
  (created_at, id) < (:cursorDate, :cursorId)
  ```
  En TypeORM:
  ```typescript
  new Brackets((qb) => {
    qb.where('audit.created_at < :cursorDate', { cursorDate })
      .orWhere('audit.created_at = :cursorDate AND audit.id < :cursorId', { cursorDate, cursorId });
  })
  ```
- El `nextCursor` se codifica con el `createdAt` e `id` del ultimo registro de la pagina.

### Paso 6 — DEF-4: Bajar SLA y expediente a SQL

**`tickets.service.ts:318-325`:**

- Reemplazar el `.map()` con `deriveBreachStatus` en memoria por una expresion SQL via `.addSelect()`:
  ```typescript
  .addSelect(`
    CASE
      WHEN st.resolved_at IS NOT NULL AND st.resolved_at <= st.sla_due_at THEN 'WITHIN_SLA'
      WHEN st.resolved_at IS NOT NULL AND st.resolved_at > st.sla_due_at THEN 'BREACHED'
      WHEN st.sla_due_at IS NOT NULL AND st.sla_due_at < NOW() THEN 'BREACHED'
      WHEN st.sla_due_at IS NOT NULL THEN 'AT_RISK'
      ELSE 'NOT_APPLICABLE'
    END`, 'sla_breach_status')
  ```
- Si el filtro por `slaBreachStatus` existe, bajarlo al WHERE con un subquery o CTE (+ indice en Ola 2).
- El campo derivado se expone en el DTO como `@Expose()`.

**`expediente.service.ts:666-669`:**

- Si `documentNumber` esta presente, la paginacion en memoria con `slice` es inevitable porque el descifrado es en aplicacion. Documentarlo y acotar `limit` a 20 en ese caso.
- A corto plazo: verificar si el indice de busqueda de texto (si existe) puede reemplazar el filtro por documento.
- Si no, acotar y documentar.

### Paso 7 — `sortBy` + `sortDir` con lista blanca

- Cada endpoint que soporte orden declara un array `SORTABLE_FIELDS` (max 3-5 columnas) en su servicio.
- `sortBy` se valida contra `SORTABLE_FIELDS`; valor fuera de lista → 400.
- El ORDER BY se construye dinamicamente: `ORDER BY {sortBy} {sortDir}, id {sortDir}`.
- `meta.sortableFields` se puebla con `SORTABLE_FIELDS`, no con todas las columnas de la tabla.
- `meta.sort` refleja el orden efectivamente aplicado (`null` = orden por defecto del recurso).
- Los presets de `CATALOG_SORT_VALUES` (`CATEGORY_NAME`, `ACTIVE_NAME`, `RECENTLY_UPDATED`) se conservan en dual-emit y se marcan `@deprecated` en OpenAPI.
- Los endpoints keyset (modo cursor) devuelven `sortableFields: []` y `randomAccess: false`.

### Paso 8 — Capping de endpoints unbounded

Los 9 endpoints sin limite (ver inventario abajo) deben acotarse a maximo 100 filas:

| # | Archivo:Linea | Cambio |
|---|---|---|
| 1 | `work-orders.service.ts:155` | `.take(100)` |
| 2 | `schedule-events.service.ts:84` | `.take(100)` |
| 3 | `technician-availability.service.ts:17` | `.take(100)` |
| 4 | `inventory-item.service.ts:838` | `.take(100)` |
| 5 | `replenishment.service.ts:101` | `.take(100)` o endpoint de agregacion |
| 6 | `purchasing.service.ts:149` | `.take(100)` |
| 7 | `sla.service.ts:157` | `.take(100)` |
| 8 | `opportunities.service.ts:30` | `.take(100)` |
| 9 | `contracts.service.ts:155` | `.take(100)` |

Ademas: `potentials.service.ts:71`, `quotes.service.ts:43`, `subscribers.service.ts:516`, `access-control.service.ts:83,102`, `organization.service.ts:115`.

### Paso 9 — Dual-emit + OpenAPI

- Durante un sprint, cada endpoint emite tanto los campos planos (`page`, `total`, `limit`) como el `meta` completo. El frontend lee `meta`; los campos planos llevan `@deprecated` en OpenAPI.
- `@ApiQuery` de `page`, `sortBy`, `sortDir` en cada controller de listado.
- `ListMetaDto` como `@ApiResponse` reutilizable.

### Paso 10 — Retirar utilidades duplicadas

- Migrar todos los imports de `commercial-pagination.ts`, `inventory-pagination.ts`, `taxation-pagination.ts` a `apps/api/src/common/pagination/`.
- Verificar con `pnpm typecheck` que no quedan imports residuales.
- Borrar los tres archivos.

---

## 4. Restricciones no negociables

- No romper boundaries del Modulith. El helper comun vive en `apps/api/src/common/`, no en un modulo de dominio.
- No acceder a tablas de otro modulo directamente.
- No usar `any` en el contrato `ListMeta`.
- No hardcodear tenant/schema.
- Cero PII en logs.
- Las migraciones de indices son Ola 2; en Ola 1 solo se define el contrato `sortableFields` (vacio en todos los endpoints hasta que existan los indices).
- `randomAccess` se fija en `true` para los endpoints offset existentes y `false` para los keyset. Se ajusta en Ola 2 con medicion real.

---

## 5. Entregables tecnicos obligatorios

- `packages/shared/src/dto/pagination.dto.ts` con `ListMeta` y `ListResponse<T>`.
- `apps/api/src/common/pagination/` con `clampPage`, `buildPageMeta`, `cursor-codec`.
- 35 endpoints normalizados al contrato unico.
- DEF-1, DEF-2, DEF-3, DEF-4 cerrados y verificados.
- `sortBy`/`sortDir` aceptado por los 35 endpoints (lista blanca vacia donde no hay indices aun).
- 9+6 endpoints unbounded acotados.
- Tres archivos de utilidades duplicadas retirados.
- Tests unitarios para `clampPage`, `buildPageMeta`, `cursor-codec`.
- Tests de integracion para al menos 3 endpoints representativos (offset, keyset, con sortBy).
- OpenAPI actualizado con `ListMetaDto`, `@ApiQuery` de `page`/`sortBy`/`sortDir`, campos planos `@deprecated`.

---

## 6. Entregables documentales obligatorios

- Informe de fase en `docs/informes/INFORME-ADR065-OLA1-CONTRATO-API-v1.0.md`.
- Evidencia de calidad en `docs/quality/CHECKLIST-ADR065-OLA1-v1.0.md`.
- OpenAPI actualizado.

---

## 7. Criterios de aceptacion

- [ ] `grep -r "commercial-pagination\|inventory-pagination\|taxation-pagination" apps/api/src/` no devuelve resultados.
- [ ] `pnpm typecheck` verde en `@iwana/api` y `@iwana/shared`.
- [ ] `pnpm --filter @iwana/api test` verde.
- [ ] Los 7 endpoints de DEF-1 tienen `.addOrderBy('id', 'DESC')`.
- [ ] Los 35 endpoints usan `clampPage` del helper comun.
- [ ] `GET /audit?cursor=XXX` no salta ni repite registros (DEF-3).
- [ ] `GET /tickets?slaBreachStatus=BREACHED` devuelve resultados correctos con paginacion (DEF-4).
- [ ] `GET /work-orders` no devuelve mas de 100 filas.
- [ ] OpenAPI muestra `meta` como propiedad de toda respuesta de listado.

---

## 8. Criterio de stop/go

**Detenerse inmediatamente si:**
- El cambio de envelope rompe el frontend de forma que no se puede dual-emitir (campos planos + `meta` a la vez).
- DEF-3 no se puede arreglar sin cambiar el contrato de `audit_logs` (requiere decision de arquitectura).
- DEF-4 en assurance requiere un indice que no existe y el rendimiento degrada por debajo del p95 actual.

**Documentar causa en:** `docs/informes/INFORME-ADR065-OLA1-CONTRATO-API-v1.0.md`.

**Escalar a:** AI-EM-ARCH.

---

## 9. Criterio de salida de la fase

- Backend validado: `pnpm --filter @iwana/api test` verde.
- Contrato validado: `pnpm typecheck` verde en `@iwana/shared` y `@iwana/api`.
- OpenAPI actualizado y sin errores de generacion.
- Tests de integracion cubriendo los 4 defectos cerrados.
- grep sin utilidades duplicadas.
- Informe y checklist archivados.
