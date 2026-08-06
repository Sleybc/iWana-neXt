# INFORME — SEC-P1: hashes con clave y cierre de fuga PII al audit trail

**Código:** SEC-P1  
**Versión:** 1.0  
**Fecha:** 2026-08-05  
**Agente:** AI-SR-FULL  
**Orquestador:** AI-EM-ARCH  
**Prompt:** [PROMPT-SEC-P1-HASH-HMAC-Y-PII-AUDITORIA-v1.0.md](../prompts/PROMPT-SEC-P1-HASH-HMAC-Y-PII-AUDITORIA-v1.0.md)  
**ADRs:** ADR-078 (propuesto) ([enlace](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md)) D3/P1 · [ADR-058](../adrs/ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md)

---

## Estado de hallazgos

| ID | Hallazgo | Estado |
| --- | --- | --- |
| **S-1** | Hashes SHA-256 sin clave (documento/email/teléfono enumerables) | **Cerrado** — HMAC-SHA-256 con `PII_HASH_KEY` + expand/contract `*_hmac` |
| **S-2** | PII en `audit_logs` (ruta que evade interceptor + hueco lat/long) | **Cerrado** — sanitización en `AuditService.log()` + denylist ampliada + migración 110 |

---

## Cierre hallazgos AI-SEC-ENG (GO_WITH_CONCERNS → G5)

| ID | Severidad | Estado | Evidencia |
| --- | --- | --- | --- |
| **H-1** | Alta | **Cerrado** | `scripts/dev-reset-platform-admin.mjs` y `dev-verify-platform-login.mjs`: HMAC + `PII_HASH_KEY`, SQL/`prefix` sobre `email_hmac` |
| **H-2** | Media | **Cerrado** | `PlatformAuditService.log()` aplica `sanitizeAuditPayload`; test H-2 en `platform-audit.service.spec.ts` |
| **H-3** | Media | **Cerrado** | Emails vía `hashEmail` (toLowerCase+trim) en subscribers; worker `hashEmail` normaliza; update refresca `emailHash`/`phoneHash` |
| **H-4** | Deseable | **Cerrado** | Unit SQL 075 + **integration Postgres** `075_enforce_audit_immutability.integration.spec.ts` (4/4 PASS) |
| **H-5** | Deseable | **Cerrado** | Asserts description/title/sector/municipality + lat/long numéricos (sanitize + AuditService) |
| **H-6** | Deseable | **Cerrado** | `sourceDetail` / `source_detail` en denylist API + SQL shared (trivial) |
| **H-7** | Deseable | **Cerrado** | Comentarios SHA-256 obsoletos actualizados a HMAC en users/subscribers |

---

## E0 flip (evidencia)

1. **E0 (AI-SR-QA):** `hash-document.enumerability.spec.ts` **PASÓ** demostrando recuperación de cédula sintética por enumeración SHA-256.
2. **Tras E1:** la misma enumeración contra digest HMAC **ya no** recupera vía SHA-256 crudo.
3. **Regresión permanente:** el spec quedó **invertido** a assert negativo (`recoveredViaRawSha256 === undefined`) + comprobación de que con `PII_HASH_KEY` la búsqueda legítima sigue siendo determinista.

Cadena documentada en el propio describe del spec: *“E0 pasó → falló tras HMAC → invertido a assert negativo”*.

---

## Entregables por etapa

| # | Resultado |
| --- | --- |
| **E1** | `PII_HASH_KEY` (Joi fail-fast, entropía nula rechazada) + HMAC en `hash-document.util`, `hash-email.util`, `subscribers.service`, backfill util; Joi en `app.config.ts` |
| **E2** | Migración tenant **108** — columnas `*_hmac`, índices, backfill por lotes |
| **E3** | Migración tenant **109** — DROP columnas SHA-256; entidades mapean a `*_hmac`. Pública **021** para `platform_users` |
| **E4** | `sanitizeAuditPayload` en `AuditService.log()` **y** `PlatformAuditService.log()` (H-2) |
| **E5** | Denylist: lat/long, description, title, sector, municipality, **sourceDetail** (H-6) |
| **E6** | Migración tenant **110** — redacción retroactiva con `SET LOCAL iwana.audit_maintenance = 'on'`; `down` irreversible |

