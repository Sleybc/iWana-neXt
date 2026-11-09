# INFORME — `privacy` · H-EXP Fase 1 · Anonimizar al vencer la retención · Cierre

**Versión:** 1.0
**Fecha:** 2026-11-09
**Autor:** AI-DOCS (B5)
**Estado:** Construcción de la Fase 1 cerrada: G6 y G6.5 GO. **G7 sigue bloqueado** (§5): el job aún no está habilitado ni demostrado en operación
**Spec:** [2026-11-07-privacy-h-exp-retencion-spec.md](../specs/2026-11-07-privacy-h-exp-retencion-spec.md) v1.1 · **Plan:** [orquestación](../plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md) v1.0 · **ADRs:** [ADR-104](../adrs/ADR-104-Enmienda-ADR-094-D7-Retencion-PQR-y-Veracidad.md), [ADR-105](../adrs/ADR-105-Jobs-de-Dominio-Procesados-en-la-API.md) · **HLD:** [Privacy v1.6](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.6.md)

## 1. Resultado

Un titular con `DATOS_BLOQUEADOS` cuyo deber de conservación vence se anonimiza sin radicar otra solicitud y sin reescribir la resolución `NO_PROCEDENTE` histórica. Los prospectos descartados sin contrato vencen a los 24 meses con reloj propio (`PQR_SOPORTES`, 3 años desde la respuesta, ADR-104). Las solicitudes terminales se minimizan a metadatos a los 5 años, con `closed_at` explícito y backfill determinista para `TRASLADADA`/`DESISTIDA`. Cada objetivo deja su fila en el ledger `privacy_retention_expiry_runs` (migración tenant 179), que es la garantía de idempotencia. El barrido lo ejecuta un job diario procesado en la propia API (ADR-105, opción B) y el mismo motor expone el CLI `privacy:expire-retention` con dry-run por defecto. CA-EXP-01 a 09 y 12 a 16 demostrados; CA-EXP-10 y 11 quedan para la Fase 2.

## 2. Olas, commits y gates

| Ola | Contenido | Gate |
| --- | --- | --- |
| B1+B2 | Motor y relojes (`privacy/retention/`, `ConservationDutyService` extraído de `requests.service.ts`), puertos CRM/Billing/Assurance, migración 179, minimización de solicitudes (D-EXP-3), `@Processor`, payload Zod, CLI | G2 ✅ 2026-11-08 (shared 32/491 · db 78/426 · api 488/6427; integración db 55/172, api 77 suites / 531 tests) |
| B2-R | R1–R4 en la 179 sin publicar (decisión del CTO): `reason` y `requester_evidence_media_id` solo hacia `NULL` bajo minimización, `minimized_at` monótono en estado terminal | G2 ✅ (db 55/176; api 77/531) |
| B3 | Suite `retention-expiry-b3` (CA-EXP-01 a 09 y 12 a 16) | G3 ⛔ → ✅ tras B2-R2 (api 79 suites / 568 tests, 0 rojas; B3 16/16) |
| B2-R2 | Alcance explícito del prospecto (`resolveProspectScope` con `FOR UPDATE`, sin ampliar por HMAC) y `reason_code` durable en el ledger | Incluido en G3 ✅ |
| B2-R3 + B2-R4 | B1 (vía puerto CRM), P2a (R4 ampliada), P2b (`BEFORE TRUNCATE` en cuatro tablas), P3 (`request_id` `NULL`); P1 residual cerrado en B2-R4 (caso mixto + métodos abstractos) | G2 ✅ (api 80 suites / 575 tests; suite mixta 7/7) |
| B4-R2 | M-1 (409 solo cuando nada más justifica conservar), M-2 (reloj completo `PQR_SOPORTES` al prospecto), B-1, B-3, B-5 | G6 ✅ 2026-11-08 |
| CI-PIIKEY | 4 specs con clave sintética propia (8 líneas cada una) | G2 ✅ (27/27 con `PII_HASH_KEY` ausente) |
| B5-P3 | Sin guardas `?.bind` muertas; `selectProspectos` no conciliado → `ATTENTION_REQUIRED` | G2 ✅ 2026-11-09 (6 suites 37/37; integración 83 suites / 570 pasadas) |

