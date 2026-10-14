# INFORME — Privacy Fase 1a · R6: specs B5 y fase2 independientes del entorno

**Versión:** 1.0
**Fecha:** 2026-10-14
**Emisor:** `sr-backend` (bloque R6, prompt v1.3 §5)
**Base:** plan v1.6; `AGENTS.md` → Gates Before Merge; skills `testing-patterns`, `postgresql`, `iwana-test-evidence` (leídas como documentación antes de escribir).
**Ruta:** verificada libre antes de escribir (`Test-Path …INFORME-PRIVACY-FASE-1A-R6-v1.0.md` → `False`).

## 1. Propiedad y alcance

Propiedad exclusiva, sin excepciones:

- `apps/api/src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts`
- `apps/api/src/modules/crm/subscribers/subscribers.controller.fase2.http.spec.ts`

Solo tests. No se tocó código de producción ni contratos (`git diff --stat` del bloque: únicamente esos dos specs; el resto del árbol ya venía modificado por la sesión de orquestación). Ninguna aserción eliminada: conteo `it(`/`expect(` idéntico antes/después — B5 72/72, fase2 32/32.

## 2. Cambios

### 2.1 B5 — independiente del estado de migración del tenant de origen

Causa (confirmada en CI, ver §4): el `beforeAll` clona con `LIKE … INCLUDING ALL` y luego repetía el estado pre-143 con `ADD COLUMN` sin `IF NOT EXISTS` → `42701 column already exists` con el tenant migrado.

- `ADD COLUMN IF NOT EXISTS` en las 7 altas (143: `document_number_hmac`, `value_encrypted`, `value_hmac`, `whatsapp_encrypted`, `whatsapp_hmac`; 144: `service_usage`, `installation_stratum`, `stratum_evidence_media_id`, `vat_snapshot`).
- `CREATE UNIQUE INDEX IF NOT EXISTS` en `uq_party_document_hmac_active` y `uq_subscribers_expediente`; `CREATE TABLE IF NOT EXISTS` en el clon y en `crm_conversion_failures`.
- Purga determinista de duplicados: `LIKE INCLUDING ALL` copia los índices del origen con **nombre autogenerado** (`subscribers_expediente_id_idx`, inexistente en el repo — verificado por búsqueda), mientras producción (`subscribers.service.ts:1366`, `isExpedienteUniqueViolation`) reconoce el conflicto de concurrencia por el nombre `uq_subscribers_expediente`. Sin la purga, el test «dos conversiones concurrentes…» falla con el clon migrado aunque el `IF NOT EXISTS` pase (reproducido en local: 15/16 antes de la purga, 16/16 después). La purga consulta `pg_indexes` y elimina (`DROP INDEX IF EXISTS`) los únicos sobre `subscribers(expediente_id)` distintos de `uq_subscribers_expediente`. Es normalización del fixture al estado definido por migraciones; producción queda intacta y es correcta (en schemas migrados reales el índice se llama `uq_subscribers_expediente` — verificado en `tenant_iwana` y `tenant_test_s2_live`).

### 2.2 fase2 — sincronización determinista (`:514`)

El test «espera LIST_ACCESS antes de responder el listado» dormía 10 ms fijos y luego afirmaba la llamada de auditoría: sensible a carga (el informe GATES v1.1 ya registró su fallo en una corrida global `--no-cache`). Reemplazado por polling acotado (deadline 5 s, paso 5 ms) hasta observar `action: 'LIST_ACCESS'` en `auditMock.log.mock.calls`; el resto del test (respuesta no resuelta hasta liberar la auditoría, `status 200` final) no cambia.

## 3. Evidencia local (conteos reales, sin caché)

