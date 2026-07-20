# [SEC-REVIEW] Remediación transversal — Gate G-SEC post remediación

| Campo | Valor |
| --- | --- |
| **ID** | SECURITY-REVIEW-TRANSVERSAL-REMEDIACION-GSEC-v1.0 |
| **Fecha** | 2026-07-19 |
| **Autor** | AI-SEC-ENG (aprobador de gate; solo lectura) |
| **Orquestador** | AI-EM-ARCH |
| **Baseline** | OWASP ASVS L2 · Ley 1581 · RF-AUD / ADR-018 · plan SEC-02…05 + desempate SWEEP-01 |
| **Entradas** | SECURITY-REVIEW-TRANSVERSAL-AUDIT-RESPONSE-SWEEP-v1.0 · INFORME-TRANSVERSAL-REMEDIACION-SEC-02-05-v1.0 · runbooks PLAT-OPS · código SR-FULL |
| **Fuera de alcance de aprobación (histórico)** | Superado por aprobación CTO 2026-07-19 — ver Addendum C |
| **Estado** | **GO** para merge del paquete de remediación (Addendum A+B+C; CTO 2026-07-19) |

---

## 1. Veredicto

| Superficie | Veredicto |
| --- | --- |
| **Merge código remediación (SR-FULL)** | **GO** — GSEC-01…07 cerrados; CTO levantó condiciones (Addendum C) |
| **Artefactos PLAT-OPS (runbooks + SQL init/apply/verify)** | **GO** — SEC-04 estricto obligatorio en staging/prod (checklist runbook) |
| **ADR-058 / recifrado / purge** | **Aprobado CTO** (2026-07-19); fail-fast código verificado |
| **Parties sin `@SkipAudit`** | **Aceptable** con denylist ampliada (defensa en profundidad) |

**Histórico:** el P0 GSEC-01 se cerró en Addendum A; el GO dejó de ser condicional tras Addendum C (aprobación CTO).

---

## 2. Matriz de verificación (evidencia)

### SEC-02 — Fail-fast entropía + decrypt dual

| Control | Estado | Evidencia |
| --- | --- | --- |
| Joi rechaza `'0'.repeat(64)` / hex débil | **OK** | `aes-gcm.util.ts` `isWeakMfaEncryptionKeyHex` + `mfaEncryptionKeyJoiSchema`; specs `aes-gcm.util.spec.ts` |
| Hex 64 obligatorio | **OK** | `.pattern(/^[0-9a-fA-F]{64}$/)` |
| `MFA_ENCRYPTION_KEY_PREVIOUS` opcional | **OK** | `mfaEncryptionKeyPreviousJoiSchema` + `app.module.ts` |
| Decrypt dual active→previous | **OK** | `decryptAes256Gcm` / `loadAesGcmKeyPair`; uso en auth/users/CRM |
| Recifrado job ops | **Fuera de gate** | Runbook exige go CTO; no se aprueba ejecución |

**Residual P2:** specs de dominio aún usan `'0'.repeat(64)` como mock de ConfigService (no arranca Joi). Migrar a clave de test de alta entropía en siguiente ciclo.

### SEC-03 — TTL forgot-password vs credencial temporal

| Control | Estado | Evidencia |
| --- | --- | --- |
| Columna/entity `passwordResetTokenExpiresAt` | **OK** | mig. tenant `076_…`; `User.passwordResetTokenExpiresAt` |
| `forgotPassword` no pisa `passwordResetExpiresAt` | **OK** | update solo `passwordResetToken` + `passwordResetTokenExpiresAt` |
| `resetPassword` usa token expiry | **OK** | valida `passwordResetTokenExpiresAt`; limpia ambos campos |
| Invalidación al regenerar temp password | **OK** | limpia `passwordResetTokenExpiresAt` al emitir temp |

### SEC-05 / SWEEP — Denylist PII + tests

