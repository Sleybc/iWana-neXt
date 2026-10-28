# E-7 — Ensayo de rollback CA-R12

**Fecha:** 2026-10-27  
**Resultado acumulado:** el E7 original conserva su fallo histórico (`failed=1`); E7_final completó el rollback old→protector con API legacy aislada por bridge privado/proxy, IPAM local protegido y dos ejecuciones controladas de reconcile (19:31:56Z y 19:51:42Z), cada una en ocho lotes ≤100 con un snapshot positivo. El probe HTTP autenticado de captura en clon separado respondió 409 bajo `PENDING`. Ese corte recibió SEC PASS de seguridad, SR-QA G6-ready y suficiencia de gate-verifier; el G6 PASS original quedó condicionado por la revisión posterior de reanudación. Las versiones v1.0 y v1.1 de E7_resume se detuvieron como `NOT_EXECUTED` en el preflight (R-0/R-0b). E7_resume v1.4 completó V-0..V-5 y R-1..R-9 sobre E1 persistente y clon aislado; R-7 respondió 409/409, pero no persistió las huellas SHA-256 de no-mutación. Tras las revisiones SEC/SR-QA, el dictamen final es **G6 NO PASS**. G6.5/G7 siguen separados y `NETWORK_IP_PROTECTION=PENDING`.

## E7 original histórico — DB1 (resultado NO PASS)

Se usó solo la DB `iwana_it_mod13_ca_r12_e7` y Redis E1 DB lógico `1`; no hubo operaciones en E5/E6. Las credenciales se leyeron desde `%LOCALAPPDATA%\Temp\iwana-mod13-ca-r12-e1\connections.json` sin imprimirlas ni copiarlas al repo. No se ejecutó `migration down`, reset, borrado de datos o archivos, ni se cambió rama/checkout.

- PostgreSQL E1: `127.0.0.1:5434`, contenedor saludable, sin volumen persistente.
- Redis E1: `127.0.0.1:6381`, contenedor saludable; BullMQ usa prefijo predeterminado `bull`, sin `BullMQ.prefix` configurable.
- Tenant UUID: `13000000-0000-4000-8000-000000000001`; schema `tenant_mod13_ca_r12_e5`.
- API anterior y protector actual: puerto 3006, binding `127.0.0.1`; proxy E7 final: puerto 3007, binding `127.0.0.1`.
- Los puertos 3004–3007 se comprobaron libres antes del ensayo; no se detuvo ningún proceso preexistente. No se creó listener `0.0.0.0` ni proceso worker separado.

La semilla E7 coincide con el baseline legacy E2/E5: 3 sedes, 20 routers, 50 redes, 2.000 asignaciones, 2.200 aprovisionamientos, 50 auditorías, 2 interfaces y 2 direcciones locales. La evidencia E2/E5 registra mismos tenant UUID/IDs legacy y huellas E5 para E6/E7.

## Build anterior y bloqueo previo

El checkout inicial era `81adebe9e4f62a34e6b2f28304fd11ad8a9c45a8`. Se extrajo y compiló el backend previo en directorio temporal aislado:

```text
pnpm install --offline --filter @iwana/api... --frozen-lockfile --ignore-scripts  PASS
pnpm --filter @iwana/api... build                                      PASS
```

SHA-256 del `apps/api/dist/modules/network/ipam.service.js` anterior: `D53F3959BAB02913B3F9CF1A5354CE0EC0BCF2577242634916C12CCEA4ECD8FB`. Ese build no incluía el guard de dirección local `IP_PROTECTED_BY_INFRASTRUCTURE`.

Antes del bootstrap se levantó un proxy externo temporal en 3007. En esa fase permitía solo `GET`/`HEAD /api/v1/health` y devolvía 403 en cualquier otra ruta o método. Las probes live `POST /network/provisioning/reserve`, `/regularize` y `/:id/release` recibieron **403 (3/3)**. La salud devolvió **200** al arrancar el API anterior. Las 16 colas BullMQ inventariadas se pausaron globalmente antes de iniciar el API; el checkout antiguo integra sus processors dentro de Nest API y no tiene worker separado.

## Inventario BullMQ y cortes

Se inspeccionaron estos 16 nombres: `tenant-provisioning`, `refresh-token-purge`, `tenant-schema-purge`, `search-index`, `assurance-field-service`, `users-bulk-create`, `operations-execution-events`, `operations-execution-relay`, `operations-execution-tombstone`, `operations-execution-dlq`, `inventory-execution-requests`, `schedule-events-sweep`, `network-execution-events`, `network-provisioning-reconcile`, `privacy-due-alerts`, `evidence-analysis`.

Estados consultados en cada cola: `waiting`, `active`, `delayed`, `failed`, `paused`, `prioritized`, `waiting-children`, `completed`.

| Corte | Estado |
| --- | --- |
| Pre-rollback, antes de pausar | 16/16 colas con todos los estados en 0 y 0 repeatables. |
| Backend anterior después del bootstrap | 16/16 `paused=true`, `active=0`; 3 repeatables, cada uno con 1 `delayed`; los otros 13 nombres sin jobs. |
| Backend anterior detenido y sus repeatables retirados | 16/16 pausadas, todos los estados en 0 y 0 repeatables. Se retiraron exclusivamente las 3 entradas cuyo baseline era 0. |
| Protector actual antes de reanudar | 16/16 pausadas, `active=0`; bootstrap volvió a registrar los 3 repeatables. |
| Reanudación y corte final | 15/16 colas reanudadas; solo `network-provisioning-reconcile` pausada después de su fallo. `active=0` en las 16. Totales: `waiting=0`, `active=0`, `delayed=3`, `failed=1`, `paused=0` jobs, `prioritized=0`, `waiting-children=0`, `completed=1`; 3 repeatables. |

Los repeatables creados por el build anterior fueron:

| Cola | Job | Programación | Huella SHA-256 del ID |
| --- | --- | --- | --- |
| `inventory-execution-requests` | `clean-expired-inventory-source-failures` | 3.600.000 ms | `a0af4a1c2da5a357` |
| `network-provisioning-reconcile` | `reconcile-network-provisioning` | 900.000 ms | `c4820437b9011599` |
| `privacy-due-alerts` | `privacy-due-alerts-sweep` | zona `America/Bogota` | `5b80b911edc15893` |

Cada entrada se validó por cola, nombre y unicidad antes de retirar solo su `key` con `removeRepeatableByKey`. El post-check confirmó cero jobs/repeatables y colas aún pausadas. Se detuvo únicamente el PID 31916 identificado como el API anterior. No se borraron jobs ajenos ni se purgaron colas.

## Restauración del protector y probes

Se arrancó el API compilado del checkout actual en PID 30788 sobre DB E7 y Redis DB 1, con `NETWORK_IP_PROTECTION=PENDING` y binding loopback. La compilación actual no tenía un SHA de commit propio; artefactos verificados:

- SHA-256 `apps/api/src/modules/network/ipam.service.ts`: `15F429872CA057710A8888D44061D7281EF05680B43DB2742F39161878205153`.
- SHA-256 `apps/api/dist/modules/network/ipam.service.js`: `85E69FF11C46699E86A834463B8E31A11F2AECFEF1A978FC8079A6D5A6D741D6`.
- `GET /api/v1/health` mediante el proxy: **200**.

Con `NETWORK_IP_PROTECTION=PENDING` se repitieron ambas probes sobre E7 usando el `IpamService` compilado actual y transacciones revertidas:

- Dirección local de interfaz: `IP_PROTECTED_BY_INFRASTRUCTURE`; asignaciones 2.000 antes y después del rollback.
- Pool legacy activo con hosts libres: reserva permitida; asignaciones 2.000 → 2.001 dentro de la transacción y 2.000 tras rollback. Dirección omitida.

La primera selección de pool legacy cayó en un pool agotado y respondió `NETWORK_POOL_EXHAUSTED` sin mutación; se repitió con un pool que tenía 40 hosts disponibles y la reserva fue permitida.

Después de verificar el protector, el proxy dejó de bloquear y pasó a reenviar las rutas al API actual, siempre en loopback. Las probes mutantes sin JWT recibieron **401 (3/3)** desde la autenticación del API; no se enviaron credenciales ni payloads. El bloqueo remoto inicial quedó retirado solo después de restaurar el guard.

## Reanudación y resultado de avance

Tras confirmar `PENDING`, las dos probes de servicio y salud, se reanudaron las 16 colas E7. El worker de inventario ejecutó `clean-expired-inventory-source-failures`: completó **1 job**, no limpió fallos previos y dejó el siguiente repetible `delayed=1`.

El repetible `reconcile-network-provisioning` se ejecutó y agotó 3 intentos. BullMQ conserva `failed=1`, con `failedReason` saneado `class=BadRequestException sqlstate=none`; su siguiente repetible está `delayed=1`. La causa confirmada está en el propio runtime: el tenant sintético tiene 800 candidatos `RESERVED`/`CERTIFIED` (700 + 100), `NetworkProvisioningReconcilerProcessor` los pasa en un único lote y `ExecutionOrdersService.getExecutionSnapshots()` rechaza más de 100. El fallo ocurre antes del ciclo de mutación. No se reintentó ni borró ese job.

Después de capturar el corte, se pausó únicamente `network-provisioning-reconcile` para evitar reintentos repetidos sobre E7; el `failed=1`, su `delayed=1` y el repeatable quedan preservados. Las otras 15 colas siguen reanudadas. El API protector y el proxy passthrough siguen levantados; la admisión de reserva legacy está activa y las rutas de captura continúan condicionadas por `PENDING`.

## Integridad de datos y limitaciones

Snapshot final E7 frente a los hashes legacy E2/E5, omitiendo las columnas nuevas de migración 165 donde corresponde:

| Tabla | Filas inicial/final | SHA-256 final | Coincide E2/E5 |
| --- | ---: | --- | --- |
| `organization_sites` | 3 / 3 | `73cd71be30a5aa4b3ed774087dcc3ff7e47fd34637c611e2fd5626455ae0fc26` | Sí |
| `network_routers` | 20 / 20 | `821cf105dd86dabd5fe20080d1d2dd117b094cd6484d5972e9026ec871ae8b90` | Sí |
| `ipv4_networks` | 50 / 50 | `7e3f775c40a8b6cb448a74089c24e2e6b5f20410d09295e8679105e248ea5ed2` | Sí |
| `service_provisionings` | 2.200 / 2.200 | `22ee05577302737c9e1650d028cffdbe76b0cdf11f0f80258a6dd4d93e320b49` | Sí |
| `ip_assignments` | 2.000 / 2.000 | `bd2d633e8254a51ca6594b01d0c4075ce11d43af38f908092f50dd60ccff48fb` | Sí |
| `audit_logs` | 50 / 50 | `59a80a32143b55b6ad7e705aa9d26e878d62775ce413128fe7b8d66b2547d9e8` | Sí |

Interfaces/direcciones locales permanecen en 2/2. No cambió el tenant, el snapshot legacy ni las asignaciones. El job de reconcile fallido se preservó para que el arreglo se valide sobre otro clon desechable, como indicó el orquestador.

**Límite de aislamiento:** API y proxy escuchan solo en `127.0.0.1`, sin ingress remoto. Un proceso local del mismo host puede acceder directamente al API en 3006 y eludir el proxy; este ensayo no demuestra aislamiento frente a procesos locales con acceso al host. El API anterior no tenía worker separado; durante rollback los workers estaban bloqueados con pausa global de las colas.

**Gate:** el rollback original E-7 no pasa: dejó `failed=1` tras tres intentos y una de 16 colas pausada. El arreglo del lote se validó después en E7_fix/DB2 y E7_match/DB3; E7_match completó con un snapshot positivo y sin mutaciones. Esa validación no repite ni borra el resultado histórico del rollback. En el preflight inicial de E7_final se descartó el backend expuesto por loopback; luego se evaluó el patrón Docker privado, pero se pausó E7 antes de crear servicios por el hallazgo de boundary pendiente en processors. `NETWORK_IP_PROTECTION=PENDING`; G6.5 y G7 siguen separados.

## Revalidación E7_fix — reconciliador en clon aislado

**Resultado del ensayo:** `reconcile-network-provisioning` completó en el clon desechable en una ejecución, con ocho lotes de máximo 100 IDs y sin `VALIDATION_ERROR`. Esta evidencia valida el límite de lote en este clon; no cambia el resultado de CA-R12/G6. `NETWORK_IP_PROTECTION=PENDING`; G6.5 y G7 permanecen separados.

### Clon y runtime

- Antes de clonar, el API propio PID 30788 se detuvo y `pg_stat_activity` confirmó cero conexiones a `iwana_it_mod13_ca_r12_e7`; la DB destino no existía. Se creó `iwana_it_mod13_ca_r12_e7_fix` desde el template E7. No se conectó ni escribió sobre DB E5/E6 o `dbiw`, ni se ejecutaron migraciones o `down`/reset; la comparación fue contra el artefacto documental E2/E5.
- El clon conserva el schema tenant activo y la distribución sintética esperada: 800 candidatos distintos (`RESERVED=700`, `CERTIFIED=100`), sin órdenes de ejecución coincidentes. Las tablas de interfaces/direcciones contienen 2/2.
- El API compilado se ejecutó en loopback, puerto 3008, `DB_NAME=iwana_it_mod13_ca_r12_e7_fix`, `REDIS_DB=2`, `NETWORK_IP_PROTECTION=PENDING` y `NETWORK_RESERVATIONS_PAUSED=true`. `/api/v1/health` devolvió 200. Las claves efímeras requeridas se generaron en memoria; las credenciales PostgreSQL/Redis se leyeron directamente del archivo local E1 y no se imprimieron ni copiaron.
- Redis E1 DB2 empezó con `DBSIZE=0`; se crearon y pausaron 17 colas del runtime antes del bootstrap. Durante el ensayo, el único proceso con sockets al endpoint Redis E1 fue el API propio PID 34528, configurado en DB2. Al cerrarlo, la lectura de `CLIENT LIST` encontró cero clientes DB2 externos y las 17 colas siguieron pausadas. El HEAD era `81adebe9e4f62a34e6b2f28304fd11ad8a9c45a8`; el build corresponde al checkout de trabajo actual, sin commit nuevo.

SHA-256 del código usado:

