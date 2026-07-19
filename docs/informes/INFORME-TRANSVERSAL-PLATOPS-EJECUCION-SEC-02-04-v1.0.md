# INFORME — Ejecución lab PLAT-OPS (SEC-04 + rotación SEC-02)

**Tipo:** INFORME  
**Módulo:** TRANSVERSAL — Plataforma / ops  
**Versión:** 1.2  
**Fecha:** 2026-07-19  
**Autor:** AI-PLAT-OPS  
**Go:** CTO ADR-058 + ops (2026-07-19) · Usuario: cerrar staging/prod + purge git  
**Ámbito:** lab/dev local = **staging surrogate**; prod on-prem `10.0.0.2:8080`; purge historial git ejecutado  

**Referencias:**  
[`RUNBOOK-DB-LEAST-PRIVILEGE-v1.0.md`](../runbooks/RUNBOOK-DB-LEAST-PRIVILEGE-v1.0.md) ·  
[`RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md`](../runbooks/RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md) ·  
[`INFORME-TRANSVERSAL-REMEDIACION-SEC-02-05-v1.0.md`](INFORME-TRANSVERSAL-REMEDIACION-SEC-02-05-v1.0.md) §4/§6 ·  
[`PLAN-MOD01-PRODUCCION-DEPLOYMENT-v1.0.md`](../archive/plans/PLAN-MOD01-PRODUCCION-DEPLOYMENT-v1.0.md)  

---

## 0. Veredicto ejecutivo (staging / prod / purge)

| Frente | Veredicto | Evidencia breve |
| --- | --- | --- |
| **Staging** (lab Docker endurecido = surrogate) | **GO / CERRADO** | SEC-04 verify re-PASS; rotación MFA lab ya GO (v1.1); opt-in estricto documentado sin romper `pnpm dev` |
| **Producción** (`http://10.0.0.2:8080`) | **NO-GO ejecución remota** | Health timeout 5 s → unreachable; sin SSH/credenciales en sesión; checklist operador §9 |
| **Purge git** | **GO** | `git filter-repo --path .env.development --invert-paths`; path log vacío; literales clave débil = 0; force-push ramas contaminadas |

---

## 1. Veredicto lab (histórico v1.1)

| Control | Resultado | Notas |
| --- | --- | --- |
| SEC-04 least-privilege apply | **OK** | `apply-least-privilege.sql` vía `docker exec` (contenedor `iwana_postgres_dev` healthy) |
| SEC-04 verify DROP TRIGGER | **PASS** (re-verificado 2026-07-19) | `iwana_app` → `42501` / must be owner; owner `platform_audit_logs` = `iwana_migrator` |
| Rotación MFA (pasos 0–7) | **GO lab completada** | CLI SR-FULL; dry-run limpio → apply → verify PASS → PREVIOUS retirado |
| Purge historial git | **GO** (v1.2) | Ver §8 |
| Staging | **CERRADO** (surrogate = lab) | Ver §5 |
| Prod on-prem | **NO-GO remoto** | Ver §9 |

**GO lab:** SEC-04 PASS + rotación MFA lab cerrada (criterio: dry-run limpio + apply + verify PASS + PREVIOUS retirado).

---

## 2. Evidencia SEC-04 (sin passwords)

**Fecha/hora lab:** 2026-07-19  
**Host DB:** contenedor Docker `iwana_postgres_dev` (`postgres:18-alpine`, puerto host 5433).

### 2.1 Apply

En Windows (PowerShell), equivalente al wrapper bash del runbook:

```powershell
Get-Content -Raw scripts/db/apply-least-privilege.sql |
  docker exec -i iwana_postgres_dev `
    psql -v ON_ERROR_STOP=1 -U iwana -d dbiw `
    -v app_pass="<lab-app-pass>" `
    -v migrator_pass="<lab-migrator-pass>"