| Control | Estado | Evidencia |
| --- | --- | --- |
| Denylist ampliada (`value`, nombres, nit, phones, addresses, `*Email` listados, etc.) | **OK** | `ALWAYS_OMITTED_KEYS` en `audit.interceptor.ts` |
| Sufijos `*Email` / `*Encrypted` | **OK** | `PII_KEY_SUFFIX_PATTERN` |
| Tests sanitize PII (incl. `PartyContact.value`) | **OK** | `audit.interceptor.sanitize.spec.ts` caso SEC-05/SWEEP |

### SWEEP-01 — `@SkipAudit` + audit manual

| Superficie | `@SkipAudit` | Audit manual | Veredicto |
| --- | --- | --- | --- |
| Users CUD (+ bulk vía `create`) | Sí | Sí (`UsersService`) | **OK** |
| Subscribers create/update/remove/section | Sí | Sí | **OK** |
| Subscribers `PATCH :id/status` | **Sí** | **No** (`SubscriberStatusTransitionService.transition` solo `logger.log`) | **P0** |
| Potentials create/qualify | Sí | Sí | **OK** (ver residual PII en `fullName` manual) |
| Expedientes CUD listados | Sí | Sí (`ExpedienteService`) | **OK** |
| Parties CUD | **No** | No | **Aceptable** — interceptor + denylist cubre PII inventariada (`documentNumber`, `value`, `displayName`, …). Hay fila de audit. |

**Criterio del gate:** SkipAudit sin ninguna fila de audit = **P0**. Cumple en `PATCH /crm/subscribers/:id/status`.

### Parties + denylist (desempate)

Para **este ciclo G-SEC**, denylist en Parties **es suficiente**: el interceptor sigue emitiendo audit CUD y omite las claves PII del barrido SWEEP-02. Preferible a medio plazo: SkipAudit + audit mínimo o allowlist (fase 2). No bloquea si se cierra el P0 de subscribers status.

---

## 3. Artefactos PLAT-OPS

### 3.1 `RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md`

| Pregunta | Hallazgo |
| --- | --- |
| ¿Orden PREVIOUS / KEY / dry-run seguro? | **Sí.** Paso 2: PREVIOUS = antigua, KEY = nueva; dry-run (4) antes de recifrado real (5); retirar PREVIOUS solo tras 100 % (7). Rollback en ventana doble clave documentado. |
| ¿Anti-patrones OK? | **Sí.** Prohíbe ceros, commit de secretos, retirar PREVIOUS prematuro, invertir claves, purge git acoplado, force-push sin CTO. |
| ¿Auto-aprueba G-SEC/ops? | **No** — §7 remite a SEC-ENG; prod exige go CTO. |

**Veredicto runbook cifrado:** **GO** como procedimiento (no autoriza ejecución prod).

### 3.2 Least privilege — runbook + init + apply + verify

| Artefacto | Hallazgo |
| --- | --- |
| `01-create-roles.sh` | Crea `iwana_app` / `iwana_migrator` NOSUPERUSER; CONNECT + CREATE DB/schema. Aceptable para provisioning tenant. |
| `02-audit-least-privilege.sql` | Event trigger `SECURITY DEFINER` con `search_path` fijo; reasigna owner de `*.audit_logs` / `platform_audit_logs` a migrator; evita recursión. **OK** |
| `apply-least-privilege.sql` | Idempotente; REVOKE ALL app + GRANT SELECT,INSERT en audit; ownership migrator. Passwords default `changeme-dev-only-*` solo lab — documentado. |
| `verify-app-cannot-drop-audit-trigger.sql` | Prueba negativa DROP TRIGGER como app; PASS esperado. Nota P2: `WHEN OTHERS` puede enmascarar fallos no-permiso (falso PASS) — endurecer códigos SQLSTATE en v1.1. |
| Runbook | Documenta opt-in, handoff SR-FULL, break-glass bootstrap, CI sin forzar app role. **OK** |

