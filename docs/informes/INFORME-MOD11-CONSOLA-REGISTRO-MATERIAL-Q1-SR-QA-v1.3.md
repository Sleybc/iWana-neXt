# Informe MOD11 — consola de registro de material Q1 · SR-QA

**Versión:** 1.3  
**Fecha:** 2026-10-11  
**Estado:** **NO-GO global — registro serializado y consumibles confirmados; faltan evidencias de reintento en navegador, reverso con rol supervisor y capturas autenticadas como archivos**  
**Tenant probado:** `tenant_iwana`  
**Commit/PR:** no creados.

## Resumen

Después de incorporar R-LOT, se repitió Q1 en la sesión local de Nepomuceno. El router `XC220-TEST-0031` quedó confirmado e instalado en comodato. Los registros de 2 patchcord y 1 roseta también quedaron confirmados; sus saldos de custodia bajaron de 4 a 2 y de 2 a 1. Las seis líneas de movimiento conservaron su lote entre origen y destino.

Se corrigió el estado local de sincronización que ocultaba las acciones de requisitos: con autorización del usuario se limpió `last_error` únicamente en el evento antiguo cuyo recibo ya era terminal, conservando la fila de DLQ como auditoría. Luego se subió la versión de la OT de 10 a 11 para que la UI recibiera el cambio y actualizara el ETag. No se alteraron el inventario ni los recibos históricos.

Q1 sigue NO-GO global porque no se pudo demostrar desde el navegador el reintento de la misma fila tras fallo de red: el formulario recibió HTTP 202, retiró la fila y descartó su clave local antes de que el worker marcara el rechazo. El rechazo inducido no generó movimiento ni duplicado. Los tests sí verifican que la clave estable se reutiliza en el reintento del cliente. También faltan el recorrido del reverso con sesión supervisora y los archivos de captura autenticada solicitados; las capturas visuales se revisaron en la sesión, pero no se guardaron localmente.

## Preflight y reparación local

| Comprobación | Resultado |
| --- | --- |
| Sesión y alcance | Técnico Nepomuceno; todas las escrituras de prueba en `tenant_iwana` |
| API, worker, portal | Reiniciados con el build que incluye R-LOT; API, DB y Redis saludables |
| Orden | `OTE-20260828-001`, plantilla «Instalación estándar v3», seis requisitos; versión 10→11 para invalidar la copia de UI luego de la reparación del evento |
| Evento antiguo | `last_error` se limpió en el evento `2b82799d-e8b1-460c-acee-2144ea34f691`, ligado al request terminal `b6c97e6e-cc51-4a0a-89f1-4e5e269d05fa`; la entrada DLQ se conservó |
| Estado tras recarga | La orden apareció sincronizada y la acción de registrar quedó habilitada |

La solicitud antigua del router se mantiene como `REJECTED/CUSTODY_INSUFFICIENT`; no tiene movimiento. El router de Q1 se registró con una solicitud nueva, sin volver a enviar la solicitud antigua.

## Resultados de navegador y base

