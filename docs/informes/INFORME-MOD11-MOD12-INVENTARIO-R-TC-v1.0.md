# Informe de corrección MOD11 ↔ MOD12 — R-TC

**Fecha:** 2026-10-09  
**Agente:** sr-backend  
**Dictamen:** **GO**  
**Alcance:** compilación global y repetición de los cuatro recorridos integrados CA-04 después de R-D11b.  
**Sin commit.**

## Corrección

`InventoryExecutionRequestProcessor` recibe seis dependencias: `DataSource`, configuración, ledger, cola de respuestas, DLQ y cola de solicitudes. El spec integrado de Ola 3d construía el processor con cinco argumentos. Añadí `requestQueue`, la instancia real de `INVENTORY_EXECUTION_REQUESTS_QUEUE` del spec, como sexto argumento en `apps/api/src/modules/inventory/tests/inventory-execution-request.ola3d.postgres.integration.spec.ts`.

Revisé todos los constructores encontrados con `rg` para `InventoryExecutionRequestProcessor` y `ExecutionOrderRelayProcessor` en `apps` y `packages`. El test unitario del processor ya pasaba seis argumentos. Los dos specs de `ExecutionOrderRelayProcessor` ya pasaban sus cuatro dependencias. No encontré otra construcción omitida o con aridad desactualizada.

## Gates

### Typecheck global

Comando ejecutado desde `C:\appiw`:

```text
pnpm typecheck --force
```

Resultado: **8 tareas exitosas, 0 fallidas, 0 caché**, en 9 paquetes del scope. Incluyó el typecheck de `@iwana/api` que detectaba el `TS2554`.

### CA-04 integrado contra Postgres y Redis

La configuración de Jest verificó PostgreSQL en `127.0.0.1:5433`, base sintética `i4_qa_20261006_a1`, y activó `IWANA_DB_INTEGRATION_AVAILABLE=true`. Se seleccionó el tenant sintético `i4-qa-a-20261006-9d3098f4`, cuyo schema tiene prefijo `tenant_i4_qa_`. El spec creó workers y colas BullMQ reales en Redis local, DB 15, puerto 6380, bajo un prefijo aleatorio; la prueba procesó las solicitudes en las colas y verificó recibos y proyección en PostgreSQL.

Comando exacto, ejecutado desde PowerShell en `C:\appiw`:

```powershell
$env:DB_NAME='i4_qa_20261006_a1'; $env:E2E_TENANT_SLUG='i4-qa-a-20261006-9d3098f4'; pnpm --filter @iwana/api exec jest --config jest.integration.config.js --runInBand --runTestsByPath src/modules/inventory/tests/inventory-execution-request.ola3d.postgres.integration.spec.ts --verbose
```

Resultado: **1 suite aprobada; 4/4 recorridos aprobados**, cada uno con un intento y sin error API:

| Motivo CA-04 | Resultado |
| --- | --- |
| `SUBSCRIBER_REQUIRED` | recibo `REJECTED` y proyección `REJECTED` |
| `CUSTODY_INSUFFICIENT` | recibo `REJECTED` y proyección `REJECTED` |
| `ITEM_INACTIVE` | recibo `REJECTED` y proyección `REJECTED` |
| `SERIAL_NOT_IN_CUSTODY` | recibo `REJECTED` y proyección `REJECTED` |

Salida de Jest: `Tests: 4 passed, 4 total`; duración 11.857 s. PostgreSQL confirmó que la suite se ejecutó; no se omitió por gating.

## Aislamiento y estado del repositorio

La corrida usó únicamente la base y tenant sintéticos. No se consultó ni modificó `tenant_iwana` ni sus órdenes reales. El informe no contiene credenciales. No hice limpieza, reset ni commit, y preservé los cambios previos del workspace.