### 3.3 Modelo opt-in — ¿falsa sensación de SEC-04 cerrado?

| Hecho | Evaluación |
| --- | --- |
| Default `DB_USER=iwana` / `POSTGRES_USER` bootstrap | **Obsoleto (2026-07-19)** — era cierto al redactar esta revisión, ya no. `.env` usa `DB_USER=iwana_app` y el bootstrap se desacopló a `DB_BOOTSTRAP_USER` (GSEC-N1, ver §3.3.1) |
| Roles creados ≠ roles usados | Runbook lo dice explícitamente (“compat” vs “SEC-04 estricto”) |
| Staging/prod sin opt-in | **SEC-04 sigue abierto** — compromiso de API = superuser de volumen puede DROP TRIGGER |

**Conclusión AppSec:** los artefactos **no** dan falsa sensación *si* se lee el runbook; el riesgo es operativo (alguien asume “init = cerrado”). Exigir checklist prod: `DB_USER=iwana_app` + migraciones como migrator + verify PASS. **No** tratar merge de SQL/docs como cierre de SEC-04 en prod.

### 3.3.1 GSEC-N1 — la propia prescripción de §C.1 autoinvertía el control (corregido 2026-07-19)

**Defecto.** `docker-compose.yml` derivaba el superusuario de bootstrap del mismo
valor que el rol de aplicación: `POSTGRES_USER: ${DB_USER:-iwana}`. Cuando la
remediación SEC-04 puso `DB_USER=iwana_app` en `.env`, en **cualquier datadir vacío**
(máquina nueva, CI, `docker compose down -v`) el entrypoint de Postgres creaba
`iwana_app` como **superusuario de bootstrap**. El init `01-create-roles.sh` sólo
comprobaba existencia (`WHERE NOT EXISTS ... pg_roles`), veía el rol ya creado, se
saltaba el `NOSUPERUSER` y reportaba `OK`. Resultado: SEC-04 anulado en silencio
—sin error ni warning— y sólo detectable corriendo `verify-app-cannot-drop-audit-trigger.sh`.

Reproducido sobre volumen limpio: `iwana_app` quedaba `rolsuper=t`, y como tal
ejecutaba `DROP EVENT TRIGGER trg_reassign_audit_owner` con éxito.

**Corrección.**

1. `docker-compose.yml` → `POSTGRES_USER: ${DB_BOOTSTRAP_USER:-iwana}`. El bootstrap
   ya no puede acoplarse al rol de aplicación por editar `DB_USER`.
2. `01-create-roles.sh` falla en duro (exit 1, el contenedor no arranca) si
   `POSTGRES_USER` coincide con `DB_APP_USER` o `DB_MIGRATOR_USER`.
3. La guarda del init ya **no depende de la existencia del rol**: tras crear los
   roles verifica `rolsuper OR rolcreaterole OR rolbypassrls` y aborta si alguno
   está elevado. Un rol preexistente deja de asumirse correcto.
4. `scripts/db/apply-least-privilege.sh` y `verify-app-cannot-drop-audit-trigger.sh`
   toman el bootstrap de `DB_BOOTSTRAP_USER`, no de `DB_USER`.

**Lección de proceso.** Esta revisión prescribía `DB_USER=iwana_app` (§C.1) como
condición de cierre sin advertir que ese mismo ajuste disparaba el defecto: un
control cuya activación lo desactiva. La verificación por lectura de piezas
aisladas no lo veía — hizo falta arrancar sobre un datadir vacío. Todo cambio de
identidad de base de datos se valida con bootstrap desde cero, no por inspección.

### 3.4 Residual `DB_MIGRATOR_USER` no cableado en TypeORM/CLI

