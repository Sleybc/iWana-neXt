# INFORME — Remediación hallazgos SEC-02 … SEC-05 (+ barrido SEC-01)

**Versión:** 1.0  
**Fecha:** 2026-07-19  
**Modo:** EM + Architect + Orchestrator (AI-EM-ARCH)  
**Estado:** **Cerrado** — G-SEC **GO** (Addendum A+B+C). CTO aprobó ADR-058, go ops y postura Legal A (2026-07-19).  

**Origen:** Hallazgos AppSec (SEC-ENG); corrección orquestada; aprobación CTO 2026-07-19

---

## 1. Resumen ejecutivo

| ID | Severidad | Decisión AI-EM-ARCH | Dueño R | Estado |
| --- | --- | --- | --- | --- |
| SEC-02 | Crítica | Fail-fast + ADR-058 rotación/recifrado (go CTO) | SR-FULL · PLAT-OPS | **Lab+staging GO** · purge **GO** · prod on-prem **NO-GO remoto** (checklist operador) |
| SEC-03 | Alta | Separar TTL token forgot-password del TTL credencial temporal | SR-FULL | **Cerrado** (mig. 076) |
| SEC-04 | Media | Least-privilege; staging/prod con `iwana_app` obligatorio | PLAT-OPS · SR-FULL | **Runtime lab GO** (`iwana_app`) · prod checklist |
| SEC-05 | Media | Redactar PII en audit; ARCO = opción A (CTO) | SR-FULL · SEC-ENG | **Cerrado** (016/077 lab; G-SEC Add. D **GO**) |
| Barrido | Alta | SWEEP + GSEC-01…07 | SEC-ENG · SR-FULL | **GO** (Add. A+B+C) |

---

## 2. Decisiones

### SEC-02 — Clave AES débil / historial / alcance PII

**Recomendación adoptada:** Opción A del ADR-058 — **Aprobado CTO 2026-07-19**.

1. **Inmediato (código):** validación Joi/custom que rechace hex débil (ceros, todo-f, no-hex). Sin excepción dev.
2. **Operativo:** soporte `MFA_ENCRYPTION_KEY_PREVIOUS` + recifrado por tenant según runbook — **go CTO concedido**.
3. **Fase 2:** separar `PII_ENCRYPTION_KEY` (no bloquea rotación de emergencia).
4. **Historial git:** purge autorizado tras rotar todos los entornos vivos.

**Alternativas descartadas:** solo documentación; recifrado sin clave previous.

**ADR:** [ADR-058](../adrs/ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md) — **Aprobado**.

### SEC-03 — `forgot-password` pisa `passwordResetExpiresAt`

**Causa raíz:** un solo campo sirve (a) ventana de credencial temporal ADR-020/057 (24 h) y (b) TTL del token de reset (1 h). Un caller público puede acortar o, en escenarios de re-solicitud, reescribir esa marca.

**Decisión:**

- Añadir columna `password_reset_token_expires_at` (entity `passwordResetTokenExpiresAt`).
- `passwordResetExpiresAt` **solo** para credencial temporal (`passwordResetRequired`).
- `forgotPassword` escribe `passwordResetToken` + `passwordResetTokenExpiresAt`; **no** muta `passwordResetExpiresAt`.
- `resetPassword` valida `passwordResetTokenExpiresAt`.
- Si hay token de reset activo y se regeneran credenciales temporales, invalidar el token de reset (token=null, tokenExpires=null).

**No** se autentica forgot-password (sigue público + respuesta neutra OWASP).

### SEC-04 — App como dueño puede `DROP TRIGGER`

**Decisión:**

- Rol runtime `iwana_app` (o nombre alineado a compose): `CONNECT`, `USAGE` schemas, DML de negocio; **sin** ownership de `audit_logs` / `platform_audit_logs`.
- Ownership + DDL de audit: rol `iwana_migrator` (solo migraciones/CI).
- Triggers y función `reject_audit_mutation` owned by migrator; app no puede `DROP TRIGGER`.
- Dev Docker: documentar y aplicar el split; no dejar `POSTGRES_USER` = usuario de la API en prod/staging.

Control documental ≠ control: la migración 075/014 es necesaria pero insuficiente sin least-privilege.

### SEC-05 — PII en claro en audit inmutable vs Ley 1581

**Tensión:** RF-SEC-05 (audit 7 años append-only) vs derecho de supresión (Ley 1581 — **requiere verificación con fuente oficial / Legal**).

