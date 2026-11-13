# INFORME — MOD14 · Primer cobro completo · Cierre v1.0

**Fecha:** 2026-11-13 · **Spec:** [2026-11-13-mod14-primer-cobro-completo](../specs/2026-11-13-mod14-primer-cobro-completo.md) (G0) · **Plan:** [2026-11-13-mod14-primer-cobro-completo](../plans/2026-11-13-mod14-primer-cobro-completo.md)
**Publicación:** un solo commit al terminar las 4 olas · **Estado:** G6 ✅ · G6.5 ✅ 2026-11-13 (CI de `61470065`, run 43479881594; E2E 348 passed, 0 failed)

## 1. Entregado

| Ola | Resultado |
|---|---|
| 1 | W0; consumo de la OT de instalación asociado al contrato con valor de referencia congelado (205, cola firmada `billing-installation-events`); retenciones en el pago (206) |
| 2 | Desglose informativo «Valor real de la instalación» en el detalle y el PDF del documento, sin tocar montos |
| 3 | Portal: desglose, retenciones en el diálogo de pago, estado de cuenta y pagos |
| 4 | E2E `portal-billing-primer-cobro-completo-live` (CA-1 a CA-5); revisiones boundary, contract-drift y sec-eng corregidas (H-1 retención como condonación, H-2 certificado redactado, H-3 retenciones se anulan con la factura) |

## 2. Evidencia

| Corrida | Resultado |
|---|---|
| API unit completa | 551 suites · 7374 tests |
| Worker · Shared · Database | 277 · 639 · 429 tests |
| Portal completo | 388 suites · 3887 passed · 1 skipped |
| API integración | 726 passed; 4 fallos preexistentes en `close-by-result` (plantilla v3 ausente en `test` local) |
| Integraciones de consumo en base QA `i4_qa_20261006_a1` | `ola3d` 13/13; `item-usage-projection` 1/1 (se añadió la entidad de reverso faltante desde octubre) |

## 3. No verificado y pendientes

- Arreglos tras el commit único: `310540b8` y `61470065` (seed y formato del E2E), `a5433838` (facturación de persona jurídica con NIT, defecto previo a la fase; tablas navegables con teclado; pestañas sin transición).
- Contador: marca de agente retenedor (persona jurídica u O-13/O-23), tolerancia de 1 peso y de tarifa (2 pp), conservación del certificado frente a la supresión.
- Mano de obra en el valor real: abierto.
- Base de desarrollo: si ya tiene la 206, revertir y reaplicar por el índice único nuevo.