| Pregunta | Respuesta |
| --- | --- |
| ¿Confirmado gap? | **Sí** — `packages/database/src/data-source.ts` solo `DB_USER` (default `iwana`). |
| ¿P1 bloqueante de merge de **artefactos** PLAT-OPS? | **No.** Event trigger mitiga ownership de tablas audit creadas bajo app; runbook documenta workaround `export DB_USER=iwana_migrator` para migrate. |
| ¿P1 bloqueante de declarar SEC-04 cerrado en prod? | **Sí** — cableado + opt-in runtime son requisitos de cierre; handoff SR-FULL/DATA-ENG. |

---

## 4. Tabla residual (post este review)

| ID | Sev | Tema | Bloquea merge remediación? | Dueño |
| --- | --- | --- | --- | --- |
| **GSEC-01** | **P0** | `PATCH crm/subscribers/:id/status`: `@SkipAudit` + transición sin `auditService.log` | **Cerrado (Addendum A)** | SR-FULL |
| GSEC-02 | P1 | SEC-04 prod: default bootstrap; sin opt-in no hay least-privilege efectivo | No (artefactos OK; bloquea *cierre* SEC-04) | PLAT-OPS + SR-FULL |
| GSEC-03 | P1 | `DB_MIGRATOR_USER` no en data-source/CLI/provisioning | No para merge artefactos; sí para cierre SEC-04 | SR-FULL / DATA-ENG |
| GSEC-04 | P1 | `PotentialsService.create` audit manual incluye `fullName` (PII) | No (hay audit; no anula denylist) | SR-FULL |
| GSEC-05 | P2 | Specs con mock `'0'.repeat(64)` | No | SR-FULL |
| GSEC-06 | P2 | Verify SQL `WHEN OTHERS` | No | PLAT-OPS |
| GSEC-07 | P2 | Denylist incompleta por diseño (`businessName`, notes libres, fase 2 WFM) | No | SR-FULL (fase 2) |
| — | — | ADR-058 rotación/recifrado/purge; SEC-05 Legal A/B/C | Fuera de este merge | CTO (+ Legal) |

---

## 5. STRIDE (delta post remediación)

| Amenaza | Estado tras remediación |
| --- | --- |
| **I** — PII en `newValue` interceptor | Mitigado en superficies SkipAudit+manual y denylist Parties/tenant/CRM residual |
| **R** — CUD sin audit | **Abierto** en transición de status de suscriptor (GSEC-01) |
| **E** — clave AES débil | Mitigado fail-fast arranque; datos legados / historial → CTO |
| **T** — DROP TRIGGER por app | Mitigado solo con opt-in + apply; default local aún bootstrap |

---

## 6. Guía de corrección GSEC-01 (no implementa SEC-ENG)

En `subscriber-status-transition.service.ts`, tras persistir el cambio de estado (y no en no-op):

- `auditService.log({ action: UPDATE, entityType: 'Subscriber', entityId, userId: actorId, newValue: { fromStatus, toStatus, reason } })`
- Sin documento/email/teléfono en `newValue`
- Mantener `@SkipAudit` en el controller (correcto frente a respuesta rica con PII)

Alternativa inferior: quitar `@SkipAudit` y confiar en denylist — menos alineado al desempate B.

---

## 7. Cierre para AI-EM-ARCH

| Pregunta | Respuesta |
| --- | --- |
| ¿GO merge remediación ahora? | **GO** (Addendum C — CTO 2026-07-19) |
| ¿Parties sin SkipAudit OK este ciclo? | **Sí**, con denylist |
| ¿Runbook rotación seguro? | **Sí** (orden + anti-patrones) |
| ¿SEC-04 staging/prod? | **Obligatorio** estricto (CTO Addendum C) |
| ¿Cableado `DB_MIGRATOR_USER`? | **Hecho** (Addendum A.3) |
| ¿ADR-058? | **Aprobado** (CTO) |
| ¿Este agente implementó? | **No** |

**[ESCALACIÓN DE SEGURIDAD]** — Cerrada por CTO 2026-07-19 (Addendum C).

— AI-SEC-ENG

---

## Addendum A — Re-review puntual GSEC-01 / migrator (2026-07-19)

