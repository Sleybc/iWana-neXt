# INFORME — Ejecución lab PLAT-OPS (SEC-04 + rotación SEC-02)

**Tipo:** INFORME  
**Módulo:** TRANSVERSAL — Plataforma / ops  
**Versión:** 1.5  
**Fecha:** 2026-07-19  
**Autor:** AI-PLAT-OPS  
**Go:** CTO ADR-058 + ops (2026-07-19) · Usuario: cerrar SEC-04 en runtime lab · Handoff SR-FULL ledger migrator · EM-ARCH: gate CI least-privilege (GSEC-N1)  
**Ámbito:** lab/dev local = **staging surrogate**; prod on-prem `10.0.0.2:8080`; purge historial git ejecutado; **CI GHA** gate SEC-04

**Referencias:**  
[`RUNBOOK-DB-LEAST-PRIVILEGE-v1.0.md`](../runbooks/RUNBOOK-DB-LEAST-PRIVILEGE-v1.0.md) ·  
[`RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md`](../runbooks/RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md) ·  
[`INFORME-TRANSVERSAL-REMEDIACION-SEC-02-05-v1.0.md`](INFORME-TRANSVERSAL-REMEDIACION-SEC-02-05-v1.0.md) §4/§6 ·  
[`PLAN-MOD01-PRODUCCION-DEPLOYMENT-v1.0.md`](../archive/plans/PLAN-MOD01-PRODUCCION-DEPLOYMENT-v1.0.md)  

---

## 0. Veredicto ejecutivo (staging / prod / purge)

| Frente | Veredicto | Evidencia breve |
| --- | --- | --- |
| **Staging** (lab Docker endurecido = surrogate) | **GO / CERRADO** | SEC-04 **runtime** = `DB_USER=iwana_app` (v1.3); verify PASS; health `db=ok`; sesiones Nest = `iwana_app`; ledger migrator **GO** (v1.4) |
| **CI GHA** (gate least-privilege) | **GO diseño / listo en working tree** (v1.5) | Opción A: bootstrap `iwana` ≠ app; apply + migrate migrator + verify; job falla si DROP TRIGGER por app (§2.5) |
| **Producción** (`http://10.0.0.2:8080`) | **NO-GO ejecución remota** | Health timeout 5 s → unreachable; sin SSH/credenciales en sesión; checklist operador §9 |
| **Purge git** | **GO** | `git filter-repo --path .env.development --invert-paths`; path log vacío; literales clave débil = 0; force-push ramas contaminadas |

---

## 1. Veredicto lab (histórico v1.1)

| Control | Resultado | Notas |
| --- | --- | --- |
| SEC-04 least-privilege apply | **OK** | `apply-least-privilege.sql` vía `docker exec` (incluye DML de negocio + re-endurecer audit; v1.3) |
| SEC-04 verify DROP TRIGGER | **PASS** (re-verificado 2026-07-19) | `iwana_app` → `42501` / must be owner; owner `platform_audit_logs` = `iwana_migrator` |
| SEC-04 runtime Nest | **CERRADO lab** (v1.3) | `.env` / `.env.development` → `DB_USER=iwana_app`; API/worker reiniciados; `pg_stat_activity` = `iwana_app` |
| SEC-04 ledger `typeorm_migrations` | **GO** (v1.4) | Grant explícito + default privileges; `migration:show`/`run` con `DB_MIGRATOR_USER` sin 42501 |
| SEC-04 gate CI (GSEC-N1) | **GO diseño** (v1.5) | Workflow: bootstrap ≠ app; verify exit ≠ 0 falla job; ver §2.5 |
| Rotación MFA (pasos 0–7) | **GO lab completada** | CLI SR-FULL; dry-run limpio → apply → verify PASS → PREVIOUS retirado |
| Purge historial git | **GO** (v1.2) | Ver §8 |
| Staging | **CERRADO** (surrogate = lab) | Ver §5 |
| Prod on-prem | **NO-GO remoto** | Ver §9 |

**GO lab:** SEC-04 verify PASS + **runtime** `iwana_app` + rotación MFA lab cerrada.

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

### 2.3 Runtime lab — **CERRADO** (opt-in aplicado 2026-07-19, v1.3)

Compose / `.env.example` siguen con **compat por defecto** versionado: `DB_USER=iwana` (bootstrap).  
**No se fuerza** `iwana_app` en el default de compose para otros clones.

**Lab local (esta máquina):** opt-in aplicado en `.env` y `.env.development` **no versionados**:

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

| Check | Resultado |
| --- | --- |
| Verify DROP TRIGGER | **PASS** `42501` |
| Health `GET /api/v1/health` | **200** `{"status":"ok","db":"ok","redis":"ok",...}` |
| Sesiones Nest en Postgres | `usename=iwana_app` (idle ×2); bootstrap `iwana` solo en `psql` ops |
| Audit UPDATE por app | **denegado** (`has_table_privilege(...UPDATE)=f`) |
| `platform_users` SELECT por app | **ok** |

