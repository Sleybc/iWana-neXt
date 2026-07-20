# PROMPT — Limpieza profunda audit RLS (pre-prod)

**Versión:** 1.0  
**Estado:** Emitido por AI-EM-ARCH (Etapa 4)  
**Fecha:** 2026-07-20  
**Modo:** Architect + Orchestrator  
**Decisión:** Opción B — deep cleanup bootstrap + 014/075; eliminar 018/079  
**Referencias:** ADR-033 (audit) · SEC-04 least-privilege · `014`/`075`/`001`/`000` · INFORME consolidado EM-ARCH 2026-07-20

---

## Contexto

Pre-producción. La inmutabilidad de `platform_audit_logs` / `audit_logs` es **trigger** `reject_audit_mutation()`, no RLS. RLS `ENABLE` con políticas rotas o sin políticas rompe INSERT de `iwana_app` tras SEC-04. Migraciones repair **018/079** son deuda en greenfield; **079 no está registrada** en `tenant/runner.ts`.

## Alcance

### Incluye

1. Parchear y commitear `014`/`075` con `DISABLE ROW LEVEL SECURITY` (working tree).
2. Limpiar bootstrap `001`/`000`: **no** crear RLS/políticas rotas en audit.
3. **Eliminar** `018_disable_audit_rls_after_trigger.ts` y `079_disable_audit_rls_after_trigger.ts`.
4. Commitear `apply-least-privilege.sql` + runbooks DB (cinturón ops para brownfield).
5. Actualizar tests (`migration-000-initial-tenant-schema.spec.ts`).
6. Actualizar comentarios obsoletos en `audit.service.ts` y entidades audit (RLS ≠ garantía).
7. Evidencia: migrate greenfield + verify SEC-04 + smoke INSERT audit.

### Excluye

- Squash/renumeración agresiva de cadena (Opción C).
- Endurecer escotilla `iwana.audit_maintenance` (deuda P2).
- Nuevo gate CI INSERT audit (P2 — SR-QA/PLAT-OPS propone, no bloqueante merge).
- Cambios frontend (FE-PLATFORM: N/A).

## Restricciones

- No romper orden TypeORM public (timestamps de clase en 014+).
- Mantener cuerpo de `reject_audit_mutation()` sincronizado entre 014 y 075.
- `runner.ts` tenant: sin 079; conservar 080 Existencias.
- Migraciones con `down()` donde aplique.
- Sin PII en artefactos.

## Asignaciones (protocolo §3bis)

| Track | Agente | Entregable |
| --- | --- | --- |
| Migraciones + tests | AI-SR-FULL | Diff en `packages/database`, spec API tests |
| Runbooks + apply SQL | AI-PLAT-OPS | Diff runbooks + checklist ops |
| Review seguridad | AI-SEC-ENG | Informe G6 (bloqueantes/no-blockers) |
| Verificación | AI-SR-QA | Evidencia migrate + tests verdes |

## Pasos SR-FULL

1. Editar `001_create_public_schema.ts`: quitar bloque RLS audit (~126–137). Comentar que inmutabilidad llega en 014 vía trigger.
2. Editar `000_initial_tenant_schema.ts`: quitar RLS + política + REVOKE audit (~146–152). Actualizar header del archivo.
3. Consolidar `014`/`075`: mantener `DROP POLICY IF EXISTS` (upgrade legacy) + `DISABLE RLS` + trigger.
4. Borrar archivos `018` y `079`.
5. Verificar `runner.ts` (solo 080 post-078).
6. Actualizar `migration-000-initial-tenant-schema.spec.ts` (expectativas sin CREATE POLICY audit).
7. Actualizar comentarios en `audit.service.ts`, `audit-log.entity.ts`, `platform-audit-log.entity.ts`.
8. `pnpm --filter @iwana/db build && pnpm db:migrate:all` sobre volumen **reseteado**.
9. Ejecutar tests: `migration-000-initial-tenant-schema.spec.ts`, suite audit si aplica.

## Pasos PLAT-OPS

1. Commitear cambios en `scripts/db/apply-least-privilege.sql` y runbooks.
2. Documentar bulletin: post-merge → reset volumen dev **o** `bash scripts/db/apply-least-privilege.sh`.
3. Confirmar CI greenfield sin cambios YAML.

## Criterios de aceptación (G5/G6)

- [ ] Sin archivos 018/079 en repo.
- [ ] 001/000 no habilitan RLS en audit en installs nuevos.
- [ ] 014/075 incluyen DISABLE RLS idempotente.
- [ ] `relrowsecurity = false` en audit tras migrate greenfield.
- [ ] Trigger `trg_*_audit_logs_immutable` presente.
- [ ] `verify-app-cannot-drop-audit-trigger.sh` PASS.
- [ ] INSERT audit funciona con runtime `iwana_app` (smoke manual o script P2).
- [ ] Tests unitarios migración 000 actualizados y verdes.
- [ ] SEC-ENG: sin bloqueantes P0/P1 abiertos.

## Stop / Go

| Gate | Aprobador | Condición |
| --- | --- | --- |
| G3 | EM-ARCH | Factibilidad SR-FULL + PLAT-OPS + SEC-ENG consolidada ✅ |
| G4 | EM-ARCH | Este prompt emitido ✅ |
| G5 | EM-ARCH | Diff + tests + migrate greenfield |
| G6 | SEC-ENG + SR-QA | Informe hallazgos |
| G7 | EM-ARCH → CTO | Pre-prod cleanup; no requiere ADR nuevo (alinea diseño existente) |

## Rollback

- Revert del commit de cleanup.
- Reset volumen dev y re-migrate desde commit anterior.
- No reactivar RLS vacío en producción futura.