| Comprobación | Comando | Resultado |
| --- | --- | --- |
| B5 contra `dbiw` migrada (slug `iwana`; `tenant_iwana` trae columnas 143/144) | `E2E_TENANT_SLUG=iwana jest --config jest.integration.config.js b5…` | **16/16 pass** (1 suite) |
| B5 con `E2E_TENANT_SLUG=test` sobre base migrada (espejo `tenant_test` clonado de `tenant_iwana`; fila y schema eliminados después, verificado sin residuos) | `E2E_TENANT_SLUG=test jest --config jest.integration.config.js b5…` | **16/16 pass** (1 suite) |
| fase2 5 veces seguidas `--no-cache --runInBand` | `jest …fase2.http.spec.ts --no-cache --runInBand` ×5 | **22/22 en las 5 corridas** |
| API completa sin caché | `pnpm exec turbo run test --filter=@iwana/api --force` | exit 0; **372 suites pass / 4 skip; 4963 tests pass / 15 skip; 0 cached** |
| Lint + typecheck API sin caché | `pnpm exec turbo run lint typecheck --filter=@iwana/api --force` | exit 0; 8/8 tareas, 0 cached; warnings api 7 / db 5 (preexistentes, iguales a GATES v1.1; cero en los specs tocados) |

## 4. CI de `main` (solo lectura)

Corrida `38644689892` (HEAD `ee5e494d`, **sin** el parche R6 — mis cambios están sin commitear), concluida `failure`:

- Unit tests + cobertura: verde (api 372 pass / 4 skip, 4963 pass / 15 skip — idéntico al local; db 65/65 con `PASS src/migrations/public/027_media_usage_privacy_evidence.spec.ts`; portal 298/2998; shared 18/168).
- «Integration tests — migración 089»: **`PASS src/migrations/public/027_media_usage_privacy_evidence.integration.spec.ts`** (2026-10-14T22:14:28Z) — 28/28 suites, 106/106 tests. Primera corrida real de la 027 en CI. **[Cita 027 solicitada.]**
- «Integration tests — API R2.3»: FAIL con 2 suites en rojo:
  - `FAIL src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts` — `TYPEORM_QUERY_ERROR operation=ALTER sqlstate=42701`, `QueryFailedError: column "document_number_hmac" of relation "party" already exists` (traza: `b5-…spec.ts:335`). Confirma el diagnóstico del prompt v1.3 §5 sobre código sin parche. **[Sin cita de PASS B5 en CI: no existe todavía; corresponde a la corrida posterior al push.]**
  - `FAIL src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts` — ver §5.

## 5. [BLOQUEO] parcial — «CI en verde» no cierra solo con R6

`contracts.service.postgres.integration.spec.ts` falla con `42703: column Subscriber.party_id does not exist` (producción `contracts.service.ts:105-107` selecciona `partyId` y exige autorización contractual; el fixture del spec construye `subscribers` a mano, sin `party_id`, `contracts…spec.ts:171`). Reproducido en local contra `dbiw` migrada: 18/19 (1 failed), idéntico sqlstate. En la corrida `38562247928` ese spec pasaba; la deriva entra con `ee5e494d` (integración privacy de Q5/R5).

- No es mi propiedad (exclusiva: B5 + fase2) y no lo toco.
- Producción es correcta (`party_id` existe en schemas migrados; B5 lo selecciona sin error), así que no emito bloqueo de producción sino de alcance: el fix (añadir `party_id` al fixture de ese spec) pertenece a la línea D-PDF/Q5.
- Consecuencia: el criterio «tras el push del CTO, el CI de `main` está en verde» queda abierto hasta (a) push de este R6, (b) fix del fixture de contracts por su dueño, (c) corrida CI verde que aporte la cita PASS de B5. Ningún G6.5 se declara.

## 6. Cierre R6

- Verde en local con conteos reales: B5 16/16 en ambos slugs, fase2 5×22/22, API `--force` 372/4963, lint+typecheck 8/8.
- Sin commitear (el push es del CTO, según encargo). Archivos del bloque: los dos specs; este informe.
- Pendiente fuera de R6: push del CTO, fix del fixture de contracts (dueño D-PDF/Q5), corrida CI verde con citas PASS de B5 y 027 en la misma corrida.