**Gap cerrado en apply (v1.3):** el SQL previo solo endurecía audit; sin `GRANT` DML en tablas owned by bootstrap el Nest con `iwana_app` fallaba (`permission denied for table platform_users`). `scripts/db/apply-least-privilege.sql` ahora otorga DML de negocio en `public` + `tenant_%`, `ALTER DEFAULT PRIVILEGES` para migrator/bootstrap, y re-endurece audit a `SELECT, INSERT`.

**Caveat compose:** con `DB_USER=iwana_app` en `.env` local, un *recreate* de Postgres en volumen **vacío** usaría `POSTGRES_USER=iwana_app`. Este lab ya tiene volumen inicializado con bootstrap `iwana` — no recrear datadir sin fijar bootstrap aparte. `.env.example` / default compose intactos para otros clones.

**Staging = lab endurecido:** apply+verify+runtime PASS; rotación MFA lab GO. No hay stack staging separado (único `docker-compose.yml`).

### 2.4 Ledger `typeorm_migrations` para `iwana_migrator` — **GO** (v1.4)

**Problema (handoff SR-FULL):** con `DB_MIGRATOR_*`, TypeORM lee/escribe el ledger owned by bootstrap; sin grant explícito (o si la tabla nació después del `GRANT ALL TABLES`) → `42501`.

**Cambio ops:**

| Artefacto | Cambio |
| --- | --- |
| `scripts/db/apply-least-privilege.sql` | Bloque `$ledger$`: `GRANT SELECT,INSERT,UPDATE,DELETE` + secuencia; `ALTER DEFAULT PRIVILEGES` bootstrap → migrator en `public` + `tenant_%` |
| `docker/postgres/init/01-create-roles.sh` | Default privileges bootstrap → app/migrator en `public` (volúmenes nuevos) |
| `docker/postgres/init/02-audit-least-privilege.sql` | Comentario de trazabilidad al ledger |
| Runbook least-privilege | v1.1 — sección ledger |

**Re-apply lab** (`iwana_postgres_dev`, 2026-07-19): `SEC-04 apply-least-privilege: OK`; `ledger_ok=t` / `seq_ok=t` en `public` y `tenant_iwana`.

**Verificación CLI (sin secretos en log):**

| Check | Resultado |
| --- | --- |
| `DB_MIGRATOR_USER=iwana_migrator` + `pnpm --filter @iwana/db migration:show` | **EXIT 0** — 16 migraciones públicas `[X]` (incl. 016) |
| `migration:run` (mismo env) | **EXIT 0** — `No migrations are pending` (sin 42501) |
| `SET ROLE iwana_migrator; SELECT count(*) FROM public.typeorm_migrations` | **OK** (16 filas) |

**Stop/go handoff:** **GO** — migrator puede leer/escribir el ledger.

### 2.5 Gate CI least-privilege (GSEC-N1) — **GO diseño** (v1.5)

**Problema:** el job `ci` usaba `POSTGRES_USER: test` + `DB_USER: test` acoplados y no montaba `docker/postgres/init/`, así que la guarda least-privilege **nunca** corría en CI (deuda P0 de gate documentada por EM-ARCH / SEC-ENG §3.3.1).

**Decisión:** **opción A** — service container + script post-ready en el runner (sin imagen custom ni job compose dedicado). Justificación: estable en GHA, reutiliza `apply-least-privilege.sql` / verify, no introduce secretos ni topología nueva (ADR no requerido).

| Cambio | Detalle (sin secretos) |
| --- | --- |
| Service Postgres | `POSTGRES_USER=iwana` (bootstrap) ≠ `iwana_app` / `iwana_migrator` |
| Env job | `DB_MIGRATOR_*` para migraciones; `DB_USER=iwana_app` (runtime model) |
| Scripts | `apply-least-privilege.sh` / `verify-*.sh` soportan modo **host** (`LEAST_PRIVILEGE_MODE=host`) además de Docker (default lab) |
| Gate | paso `Verify app cannot DROP audit trigger` → `bash scripts/db/verify-app-cannot-drop-audit-trigger.sh` |
| Criterio fallo | exit ≠ 0 (FAIL si app es owner, puede DROP, o falta trigger/rol) |
| Job intacto | `adr-citations` sin Postgres |

**Flujo DB CI:** install `postgresql-client` → apply → `migration:run` (migrator) → re-apply → check no pending → tenant schema + `migration:tenant:run` → re-apply → **verify**.

