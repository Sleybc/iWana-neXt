# Plan de orquestación — Hermeticidad de pruebas PG y runbook G7 de privacidad

**Versión:** 1.0
**Estado:** Listo para lanzar
**Fecha:** 2026-11-03
**Emitido por:** AI-EM-ARCH
**Origen:** pendientes del [cierre de O-1](../informes/INFORME-PRIVACY-O1-RETENCION-CIERRE-v1.0.md) §6, ordenados por el usuario el 2026-11-03:
- «Lo mío, borra el tenant»;
- «G7 y deudas transversales de pruebas, soluciona»;
- «Dictámenes jurídicos, después de lo anterior».

## 1. Estado de partida

| Pendiente | Estado |
| --- | --- |
| Tenant `tenant_e2e_mod13_f1_41398e` | ✅ **Borrado el 2026-11-03** por AI-EM-ARCH, por orden del usuario. Su esquema ya no existía. Se eliminó la fila de `public.tenants` (no había referencias en otras tablas públicas), con los mismos eventos de auditoría que el job de purga del worker: `TENANT_PURGE_STARTED` y `TENANT_PURGE_COMPLETED`, `request_id = manual:tenant-schema-purge` |
| Deudas de pruebas | Spec [hermeticidad PG](../specs/2026-11-03-transversal-hermeticidad-pruebas-pg-spec.md) y prompt [T1 a T5](../prompts/PROMPT-TRANSVERSAL-HERMETICIDAD-PG-v1.0.md) |
| G7 | **No se puede ejecutar:** no hay producción, y G7 está diferido hasta la beta (ADR-095). Lo que sí se resuelve ahora es el runbook por tenant, que estaba atrasado frente a Fase 1b, DT-3 y O-1. Prompt [runbook delta](../prompts/PROMPT-PRIVACY-G7-RUNBOOK-DELTA-v1.0.md) |
| Dictámenes jurídicos | Después de esta ola, por orden del usuario |

### Estado tras la Ola 1 (2026-11-03)

- **G: GO.** Runbook en la versión 1.2, con comprobaciones de solo lectura y detección de contratos terminales sin reloj (también los que no tienen fila de suscriptor). `sec-eng` no encontró hallazgos P0 a P3 ni exposición de PII; `docs-governance`, sin hallazgos.
- **T1, T3 y D-H-5: GO.** T1: 30/30 en `iwana_it_*` y en `dbiw`, con resultados idénticos. T3: las 3 suites EV1 solo necesitaban el esquema; 8/8 en el job de integración. Inventario: 11 suites escriben en el tenant de `E2E_TENANT_SLUG`; son la entrada de la próxima fase.
- **Omisiones del job unitario: de 4 a 0.**
- **Tres bloqueos, ninguno de producto:**
  - T2: la expectativa no recoge un valor que añadió la 141;
  - D-H-4: el alcance era demasiado amplio y alcanzaba un mock;
  - `network-execution-event.wiring`: 42501 en la base local, aunque en CI pasa.
  
  Spec v1.1; remediación §T-R; LAUNCH v1.1.

### Cierre (2026-11-03): G6 GO

T-R cerró los tres bloqueos:
- T2: 7/7;
- la guarda D-H-4, acotada: 8/8;
- `network-execution-event.wiring`: el 42501 era de entorno (grants de la base local) y pasa 8/8 con el aprovisionamiento de CI.

Gate: unitarias de API 446/446 con 0 omitidas; integraciones con 0 fallidas y las 4 omisiones del manifiesto. Informe: [INFORME-TRANSVERSAL-HERMETICIDAD-PG-v1.0](../informes/INFORME-TRANSVERSAL-HERMETICIDAD-PG-v1.0.md). Pendiente: commit, push y G6.5; después, los dictámenes jurídicos.

## 2. Bloques

| Bloque | Agente | Depende de | Rutas |
| --- | --- | --- | --- |
| T1 a T4 · pruebas herméticas | `sr-qa` | — | Las suites de la spec y una prueba de arquitectura nueva |
| G · runbook 1.2 | `plat-ops` | — | Solo el runbook |
| T5 · verificación | `test-change-reviewer`, `gate-verifier` | T1 a T4 | Solo lectura |
| G-rev · revisión del runbook | `sec-eng`, `docs-governance` | G | Solo lectura |

**Paralelo:** las dos corrientes (T y G) son independientes y no comparten archivos. **Ruta crítica:** T1 a T4 → T5 → commit y push → G6.5.

## 3. Matriz agente × skill

| Bloque | Obligatorias | De apoyo | Descartadas (motivo) |
| --- | --- | --- | --- |
| T1 a T4 | `testing-patterns`, `postgresql`, `iwana-tenant-migration`, `iwana-test-evidence` | `systematic-debugging` | Skills de UI y E2E (no hay cambio visible); `database-migration` (no se crea ninguna migración) |
| G | `iwana-tenant-migration`, `database-migration`, `postgresql` | `docs-architect` | Skills de código: no se edita código |
| G-rev `sec-eng` | `security-auditor` | `postgresql` | — |

## 4. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Una suite EV1 depende de datos de `tenant_iwana` | `[BLOQUEO]` con su causa; nunca escribir en ese tenant |
| Al renombrar `second-schema`, el job de integración no la descubre | `gate-verifier` comprueba su presencia en el conteo |
| Alguien toma el runbook 1.2 como autorización de producción | La cabecera mantiene «este runbook no concede G7» |

## Lanzamiento

Fuente: [`PROMPT-TRANSVERSAL-HERMETICIDAD-PG-LAUNCH-v1.0.md`](../prompts/PROMPT-TRANSVERSAL-HERMETICIDAD-PG-LAUNCH-v1.0.md). **El archivo prevalece si divergen.**
