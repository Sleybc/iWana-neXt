# INFORME — MOD11 Operaciones · OLA 2 · Consolidación de implementación (G5 parcial)

**Versión:** 1.0
**Fecha:** 2026-09-13
**Emisor:** AI-EM-ARCH (modo Orquestador)
**Procedimiento:** `docs/prompts/PROMPT-OPERATIVO-DESPACHO-MULTIAGENTE-v1.0.md`
**Plan:** `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 (§3.4, ola 2)
**Directrices de entrada:** [consolidación de la ola 1](INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA1-CONSOLIDACION-v1.0.md) §4 (D1–D3, D-A1…D-A8 vinculantes)

---

## 1. Alcance de la ola

Dos encargos despachados en paralelo por superficie sobre `main` (plan §4.5): **F1** (`sr-backend` → `apps/api/` + `packages/database/` + `e2e/tests/api/`) y **F2** (`fe-platform` → `apps/portal/`). Ningún archivo cayó en ambos alcances; la disciplina de superficie se verificó por diff al consolidar. Cambios preexistentes de otros tracks (inventario, auditoría docker) quedaron intactos y fuera de los conteos.

**Hallazgo de arranque, resuelto en el despacho:** el árbol ya contenía una implementación F1 sin commit, sin informe y sin verificación, dejada por una sesión previa interrumpida. En lugar de reimplementarla, la orden del orquestador fue **auditarla línea a línea contra la orden de despacho**. La auditoría encontró y corrigió **3 defectos del WIP**, el más grave: la sonda 403 del spec HTTP no ataba `ExecutionOrderAccessGuard` y respondía 200 (el test pasaba sin probar nada). El episodio valida la regla de consolidación: trabajo sin informe de fase no es trabajo verificado.

## 2. Gates — estado de entrada y salida

| Gate | Entrada | Salida |
| --- | --- | --- |
| G1 | ✅ Cerrado (OLA1) | Sin cambio |
| G2 | ✅ Cerrado (OLA1) | Sin cambio |
| G3 | ✅ Cerrado (OLA1) | Sin cambio |
| G4 | ✅ Efectivo (OLA1) | Sin cambio |
| **G5** | 🟡 En curso | 🟡 **PARCIAL — APROBADO**: F1 y F2 cerradas con handoffs H2 y H3 verificados; G5 completo exige F5 (ola 3) |

## 3. H2 (F1 → F5) — ACEPTADO

Condición de aceptación: **test BOLA en verde y revisión de AI-SEC-ENG registrada.** Verificado contra evidencia, no contra declaración:

| Verificación | Evidencia |
| --- | --- |
| Test BOLA + 403/200-decorador + service-list | **Re-ejecutado por el orquestador al consolidar (jest directo, sin caché): 3 suites, 84/84 passed, 53.6 s.** Corrida completa del agente: `pnpm --filter @iwana/api test` → **313 suites / 3925 tests passed, 0 failed**, 51.9 s. |
| ADR-065 §15 (dos alcances) | Admin total 3 vs técnico total 1; un solo `getManyAndCount` sobre el QB ya scopeado (D2 estructural). |
| Scoping D1 | Réplica exacta del predicado de `assertActorAccess` (`execution-orders.service.ts:515-522` vs `:301-347`); parámetros ligados; ninguna fila listada da 404 al abrirse. |
| **Revisión AI-SEC-ENG** | **APROBADO CON OBSERVACIONES — ningún hallazgo bloquea H2** ([dictamen](INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA2-SEC-ENG-v1.0.md)), emitido sobre el código abierto, no sobre el informe. La `[CONSULTA]` de F1 queda atendida en la misma sesión (SLA §6.2 cumplido). |
| D3 (`resolveBucket`) | El nuevo GET clasifica en `eo-lightweight-read` (120/min), verificado con header en vivo; el controlador salta el throttler global como documentaba el WIP. |
| Migración 130 | `CREATE INDEX CONCURRENTLY` bajo runner no transaccional (ADR-066, patrón 089), aplicada en 2 schemas tenant con índices verificados válidos (`pg_indexes`); paridad 125/125. Índice de cuadrilla **incluido** con justificación en el informe F1 §7. |
| `sortableFields` / OpenAPI | Lista vacía conforme (ADR-065 §22-bis); OpenAPI vivo con 12 params, sin `sortBy`/`sortDir`/`cursor`. |
| `pnpm lint` / `pnpm typecheck` | 8/8 successful, `Cached: 0`, 0 errores. |
| E2E API bloque 9 | **No ejecutable en sesión** (login de plataforma 401 — credenciales no verificables por contrato PII). Playwright `--list` parsea los 7 casos; provisión de plantilla OK. Deuda D-2; **no es condición del stop/go §11 de F1**. |

**Informe de fase:** [INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA2-SR-FULL-v1.0.md](INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA2-SR-FULL-v1.0.md). Stop/go §11: 7/7 con veredicto (el de SEC-ENG, pendiente al retornar el agente, quedó cerrado con el dictamen de esta consolidación).

## 4. H3 (F2 → F5) — ACEPTADO

Condición de aceptación: **specs migrados en verde y deep links vigentes funcionando, incluido el legado `/dashboard/operations?executionOrderId=`.**

| Verificación | Evidencia |
| --- | --- |
| Specs migrados | **Re-ejecutado por el orquestador: 13 suites de operaciones, 202/202 passed, 48.7 s.** Suite portal completa del agente: **257/257 suites, 2 340 passed + 1 skipped**, jsdom. Los 11 casos de montaje re-apuntados (D-A2) corren en verde; QA-49 y el descarte de respuesta tardía íntegros. |
| Deep link legado | Despachador 307 con query completa preservada; `?executionOrderId=` acreditado en `apps/portal/src/app/dashboard/operations/page.spec.tsx`. Verificación plena con stack: **pendiente E2E F6**, declarado sin ambigüedad. |
| Refactor puro | Único cambio de comportamiento: D-A3 (redirect post-alta a `/tasks?taskId=`, autorizado en la orden). Hook `use-execution-order-console.ts` verbatim. |
| Monolito | `OperationsClient.tsx` y su spec **eliminados** (verificado en disco); cero shim, cero imports de consumidor rotos (re-export type-only en api-client). |
| Drawer/Summary | Sin mover; única edición del drawer: 1 línea de import type (D-A1). |
| E2E legado | Líneas 876/975 de `portal-field-flow-ticket-ot-inventory.spec.ts` **intactas** (diff vacío, verificado por el orquestador). |
| Gate de identidad | `audit-ui.mjs` **re-ejecutado por el orquestador: sin hallazgos, exit 0.** |
| `pnpm lint` / `pnpm typecheck` | 8/8 successful con `--force`, `Cached: 0 cached, 8 total`. |
| D-A1…D-A8 | Las ocho resueltas y declaradas una a una en el informe de fase (§4 del informe FE). |

**Informe de fase:** [INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA2-FE-PLATFORM-v1.0.md](INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA2-FE-PLATFORM-v1.0.md). Stop/go §11: 8/8 OK.

## 5. Decisión G5 (parcial) — AI-EM-ARCH

**APROBADO PARCIAL.** Ambos handoffs pasan sus condiciones de aceptación verificadas por el orquestador (corridas propias con ejecución real, no caché). G5 completo permanece abierto: **F5 (integración, ola 3)** es el cierre de etapa 5. El aprobador de esta consolidación (AI-EM-ARCH) es distinto de los productores (AI-SR-FULL, AI-FE-PLATFORM, AI-SEC-ENG).

## 6. Marcadores, desempates e instrumentación (KPIs §9 del plan)

- **Marcadores:** cero `[BLOQUEO]`, cero `[DESEMPATE]`. Una `[CONSULTA]` (SR-FULL → SEC-ENG, bloqueante) **atendida en la misma sesión** con dictamen registrado.
- **Reescrituras de contrato:** cero. Los contratos de F0 (`execution-orders-list.ts`, `operational-tasks.ts` v1) y el congelado `execution-orders.ts` quedaron intactos (verificado por diff).
- **Skills declaradas:** F1 — 4 obligatorias + 3 de apoyo; F2 — 3 obligatorias + 4 de apoyo. Ambos informes las declaran.
- **Latencia de gates:** G5 parcial cerrado en la misma sesión del despacho, sin re-trabajos de ola.

## 7. Deuda consolidada (por severidad)

| # | Severidad | Deuda | Dueño |
| --- | --- | --- | --- |
| D-2 | Media | E2E API bloque 9 (listado + BOLA) sin corrida en entorno canónico; intento real falló en login (401) | SR-QA (F6) / PLAT-OPS |
| SEC-D1 | Media | Falta caso CONTRACTOR en los tests unitarios de scoping (regresión no detectable si alguien retira el rol) | SR-QA (F6), sugerido por SEC-ENG |
| — | Media (transitoria) | Pestaña «Órdenes» sin bandeja hasta F5; scaffolds `ExecutionOrdersTable/Toolbar` a la espera | FE-PLATFORM (F5) |
| SEC-O2 | Observación | Fallback a email en `responsibleLabel` | SR-FULL, revisar en F6 |
| SEC-O1 | Observación | Frase del informe F1 citaba caso `?cursor=abc` inexistente en suite; **corrección editorial solicitada a su dueño** | SR-FULL |
| Heredada | Media | Cuadrilla en scoping (v2, requiere port WFM tipado); tramo `sortableFields` tras medición p95 | Registradas en OLA1 §7 |

## 8. Siguiente paso

**OLA 3 — F5 integración (AI-FE-PLATFORM):** cableado del endpoint real en lugar de mocks tipados, filtros ampliados, fin del crawl de usuarios, columna «Vence». Entrada disponible: H1 (contratos) ✅, H2 (endpoint + SEC-ENG) ✅, H3 (rutas y split) ✅, H4 (contrato de componente) ✅, H5 (UX spec) ✅. Pendiente para F5 la decisión del plan §11.1 (picker NOC/SUPPORT), que llegará como `[CONSULTA]` bloqueante; la predisposición del orquestador sigue siendo la Salida 2 (degradación visible). Después, **OLA 4 — F6 verificación** (SR-QA + PROD-UX + DS-OWNER + SEC-ENG), que absorbe D-2 y SEC-D1.