**Evidencia de diseño (esta sesión):** working tree listo; no force-push; no commit (orquestador). Validación local GHA no ejecutada (host agente Windows); sintaxis YAML/scripts revisada. Primera corrida verde en GitHub Actions es la evidencia runtime del gate.

**Riesgos residuales:** +tiempo job (apt + 3× apply + verify); flake si healthcheck Postgres lento (retries existentes); divergencia local (init entrypoint) vs CI (apply post-ready) — mismo SQL canónico.

**Stop/go:** **GO** si verify falla con app=superuser/owner y pasa con roles correctos; **STOP** no aplica (sin imagen privada ni secrets nuevos).

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
| Opt-in estricto en env lab (`DB_USER=iwana_app` + `DB_MIGRATOR_*`) | **OK** — aplicado en `.env` / `.env.development` (no versionado); default `.env.example` intacto |
| Runtime Nest API/worker con `iwana_app` | **OK** (v1.3) — health + `pg_stat_activity` |
| DML de negocio + audit endurecido en apply | **OK** (v1.3) |
| Rotación MFA lab (dry-run → apply → verify → PREVIOUS out) | **OK** |
| Default compose / `.env.example` intactos (compat clones) | **OK** |
| Staging checklist operativo | **CERRADO** 2026-07-19 (runtime v1.3) |

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
4. Remote `origin` eliminado por filter-repo → re-añadido `https://github.com/SleyiW/iWana-neXt.git`. **Superado el 2026-08-08:** el repositorio canónico pasó a ser `https://github.com/Sleybc/iWana-neXt.git`; ver «Migración de repositorio» más abajo.  
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
5. ~~**SEC-04 runtime lab (`DB_USER=iwana_app`).~~ **Cerrado** (§2.3, v1.3).  
6. ~~**Ledger `typeorm_migrations` → `iwana_migrator`.~~ **GO** (§2.4, v1.4).  
7. **Operador en `10.0.0.2`:** ejecutar §9 cuando el host sea reachable + backup OK.  
8. **AI-SEC-ENG:** re-review G-SEC con evidencia lab + purge + runtime (este informe **no** auto-aprueba G-SEC adicional).  
9. Opcional lab: smoke MFA/PII lectura con el stack ya en `iwana_app`.  
10. Avisar a desarrolladores: **re-clonar** tras purge; opt-in SEC-04 requiere re-apply (DML + ledger) si el volumen es legacy.
11. ~~**CI gate least-privilege (GSEC-N1).**~~ **Diseño GO / working tree** (v1.5 §2.5) — confirmar verde en primera corrida GHA tras merge.

---

## Migración de repositorio (2026-08-08)

**Repositorio canónico:** `https://github.com/Sleybc/iWana-neXt.git`

El `origin` local, la autenticación de `gh` y toda la configuración operativa apuntan ahí. Verificado el 2026-08-08: **cero referencias** al repositorio anterior en `package.json`, `.github/workflows/`, `scripts/`, `.gitmodules` ni `.git/config`.

### Los enlaces históricos NO se reescribieron, y es deliberado

Varios informes citan PRs y ejecuciones de CI con URLs de `SleyiW/iWana-neXt`:

| Documento | Qué cita |
| --- | --- |
| `INFORME-MOD09-CICLO-VIDA-VISITA-CAMPO-v1.0.md` | PR #4 y su run |
| `INFORME-MOD11-FLOW-CABLEADO-v1.0.md` | CI #112 sobre `1343d6b8` — evidencia de G6.5 |
| `INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md` | CI #30937447358 — evidencia de G6.5 |
| `docs/quality/evidence-fase-06-g6/README.md` | run de CI #112 |
| `INFORME-PLAT-OPS-CONVERGENCIA-NODE-v1.0.md`, `PROMPT-PLAT-OPS-CONVERGENCIA-NODE-v1.0.md` | menciones descriptivas |

**Esos runs y PRs existen únicamente en el repositorio anterior.** Reescribir las URLs a `Sleybc` convertiría enlaces válidos en enlaces rotos y destruiría la trazabilidad de gates ya firmados: la evidencia de G6.5 de MOD11 y de la auditoría Docker son precisamente esos runs. Un enlace que apunta a otro repositorio es correcto si la evidencia está allí; uno que apunta al repositorio correcto y devuelve 404 no lo es.

### Consecuencia declarada

Los PRs **#1 a #7** —incluidas las discusiones donde quedaron razonadas decisiones de SEC-P1: por qué el contract se difirió, por qué S-6 quedó en suspenso, por qué la migración 023 lista siete nombres— **no viajaron con el código**. El historial de commits sí está completo en el repositorio nuevo; las revisiones y comentarios no.

Quien busque el porqué de una decisión y no lo encuentre en los informes, debe consultar los PRs del repositorio anterior antes de concluir que no está documentado.