| Campo | Valor |
| --- | --- |
| **ID addendum** | SECURITY-REVIEW-TRANSVERSAL-REMEDIACION-GSEC-v1.0-ADD-A |
| **Fecha** | 2026-07-19 |
| **Autor** | AI-SEC-ENG (solo lectura) |
| **Alcance** | Verificar cierre GSEC-01; confirmar GSEC-04 y cableado GSEC-03 (migrator); nuevo veredicto merge |
| **Estado documento (actualizado)** | Superado por Addendum C → **GO** |

### A.1 Verificación GSEC-01 (P0 previo) — **CERRADO**

| Afirmación SR-FULL | Evidencia en código | Resultado |
| --- | --- | --- |
| `transition` hace `auditService.log` tras cambio real | `subscriber-status-transition.service.ts`: `update` status → luego `auditService.log` con `AuditAction.UPDATE`, `entityType: 'Subscriber'`, `newValue: { fromStatus, toStatus, reason }` | **OK** |
| Payload mínimo sin PII inventariada | Solo estados + `reason`; sin documento/email/teléfono/`fullName` | **OK** |
| No-op sin audit | Early return si `fromStatus === targetStatus` **antes** del log; spec `expect(auditService.log).not.toHaveBeenCalled()` | **OK** |
| `@SkipAudit` se mantiene en handler status | `subscribers.controller.ts` `@Patch(':id/status')` + `@SkipAudit()` | **OK** |
| Cobertura de regresión | Spec ACTIVE→SUSPENDED afirma llamada exacta a `auditService.log` con payload mínimo | **OK** |

**Criterio gate SWEEP-01:** SkipAudit **con** fila de audit manual en CUD real → **satisfecho**. STRIDE **R** (repudiación en transición status) queda **mitigado** en esta superficie.

**Residual informativo (no bloquea):** `reason` es texto libre; un operador podría pegar PII. Aceptable para este ciclo. Fase 2: truncar/sanitizar si Legal lo exige. Orden persist→audit no es atómico: patrón ya conocido; no es P0 nuevo.

### A.2 Verificación GSEC-04 — **CERRADO** (residual PII manual)

| Afirmación | Evidencia | Resultado |
| --- | --- | --- |
| `fullName` fuera del audit de Potentials create | `potentials.service.ts`: `newValue: { source, qualified }` con comentario GSEC-04 | **OK** |
| Regresión | `potentials.service.spec.ts`: `expect.not.objectContaining({ fullName })` | **OK** |

### A.3 Verificación GSEC-03 (cableado migrator) — **CERRADO en código**; SEC-04 prod sigue abierto

| Afirmación | Evidencia | Resultado |
| --- | --- | --- |
| Helper `resolveMigrationDbCredentials()` | `packages/database/src/db-credentials.ts`: prefiere `DB_MIGRATOR_*`; fallback `DB_USER`/`DB_PASSWORD` | **OK** |
| Data-source CLI | `packages/database/src/data-source.ts` usa el helper | **OK** |
| Provisioning worker | `tenant-provisioning.processor.ts` pool DDL (+ DataSource migraciones) usa el helper | **OK** |
| Runtime API/worker TypeORM no usa migrator | Nest sigue `DB_USER` (rol app) — correcto | **OK** |
| Specs | `apps/worker/src/db-credentials.spec.ts` | **OK** |

Cerrar GSEC-03 (cableado) **no** cierra GSEC-02 / SEC-04 en prod. Sin opt-in el default bootstrap sigue siendo superuser de volumen.

### A.4 Matriz residual actualizada (post addendum)

