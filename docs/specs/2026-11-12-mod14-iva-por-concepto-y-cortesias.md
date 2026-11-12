# MOD14 · IVA por concepto y cortesías

**Fecha:** 2026-11-12 · **Estado:** G0 aprobado por el usuario el 2026-11-12
**Relacionados:** [ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md), [ADR-103](../adrs/ADR-103-Modulo-Facturacion-MOD14.md), [fase 2 cierre de venta](2026-11-11-mod05-cierre-de-venta-fase-2-contrato-automatico-e-instalacion.md) (D-F1)

## Contexto

- El internet residencial lleva el IVA del estrato: estratos 1 y 2 exentos (0 %, se declara), estrato 3 excluido (no causa IVA).
- La instalación copia hoy ese tratamiento (D-F1).
- Los productos y servicios adicionales del contrato no se facturan: solo se cuentan como «adicionales sin cobrar».
- No hay forma de regalar un valor al cliente. Ejemplo: el prorrateo de octubre de un alta del 30-oct (55.000 × 2 ÷ 31 = 3.548,39) solo se puede cobrar o anular el documento.

## Decisiones del usuario (2026-11-12)

| # | Decisión |
|---|---|
| D1 | El tratamiento de IVA lo define **cada ítem del catálogo** comercial (MOD06). El exento o excluido por estrato aplica solo al acceso a internet. |
| D2 | Instalación, productos adicionales y servicios adicionales causan **19 %** salvo que su ítem del catálogo diga otra cosa. D-F1 queda sustituida. |
| D3 | Los productos y servicios adicionales del contrato **se facturan** en el cobro del periodo, con su IVA. |
| D4 | **Ajuste de cortesía** manual sobre un cobro: por línea o por valor, con motivo obligatorio y auditoría; baja el saldo y se ve en el documento y el estado de cuenta. |
| D5 | Solo **ADMIN y ACCOUNTANT**, con un permiso nuevo de cortesías. |

## Reglas

| # | Regla |
|---|---|
| R1 | Cada ítem del catálogo lleva tratamiento de IVA (`STANDARD` 19 %, `EXEMPT`, `EXCLUDED`) y base legal; el plan de internet conserva la regla del estrato (ADR-093). |
| R2 | La línea de instalación y las de adicionales toman el tratamiento de su ítem y lo congelan en el contrato. |
| R3 | Un adicional se cobra una vez (producto) o cada periodo (servicio), prorrateado igual que el plan. |
| R4 | Cortesía en borrador: línea negativa «Cortesía» con motivo; en emitido: ajuste de cortesía aplicado como abono no monetario al documento (no es pago ni nota crédito DIAN mientras no haya facturación electrónica). |
| R5 | La cortesía nunca supera el saldo del documento; se puede anular con motivo y vuelve el saldo. |
| R6 | La cortesía no reduce la base gravable ya declarada de un documento emitido; queda como descuento comercial posterior (pendiente concepto del contador). |

## Criterios de aceptación

- CA-1: un cliente estrato 2 con instalación de 50.000 paga internet exento y la instalación con IVA 19 % (9.500).
- CA-2: un adicional de servicio aparece cada periodo con su IVA; uno de producto, solo en el primer cobro.
- CA-3: ADMIN regala el prorrateo de octubre: el documento queda saldado y el siguiente mes se cobra completo.
- CA-4: sin permiso no hay botón y la API responde 403; toda cortesía queda auditada con motivo.

## Abierto

- Confirmar con el contador el IVA de la instalación vinculada a internet excluido (accesorio o independiente) y el tratamiento contable de la cortesía (R6).
