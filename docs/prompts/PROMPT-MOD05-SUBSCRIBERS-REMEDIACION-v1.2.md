# PROMPT DE EJECUCIÓN — MOD05/MOD08 Suscriptores · Remediación de cumplimiento

**Version:** 1.2 — **superado** el 2026-10-12 por [v1.3](PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.3.md)
**Estado:** Emitido — G4 vigente (firmado 2026-10-12)
**Fecha:** 2026-10-12
**Plantilla:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) (en revisión)
**Emisor:** AI-EM-ARCH (modo Orchestrator)
**Plan:** [2026-10-11-mod05-subscribers-remediacion-cumplimiento.md](../plans/2026-10-11-mod05-subscribers-remediacion-cumplimiento.md) v1.2

## 0. Estado verificado contra el árbol de trabajo (no contra los informes)

| Bloque | Estado | Verificado |
| --- | --- | --- |
| B1 | ✅ `59e425ee` | migración 143 = C-DDL-1 |
| B2 | ✅ sin commitear | `GET /search` retirado; `subscriber-projection.ts` con el mapa de la spec §6; roles del listado = D3 |
| B3 | ✅ con regresión (ver D-1) | POST con cuerpo; sin PII en `URLSearchParams` |
| B4 | ✅ ratificado | spec §6 |
| B5 | ✅ sin commitear | CRM solo usa `IPartyWritePort` (`subscribers.service.ts:284`) dentro de `runInTenantSchema`, que es transaccional (`packages/database/src/data-source.ts:197`); `23505` sobre `uq_subscribers_expediente` → idempotente; `crm_conversion_failures` + `POST /expedientes/:id/retry-conversion` |

## 1. Cambios v1.1 → v1.2

| # | Cambio | Causa |
| --- | --- | --- |
| 1 | **C-API-1 v1.1 registrado**: la adenda [`docs/specs/2026-10-12-mod05-c-api-1-v1.1-addendum.md`](../specs/2026-10-12-mod05-c-api-1-v1.1-addendum.md) (búsqueda libre por cuerpo del `POST`), autorizada por el CTO durante la Ola 1-bis, pasa a ser el contrato vigente | Regularización: era coherente con v1.1 §3 B2.2 y con ADR-067 §8 |
| 2 | **C-API-2 v1.2**: `vatTreatment` entra en la proyección base; `department` se suma a los campos restringidos con la misma regla que `city` | **D-1**: la v1.1 omitió `vatTreatment`, que no es dato personal. B3 tuvo que dejar la columna IVA del listado fija en `formatVatTreatmentLabel(undefined)`. Es una **regresión visible y defecto del emisor** |
| 3 | La restauración `CANCELLED → PROSPECT` exige además `activatedAt IS NULL` | **D-2**: la guarda actual (`subscriber-status-transition.service.ts:196-230`) comprueba expediente y estado, pero no la **causa**. Un cliente que estuvo `ACTIVE` y fue cancelado (baja) volvería a `PROSPECT` si su expediente se descarta y se reactiva. Un prospecto cancelado por descarte nunca fue activado |
| 4 | Se revierten `apps/api/run-jest.cjs` y el cambio del script `test` en `apps/api/package.json` | **D-3**: el comando de gate de v1.0/v1.1 (`pnpm --filter @iwana/api test -- --force`) era **incorrecto**: `--force` es un flag de Turbo, no de Jest. El agente adaptó el tooling a un comando mal escrito. El comando canónico es el de la skill `iwana-test-evidence`. Las corridas reportadas siguen siendo válidas: Jest corrió con `--no-cache` |
| 5 | `party_contact.value` vacío **no es E-3** | **D-4**: E-3 trata de los placeholders de correo y teléfono del suscriptor. `value = ''` es la fase de expansión del patrón expandir/contraer y es aceptable; la contracción (retirar o relajar la columna) se hace tras `--apply` del backfill en todos los tenants, sin decisión del CTO |

**Comando de gate vigente (sustituye todas las menciones anteriores):**
`pnpm exec turbo run test --filter=@iwana/api --force` y `pnpm exec turbo run test --filter=@iwana/portal --force`, con conteo real y sin `cache hit`.

## 2. Contratos congelados vigentes

| ID | Versión | Fuente |
| --- | --- | --- |
| C-DDL-1 | 1.0 | migración 143 (implementada) |
| C-API-1 | **1.1** | adenda del 2026-10-12 |
| C-API-2 | **1.2** | v1.1 §2.1 más: `vatTreatment: VatTreatment` en la base; `department?: string` restringido como `city` (ADMIN y SUPPORT en la spec §6.2) |
| C-PORT-1 | 1.0 | implementado en B5 |
| C-NORM-1 | 1.1 | implementado en B5 |

## 3. Bloques de la Ola 2-bis (correcciones, en paralelo)

### B9 · `sr-backend` — D-1 (backend), D-2, D-3

1. `SubscriberListItem` en `@iwana/shared`: añadir `vatTreatment` (base) y `department?` (restringido). Actualizar `subscriber-projection.ts` y la matriz HTTP rol × campo.
2. `reactivateFromExpediente`: rechazar si `activatedAt IS NOT NULL`. Añadir un caso al test integrado de B5: un suscriptor que estuvo `ACTIVE` no se restaura.
3. Revertir `apps/api/run-jest.cjs` y el script `test` de `apps/api/package.json` a `jest`.
**Fuera de alcance:** cualquier otro cambio. **Stop/go:** `pnpm exec turbo run test --filter=@iwana/api --force` y la integración de B5 con conteo real.

### B10 · `fe-platform` — D-1 (portal)

1. `SubscribersListClient.tsx`: restaurar `formatVatTreatmentLabel(subscriber.vatTreatment)` y `formatSubscriberLocation(subscriber.city, subscriber.department)` sobre `SubscriberListItem` v1.2. Sin copy nuevo.
**Puede arrancar en paralelo con B9** contra C-API-2 v1.2 tal como está escrito arriba. **Stop/go:** `pnpm exec turbo run test --filter=@iwana/portal --force` con conteo real.

## 4. Cierre (se lanza cuando B9 y B10 cierran)

B7 `sec-eng` y B8 `sr-qa` según v1.0 §3, sobre el diff completo B1–B10. Puntos de revisión explícitos para B7:

- Los placeholders de E-3 (`0000000000`) generan **el mismo HMAC de teléfono** para todos los suscriptores sin contacto, ahora también en `party_contact`. Evaluar el riesgo de que se tome como identidad o se busque por él.
- La reactivación con la guarda D-2.
- `LIST_ACCESS` y `RECORD_ACCESS` sin PII.

Auxiliares de cierre: `boundary-reviewer`, `contract-drift-reviewer` (C-API-1 v1.1 y C-API-2 v1.2), `gate-verifier`, `docs-governance`.

## 5. Precondición de release (G7, no de cierre de fase)

Runbook de `plat-ops`: aplicar la migración 143 → `backfill:party-pii --tenant=<t> --dry-run` → resolver candidatos y fallos → `--apply` por tenant → desplegar el código de B5 **en el mismo release**. Sin HMAC en las filas legadas, B5 no encuentra esas identidades.

## 6. No despachables

Sin cambios: Habeas Data (E-2), fiscal (E-1) y placeholders (E-3).
