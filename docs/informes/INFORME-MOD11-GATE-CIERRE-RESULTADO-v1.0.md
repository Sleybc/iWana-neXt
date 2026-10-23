# INFORME — MOD11 · Gate de cierre por familia de resultado · v1.0

**Fecha:** 2026-10-23 · **Autor:** AI-EM-ARCH
**Decisión:** [ADR-099](../adrs/ADR-099-Requisitos-de-Cierre-de-OT-por-Familia-de-Resultado.md) (Aprobado por el CTO el 2026-10-23, E1 = (a), E2 = sí)
**Plan:** [2026-10-23-mod11-gate-cierre-por-resultado](../plans/2026-10-23-mod11-gate-cierre-por-resultado.md) · **Encargo:** [PROMPT-MOD11-GATE-CIERRE-RESULTADO-v1.0](../prompts/PROMPT-MOD11-GATE-CIERRE-RESULTADO-v1.0.md)
**Veredicto:** G0, G3, G5 y G6 ✅. G7 se cierra con este informe, el commit y el CI de `main` en verde.

---

## 1. Defecto corregido

Desde `5de2f5eb` (2026-07-27), `close()` evaluaba todo el snapshot de la plantilla con cualquier resultado. Por eso una instalación v3 no podía cerrarse como `NOT_EXECUTED` sin registrar un CPE instalado, dos fotos y un acta firmada. Aparecieron además dos defectos relacionados:

- `REQUIRES_FOLLOW_UP` era incerrable en instalaciones, porque el requisito `PROVISIONING` no consultaba MOD13.
- El API no exigía la causa de ADR-077 regla 1.

El defecto se confirmó con una sonda sobre `close()` (2/2) antes de diseñar la corrección.

## 2. Qué cambió

| Pieza | Cambio |
| --- | --- |
| `closure-gate-evaluator.service.ts` | Nueva función pura `selectRequirementsForResult`. La familia ejecutada (`EXECUTED`, `EXECUTED_WITH_OBSERVATIONS`, `REQUIRES_FOLLOW_UP`) evalúa todo el snapshot; solo quita `PROVISIONING` si el ajuste de MOD13 está apagado. `NOT_EXECUTED` y `CANCELLED` no evalúan ningún requisito |
| `execution-orders.service.ts` · `close()` | Un `NOT_EXECUTED` sin `reasonCode` → 422 `CLOSE_NOT_EXECUTED_REASON_REQUIRED`, antes de abrir la transacción y el recibo. Un `NOT_EXECUTED` con consumos `INSTALLED_AT_CUSTOMER` vigentes (descontados los reversos confirmados) → 422 `CLOSE_NOT_EXECUTED_HAS_INSTALLED_EQUIPMENT`. `REQUIRES_FOLLOW_UP` consulta el puerto de MOD13 (E1). Se retira el filtro en línea `skipProvisioningRequirement`. `getCompletion()` no cambia |
| `dto/execution-orders.dto.ts` | Solo la descripción OpenAPI de `reasonCode`. La forma del DTO no cambia |
| Pruebas | Unitarias del evaluador (tabla de resultados) y del puerto de MOD13 (CA-06 y CA-07). Ajustes de `reasonCode` en specs existentes. Integración nueva contra Postgres real: `execution-orders.close-by-result.postgres.integration.spec.ts` (CA-02 a CA-05) |
| ADR-098 | Nota «Desarrollo posterior (2026-10-23)»: ADR-099 extiende D5 a `REQUIRES_FOLLOW_UP` |

**Desviación aceptada.** El asiento de transición del cierre guarda ahora `reason = reasonCode ?? summary ?? result`; antes guardaba `summary ?? result`. No estaba en el encargo. Se acepta porque la entidad `ExecutionOrderStatusTransition` define `reason` como «código o nota» y el código es el dato estructurado. Además, el campo deja de llevar texto libre cuando existe una causa.

## 3. Evidencia

| Gate | Evidencia | Fuente |
| --- | --- | --- |
| G3 | Primera ejecución de la integración en rojo, en el gate esperado. Integración en verde contra Postgres real: 1 suite, 4/4, sin omisiones. Unitarias enfocadas: 4 suites, 152 tests | sr-backend (B1) |
| G3 (re-verificación) | Tras B1-bis: 1 suite, 4/4 contra Postgres real con `E2E_TENANT_SLUG` (distinto de `tenant_iwana`) | sr-backend (B1-bis) y AI-EM-ARCH, corrida propia del 2026-10-23 |
| G5 | Ningún import nuevo de `wfm` ni de `network` en producción; el servicio consume `SERVICE_PROVISIONING_READ_PORT`. Contrato sin deriva frente al portal. Hubo un P3 (borrados de prueba sin `tenant_id`), corregido en B1-bis | boundary-reviewer + contract-drift-reviewer |
| G6 | Sin caché de turbo. Lint exit 0 (7 avisos ajenos), typecheck exit 0. Suite completa: 419 suites y 5.592 tests (4 suites y 15 tests omitidos). Las 60 líneas nuevas del servicio y las 13 del evaluador están cubiertas; la única rama sin cubrir (`execution-orders.service.ts:2275`) ya existía | gate-verifier |

Cobertura de `tasks`: sentencias 84,91 %, ramas 69,17 %, funciones 79,74 %, líneas 85,80 %. Por archivo:

- Servicio: 82,66 / 70,98 / 79,50 / 83,67.
- Evaluador: 90,90 / 78,66 / 100 / 91,04.
- DTO: 100 %.

El gate G6 mide funciones y ramas sobre el diff (criterio precisado en el plan el 2026-10-23).

## 4. Deuda declarada

| # | Deuda | Dueño |
| --- | --- | --- |
| D1 | Las ramas (69,17 %) y funciones (79,74 %) de `tasks` siguen bajo el 80 % en archivos que este encargo no tocó | MOD11 |
| D2 | El código de causa no se valida contra el catálogo de MOD09 | MOD09 → MOD11 (puerto) |
| D3 | La evidencia del intento (`requiresEvidence`) solo se exige en el portal, no en el servidor | MOD09 → MOD11 (puerto) |
| D4 | El portal envía el **id** de la causa en `reasonCode` y su **código** en `followUp.reasonCode`, y el asiento de transición guarda el id | MOD11 portal |

## 5. Efecto en otros módulos

- **MOD13:** la prueba V1-ci puede volver a probar la liberación de IP cerrando como `NOT_EXECUTED`, siempre con `reasonCode`. En `network/**` y `e2e/**` no se encontraron cierres sin causa: solo fixtures de eventos.
- **Portal:** no cambia. Ya enviaba `reasonCode` en `NOT_EXECUTED`.
