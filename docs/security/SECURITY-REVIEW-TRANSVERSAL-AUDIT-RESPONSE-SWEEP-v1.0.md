# [SEC-REVIEW] Barrido transversal — respuestas CUD → `AuditInterceptor`

| Campo | Valor |
| --- | --- |
| **ID** | SECURITY-REVIEW-TRANSVERSAL-AUDIT-RESPONSE-SWEEP-v1.0 |
| **Fecha** | 2026-07-19 |
| **Autor** | AI-SEC-ENG (solo lectura) |
| **Orquestador** | AI-EM-ARCH |
| **Baseline** | OWASP ASVS L2 · Ley 1581 (PII) · RF-AUD / ADR-018 |
| **Alcance** | Inventario sistemático POST/PUT/PATCH/DELETE → `newValue` en audit; validación plan SEC-02…05 + ADR-058 |
| **Estado** | Informe accionable — **no aprueba ADR** (CTO) |

---

## 1. Resumen ejecutivo

El saneado de `AuditInterceptor` es una **denylist por nombre de clave** (patrón regex + `ALWAYS_OMITTED_KEYS = {email}`), aplicada solo a **valores string**, de forma recursiva. Cubre bien la familia de secretos ya alineada al patrón (`password`, `token`, `otp`, `qr`, `seed`, `recovery`, …). **No cubre PII** (`documentNumber`, `phone`, `whatsapp`, `nit`, `fullName`, …) ni alias de email (`adminEmail`, `contactEmail`, `emailPrimary`) ni el campo genérico `value` de `party_contact`.

Hallazgo estructural (P0): muchos servicios ya escriben audit “limpio” a mano, pero el interceptor **vuelve a persistir el cuerpo HTTP completo** en `newValue`. Eso anula el cuidado del servicio y deja PII/ciphertext en `<schema>.audit_logs` / `platform_audit_logs` (append-only).

| Métrica | Valor |
| --- | --- |
| Controladores Nest con CUD | 36 |
| Handlers `@Post`/`@Put`/`@Patch`/`@Delete` inventariados | **236** (100 % inventariados) |
| Cobertura profunda (identidad/CRM/auth/tenant/parties + contraste denylist) | **~48 %** de handlers (~113) |
| Cobertura triage por superficie de respuesta (resto inventory/WFM/commercial/assurance) | **~52 %** |
| Handlers con `@SkipAudit()` relevantes a secretos | `auth` MFA setup; `tenants/:id/regenerate-admin-credentials`; controllers de lectura de audit; platform-branding (clase) |

**Veredicto para AI-EM-ARCH**

| Tema | Veredicto SEC-ENG |
| --- | --- |
| Plan SEC-03 / SEC-04 / SEC-05 (informe remediación) | **Correcto en dirección**; SEC-05 con **gaps** (ver §5) |
| ADR-058 | **Recomendación go/no-go condicional** — no es aprobación (CTO) |
| Merge gate G-SEC (solo este barrido) | **No-go** hasta cerrar al menos P0 de PII en audit vía interceptor (o allowlist + SkipAudit en endpoints de emisión) |

---

## 2. Método de barrido (reproducible)

1. Contar handlers CUD:
   ```powershell
   Get-ChildItem -Recurse apps/api/src -Filter *.controller.ts |
     ForEach-Object {
       (Select-String -Path $_.FullName -Pattern '@(Post|Put|Patch|Delete)\(' -AllMatches).Matches.Count
     }
   ```
2. Listar exclusiones: `rg "@SkipAudit" apps/api/src`.
3. Leer `apps/api/src/modules/audit/audit.interceptor.ts` — `SECRET_KEY_PATTERN`, `ALWAYS_OMITTED_KEYS`, extracción de `data`, omisión de `newValue` en DELETE.
4. Para cada controlador de alto riesgo (auth, users, platform-users, tenant, parties, CRM, organization, media, habeas-data, purchasing/suppliers): inspeccionar tipo de retorno y campos string en DTOs/entidades expuestas.
5. Contrastar contra el predicado `isSecretEntry(key, value)`:
   - omitido si `key === 'email'` **exacto**, o
   - omitido si `typeof value === 'string'` y `SECRET_KEY_PATTERN.test(key)`.
6. Buscar `auditService.log` / `platformAuditService.log` manuales (doble escritura).
7. Confirmar presencia referenciable de clave débil: `rg "'0'\\.repeat\\(64\\)"` / documentación ADR-058 (sin volcar hex en este informe).
8. Validar SEC-03 en `AuthService.forgotPassword` / `resetPassword` / `hasExpiredTemporaryPassword`.
9. Validar SEC-04: migraciones `014`/`075` + `POSTGRES_USER` en `docker-compose.yml`.

**Criterio de riesgo**

