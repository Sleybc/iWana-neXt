# PROMPT DE EJECUCIÓN — P1: hashes con clave y cierre de la fuga de PII al audit trail

**Módulos:** MOD05 CRM · Auditoría transversal · `packages/database`
**Código:** SEC-P1
**Versión:** 1.0
**Fecha:** 2026-08-05
**Generado por:** AI-EM-ARCH (modo Architect + Orchestrator)
**Agente destinatario:** AI-SR-FULL
**Revisor obligatorio:** AI-SEC-ENG (auditor del hallazgo) · AI-SR-QA (cobertura)
**ADR habilitante:** [ADR-078 (propuesto)](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) D3/P1 · [ADR-058](../adrs/ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md)
**Origen del hallazgo:** [INFORME-PLAT-OPS-G7-FASE-01-v1.0.md](../informes/INFORME-PLAT-OPS-G7-FASE-01-v1.0.md) §4 (S-1, S-2)

---

## 0. Contexto (ya diagnosticado — no rehacer)

El CTO determinó el 2026-08-05 que `tenant_iwana` contiene PII de una persona real. Estos
dos defectos **no dependen de ninguna decisión de infraestructura pendiente** y son los
primeros de la cola por eso, y porque S-2 empeora cada día.

**S-1 — Hashes deterministas sin clave.** `document_number_hash`, `email_hash` y
`phone_hash` se calculan con SHA-256 crudo, sin sal ni clave:

- `apps/api/src/common/crypto/hash-document.util.ts:9`
- `apps/api/src/common/crypto/hash-email.util.ts:8`
- `apps/api/src/modules/crm/subscribers/subscribers.service.ts:978-980`
- `packages/database/src/migrations/shared/backfill-expediente-document-number-hash.util.ts:14`

Una cédula colombiana y un móvil de 10 dígitos son espacios enumerables por completo. Con
lectura de la tabla se recuperan **por fuerza bruta offline sin poseer la clave AES**. El
cifrado en reposo protege frente al volcado de una columna, no frente al de la tabla.

El repositorio ya usa HMAC con secreto donde el riesgo se entendió:
`apps/api/src/modules/tasks/services/execution-order-reliability.service.ts:244`.

**S-2 — PII en `audit_logs`, que es inmutable.** Dos causas distintas:

1. **Ruta que evade el control.** `AuditService.log()` documenta que la sanitización es
   responsabilidad del llamador (`apps/api/src/modules/audit/audit.service.ts:19-20`) y no
   aplica denylist. La denylist vive solo en `AuditInterceptor`. `expediente.service.ts:585-595`
   llama directo con `fullName` — y hay **13 llamadas directas** en ese archivo.
2. **Hueco en la denylist.** `latitude` y `longitude` nunca estuvieron en
   `ALWAYS_OMITTED_KEYS` ni en `PII_KEY_SUFFIX_PATTERN` (`audit.interceptor.ts:64-136`,
   `:185`). Hay filas `Wfm | CREATE` con coordenadas del domicilio, la última del
   **2026-08-03**.

`audit_logs` es append-only por trigger, así que **la PII filtrada no se borra por la vía
normal**.

---

## 1. Mecanismos que ya existen — úsalos, no inventes

**Para S-2 retroactivo.** El trigger `reject_audit_mutation`
(`packages/database/src/migrations/tenant/075_enforce_audit_immutability.ts:66-69`) tiene
una vía de escape deliberada y documentada:

```sql
SET LOCAL iwana.audit_maintenance = 'on'
```

Y las migraciones `077_redact_residual_audit_pii.ts` y `078_redact_audit_pii_suffix_gap.ts`
ya implementan la redacción con `iwana_is_sensitive_audit_key` e
`iwana_redact_sensitive_audit_jsonb`. **Replica ese patrón**; no diseñes uno nuevo.

**Para S-1 backfill.** `backfill-expediente-document-number-hash.util.ts` ya descifra desde
una migración cargando la clave de env, en lotes, sin loguear el valor. **Reutiliza esa
utilidad**; el trabajo es cambiar la primitiva de hash, no el andamiaje.

---

## 2. Decisiones de arquitectura (tomadas — no las reabras)

### D-A. Clave de hash dedicada e independiente: `PII_HASH_KEY`

**No** reutilices `MFA_ENCRYPTION_KEY`: amplía el blast radius que ADR-058 quiere reducir.
**No** derives la clave de hash de la clave de cifrado por HKDF, aunque sea elegante: si
están acopladas, **rotar el cifrado obligaría a recalcular todos los hashes**, y sus ciclos
de rotación son legítimamente distintos.

`PII_HASH_KEY` es una variable nueva, 64 hex, con el mismo contrato de validación fail-fast
que `MFA_ENCRYPTION_KEY` (`apps/api/src/common/crypto/aes-gcm.util.ts:54-68`), incluida la
detección de entropía nula.

### D-B. Expand / contract, no reemplazo en sitio

Columnas nuevas en paralelo (`*_hmac`), backfill, cambio de lectura, y solo después
retirada de las viejas. Hoy hay 1 registro y sería trivial hacerlo de golpe; el diseño
debe ser correcto para miles de tenants, no para este dato.

**La retirada de las columnas SHA-256 es parte del alcance**, no una fase futura: mientras
existan, el defecto sigue explotable.

### D-C. La sanitización se muda a `AuditService.log()`

El control debe estar donde ninguna ruta pueda evadirlo. El interceptor conserva su
denylist, pero deja de ser el único punto que la aplica. Invertir la responsabilidad
declarada en `audit.service.ts:19-20` es el objeto de este trabajo.