| ID | Sev | Tema | Estado tras A | Bloquea merge remediación? |
| --- | --- | --- | --- | --- |
| GSEC-01 | P0 | SkipAudit status sin audit | **Cerrado** | **No** |
| GSEC-02 | P1 | SEC-04 prod opt-in | Abierto (ops) | No (bloquea *cierre* SEC-04) |
| GSEC-03 | P1 | Cableado `DB_MIGRATOR_*` | **Cerrado (código)** | No |
| GSEC-04 | P1 | `fullName` en Potentials create audit | **Cerrado** | No |
| GSEC-05…07 | P2 | Specs clave débil; verify SQL; denylist fase 2 | Abiertos | No |
| — | — | ADR-058 / recifrado / purge; Legal SEC-05 | Fuera de merge | CTO (+ Legal) |

### A.5 Veredicto actualizado para AI-EM-ARCH

| Pregunta | Respuesta |
| --- | --- |
| ¿GO merge remediación ahora? | **GO** (ver Addendum C) |
| ¿GSEC-01 cerrado? | **Sí** |
| ¿Nuevo P0? | **No** |
| ¿SEC-04 / ADR-058 / Legal? | Resueltos por CTO — Addendum C |
| ¿Parties sin SkipAudit? | Sin cambio: aceptable este ciclo con denylist |
| ¿Este agente implementó? | **No** |

**Histórico:** las condiciones del GO condicional se levantaron en Addendum C (aprobación CTO 2026-07-19).

— AI-SEC-ENG

---

## Addendum B — Cierre residuales GSEC-05…07 + mig. 015 (2026-07-19)

| Campo | Valor |
| --- | --- |
| **ID addendum** | SECURITY-REVIEW-TRANSVERSAL-REMEDIACION-GSEC-v1.0-ADD-B |
| **Autor** | AI-EM-ARCH (consolidación ejecutiva post GO condicional) |
| **Estado** | Residuales de código **cerrados**; CTO/Legal siguen fuera de merge |

| ID | Acción | Estado |
| --- | --- | --- |
| GSEC-05 | Specs de dominio: mock `'0'.repeat(64)` → clave de test de alta entropía sintética (`0123…abcdef`×4). `aes-gcm.util.spec.ts` conserva ceros **solo** para afirmar rechazo Joi. | **Cerrado** |
| GSEC-06 | `verify-app-cannot-drop-audit-trigger.sql`: PASS solo con `insufficient_privilege` (42501); otros errores → FAIL. | **Cerrado** |
| GSEC-07 | Denylist: `businessName` / `razonSocial` (+ variantes). Deuda WFM/notes sigue fase 2 (no bloquea). | **Cerrado (parcial aceptable)** |
| — | Migración public `015_audit_owner_least_privilege.ts` (no-op si no hay rol migrator). | **Hecho** |

**Fuera de cierre de ingeniería (superado por Addendum C):** ver Addendum C — CTO aprobó ADR-058, go ops, postura Legal A y SEC-04 estricto en staging/prod.

---

## Addendum C — Levantamiento GO condicional (aprobación CTO, 2026-07-19)

| Campo | Valor |
| --- | --- |
| **ID addendum** | SECURITY-REVIEW-TRANSVERSAL-REMEDIACION-GSEC-v1.0-ADD-C |
| **Autor** | AI-EM-ARCH (registro de aprobación CTO) |
| **Estado documento** | **GO** (sin condicionales de merge) |

### C.1 Decisiones CTO registradas

| Tema | Decisión |
| --- | --- |
| ADR-058 | **Aprobado** |
| Rotación / recifrado / purge git | **Go** según runbook (dry-run → recifrado → retirar PREVIOUS; purge solo tras rotar entornos vivos) |
| SEC-05 Legal (ARCO vs audit 7 años) | **Opción A** — pseudonimizar PII en escritura de audit; remediación ARCO vía `iwana.audit_maintenance` en migración revisable |
| SEC-04 staging/prod | **Obligatorio** `DB_USER=iwana_app` + `DB_BOOTSTRAP_USER` **distinto** de `DB_APP_USER`/`DB_MIGRATOR_USER` + migraciones con `DB_MIGRATOR_*` + `apply`/`verify` PASS antes de declarar entorno endurecido. **Aviso GSEC-N1:** aplicar `DB_USER=iwana_app` sin `DB_BOOTSTRAP_USER` en un datadir vacío autoinvierte el control (ver §3.3.1) |