| Severidad | Criterio |
| --- | --- |
| P0 | Secreto o PII en claro (o ciphertext útil con clave débil) en audit append-only; o anulación sistémica de sanitizado |
| P1 | PII/identificadores en audit con blast radius de tenant/plataforma; o decisión de remediación incompleta |
| P2 | Deuda de patrón / cobertura / defensa en profundidad sin exploit inmediato |

---

## 3. Modelo de amenaza (STRIDE — superficie audit)

| Amenaza | Vector | Impacto |
| --- | --- | --- |
| **I**nformation disclosure | ADMIN lee `audit_logs.newValue` | Credenciales temporales, seeds MFA (mitigado si patrón/`@SkipAudit`), cédulas, teléfonos, emails alias |
| **T**ampering | App owner DROP TRIGGER (SEC-04) | Borrado de evidencia / mutación audit |
| **E**levation | Compromiso `MFA_ENCRYPTION_KEY` débil (SEC-02) | Descifrado PII CRM + MFA + filas de audit con ciphertext |
| **R**epudiation | PII en audit vs ARCO (SEC-05) | Retención 7 años vs derecho de supresión — Legal/CTO |

---

## 4. Tabla de hallazgos (priorizada para SR-FULL)

| ID | Sev | Evidencia (archivo → campo) | Riesgo | Acción SR-FULL (guía) |
| --- | --- | --- | --- | --- |
| **SWEEP-01** | **P0** | Patrón sistémico: interceptor captura respuesta HTTP tras audit manual limpio. Ej.: `subscribers.service.ts` (manual sin PII) + `subscribers.controller.ts` `sanitizeResponse` expone `documentNumber`, `phone`, `whatsapp`, `nit`, `address`, `birthDate`, `altContactPhone` → `newValue` del interceptor. Igual en `potentials.service.ts` (manual solo `fullName`) vs `PotentialResponseDto.email`/`phone`. | PII en claro en audit inmutable; doble fila | **Allowlist** de `newValue` por entidad **o** `@SkipAudit()` + audit manual único; no ampliar solo denylist ad eternum |
| **SWEEP-02** | **P0** | `parties.controller.ts` POST/PATCH → `Party.documentNumber`, `birthDate`, `address`, `displayName`; `POST :id/contacts` → `PartyContact.value` (email/teléfono en claro; clave `value` **no** empareja patrón) | Cédula/contacto en audit | Redactar `documentNumber`/`value`/PII; cifrar at-rest coherente con ADR-030 si aún hay plaintext en create |
| **SWEEP-03** | **P0** | `expedientes.controller.ts` `PATCH :id/sections/:section` → respuesta de `updateSection` / `findById` con `documentNumber`, `phonePrimary`, `emailPrimary`, `altContactPhone`, … (descifrado en `expediente.service.ts`) | PII CRM núcleo en audit | No devolver PII descifrada en respuestas CUD auditables **o** SkipAudit + payload mínimo |
| **SWEEP-04** | **P1** | `users.controller.ts` POST / PATCH `me` / PATCH `:id` → `UserResponseDto`: `documentNumber`, `phone`, `firstName`, `lastName` (email sí se omite). `temporaryPassword` **sí** cae por patrón (`password`) | PII laboral en audit | Ampliar redacción PII; mantener secretos por patrón |
| **SWEEP-05** | **P1** | `users-bulk.controller.ts` POST `bulk` → `succeeded[].firstName/lastName` (+ email omitido; `temporaryPassword` omitido por patrón) | PII en lote | Idem; considerar no auditar cuerpo completo del bulk |
| **SWEEP-06** | **P1** | `tenant.controller.ts` POST/PATCH → `TenantResponseDto.contactEmail`, `adminEmail`, `nit`, teléfonos de perfil (alias `*Email` **no** están en `ALWAYS_OMITTED_KEYS`) | PII plataforma en `platform_audit_logs` | Omitir/redactar alias email + NIT; regeneración ya tiene `@SkipAudit` (OK) |
| **SWEEP-07** | **P1** | `crm/contacts` POST/PATCH → `emailEncrypted` / `phoneEncrypted` (ciphertext) + `fullName`. Claves `*Encrypted` **no** matchean denylist | Ciphertext PII en audit; explotable si clave débil (SEC-02) | Omitir `*Encrypted` y PII; no persistir ciphertext en audit |
| **SWEEP-08** | **P1** | `organization.service.ts` `sanitizeSiteForAudit` incluye `contactPhone`, `address`, `contactName` **y** el interceptor re-audita la respuesta del controller | Doble PII en audit org | Alinear sanitize manual + interceptor; redactar teléfono/dirección |
| **SWEEP-09** | **P1** | `inventory/purchasing.controller.ts` alta/lookup proveedores → `documentNumber`, `phone`, `email` vía party | PII terceros en audit compras | Misma política PII que Parties |
| **SWEEP-10** | **P2** | Denylist incompleta por diseño (comentario en interceptor L50–55). Campos futuros tipo `signingKey`, `clientId`+secreto mal nombrado, `signedUrl` (hoy solo GET) | Regresión tipo SEC-01 | Checklist en PR + test de contrato de respuesta; preferir allowlist |
| **SWEEP-11** | **P2** | `auth.controller.ts` login/refresh: `accessToken` cubierto por `token`; MFA setup ya `@SkipAudit`. Rutas públicas sin JWT omiten audit si no hay `TenantContext` — si middleware setea tenant por slug, se audita CREATE con flags (bajo riesgo si secretos omitidos) | Residual | Documentar; no bloquear |
| **SWEEP-12** | **P2** | Controllers inventory/WFM/commercial/assurance/tasks (~52 % handlers): respuestas tipicamente IDs/estado/SKU — riesgo PII bajo salvo campos libres (`notes`, direcciones en WFM) | Deuda | Barrido puntual de DTOs con `address`/`phone`/`notes` en fase 2 |