| Commit | CI | G6.5 |
| --- | --- | --- |
| `81c9be55` | 42536520408 🔴 (job «Integration tests — API»: 4 suites, 14 pruebas H-EXP, «PII_HASH_KEY es requerida») y 42544794538 🔴 | ⛔ 2026-11-08 |
| `b48b2ba7` | 42548805100 ✅ (los 5 jobs en `success`) + E2E Web Admin Smoke 42548805121 ✅ | ✅ 2026-11-08 |

G0: spec §10 puntos 1 a 4 y ADR-105, CTO 2026-11-07. P2 (R1 de G7) cerrada al lanzar: `requests.service.ts` sin diff; el diff ajeno de H-1 en el manifiesto (región distinta) no bloqueó.

## 3. Cifras

G6 (§1.10 del plan, PostgreSQL nuevo):

| Medida | Valor |
| --- | --- |
| Unitarias sin caché | shared 32/491 · db 78/426 · api 488/6451 · portal 348/3479 |
| Integración `@iwana/db` | 55/178 en 62 s |
| Integración `@iwana/api` | 82 suites / 588 tests, 0 rojas, 3 suites omitidas = lista esperada, en 371 s |
| Typecheck / lint | 8/8; ESLint y Prettier limpios salvo `next-env.d.ts` generados (fuera del commit) |
| `pnpm audit --prod` | Sin críticas |
| Revisiones | `sec-eng` (M-1 y M-2 cerrados, sin Crítico ni Alto) · `boundary-reviewer` (B1 cerrado) · `contract-drift-reviewer` (sin deriva) · `test-change-reviewer` (6/6 ajustes exigidos) |

G6.5 (CI 42548805100 sobre `b48b2ba7`): 5 jobs en `success` (imágenes, citas ADR, Lint + Typecheck + Build + Unit tests, E2E R4.1, E2E portal). Integración de la API: 82 suites pasadas y 3 omitidas (lista esperada); 569 pruebas pasadas, 19 omitidas, 0 fallos.

## 4. Errores encontrados por el camino

Se dejan porque explican varias reglas del proyecto.

- **Prospectos nunca anonimizados (B3, CA-EXP-12 positivo):** `processProspecto` pasaba un objetivo sin `partyId` ni HMAC, `resolve()` del adaptador CRM no derivaba candidatos y `sameSet` lanzaba; todo prospecto vencido terminaba en `PARTICIPANT_ERROR`. Lo cerró B2-R2 con alcance explícito del prospecto en el puerto de supresión, revalidado con `FOR UPDATE`. Origen: el puerto no declaraba el alcance del prospecto y el servicio lo llamaba como si fuera un titular.
- **P1 mixto (B2-R3 → B2-R4):** el reloj contractual y el fiscal marcaban incidencia solo si *ningún* reloj tenía fecha (`terminalWithClock === 0`, `withDate === 0`). Con un contrato terminado con fecha antigua y otro sin fecha, el reloj tomaba la antigua y el titular vencía antes de tiempo. Además `hasUnreconciledFiscalClock` era opcional y se llamaba con `?.`: un puerto sin el método fallaba abierto. B2-R4 lo cierra con `terminalWithClock < terminalCount` / `withDate < total` y métodos abstractos llamados sin `?.`.
- **Regresión M-1 de la ruta API (B4):** `ConservationDutyService` respondía 409 `CONTRACT_UNRECONCILED` aunque un contrato abierto (y luego también un deber fiscal o PQR vigente) justificara conservar. El 409 solo aplica cuando nada más justifica conservar. B4-R2 lo corrige; B-1 añade las pruebas por la ruta HTTP y en el ledger.
- **La clave HMAC tomada del `.env` dejó el CI en rojo (G6.5 ⛔):** las 4 suites nuevas construían `new ConfigService(process.env)` y la clave solo existía porque se cargaba el `.env` local; CI no tiene `.env`. El G6 se verificó con el `.env` presente, así que no reprodujo CI. CI-PIIKEY inyecta clave sintética por spec. Regla nueva: la verificación «como en CI» exige `PII_HASH_KEY` ausente del entorno y del `.env`.
- **Ajenos sin costo:** `execution-orders.close-by-result` en rojo solo en la base local del ejecutor (semilla, no se reproduce); `report-subscriber-phone-readiness` flaky por slug de 8 dígitos; `git stash` usado para probar el rojo contra la regla (registrado, lista vacía); E2E R4.1 de MOD14 en rojo desde `49e8448f`, ajeno a H-EXP, ya verde en `b6b2c759`.