| Artefacto | SHA-256 |
| --- | --- |
| `network-provisioning-reconciler.processor.ts` | `e8bc5ab070821f5a1c61a2b1b8464caa141a1fd2c7f616f2e463fee47be9ae14` |
| `network-provisioning-reconciler.processor.js` compilado | `1ff1cd99debe45a3c0c2f24af12d867da97fcb7746d29445afad99c9351d3db9` |
| `execution-orders.service.js` compilado | `6b92cd6633b520c0b67f8b20134b7049d86acc788213033c5a038f89c70f9ba4` |

### Ejecución controlada

Al abrir el worker, el repetible había vencido mientras la cola seguía pausada. La inspección encontró el repetible y el job manual `mod13-e7-fix-reconcile-once` que se había creado para el disparo inmediato; ambos estaban sin intentos, con el mismo digest de payload y contexto coincidente con el tenant del clon. Se retiró exclusivamente el job manual propio; no se tocó el job repetible ni su definición. Se reanudó solo `network-provisioning-reconcile`, se esperó el evento terminal `completed` de BullMQ y se volvió a pausar la cola. No se ejecutó ningún reintento ni hubo evento `failed`.

La traza temporal registra solamente cantidades, resultado y clase de error; no contiene payload, UUID ni direcciones:

| Llamadas a `getExecutionSnapshots` | IDs solicitados por llamada | Resultados por llamada | Resultado |
| ---: | ---: | ---: | --- |
| 8 | 100 cada una | 0 cada una | `ok` en las 8 |

**Total:** 800 IDs solicitados, máximo observado 100, 0 `VALIDATION_ERROR`, 0 órdenes coincidentes. La reconciliación no cambió filas legacy ni estados del fixture.

Comandos reproducibles ejecutados (los helpers usan el archivo E1 en memoria; no reciben secretos por argumento):

```powershell
$e7Temp = Join-Path $env:TEMP 'iwana-mod13-ca-r12-e7-fix'
node "$e7Temp\e7-clone-create.cjs"
Start-Process node.exe -ArgumentList "$e7Temp\launch-api.cjs" -WorkingDirectory 'C:\appiw\apps\api' -WindowStyle Hidden
node "$e7Temp\execute-repeatable-once.cjs"
node "$e7Temp\verify-clone-final.cjs"
node "$e7Temp\final-redis-db2.cjs"
node "$e7Temp\verify-db1-original.cjs" # solo lectura
```

### Integridad final y colas

Las seis huellas y conteos legacy del clon coinciden exactamente con E2/E5 (6/6): `organization_sites` 3, `network_routers` 20, `ipv4_networks` 50, `service_provisionings` 2.200, `ip_assignments` 2.000 y `audit_logs` 50. Las huellas SHA-256 coinciden con la tabla de integridad E7 anterior. Distribución final de servicios: `ACTIVE=700`, `CERTIFIED=100`, `FAILED=100`, `RELEASED=600`, `RESERVED=700`; asignaciones: `ACTIVE=700`, `RELEASED=600`, `RESERVED=700`. Interfaces/direcciones locales: 2/2. Controles referenciales: routers sin sede 0, pools sin router 0, servicios sin router/pool 0, asignaciones sin servicio/pool 0, vínculos de asignación divergentes 0.

En Redis DB2, las 17 colas quedaron pausadas. Totales finales: `waiting=0`, `active=0`, `delayed=3`, `failed=0`, `paused=0` jobs, `prioritized=0`, `waiting-children=0`, `completed=0`; quedan tres repetibles diferidos y solo el próximo ciclo programado de reconcile en su cola (`delayed=1`). La finalización del job se confirmó mediante `QueueEvents`; BullMQ lo retira al completar por `removeOnComplete`.

Comprobación read-only de Redis DB1: el reconcile histórico de E7 permanece `failed=1`, con 3 intentos y motivo saneado `class=BadRequestException sqlstate=none`; su hash de ID coincide con el corte anterior. La cola sigue pausada y su repetible permanece. No se reintentó ni alteró DB1.

### Cierre operativo

Tras capturar la evidencia se detuvo únicamente el API propio del clon (PID 34528); el puerto 3008 quedó cerrado. Los contenedores PostgreSQL/Redis E1 siguen levantados para la revisión SEC y los gates. El API protector original PID 30788 se había detenido para liberar conexiones de E7 antes de clonar y no se reinició en este ensayo; el puerto 3006 queda cerrado y el proxy loopback 3007 permanece. No se tocó ninguna otra aplicación ni servicio.

## E7_match — caso positivo con una OT en progreso

**Resultado:** el único job repetible de `reconcile-network-provisioning` completó en el clon con un snapshot `IN_PROGRESS`, sin `VALIDATION_ERROR` ni mutaciones de aprovisionamientos. La cola se pausó al terminar. Esta evidencia complementa E7_fix y no cambia el estado de CA-R12/G6: `NETWORK_IP_PROTECTION=PENDING`.

### Clon y fila sintética

- Preflight de PostgreSQL confirmó cero conexiones al template `iwana_it_mod13_ca_r12_e7_fix`; se creó `iwana_it_mod13_ca_r12_e7_match` con `CREATE DATABASE ... WITH TEMPLATE ...`. E7_fix se usó solo como template; no se abrió sesión de aplicación ni se ejecutaron queries/escrituras sobre el template después de clonar.
- En E7_match, antes de insertar: 800 candidatos `RESERVED`/`CERTIFIED`, 800 IDs de orden distintos y cero snapshots correspondientes. Se insertó en el schema tenant una sola fila sintética de `execution_orders`, con el ID de un candidato y el `tenant_id` del mismo tenant activo. La fila usa `status=IN_PROGRESS`, `work_type=INSTALLATION`, `is_annulled=false`, `schedule_event_id=NULL`, `origin_ref_id=NULL` y texto de fixture sin PII.
- Tras el insert: una coincidencia `IN_PROGRESS`, los otros 799 candidatos sin snapshot y una fila total en `execution_orders` (0 antes → 1 después). No se imprimieron UUID, direcciones ni el payload del job. No se aplicaron migraciones, DDL, `down` ni reset; la única diferencia de datos respecto al template es esa fila de OT.

### Runtime y trace

El build actual del checkout (`HEAD=81adebe9e4f62a34e6b2f28304fd11ad8a9c45a8`) se ejecutó en loopback, puerto 3009, con `DB_NAME=iwana_it_mod13_ca_r12_e7_match`, `REDIS_DB=3`, `NETWORK_IP_PROTECTION=PENDING` y `NETWORK_RESERVATIONS_PAUSED=true`. Health devolvió 200. Las claves efímeras requeridas se generaron en memoria; las credenciales se leyeron desde el archivo local E1, sin imprimirlas ni copiarlas.

Se promovió solo el repetible diferido ya registrado; no se añadió un job manual. BullMQ confirmó `completed`; no hubo evento `failed`. La instrumentación registra solo cantidades y resultado en [e7-match-batches.jsonl](e7-match-batches.jsonl), sin UUID, direcciones ni payload. SHA-256 del trace: `7EB6F48384138E57B041585A50A02E8D7591BF6D69FA18ACCC45F07DC1FFD0B6`.

| Batch | IDs solicitados | Snapshots devueltos | Resultado |
| ---: | ---: | ---: | --- |
| 1 | 100 | 0 | `ok` |
| 2 | 100 | 1 | `ok` |
| 3 | 100 | 0 | `ok` |
| 4 | 100 | 0 | `ok` |
| 5 | 100 | 0 | `ok` |
| 6 | 100 | 0 | `ok` |
| 7 | 100 | 0 | `ok` |
| 8 | 100 | 0 | `ok` |

Resultado: 800 IDs en ocho lotes, máximo por lote 100, un snapshot devuelto en total, cero errores de validación.

SHA-256 de los artefactos compilados usados:

| Artefacto | SHA-256 |
| --- | --- |
| `network-provisioning-reconciler.processor.ts` | `e8bc5ab070821f5a1c61a2b1b8464caa141a1fd2c7f616f2e463fee47be9ae14` |
| `network-provisioning-reconciler.processor.js` compilado | `1ff1cd99debe45a3c0c2f24af12d867da97fcb7746d29445afad99c9351d3db9` |
| `execution-orders.service.js` compilado | `6b92cd6633b520c0b67f8b20134b7049d86acc788213033c5a038f89c70f9ba4` |

### Integridad y colas finales

Las seis tablas legacy coinciden con E2/E5 (6/6); los hashes fueron iguales antes y después del job:

| Tabla | Filas | SHA-256 | Coincide E2/E5 |
| --- | ---: | --- | --- |
| `organization_sites` | 3 | `73cd71be30a5aa4b3ed774087dcc3ff7e47fd34637c611e2fd5626455ae0fc26` | Sí |
| `network_routers` | 20 | `821cf105dd86dabd5fe20080d1d2dd117b094cd6484d5972e9026ec871ae8b90` | Sí |
| `ipv4_networks` | 50 | `7e3f775c40a8b6cb448a74089c24e2e6b5f20410d09295e8679105e248ea5ed2` | Sí |
| `service_provisionings` | 2.200 | `22ee05577302737c9e1650d028cffdbe76b0cdf11f0f80258a6dd4d93e320b49` | Sí |
| `ip_assignments` | 2.000 | `bd2d633e8254a51ca6594b01d0c4075ce11d43af38f908092f50dd60ccff48fb` | Sí |
| `audit_logs` | 50 | `59a80a32143b55b6ad7e705aa9d26e878d62775ce413128fe7b8d66b2547d9e8` | Sí |

`execution_orders` se mantuvo en 1 fila durante la corrida (SHA-256 antes/después: `42e4c46ecbc47df39a4227462be0a3f5cd0af3fd9b913cb685bfa8cf72151285`). `service_provisionings`, `ip_assignments` y `audit_logs` no cambiaron. Estados de servicios: `ACTIVE=700`, `CERTIFIED=100`, `FAILED=100`, `RELEASED=600`, `RESERVED=700`; asignaciones: `ACTIVE=700`, `RELEASED=600`, `RESERVED=700`. Interfaces/direcciones: 2/2. Los cinco controles de integridad referencial quedaron en 0.

En Redis DB3 se inventariaron 17 colas y se pausaron al finalizar. Los conteos de jobs por estado son: `waiting=0`, `active=0`, `delayed=3`, `failed=0`, `paused=0` jobs, `prioritized=0`, `waiting-children=0`, `completed=0`. Los tres `delayed` son las siguientes ocurrencias de los repetibles `clean-expired-inventory-source-failures`, `reconcile-network-provisioning` y `privacy-due-alerts-sweep`; no quedan jobs operativos de una sola ejecución. Las tres definiciones repetibles permanecen registradas. BullMQ elimina el job repetible completado según `removeOnComplete`, por eso `completed=0` en el corte final; el evento terminal fue `completed`.

### Cierre operativo y aislamiento

No se abrió conexión a E7 original ni se usaron Redis DB0, DB1 o DB2; `dbiw` tampoco se consultó. La API solo usó E7_match y Redis DB3. Después de capturar los resultados se detuvo únicamente el API propio PID 27396 y el puerto 3009 quedó cerrado. Los contenedores E1 permanecen levantados para SEC y los gates.

## E7_final — preflight inicial por aislamiento de loopback (sin clon)

**Resultado:** no se ejecutó otra pasada integral. No quedó demostrado un bloqueo externo del API por loopback para el backend anterior, que carece del guard de IP local. La pausa de colas evita consumo asíncrono, pero no impide mutaciones por HTTP; no es suficiente para cumplir el control de todo IPAM.

### Evidencia de preflight

- La evidencia del ensayo E7 anterior documenta el backend previo escuchando en loopback `127.0.0.1:3006`, con proxy `127.0.0.1:3007` que denegaba probes publicadas, y reconoce que un proceso local podía acceder directamente al API eludiendo el proxy. Ese backend no tenía `IP_PROTECTED_BY_INFRASTRUCTURE`.
- En esta valoración, los puertos candidatos 3010 y 3011 estaban libres; el proxy existente 3007 seguía escuchando con su PID previo y no se detuvo ni modificó. Redis E1 seguía escuchando en 6381. Los perfiles del Firewall de Windows estaban habilitados, pero sus acciones predeterminadas figuraban `NotConfigured`; no se verificó una regla específica que niegue el loopback directo al proceso API.
- No se creó `iwana_it_mod13_ca_r12_e7_final`, no se abrió conexión de aplicación a E7/E7_fix/E7_match, no se conectó ni escribió en Redis DB4, no se arrancó backend ni worker, y no se tocaron DB0–DB3, `dbiw`, ni el puerto 3002.

### Condición para reabrir el ensayo

Se requiere un bloqueo verificable de todas las rutas directas hacia el backend anterior y de sus colas/workers durante el bootstrap, manteniendo una vía de probe publicada que confirme la denegación y cero mutaciones. Sin ese aislamiento, no es seguro repetir el rollback del build sin protección. E7_fix y E7_match ya aportan la validación aislada del build actual con lotes de hasta 100; esta limitación no cambia el fallo histórico preservado en E7 ni convierte E-7/G6 en PASS. `NETWORK_IP_PROTECTION=PENDING`; G6.5 y G7 siguen separados.

### Factibilidad de alternativa Docker (sin E7 services)