### Controles ya aceptables (no reabrir como P0)

| Endpoint / control | Estado |
| --- | --- |
| `POST auth/mfa/setup` | `@SkipAudit` + patrón `otp`/`qr` |
| `POST tenants/:id/regenerate-admin-credentials` | `@SkipAudit`; `temporaryPassword` también cubierto por patrón |
| `temporaryPassword` / `accessToken` / `otpauthUri` / `qrCodeBase64` | Cubiertos por `SECRET_KEY_PATTERN` (tests en `audit.interceptor.sanitize.spec.ts`) |
| DELETE | `newValue = null` (no filtra cuerpo) |

---

## 5. Validación del plan EM-ARCH (SEC-03 / 04 / 05) y gaps

### SEC-03 — Forgot-password vs TTL credencial temporal — **de acuerdo**

Evidencia: `auth.service.ts` `forgotPassword` escribe `passwordResetToken` + `passwordResetExpiresAt` (TTL token ~1 h); `regenerateTenantAdminCredentials` / temp password usan el **mismo** `passwordResetExpiresAt` con ventana 24 h (`hasExpiredTemporaryPassword`). Un forgot público puede acortar/pisar la marca de credencial temporal.

Decisión del informe (columna separada `passwordResetTokenExpiresAt`) es la correcta. Sin desacuerdo.

### SEC-04 — Least-privilege vs DROP TRIGGER — **de acuerdo; control aún incompleto**

Evidencia: `014_enforce_platform_audit_immutability.ts` / `075_enforce_audit_immutability.ts` (función `reject_audit_mutation` + triggers). `docker-compose.yml` usa un solo `POSTGRES_USER` (`iwana`) como superusuario de app en dev — ownership implica capacidad de `DROP TRIGGER`.

Decisión split `iwana_app` / `iwana_migrator` es correcta. Gap: **aún no aplicado** en compose/prod; la migración sola no basta (como ya dice el informe). Sin desacuerdo de diseño.

### SEC-05 — PII en `newValue` — **de acuerdo con gaps**

Decisión inmediata (redactar PII en interceptor) + escalación Legal A/B/C: correcta.

**Gaps / desacuerdos menores para AI-EM-ARCH**

1. La lista del informe (`documentNumber`, `phone`, `mobile`, …) es **insuficiente**. Faltan al menos: `value`, `whatsapp`, `nit`, `nitDv`, `fullName`, `firstName`, `lastName`, `address`, `birthDate`, `contactPhone`, `altContactPhone`, `adminEmail`, `contactEmail`, `emailPrimary`, `emailSecondary`, `*Encrypted`, `displayName`/`legalName` (según sensibilidad).
2. **Solo tocar el interceptor no cierra** los `auditService.log` manuales que aún meten PII (`organization.service` `contactPhone`, etc.).
3. El defecto estructural es **doble canal** (manual limpio + interceptor sucio). Remedio preferible: allowlist / `@SkipAudit` en CUD con respuesta rica, no denylist infinita.
4. Ciphertext en audit (`emailEncrypted`) sigue siendo dato personal cifrado; con SEC-02 es P0 compuesto.

### Barrido SEC-01 — **cumplido por este entregable**

### SEC-02 / ADR-058 — ver §6

---

## 6. ADR-058 — recomendación go/no-go (no aprobación)

**No apruebo el ADR** (reserva CTO). Recomendación AppSec:

| Fase ADR-058 | Recomendación SEC-ENG |
| --- | --- |
| 1. Fail-fast Joi (rechazar hex débil / entropía nula) | **GO código** — no requiere tocar datos; alinea ASVS gestión de claves |
| 2. `MFA_ENCRYPTION_KEY_PREVIOUS` + job recifrado | **NO-GO operativo** hasta go CTO por entorno (lab → staging → prod) |
| 3. Separar `PII_ENCRYPTION_KEY` | **GO diseño fase 2** tras rotación de emergencia |
| 4. Purge historial git | **NO-GO** hasta rotar todos los entornos vivos + decisión CTO |

