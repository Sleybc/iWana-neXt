# INFORME-DEF2 — Revisión de seguridad: cota de `page` en endpoints de listado

**Fecha:** 2026-07-24  
**Autor:** AI-SR-FULL  
**Revisor destino:** AI-SEC-ENG  
**Severidad:** Media-Alta  
**Estado:** Listo para revisión  

---

## Antes/Después

### Antes (vulnerable)

Endpoints de listado con paginación por offset calculaban `.skip((page - 1) * limit)` sin acotar `page`. PostgreSQL producía y descartaba N filas con coste O(N). El pool de pgBouncer es compartido entre tenants; un `page` arbitrariamente grande en una cuenta autenticada podía degradar a todos los tenants.

Ejemplo de código vulnerable:
```typescript
// tasks.service.ts (antes)
const page = validated.page ?? DEFAULT_PAGE;
const limit = validated.limit ?? DEFAULT_LIMIT;
qb.skip((page - 1) * limit).take(limit); // sin cota
```

### Después (corregido)

Helper compartido `clampPage(page, limit, maxOffset = 10_000)` que:
- Valida `page * limit <= 10_000` antes de cualquier acceso a DB
- Lanza `BadRequestException` (400) con mensaje en español genérico si excede
- Valida también `page >= 1`, `limit >= 1`, valores finitos

```typescript
// tasks.service.ts (después)
const { page, limit } = clampPage(
  validated.page ?? DEFAULT_PAGE,
  validated.limit ?? DEFAULT_LIMIT,
);
qb.skip((page - 1) * limit).take(limit);
```

---

## Alcance del barrido

Se revisaron **todos** los `skip(` y `(page - 1) * limit` en `apps/api/src/modules/` (16 ocurrencias en producción, 2 en tests). Se aplicó la cota en **14 endpoints de producción**:

| Módulo | Archivo | Línea | Método afectado |
|---|---|---|---|
| tasks | services/tasks.service.ts | 260 | `list()` |
| inventory | services/write-off.service.ts | 296 | `list()` |
| wfm | services/visit-requests.service.ts | 180 | `listVisitRequests()` |
| crm | subscribers/subscribers.service.ts | 296 | `findAll()` |
| crm | expedientes/expediente.service.ts | 645 | `findAll()` |
| crm | expedientes/expediente.service.ts | 1104 | `findContactAttempts()` |
| parties | services/party.service.ts | 102 | `findAll()` |
| parties | adapters/party-read.adapter.ts | 83 | `searchByRole()` |
| inventory | services/supplier-profile.service.ts | 194 | `list()` |
| inventory | services/stock-movement-query.service.ts | 118 | `list()` |
| inventory | services/serialized-asset.service.ts | 255 | `listUsefulLifeAlerts()` |
| inventory | services/asset-loan.service.ts | 144 | `list()` |
| inventory | services/asset-lifecycle.service.ts | 55 | `listPaginatedForAsset()` |
| assurance | services/tickets.service.ts | 319 | `list()` (in-memory slice) |
| tenant | tenant.service.ts | 277 | `findAll()` (offset directo) |

**DTOs corregidos:**
- `assurance/dto/index.ts` — `ListTicketsQueryDto.page`: agregados `@Type(() => Number)`, `@IsInt()`, `@Min(1)`
- `assurance/dto/index.ts` — `ListTicketsQueryDto.limit`: agregados `@Type(() => Number)`, `@IsInt()`, `@Min(1)`, `@Max(100)`

**No se modificó:** contrato de respuesta, envelopes, tipos de retorno, ni comportamiento para entradas válidas.

---

## Helper

Ubicación: `apps/api/src/common/pagination/clamp-page.ts`

- 17 tests unitarios (happy path, edge cases, page=0, negativa, NaN, Infinity, límite exacto 10_000, page*limit > 10_000)
- Convergerá con ADR-065 en la Ola 1 (paginación unificada)

---

## Riesgos residuales

1. **In-memory de assurance**: `assurance/services/tickets.service.ts` carga TODOS los tickets en memoria para derivar SLA y luego corta con `slice()`. La cota de `page*limit <= 10_000` mitiga el slicing, pero no el fetch completo a DB (sin límite). Reportar a la Ola 1 de ADR-065 para paginación server-side.

2. **`tenant.service.ts`**: usa `offset` directo (sin multiplicar por `page`). Se agregó clamp inline `if (offset > 10_000)` que es equivalente desde el punto de vista de coste DB.

3. **Cursor-based endpoints**: endpoints que ya usan `inventoryListPaginationZod` o `CommercialListQueryDto` (cursor-based) no se modificaron — ya están acotados por diseño.

---

## Veredicto

- ✅ Ningún `skip()` de producción sin clamp previo
- ✅ Helper compartido (no copias por módulo)
- ✅ Mensajes de error en español, sin detalles internos
- ✅ Sin cambio de contrato de respuesta
- ✅ 2220 tests pasan, typecheck verde, lint API verde
- ⚠️ Pendiente: migrar assurance list a paginación server-side (Ola 1 ADR-065)