### D-D. Rotación de `PII_HASH_KEY` exige backfill completo, y se declara

Es la consecuencia aceptada de D-A. **Documéntala** en el runbook de rotación; no la
resuelvas con una columna de versión de clave en este corte — eso es diseño adicional que
requiere ADR propio.

---

## 3. Alcance

| # | Trabajo | Rol |
| --- | --- | --- |
| **E0** | Test que demuestre el defecto S-1 **antes** de corregirlo: dado un hash SHA-256 y un espacio de cédulas acotado, el valor se recupera por enumeración. Debe pasar a fallar tras E1 | AI-SR-QA |
| **E1** | `PII_HASH_KEY` + HMAC-SHA-256 en los cuatro puntos citados, con validación fail-fast | AI-SR-FULL |
| **E2** | Migración tenant: columnas `*_hmac`, backfill descifrando en lotes, índices equivalentes | AI-SR-FULL |
| **E3** | Cambio de lectura a las columnas nuevas y **retirada** de las SHA-256, en migración separada de E2 | AI-SR-FULL |
| **E4** | Sanitización mudada a `AuditService.log()`; el interceptor deja de ser el único punto | AI-SR-FULL |
| **E5** | `latitude`, `longitude` y campos de texto libre (`description`, `title`, `sector`, `municipality`) añadidos a la política de redacción | AI-SR-FULL |
| **E6** | Migración de redacción retroactiva replicando 077/078, con `iwana.audit_maintenance` | AI-SR-FULL |
| **E7** | Test que falle si un servicio pasa una clave de PII a `auditService.log()` — la red que impide la reintroducción | AI-SR-QA |

### Fuera de alcance

- S-3 (ampliar el cifrado a identidad, domicilio, geolocalización) y **S-4** (ADR-058
  fase 2): relacionados pero con decisión de alcance propia. No los acoples aquí.
- Columna de versión de clave de hash (ver D-D).
- Cualquier cosa de infraestructura, dominio o TLS.

---

## 4. Restricciones duras

1. **El backfill descifra PII en memoria.** Nunca la escribas en logs, en mensajes de
   error, en la salida de la migración ni en un archivo temporal. Lotes, sin volcados.
2. **No cambies el trigger de inmutabilidad.** Usa la vía de escape que ya provee.
3. **La redacción retroactiva es irreversible.** Su `down` no puede restaurar el valor
   original — decláralo explícitamente en la migración, como hacen 077/078.
4. **Migraciones reversibles** en todo lo demás, con `down` funcional y numeración
   correlativa (la última es 107).
5. Si una migración usa `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN`, **regístrala en
   `MIGRATIONS_REQUIRING_DESTRUCTIVE_FLAG`** de `revert.ts`: hay un test de gobernanza que
   lo verifica y ya falló una vez por omitirlo.
6. **El `down` de una migración que recastea una columna con `DEFAULT` debe hacer
   `DROP DEFAULT` antes del `ALTER COLUMN TYPE` y restituirlo después.** Precedente
   verificado contra PostgreSQL en la migración 107.
7. Sin PII en tests: usa documentos y correos sintéticos.
8. Multi-tenant: el backfill recorre schemas de tenant; ningún cruce entre ellos.

---

## 5. Criterios de aceptación

1. El test E0 pasa antes de E1 y **falla** después: el valor ya no es recuperable sin la
   clave.
2. Sin `PII_HASH_KEY`, la aplicación **no arranca** en producción, con mensaje explícito.
3. Búsqueda por documento, correo y teléfono sigue funcionando de forma determinista.
4. Tras E3 no queda ninguna columna `*_hash` SHA-256 ni ninguna referencia a
   `crypto.createHash('sha256')` sobre PII.
5. Una llamada directa a `auditService.log()` con `fullName`, `latitude` o `longitude`
   **no** persiste esos valores.
6. Tras E6, ninguna fila de `audit_logs` conserva nombre del titular ni coordenadas.
   Verificable por consulta.
7. El trigger de inmutabilidad sigue activo y sigue rechazando mutaciones fuera de
   mantenimiento: test que lo demuestre.
8. E7 falla si alguien reintroduce una clave de PII en una llamada directa.
9. `pnpm lint`, `pnpm typecheck` y las suites de `apps/api` y `packages/database` en verde
   **con `Cached: 0`**. Baseline conocido: 21 fallos preexistentes en
   `clamp-page-endpoints.controller.http.spec.ts` — no deben aumentar.
10. `node scripts/audit-adr-citations.mjs docs/` en BLOQUEANTE: 0.

---

## 6. Evidencia de cierre

- Salida de tests con `Cached: 0`.
- Consulta que demuestre el criterio 6 sobre `tenant_iwana`, en conteos — **nunca valores**.
- Confirmación de que las columnas SHA-256 ya no existen.
- Informe en `docs/informes/` con el estado de S-1 y S-2, y la nota de rotación de D-D.

---

## 7. Cuándo detenerte y escalar

- El backfill no puede descifrar algún registro (clave rotada, formato inesperado): **no
  lo omitas en silencio** — un hash sin backfill es una búsqueda rota.
- Concluyes que retirar las columnas SHA-256 rompe una integración no prevista.
- La redacción retroactiva afectaría a filas cuyo valor no es PII y se perdería
  trazabilidad legítima.
- Detectas más rutas que evaden la sanitización fuera de `expediente.service.ts`.
