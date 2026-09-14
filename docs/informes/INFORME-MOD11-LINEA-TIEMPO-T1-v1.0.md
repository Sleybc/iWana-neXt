# INFORME — MOD11 Línea de tiempo de la OT · Tramo 1 (B1–B4 + adenda B1c)

**Versión:** 1.0
**Estado:** Cerrado — GO (2026-09-14)
**Emitido por:** AI-EM-ARCH (modo Orquestador)
**Plan:** `docs/plans/2026-09-14-mod11-linea-tiempo-ot.md` v1.0 · **Spec:** `docs/specs/2026-09-14-mod11-linea-tiempo-ot-design.md` v1.0 · **ADR:** ADR-089 (Aprobado, CTO 2026-09-14) · **Prompt:** `docs/prompts/PROMPT-MOD11-LINEA-TIEMPO-T1-v1.0.md` v1.0
**Gates:** G1 CERRADO (CTO). G2/G3 n/a. G4 emitido. G6 GO (§3). G6.5/G7 fuera de alcance (sin merge ni despliegue).
**Secuencia:** despachado tras el acta (cerrada en `77a2966a`); restricción de superficie compartida levantada, un solo dueño en este tramo.

---

## 1. Entregables (con ruta)

| Bloque | Responsable | Salida |
| --- | --- | --- |
| B1 Modelo y registro | sr-backend | `packages/database/src/entities/execution-order-status-transition.entity.ts` (origen, destino, instante, actor, motivo; índices por orden e instante; sin `actorName`, sin `metadataJson`, sin duraciones) · contrato hermano `packages/shared/src/contracts/operations/execution-order-transitions.ts` v1→v2 · migraciones tenant `132_*.ts` (tabla) y `133_*.ts` (adenda `correction_of_id`) · registro en la misma transacción en start/assign/block/unblock/close/cancel · specs nuevas (timeline 8, corrección 9, contrato 8, migraciones 13) |
| B1c Adenda (resuelve [BLOQUEO] B2) | sr-backend | `correction_of_id` nullable sin FK + migración 133 reversible + hermano v1→v2 aditivo. Decisión: referencia como columna propia; citar el id en `reason` se descartó (contamina finalidad declarada ante sec-eng) |
| B2 Corrección aditiva | sr-backend | `correctStatusTransition` (`execution-orders.service.ts:1474`): asiento nuevo con `correctionOfId`+actor+motivo, original intacto, sin mutar la OT, fail-closed |
| B3 Finalidad y retención | sec-eng | `docs/informes/INFORME-MOD11-B3-FINALIDAD-RETENCION-v1.0.md` (Aprobado por sec-eng): finalidad por campo formato ADR-067 + retención **24 meses post-cierre**; exigencias 1–2 satisfechas por construcción; 3–4 como condición de T3 |
| B4 Regresión | sr-qa | Veredicto GO 7/7 (§3) |

`execution-orders.ts` v1.2 intacto (fuera del diff en git). Sin lecturas MOD09, sin `EN_ROUTE`, sin superficie de consulta, sin uso laboral.

## 2. Incidente de orquestación: [BLOQUEO] B2

B1 no previó el campo de referencia que spec §4.3 exige; B2 lo detectó en su DoR antes de escribir código (cero desperdicio). Resolución del orquestador en la misma sesión: opción (a) — adenda B1c del mismo dueño (columna + 133 + v2), re-despacho de B2. La matriz del plan ya preveía DDL bajo condición; la condición se cumplió. Nota de protocolo: el marcador correcto es `[BLOQUEO]` (§6.3 regla 1); la variante del prompt de sistema del subagente no aplica.

## 3. Verificación contra aceptación

| CA | Resultado | Evidencia |
| --- | --- | --- |
| CA-01 toda transición deja asiento | GO | 5 caminos + assign, misma transacción; timeline 8/8 |
| CA-02 VARIOS ciclos, todos registrados | GO | 2 ciclos → 5 asientos ordenados con motivos; `deriveBlockedMs` suma ambos (descarta A1). No es solo start()/close() |
| CA-03 bloqueado y total AMBOS derivables, cero duraciones persistidas | GO | `deriveBlockedMs`+`deriveElapsedMs` coexisten; barrido D2/R5; verificado en entidad por orquestador |
| CA-04 corrección aditiva, original visible | GO | Asiento nuevo con `correctionOfId`; `reason` no contiene el id; 9/9 |
| CA-05 `startedAt`/`closedAt` intactos | GO | Idempotencia + mismo instante; consumidores (completion, controller.contract, ola1-regression 29/29); v1.2 intacto |
| CA-06 sin-línea distinguible de vacío | GO (alcance T1) | Sin backfill por diseño (§4.5); `null` ante ausencia; sin superficie en T1 |
| CA-07 retención declarada y aprobada | GO (bloqueante del cierre) | Dictamen B3 en disco, 24 meses, exigencias 1–2 por construcción |

## 4. Conteos reales (jest directo `--ci --runInBand`, sin turbo, sin `--passWithNoTests`)

- PISO `src/modules/tasks` completo → **617/617, 30 suites** (verificado por AI-EM-ARCH en esta sesión; piso 599 superado).
- Corrección 9/9 · timeline 8/8 · hermano v2 8/8 · migraciones 132+133 13/13 · consumidores CA-05 29/29 (reportado sr-qa).
- `audit:adr-citations` → **BLOQUEANTE: 0**. `audit:doc-locations` → **BLOQUEANTE: 0**.

## 5. Deuda por severidad

| Sev | Deuda | Dueño / SLA |
| --- | --- | --- |
| Media | Purga/anonimización por retención 24m (B3 exigencia 3) — exigible antes de T3 | Por definir · próximo ciclo |
| Media | Mapa campo×rol + trazabilidad lectura masiva + cota paginación (condición GO de T3) | sr-backend / prod-ux en T3 |
| Baja | 133 sin índice en `correction_of_id` (intencional; lo agregará la lectura que lo exija) | T3 con dictamen |
| Baja | Correcciones encadenadas permitidas sin restricción (cadena traversable; T3 define lectura) | T3 |
| Informativa | `EN_ROUTE` (T2, decide prod-ux §4.4) · consulta/métricas (T3) · jornada (T4, verificación MinTrabajo oficial) | — |

## 6. Decisiones que requieren CTO

Ninguna en este tramo. T2 desbloqueado por la decisión §4.4 (valor de `EN_ROUTE` para el técnico); T4 por verificación regulatoria oficial (D5).

## 7. Trazabilidad de despacho

Ola 1 (paralelo): sec-eng B3 + sr-backend B1 → verificados (v1.2 intacto, sin `actorName`/`metadataJson`/duraciones; dictamen materializado por orquestador) → [BLOQUEO] B2 → adenda B1c → B2 → Ola 3: sr-qa B4 GO. Skills nombradas por bloque según matriz; `prod-ux` sin bloque en T1 (su decisión `EN_ROUTE` es T2). Este informe no supera a ningún artefacto previo.
