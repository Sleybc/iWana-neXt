# [SEC-REVIEW] MOD00 — Convergencia RBAC granular Fase 2 (doble guard)

**Version:** 1.0  
**Fecha:** 2026-08-29  
**Autor:** AI-SEC-ENG (solo lectura)  
**Registro:** AI-EM-ARCH — condición 8 de G6 (informe vivo MOD00 v1.80)  
**Alcance:** Superficie de autorización Fase 2 — cableado `JwtAuthGuard → RolesGuard → PermissionsGuard` real en módulos operativos; invalidación de cache Users; remap V1→V2 (deuda P2/P3 del hotfix).  
**Plan:** `docs/plans/2026-08-28-mod00-convergencia-rbac-granular.md` Fase 2  
**Normativa:** PRD-MOD00 v1.7 §4.3.4 · HLD-MOD00 v1.7 §6.6 · ADR-083 D2/D3/D5/D7 · baseline OWASP ASVS L2  
**Antecedente:** `docs/security/SECURITY-REVIEW-MOD00-HOTFIX-LOCKOUT-V1-v1.0.md` (P2/P3 del hotfix re-verificados)

**Veredicto:** **APROBADO CON DEUDA** — P0 0 · P1 1. No hay bypass de autorización ni acceso cross-tenant. El P1 es fail-closed (lockout operativo), no elevación. **No bloquea merge de código.** **No firma G6.**

Este artefacto cubre la **superficie Fase 2** (condición 8 de v1.80). No sustituye Playwright, cobertura ≥80 % ni G6.5/G7.

---

## 1. Superficie

| Componente | Ruta | Doble guard |
| --- | --- | --- |
| Guard real | `apps/api/src/modules/access-control/guards/permissions.guard.ts` | `canActivate` consulta `EffectivePermissionsService`; no es stub |
| CRM Suscriptores | `crm/subscribers/subscribers.controller.ts` | GET: `crm.subscribers.read` + TECHNICIAN†/AUDITOR† · CUD: `crm.subscribers.manage` |
| CRM Expedientes | `crm/expedientes/expedientes.controller.ts` | GET: `crm.expedientes.read` + AUDITOR† · CUD: `crm.expedientes.manage` |
| 8 subrecursos | opportunities, prospects, potentials, quotes, contacts, contracts, reviews, habeas-data | Mismo par read/manage de expedientes |
| D7 tributario | `subscriber-tax.controller.ts` | `@Roles`-only (sin `PermissionsGuard`) — intocable este ciclo |
| Assurance | `assurance/assurance.controller.ts` | GET: `assurance.tickets.read` + AUDITOR† · CUD: `assurance.tickets.manage` |
| Inventario | `inventory/inventory.controller.ts` | GET: `inventory.stock.read` + TECHNICIAN†/AUDITOR† · CUD: `inventory.stock.manage` |
| Compras | `inventory/purchasing.controller.ts` | GET: `inventory.purchasing.read` + AUDITOR† · CUD: `inventory.purchasing.manage` |
| Comercial | catalog, bundle, promotion, compatibility, picker-search, dashboard | `commercial.catalog.read/manage`; subconjuntos OFFER/PRICE/COMPAT conservados vía `@Roles` |
| OpenAPI catálogo | `GET /access-control/permissions` | Summary declara `MOD00_ACCESS_V2` |
| Cache Users | `UsersService.update` / `remove` | `invalidateUserPermissions` al cambiar `role`/`status` y al borrar |
| Remap runtime | `remapLegacyV1AssignmentsToCanonicalV2` | No remapea si V2 inactiva; audit de lote sin PII |
| Migraciones | tenant 120 + 121 | `v2.is_active = true`; down por `assignment_id` |

---

## 2. Controles

| Control | Resultado |
| --- | --- |
| Tenant isolation | OK — `TenantContext` + `SET LOCAL search_path`; 120/121 validan schema `^tenant_[a-z][a-z0-9_]{0,54}$` |
| Pipeline por request | OK — JWT → Roles → Permissions → Zod en boundaries existentes |
| `PermissionsGuard` real | OK — niega con `FORBIDDEN` si falta permiso |
| Ampliaciones D3 | OK — TECHNICIAN/AUDITOR solo en lectura con clave ASSIGNABLE |
| D7 intactas | OK — `subscriber-tax` y coverage-checks sin `@Permissions` |
| Techo estructural commercial | OK — subconjuntos OFFER/PRICE/COMPAT vía `@Roles` |
| Cache D5 | OK — invalidación en mutaciones de perfil y en Users `role`/`status`/`remove` |
| Remap V1→V2 | OK — no entra al lote si `!v2.isActive`; SQL exige `v2.is_active = true`; audit de lote sin emails ni `userIds` |
| Down 120/121 | OK — DELETE por `assignment_id` (121 endurece provenance de 120 ya aplicada) |
| PII / Ley 1581 | OK en el diff de autorización |

---

## 3. Hallazgos

### Crítica (P0)

Ninguno.

### Alta (P1)

1. **Lockout de TECHNICIAN/CONTRACTOR en mutaciones de tickets.** `@Roles` incluye esas categorías en escritura de assurance, pero `@Permissions(ASSURANCE_TICKETS_MANAGE)` no es ASSIGNABLE a ellas en la matriz V2. RolesGuard deja pasar y PermissionsGuard responde 403. Fail-closed; no es elevación. Corrección: clave de ejecución de campo ASSIGNABLE **o** alinear `@Roles` de escritura con la matriz (decisión de producto; no conceder `manage` por la puerta de atrás).

### Media (P2)

2. `GET /crm/subscribers/search` sin audit `LIST_ACCESS` (ADR-067).
3. `responsibilities.controller.ts` y `attributions.controller.ts` siguen `@Roles`-only bajo el prefijo CRM.
4. `siteId` en query/body activa perfiles scoped sin bindear el recurso (ADR-083 A3).

### Baja (P3)

5. No existe invariante inverso «todo handler cableado tiene `@Permissions` salvo allowlist D7».
6. Residual de minimización PII en search/360 de suscriptores.
7. `invalidateByProfiles` traga errores Redis (stale ≤ TTL 60 s; log `ACCESS_CACHE_FANOUT_FAILED`).
8. Specs HTTP antiguas de commercial/inventory aún stubbean `PermissionsGuard`; las `*.fase2.http.spec.ts` usan el guard real.

---

## 4. Checklist pre-producción (Fase 2)

- [x] Doble guard en la tabla HLD §6.6 (PermissionsGuard real)
- [x] D7: subscriber-tax y coverage-checks sin `@Permissions`
- [x] Tenant isolation
- [x] Sin PII en audit del remap
- [x] Invalidación de cache en cambio `role`/`status`
- [x] OpenAPI: `GET /access-control/permissions` declara `MOD00_ACCESS_V2`
- [x] Tests HTTP Fase 2 con guard real
- [ ] P1 assurance escritura vs matriz
- [ ] Playwright piloto y cobertura ≥80 % (G6, otras condiciones)

---

## 5. Stop / go

- **GO de AppSec para la superficie Fase 2 (condición 8):** APROBADO CON DEUDA. Sin P0. P1 no es explotable (fail-closed).
- **No GO de G6** del plan de convergencia.
- **No GO de producción** hasta resolver P1 o aceptación formal CTO del recorte.
- Deuda P2/P3 a backlog. Este rol no implementa código.
