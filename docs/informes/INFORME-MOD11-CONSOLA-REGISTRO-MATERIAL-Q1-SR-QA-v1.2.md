# Informe MOD11 — consola de registro de material Q1 · SR-QA

**Versión:** 1.2  
**Fecha:** 2026-10-11  
**Estado:** **NO-GO — el worker rechazó el router porque el balance con lote no entra en la disponibilidad validada; no se confirmaron movimientos**  
**Commit/PR:** no creados.

## Resumen

La consola local quedó disponible con `pnpm dev`: API, base y Redis responden `ok`, y los puertos 3000, 3001 y 3002 están escuchando. En la sesión de Nepomuceno, OTE-20260828-001 sirve «Instalación estándar v3», sus seis requisitos y la acción habilitada.

Se envió una sola solicitud para `XC220-TEST-0031` antes de esta reanudación. Tras configurar la clave HMAC compartida local autorizada, el worker procesó el mismo request y persistió un recibo terminal `REJECTED/CUSTODY_INSUFFICIENT`. La causa observada en código y datos es que el balance `NEW` del serial está en un lote (`lot_id` no nulo), mientras que la validación busca disponibilidad sin lote y el POST no aporta lote. No reintenté el registro, no cambié el inventario ni volví a enviar el mismo serial.

La UI todavía muestra el registro como «Pendiente», el requisito como «Cumplido» provisional y advierte «No lo registres de nuevo». La base confirma que no hay movimiento ni comodato: el activo sigue `ASSIGNED_TO_TECHNICIAN`. No envié consumibles; abrí sus controles con cantidades en cero y cancelé.

## Preflight y resultado de datos

| Comprobación | Resultado |
| --- | --- |
| Sesión | Rol `TECHNICIAN`, tenant `tenant_iwana` |
| API tras recarga | HTTP 200, ETag `"1.3-8"`, plantilla v3 y seis requisitos |
| Servicios locales | `/api/v1/health`: `status=ok`, `db=ok`, `redis=ok`; puertos 3000, 3001 y 3002 activos |
| Requisito de equipos | Visible y acción habilitada; la UI conserva «Cumplido» provisional aunque la conciliación fue rechazada |
| Requisito de materiales | Visible, opcional y con acción habilitada |
| Solicitud del serial | `inventory_request_id=b6c97e6e-cc51-4a0a-89f1-4e5e269d05fa`, `movement_status=REJECTED`, `request_attempts=3`, `reason=CUSTODY_INSUFFICIENT` |
| Recibo | `outcome=REJECTED`, `stock_movement_id=NULL`; no hay movimiento confirmado ni comodato abierto |
| Activo serializado | `XC220-TEST-0031` sigue `ASSIGNED_TO_TECHNICIAN` en la custodia activa `CRW-001` |
| Balance del serial | 2 unidades en condición `NEW`, con `lot_id` no nulo; no hay balance equivalente sin lote para esa ubicación e ítem |
| Saldos de consumibles | Patchcord 4 y roseta 2 en condición `NEW`; ambos balances también tienen `lot_id` no nulo. Ninguna cantidad fue enviada |

La ruta de rechazo es observable en `inventory-execution-request.processor.ts` y `stock-ledger.service.ts`: la validación del registro de OT consulta `condition=NEW` sin indicar `lotId`, por lo que `getAvailabilityWithManager` solo cuenta la fila sin lote. `buildExecutionOrderMovementLines` tampoco incluye `lotId`. La consulta del formulario agrupa y muestra las disponibilidades conforme a §16.3, pero el servidor no puede consumir esos balances con lote. El mismo desajuste afecta al router, patchcord y roseta; enviar los consumibles ahora generaría rechazos terminales en vez de cumplir la prueba.

## Resultado por criterio Q1

| Criterio | Resultado | Evidencia / límite |
| --- | --- | --- |
| 1. Registrar el router; confirmar, retirarlo de la lista, marcar «Cumplido» y crear `INSTALLED_COMODATO` con comodato | **NO-GO** | El recibo terminal quedó `REJECTED/CUSTODY_INSUFFICIENT`; el serial no se movió ni abrió comodato. La UI conserva el estado provisional y recomienda no registrarlo de nuevo. |
| 2. Registrar 2 patchcord y 1 roseta en dos registros confirmados; verificar 4→2 y 2→1 | **No ejecutado** | Se inspeccionaron las filas −/+ y disponibilidades. La lectura de DB mostró que ambos balances tienen lote y el backend aplicaría el mismo rechazo que al router; se canceló antes del POST. Saldos sin cambios. |
| 3. Forzar fallo de una fila y demostrar reintento sin duplicado | **No ejecutado** | La DLQ del worker no equivale al fallo controlado del cliente tras una aceptación. No se simuló el reintento de una fila desde la UI. |
| 4. 375/1280 px, claro/oscuro, teclado/foco y hoja dentro de 812 px | **Parcial** | Verificados 375×812 y 1280×800 en tema claro y oscuro; `documentWidth` coincidió con el viewport en ambas anchuras. En 375×812 el botón del formulario estuvo visible sin desplazar hasta el final; al navegar por flechas, el radio seleccionado mostró foco visible. La captura se inspeccionó en pantalla, sin archivo local. |
| 5. Regresión de historial, reverso y tres pantallas migradas | **Parcial** | En la OT el historial muestra la solicitud pendiente. El reverso no se pudo recorrer porque no hay movimiento confirmado y el rol es técnico. Las tres pantallas quedaron cubiertas por los tests de F1; no se completó su recorrido visual en navegador. |

## Condiciones técnicas de F2

La inspección visual confirma el patrón según el artículo: dos activos serializados en tarjetas de radio; drop, patchcord y roseta en filas de cantidad. El contexto de custodia/destino es de solo lectura. El formulario de consumibles muestra tres filas y sus disponibilidades; el requisito opcional permanece «Sin registrar» tras cancelar.

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

Durante esta reanudación se capturó la consola autenticada en 375×812 (ambos temas), 1280×800 (ambos temas), el formulario de consumibles y el foco de teclado en las tarjetas de radio. Las capturas aparecieron en la sesión, pero no se guardaron en `docs/informes/assets/`: la exportación anterior mediante URL `data:` fue bloqueada por la política del navegador y la interfaz de captura no ofrece una ruta local de exportación. Los assets existentes siguen siendo solo capturas de login; la entrega de capturas como archivos permanece pendiente.

## Dictamen y reanudación

**Q1 queda en NO-GO.** La versión v3, el ETag y los servicios locales están disponibles. La interfaz presenta disponibilidad agregada entre lotes, pero el backend de OT valida y mueve solo balances sin lote. Este desajuste bloquea los tres artículos previstos. No se debe reenviar el request ni registrar consumibles hasta que el movimiento pueda asignar/consumir balances con lote; la reversión no aplica porque no hubo movimiento confirmado.

Se configuró la clave HMAC compartida de desarrollo en `.env.development.local`, ignorado por Git, según la autorización del usuario. No se cambió código ni inventario y no se creó un commit. Faltan la prueba de consumibles, el fallo/reintento controlado, el reverso autorizado y los archivos de captura en `docs/informes/assets/`.
