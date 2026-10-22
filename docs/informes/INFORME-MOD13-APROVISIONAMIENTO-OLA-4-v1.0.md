# INFORME-MOD13 — Aprovisionamiento · Ola 4

**Versión:** 1.0  
**Estado:** B3 implementado y verificado; F1-v bloqueado por precondición local  
**Fecha:** 2026-10-22  
**Emisor:** sr-backend (Codex)  
**Fuentes:** [HLD-MOD13 v1.1](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md) · [plan de ejecución](../plans/2026-10-22-mod13-aprovisionamiento.md) · [prompt de fase](../prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md) · [informe Ola 3](INFORME-MOD13-APROVISIONAMIENTO-OLA-3-v1.0.md)

## Resultado

B3 separa el puerto de lectura de aprovisionamiento del módulo de red para que `TasksModule` no importe `NetworkModule`. El worker publica eventos de instalación firmados; el API verifica la firma, persiste el inbox, aplica los cambios de estado y emite la activación. Los listeners CRM y de inventario quedan conectados al `EventEmitter2`; el reconciliador procesa órdenes que dejaron de estar en ejecución; y `POST /network/provisioning/regularize` aplica las guardas R12/R6/R6 ter, idempotencia y auditoría.

La falla de un listener mantiene la activación comercial en `PENDING`, registra el código cerrado del inbox y permite el reintento. La identidad segura de un evento con firma inválida se guarda como `SIGNATURE_INVALID` con `ON CONFLICT DO NOTHING`, sin reemplazar un inbox existente.

No se aplicaron migraciones a tenants existentes. Las integraciones crearon y eliminaron schemas y tenants sintéticos; el registro temporal `ACTIVE` se insertó después de crear y preparar su schema. No hubo commit.

## Evidencia

| Alcance | Resultado medido |
| --- | --- |
| Eventos, CRM/Inventario, regularización y reconciliador, PostgreSQL `127.0.0.1:5433/dbiw` + Redis `127.0.0.1:6380` reales | **1 suite, 5 tests aprobados**: inbox `SIGNATURE_INVALID`; CA-NET-07/09 con listeners registrados, activación de suscriptor, falla CRM dentro de `@OnEvent`, reintento y inbox idempotente; CA-NET-10; CA-NET-11; CA-NET-08. Fixtures y prefijos BullMQ sintéticos eliminados. |
| Rollback de auditoría B2, PostgreSQL real | **1 suite, 3 tests aprobados**: rollback de `reserve`, `certify` y `release`. Schema sintético eliminado. |
| API `network` | **6 suites, 23 tests aprobados**. |
| API `tasks` | **37 suites, 748 tests aprobados**, incluida la prueba de frontera B3. |
| API `network` + `tasks` | **43 suites, 771 tests aprobados**. |
| Worker | **21 suites, 173 tests aprobados**. |
| API y worker | Typecheck, lint y build aprobados. El lint del API informó 7 advertencias preexistentes en archivos ajenos a B3; no hubo errores. |
| Archivos y Jest | `git diff --check` pasó; **0 directorios de caché Jest** en el repositorio. `--no-cache` y `TEMP`/`TMP` apuntaron al directorio temporal externo. |
| Colas BullMQ de desarrollo | `network-execution-events` y `network-provisioning-reconcile`: `waiting=0`, `active=0`, `paused=0`, `delayed=0`, `prioritized=0`, `failed=0`, `completed=0` en la lectura final. |

## F1-v · bloqueo

**[BLOQUEO] F1-v —** al comprobar la precondición, `127.0.0.1:3000` no aceptaba conexiones y `E2E_TENANT_ADMIN_EMAIL` / `E2E_TENANT_ADMIN_PASSWORD` no estaban presentes en el entorno. Se detuvo F1-v sin ejecutar pruebas contra mocks ni tocar código del portal: **0 suites / 0 tests**. G4 sigue pendiente hasta que el API local y las credenciales de un tenant de pruebas no `ACTIVE` estén disponibles en el entorno.

## Deuda y alcance

- Deuda nueva P0–P3: ninguna identificada en B3.
- F1-v queda pendiente por su precondición ambiental, no por un fallo de producto.
- F2 y los eventos/consumidores que no pertenecen al flujo de ejecución MOD13 quedan fuera de esta ola.