```

Salida observada (sin secretos): grants + event trigger +  
`SEC-04 apply-least-privilege: OK (revisar ownership con verify script)`.

> Nota: `bash scripts/db/apply-least-privilege.sh` falló en este host (WSL sin `/bin/bash`). Usar `docker exec` + pipe PowerShell como arriba, o Git Bash si está instalado.

### 2.2 Verify — **PASS** (inicial + re-verify staging)

```powershell
Get-Content -Raw scripts/db/verify-app-cannot-drop-audit-trigger.sql |
  docker exec -i iwana_postgres_dev `
    psql -v ON_ERROR_STOP=1 -U iwana -d dbiw
```

Salida observada (ambas pasadas):

```text
NOTICE:  PASS: iwana_app no puede DROP TRIGGER (must be owner of relation platform_audit_logs ) [42501]
```

Comprobación de ownership (metadatos, sin secretos):

| Objeto | Owner / estado |
| --- | --- |
| `public.platform_audit_logs` | `iwana_migrator` |
| Rol `iwana_app` | LOGIN |
| Rol `iwana_migrator` | LOGIN |

**Re-verify staging (2026-07-19, pasada cierre):** contenedor `Up … (healthy)`; mismo NOTICE PASS; ownership sin cambio.

### 2.3 Trade-off `pnpm dev` (no forzado) — opt-in staging

Compose / `.env.example` siguen con **compat por defecto**: `DB_USER=iwana` (bootstrap).  
**No se fuerza** `iwana_app` en el default de compose: eso rompería `pnpm dev` en volúmenes legacy.

Modo SEC-04 estricto = **opt-in** en `.env` **no versionado** (staging/lab endurecido o prod):

```dotenv
# Runtime API/worker
DB_USER=iwana_app
DB_PASSWORD=<secret_app>

# Migraciones CLI + provisioning DDL (@iwana/db + worker)
DB_MIGRATOR_USER=iwana_migrator
DB_MIGRATOR_PASSWORD=<secret_migrator>
DB_APP_USER=iwana_app
DB_APP_PASSWORD=<secret_app>
```

Tras opt-in: `pnpm db:migrate:all` con `DB_MIGRATOR_*`; runtime Nest TypeORM con `DB_USER=iwana_app`.

**Staging = lab endurecido listo:** apply+verify PASS en Docker local; rotación MFA lab GO; checklist estricto documentado como opt-in. No hay stack staging separado en el monorepo (único `docker-compose.yml`).

---

## 3. Rotación MFA_ENCRYPTION_KEY — CLI entregado (paso 0 desbloqueado)

### 3.1 Inventario CLI/job (paso 0)

| Artefacto esperado (ADR-058 / runbook) | Estado en repo |
| --- | --- |
| CLI tenant-aware dry-run default | **Entregado** — `pnpm encryption:reencrypt` → `@iwana/api` `encryption:reencrypt` → `node dist/cli/reencrypt-aes.js` |
| Processor BullMQ de recifrado | No requerido (CLI ops suficiente para ADR-058) |
| Script ops de recifrado | Mismo CLI (+ root alias `encryption:reencrypt`) |
| Soporte doble clave en config (`MFA_ENCRYPTION_KEY_PREVIOUS`) | Presente (Joi / `.env.example`) + CLI usa activa/previous |
| Formato ciphertext `iv:tag:ciphertext` | Util `aes-gcm.util.ts` + CLI |

**GO paso 0.** PLAT-OPS puede reanudar runbook desde paso 4 (dry-run) en lab.

### 3.2 Estado lab por paso del runbook

