# INFORME — MOD14 · IVA por concepto y cortesías · Cierre v1.0

**Fecha:** 2026-11-12 · **Spec:** [2026-11-12-mod14-iva-por-concepto-y-cortesias](../specs/2026-11-12-mod14-iva-por-concepto-y-cortesias.md) (G0) · **Plan:** [2026-11-12-mod14-iva-por-concepto-y-cortesias](../plans/2026-11-12-mod14-iva-por-concepto-y-cortesias.md)
**Publicación:** un solo commit al terminar las 4 olas · **Estado:** G6 ✅ · G6.5 ✅ 2026-11-12 (CI de `cf4d4a21`, run 43270968357)

## 1. Entregado

| Ola | Resultado |
|---|---|
| 1 | W0; IVA por ítem del catálogo, instalación con tratamiento propio (19 % por defecto) congelado en el contrato (migración 201) |
| 2 | Adicionales facturados con precio e IVA congelados, idempotentes (202); cortesías: permiso `billing.courtesies.manage`, línea negativa en borrador, ajuste no monetario en emitido/importado, anulación (203, 204) |
| 3 | Portal: IVA por ítem en el catálogo, líneas con IVA, «Otorgar cortesía», cortesías en documento y estado de cuenta |
| 4 | Revisiones boundary, contract-drift y sec-eng; hallazgos mayores corregidos (idempotencia de cortesías, notas con datos bloqueados, proyección anonimizada, DTO, `totalCourtesy` único) |

## 2. Evidencia

| Corrida | Resultado |
|---|---|
| API unit completa | 542 suites · 7228 tests |
| Portal completo | 384 suites · 3844 passed · 1 skipped |
| Shared · Database | 620 · 429 tests |
| API integración completa | 697 passed; 4 fallos preexistentes en `execution-orders.close-by-result` (plantilla INSTALACION_ESTANDAR v3 ausente en `test`) |

## 2.1 Cierre de pendientes

`79b7da76`: PDF del contrato con IVA de instalación y adicionales, y E2E `portal-billing-iva-cortesias-live` (CA-1 a CA-4). CI verde, run 43276911136 (R4.1: 345 passed, 0 failed).

## 3. No verificado y pendientes

- Las plantillas de contrato ya publicadas en cada tenant imprimen la instalación como antes hasta publicar una versión nueva desde la semilla.

- Contador: IVA de la instalación con internet excluido; tratamiento contable de la cortesía sobre lo emitido (R6).