**Decisión inmediata (técnica, sin excepción de cumplimiento):**

- Ampliar saneado de `AuditInterceptor`: omitir/redactar claves PII (`documentNumber`, `document_number`, `phone`, `mobile`, `telefono`, `celular`, `nationalId`, etc.) además de secretos.
- Preferir hashes ya existentes (`emailHash`, etc.) en `newValue` cuando el dominio los tenga.

**Postura Legal (aprobada CTO 2026-07-19):**

| Opción | Descripción | Decisión |
| --- | --- | --- |
| A | Pseudonimizar PII en audit en escritura; ARCO vía escotilla `iwana.audit_maintenance` en migración revisable | **Aprobada** |
| B | Retención corta de `newValue` con PII y purga automática | Descartada |
| C | Excepción formal “audit exento de supresión” | Descartada |

### Barrido sistemático (patrón SEC-01) — cerrado como inventario

Entregable SEC-ENG: [`docs/security/SECURITY-REVIEW-TRANSVERSAL-AUDIT-RESPONSE-SWEEP-v1.0.md`](../security/SECURITY-REVIEW-TRANSVERSAL-AUDIT-RESPONSE-SWEEP-v1.0.md) (236/236 handlers; ~48 % profundidad).

**[DESEMPATE] SWEEP-01 — canal de audit** (2026-07-19)

| Posiciones | A) Allowlist de campos por `@AuditEntity` | B) `@SkipAudit` + un solo `auditService.log` mínimo en CUD con respuesta rica | C) Solo ampliar denylist PII |
| --- | --- | --- | --- |
| Decisión | **B en superficies P0** (Parties, Expedientes, Subscribers, Potentials, Users CUD que ya auditan a mano) **+ denylist PII ampliada como defensa en profundidad** (cubre SWEEP-02…09 y residual) | | |
| Justificación | SEC-ENG demostró que el interceptor **anula** audits manuales limpios. Solo denylist (C) no cierra el defecto estructural y es interminable (`value`, `*Email`, `*Encrypted`). Allowlist global (A) es correcta a largo plazo pero es cambio de contrato transversal → fase 2 / ADR si hace falta. B desbloquea G-SEC sin reescribir el modelo de audit. |
| Registro | Este informe §2; lista §7 del SECURITY-REVIEW |

**Claves PII mínimas a omitir en interceptor** (además del plan original): `value`, `whatsapp`, `nit`, `nitDv`, `fullName`, `firstName`, `lastName`, `displayName`, `legalName`, `address`, `birthDate`, `contactPhone`, `altContactPhone`, `adminEmail`, `contactEmail`, `emailPrimary`, `emailSecondary`, y cualquier clave que termine en `Encrypted` / `email` (case-insensitive). Ciphertext en audit = dato personal.

**G-SEC:** **GO** (Addendum A+B+C, 2026-07-19). ADR-058 y go ops/Legal A aprobados por CTO.

---

## 3. RACI de ejecución

| Trabajo | R | A | C | I |
| --- | --- | --- | --- | --- |
| Joi + previous key + job recifrado (código) | SR-FULL | EM-ARCH | SEC-ENG, PLAT-OPS | CTO |
| Runbook rotación / secrets / compose roles | PLAT-OPS | EM-ARCH | SR-FULL, SEC-ENG | CTO |
| Split TTL forgot-password | SR-FULL | EM-ARCH | SEC-ENG, QA | — |
| Least-privilege DB | PLAT-OPS | EM-ARCH | SR-FULL, SEC-ENG | CTO |
| Redacción PII audit | SR-FULL | EM-ARCH | SEC-ENG | Legal* |
| Barrido CUD | SEC-ENG | EM-ARCH | SR-FULL | QA |
| Aprobación ADR-058 / go recifrado / purge git | CTO | CTO | EM-ARCH, PLAT-OPS, SEC-ENG | **Hecho 2026-07-19** |

\* Legal = rol humano externo vía CTO (protocolo §1).

---

## 4. Entregas PLAT-OPS (2026-07-19)