| Paso | Resultado | Evidencia |
| --- | --- | --- |
| 1. Registrar `XC220-TEST-0031` desde las tarjetas | **GO** | Request `4c18b0f3-5a2e-43bb-9e87-fcbd232783a6` y movimiento `8d963706-19fb-41c6-a404-fe89bc21c9ad` confirmados. El serial salió de la custodia y de las opciones disponibles; el requisito quedó «Cumplido». El activo pasó a `INSTALLED_COMODATO` y quedó comodato abierto `d9b197d8-1f69-46e4-a622-8c0397365bac`. Movimiento `MOV-000007`: −1 en `CRW-001` y +1 en `CLI-001`, lote `04092026`. |
| 2. Registrar 2 patchcord y 1 roseta | **GO** | Patchcord: request `5eb2187c-c22e-44bf-a020-bcc57d4db69c`, movimiento `134610ce-afb7-4978-a8f3-4f3a5a72ac79`, `CONFIRMED`. Roseta: request `cf815ea9-eb32-403b-92c4-b7a553894878`, movimiento `cdabbc89-ba5e-45d5-babb-a1f0c8d40456`, `CONFIRMED`. Custodia `CRW-001` (`Ford Ecosport YBM908`): patchcord 4→2 y roseta 2→1. Cada salida y entrada conserva el mismo lote: patchcord `LOT-GR-000003-1`; roseta `CP-3041-01`. |
| 3. Forzar fallo y comprobar reintento sin duplicado | **Parcial** | Una fila de 3 patchcord, preparada con una disponibilidad ya obsoleta de 4 en otra pestaña, terminó `REJECTED/CUSTODY_INSUFFICIENT` frente al saldo vigente de 2. No creó movimiento y la historia mostró el rechazo; no hubo consumo duplicado. La UI había aceptado el POST con 202 y retirado la fila antes del rechazo asíncrono, por lo que no ofreció reintentar esa fila con la misma clave. Los tests de F2 cubren la reutilización de la clave por fila en el reintento y el único reintento tras 412; eso no sustituye la demostración de navegador pedida. |
| 4. Visual, tamaños, temas y teclado | **Parcial** | En la revisión de navegador ya documentada en v1.2 se comprobaron 375×812 y 1280×800, temas claro y oscuro, navegación por flechas y foco visible; el formulario cupo en 812 px. En esta reanudación se revisó la consola y el historial autenticados. No se produjeron archivos de captura en `docs/informes/assets/`. |
| 5. Historial, reverso y tres migraciones | **Parcial** | El historial de la OT mostró los registros confirmados y la fila rechazada. No se recorrió el reverso en navegador: la sesión disponible es de técnico y el reverso requiere supervisión. R-LOT sí comprobó mediante integración real el reverso de un movimiento repartido por lotes. Las tres pantallas migradas tienen cobertura automatizada F1; no se completó su recorrido visual en navegador durante Q1. |

Los saldos y movimientos anteriores se consultaron después de que el worker completara los registros. Para el fallo inducido se verificó el recibo terminal y la ausencia de movimiento. La ejecución permaneció dentro de `tenant_iwana`.

## Cobertura automatizada consultada

| Gate | Resultado |
| --- | --- |
| Tests de captura, adaptador y `api-client` | 3 suites, 74 tests aprobados, `--no-cache`; incluyen criterios de §16.6, serialización por versión vigente, refresco y reintento único ante 412, y clave estable por fila |
| API `execution-orders.task8.spec.ts` | 1 suite, 24/24 tests aprobados, `--no-cache` |
| R-LOT integrado contra PostgreSQL y Redis reales | 1 suite, 13/13 tests aprobados; incluye reparto, saldo insuficiente, serial sin lote y reverso repartido |
| F1/F2 reportado | `@iwana/ui` 34/34; `operations/` 780 tests; typecheck 8/8; `audit-ui.mjs` sin hallazgos |

Los gates de F1/F2 y R-LOT se citan desde sus informes; no se presentan como recorrido de navegador.

## Dictamen

**Q1 v1.3 queda en NO-GO global, con los flujos principales de registro en GO.** Ya se comprobó en el tenant de ejemplo que el router serializado y los consumibles con lote llegan a `CONFIRMED`, y que la asignación conserva los lotes en origen y destino. R-LOT resolvió el defecto de MOD12 observado en v1.2.

Quedan pendientes para cerrar Q1: demostrar en navegador que un reintento de una fila tras fallo reutiliza su clave y no duplica el consumo, recorrer el historial del reverso con sesión supervisora y guardar las capturas autenticadas como archivos en `docs/informes/assets/`. No se debe volver a enviar el request rechazado de 3 patchcord como si fuera el mismo reintento: la UI no conservó su clave después del 202. Los dos consumos confirmados se pueden deshacer mediante el reverso como supervisor si se requiere restablecer los datos de ejemplo.

No se creó commit ni PR.