---

## Migraciones

| # | Path | Notas |
| --- | --- | --- |
| 108 | `packages/database/src/migrations/tenant/108_add_pii_hmac_columns.ts` | Expand + backfill |
| 109 | `packages/database/src/migrations/tenant/109_drop_pii_sha256_hash_columns.ts` | Contract; `down` exige `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN` (registrada en `revert.ts`) |
| 110 | `packages/database/src/migrations/tenant/110_redact_audit_pii_coords_and_free_text.ts` | Redacción; down no restaura |
| 021 | `packages/database/src/migrations/public/021_platform_users_email_hmac.ts` | Paridad platform (email cifrado → HMAC) |

Tras 109/021: **no quedan columnas `*_hash` SHA-256** de búsqueda PII; el runtime usa `*_hmac`.

---

## Nota de rotación D-D

Rotar `PII_HASH_KEY` **exige backfill completo** de todas las columnas `*_hmac`. No hay versión de clave en este corte. Documentado en `docs/runbooks/RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md` §6bis. Independiente de `MFA_ENCRYPTION_KEY` (D-A).

---

## Criterio 6 — redacción (conteos, nunca valores)

Tras aplicar 110 en cada schema tenant, verificar solo conteos:

```sql
-- Debe ser 0: claves sensibles aún con valor distinto de [REDACTADO]
SELECT COUNT(*) AS pending
FROM audit_logs
WHERE (new_value ? 'latitude' AND new_value->>'latitude' IS DISTINCT FROM '[REDACTADO]')
   OR (new_value ? 'longitude' AND new_value->>'longitude' IS DISTINCT FROM '[REDACTADO]')
   OR (new_value ? 'fullName' AND new_value->>'fullName' IS DISTINCT FROM '[REDACTADO]');
```

(No volcar `new_value` / `old_value` en logs ni informes.)

---

## Ops

1. Generar y fijar `PII_HASH_KEY` (`openssl rand -hex 32`) en secret store / `.env` local no versionado.
2. `pnpm db:migrate:all` (public 021 + tenant 108→110).
3. Reiniciar API/worker — sin `PII_HASH_KEY` el bootstrap Joi falla con mensaje explícito.
4. Ejecutar SQL de criterio 6 (conteos, nunca valores) sobre cada schema tenant — evidencia ops para §5.6.

---

## Consolidación AI-EM-ARCH (G5)

**Modo:** Architect + Orchestrator + EM  
**Fecha:** 2026-08-05  

| Agente | Rol | Resultado |
| --- | --- | --- |
| [AI-SR-QA](fdc92bee-c7d9-4fcc-814e-8a4a8911b086) | E0 red | DONE |
| [AI-SR-FULL](69b5775d-9e87-47a4-b7f2-68b6a95480ea) | E1–E6 + H-1..H-7 | DONE |
| [AI-SR-QA](d1e07b9f-717e-42d6-9e22-362b7a8d6749) | E7 + re-verificación | GO_WITH_CONCERNS → mitigado |
| [AI-SEC-ENG](bd0bcfd9-a27d-49e5-a755-90b6872715b4) → [re-review](43e011ff-e64d-4b4d-b77d-11818fad7e2e) | Auditor hallazgo | S-1/S-2 **CERRADOS**; GO_WITH_CONCERNS (residuales no bloqueantes) |

| Gate | Estado | Nota |
| --- | --- | --- |
| **G5** | **GO** | S-1/S-2 cerrados; H-1..H-7 cerrados; contrato de clave y sanitización en sinks productivos |
| **G6** | Pendiente evidencia ops | Migraciones aplicadas + SQL criterio 6 en DB viva |
| **G6.5 / G7** | Fuera de alcance | ADR-069 / dominio productivo |