| Entrega | Ruta |
| --- | --- |
| Runbook rotación AES | [`RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md`](../runbooks/RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md) |
| Runbook least-privilege | [`RUNBOOK-DB-LEAST-PRIVILEGE-v1.0.md`](../runbooks/RUNBOOK-DB-LEAST-PRIVILEGE-v1.0.md) |
| Init roles + event trigger | `docker/postgres/init/01-create-roles.sh`, `02-audit-least-privilege.sql` |
| Apply/verify idempotente | `scripts/db/apply-least-privilege.*`, `verify-app-cannot-drop-audit-trigger.*` |
| Env template | `.env.example` (`MFA_ENCRYPTION_KEY` vacío; `DB_APP_*` / `DB_MIGRATOR_*`) |

**Verificado PLAT-OPS en local:** `iwana_app` no puede `DROP TRIGGER` sobre audit; ownership en `iwana_migrator`.

**Handoff SR-FULL (cerrado 2026-07-19):** `DB_MIGRATOR_USER` / `DB_MIGRATOR_PASSWORD` cableados en `resolveMigrationDbCredentials` (`@iwana/db` data-source CLI + provisioning worker DDL). Runtime API/worker TypeORM permanece en `DB_USER` (`iwana_app` en modo estricto). Compat `pnpm dev` con `DB_USER=iwana` se mantiene por defecto (fallback si no hay migrator).

### 4.1 Ejecución lab + cierre staging/purge 2026-07-19 (PLAT-OPS)

Evidencia completa: [`INFORME-TRANSVERSAL-PLATOPS-EJECUCION-SEC-02-04-v1.0.md`](INFORME-TRANSVERSAL-PLATOPS-EJECUCION-SEC-02-04-v1.0.md) **v1.2**.

| Paso | Resultado |
| --- | --- |
| `apply-least-privilege` en `iwana_postgres_dev` | OK |
| `verify-app-cannot-drop-audit-trigger` | **PASS** (`42501`, owner `iwana_migrator`) — re-verify staging OK |
| Rotación MFA lab (CLI + pasos 4–7) | **GO completada** — dry-run 0 decrypt_errors; apply 6 filas; verify-active-only 0 fallos; PREVIOUS retirado |
| Staging (lab endurecido = surrogate; sin stack staging separado) | **CERRADO / GO** — opt-in `DB_USER=iwana_app` + `DB_MIGRATOR_*` documentado; default `pnpm dev` intacto |
| Prod `10.0.0.2:8080` | **NO-GO ejecución remota** — health timeout 5 s; checklist operador en informe PLAT-OPS §9 |
| Purge git (`.env.development` + literales clave débil) | **GO** — `git filter-repo --invert-paths`; path log vacío; 0 literales; force-push ramas contaminadas |
| Default compose / `pnpm dev` | Sin cambio forzoso a `iwana_app` (opt-in documentado) |

## 5. Gates

- G-SEC: **GO** — [`SECURITY-REVIEW-TRANSVERSAL-REMEDIACION-GSEC-v1.0.md`](../security/SECURITY-REVIEW-TRANSVERSAL-REMEDIACION-GSEC-v1.0.md) Addendum A+B+C+D. **GSEC-08 cerrado** (grants ledger migrator; PLAT-OPS v1.4).
- G-OPS: go CTO registrado; staging surrogate + purge **cerrados**; prod on-prem pendiente de operador en host (§9 informe PLAT-OPS).
- G-QA: tests unitarios del interceptor + auth forgot/reset/temp password; sin PII real en fixtures.

---

## 6. Escalación al CTO — **cerrada** (2026-07-19)

**[CIERRE ESCALACIÓN CTO]** Aprobado:

1. [ADR-058](../adrs/ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md) — Aprobado.
2. Go rotación/recifrado por entorno + purge git post-rotación (runbook).
3. SEC-05 Legal — opción A.
4. SEC-04 staging/prod — `iwana_app` + migrator obligatorios (checklist runbook).

**Lab + staging surrogate cerrados 2026-07-19:** SEC-04 verify **PASS**; rotación MFA lab **GO**; purge git **GO**. Detalle: [informe ejecución PLAT-OPS v1.2](INFORME-TRANSVERSAL-PLATOPS-EJECUCION-SEC-02-04-v1.0.md).

**Pendiente operador en prod on-prem (no bloquea merge lab/staging):** cuando `http://10.0.0.2:8080` sea reachable — backup → SEC-04 apply/verify → opt-in roles → rotación `pnpm encryption:reencrypt` → verify → retirar PREVIOUS → health (checklist §9 informe PLAT-OPS). Clones locales: **re-clonar** tras purge.
