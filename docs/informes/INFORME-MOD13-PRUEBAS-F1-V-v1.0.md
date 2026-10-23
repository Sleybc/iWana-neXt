# MOD13 — Pruebas F1-v contra el API real

**Versión:** 1.0  
**Estado:** En revisión; API verificado, validación del portal pendiente por fallo de sesión y permisos  
**Fecha:** 2026-10-23 (America/Bogota)  
**Responsable:** AI-FE-PLATFORM  
**Fuentes:** [plan](../plans/2026-10-22-mod13-aprovisionamiento.md), [prompt §F1-v y §Ola 9](../prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md), [HLD v1.1](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md).

## Precondiciones verificadas

- API en `127.0.0.1:3000`: `GET /api/v1/health` devuelve 200.
- Tres variables E2E presentes tras cargar el entorno del workspace con precedencia shell → `.env.development.local` → `.env.development` → `.env`. No se imprimieron sus valores.
- Tenant de pruebas existente y `ACTIVE`, confirmado con consulta parametrizada de solo lectura a `public.tenants`; distinto de `tenant_iwana`.
- Login ADMIN directo al API: 200, token emitido y sin requisito MFA pendiente.
- Portal disponible en `http://localhost:3002/auth/login`: 200. El proceso fue preparado por el coordinador.

La precondición `ACTIVE` sigue la corrección explícita de §Ola 9, que reemplaza la frase histórica «no ACTIVE» de §F1-v.

## Ejecuciones y conteo real

No existen specs de MOD13 en `e2e/tests/` al iniciar esta ejecución. Se usaron dos scripts temporales fuera del repositorio: `mod13-f1-live-retry.test.cjs` y `mod13-f1-portal-live.test.cjs`, en `%TEMP%`. El primero utiliza `node:test` y HTTP real; el segundo usa `node:test` y Chromium de Playwright. No intervienen Turbo, mocks del API ni cachés de Jest.

| Ejecución con salida recogida | Suites | Tests | Aprobados | Fallidos | Omitidos |
| --- | --- | --- | --- | --- | --- |
| API real, ejecución corregida del harness | 1 | 7 | 7 | 0 | 0 |
| Portal ADMIN real, Chromium, primer intento | 1 | 3 | 0 | 3 | 0 |
| Portal ADMIN, repetición con comprobación de interactividad | 1 | 3 | 0 | 3 | 0 |

Conteo de las tres ejecuciones con salida recogida (API corregido y dos intentos UI): **3 suites ejecutadas, 13 tests ejecutados, 7 aprobados, 6 fallidos**. Son 10 casos distintos: 7 API y 3 UI repetidos una vez. Cobertura no medida. G4 permanece abierto.

Comandos: `node --test --test-concurrency=1 <ruta-absoluta-del-script-en-TEMP>`; el segundo guardó sus salidas en `%TEMP%/mod13-f1-portal-live.tap` y `%TEMP%/mod13-f1-portal-retry.tap`.

La primera ejecución del harness HTTP produjo 7 fallos porque asumía que las respuestas del catálogo estaban envueltas en `data`; el API devuelve el DTO directamente. El alta devolvió 201 pero el harness perdió la referencia al router. Se corrigió exclusivamente el script temporal y se repitió: 7/7. Esos 7 fallos iniciales no constituyen hallazgos del producto ni se suman al conteo final. Hubo una invocación exploratoria del smoke UI cuya salida no se conservó; no se utiliza como evidencia ni se suma al conteo recogido.

## Escenarios API aprobados

| Escenario | Evidencia |
| --- | --- |
| Alta de router | POST 201 y estado ACTIVE |
| Edición de router | PATCH 200, notas persistidas y control de versión |
| Alta de red IPv4 | POST 201 y estado ACTIVE, asociada al router sintético |
| Edición de red IPv4 | PATCH 200 y nombre persistido |
| Solapamiento dentro del router | POST 409, código exacto NETWORK_OVERLAP |
| Ocupación por listado real | total 11, reserved 0, active 0, free 11 |
| Desactivación de red y router | Ambas operaciones POST 200 y estado INACTIVE |

Las escrituras se limitaron a fixtures sintéticos del catálogo. Las dos filas router creadas (incluido el router huérfano del primer harness) y la red quedaron INACTIVE por el API. El contrato no expone DELETE: los registros y su auditoría permanecen como fixtures desactivados; no se borraron por SQL. No se migraron tenants ni se modificaron usuarios o permisos.

## Fallos observados en el portal

1. El formulario de login acepta los datos del fixture, pero después de «Ingresar» vuelve a `/auth/login`; no alcanza `/dashboard` en 60 segundos. La autenticación directa del mismo fixture contra el API sí devuelve 200. No se atribuye todavía la causa a un componente concreto.
2. Navegar al catálogo de routers no produce la respuesta GET esperada de `/api/v1/network/routers` en 20 segundos, después del fallo de sesión.
3. Navegar al catálogo IPv4 no produce la respuesta GET esperada de `/api/v1/network/ipv4-networks` en 20 segundos, después del fallo de sesión.

Los dos últimos fallos dependen de la sesión fallida; no prueban por sí solos un defecto de los catálogos.

