# PROMPT — MOD00 Acceso — Hotfix lockout plantillas V1 → V2

**Version:** 1.0
**Fecha:** 2026-08-29
**Agente destinatario:** AI-SR-FULL
**Autor del prompt:** AI-EM-ARCH (orquestador)
**Modo:** Ejecucion por fase (hotfix)
**Plantilla:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` (en revision)
**Informe vivo:** `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` v1.80

---

## 1. Objetivo exacto

Cerrar el lockout **PARCIAL** verificado: un no-ADMIN cuya unica asignacion activa es una plantilla V1 (`Monitoreo operativo`, `Soporte inicial`, `Tecnico de campo`, `Contratista`, `Auditor`) queda con **0** permisos de perfil cuando `ensureSystemRoleTemplatesSeeded` las desactiva sin remap.

Resultado: esas asignaciones pasan a la plantilla V2 canonica del mismo `baseRoleConstraint` **antes** de desactivar la V1; cache invalidada; test obligatorio en verde.

## 2. Artefactos de entrada (abrirlos)

- ADR-083 D4 (Aprobado)
- PRD-MOD00 v1.7 §4.3.4 RF-ACC-16
- Informe v1.80 — seccion «Lockout V1»
- `apps/api/src/modules/access-control/access-control.service.ts` (`ensureSystemRoleTemplatesSeeded`, `legacyV1Names`)
- `apps/api/src/modules/access-control/services/effective-permissions.service.ts` (filtro `AccessProfile.isActive: true`)
- `packages/database/src/migrations/tenant/119_seed_mod00_access_v2_convergencia_rbac.ts`
- `packages/database/src/migrations/tenant/runner.ts` (siguiente numero: **120**)

## 3. Contratos congelados

- Sin endpoints nuevos. Sin edicion in-place de `isSystem` V2.
- Canon V2 de 9 plantillas intacto. G1(1): no renombrar por `baseRoleConstraint`.
- Down reversible: solo lo que esta migracion/seed cree (asignaciones V2 insertadas por el remap, reactivar V1 si el down lo exige con procedencia).
- Multi-tenant: `SET LOCAL search_path` en runtime; migracion via runner por schema.

## 4. Alcance

### 4.1 Seed (`ensureSystemRoleTemplatesSeeded`)

Antes de `legacy.isActive = false`:

1. Resolver V1 por los 5 nombres, `isSystem=true`, **con o sin** `isActive` (si ya se desactivaron, igual hay que remapear asignaciones vivas).
2. Resolver V2 canonica del mismo `baseRoleConstraint` (nombres de `MOD00_ACCESS_V2_SYSTEM_ROLE_TEMPLATES`).
3. `INSERT…SELECT` de `user_access_profiles` activas V1 → id V2. Respetar `uq_user_access_profiles_active` / `ON CONFLICT DO NOTHING`.
4. Desactivar asignaciones V1 (`is_active=false` + `valid_to` si el modelo lo tiene).
5. Recien entonces `legacy.isActive = false`.
6. Invalidar cache: `invalidateByProfile` de V1 y de V2 (o por los `userId` afectados). Hoy el seed **no** invalida.

Idempotente: segunda pasada no duplica asignaciones ni reactiva V1.

### 4.2 Migracion tenant 120

Misma logica set-based para tenants que ya pasaron 119 y/o `listProfiles` (V1 ya `isActive=false` con asignaciones huerfanas). No esperar a que un ADMIN abra Acceso.

- Up: remap + desactivar V1 + provenance para down.
- Down: revertir solo lo creado (quitar asignaciones V2 de provenance; restaurar asignaciones V1 y `isActive` de esas 5 filas si esta migracion las toco).
- Registrar en `runner.ts`. `pnpm --filter @iwana/db build` antes de migrar.

### 4.3 Tests (obligatorios)

1. TECHNICIAN con asignacion activa a `Tecnico de campo` (V1, `isSystem`) → tras `listProfiles()` (seed) efectivos ⊇ matriz V2 TECHNICIAN, **no** `[]`.
2. Mismo caso con V1 **ya** `isActive=false` y asignacion activa → 120 o seed curan; efectivos no vacios.
3. ADMIN sin cambio de baseline.
4. Usuario con personalizado activo **y** V1: no pierde el personalizado; no duplica de forma que rompa el unique.
5. Idempotencia seed + 120.
6. Invalidacion de cache llamada en el remap.

## 5. Restricciones

- Sin frontend. Sin PII. Sin `any`. Sin `synchronize: true`.
- No desactivar V1 «mientras tenga asignaciones» como unica medida: la V1 no trae claves V2.
- No reabrir edicion in-place de plantillas V2.

## 6. Stop / Go

- **STOP** si el unique parcial impide el INSERT set-based, si el down no puede ser exacto, o si hay que tocar contrato de API.
- **GO** cuando tests de §4.3 verdes, `pnpm --filter @iwana/api` typecheck del modulo, migracion registrada.

## 7. Entregables

Codigo + tests + resumen por archivo. Actualizar **el informe vivo** (v1.80+) — no crear informe nuevo. No firmar G6.