- Docker Desktop está usando engine Linux, versión 29.9.2. La documentación vigente describe que el bridge de Linux en Docker Desktop no es enrutable desde el host Windows y que un puerto no publicado no queda accesible desde el host; una publicación con bind `127.0.0.1` limita el acceso al host ([redes de Docker Desktop](https://docs.docker.com/desktop/features/networking/), [publicación de puertos](https://docs.docker.com/engine/network/port-publishing/)). Esto hace viable el patrón de aislamiento en principio si la API queda sin `ports`/`host` y solo el proxy publica su puerto; no se creó una red privada ni se realizó una prueba de ruta live, por lo que el aislamiento de la topología concreta no está demostrado.
- El proxy host existente sigue ocupando `127.0.0.1:3007` (PID 33824), cuya preservación fue instruida; no puede levantarse allí el proxy de contenedor solicitado sin detener o reemplazar ese proceso. `127.0.0.1:3002` permanece en PID 23000 (servicio ajeno), sin interacción. En este preflight inicial no se había comprobado la ruta desde un contenedor a los listeners E1 de 5434/6381; la sección posterior la prueba solo a nivel TCP, sin autenticación ni protocolo de aplicación.
- El commit anterior `81adebe9e4f62a34e6b2f28304fd11ad8a9c45a8` está disponible. En el primer intento de build temporal con `node:24-bookworm-slim`, `--network none` y lockfile congelado, pnpm solicitó `useNodeVersion: 24.13.1` y recibió `EAI_AGAIN`; ese intento no verificó el build. La imagen exacta se obtuvo después con autorización y el resultado exitoso consta en “E7_final — build Linux del backend previo (sin servicio)”.
- No se creó DB, no se arrancó API/proxy/worker E7, no se tocaron E1, DB0–DB3, DB4 ni `dbiw`. No se detuvieron ni modificaron PID 33824 o PID 23000. La factibilidad documental del bridge no sustituye la verificación de ruta ni del build antiguo; el ensayo permanece sin ejecutar y E-7/G6 no pasa.

### E7_final — preflight inicial de cache y conectividad TCP

- En el corte inicial, `node:24.13.1-bookworm-slim` no existía en cache. Estaba disponible `node:24-bookworm-slim` (digest `sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205`), cuyo runtime inspeccionado era `v24.22.1`; también estaba disponible `nginx:1.31.2-alpine` (digest `sha256:54f2a904c251d5a34adf545a72d32515a15e08418dae0266e23be2e18c66fefa`). En ese corte no se descargaron imágenes ni Node; la autorización y descarga de la imagen exacta ocurrieron después, como registra la sección de build Linux.
- Desde un contenedor efímero `node:24-bookworm-slim` en `bridge`, un probe TCP abrió y cerró sockets a `host.docker.internal:5434` y `host.docker.internal:6381` (`TCP_OPEN` en ambos). El probe no envió bytes de protocolo, credenciales, consultas SQL ni comandos Redis. El contenedor usó `--rm`, no publicó puertos y desapareció al terminar. E1 PostgreSQL/Redis permaneció `healthy` antes y después.
- El puerto 3011 permaneció libre; no se usó 3007. El proxy host PID 33824 en 3007 y el servicio ajeno PID 23000 en 3002 permanecen intactos.
- Aunque se verificó la ruta TCP a E1 y había imagen de proxy, en ese corte faltaba Node 24.13.1 requerido por `useNodeVersion: 24.13.1`; por eso se cerró ese preflight sin clonar DB, usar Redis DB4 ni iniciar API/proxy/worker E7. La conectividad TCP no acredita autenticación ni prueba de aislamiento de la ruta API. El build posterior y el motivo vigente para mantener E7 pausado se registran en las secciones siguientes.

### E7_final — build Linux del backend previo (sin servicio)

- Se usó la imagen oficial `node:24.13.1-bookworm-slim`, digest `sha256:a81a03dd965b4052269a57fac857004022b522a4bf06e7a739e25e18bce45af2`, con source exportado por `git archive` del commit `81adebe9e4f62a34e6b2f28304fd11ad8a9c45a8` a un directorio temporal. No se modificó el checkout compartido.
- La instalación congelada fue `pnpm 10.32.1`, filtro `@iwana/api...`, `--offline --ignore-scripts`; resolvió 1.008 paquetes, reutilizó 1.006, descargó 0 y terminó. El builder usó `--network none`, el almacén local de paquetes y no recibió secretos ni acceso a E1.
- El comando repetido `pnpm --filter @iwana/api... build` terminó con **exit code 0** (`apps/api build: Done`) en Node 24.13.1 Linux. SHA-256 de `apps/api/dist/main.js`: `54b81cc71a9e1964e5c4bea048643fd72bc2b459e65b195dc32d032dede01529`; `apps/api/dist/modules/network/ipam.service.js`: `d53f3959bab02913b3f9cf1a5354ce0ec0bcf2577242634916c12ccea4ecd8fb`, igual al hash histórico del backend previo sin guard de IP local.
- El contenedor de build terminó y fue eliminado (`--rm`); no quedó builder activo. Por el hallazgo de boundary pendiente en los processors, la orquestación pausó E7_final antes de cualquier servicio de aplicación: no se creó DB, no se usó Redis DB4, no se creó red ni proxy, no se arrancó API/worker y no se validaron rutas con este build. E7 sigue sin PASS; no usar estos artefactos para un clon hasta autorización/revisión posterior al fix de boundary y build protector.

### E7_final — ensayo integral aislado después de autorización (2026-10-27)

**Resultado de esta corrida:** rollback del backend anterior al protector actual realizado sobre el clon aislado. El backend anterior no tuvo listener publicado al host; el proxy bloqueó rutas de escritura antes, durante y después del bootstrap. Tras restaurar el protector, la prueba live de IPAM rechazó una dirección local y permitió una reserva legacy reversible. Los dos traces controlados del reconciliador, a las 19:31:56Z y 19:51:42Z, registran ocho lotes de 100 cada uno y un snapshot coincidente por ejecución. Las 17 colas quedaron pausadas. **SEC dio PASS de seguridad; G6 sigue abierto para evaluación/cierre AI-EM-ARCH y gate-verifier; `NETWORK_IP_PROTECTION=PENDING`.** Esta corrida no cambia el fallo histórico `failed=1` documentado para DB original/Redis DB1.

Esta sección actualiza el resultado de los preflights anteriores: sus afirmaciones “sin clon”, “sin servicios” y “topología no demostrada” describen los cortes anteriores a esta corrida. El ensayo nuevo usó exclusivamente `iwana_it_mod13_ca_r12_e7_final` y Redis lógico DB4; no usó E5/E6, E7 original, E7_fix, E7_match, `dbiw` ni Redis DB0–DB3.

#### Artefactos y build

- El backend anterior se construyó desde `git archive 81adebe9e4f62a34e6b2f28304fd11ad8a9c45a8` en el builder temporal Node `24.13.1`, imagen oficial `node:24.13.1-bookworm-slim` digest `sha256:a81a03dd965b4052269a57fac857004022b522a4bf06e7a739e25e18bce45af2`. Su `apps/api/dist/main.js` conserva SHA-256 `54B81CC71A9E1964E5C4BEA048643FD72BC2B459E65B195DC32D032DEDE01529`; `ipam.service.js` conserva `D53F3959BAB02913B3F9CF1A5354CE0EC0BCF2577242634916C12CCEA4ECD8FB`, el backend anterior sin guard local.
- La imagen de runtime `mod13-e7-final-legacy:verified-v2` tiene image ID `sha256:8d892d995fa97b65047c04f4fa9b9220d9ade232fec2be9716b15279996f44b4`; el contenedor legacy fue `mod13-e7-final-old-api`, ID `21e4b6004d283870957ab0ca048d42e5081d2bea966370eabde21d6ff539f83d`. El builder no recibió secretos ni acceso a E1. El contenedor leyó las conexiones desde `%LOCALAPPDATA%\Temp\iwana-mod13-ca-r12-e1\connections.json`, montado de solo lectura; no se imprimió ni copió ningún valor secreto.
- Para el protector actual se compiló el checkout compartido con `pnpm --filter @iwana/api... build` (**exit code 0**, `apps/api build: Done`). SHA-256: `ipam.service.js` `85E69FF11C46699E86A834463B8E31A11F2AECFEF1A978FC8079A6D5A6D741D6`; `network-provisioning-reconciler.processor.js` `2BD7E69BB229B6ABE9EFA4271D957CC23BAC476077CAA01D16D9F810D520DF11`. El reconciliador compilado incluye lotes máximos de 100.

#### Clon y topología comprobada

- `clone-final.cjs` creó el clon desde `iwana_it_mod13_ca_r12_e7_match` tras comprobar cero conexiones activas al template. `verify-final-baseline.cjs` validó antes del ensayo 800 IDs de candidato únicos, una fila `execution_orders` que coincide con un candidato en `IN_PROGRESS/INSTALLATION`, y los otros 799 sin snapshot. No se imprimieron UUID de filas ni direcciones IPv4.
- Redis E1 está publicado en `127.0.0.1:6381`; PostgreSQL E1 en `127.0.0.1:5434`. Un probe TCP desde el contenedor legacy a `host.docker.internal:5434` y `:6381` devolvió `TCP_OPEN` en ambos; no envió bytes de protocolo, credenciales, SQL ni comandos Redis.
- La red privada bridge fue `mod13-e7-final-private`, ID `712899885eadb7567f7111b61b4e0b42ec508c4abc58f58668034a4a0e19048a`. `docker inspect mod13-e7-final-old-api` devolvió `PortBindings={}`; el API legacy solo escuchó dentro del bridge. El intento de conectar desde el host a su dirección interna en puerto 3000 falló con `curl` `status=000`, exit code `28` (timeout). No hubo otro ingress al API legacy.
- El único puerto publicado por la topología fue el proxy Nginx `mod13-e7-final-proxy`, imagen `nginx:1.31.2-alpine`, `127.0.0.1:3011 -> 80`; no se usó 3007. La configuración temporal montada (`nginx-deny.conf`, SHA-256 `E212C9668F5D3FF3C33A833171BDDDAD8305E1C7FD5B4846F5371A25ED2CCA3C3`) habilitó solo `GET/HEAD /api/v1/health` y devolvió 403 para toda otra ruta/método. La salud por proxy dio 200. Las probes `POST /api/v1/network/provisioning/reserve`, `/regularize` y `/:id/release` dieron **403/3**; ninguna mutación llegó al backend legacy. No hay endpoint HTTP separado de “replay”; al quedar todo lo que no es health en `location / { return 403; }`, también quedó bloqueado.
- El API legacy arrancó el 2026-10-27 19:24:11 UTC. Un primer intento terminó antes de conectar a E1 por falta de `/app/storage/media` (`ENOENT`); se reinició con `/app/storage` temporal de escritura. El ensayo válido inició con las colas ya pausadas, `NETWORK_RESERVATIONS_PAUSED=true` y `NETWORK_IP_PROTECTION=PENDING`. Al detener el API legacy, `docker stop --time 15` acabó en exit code `137` (forzado al vencer el timeout); en ese momento 17/17 colas estaban pausadas, `active=0` y no había operaciones in-flight. El corte de DB y Redis posterior confirmó que el bootstrap legacy no había alterado datos ni jobs ajenos.
- Como prueba del camino del proxy al API protector host, un listener temporal ligado solo a `127.0.0.1:3012` fue accesible desde el bridge vía `host.docker.internal`; el probe TCP devolvió `TCP_OPEN` y se detuvo únicamente su PID propio `35152`. El puerto 3012 quedó cerrado.

#### Rollback de backend y protección IP

1. Antes del API legacy se inventariaron y pausaron las **17/17** colas de Redis DB4. Los ocho estados (`waiting/active/delayed/failed/paused/prioritized/waiting-children/completed`) estaban en cero y no había repeatables. El bootstrap anterior añadió únicamente tres definiciones repetibles: `clean-expired-inventory-source-failures` (`a0af4a1c2da5a357`), `reconcile-network-provisioning` (`c4820437b9011599`) y `privacy-due-alerts-sweep` (`5b80b911edc15893`).
2. Tras detener el API anterior, se retiraron solo esas tres definiciones por su `key` exacta y con las colas aún pausadas. La inspección confirmó los ocho estados en cero, cero repeatables y 17/17 `paused=true`; no se purgó ninguna cola ni se eliminó un job fuera de esas ocurrencias repetibles.
3. El protector actual quedó en `127.0.0.1:3010`, PID propio `35032`, enlazado a DB E7_final y Redis DB4, con `NETWORK_IP_PROTECTION=PENDING` y `NETWORK_RESERVATIONS_PAUSED=true`. La salud directa y por proxy fue 200. Durante las comprobaciones el proxy siguió bloqueando las tres mutaciones con 403; el proxy no abrió rutas de escritura.
4. `ipam-protection-probe.cjs` ejecutó el `IpamService` compilado actual con `TenantContext` y transacciones siempre revertidas, manteniendo `PENDING`. La dirección local se obtuvo en memoria y nunca se imprimió: `reserveIp` respondió `IP_PROTECTED_BY_INFRASTRUCTURE`; asignaciones **2.000 → 2.000**. En un pool legacy con espacio libre, `reserveIp` permitió la reserva: asignaciones **2.000 → 2.001 dentro de la transacción → 2.000 tras rollback**. La admisión HTTP siguió en pausa, por lo que esta evidencia confirma el guard/servicio IPAM, no una petición HTTP autenticada.

Durante el primer intento del helper de prueba, `getOccupancy()` se invocó sin `SET LOCAL search_path` y PostgreSQL devolvió `42P01 relation "ipv4_networks" does not exist`; ocurrió en la selección de pool, antes de mutar datos. Se corrigió el helper para establecer `search_path` tenant dentro de transacción; la prueba corregida pasó como se detalla arriba. El primer runner del reconciliador también se detuvo antes de reanudar porque contaba la ocurrencia inmediata pausada y su siguiente `delayed` como dos candidatos únicos. La inspección de solo lectura confirmó el patrón BullMQ normal: job inmediato pausado (`attemptsMade=0`) más la próxima ocurrencia `delayed`, ambos con tenant/schema correctos. Se seleccionó solo el inmediato pausado; no se añadió job manual.

#### Reconciliación y baseline final

El hash SHA-256 del payload del job (solo tenant/schema; valores omitidos) fue `6da341b31bfc42e2d6184c8c4f0d2e975b02fe421c8798b1bac4e83b007634f8`. El runner reanudó **solo** `network-provisioning-reconcile`, esperó el evento terminal, y volvió a pausarla. El job terminó `completed`, `attemptsMade=0`, sin error; las otras 16 colas se mantuvieron pausadas. Trace de conteos, sin UUID ni direcciones: [e7-final-batches.jsonl](e7-final-batches.jsonl), SHA-256 `3B719FF18D7B7D0F633030629501DFE5BC89E6FFD78CA6AC92413E1329CFF2CA`.

| Lote | IDs solicitados | Snapshots | Resultado |
| ---: | ---: | ---: | --- |
| 1 | 100 | 0 | `ok` |
| 2 | 100 | 1 | `ok` |
| 3–8 | 100 cada uno | 0 cada uno | `ok` |

Total: 800 IDs, 8 lotes, máximo 100, un snapshot coincidente `IN_PROGRESS`, cero errores `VALIDATION_ERROR`. Se preservaron el repeatable y la siguiente ocurrencia diferida. No se tocó DB original ni DB0–DB3.

Los hashes de baseline antes y después del bootstrap/reconciliación son iguales; 6/6 tablas legacy coinciden con E2/E5. La fila sintética de OT heredada de E7_match se mantuvo sin cambios; `service_provisionings`, `ip_assignments` y `audit_logs` no cambiaron durante el job.

| Tabla | Filas | SHA-256 final |
| --- | ---: | --- |
| `organization_sites` | 3 | `73cd71be30a5aa4b3ed774087dcc3ff7e47fd34637c611e2fd5626455ae0fc26` |
| `network_routers` | 20 | `821cf105dd86dabd5fe20080d1d2dd117b094cd6484d5972e9026ec871ae8b90` |
| `ipv4_networks` | 50 | `7e3f775c40a8b6cb448a74089c24e2e6b5f20410d09295e8679105e248ea5ed2` |
| `service_provisionings` | 2.200 | `22ee05577302737c9e1650d028cffdbe76b0cdf11f0f80258a6dd4d93e320b49` |
| `ip_assignments` | 2.000 | `bd2d633e8254a51ca6594b01d0c4075ce11d43af38f908092f50dd60ccff48fb` |
| `audit_logs` | 50 | `59a80a32143b55b6ad7e705aa9d26e878d62775ce413128fe7b8d66b2547d9e8` |
| `execution_orders` | 1 | `42e4c46ecbc47df39a4227462be0a3f5cd0af3fd9b913cb685bfa8cf72151285` |

Conteos del tenant: servicios `ACTIVE=700`, `CERTIFIED=100`, `FAILED=100`, `RELEASED=600`, `RESERVED=700`; asignaciones `ACTIVE=700`, `RELEASED=600`, `RESERVED=700`; interfaces/direcciones `2/2`. Los cinco checks referenciales (router/sede, red/router, servicio/router+pool, asignación/servicio+pool, vínculo inverso) quedaron en cero.

#### Corte final Redis DB4

Abreviaturas de estados: `w/a/d/f/p/pr/wc/c` = `waiting/active/delayed/failed/paused/prioritized/waiting-children/completed`. Todas las colas tienen `paused=true`.

| Cola | w/a/d/f/p/pr/wc/c | Repeatable |
| --- | --- | --- |
| `tenant-provisioning` | `0/0/0/0/0/0/0/0` | — |
| `refresh-token-purge` | `0/0/0/0/0/0/0/0` | — |
| `tenant-schema-purge` | `0/0/0/0/0/0/0/0` | — |
| `search-index` | `0/0/0/0/0/0/0/0` | — |
| `assurance-field-service` | `0/0/0/0/0/0/0/0` | — |
| `users-bulk-create` | `0/0/0/0/0/0/0/0` | — |
| `operations-execution-events` | `0/0/0/0/0/0/0/0` | — |
| `operations-execution-relay` | `0/0/0/0/0/0/0/0` | — |
| `operations-execution-tombstone` | `0/0/0/0/0/0/0/0` | — |
| `operations-execution-dlq` | `0/0/0/0/0/0/0/0` | — |
| `inventory-execution-requests` | `0/0/1/0/0/0/0/0` | `clean-expired-inventory-source-failures`, hash `a0af4a1c2da5a357` |
| `schedule-events-sweep` | `0/0/0/0/0/0/0/0` | — |
| `network-execution-events` | `0/0/0/0/0/0/0/0` | — |
| `network-provisioning-reconcile` | `0/0/1/0/0/0/0/0` | `reconcile-network-provisioning`, hash `c4820437b9011599` |
| `privacy-due-alerts` | `0/0/1/0/0/0/0/0` | `privacy-due-alerts-sweep`, hash `5b80b911edc15893` |
| `evidence-analysis` | `0/0/0/0/0/0/0/0` | — |
| `evidence-orphan-detection` | `0/0/0/0/0/0/0/0` | — |

Totales: 17/17 pausadas, `waiting=0`, `active=0`, `delayed=3`, `failed=0`, `paused-jobs=0`, `prioritized=0`, `waiting-children=0`, `completed=0`; 3 repeatables preservados y ningún job en DLQ. Solo se avanzó la ocurrencia inmediata del reconciliador; no se hizo reanudación global.

#### Recursos y estado al entregar a revisión

- `NETWORK_IP_PROTECTION=PENDING`; admisión de reservas sigue pausada. En este corte del primer ensayo E7_final, el API protector propio quedó en loopback `127.0.0.1:3010` (PID 35032); el proxy propio quedó en `127.0.0.1:3011`, health 200 y mutaciones 403. La revalidación posterior reinició el mismo protector como PID 22980; véase la evidencia con corte posterior. Las 17 colas siguen pausadas y DB4 queda aislada para la revisión SEC. Los contenedores E1 PostgreSQL/Redis se mantienen para SEC y gates.
- El contenedor legacy está detenido (`exit=137` tras timeout); el contenedor proxy queda en la red privada durante la revisión. No se tocó el proxy ajeno 3007 (PID 33824), el proceso ajeno 3002 (PID 23000), E7/DB1, E7_fix/DB2, E7_match/DB3, DB0 ni `dbiw`.
- Evidencia persistida: este informe y `e7-final-batches.jsonl`. La salida saneada de topología, probes, baseline y conteos está transcrita arriba; los logs locales completos no se copiaron porque no hacen falta y se tratan como potencialmente sensibles. SEC dio PASS de seguridad y SR-QA reportó G6-ready; mantener G6 abierto hasta gate-verifier y evaluación/cierre formal de AI-EM-ARCH.

### Probe HTTP autenticado de captura IP local en clon separado (2026-10-27)

- Se creó `iwana_it_mod13_ca_r12_e7_capture_probe` como clon desechable de E7_final después de confirmar 0 conexiones en source y destino. El primer intento de harness se detuvo tras un `GET /network/catalog-meta` HTTP 200 por una aserción local que esperaba un sobre `{data: ...}`; no envió POST. Se recreó el clon desde E7_final con 0 conexiones antes del intento definitivo.
- En el clon limpio, el servicio oficial `TenantSeedService.seedInitialAdmin` creó un ADMIN sintético. `PlatformBootstrapService` de desarrollo produjo una identidad sintética solo en ese clon; se usaron el cambio de contraseña oficial, `POST /tenants/:id/regenerate-admin-credentials` con `Idempotency-Key`, login tenant y rotación oficial. MFA no fue requerido. No se registraron email, contraseñas, tokens, UUID ni dirección IPv4.
- El API protector se ejecutó en `127.0.0.1:3010`, `NETWORK_IP_PROTECTION=PENDING`, admisión pausada y Redis lógico DB6. El build usado coincide exactamente con el protector E7_final: `main.js` `54B81CC71A9E1964E5C4BEA048643FD72BC2B459E65B195DC32D032DEDE01529`; `ipam.service.js` `85E69FF11C46699E86A834463B8E31A11F2AECFEF1A978FC8079A6D5A6D741D6`; `network-interface-catalog.service.js` `E681B0C6278037279B8C7801E2A14F3162484F9235C443BC52AB1E84A6113365`; reconciliador `2BD7E69BB229B6ABE9EFA4271D957CC23BAC476077CAA01D16D9F810D520DF11`.
- El catálogo devolvió HTTP 200 con `ipProtection=PENDING`. Una captura autenticada con una dirección privada sintética, libre y válida respondió HTTP 409 `IP_PROTECTION_PENDING`. Los hashes antes/después del POST fueron idénticos en routers (20 filas), interfaces (2), direcciones (2), redes (50), provisionamientos (2.200), asignaciones (2.000) y audit logs (56). No hubo mutación por la captura.
- El API del clon se detuvo con `SIGTERM`; 3010 quedó libre y PostgreSQL confirmó 0 conexiones al clon. Redis DB6 quedó aislado: 17/17 colas pausadas, active=0, failed=0, delayed=3 y 3 repeatables; no se procesó ningún job. El clon/DB6 se mantienen disponibles para revisión, sin teardown en este corte.
- Evidencia primaria saneada: [e7-auth-capture-probe.json](e7-auth-capture-probe.json), SHA-256 `8D4E1F62A98C464F2CBADCB1C755B9BC7C4D3F86A3DC2B9A92332A6999274DF0`.

### Revalidación del protector E7_final y lectura BullMQ DB4 (2026-10-27)

- Tras el probe se reinició el mismo build protector en `127.0.0.1:3010` contra `iwana_it_mod13_ca_r12_e7_final`, Redis DB4, `NETWORK_IP_PROTECTION=PENDING` y admisión pausada. PID actual `22980`; salud directa 3010 y por el proxy 3011: HTTP 200/200. Los hashes de build coinciden con los del probe autenticado.
- El baseline E7_final volvió a pasar 6/6 hashes, 800 IDs candidatos únicos, 1 snapshot `IN_PROGRESS/INSTALLATION`, 799 sin snapshot, 2 interfaces/2 direcciones y 0 inconsistencias referenciales. El probe live de IPAM repitió la denegación de IP local (`IP_PROTECTED_BY_INFRASTRUCTURE`, asignaciones 2.000→2.000) y permitió la reserva legacy dentro de una transacción revertida (2.000→2.001→2.000).
- La primera enumeración `getJobs(waiting, paused, delayed)` mostró 3 filas reconcile (dos filas lógicas “waiting” y una delayed). La inspección RO deduplicada por hash de jobId confirma **2 IDs únicos**, no dos jobs ejecutables: el mismo hash `53b6bb678abad9f9a6b0ad1a1682e8af4b56dbc5f923b7548525d3dbdce93103` aparece una vez en el resultado `waiting` y otra en `paused`; `getJobCounts` confirma `waiting=0`, `paused=1` y la cola global está pausada. Esa ocurrencia es un job generado por repeatable (`manualJobId=false`), `attemptsMade=0`, sin `processedOn/finishedOn`, con repeat cada 900.000 ms, `prevMillis=1793130300000` (19:45Z), key coincidente `c4820437b9011599…`, digest de payload `6da341b31bfc42e2d6184c8c4f0d2e975b02fe421c8798b1bac4e83b007634f8` y tenant/schema coincidentes. El siguiente job es delayed, hash `e9aadeea948375a46a7fe942a2955251024d64329ea17486e40c2a86adc35152`, programado para 20:00Z, misma key/digest. Ambos forman la secuencia normal del repeatable de 15 minutos; no hay job manual ni duplicado con ID distinto.
- El primer trace de E7_final registra 8 lotes de 100 a las 19:31:56Z, un snapshot en el lote 2 y cero errores. La segunda ejecución, a las 19:51:42Z, quedó registrada en el trace posterior; no hubo retry ni otra ejecución tras ella. En el corte read-only la ocurrencia siguiente está delayed para las 20:00Z y no se reanudó ni avanzó durante la inspección.
- Corte actual: 17/17 colas `paused=true`; estados agregados `waiting=0`, `active=0`, `delayed=3`, `failed=0`, `paused-jobs=1`, `prioritized=0`, `waiting-children=0`, `completed=0`; cola DLQ vacía; se conservan los tres repeatables con hashes `a0af4a1c2da5a357`, `c4820437b9011599` y `5b80b911edc15893`. E7_final permanece sin mutaciones. No ejecutar teardown ni reanudación hasta instrucción de SEC/orquestación.
- Evidencia RO detallada: [e7-final-db4-readonly-reconcile.json](e7-final-db4-readonly-reconcile.json), SHA-256 `995EAEE55A71F66498956974C2CFD5421644910946556D334D08945EEB518A9E`.

### Avance controlado de la ocurrencia de 19:45Z y corte previo a 20:00Z

- Preflight a las 19:50:49Z: API protector PID `22980` escuchaba solo en `127.0.0.1:3010`; health directo/proxy `3010/3011` fue `200/200`. Los cuatro hashes de `dist` coincidían con el probe autenticado y el arranque fijó `NETWORK_IP_PROTECTION=PENDING`, `NETWORK_RESERVATIONS_PAUSED=true`. El baseline pasó 6/6 hashes, 800/800 candidatos únicos, 1 snapshot coincidente, 799 sin snapshot y 0 inconsistencias. El probe IPAM denegó la IP local sin mutación (2.000→2.000) y permitió/revirtió reserva legacy (2.000→2.001→2.000).
- Antes de reanudar, Redis DB4 tenía las 17 colas pausadas, `waiting=0`, `active=0`, `delayed=3`, `failed=0`, un único job reconcile pausado y 3 repeatables. Se reanudó exclusivamente `network-provisioning-reconcile`; se esperó el evento BullMQ `completed` para el ID de trabajo ya identificado (hash de ID `53b6bb678abad9f9a6b0ad1a1682e8af4b56dbc5f923b7548525d3dbdce93103`, payload digest `6da341b31bfc42e2d6184c8c4f0d2e975b02fe421c8798b1bac4e83b007634f8`). La cola volvió a pausarse inmediatamente a las 19:51:42Z, antes de la siguiente ocurrencia a las 20:00Z.
- El job completó con 8 lotes de 100; conteos de snapshots `[0,1,0,0,0,0,0,0]`, todos `ok`, sin errores ni retries. Trace primario: [e7-final-resume-batches.jsonl](e7-final-resume-batches.jsonl), SHA-256 `9537ED5A1E976E592474F2CF2EC051F2C1CC1240BC3A2D1F40299F86BCF2CFC3`.
- El runner de orquestación reportó exit code `1` después de recibir `completed`: una aserción suya comparó el repeatable count **scoped a reconcile** (`1`) contra el conteo **global** esperado (`3`). La lectura postflight distingue ambos correctamente: reconcile tiene un repeatable, Redis DB4 conserva tres globales. El evento fue `completed`, no hubo evento `failed`, retries ni segundo avance; el exit no-cero corresponde únicamente a esa aserción del wrapper.
- Postflight: 17/17 colas `paused=true`; estados agregados `waiting=0`, `active=0`, `delayed=3`, `failed=0`, `paused-jobs=0`, `prioritized=0`, `waiting-children=0`, `completed=0`; DLQ vacía; 3 repeatables intactos. Baseline volvió a pasar 6/6 hashes y checks, un snapshot/800 candidatos, y la prueba IPAM de protección/reserva legacy volvió a pasar con rollback. No se reanudó ninguna otra cola, ni se limpió o eliminó job alguno. La siguiente repetición permaneció delayed para 20:00Z.
- Evidencia primaria: [e7-final-resume.json](e7-final-resume.json), SHA-256 `F646B952CBC4298FFC10B6A61A69D5C752D78959617310BD2980E46D456B62F0`. La lectura independiente SEC está pendiente; E7/G6 permanece abierto y los recursos E1/clon/DB6 siguen conservados, sin teardown.

- Corte read-only de las 19:55:59Z: protector PID `22980` y proxy PID `10716` escuchan solo en `127.0.0.1:3010/3011`; health directo y por proxy 200/200. Redis DB4 confirmó 17/17 colas pausadas, `waiting=0`, `active=0`, `delayed=3`, `failed=0`, `paused=0`, `prioritized=0`, `waiting-children=0`, `completed=0`, DLQ vacía y 3 repeatables preservados. El reconcile está `delayed`, `attemptsMade=0`; no se reanudó ni avanzó. Se conserva la ocurrencia de las 20:00Z sin procesar. Evidencia RO: [e7-final-cut-1955.json](e7-final-cut-1955.json), SHA-256 `53B1B3DBEF3C1304DACE0BB733EA0BAD849D9C1AF4CCB64F6685AC5AFE4DF089`. E1, clon E7_final, Redis DB4 y clon/DB6 del probe autenticado se conservan hasta terminar gate-verifier; no se hizo teardown.

### Segunda lectura SEC-ENG

El 2026-10-27, `mod13_e7_sec_review` emitió **PASS de seguridad** para E7_final. Validó el aislamiento del backend legacy, la respuesta autenticada 409 `IP_PROTECTION_PENDING` sin cambios en las tablas medidas, el bloqueo IP local, la reserva legacy revertida, los ocho lotes ≤100, el corte 17/17 pausado, los tres repeatables y los SHA publicados. El exit 1 del wrapper quedó explicado por la comparación reconcile-scoped=1 frente a global=3; BullMQ notificó `completed`, sin failed/retry. SEC considera que este corte aporta evidencia para que AI-EM-ARCH evalúe G6; no cierra G6 ni habilita captura. G6.5/G7 siguen separados y `NETWORK_IP_PROTECTION=PENDING`.

### Inventario de procesos y bases después de SEC/SR-QA (2026-10-27 20:00Z)

- Tras sincronizar la documentación, se detuvo solo el API protector propio PID `22980` (Node; listener `127.0.0.1:3010`) y el contenedor proxy propio `mod13-e7-final-proxy`, ID `1a757747607b93f1afc0dd69f66c7164d41d8c32ddb9822b5b70216adc275567` (`nginx:1.31.2-alpine`, publicación `127.0.0.1:3011`). El contenedor terminó con exit 0. No se terminó el proceso host `com.docker.backend` que poseía el listener publicado. Verificación posterior: no hay listeners en `3008–3011`; el API del probe auth ya estaba cerrado.
- En la lectura posterior al cierre del API/proxy, PostgreSQL E1 y Redis E1 estaban saludables: `iwana_mod13_ca_r12_pg_e1` y `iwana_mod13_ca_r12_redis_e1`. Lectura PostgreSQL de ese corte: sesiones=0 en `iwana_it_mod13_ca_r12_e1`, `iwana_it_mod13_ca_r12_e6`, `iwana_it_mod13_ca_r12_e7`, `iwana_it_mod13_ca_r12_e7_capture_probe`, `iwana_it_mod13_ca_r12_e7_final`, `iwana_it_mod13_ca_r12_e7_fix` e `iwana_it_mod13_ca_r12_e7_match`. El inspector se excluyó del conteo tras cerrar su conexión.
- La última lectura Redis DB4 (19:55:59Z) registró 17/17 colas pausadas, waiting/active/failed/DLQ=0, delayed=3 y repeatables=3. API/proxy se detuvieron antes de la ocurrencia programada de las 20:00Z; no se reanudó ni avanzó esa ocurrencia. No se hizo una nueva operación sobre colas después del corte. Redis DB0–DB3 y DB5–DB6 no se modificaron en este cierre.
- Quedan para cierre posterior, solo bajo autorización: contenedores E1 y sus DBs/clones; contenedor proxy propio ya detenido; red privada `mod13-e7-final-private` (ID `712899885eadb7567f7111b61b4e0b42ec508c4abc58f58668034a4a0e19048a`); y Redis DB4/DB6. Se preservan hasta terminar gate-verifier. No se ejecutó teardown.

### Revisión de disponibilidad del host (2026-10-27 20:40:41Z)

- La verificación de solo lectura `docker info --format '{{.ServerVersion}}'` falló al conectar con `npipe:////./pipe/dockerDesktopLinuxEngine`; tampoco se encontraron procesos `Docker Desktop`/`com.docker.backend` ni listeners en 3002, 3008–3011, 5434 o 6381. Por ello no puedo confirmar si los contenedores E1 siguen activos o si el daemon fue detenido externamente. No se inició ni detuvo Docker, no se ejecutó teardown y no se tocó Redis después del corte 19:55:59Z. El último inventario DB4 continúa siendo la evidencia de ese corte; las bases, contenedores y red quedan preservados según el estado conocido, pendientes de volver a verificar cuando Docker esté disponible.

### Decisión AI-EM-ARCH — cierre inicial G6, luego condicionado por E7_resume (2026-10-27)

G6 queda **PASS/cerrado** dentro del alcance documentado: E1–E8, protección local, reserva legacy reversible, captura rechazada en `PENDING`, baseline 6/6 y colas pausadas fueron revisados por SEC/SR-QA y gate-verifier. El E7 original permanece como resultado histórico fallido y no se borra ni sustituye; E7_final es el rollback protegido aceptado. G6.5 (CI Linux por SHA) y G7 (primer tenant real/decisión CTO) siguen pendientes. La captura local continúa deshabilitada. El teardown de contenedores E1 no se verificó porque Docker Engine no estaba disponible; el API y proxy propios están detenidos y no hay listeners en los puertos inspeccionados.

### E7_resume — preflight R-0 detenido (2026-10-27)

**Resultado:** `NOT_EXECUTED`. R-0 no pudo comprobar el entorno porque Docker Engine no está disponible en `npipe:////./pipe/dockerDesktopLinuxEngine`. Por la regla del encargo, el proceso se detuvo ahí: no se reconstruyó E1 ni E7_final y no se inició Docker.

- `docker info --format '{{.ServerVersion}}'`: exit 1, fallo al conectar con el Docker API.
- `docker ps -a --filter name=iwana_mod13_ca_r12_pg_e1 --filter name=iwana_mod13_ca_r12_redis_e1`: exit 1 por el mismo fallo; no se pudo confirmar E1 ni la base plantilla `iwana_it_mod13_ca_r12_e7_final`.
- El puerto 3014 estaba libre. No había listeners en `3010–3015`, `5434` ni `6381`.
- No se leyó Redis DB7 ni se accedió a DB o Redis. R-1–R-9, incluido el clon, build, reanudación de colas, reserva HTTP, probes y teardown, quedaron `NOT_EXECUTED`; no se arrancaron ni recrearon contenedores.
- Artefacto saneado: [e7-resume-v1.0.json](e7-resume-v1.0.json), SHA-256 `EE7DC6FB5171867D23DF8E442AB00FB9BD38D43B2224BB862B0B8983464DD7C8`. El JSON pasó parseo local; `runnerExitCode=null` porque el runner no se inició. `NETWORK_IP_PROTECTION=PENDING` no se modificó.

### Dictamen AI-EM-ARCH posterior a revisiones SEC/SR-QA (2026-10-27)

E7_resume no pudo ejecutarse; por la condición de la matriz §13.8, **G6 vuelve a NO PASS/reabierto**. SEC no encontró bloqueos en el registro y SR-QA confirmó que R-1–R-9 no tienen evidencia; ninguna revisión convierte el preflight en PASS. CA-R12 conserva su PASS del baseline aislado. G6.5 no se inicia —antes deben resolverse también los tres fallos externos del Portal completo—; G7 sigue separado y pendiente. No se habilita captura ni se modifica `NETWORK_IP_PROTECTION=PENDING`.

### E7_resume v1.1 — preflight R-0 detenido (2026-10-27)

**Resultado:** `NOT_EXECUTED`. `docker info --format '{{.ServerVersion}}'` y el `docker ps -a` filtrado terminaron con exit 1 por ausencia del pipe `npipe:////./pipe/dockerDesktopLinuxEngine`; E1, E7_final y Redis DB7 quedaron sin verificar.

- El SHA del generador coincide con el requerido (`91b78e32bc71dfc25c94c0ec08b7a5d3f00cf05bbebcdebf15fa739361874ed9`). Los archivos locales requeridos constaban presentes, sin leer ni registrar nombres/rutas/contenidos. Los puertos 3014, 5434 y 6381 estaban libres.
- `e2-e5.json` conserva SHA-256 `8D20DBC5297E163FFA4E1640E216C750027243EA5956FACE38FE55593223D82A`. No hubo acceso a DB/Redis, cambios a contenedores, ni inicio/reconfiguración de Docker.
- R-0b(a/b/c/d) y R-1–R-9: `NOT_EXECUTED`; `runnerExitCode=null`. No hay conteos de pruebas o cobertura de esta corrida.
- Artefacto v1.1: [e7-resume.json](e7-resume.json), SHA-256 `CC3A1856C5199E5595F3210B54718ECE0350A8BCD9764E7441C90CBA66B31405`. El JSON previo v1.0 se preservó como [e7-resume-v1.0.json](e7-resume-v1.0.json), SHA-256 `EE7DC6FB5171867D23DF8E442AB00FB9BD38D43B2224BB862B0B8983464DD7C8`.
- SEC-ENG no encontró bloqueos en el registro saneado; SR-QA confirmó que no es PASS E-7 y que no acredita reanudación, reconciliación, reserva/release HTTP, hashes 6/6 ni teardown.

**Dictamen AI-EM-ARCH:** G6 permanece **NO PASS/reabierto**; la equivalencia §13.9 no se ejecutó. G6.5 no inicia, G7 sigue separado/pending y `NETWORK_IP_PROTECTION=PENDING`. No se habilita captura.

### E7_resume v1.1 — segundo intento detenido en R-0b(b) (2026-10-27)

R-0 PASS: Docker 29.9.2 respondió; E1 no existía aún; puertos 3014/5434/6381 libres; generator SHA coincide y los archivos de conexión requeridos constaban presentes sin leer su contenido. R-0b(a) creó PostgreSQL/Redis E1 saludables sobre loopback y tmpfs, sin mounts persistentes. Digests PostgreSQL `sha256:54451ecb8ab38c24c3ec123f2fd501303a3a1856a5c66e98cecf2460d5e1e9d7`; Redis `sha256:cd218f4b106a332c5c992e38a9480bfb9d7e9f8f7b0ec9a0023bfa36d9a408f9`; Redis DB0–DB7 `DBSIZE=0` al inicio.

`pnpm --filter @iwana/db build` exit 0. El generador sin `--reset` terminó exit 1 con `42P01 relation public.typeorm_migrations does not exist` en R-0b(b), antes de migrar/sembrar/crear clones. No se produjo salida nueva. E2/E5 se restauró: original, backup y archivo restaurado tienen SHA-256 `8D20DBC5297E163FFA4E1640E216C750027243EA5956FACE38FE55593223D82A`. El backup temporal permanece; E1 se conserva. No se ejecutaron R-0b(c/d), R-1–R-9, pruebas ni teardown.

Causa estática: el generador espera migraciones públicas ya aplicadas y lee `public.typeorm_migrations` en [mod13-ca-r12-baseline.cjs](../../../scripts/mod13-ca-r12-baseline.cjs#L782); el paso R-0b(b) v1.1 omitió inicializar ese registro. La instrucción de detenerse se respetó. Artefacto [e7-resume-v1.1-attempt2.json](e7-resume-v1.1-attempt2.json), SHA-256 `6BF470CF0E9AB206F24692860F4A31F3FF0EE5E9A0FAAFDA3C74F8A8C741FB4B`.

SEC-ENG no encontró bloqueos de seguridad en el artefacto; SR-QA confirmó `FAILED` antes de criterios E-7. No son validaciones live de E1 al cierre. G6 permanece **NO PASS**, G6.5 sin iniciar, G7 separado y `NETWORK_IP_PROTECTION=PENDING`.

### E7_resume v1.2 — reconstrucción, fixture y R-0b(d) detenido (2026-10-27)

**Resultado:** R-0 a R-0b(c) PASS; R-0b(d) `BLOCKED` en la comparación de `execution_orders`. Se detuvo antes de R-1; E1 y E7_final permanecen preservados. No se accedió a Redis/colas, no se levantó API, no hubo reserva/release, pruebas R-1–R-9 ni teardown. `NETWORK_IP_PROTECTION=PENDING` no cambió.

- R-0b(b1): `pnpm --filter @iwana/db build` exit 0 y `pnpm --filter @iwana/db migration:run` exit 0, con 27 migraciones públicas en E1. R-0b(b2): generador versionado SHA `91b78e32bc71dfc25c94c0ec08b7a5d3f00cf05bbebcdebf15fa739361874ed9`, sin `--reset`, exit 0; 160 migraciones tenant hasta 164 y 161 tras ciclo 165. Conteos: sedes 3, routers 20, redes 50, asignaciones 2.000, aprovisionamientos 2.200 y auditorías 50.
- `e2-e5.json` fue protegido y restaurado con SHA-256 `8D20DBC5297E163FFA4E1640E216C750027243EA5956FACE38FE55593223D82A`; la salida nueva se conservó separada como [e7-resume-rebuild-e2-e5.json](e7-resume-rebuild-e2-e5.json), SHA `FFDAB5C7E4B498E1A7A51CB66F7F51FDC7E3F9724E67D6500760AE8DC006277F`.
- R-0b(c): se creó `iwana_it_mod13_ca_r12_e7_final` desde E7, sin sesiones activas al clonar. La fixture OT sintética [mod13-ca-r12-e7-fixture.cjs](../../../scripts/mod13-ca-r12-e7-fixture.cjs), SHA `8338e9bb10c095074e4f39b09582e9c1fa5fd94b79441ac83943c6988d7a4ae0`, terminó exit 0: una orden `IN_PROGRESS/INSTALLATION`, 800 candidatos únicos, 799 sin snapshot.
- R-0b(d): los seis hashes legacy coinciden con E2/E5; 2 interfaces, 2 direcciones y cinco controles referenciales en cero. Estados: servicios `ACTIVE=700`, `CERTIFIED=100`, `FAILED=100`, `RELEASED=600`, `RESERVED=700`; asignaciones `ACTIVE=700`, `RELEASED=600`, `RESERVED=700`. Las huellas de las dos tablas nuevas de interfaz/dirección coinciden con E7 fuente.
- **Bloqueo:** `execution_orders` SHA histórico completo `42e4c46ecbc47df39a4227462be0a3f5cd0af3fd9b913cb685bfa8cf72151285`; actual completo `9f6329fae21a49de9efa45afaa38a8a40bf618d082b2d3fb2821738930fa8c4e`. Proyección actual sin `created_at`/`updated_at`: `cdd0496246d04f5077d7c69748ecc8787988121adf6edc34f25c0c7fcee6e462`. No hay proyección histórica equivalente. No se declara que la divergencia sea solo temporal.
- Artefactos saneados: [R-0b(c/d)](e7-resume-v1.2-r0bd.json), SHA `e0b489fc135fbf7d5a61065467f643944df2a0ec5baebe238d4b1fddbc19ab0`; [intento/bootstrap](e7-resume-v1.2-attempt1.json), SHA `3e0e3cb129ab4460d029f3b4067c9d5dc4ed0fd21fc4e7706872105afe12d237`.
- **DATA-ENG:** BLOQUEO; los artefactos históricos no conservan columnas suficientes para una comparación proyectada. **SEC-ENG:** PASS limitado a artefactos; no encontró secretos, PII ni IPv4 fuera de loopback; no validó recursos live. **SR-QA:** BLOQUEO; §13.9 no permite inferir equivalencia y R-1 no debe iniciar.
- **Fuente histórica en E1:** plat-ops consultó solo `pg_database` (exit 0); E7 y E7_final existen, pero no existe `e7_match` ni otra base con ese nombre. No se consultaron tablas/filas ni Redis; no hay fuente histórica candidata en el E1 actual.

**Dictamen AI-EM-ARCH:** G6 continúa **NO PASS**. No relajar el criterio ni reemplazar la huella histórica; reanudar R-1–R-9 solo con fuente histórica verificable y comparación independiente PASS. G6.5 no inicia, G7 sigue separado y `NETWORK_IP_PROTECTION=PENDING`. Sin commit.

### E7_resume v1.3 — H-0 `NOT_EXECUTED` (2026-10-27)

Docker respondió con versión 29.9.2 (`docker info --format '{{.ServerVersion}}'`, exit 0); `docker inspect` de los dos nombres E1 también terminó exit 0. El preflight se detuvo porque ambos estaban `status=exited`, `health=starting`; H-0 exige salud.

| Recurso | Image ID | Binding | tmpfs / mounts |
| ------- | -------- | ------- | -------------- |
| PostgreSQL E1 | `sha256:54451ecb8ab38c24c3ec123f2fd501303a3a1856a5c66e98cecf2460d5e1e9d7` | `5432/tcp` → `127.0.0.1:5434` | `/var/lib/postgresql` 1 GiB; mounts 0 |
| Redis E1 | `sha256:cd218f4b106a332c5c992e38a9480bfb9d7e9f8f7b0ec9a0023bfa36d9a408f9` | `6379/tcp` → `127.0.0.1:6381` | `/data` 64 MiB; mounts 0 |

No se iniciaron ni reconfiguraron los contenedores. Por stop-on-first-failure no se consultó `pg_database`, Redis, las DB `…_e7`/`…_e7_final` ni el original temporal del helper. La copia preservada del helper tiene SHA `2398d360662d0bf6d4c22a1fc50a9bbdc2fc84fd6e2dfbb08a478ac092cb7004`, pero no se verificó contra el original temporal en H-0. Los objetos de contenedor siguen presentes; disponibilidad del contenido tmpfs no comprobada y no se afirma preservación de la semilla.

H-1–H-3, R-1–R-9, pruebas, E2E, WCAG y teardown: no ejecutados; sin conteos nuevos de pruebas/cobertura. Artefacto saneado [e7-resume-v1.3-h0.json](e7-resume-v1.3-h0.json), SHA-256 `5732D2A727BC099CD39B95C1F44F463ADE913355C3D1EAEE7E086D109EAB9D04`. G6 sigue NO PASS; `NETWORK_IP_PROTECTION=PENDING`. Sin commit.

### E7_resume v1.4 — corrida única V-0..R-9 con E1 persistente (2026-10-27)

**Resultado:** V-0..V-5 y R-1..R-9 se ejecutaron en una sola corrida sobre E1 persistente y terminaron con exit 0. R-1..R-6, R-8 y R-9 quedaron PASS con evidencia; R-7 respondió 409/409 sin mutación observable, pero sus huellas completas no se persistieron y no es auditable después del teardown. `sr-qa` no aprueba G6; `sec-eng` da PASS de seguridad con condiciones de trazabilidad. **Dictamen AI-EM-ARCH: G6 NO PASS** (detalle al final). `NETWORK_IP_PROTECTION=PENDING`; G6.5 no inicia; G7 sigue separado; sin commit.

#### Entorno y límites

- E1: `iwana_mod13_ca_r12_pg_e1` y `iwana_mod13_ca_r12_redis_e1` con volúmenes nombrados `iwana_mod13_ca_r12_pg_e1_data` y `iwana_mod13_ca_r12_redis_e1_data`, `--restart unless-stopped`, ambos saludables, solo loopback `127.0.0.1:5434` y `127.0.0.1:6381`, sin tmpfs. Digests: PostgreSQL `sha256:54451ecb8ab38c24c3ec123f2fd501303a3a1856a5c66e98cecf2460d5e1e9d7`; Redis `sha256:cd218f4b106a332c5c992e38a9480bfb9d7e9f8f7b0ec9a0023bfa36d9a408f9`. Redis DB0–DB7 vacíos al inicio.
- API protector en `127.0.0.1:3014`, `NETWORK_IP_PROTECTION=PENDING`; clon `iwana_it_mod13_ca_r12_e7_resume`; Redis lógico DB7. Sin listeners remotos ni worker separado.
- No se tocaron `dbiw`, `iwana_redis_dev`, contenedores o volúmenes de desarrollo, DB0–DB6 ni E7 original; no se ejecutó `--reset`, `migration down` fuera del ciclo del generador, `FLUSHALL`/`FLUSHDB`, `docker system prune`, `docker volume prune` ni commit. Docker Desktop lo abrió el usuario; `plat-ops` no lo inició, reinició ni reconfiguró.
- Credenciales leídas del archivo local de E-1 en memoria y nunca impresas; artefactos saneados antes de copiarlos. Este apéndice no contiene secretos, PII, UUID de fila ni IPv4 real.

#### V-0 a V-5

| Paso | Criterio | Resultado |
| --- | --- | --- |
| V-0 | Docker 29.9.2; SHA del generador `91b78e32…ed9`, de `e2-e5.json` y de la copia del helper; archivo de conexiones presente; puertos 3014/5434/6381 libres o de E1 | PASS 22:14:26Z |
| V-1 | E1 con volúmenes, reinicio automático, saludables, loopback y Redis DB0–DB7 vacíos | PASS 22:14:48Z |
| V-2 | `pnpm --filter @iwana/db build` y `migration:run`; 27 migraciones públicas | PASS 22:15:36Z |
| V-3 | Generador sin `--reset`; 160 migraciones tenant hasta 164 y 161 tras el ciclo 165; 6/6 huellas legacy; `…_e6`/`…_e7` con 2 interfaces y 2 direcciones | PASS 22:16:02Z |
| V-4 | Fixture alineado SHA-256 `7f044c6e91b72dbae9742e63dc68107db43cabcbe1973d8263f3367a8b34ca2b`; `E7_final` desde E7; 1 OT `IN_PROGRESS`, 800 candidatos únicos y 799 sin snapshot | PASS 22:18:03Z |
| V-5 | Comparación independiente de `sr-qa`; 37 columnas sin `created_at`/`updated_at`, 0 diferencias, 6/6 legacy, 2/2 interfaces/direcciones y 5 checks referenciales en cero | PASS 22:24:50Z |

La fila de `execution_orders` conserva SHA-256 completo `25150f433684c8805c7875218d30c3e92a0c12da0b4edd8878be0920467c11eb` y proyección `23d4d19f0215c7940853a4ad62b7eefe1e5b21844a667d4849894cda17a6ab4c`. Artefacto de V-5: [e7-resume-v1.4-v5.json](e7-resume-v1.4-v5.json), SHA-256 `81b8d7cdc8bb6b52090e9aaa4a1588315d72a400dbcdbfc61c22260542088bbd`.

#### R-1 a R-4

- **R-1 (PASS 22:30:41Z):** clon `iwana_it_mod13_ca_r12_e7_resume` desde `iwana_it_mod13_ca_r12_e7_final` con `CREATE DATABASE ... WITH TEMPLATE ...`, 0 sesiones activas, destino inexistente antes. Baseline 6/6, 800/800 candidatos, 1 snapshot `IN_PROGRESS/INSTALLATION`, 799 sin snapshot, 2/2 interfaces/direcciones, 5 checks referenciales en cero y `execution_orders` con la huella completa de V-5. La verificación se re-ejecutó a las 22:46:24Z porque el runner de R-1 no dejó archivo de salida; los valores fueron idénticos y la sesión de R-4 no modificó las tablas comparadas.
- **R-2 (PASS 22:31:38Z):** `pnpm --filter @iwana/api... build` exit 0. Los cuatro SHA de `dist` coinciden con E7_final (`main.js`, `ipam.service.js`, `network-interface-catalog.service.js` y `network-provisioning-reconciler.processor.js`); `distinctBuild=false`. HEAD `81adebe9e4f62a34e6b2f28304fd11ad8a9c45a8`, árbol no limpio y sin commit.
- **R-3 (PASS 22:35:19Z):** Redis DB7 con `DBSIZE=0`; 17 colas creadas y pausadas, `active=0`; API en 3014, loopback, health 200, `PENDING` y reservas pausadas; credenciales no impresas.
- **R-4 (PASS 22:45:00Z):** reinicio del API a las 22:36:16Z con `PENDING`, reservas habilitadas y health 200; reanudación 17/17 (`pausedAfter=0`). La ocurrencia natural de `network-provisioning-reconcile` arrancó a las 22:45:00.064Z y terminó `completed` a las 22:45:00.154Z, con 8 lotes de 100, un snapshot, `attemptsMade=0`, 0 `failed`, 0 `stalled` y 0 reintentos. Postcheck: 6/6, huellas completa y proyectada iguales a V-5, 1 OT, 800/800, 2/2 y 5 checks en cero. El único incidente fue una línea de configuración del launcher en `r4-trace.jsonl`; se vació antes de la ocurrencia y las 8 líneas de lote se escribieron después, sin impacto.

#### R-5 a R-8

- **R-5 (PASS 23:27:39Z):** `seedInitialAdmin` creó 1 usuario ADMIN y lo vinculó al admin principal. El bootstrap de plataforma dio login 200, exigió cambio de contraseña (200) y permitió login 200; la regeneración oficial de credenciales devolvió 200 con contraseña temporal y correo oficial. Login tenant 200, cambio de contraseña 200, login posterior 200 y `passwordResetRequired=false`. Catálogo 200 con `ipProtection=PENDING`. **MFA:** `mfaSetupTriggered=false` y `mfaEnabled=false` porque la semilla fija ese valor; el criterio literal de R-5 (login 2xx) se cumple, pero la rama MFA no se ejercita y se declara fuera de alcance.
- **R-6 (PASS 23:27:45Z):** subscriber sintético `JURIDICA`/`LEAD` y OT `MOD13-E7-R6-SYNTH-001` `INSTALLATION`/`IN_PROGRESS`; pool /16 con 80 usados. Reserva 201 `RESERVED` v1, dirección dentro del rango asignable, distinta de la local y asignación vinculada; aprovisionamientos 2.200→2.201 y asignaciones 2.000→2.001. Release 200 `RELEASED` v2, asignación `RELEASED` y motivo `MANUAL`. Auditoría: 1 RESERVE + 1 RELEASE + 2 CREATE del interceptor = delta 4.
- **R-7 (PASS 23:27:49Z):** reserva de la dirección local 409 `IP_PROTECTED_BY_INFRASTRUCTURE`; captura de una dirección libre del rango 409 `IP_PROTECTION_PENDING`; `auditPreR7=60`, `auditPostR7a=60`, `auditPostR7b=60`; conteos 2.001/2.201/60 sin cambio. **Limitación:** el runner comparó SHA-256 de 9 tablas antes/después y pasó, pero solo persistió los booleanos `tablesUnchanged`/`countsUnchanged`; los valores de las huellas no quedaron en el artefacto y el runner vivía en un temporal ya retirado. El PASS describe la corrida, no una prueba reproducible.
- **R-8 (PASS 23:27:54Z):** 6/6 tablas legacy restringidas al conjunto de PK original de la plantilla inmutable, 4.323 filas, con las mismas huellas de E2/E5. Deltas exactos: `execution_orders=1`, `subscribers=1`, `service_provisionings=1`, `ip_assignments=1`, `audit_logs=4`; tablas inesperadas 0. Colas: 17 sin pausar (el ensayo ya las había reanudado), 3 repeatables, `waiting=active=failed=0`, `delayed=3`, `completed=1` y DLQ vacía.
- **Reconciliación de `audit_logs`:** el salto 50→60 no es un delta de 10 en R-8. Son 50 del baseline + 6 filas de autenticación de R-5 + 4 filas de dominio de R-6/R-7. El censo de R-8 se toma después de R-5, por eso su delta es 4 y coincide con `expectedDeltas.audit_logs=4`.

#### Repeticiones de R-5..R-8

Cada intento restauró el clon desde la plantilla inmutable y contó el delta una sola vez. Fueron seis bloqueos y una corrida final:

| # | Alcance | Resultado | Causa | Acción |
| ---: | --- | --- | --- | --- |
| 1 | R-5 parcial | BLOCKED | Corte antes de cerrar R-5 | `r5-reset-partial.cjs` (0 usuarios, 0 tokens, 0 platform users) y clon restaurado |
| 2 | R-5..R-6 | BLOCKED | El contrato devuelve el DTO en la raíz y el runner leía `{ data }` | Runner acepta `response.json?.data ?? response.json`; clon restaurado |
| 3 | R-5..R-7 | BLOCKED | R-7a 400 `VALIDATION_ERROR`: `inet::text` serializa con máscara `/32` | `requestedIp` con `host()`; clon restaurado |
| 4 | R-5..R-7 | BLOCKED | Filas asíncronas del `AuditInterceptor` de R-6 | `stableAuditCount` antes/después de R-7; clon restaurado |
| 5 | R-5..R-8 | BLOCKED | `ReferenceError auditPostR7a` en R-8; el cierre esperó un segundo `exit` y la herramienta cortó la corrida | Bitácora síncrona, watchdog, `stopApi` idempotente; clon restaurado |
| 6 | R-5..R-8 | BLOCKED | Mismo `ReferenceError`, ya instrumentado: exit 1 en 37 s (`auditPostR7a_is_not_defined`) | Corregido a `auditAfterR7a`/`auditAfterR7b`; clon restaurado |
| 7 | R-5..R-8 | **PASS** | — | Corrida única con evidencia (`r5-r8.json`) |

El cuelgue de 9 minutos del intento 5 se debió a que `stopApi()` se invocaba sobre un hijo ya terminado por señal: `exitCode` queda `null` y `signalCode='SIGTERM'`, así que esperaba un segundo evento `exit` que nunca llega. Se corrigió con `signalCode`, `taskkill /T /F` como último recurso y `withTimeout`.

#### R-9 teardown

- **Primera pasada:** retiró por nombre exacto 4 contenedores (`pg_e1` y `redis_e1` arriba/saludables, proxy `Exited (0)`, API legacy `Exited (137)`), los 2 volúmenes E1, la red `mod13-e7-final-private` y las imágenes `mod13-e7-final-legacy:verified-v2` y `mod13-e7-final-legacy:verified`. Los cuatro comandos Docker devolvieron exit 0. Quedó bloqueada en el temporal `iwana-mod13-e7-linux-build`; se resolvió con `cmd /c rmdir /s /q` (exit 0).
- **Segunda pasada:** verificó 0 contenedores, 0 volúmenes, 0 redes y 0 imágenes; puertos 3010–3015, 5434 y 6381 libres; temporales E1/E7 ausentes; `e2-e5.json`, la copia del helper y el fixture con sus SHA intactos; HEAD `81adebe9e4f62a34e6b2f28304fd11ad8a9c45a8` con 222 cambios antes y después, sin commit; credenciales retiradas.
- **Limitación de forma:** `dockerBefore` es el corte de la segunda pasada (ya vacío); el inventario previo vive en `firstPass.preExistingBeforeRemoval`. `firstPass` es un bloque registrado por el operador con los códigos de salida y el punto de bloqueo, no una medición estructurada objeto por objeto; `removals` y `tempRemoved` quedaron vacíos. La segunda pasada sí demuestra el estado final, pero la primera no es auditable con el mismo detalle.

#### Artefactos y hashes

| Artefacto | SHA-256 | Nota |
| --- | --- | --- |
| `e7-resume-v1.4-r1-r9.json` | `f25be9960a2c33204a06bca1d6816da043af01ef5d3245ed6eb31668c3b2c851` | Consolidado revisado; 35.386 bytes |
| `e7-resume-v1.4-v5.json` | `81b8d7cdc8bb6b52090e9aaa4a1588315d72a400dbcdbfc61c22260542088bbd` | Comparación V-5 |
| `checkpoints.json` (temporal) | `eda6926b69d89475b004f26ebe90b8302e3423cd4492327bf70ecd1ada7da3dd` | 15 pasos V-0..R-9 |
| `r1-r4-entries.json` (temporal) | `d655704193ccb9e9086d72a1cb8410653e4baddcd7cdab06cfe8968b8e47ee8b` | Evidencia R-1..R-4 |
| `r5-r8.json` (temporal) | `1769e6abefa0f6fecb255aab67c97489872ca8155cc817e91339eea21559da87` | Evidencia R-5..R-8 |
| `r9-teardown.json` (temporal) | `b70ee6b4659f8919561172ee580d112b41e4178248a411182edde6a8e2682344` | Evidencia R-9 |
| `r5-r8-progress.log` (temporal) | `ebc3ab7bc78683607337f3c31f4e336ed0c90f61c2d130c29cbf05543e2dbc7e` | Bitácora de la corrida final |
| `e2-e5.json` | `8d20dbc5297e163ffa4e1640e216c750027243ea5956face38fe55593223d82a` | Sin cambios |
| Copia del helper | `2398d360662d0bf6d4c22a1fc50a9bbdc2fc84fd6e2dfbb08a478ac092cb7004` | Sin cambios |
| Fixture | `7f044c6e91b72dbae9742e63dc68107db43cabcbe1973d8263f3367a8b34ca2b` | Sin cambios |

**Desvío de nombre:** v1.4 §4 pide `e7-resume.json` para R-1..R-9. Se usó `e7-resume-v1.4-r1-r9.json` para no sobrescribir el `e7-resume.json` de v1.1, que se preserva. El sidecar [e7-resume-v1.4-r1-r9.sha256.txt](e7-resume-v1.4-r1-r9.sha256.txt) fija la huella. `result: PASS` dentro del JSON describe la corrida del runner, no el dictamen de G6.

#### Revisiones independientes

- **`sr-qa`: NO aprueba G6.** P1-1: R-7 no persiste las huellas SHA-256 de las 9 tablas; solo booleanos y conteos, y el runner ya no existe. P1-2: entrega documental incompleta (runners de V-0..V-4 y R-5..R-8 no versionados, nombre del consolidado distinto de §4 y revisiones no adjuntas como artefacto). Observaciones P2: `firstPass` de R-9 sin medición estructurada, criterio «3002 intacto» vacuo y detalles de forma/trazabilidad; ninguna cambia el veredicto.
- **`sec-eng`: PASS de seguridad, sin P0/P1, con condiciones C1–C3.** Cubren procedencia estructurada de R-9, baseline o retiro del criterio 3002 y reproducibilidad de la evidencia (huellas de R-7 y runners conservados con SHA). Son condiciones de trazabilidad, no de control.
- Las revisiones se emitieron en la sesión de orquestación; este apéndice resume veredicto y hallazgos bloqueantes. No se versionaron como artefactos separados, lo que forma parte de P1-2.

#### Dictamen AI-EM-ARCH — G6 NO PASS (2026-10-27)

G6 no puede declararse PASS. V-0..V-5 y R-1..R-6, R-8 y R-9 se sostienen como evidencia de ejecución: el clon, la reanudación 17/17, la ocurrencia natural del reconciliador, la reserva/release HTTP, las huellas legacy y el teardown están registrados con conteos, códigos y SHA. R-7 no se sostiene: el PASS se apoya en dos booleanos cuyas huellas SHA-256 no se persistieron y el runner vivía en un temporal ya retirado. Sin esas huellas no hay comparación reproducible antes/después y el criterio de no-mutación no es auditable. La ausencia de P0/P1 de seguridad no sustituye la evidencia de QA.

Conforme a §13.8, G6 vuelve a **NO PASS/reabierto**. G6.5 no inicia; G7 sigue separado y pendiente. `NETWORK_IP_PROTECTION=PENDING`; no se habilita captura local. Sin commit.

#### Alcance de v1.5

1. Persistir en el artefacto los `fullHashes` de R-7a y R-7b (9 tablas, antes/después), no solo los booleanos.
2. Dar procedencia estructurada a `firstPass` de R-9 (objeto, hora, exit code y resultado por objeto) o verificarlo de forma independiente.
3. Fijar un baseline V-0 para 3002 o retirar el criterio: no había listener antes ni después, así que «intacto» no demuestra nada.
4. Versionar en el repo los runners de V-0..V-4 y R-5..R-8 con SHA-256, o conservar copia fuera de `%TEMP%` con retención declarada.
5. Declarar la rama MFA de R-5 fuera de alcance o ejercitarla: `seedInitialAdmin` fija `mfaEnabled=false` y el criterio literal solo exige login 2xx.

No se modificó el artefacto revisado (`f25be996…`); este apéndice y el sidecar son la única adición. La evidencia cruda sigue en `%TEMP%\mod13-v14-out\` por diseño; el directorio de conexiones E1 y los temporales E1/E7 fueron retirados.

### E7_resume v1.5 — re-revisión de G6 sin re-ejecutar (2026-10-27)

**Decisión humana del 2026-10-27:** re-revisar G6 sin reconstruir E1 ni ejecutar nada contra bases o colas. Encargo [E7_resume v1.5](../../prompts/PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.5.md) · launcher v1.19 · matriz v2.12 §13.17. `NETWORK_IP_PROTECTION=PENDING`; sin commit.

**Método.** Revisión documental y de solo lectura. `sr-qa` recalculó las 15 entradas de `sources`: 14/14 presentes en `%TEMP%\mod13-v14-out\` con SHA coincidente y la restante (`e7-resume-v1.4-v5.json`) coincidente en el repo. `sec-eng` no dispuso de shell en su sesión y no calculó SHA; la pasada Docker la ejecutó AI-EM-ARCH en solo lectura y `sec-eng` evaluó la salida. AI-EM-ARCH recalculó los tres artefactos y el sidecar: coinciden.

| Artefacto | SHA-256 | Bytes |
| --- | --- | ---: |
| `e7-resume-v1.4-r1-r9.json` | `f25be9960a2c33204a06bca1d6816da043af01ef5d3245ed6eb31668c3b2c851` | 35.386 |
| `e7-resume-v1.4-v5.json` | `81b8d7cdc8bb6b52090e9aaa4a1588315d72a400dbcdbfc61c22260542088bbd` | 14.487 |
| `e7-auth-capture-probe.json` | `8d4e1f62a98c464f2cbadcb1c755b9bc7c4d3f86a3dc2b9a92332a6999274df0` | 3.045 |
| `e7-resume-v1.4-r1-r9.sha256.txt` | `f1b24cc0538922089ef379cfc84e3bd52bccea08d80d90532b1aae6b70e8aa25` | 92 |

No se modificó ninguno de los tres artefactos ni el sidecar.

#### Dictamen sr-qa — v1.5

**P1-1 — no-mutación de R-7: PASS.** El argumento de §2 se sostiene, pero no por la razón que §2 invoca. R-7a queda probado por R-8; R-7b, de forma deductiva, por la guarda con el 409. El probe vale como corroboración, no como par antes/después.

- **R-7a.** `counts.beforeR5` 2.000/2.200/50 → `counts.afterR7` 2.001/2.201/60; R-6 declara 2.001/2.201 tras reserva y tras release, así que el +1 de `ip_assignments` y de `service_provisionings` es de R-6. `r8.deltas` es idéntico a `expectedDeltas` (`audit_logs=4`, `execution_orders=1`, `ip_assignments=1`, `service_provisionings=1`, `subscribers=1`) y `unexpectedTables` está vacío. Las 6 huellas legacy restringidas al conjunto de PK original (4.323 filas) coinciden con E2/E5, incluidas `ip_assignments` `bd2d633e…48fb`, `service_provisionings` `22ee0557…0b49` y `audit_logs` `59a80a32…d9e8` (50 originales): no hubo inserción ni modificación de las filas del baseline. `auditPreR7 = auditPostR7a = auditPostR7b = 60`. Las colas estaban quietas en la ventana (`active=0`, `waiting=0`, `completed=1`, `delayed=3`).
- **R-7b.** `IP_PROTECTION_PENDING` tiene un único productor en la API (`network-interface-catalog.service.ts:826`) y solo se alcanza en las guardas `:161`, `:433` y `:554`, las tres anteriores al primer `save` (`:192`/`:199`, `:434`, `:557`) y dentro de una transacción que revierte al lanzar (`packages/database/src/data-source.ts:207-222`). La guarda consulta solo `ipProtectionStatus !== 'ACTIVE'`, valor resuelto al arranque (`network.module.ts:79-83`) y cerrado por defecto (`ip-protection-status.ts:7`). La pausa de reservas no interviene: el token no aparece en el servicio y su rechazo usa otro código (`RESERVATIONS_PAUSED`, `service-provisioning.service.ts:1525-1531`). El 409 de R-7b prueba que la guarda se ejecutó en la corrida.
- **Mismo build.** Los cuatro SHA del probe coinciden con R-2: `main.js` `54b81cc7…1529`, `ipam.service.js` `85e69ff1…d741d6`, `network-interface-catalog.service.js` `e681b0c6…113365`, reconciliador `2bd7e69b…20df11`.

**Límites que `sr-qa` acepta.** (1) El probe persiste una huella por tabla y un `unchanged: true` global; no persiste el par antes/después, así que es corroboración y no prueba re-derivable. (2) `network_router_interfaces` y `network_router_interface_ipv4_addresses` no tienen huella post-R-7 fuera del probe; su no-mutación se sostiene por la guarda y el 409. (3) Los 4 hashes cubren `apps/api/dist`, no `@iwana/db` ni el interceptor. (4) Los `.ts` de la guarda están sin commit en HEAD `81adebe9`: la reproducibilidad es documental, no re-ejecutable.

**P1-2 y §3: PASS.**

| Punto | Veredicto | Evidencia | Observación |
| --- | --- | --- | --- |
| Runners V-0..V-4 y R-5..R-8 no versionados (C3) | PASS como límite declarado | 14/14 `sources` presentes con SHA coincidente; `r5-r8.json` íntegro y sin huellas de R-7 (solo booleanos); sobreviven `build-repo-artifact.cjs` y `r9-teardown.cjs`; no existen `iwana-mod13-ca-r12-*` ni `iwana-mod13-e7-*` | C3 no se cumple en su letra: se satisface por sustitución con R-8 + guarda y por la regla prospectiva. Ver C3.1 y C3.2, cerradas más abajo. |
| Nombre del consolidado y sidecar | PASS | `e7-resume.json` es «MOD13 E7_resume v1.1 / NOT_EXECUTED» (esquema distinto); el sidecar contiene `f25be996…c851  e7-resume-v1.4-r1-r9.json` y coincide | El renombre evitó destruir v1.1 y es autodescriptivo. |
| C2 «proceso de 3002 intacto» | PASS | `r9.portal3002: "free"` es un estado, no una comparación; no hubo listener antes ni después | De acuerdo con retirarlo. El campo sigue en el artefacto sin marca de retiro. |
| Rama MFA de R-5 | PASS | `apps/worker/src/services/tenant-seed.service.ts:91-92`: `mfaEnabled: false`, `mfaSecret: null`; el criterio literal de R-5 solo exige login 2xx | No es un waiver: el criterio nunca pidió MFA. |
| Criterios huérfanos | PASS con P3 | Las 3 tablas del criterio R-7 están cubiertas: routers por R-8 (huella legacy `821cf105…`), interfaces y direcciones por el probe | Las otras 6 tablas del runner no se pueden mapear 1:1 porque el conjunto de 9 nunca se declaró; ninguna es sensible a R-7. |

**Observaciones P2/P3 de `sr-qa` (no bloqueantes).**

- `checkpoints.json` (`eda6926b…d3dd`) lleva `tablesUnchanged: true` para R-7 escrito como literal por `build-repo-artifact.cjs:129`, no leído de `r5-r8.json`. El artefacto del repo no lo incluye, pero un archivo citado por SHA lleva una aserción fabricada.
- El probe no persiste el par antes/después; §2 y §13.17 deben describirlo como «una huella por tabla + `unchanged`».
- Guarda sin commit: `?? network-interface-catalog.service.ts`, `?? ip-protection-status.ts`, ` M ipam.service.ts`; toda la carpeta de evidencia está sin seguimiento.
- El censo base de R-8 no está persistido: `deltas.audit_logs=4` se calcula contra 56 filas (50 + 6 de R-5), cifra que no aparece en el JSON; se reconstruye con `auditPreR7=60` y las 4 de R-6.
- La frase «4 filas de dominio de R-6/R-7» del apéndice v1.4 es imprecisa: son solo de R-6; R-7 no añadió ninguna.
- `portal3002` y `firstPass` siguen en el artefacto sin marca de retiro.

#### Dictamen sec-eng — v1.5

**Veredicto: el PASS de seguridad de v1.4 se mantiene. Sin P0/P1; ningún control debilitado.** C1 cerrada, C2 aceptada sin condiciones, C3 aceptada como límite para G6 con tres añadidos de bajo costo. `NETWORK_IP_PROTECTION=PENDING`; sin commit.

**C1 — `firstPass` de R-9: CERRADA.** La pasada la ejecutó AI-EM-ARCH (ejecutor) con el shell del orquestador, en solo lectura, el 2026-10-27; `sec-eng` evaluó la salida y no la ejecutó. Se cumple el criterio que faltaba: `docker info` devolvió `29.9.2` con exit 0 y los cuatro listados devolvieron exit 0 cada uno. Con el daemon demostradamente arriba, un listado vacío deja de ser ambiguo.

| Comando | Exit | Resultado |
| --- | ---: | --- |
| `docker info --format '{{.ServerVersion}}'` | 0 | `29.9.2` |
| `docker ps -a --format '{{.Names}} \| {{.Status}} \| {{.Image}}'` | 0 | 11 contenedores, todos del stack de desarrollo o auxiliares MCP; ninguno `mod13`/`e7` |
| `docker volume ls --format '{{.Name}}'` | 0 | 14 anónimos + 8 nombrados `iwana_*_dev`/`_e2e`; ausentes los volúmenes E1 |
| `docker network ls --format '{{.Name}} \| {{.Driver}}'` | 0 | `appiw_data`, `appiw_default`, `appiw_edge`, `bridge`, `host`, `none`; sin `mod13-e7-final-private` |
| `docker images --format '{{.Repository}}:{{.Tag}} \| {{.ID}}'` | 0 | 14 imágenes; ausentes los tags `verified`/`verified-v2` y sus IDs `8d892d995fa9` y `f1cd4052711a` |
| `Get-ChildItem %TEMP% iwana-mod13-ca-r12-*` | n/a | 0 coincidencias (archivos y directorios) |
| `Get-ChildItem %TEMP% iwana-mod13-e7-*` | n/a | 0 coincidencias (archivos y directorios) |
| `Get-ChildItem %TEMP% iwana-mod13-e7resume-*` | n/a | 3 coincidencias: v1.1 y v1.2, ajenas a v1.4 |
| `Test-Path %TEMP%\mod13-v14-out` | — | existe; 25 archivos, evidencia cruda conservada por diseño |

La comprobación de IDs de imagen descarta la lectura débil de que se hubieran retirado solo los tags y quedara una imagen colgando como `<none>:<none>`. Los volúmenes E1 eran nombrados, así que no pueden camuflarse entre los 14 anónimos. Corroboración cruzada: `tempE1: []`, `tempE7: []` y `rawDirCount: 25` coinciden con el `glob` independiente de `sec-eng`; dos canales miran el mismo estado. C1 cierra sin residuo de infraestructura: 0 contenedores, 0 volúmenes, 0 redes y 0 imágenes `mod13`/`e7`.

**C2 — «proceso de 3002 intacto»: retirado, correcto.** El criterio era estructuralmente incapaz de fallar (`portal3002: "free"`), así que no demostraba contención; se retira una afirmación, no un control. El control real es la enumeración por nombre exacto (`r9-teardown.cjs:33-43`, retiro con nombres explícitos en `:178-188`, sin `prune` ni comodines), que no puede alcanzar un recurso ajeno. Sin hueco. Queda visible un hueco preexistente: los inventarios Docker del runner están filtrados al conjunto nombrado, así que no detectarían daño colateral (SEC-P2-03).

**C3 — límite declarado: aceptado para G6.** El control de no-mutación ya no depende del runner perdido: se sostiene en las huellas de R-8 (6/6 sobre 4.323 filas restringidas al conjunto de PK) y del probe (7 tablas). Faltaban tres cosas, todas de bajo costo y ninguna bloqueante. C3.1, C3.2 y C3.3 quedan cerradas en este apéndice.

- **C3.1 — cerrada.** SHA-256 de los dos runners supervivientes: `r9-teardown.cjs` `22ed4cdf4dbba055833bc28e0e867133385673994709417d6c2f36306b627254` (11.469 B); `build-repo-artifact.cjs` `28ddc0ffe2e4b08ad0247323c0b4df7c74b256c4df5f194e9e9f85f3ccfbfe2e` (11.906 B). «Irrecuperable» no aplica a estos dos.
- **C3.2 — cerrada.** Manifiesto de los 25 archivos de evidencia cruda en [e7-raw-evidence-v1.4.sha256.txt](e7-raw-evidence-v1.4.sha256.txt), SHA-256 `ce8eb6b85e2b553a55566945a4cf26f98f8736337a0cc5fcb1000e6607ff0871` (2.190 B, 25 líneas). Retención ejecutada al cierre de G6: los 25 archivos se copiaron a esta carpeta y el manifiesto verifica 25/25.
- **C3.3 — cerrada (2026-10-27).** `build-repo-artifact.cjs` versionado byte a byte en `scripts/build-repo-artifact.cjs`, SHA-256 `28ddc0ffe2e4b08ad0247323c0b4df7c74b256c4df5f194e9e9f85f3ccfbfe2e` (11.906 B). Es el control que impide que entre PII al repo (`:41-57`: email, UUID, IPv4 distinta de loopback, Bearer, valor de credencial, PEM); ya tiene procedencia versionada.

Un SHA guardado en el mismo artefacto del mismo autor acredita integridad accidental, no *tamper-evidence*. Falta anclaje externo: el SHA del consolidado debe ir en el cuerpo del commit o en un artefacto de CI. Mientras no haya commit, la cadena es autorreferencial por construcción.

**Integridad de artefactos.** `sec-eng` no calculó SHA (sin canal de ejecución) y no reportó valores reconstruidos; su contraste fue documental. `sr-qa` y AI-EM-ARCH sí recalcularon los tres artefactos y el sidecar, con coincidencia exacta (tabla de método). Coherencia entre citas no sustituye medición; aquí hubo dos mediciones independientes.

**Hallazgos de `sec-eng` (P2/P3, ninguno bloquea).**

- **SEC-P2-01 — `firstPass` está hardcodeado, no medido.** `%TEMP%\mod13-v14-out\r9-teardown.cjs:159-175` emite el bloque `firstPass` como constante, incluidos estados, image IDs y los cuatro exit codes, y lo re-emite igual en cualquier re-ejecución. El image ID `8d892d995fa9` coincide con el de §«Artefactos y build», pero la descripción correcta es «bloque constante del runner verificado cruzado», no «bloque registrado por el operador». En encargos futuros, el *antes* se captura antes de borrar.
- **SEC-P2-02 — `tempAfter: []` no prueba ausencia de temporales archivo.** `tempDirs()` filtra `entry.isDirectory()` (`:92-99`); un `.dump` o `.log` sería invisible a la aserción `remaining.length === 0` (`:248-251`). Hoy está limpio por la verificación con patrón que incluye archivos. Añadir `isFile()` en futuros runners.
- **SEC-P2-03 — inventarios Docker filtrados.** `docker ps -a` se filtra contra `CONTAINERS` antes de registrarse (`:139-152`, `:198-205`): no hay inventario global antes/después, así que un contenedor de terceros caído en la ventana sería indetectable. Registrar listados completos y afirmar `setDiff ⊆ conjunto_objetivo`.
- **SEC-P2-04 — evidencia cruda fuera del repo, sin retención y fuera del escaneo de saneamiento.** `sanitization.scannedFiles` lista un solo archivo (el consolidado); los hashes de `sources` apuntan a `%TEMP%`. Escaneo independiente de `sec-eng` sobre los 25 archivos y los tres `iwana-mod13-e7resume-*`: sin secretos, sin PII, sin IPv4 fuera de loopback. Los tres `e7resume-*` sobreviven al patrón de teardown porque este exige `e7-` con guion; se conservan hasta el cierre de G6 y se borran después con el resto de la evidencia cruda. Son redundantes respecto de `e7-resume-rebuild-e2-e5.json` y del SHA de restauración.
- **SEC-P3-01 — saneador y runner de R-9 fuera de control de versiones.** Cubierto por C3.1 y C3.3.
- **SEC-INFO-01 — para G7.** El ensayo usó credenciales en JSON plano en `%TEMP%`, correctamente tratadas (en memoria, sin imprimir, directorio ya retirado). Con el primer tenant real ese patrón es P1: gestor de credenciales del SO o secreto efímero, nunca archivo plano en temp.

**Ejes sin hallazgo.** Tenancy: sin fuga (clones dedicados, `search_path` por transacción, 6/6 sobre conjunto de PK). PII: ninguna en versionado ni en evidencia cruda. Secretos: ninguno. Guarda de captura: verificada estáticamente y fail-closed; `network-interface-catalog.service.ts:161,433,554` comprueba solo `ipProtectionStatus !== 'ACTIVE'`, lanza 409 antes de toda escritura (`:182`, `:434`, `:555`) y no depende de la pausa de reservas, por lo que la afirmación de §3 que hace transferible el probe es correcta; el estado se inyecta en construcción (`:79-80`) y no cambia sin reinicio.

#### Correcciones a la narrativa de v1.4

1. El `firstPass` de R-9 no es «un bloque del operador»: es una constante de `r9-teardown.cjs:159-175`, verificada cruzada contra el image ID `sha256:8d892d995fa9…` de §«Artefactos y build».
2. Las 4 filas de dominio de auditoría son solo de R-6. `auditPreR7 = auditPostR7a = auditPostR7b = 60` prueba que R-7a y R-7b no añadieron ninguna. La frase «de R-6/R-7» del apéndice v1.4 queda corregida aquí.
3. El probe no es un par antes/después: persiste una huella por tabla más `unchanged: true`. La prueba fuerte de R-7b es la guarda con el 409; el probe corrobora.
4. `r9.portal3002: "free"` sigue en el artefacto, pero el criterio está retirado y el campo no es probatorio.
5. `tablesUnchanged: true` en `checkpoints.json` es un literal del consolidador (`build-repo-artifact.cjs:129`), no una medición; el artefacto del repo no lo incluye.

#### Límites aceptados y condiciones residuales

| Límite | Estado | Condición |
| --- | --- | --- |
| Runners V-0..V-4 y R-5..R-8 irrecuperables | Aceptado | Salidas y SHA en `sources`; los dos runners supervivientes quedan hasheados (C3.1); regla futura: copiar a `scripts/` con SHA **antes** del teardown |
| R-7b sin huella post-R-7 de interfaces/direcciones | Aceptado | Se sostiene por la guarda fail-closed y el 409, con el probe como corroboración y el mismo build acreditado por 4 hashes |
| Build anclado a hashes, no a commit | Aceptado para G6 | Incluir `network-interface-catalog.service.ts` e `ip-protection-status.ts` en el commit de la fase y registrar el SHA de los `.ts` |
| Evidencia sin seguimiento y cruda en `%TEMP%` | **Cerrado** | 25 archivos copiados a `docs/quality/evidence-mod13-ca-r12-e1/`; manifiesto C3.2 verificado 25/25; carpeta incluida en el commit |
| Cadena de custodia autorreferencial | Aceptado hasta el commit | Anclar el SHA del consolidado en el mensaje de commit o en CI |

#### Dictamen AI-EM-ARCH — G6 PASS (2026-10-27)

**G6 PASS.** V-0..V-5, R-1..R-6, R-8 y R-9 se sostienen como evidencia de ejecución con conteos, códigos y SHA. R-7 queda cubierto: R-7a por la comparación de R-8 (deltas iguales a los esperados de R-6, legacy 6/6 sobre 4.323 filas restringidas al conjunto de PK, `audit_logs` 60/60/60), y R-7b por la guarda fail-closed que comprueba solo `ipProtectionStatus !== 'ACTIVE'`, lanza 409 antes de escribir y no depende de la pausa de reservas, con el mismo build acreditado por cuatro hashes y el probe de 7 tablas como corroboración. `sr-qa` cerró P1-1 y P1-2 con PASS razonado; `sec-eng` mantuvo el PASS de seguridad, cerró C1 con daemon acreditado y aceptó C2/C3.

No es un waiver: P1-1 y P1-2 se cierran por sustitución de evidencia aceptada por el revisor, y el límite de los runners se declara con `sources` verificadas 14/14, manifiesto de la evidencia cruda y regla prospectiva. Las condiciones residuales son de trazabilidad y custodia, no de control, y no reabren G6:

1. C3.3 cerrada: `build-repo-artifact.cjs` versionado en `scripts/`, guarda e `ip-protection-status.ts` incluidos en el commit, carpeta de evidencia copiada y SHA del consolidado anclado en el cuerpo del commit.
2. Corregir la redacción de R-9 (`firstPass` constante, no medición), del probe (una huella por tabla + `unchanged`) y de las 4 filas de auditoría (solo R-6).
3. Al cierre de G6: los tres `iwana-mod13-e7resume-*` quedan retirables; la evidencia cruda se copió al repo (25/25) y el resto de temporales generados también.
4. Para G7: no repetir credenciales en JSON plano en `%TEMP%` (SEC-INFO-01).

**Estado global.** `NETWORK_IP_PROTECTION=PENDING`: G6 PASS no habilita captura local; la activación es una decisión humana separada. G6.5 no se inicia todavía: requiere resolver los tres fallos del Portal completo ajenos a MOD13 (MOD05 fiscal, catálogo comercial, `RadioCardGroup`) y un resultado de CI Linux asociado a un SHA concreto. G7 sigue separado y pendiente. El commit de la fase incluye esta carpeta y el saneador; el SHA del consolidado queda anclado en su cuerpo.

**Registro.** HEAD `81adebe9e4f62a34e6b2f28304fd11ad8a9c45a8`; 224 entradas sin commit, 0 staged. Este apéndice, el manifiesto `e7-raw-evidence-v1.4.sha256.txt` y las actualizaciones de matriz, plan e informe son las únicas adiciones; los artefactos de v1.4 y el probe conservan sus SHA.