**Confirmación clave de 64 ceros (sin dump)**

| Ubicación | Hallazgo |
| --- | --- |
| Specs de test | Presente como `'0'.repeat(64)` en p.ej. `users.service.spec.ts`, `contacts.service.spec.ts`, `potentials.service.spec.ts`, `expediente.service.spec.ts`, `platform-users.service.spec.ts`, `tenant-seed.service.spec.ts` |
| `docker-compose.yml` / `.env*` versionados | No se encontró literal de `MFA_ENCRYPTION_KEY` embebido en compose; no hay `.env` tracked en el barrido |
| Docs | ADR-058 e informe remediación describen el riesgo; `PLAN-MOD01-…` usa placeholder `CHANGE_ME_64_HEX_CHARS` (no hex de ceros) |
| `app.module.ts` | Joi solo `length(64)` — **sigue aceptando** clave de entropía nula hasta remediación |

Acción: PLAT-OPS/CTO deben correr secret-scan en historial git **sin** publicar el secreto en tickets. Los tests deben migrar a clave de test de alta entropía fija **solo de test** (no la de prod).

---

## 7. Lista accionable priorizada (SR-FULL)

### Sprint inmediato (bloquea G-SEC)

1. **SWEEP-01**: Decidir con EM-ARCH — (A) allowlist de campos auditables por `@AuditEntity`, o (B) `@SkipAudit` en handlers cuya respuesta trae PII y un único `auditService.log` con payload mínimo.
2. **SWEEP-02 / 03 / 04**: Redacción PII en interceptor **más** revisión de respuestas CUD de Parties, Expedientes, Users, Subscribers.
3. Ampliar `audit.interceptor.sanitize.spec.ts` con casos PII (no solo secretos) y caso `PartyContact.value`.
4. SEC-03: migración columna `password_reset_token_expires_at` + desacoplar forgot/reset (según informe).
5. SEC-02 código: validación entropía Joi (ADR-058 §1) — sin recifrado.

### Siguiente ciclo (PLAT-OPS + SR-FULL)

6. SEC-04 least-privilege roles DB.
7. Recifrado / rotación — solo con go CTO (ADR-058).
8. Barrido fase 2 WFM/notes/address (SWEEP-12).
9. Inventario y saneado de `newValue`/`oldValue` en llamadas manuales a `auditService.log`.

### Escalación abierta (ya en informe EM-ARCH)

- CTO: go recifrado entornos + purge git.
- CTO + Legal: postura ARCO vs RF-SEC-05 (opción A recomendada por EM-ARCH — SEC-ENG **concurre**).

---

## 8. Cobertura declarada

| Capa | Cobertura aprox. |
| --- | --- |
| Inventario de handlers CUD | **100 %** (236/236) |
| Revisión profunda de riesgo secretos/PII en respuesta | **~48 %** (módulos identidad, auth, tenant, CRM, parties, org, media, habeas, purchasing) |
| Triage de bajo riesgo por tipo de payload | **~52 %** restante |
| Confianza global del barrido para priorización P0/P1 | **Alta** en superficie audit; residual P2 en módulos operativos |

---

## 9. Referencias

- `apps/api/src/modules/audit/audit.interceptor.ts`
- `apps/api/src/modules/audit/tests/audit.interceptor.sanitize.spec.ts`
- `docs/informes/INFORME-TRANSVERSAL-REMEDIACION-SEC-02-05-v1.0.md`
- `docs/adrs/ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md` (**Aprobado** CTO 2026-07-19 — ver GSEC Addendum C)
- Migraciones `packages/database/src/migrations/public/014_*.ts`, `tenant/075_*.ts`

---

## 10. Cierre

| Pregunta | Respuesta |
| --- | --- |
| ¿Hay P0 nuevos además del patrón SEC-01? | **Sí** — PII/ciphertext vía interceptor (SWEEP-01…03), no solo nombres de secreto |
| ¿El plan SEC-03/04/05 es sano? | **Sí**, con gaps documentados en SEC-05 |
| ¿ADR-058? | **Aprobado** CTO 2026-07-19 (histórico de este barrido: fail-fast GO / ops pendiente → superado) |
| ¿Este agente implementó remediación? | **No** (solo lectura / informe) |

**[ESCALACIÓN DE SEGURIDAD]** — Cerrada en GSEC Addendum C (CTO 2026-07-19). Remediación SWEEP/SEC consolidada en `SECURITY-REVIEW-TRANSVERSAL-REMEDIACION-GSEC-v1.0.md` (**GO**).

— AI-SEC-ENG
