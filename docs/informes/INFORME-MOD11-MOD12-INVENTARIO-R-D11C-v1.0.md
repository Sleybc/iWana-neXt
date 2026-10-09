# Informe de implementación MOD11 ↔ MOD12 — R-D11c

**Versión:** 1.0  
**Fecha:** 2026-10-09  
**Agente:** sr-backend  
**Dictamen:** **GO para el alcance y los gates solicitados**  
**Estado:** Implementado y verificado  
**Commit:** No realizado.

## Cambio

Las constantes `INVENTORY_SOURCE_MAX_AGE_MS` (24 horas) e
`INVENTORY_SOURCE_CLEANUP_INTERVAL_MS` (1 hora) ahora se definen una sola vez en
`packages/shared/src/constants/inventory-source-retention.ts` y se exportan desde
`@iwana/shared`.

El API y el worker importan ambas constantes. La limpieza de fallidos en
`inventory-execution-requests` y `operations-execution-events` pasa a usar una
gracia calculada como:

```text
INVENTORY_SOURCE_MAX_AGE_MS - INVENTORY_SOURCE_CLEANUP_INTERVAL_MS
= 24 h - 1 h
= 23 h
```

La programación repetible sigue usando el intervalo compartido de una hora en
ambos procesos.

## Prueba del umbral

Los tests de limpieza de API y worker comprueban los valores compartidos y que la
gracia resultante sea exactamente 23 horas. Simulan un job fallido de 23 horas y
30 minutos y verifican que `clean(..., 'failed')` lo elimine en el siguiente
ciclo. También conservan el caso de job reciente y cubren la ejecución de cada
proceso por separado.

## Gates ejecutados

Comandos ejecutados desde `C:\appiw` con `--no-cache`:

```text
pnpm --filter @iwana/api exec jest --no-cache --runInBand src/modules/inventory
Test Suites: 3 skipped, 78 passed, 78 of 81 total
Tests:       8 skipped, 798 passed, 806 total

pnpm --filter @iwana/worker exec jest --no-cache --runInBand
Test Suites: 17 passed, 17 total
Tests:       142 passed, 142 total
```

## Cierre

La gracia ya descuenta un ciclo completo del máximo de edad y se deriva de las
dos constantes compartidas. Los gates solicitados pasan. No se inspeccionó ni
modificó el caso histórico ni jobs de Redis. Sin commit.