Antes de clasificar el problema se revisó `LoginForm.tsx`: el formulario usa empresa, correo y contraseña, invoca el login y dirige a `/dashboard`. El harness usa `localhost:3002`, rellena los tres campos y arma cada espera HTTP antes de navegar a la ruta del catálogo correspondiente. Se repitió una vez agregando un control observable de interactividad: «Mostrar contraseña» debe cambiar el input de password a text antes de rellenar credenciales. Ese control no cambió el tipo en 20 segundos; no se observó ninguna petición `/api/v1/auth/` en esa repetición. La prueba de login quedó detenida antes del envío. Los dos catálogos volvieron a agotar sus esperas de 20 segundos.

La ausencia de interactividad queda como problema de runtime sin causa confirmada. No se presenta como defecto demostrado de autenticación ni de MOD13. No se corrigió código de producto.

## Pendientes

[BLOQUEO] Falta un actor de pruebas autenticable en el mismo tenant con lectura de catálogo y sin `network.catalog.manage` para verificar las acciones ocultas contra el API real. ADMIN no demuestra ese escenario. No se crearon usuarios ni se cambiaron permisos para suplirlo.

También queda pendiente completar las operaciones desde el portal una vez resuelto el fallo de sesión. Los 7 tests HTTP aprobados verifican el API; no sustituyen la validación integrada del frontend. No se hizo commit ni se modificaron contratos.

## Ola 11 · F1-v2

**Fecha:** 2026-10-23 (America/Bogota).

### Precondiciones y recuperación

En el primer intento, `GET http://127.0.0.1:3000/api/v1/health` no conectó. Nest encontró 0 errores de compilación, pero TypeORM no pudo conectar con Postgres (`ECONNREFUSED 127.0.0.1:5433`) y Redis rechazó la conexión (`ECONNREFUSED 127.0.0.1:6380`); el API no abrió listener. El coordinador conservó un tail saneado. El log del intento previo no estaba disponible, por lo que no se atribuye causa.

En el reintento, Postgres y Redis se levantaron con Docker Compose. Redis quedó healthy, pero el API repitió los reintentos de TypeORM 1–9 y terminó con `ExceptionHandler: connect ECONNREFUSED 127.0.0.1:5433`. El coordinador guardó ese tail saneado antes de reiniciar el API. Tras la recuperación, comprobé independientemente `GET /api/v1/health` = **200** y `GET http://localhost:3002/auth/login` = **200**. Las credenciales de ADMIN y solo lectura estaban presentes en el entorno local; no se imprimieron sus valores.

### Ejecución navegador

Usé Chromium headless y un harness temporal fuera del repositorio (`%TEMP%/mod13-f1-v2-live.test.cjs`), sin mocks de API. En cada sesión esperé a que el control estuviera visible y habilitado, a `networkidle` y a que React hubiera conectado el manejador del control antes de cada clic. Esa última comprobación sincroniza la carrera identificada en el triaje; no valida internals de producto. Se usaron contextos de navegador separados para ADMIN y `E2E_NETWORK_READONLY_*`.

| Escenario | Evidencia |
| --- | --- |
| Login ADMIN | Llegó a `/dashboard` desde la UI. |
| Routers ADMIN | GET real de `/api/v1/network/routers` respondió 200 y se mostró «Routers registrados». |
| Redes IPv4 ADMIN | GET real de `/api/v1/network/ipv4-networks` respondió 200 y se mostró «Redes IPv4 registradas». |
| Login solo lectura | Llegó a `/dashboard` desde la UI. |
| Routers solo lectura | GET respondió 200; «Registrar router», editar y activar/desactivar no aparecieron. |
| Redes IPv4 solo lectura | GET respondió 200; «Registrar red», editar y activar/desactivar no aparecieron. |

| Ejecución Ola 11 | Suites | Tests | Aprobados | Fallidos | Omitidos |
| --- | ---: | ---: | ---: | ---: | ---: |
| Intento inicial, health no disponible | 0 | 0 | 0 | 0 | 0 |
| F1-v2 Chromium tras recuperación | 1 | 6 | 6 | 0 | 0 |

Comando: `node --test --test-concurrency=1 %TEMP%/mod13-f1-v2-live.test.cjs`. No se modificaron producto, expediente, OT, fixtures ni permisos. No se midió cobertura. Los bloqueos históricos de credenciales y actor de solo lectura quedaron resueltos por FX-v1; los resultados anteriores permanecen como historia de esas corridas. G4 sigue pendiente de los demás bloques de la Ola 11.

### Incidente posterior a F1

Después de cerrar F1-v2 y durante las capturas del bloque V4-bis, el proceso API terminó con código 1. El tail saneado registró solicitudes repetidas a `GET /api/v1/network/provisioning/orders/[UUID]/context`, `QueryFailedError` y `TYPEORM_QUERY_ERROR` con `SQLSTATE 22P02`; health volvió a fallar. La captura de logs fue coordinada por el root. F1 ya había concluido con **1 suite y 6/6 tests aprobados** antes de esta caída. No reinicié el API y este incidente no altera el conteo de F1.