### C.2 Veredicto actualizado

| Pregunta | Respuesta |
| --- | --- |
| ¿GO merge remediación? | **GO** |
| ¿ADR-058? | **Aprobado** |
| ¿Escalación CTO abierta? | **Cerrada** (2026-07-19) |
| ¿Ejecución ops pendiente? | Sí — PLAT-OPS ejecuta runbooks bajo este go; no bloquea merge del paquete |

— AI-EM-ARCH

---

## Addendum D — Re-verify post PLAT-OPS v1.3 + SR-FULL mig. 016/077 (2026-07-19)

| Campo | Valor |
| --- | --- |
| **ID addendum** | SECURITY-REVIEW-TRANSVERSAL-REMEDIACION-GSEC-v1.0-ADD-D |
| **Fecha** | 2026-07-19 |
| **Autor** | AI-SEC-ENG (solo lectura) |
| **Alcance** | Confirmar 016/077 (SET LOCAL, redact≠delete, idempotencia); coherencia SEC-04 runtime `iwana_app` sin reabrir; gap CLI migrator/grants |
| **Estado documento (este cierre)** | **GO** |

### D.1 Migraciones 016 (public) / 077 (tenant)

| Control | Resultado |
| --- | --- |
| `SET LOCAL iwana.audit_maintenance = 'on'` | **OK** (misma transacción; escotilla 014/075) |
| Redacta, no borra filas | **OK** (criterio 012 + Legal A / Addendum C) |
| Idempotencia (`IS DISTINCT FROM` redact) | **OK** |
| Registro en runner / public glob | **OK** |
| Conteo lab ~22 vs falso positivo ~53 (`changedFields`) | **Aceptado** (documentado en cabeceras 016/077; sin PII en este addendum) |

### D.2 SEC-04 — no reabrir

| Afirmación | Resultado |
| --- | --- |
| Lab PLAT-OPS v1.3: apply + verify PASS + runtime `iwana_app` | **Cerrado lab** (no se reabre) |
| `apply-least-privilege.sql`: DML negocio + re-endurecer audit | **Coherente** |
| Prod on-prem | Sigue checklist operador / NO-GO remoto (fuera de este cierre) |

### D.3 Residual P1 — CLI migrator sin grants ledger

| ID | Sev | Tema | Bloquea este cierre? | Dueño |
| --- | --- | --- | --- | --- |
| **GSEC-08** | P1 | CLI/tenant migrator: grants ledger `typeorm_migrations` (+ seq) a `iwana_migrator` | **Cerrado** (PLAT-OPS apply `$ledger$` + lab `migration:run` EXIT 0, 2026-07-19) | PLAT-OPS |

### D.4 Veredicto para AI-EM-ARCH

| Pregunta | Respuesta |
| --- | --- |
| ¿GO este cierre (redacción residual + no reabrir SEC-04)? | **GO** |
| ¿Nuevo P0? | **No** |
| ¿GSEC-08 bloquea merge/redacción? | **No** — **cerrado** (D.5) |
| ¿ADR aprobado aquí? | **No** (fuera de alcance SEC-ENG) |
| ¿Este agente implementó? | **No** |

### D.5 Cierre GSEC-08 (PLAT-OPS, 2026-07-19)

`apply-least-privilege.sql` bloque `$ledger$`: GRANT sobre `*.typeorm_migrations` + secuencia a `iwana_migrator`; default privileges bootstrap → migrator. Lab: `migration:show`/`run` con `DB_MIGRATOR_USER` **EXIT 0**, sin 42501. Informe PLAT-OPS **v1.4**. **GSEC-08 cerrado.**

— AI-SEC-ENG / AI-EM-ARCH (registro D.5)