**Impacto (tenant / seguridad / escala / regulación):** alto positivo en seguridad (Ley 1581 / Habeas Data — mitigación de enumeración offline y fuga a audit trail). Multi-tenant intacto. Escala: expand/contract correcto para N tenants. Regulación: no inventada; mitigantes técnicos del expediente ADR-078 (propuesto).

**Deuda residual D1–D4 + H-4 Postgres:** **Cerrada** (véase «Cierre deuda residual»).

**Convive en working tree:** bootstrap P0 (Vía B) + informe bootstrap — sin commit en esta sesión.

**Pendiente humano:** commit(s); fijar `PII_HASH_KEY`; `pnpm db:migrate:all`; evidencia §5.6.

---

## Cierre deuda residual

**Fecha:** 2026-08-05  
**Agente:** AI-SR-FULL  
**Alcance:** anti-drift HMAC email + limpieza post-109 de `email_hash` en runtime/scripts/comentarios.

| ID | Acción | Evidencia |
| --- | --- | --- |
| **D1** | Utilidad única HMAC email | Fuente TS: `packages/database/src/migrations/shared/pii-hmac.util.ts` exportada desde `@iwana/db` (`hmacEmail`, `loadPiiHashKeyFromEnv`, …). Wrapper ESM: `scripts/lib/pii-hmac.mjs`. `dev-reset-platform-admin.mjs` / `dev-verify-platform-login.mjs` importan el wrapper (**cero** `createHmac` local). Worker `TenantSeedService` usa `@iwana/db` (sin método privado). API `hash-email.util.ts` intacta; comentario de alineación. |
| **D2** | Quitar fallback `email_hash` | `users.service.ts` `mapUserRow`: solo `email_hmac` / `emailHash`. Comentario soft-delete → `email_hmac`. Spec de filas crudas → `email_hmac`. |
| **D3** | Scripts/probes mod04 | `mod04-h05-search-bench.{sql,mjs}`, `mod04-ola-c-083-reversibility.sql`, `mod04-ola-c-convergence-probe.sql`: columna/constraint `email_hmac` / `uq_users_email_hmac`; placeholders 64-hex sintéticos (`lpad(to_hex(i),64,'0')` / `padStart(64,'0')`). Grep `scripts/`: sin `email_hash` operativo (solo mención histórica en header de `dev-reset`). |
| **D4** | Comentario auth | `auth.service.ts` login: «HMAC-SHA-256 del email en minusculas + trim». |
| **H-4+** | Trigger en Postgres vivo | [AI-SR-QA](4450ceb4-8213-483e-b485-3a381df5e564): `075_enforce_audit_immutability.integration.spec.ts` — UPDATE/DELETE sin escotilla → `42501`; con `SET LOCAL iwana.audit_maintenance = 'on'` → UPDATE de redacción permitido. **4/4 PASS** contra PostgreSQL (`IWANA_DB_INTEGRATION_AVAILABLE`). |

### Consolidación AI-EM-ARCH — cierre deuda

**Modo:** EM + Orchestrator · **Fecha:** 2026-08-05  
**Agentes:** [AI-SR-FULL](ab9a0945-698e-4db9-a12a-ca3ac4dad625) (D1–D4) · [AI-SR-QA](4450ceb4-8213-483e-b485-3a381df5e564) (H-4+)

| Ítem | Estado |
| --- | --- |
| Drift HMAC scripts/worker | **Cerrado** — `@iwana/db` + `scripts/lib/pii-hmac.mjs` |
| Fallback `email_hash` | **Cerrado** |
| Probes mod04 `email_hash` | **Cerrado** |
| Comentarios SHA-256 | **Cerrado** |
| Trigger inmutabilidad runtime | **Cerrado** (integration Postgres) |

**Veredicto deuda:** no queda deuda SEC-P1 declarada abierta en este corte. Ops (§5.6 migraciones + conteos) sigue pendiente humano.

**Fuera de alcance (sin tocar):** bootstrap WIP (`ExecutionOrderSchedulingModule`, `app.bootstrap.spec.ts`); sin commit; sin PII real.
