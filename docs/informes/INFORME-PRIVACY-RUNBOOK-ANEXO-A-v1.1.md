# Informe F3 — Anexo A de anonimización de titulares v1.1

**Fecha:** 2026-10-15  
**Resultado de implementación:** implementación y verificación focal completadas; pendiente revisión de seguridad.  
**Alcance:** `apps/api/src/cli/anonymize-titular*` y Anexo A de `RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.0.md`.  
**No se modificó:** módulos productivos, DDL, `audit_logs`, `data_authorizations`, solicitudes ni Billing.

## Decisiones de identidad aplicadas

Se implementaron las resoluciones A-1, A-2 y A-3 de `PROMPT-MOD05-E3-CONTACTO-PENDIENTE-v1.0.md` §6.3:

- Se consulta `potential_leads` solo para comprobar existencia y contar filas; si contiene filas se aborta antes de escribir. No se hace matching ni DML sobre esa tabla.
- `--request` recibe el UUID de `data_subject_requests.id`, ya que la entidad no modela un número separado. El Party se obtiene solo de `request.party_id`; los expedientes se especifican con `--expediente` repetible. HMAC ausente o discordante requiere `--confirm-unmatched` y motivo escrito previamente en el ticket.
- `subscribers.user_id` solo permite incluir cuentas con `users.deleted_at IS NOT NULL`. Una cuenta activa aborta. Los campos personales del perfil se limpian y el correo se reemplaza por `anon+<user UUID>@anon.invalid`.
- `users.email_hmac` es `NOT NULL + UNIQUE` desde la migración 108: se recalcula con `PII_HASH_KEY` para el correo sintético único y nunca conserva el HMAC anterior. Los demás HMAC del titular quedan `NULL`.
- Para ciphertexts históricos `NOT NULL`, se escribe `ANONIMIZADO` cifrado con `MFA_ENCRYPTION_KEY`; para columnas cifradas nullable se usa `NULL`. La verificación descifra en memoria con la clave activa o previa y no emite plaintext/ciphertext.
- `data_subject_requests` y `data_authorizations` se leen únicamente para resolver alcance/evidencia; no se escriben. Se conserva la evidencia de solicitud. Media conserva su registro y recibe solo soft-delete cuando no comparte uso ni evidencia protegida.

## Implementación

El CLI valida flags, tenant/schema y UUIDs; usa dry-run por defecto, `--apply` explícito, una sola transacción tenant con `SET LOCAL search_path`, preflight de cuentas activas y `potential_leads`, valores idempotentes y verificación posterior. Solo informa modo, conteos y estado; no imprime IDs de solicitud/expediente/tenant, PII, HMAC, ciphertext ni errores crudos del driver.

El inventario de columnas, el flujo de operación y la consulta SQL suplementaria de residuos HMAC están en el Anexo A del runbook. La integración prepara un schema sintético desde cero y no depende del estado de migraciones tenant del origen.

Durante la integración se detectó que TypeORM/PostgreSQL representa `UPDATE ... RETURNING` como `[filas, rowCount]`. El código inicial contaba los dos elementos del resultado como filas, por lo que podía informar `changed.users=2` para un único usuario y también marcar cambios en una repetición idempotente. El CLI ahora extrae las filas devueltas y cuenta IDs únicos por tabla. El caso de cuenta dada de baja comprueba `totals.users=1` y `changed.users=1`; la repetición del prospecto comprueba cero cambios. Para repetir tras el primer apply, un expediente con HMAC ahora nulo solo se reconoce como ya anonimizado si la verificación completa de todos los campos inventariados confirma cero residuos. Un expediente con HMAC ausente y datos residuales sigue siendo unmatched y requiere confirmación explícita.

## Evidencia disponible

- Unit test focal del parser: `pnpm --filter @iwana/api exec jest src/cli/anonymize-titular.spec.ts --runInBand` — **1 suite, 3 tests aprobados**.
- Typecheck API: `pnpm --filter @iwana/api typecheck` — **exit code 0**.
- Lint API: `pnpm --filter @iwana/api lint` — **exit code 0**, siete warnings preexistentes en otros archivos; sin errores.
- Integración PostgreSQL real: `$env:IWANA_DB_INTEGRATION_AVAILABLE='true'; pnpm --filter @iwana/api exec jest --config jest.integration.config.js src/cli/anonymize-titular.postgres.integration.spec.ts --runInBand` — **1 suite, 5 tests aprobados**. Incluye prospecto con dry-run/apply/repetición, ex-suscriptor con cuenta dada de baja, aborto de cuenta activa, aborto por `potential_leads` poblada y rechazo de HMAC ausente con datos residuales. Se ejecutó contra `dbiw` en `127.0.0.1:5433`, usando schemas sintéticos creados y eliminados por cada caso.
- No se ejecutaron Turbo tests ni suites adicionales que compartan la DB. No hubo cambios de schema y no se hizo commit.

## Siguiente control

El agente padre coordina la revisión de seguridad de `sec-eng` antes del gate G7. La verificación PostgreSQL y los controles focales reportados arriba sí concluyeron; no se declara aprobado el gate completo hasta cerrar esa revisión.
