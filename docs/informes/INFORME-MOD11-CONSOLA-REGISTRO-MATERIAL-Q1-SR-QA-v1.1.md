# Informe MOD11 — consola de registro de material Q1 · SR-QA

**Versión:** 1.1  
**Fecha:** 2026-10-11  
**Estado:** **NO-GO — el worker dejó la solicitud del router pendiente; no se confirmaron movimientos**  
**Commit/PR:** no creados.

## Resumen

La sesión autenticada de Nepomuceno sirve la plantilla correcta después de recargar: GET de OTE-20260828-001 con HTTP 200, ETag `"1.3-8"`, «Instalación estándar v3» y seis requisitos. La acción de registro está habilitada.

Se envió una sola solicitud para `XC220-TEST-0031`. El API la aceptó, pero el worker no confirmó el movimiento: la interfaz muestra «Pendiente», el activo sigue asignado al técnico y la base no tiene recibo ni comodato abierto. La recuperación automática volvió a emitir la solicitud con la misma clave de inventario; el segundo evento también terminó en DLQ con `UnrecoverableError`. No repetí el POST desde la interfaz.

No envié patchcord ni roseta. Abrí el formulario, seleccioné cantidades 2 y 1 solo para comprobar la presentación y cancelé el formulario antes de enviar. Los saldos siguen en 4 y 2.

## Preflight y resultado de datos

| Comprobación | Resultado |
| --- | --- |
| Sesión | Rol `TECHNICIAN`, tenant `tenant_iwana` |
| API tras recarga | HTTP 200, ETag `"1.3-8"`, plantilla v3 y seis requisitos |
| Requisito de equipos | Visible y acción habilitada; tras aceptar la solicitud, el requisito figura «Cumplido» en la UI, de forma provisional |
| Requisito de materiales | Visible, opcional y con acción habilitada |
| `XC220-TEST-0031` | Una fila `INSTALL` / `INSTALLED_AT_CUSTOMER`, `movement_status=PENDING`, `request_attempts=2` |
| Outbox de inventario | Dos intentos/eventos para el mismo `inventoryRequestId`; ambos registran `UnrecoverableError` en DLQ |
| Inventario confirmado | Sin recibo, sin movimiento confirmado y sin comodato abierto; el activo continúa `ASSIGNED_TO_TECHNICIAN` |
| Saldos mostrados por la consola | Patchcord 4; roseta 2 |

El segundo evento de recuperación usa el ID real de la OT como agregado y también terminó en DLQ. La evidencia persistida contiene el tipo de error, pero no el mensaje interno; esta corrida no identifica por sí sola la causa exacta del fallo del worker.

## Resultado por criterio Q1

| Criterio | Resultado | Evidencia / límite |
| --- | --- | --- |
| 1. Registrar el router; confirmar, retirarlo de la lista, marcar «Cumplido» y crear `INSTALLED_COMODATO` con comodato | **NO-GO** | Se envió una solicitud y la UI marcó el requisito provisionalmente, pero el registro sigue pendiente, el serial permanece en la lista de selección y no existe movimiento ni comodato confirmado. |
| 2. Registrar 2 patchcord y 1 roseta en dos registros confirmados; verificar 4→2 y 2→1 | **No ejecutado** | Solo se revisó la vista previa con cantidades 2 y 1; se canceló sin POST. Los saldos no cambiaron. |
| 3. Forzar fallo de una fila y demostrar reintento sin duplicado | **No ejecutado** | La DLQ del worker no equivale al fallo controlado del cliente tras una aceptación. No se simuló el reintento de una fila desde la UI. |
| 4. 375/1280 px, claro/oscuro, teclado/foco y hoja dentro de 812 px | **Parcial** | En 375×812 se revisaron temas claro y oscuro, filas −/+ y cantidades, foco por teclado y hoja de 812 px. El foco `:focus-visible` mostró un anillo visible. El navegador integrado mantuvo `innerWidth=375` al pedir 1280; escritorio no quedó verificado. |
| 5. Regresión de historial, reverso y tres pantallas migradas | **Parcial** | En la OT el historial muestra la solicitud pendiente. El reverso no se pudo recorrer porque no hay movimiento confirmado y el rol es técnico. Las tres pantallas quedaron cubiertas por los tests de F1; no se completó su recorrido visual en navegador. |

## Condiciones técnicas de F2

La inspección visual de la hoja confirma el patrón según el artículo: el router serializado aparece en tarjetas de radio y patchcord/roseta en filas de cantidad. La vista previa de consumibles muestra saldos y controles −/+.

El lote serial, el refresco/reintento ante `412` y la clave estable por fila se verificaron en los tests de F2 reportados en [INFORME-MOD11-CONSOLA-REGISTRO-MATERIAL-F-v1.0.md](INFORME-MOD11-CONSOLA-REGISTRO-MATERIAL-F-v1.0.md). Q1 no pudo demostrar esos tres puntos mediante movimientos confirmados en una sesión real.

## Gates automáticos disponibles

Los gates de F1/F2 permanecen aprobados y se citan como regresión automatizada, no como recorrido de navegador:

| Gate reportado por F | Resultado |
| --- | --- |
| Jest de `operations/` sin caché | 44 suites, 780 tests aprobados |
| Jest de los tres consumidores migrados y `api-client` | 4 suites, 26 tests aprobados |
| Jest de `@iwana/ui` | 5 suites, 34 tests aprobados |
| `pnpm typecheck` | 8 tareas exitosas |
| `audit-ui.mjs` | Sin hallazgos |

## Evidencia visual

Durante la sesión se observaron capturas autenticadas de la consola móvil, incluidos ambos temas y la vista previa de patchcord 2 / roseta 1. No quedaron archivos nuevos en `docs/informes/assets/`: el navegador rechazó la exportación intentada mediante una URL `data:` (solo permite `http:` y `https:`), y no se empleó otra vía para sortear esa restricción. Los assets existentes corresponden únicamente a la página pública de login y no prueban la consola.

## Dictamen y reanudación

**Q1 queda en NO-GO.** La v3 y el ETag ya están corregidos; el bloqueo actual está en la conciliación asíncrona. No se deben volver a registrar los materiales hasta que el equipo local de API/worker confirme por qué las solicitudes terminan con `UnrecoverableError` y la fila actual salga de `PENDING` o se determine una recuperación segura. La ejecución de este informe no cambia la configuración de firma del worker.

No se modificó código ni se creó un commit.