| Paso runbook | Estado lab |
| --- | --- |
| 0 Inventario | **GO** — CLI `pnpm encryption:reencrypt` (ver §4) |
| 1 Generar clave | **Hecho** — clave activa fuerte escrita en `.env.development` (no versionado; valor no logueado) |
| 2 Doble clave | **Hecho** — `PREVIOUS` = clave débil previa; `KEY` = nueva fuerte (mismas formas documentadas; sin valores) |
| 3 Healthcheck API | API **down** en `:3000` — CLI ejecutado contra Postgres (no requiere API) |
| 4 Dry-run | **PASS** — `decrypt_errors=0` (detalle §3.4) |
| 5 Apply | **PASS** — `reencrypted=6`, `pending=0` |
| 6 Verify active-only | **PASS** — `verify_failures=0` (antes y después de retirar PREVIOUS) |
| 7 Retirar PREVIOUS | **Hecho** — línea `MFA_ENCRYPTION_KEY_PREVIOUS` eliminada de `.env.development` |
| 8 Post-check | Verify post-retiro **OK**; smoke HTTP pendiente de `pnpm dev` |

### 3.3 Comandos para el operador (sin secretos)

Generar clave nueva (fuera del repo / no loguear salida en tickets):

```bash
openssl rand -hex 32
# o: bash scripts/generate-secrets.sh
#    (solo escribe MFA_ENCRYPTION_KEY en .env.local si aún no hay valor)
```

Ventana de doble clave en `.env` **no versionado** (orden estricto):

```dotenv
# PREVIOUS = clave que aún descifra ciphertext existente
MFA_ENCRYPTION_KEY_PREVIOUS=<clave_antigua>
# KEY = clave nueva (escrituras nuevas)
MFA_ENCRYPTION_KEY=<clave_nueva>
```

Healthcheck cuando el stack esté arriba:

```bash
# PowerShell
Invoke-WebRequest -Uri http://127.0.0.1:3000/api/v1/health -UseBasicParsing
# curl
curl -sS http://127.0.0.1:3000/api/v1/health
```

**No** retirar `MFA_ENCRYPTION_KEY_PREVIOUS` hasta recifrado 100 % con CLI (en lab ya retirado tras verify PASS).

### 3.4 Evidencia rotación lab (2026-07-19, sin secretos)

**Prerrequisitos:** `pnpm --filter @iwana/api build` OK; Postgres `iwana_postgres_dev` healthy; doble clave en `.env.development` (gitignored).

| Fase | Comando | Totales observados |
| --- | --- | --- |
| Dry-run | `pnpm encryption:reencrypt` | schemas=`public`, `tenant_iwana`; candidates=6; reencrypted=6 (conteo dry); decrypt_errors=**0**; verify_failures=0; pending=6; missing_table_targets=4; blocking=no |
| Apply | `pnpm encryption:reencrypt -- --apply` | candidates=6; reencrypted=**6**; decrypt_errors=**0**; pending=**0**; blocking=no; OK |
| Verify (con PREVIOUS aún presente) | `pnpm encryption:reencrypt -- --verify-active-only` | skipped_active=6; verify_failures=**0**; decrypt_errors=**0**; pending=0; OK |
| Post-retiro PREVIOUS | mismo verify | skipped_active=6; verify_failures=**0**; OK (sin aviso de PREVIOUS débil) |

Desglose candidatas recifradas (entityType, sin PII):

- `public/platform_user.email` ×2  
- `tenant_iwana/expediente.documentNumberEncrypted` ×1  
- `tenant_iwana/expediente.phonePrimaryEncrypted` ×1  
- `tenant_iwana/expediente.emailPrimaryEncrypted` ×1  
- `tenant_iwana/expediente.altContactPhoneEncrypted` ×1  

`missing_table_targets=4` = tablas inventario aún ausentes en el schema lab (`subscriberContact.*`, `potentialLead.*`) — no bloqueante.

**Veredicto rotación lab:** **GO / completada.**

---

## 4. CLI de recifrado — AI-SR-FULL (contrato cerrado)

**Estado:** entregado 2026-07-19. PLAT-OPS reanuda runbook desde paso 4.

### 4.1 Comando estable