## 5. Lo que sigue bloqueando G7

G7 (Fase 1, diferido hasta la beta según el plan §5) exige, por tenant:

1. Job diario habilitado en la API y primera corrida demostrada (§6 de la spec).
2. Recuperación tras reinicio demostrada (el consumidor reencola por cursor; probar parada y reanudación).
3. Pendientes vencidos en cero: ningún objetivo en `ATTENTION_REQUIRED`/`FAILED` vencido, ninguna tarea de clasificación vencida, ningún `MEDIA_PENDING` sin confirmar.
4. Controles de exposición y secretos revisados para la operación programada.
5. Cobertura pgAudit verificada para el ledger y la 179 (pendiente, §6).

Las dependencias generales de beta, dictámenes de ADR-094 §7.3 y conciliación del backfill continúan según HLD §11. La Fase 2 (autorizaciones con enmienda de ADR-094 D2 y borrado físico confirmado en Media, CA-EXP-10 y 11) se planifica aparte, antes del primer vencimiento posible de una autorización.

## 6. Deuda preexistente (B-6, fuera de alcance de la Fase 1)

Verificada en el código por B4; no la introduce H-EXP y no bloquea G6:

- `PqrRetentionReadAdapter` devuelve «sin PQR» si faltan tablas o columnas (falla abierto ante esquema incompatible).
- Se ignoran contratos con `deleted_at` al evaluar el reloj contractual.
- `anonymize-titular.ts` solo verifica el deber de PQR antes de ejecutar.
- Las guardas `TRUNCATE` no cubren `party_privacy_marks` ni otras tres tablas del módulo.
- R4 no protege `closed_at`, `retention_closed_at`, `resolved_at` ni `legal_basis` en filas minimizadas.

## 7. Pendientes operativos

- Verificar que `iwana_app` ya no puede hacer `TRUNCATE` tras `5229e023` (rol y guardas en entorno real, no solo en spec de migración).
- Cobertura pgAudit: confirmar que el ledger `privacy_retention_expiry_runs` y las tablas de la 179 quedan registrados según la política operativa aprobada.
- Fuera de alcance por decisión (§1.5 del plan): A22 (`reject(SOLICITANTE_NO_LEGITIMADO)` y `transfer` sin identidad verificada, preexistente en `requests.service.ts`) y OpenAPI `note maxLength:1000` frente a 120 real.
- Los P3 menores de `sec-eng` quedaron **cerrados en B5** (G2 ✅ 2026-11-09, plan §1.12):
  - las guardas `?.bind` inalcanzables desaparecen de `retention-expiry.service.ts`;
  - `selectProspectos` deja una fila `ATTENTION_REQUIRED` con su `reason_code` cuando falla el deber de PQR. La suite `retention-expiry-b5` lo cubre;
  - la integración pasa a 83 suites y 570 pruebas pasadas, con 0 fallos.

  Su G6.5 depende del CI del tren en el que se publique (ADR-107).
