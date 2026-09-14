# INFORME — MOD11 Acta de instalación · Tramo 1 (B1–B4)

**Versión:** 1.0
**Estado:** Cerrado — GO (2026-09-14)
**Emitido por:** AI-EM-ARCH (modo Orquestador)
**Plan:** `docs/plans/2026-09-14-mod11-acta-instalacion.md` v1.0 · **Spec:** `docs/specs/2026-09-14-mod11-acta-instalacion-design.md` v1.0 · **ADR:** ADR-088 (Aprobado, CTO 2026-09-14) · **Prompt:** `docs/prompts/PROMPT-MOD11-ACTA-INSTALACION-T1-v1.0.md` v1.0
**Gates:** G1 CERRADO (CTO). G2/G3 n/a. G4 emitido. G6 GO (verificación §3). G6.5/G7 fuera de alcance de este tramo (sin merge ni despliegue).
**Bloqueos:** ninguno. **Restricción de secuencia respetada:** tramo de línea de tiempo no despachado en paralelo (superficie compartida `execution-orders.service.ts`, un solo dueño).

---

## 1. Entregables (con ruta)

| Bloque | Responsable | Salida |
| --- | --- | --- |
| B1 Contrato y evaluador | sr-backend | `packages/shared/src/contracts/operations/execution-orders.ts` v1.1→v1.2 (`finalDisposition?` opcional en MATERIAL) · `apps/api/src/modules/tasks/services/closure-gate-evaluator.service.ts` (exige disposición solo si se declara, fail-closed) · `apps/api/src/modules/tasks/services/execution-orders.service.ts` (proyección en `getCompletion`, propagación en `buildMaterialEvaluationUsages`, guard+mapper fail-closed) · `apps/api/src/modules/tasks/tests/closure-gate-material-disposition.spec.ts` (17 tests) |
| B4 Copy | prod-ux | Tabla cerrada 5/5 inline (sin archivo): equipos instalados / prueba de servicio / fotos / acta firmada / bitácora no requerida. Español sentence case, sin enums crudos, ninguna etiqueta promete lo que su regla no comprueba (D4) |
| B2 Plantilla v2 + política | sr-backend | `packages/database/src/migrations/tenant/131_publish_instalacion_estandar_v2.ts` (reversible, `down()` ejercitado) + specs · `docs/informes/INFORME-MOD11-MIGRACION-PLANTILLA-V2-v1.0.md` (política CA-07: OT vivas intactas, convivencia v1/v2, acto por tenant, rollback) |
| B3 Regresión | sr-qa | Veredicto GO 7/7 (detalle §3) |

## 2. Verificación contra aceptación (no contra autodeclaración)

| CA | Resultado | Evidencia |
| --- | --- | --- |
| CA-01 devuelto NO satisface / CA-02 instalado SÍ (ambos sentidos) | GO | Predicado `closure-gate-evaluator.service.ts:189`; suite B1 17/17 (ver §3). Instalado pendiente = NO-GO no ocurrido |
| CA-03 retrocompatible sin disposición | GO | Guard `execution-orders.service.ts:159` (`undefined → true`) + 3 disposiciones en suite |
| CA-04 progreso ≡ cierre | GO | Proyección `execution-orders.service.ts:294-298` + mismo mapper en ambos call-sites; paridad testeada |
| CA-05 OTE-20260828-001 pendiente | GO | Sin consumos → `usages.some(...)` falso siempre (con deuda menor D1: sin test dedicado v2-vs-vacío) |
| CA-06 bitácora no requerida, etiqueta honesta | GO | Integración 131: `required: false`, label de registro; sin `MEASUREMENT` requerido |
| CA-07 política entregada como documento | GO | `INFORME-MOD11-MIGRACION-PLANTILLA-V2-v1.0.md` §2/§3/§5 + integración v1/OT intactas |

## 3. Conteos reales (jest directo `--ci --runInBand`, sin turbo, sin `--passWithNoTests`)

- B1: `pnpm --filter @iwana/api exec jest src/modules/tasks/tests/closure-gate-material-disposition.spec.ts` → **17/17** (verificado por AI-EM-ARCH en esta sesión).
- No regresión tasks incl. BOLA (reportado sr-qa, tests intactos): **28 suites, 599/599**.
- Migración 131 unit + runner: **10/10**. Integración real Postgres: **6/6** (`down` ejercitado, round-trip).
- `pnpm audit:adr-citations` → **BLOQUEANTE: 0** (139 avisos preexistentes). `pnpm audit:doc-locations` → **BLOQUEANTE: 0** (3 avisos preexistentes fuera de `docs/informes/`).

## 4. Deuda por severidad

| Sev | Deuda | Dueño |
| --- | --- | --- |
| Menor | D1: CA-05 sin test dedicado v2-contra-vacío (ancla de una línea en suite B1) | AI-SR-FULL |
| Media | R4/spec §6: `buildMaterialEvaluationUsages` consulta catálogo 1×/consumo por `GET` detalle — medir antes de v2 en tenants con volumen; tenants con plantilla propia adoptan por API | AI-SR-FULL / AI-PLAT-OPS |
| Baja | Captura portal de `installed-equipment`/`service-test` llega con Ola 2 spec hermana; req.2 `EVIDENCE PHOTO` reversible vía v3 | AI-FE-PLATFORM |
| Informativa | Culminación/Provisioning y contrato legal: tramos 2–3, sin dueño implementado (ausencia declarada ADR-088) | — |

## 5. Decisiones que requieren CTO

Ninguna en este tramo. Tramos 2 (modelo de firma MOD05) y 3 (Provisioning) se desbloquean por sus condiciones de spec §9; no se planifican aquí.

## 6. Trazabilidad de despacho

Ola 1 (paralelo): prod-ux B4 + sr-backend B1 → verificados en disco → Ola 2: sr-backend B2 (migración + política como artefacto) → Ola 3: sr-qa B3 GO. Skills nombradas por bloque según matriz del plan; `sec-eng` sin bloque en T1 (sin ampliación de superficie). Este informe no supera a ningún artefacto previo (el plan hermano de consola-OT sigue vigente en su eje).