```bash
# Build previo (dist/cli)
pnpm --filter @iwana/api build

# Dry-run (default, sin escritura)
pnpm encryption:reencrypt
# equivalente: pnpm --filter @iwana/api encryption:reencrypt

# Apply
pnpm encryption:reencrypt -- --apply

# Verify solo clave activa (paso 6 runbook, antes de retirar PREVIOUS)
pnpm encryption:reencrypt -- --verify-active-only

# Filtro schema
pnpm encryption:reencrypt -- --schema=tenant_demo
pnpm encryption:reencrypt -- --schema=public
```

Código: `apps/api/src/cli/reencrypt-aes.ts` + orquestador `apps/api/src/common/crypto/reencrypt-aes.orchestrator.ts`.  
DB: `AppDataSource` + `resolveMigrationDbCredentials` (`DB_MIGRATOR_*` preferido; UPDATE de columnas cifradas).

### 4.2 Cumplimiento del contrato

| Requisito | Cumplimiento |
| --- | --- |
| Dry-run default | Sí (sin `--apply` / `--write`) |
| Por tenant / `--schema=` | Sí (`SET LOCAL search_path` vía `runInTenantSchema`) |
| Idempotente | Sí — filas legibles con activa → `skipped_active` |
| Métricas | candidates, reencrypted, skipped_active, decrypt_errors, verify_failures, pending |
| Exit ≠ 0 | apply/verify con errores; dry-run con `decrypt_errors` |
| Formato | `iv:tag:ciphertext` hex vía `encryptAes256Gcm` / `decryptAes256Gcm` |
| Verify | `--verify-active-only` |
| Sin PII en logs | Solo schema, entityType, conteos |

### 4.3 Entidades/columnas cubiertas

- **public:** `platform_users.email`, `platform_users.mfa_secret`
- **tenant:** `users.mfa_secret` (+ legado `users.email|first_name|last_name|document_number` si parecen ciphertext)
- **tenant CRM:** `subscribers.*_encrypted`, `expediente_records.*_encrypted`, `subscriber_contacts.*_encrypted`, `potential_leads.*_encrypted`

**Gaps (no cubiertos — sin write AES actual):** `party.document_number` (plaintext hoy); `users.password_reset_token` (token opaco).

**Nota rotación desde clave débil:** `MFA_ENCRYPTION_KEY` (activa) rechaza entropía nula; `MFA_ENCRYPTION_KEY_PREVIOUS` admite hex débil solo en ventana. Lab 2026-07-19: ciclo completo dry-run → apply → verify → retiro PREVIOUS (§3.4).

---

## 5. Staging checklist — **CERRADO** (lab = staging surrogate)

**Premisa:** no existe compose/stack staging separado. El Docker local endurecido (SEC-04 apply+verify + rotación MFA) es el **surrogate de staging**.

| Ítem | Estado |
| --- | --- |
| Roles `iwana_app` / `iwana_migrator` creados (apply) | **OK** |
| Verify DROP TRIGGER PASS | **OK** (re-verify) |
| Opt-in estricto documentado (`DB_USER=iwana_app` + `DB_MIGRATOR_*`) | **OK** — no forzado en default `pnpm dev` |
| Rotación MFA lab (dry-run → apply → verify → PREVIOUS out) | **OK** |
| Default compose intacto (compat) | **OK** |
| Staging checklist operativo | **CERRADO** 2026-07-19 |

Checklist estricto residual (solo si el operador activa opt-in en un entorno “staging” físico futuro): mismos pasos §9 (prod), sobre ese host.

---

## 6. Checklist prod (plantilla; ejecución remota NO-GO)

### SEC-04

- [ ] Roles `iwana_app` / `iwana_migrator` con passwords **distintos** (secrets manager).
- [ ] Apply least-privilege / migración `015` aplicada; verify PASS en el entorno.
- [ ] Runtime API/worker: `DB_USER=iwana_app` únicamente.
- [ ] Migraciones: `DB_MIGRATOR_*` (CLI preferido; no `migrationsRun` como superuser).
- [ ] Bootstrap/`POSTGRES_USER` solo break-glass.
- [ ] Rollback emergencia documentado: revertir `DB_USER` a bootstrap **solo** incidente, no estado estable.

