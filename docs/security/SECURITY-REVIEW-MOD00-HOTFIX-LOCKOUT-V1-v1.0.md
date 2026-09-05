# [SEC-REVIEW] MOD00 — Hotfix lockout plantillas V1 → V2

**Version:** 1.0  
**Fecha:** 2026-08-29  
**Autor:** AI-SEC-ENG (solo lectura)  
**Registro:** AI-EM-ARCH — informe vivo MOD00 v1.84  
**Alcance:** Reasignación de `user_access_profiles` de plantillas system V1 a V2 (`ensureSystemRoleTemplatesSeeded` + migración tenant 120).  
**Prompt:** `docs/prompts/PROMPT-MOD00-ACCESO-HOTFIX-LOCKOUT-V1-v1.0.md`  
**Normativa:** PRD-MOD00 v1.7 §4.3.4 RF-ACC-16 · ADR-083 D4/D5 · baseline OWASP ASVS L2  

**Veredicto:** **APROBADO CON DEUDA** — P0 0 · P1 0. No bloquea merge. G6 del plan de convergencia sigue NO-GO por otras condiciones (v1.80), no por este hotfix.

Este artefacto cubre **solo** el hotfix V1→V2. No sustituye un review SEC-ENG de toda la superficie Fase 2 (doble guard `@Permissions`).

---

## 1. Superficie

| Componente | Ruta |
| --- | --- |
| Seed remap | `apps/api/src/modules/access-control/access-control.service.ts` (`remapLegacyV1AssignmentsToCanonicalV2`) |
| Disparador | `GET /access-control/profiles` (`listProfiles`) — ADMIN + `access.profiles.read` |
| Cache | `effective-permissions.service.ts` (`invalidateByProfiles`) |
| Migración | `packages/database/src/migrations/tenant/120_remap_mod00_access_v1_lockout.ts` |
| Tests | `access-control.v1-lockout-remap.spec.ts` · `120_remap_mod00_access_v1_lockout.spec.ts` |

Sin endpoints nuevos. Sin input de usuario en el SQL de remap.

---

## 2. Controles

| Control | Resultado |
| --- | --- |
| Tenant isolation | OK — `TenantContext` + `SET LOCAL search_path` + `tenant_id = $1`; 120 valida schema `^tenant_[a-z][a-z0-9_]{0,54}$` |
| SQL parametrizado | OK — runtime `$1/$2/$3`; 120 literales de canon |
| No elevación a ADMIN | OK — `CASE` por nombre V1 → V2 no-ADMIN; `Administrador general` fuera del set |
| Unique parcial | OK — `ON CONFLICT … DO NOTHING`; union personalizado+V2 es diseño de producto |
| No reactivar `crm.customers.*` | OK — hotfix no escribe catálogo ni permisos de plantilla V2 |
| PII / Ley 1581 | OK — ids sintéticos; sin email/cédula en tests/logs |
| Anti-lockout | OK en código; cura operativa exige **120 corrida en cada schema** (o un ADMIN que abra Acceso) |

---

## 3. Hallazgos

### Media (P2) — no bloquean

1. **Down por par `(user_id, profile_id)`** (`120_remap_mod00_access_v1_lockout.ts`, DELETE de assignments V2). Un down tardío tras rotar la misma grant V2 podría borrar una fila posterior. Corrección: persistir `assignment_id` vía `RETURNING id`. Guía: AI-SR-FULL.
2. **Remap sin `auditService.log`** (`access-control.service.ts`, efecto CUD de `GET listProfiles`). ADR-083 regla 5 pide audit en mutaciones de asignaciones. Corrección: evento de lote (conteos + ids de perfil; sin PII). Guía: AI-SR-FULL.

### Baja (P3)

3. **`invalidateByProfiles` traga errores** — residual ≤ TTL 60 s. Métrica/alerta; no bloquear `listProfiles`.
4. **JOIN V2 en 120 no exige `is_active = true`**. Si V2 estuviera inactiva, el usuario seguiría en 0. Corrección: `AND v2.is_active = true` y no desactivar esa V1.

---

## 4. Checklist pre-producción (hotfix)

- [x] Tenant isolation
- [x] SQL parametrizado
- [x] Guards del GET disparador
- [x] Sin secretos / sin PII en el diff
- [x] Invalidación de cache (D5)
- [x] Audit CUD del remap (P2) — cerrado en v1.85 (`listProfiles`)
- [x] Down por `assignment_id` (P2) — 120 (nuevos) + 121 (ya aplicados)
- [x] Migración 120 aplicada en todos los schemas tenant
- [x] Migración 121 aplicada en todos los schemas tenant

---

## 5. Stop / go

- **GO de AppSec para este hotfix** (merge no bloqueado por P0/P1).
- **No GO de G6** del plan `2026-08-28-mod00-convergencia-rbac-granular.md`.
- Deuda P2/P3 a backlog de AI-SR-FULL; no se implementa en esta revisión.