### Rotación MFA (tras CLI SR-FULL)

- [ ] Backup/restore verificado del entorno.
- [ ] Paso 1–2: clave nueva + doble clave desplegada.
- [ ] Healthcheck + smoke MFA/PII lectura.
- [ ] Dry-run limpio → go del entorno.
- [ ] Recifrado → verify 100 % → retirar PREVIOUS → post-check.

### Rollback rotación (ventana doble clave)

- Restaurar `MFA_ENCRYPTION_KEY` = clave antigua; no vaciar PREVIOUS si el recifrado no terminó.
- Redeploy + healthcheck.

---

## 7. Comandos reproducibles (resumen)

```powershell
# SEC-04 apply (Windows lab)
Get-Content -Raw scripts/db/apply-least-privilege.sql |
  docker exec -i iwana_postgres_dev psql -v ON_ERROR_STOP=1 -U iwana -d dbiw `
    -v app_pass="<lab-app-pass>" -v migrator_pass="<lab-migrator-pass>"

# SEC-04 verify — esperar NOTICE PASS / SQLSTATE 42501
Get-Content -Raw scripts/db/verify-app-cannot-drop-audit-trigger.sql |
  docker exec -i iwana_postgres_dev psql -v ON_ERROR_STOP=1 -U iwana -d dbiw

# Health local (requiere pnpm dev)
Invoke-WebRequest http://127.0.0.1:3000/api/v1/health -UseBasicParsing

# Health prod (timeout corto)
Invoke-WebRequest http://10.0.0.2:8080/api/v1/health -UseBasicParsing -TimeoutSec 5

# Clave (operador; no pegar en git/tickets)
openssl rand -hex 32

# Recifrado AES (requiere build @iwana/api + MFA_ENCRYPTION_KEY[_PREVIOUS] + DB_*)
pnpm --filter @iwana/api build
pnpm encryption:reencrypt
pnpm encryption:reencrypt -- --apply
pnpm encryption:reencrypt -- --verify-active-only
```

---

## 8. Purge git — **GO** (2026-07-19)

### 8.1 Inventario pre-purge (sin secretos)

| Hallazgo | Valor |
| --- | --- |
| Path en historial | `.env.development` — **3** commits que tocaban el path (mensajes: untrack gitignore; snapshot; bootstrap DTO) |
| Commits con literal `MFA_ENCRYPTION_KEY=` + 64 ceros | **117** (pre-purge; solo conteo) |
| Ancestro de `origin/main` | Los commits del path **no** eran ancestros de `main` (main ya limpio de path) |
| Ramas remotas que contenían blobs contaminados | `backup/auto-20260611-182854`, `feat/mod04-fase1-backend`, `feature/mod05-crm-fase-01`, `feature/productos-adicionales` |
| HEAD `main` pre-purge | `ade1c47bc3f91277f6092fd8728c0e89efa85d95` |

### 8.2 Ejecución

1. Stash working tree (`-u`) para no perder trabajo local.  
2. Tracking local de todas las ramas `origin/*` para reescribir refs contaminadas.  
3. `git filter-repo --path .env.development --invert-paths --force` (vía `git-filter-repo` 2.47 / Python 3.12).  
4. Remote `origin` eliminado por filter-repo → re-añadido `https://github.com/SleyiW/iWana-neXt.git`.  
5. Force-push `--force-with-lease` de ramas reescritas + `main` (main: *Everything up-to-date*).  
6. `git reflog expire --expire=now --all` + `git gc --prune=now` (objetos huérfanos locales eliminados).  
7. Stash pop; `git branch -u origin/main main`.

### 8.3 Verificación post-purge

| Check | Resultado |
| --- | --- |
| `git log --all -- .env.development` | **Vacío** |
| `git grep` / rev-list literales `MFA_ENCRYPTION_KEY=` + 64 ceros | **0** commits |
| Prefijo `MFA_ENCRYPTION_KEY=0000` en historial reachable | **0** |
| SHAs antiguos del path (abreviados `c4d54a25`, `b468fbe4`, `7b9ac651`) | **No** resolubles tras `gc --prune=now` |

### 8.4 SHAs post-rewrite (tips force-pushed)

| Rama | Tip post-purge |
| --- | --- |
| `main` | `ade1c47bc3f91277f6092fd8728c0e89efa85d95` (sin cambio de tip; ya limpio) |
| `backup/auto-20260611-182854` | `3044c90a29aaba5c673148f65f2e7796a826021e` (forced) |
| `feat/mod04-fase1-backend` | `1fc94553bcc6b7e68141ebc56158852e015a893f` (forced) |
| `feature/mod05-crm-fase-01` | `ee6f3370e4761576e4972839e630e5ace546d824` (forced) |
| `feature/productos-adicionales` | `a047af2feb667e0243b0a99ad151c5b94ae1a542` (forced) |

### 8.5 Impacto para clones locales

- **Re-clonar** o reset duro al remote reescrito. Clones antiguos pueden conservar objetos filtrados en disco hasta `gc`.  
- Cualquier PR/fork basado en tips antiguos de las ramas force-pusheadas debe recrearse.  
- GitHub puede retener objetos unreachable un tiempo; si hay forks externos, coordinar purge allí también.

**Veredicto purge:** **GO.**

---

## 9. Producción `10.0.0.2:8080` — **NO-GO ejecución remota**

### 9.1 Probe health (esta sesión)

```powershell
Invoke-WebRequest -Uri http://10.0.0.2:8080/api/v1/health -UseBasicParsing -TimeoutSec 5
```

**Resultado:** `unreachable=true` (HttpClient timeout 5 s). Sin acceso SSH ni compose en el host desde esta sesión → **no se inventa** ejecución remota.

### 9.2 Checklist exacto para operador en servidor

Orden estricto (sin loguear secretos):

1. **Backup DB** verificado (restore de prueba; tratar dump como PII — Ley 1581).  
2. **SEC-04 apply** (`scripts/db/apply-least-privilege.sql` / runbook) con passwords distintos app/migrator.  
3. **SEC-04 verify** — esperar PASS `42501`.  
4. Opt-in runtime: `DB_USER=iwana_app` + `DB_MIGRATOR_*` en `.env` del host (no versionar).  
5. **Rotación MFA:** generar clave → desplegar `MFA_ENCRYPTION_KEY_PREVIOUS` + `MFA_ENCRYPTION_KEY` → health `http://10.0.0.2:8080/api/v1/health`.  
6. `pnpm encryption:reencrypt` (dry-run) → `--apply` → `--verify-active-only`.  
7. Retirar `MFA_ENCRYPTION_KEY_PREVIOUS` → verify de nuevo → health.  
8. Documentar tip de imagen/compose y ventana en el informe vivo.

Referencia de topología: plan archive MOD01 → único `docker-compose.yml` on-prem en `:8080`.

**Veredicto prod (esta pasada):** **NO-GO** de ejecución remota; checklist listo para operador humano.

---

## 10. Próximos pasos

1. ~~**AI-SR-FULL:** entregar CLI de recifrado (contrato §4).~~ **Hecho.**  
2. ~~**PLAT-OPS:** rotación lab pasos 4–7.~~ **Hecho** (§3.4).  
3. ~~**Staging surrogate + SEC-04 re-verify.**~~ **Cerrado** (§5).  
4. ~~**Purge git.**~~ **GO** (§8).  
5. **Operador en `10.0.0.2`:** ejecutar §9 cuando el host sea reachable + backup OK.  
6. **AI-SEC-ENG:** re-review G-SEC con evidencia lab + purge (este informe **no** auto-aprueba G-SEC adicional).  
7. Opcional lab: `pnpm dev` + smoke MFA/PII lectura.  
8. Avisar a desarrolladores: **re-clonar** tras purge.
