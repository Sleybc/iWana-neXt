# MOD13 — Pruebas V1 · Ola 9

**Versión:** 1.0 · **Fecha:** 2026-10-23 · **Responsable:** AI-SR-QA
**Estado:** Bloqueado tras Ola 12 — la fixture CPE con serial y MAC requerida no puede prepararse mediante el API público; flujo V1 pendiente

## Resultado del intento inicial de Ola 9

El bloqueo histórico descrito a continuación se resolvió durante FX-v1 de Ola 10. La sección «Fixtures» registra la guarda encendida, las sesiones y los datos releídos por API; no implica que se haya ejecutado V1.

[BLOQUEO] El tenant de pruebas configurado tiene `enforceProvisioningOnInstallClose = false`. El [encargo §V1](../prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md#v1--sr-qa--pruebas-de-punta-a-punta) exige `true`. Se detuvo V1 antes de escribir fixtures o ejecutar pruebas. No se modificó el ajuste ni código de producto, no se aplicaron migraciones y no se imprimieron credenciales, tokens ni datos personales.

**Conteo real de esta ejecución V1: 0 suites, 0 tests ejecutados.** No hay resultado de cobertura ni aprobación de G4/G6 atribuible a este intento.

Consolidación de la ola: [R-pg](INFORME-MOD13-PRUEBAS-R-PG-v1.0.md) verificó Redis mediante `PING`, las migraciones 160–164 y los privilegios sobre tablas de red y auditoría en los seis tenants activos; ejecutó 4 suites y 23 tests de integración aprobados. Esa ejecución es independiente de V1 y no cambia los estados «Sin ejecutar» de la matriz siguiente.

## Precondiciones observadas en el intento inicial

Comprobaciones mediante PowerShell (`Get-NetTCPConnection`) y Node: carga local de entorno con `process.loadEnvFile`, HTTP de salud y consultas PostgreSQL dentro de `BEGIN READ ONLY` / `ROLLBACK`. Las salidas se limitaron a booleanos, estado HTTP y nombres de migraciones.

| Precondición | Evidencia de este intento |
| --- | --- |
| 1 · PostgreSQL y Redis | Puertos 5433 y 6380 escuchando. Conexión y consultas PostgreSQL satisfactorias; Redis solo comprobado a nivel TCP en este bloque. |
| 2 · API | `GET http://127.0.0.1:3000/api/v1/health` → 200. |
| 3 · Credenciales de tenant de pruebas | Tres variables E2E presentes. Tenant resuelto por slug: existe, `ACTIVE`, schema distinto de `tenant_iwana`. No se probó el login en V1. |
| 5 · Migraciones | Pública `EnableBtreeGist` registrada; tenant con `CreateNetworkCatalog1600000000000`, `CreateNetworkProvisioning1610000000000`, `SeedNetworkPermissions1620000000000`, `PublishInstalacionV3163000000000` y `EnsureProvisioningRequirement1640000000000`. Least privilege no verificado por este bloque; su comprobación queda a la consolidación de la ola. |
| Plantilla v3 publicada | Existe `INSTALACION_ESTANDAR`, versión 3, `PUBLISHED` en el tenant configurado. |
| Técnico y NOC diferentes | Existen usuarios `ACTIVE` de ambos roles con IDs distintos. No se consultaron credenciales de esos usuarios ni se identificó una sesión para cada uno. |
| Guarda de aprovisionamiento | **No cumple:** valor `false`. |
| Contacto y completitud fiscal del suscriptor | No verificados: se detuvo el bloque al encontrar la guarda apagada. No hay fixture V1 seleccionado. |
| Expediente `LISTO_PARA_INSTALACION` | No verificado por el mismo motivo. |
| OT `IN_PROGRESS` con CPE | No preparada ni verificada. |

## Matriz CA-NET → prueba

Los criterios proceden del [PRD v1.1 §7](../prds/PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md#7-criterios-de-aceptación). Esta matriz distingue las pruebas existentes relacionadas de la ejecución pendiente V1. La inspección de nombres de tests no demuestra que una suite pase ni que cubra por completo un criterio. **Ninguna fila fue ejecutada por V1 en este intento.**

| CA | Prueba existente relacionada / comprobación pendiente | Estado V1 |
| --- | --- | --- |
| 01 | `apps/api/src/modules/network/tests/ipam.service.postgres.integration.spec.ts`: primera dirección, exclusiones y agotamiento. El flujo V1 debe comprobar la IP sugerida tras crear la red /24. | Sin ejecutar |
| 02 | Misma suite: «asigna 20 IP distintas ante 20 reservas concurrentes en la misma red». Ejecución asignada a R-pg. | Sin ejecutar |
| 03 | Misma suite: validación de IP manual, incluida IP ocupada. | Sin ejecutar |
| 04 | Pendiente validación real de reserva con OT fuera de ejecución, de otro tipo o anulada. | Sin ejecutar |
| 05 | `service-provisioning.service.spec.ts` aporta casos de técnico requerido y maker-checker en regularización; no sustituye la certificación real. Pendientes HTTP 403 del ejecutor, evidencia faltante y botón oculto al técnico. | Sin ejecutar |
| 06 | `apps/api/src/modules/tasks/tests/execution-orders.provisioning-gate.spec.ts`: bloqueo con guarda encendida y certificado ausente; cierre permitido con certificación. Pendiente mensaje y cierre desde portal. | Sin ejecutar |
| 07 | `apps/api/src/modules/network/network-execution-event.postgres.integration.spec.ts`: test «CA-NET-07/09». Pendiente recorrido NOC → técnico → ficha activa desde portal, incluido comodato cuando aplique. | Sin ejecutar |
| 08 | Misma suite: reconciliación de OT cancelada y liberación. Pendiente caso V1 `NOT_EXECUTED`, liberación y reutilización de IP. | Sin ejecutar |
| 09 | Misma suite: test «CA-NET-07/09», reintento e inbox único. | Sin ejecutar |
| 10 | Misma suite: test «CA-NET-10», servicio activo y contacto pendiente. `NetworkProvisioningComponents.spec.tsx` verifica la presentación comercial. Pendiente validación integrada en ficha. | Sin ejecutar |
| 11 | Misma suite: test «CA-NET-11», regularización y reintento. El caso de origen se ejecuta en G7; V1 no lo modifica. | Sin ejecutar |
| 12 | `apps/api/src/modules/network/tests/network-catalog.controller.http.spec.ts`: 403 sin permiso y rechazo a técnico. Pendiente contraste de acciones visibles contra sesiones reales. | Sin ejecutar |
| 13 | `apps/portal/src/components/network/NetworkProvisioningComponents.spec.tsx`: pestañas de bandeja. Pendientes las tres colas, filtros y paginación contra API real. | Sin ejecutar |
| 14 | Pendiente E2E y accesibilidad del recorrido; capturas de tamaños y temas asignadas a V4-bis en el informe UI. | Sin ejecutar |

Las rutas sin prefijo en esta tabla corresponden a `apps/api/src/modules/network/`. No se crearon tests ni fixtures durante este intento. Para relanzar V1 hace falta preparar la guarda en el tenant de pruebas y comprobar el resto de las precondiciones de dominio, junto con acceso real a sesiones distintas de NOC y técnico.


## Fixtures · Ola 10 (FX-v1)

**Fecha:** 2026-10-23 · **Responsable:** AI-SR-QA · **Estado:** Preparados y verificados por API; ejecución V1 pendiente.

Todas las operaciones se limitaron al tenant `srqa-mod11-r5-20261006`. Antes de cada mutación se comprobó el slug configurado y el schema del JWT, ambos del tenant dedicado. No se usó SQL, se cambiaron credenciales del ADMIN, se accedió a `tenant_iwana` ni se aplicaron migraciones. Las nuevas credenciales quedaron únicamente en `.env.development.local`, comprobado como ignorado por Git; sesiones reutilizables mediante `E2E_NOC_*`, `E2E_TECH_*` y `E2E_NETWORK_READONLY_*`. Los datos personales del dominio son sintéticos y no se incluyen en este informe.

| Fixture | Identificador / resultado final verificado |
| --- | --- |
| Guarda | `PATCH /network/settings` → 200 y posterior `GET` → 200, `enforceProvisioningOnInstallClose=true`. |
| NOC | `122b3e4d-2a4b-47c6-acb8-525b3734aba7`, perfil estándar NOC `2226074f-6006-d7df-69bc-40d2c2c5c2d9`. Estado `ACTIVE`, login completo y `passwordResetRequired=false`; seis permisos de red del contrato. |
| Técnico | `baf7fbcd-4b12-426e-ac89-8667547ae048`, perfil estándar Técnico `24be8211-6e08-d629-813c-ac9048c47943`. Estado `ACTIVE`, login completo y `passwordResetRequired=false`; consulta por API de su OT asignada satisfactoria. |
| Solo lectura | `8f570fa5-9f98-4a40-8da4-d64509712150`, perfil dedicado `d176b9d0-22bc-43b3-b02c-76cd9af7c1e4`. Estado `ACTIVE`, login completo y `passwordResetRequired=false`. `/access-control/me/effective-permissions`: lista completa exactamente `[network.catalog.read]`, sin permisos de recuperación. `GET /network/routers?limit=100` → 200. |
| Texto de autorización sintético | `1a430b10-59da-4848-a2da-45e7f0b4d51f`, versión `qa-mod13-fx-v1-20261023`, tipo `AUTORIZACION`. Publicado solo en este tenant de prueba por `POST /privacy/legal-texts`, reutilizando el contenido sintético del fixture existente `e2e/tests/portal-crm-contact-pending-live.spec.ts:210`. |
| Consentimiento sintético | `ecb2c108-3a9e-419b-9fb3-bb0f8c0b2c9c`, `TRATAMIENTO_DATOS`, `ACEPTADO`; capturado por API y vinculado al texto sintético. |
| Expediente | `e3c8881e-aa8c-4ff6-aff6-826b1623294a`, creado y completado por API en identificación, contacto, ubicación, viabilidad técnica, cumplimiento legal e instalación. Estado final releído: `LISTO_PARA_INSTALACION`. Readiness `READY_WITH_PENDING`, `canTransition=true`; pendientes informativos: plan de interés y soportes documentales. |
| Suscriptor | `409be61e-24e5-4da4-969e-982757ceb549`, creado por la conversión real del expediente. Se releyó antes de crear otro para evitar duplicados; sus campos fiscales se completaron por `PATCH /crm/subscribers/:id`. Lectura final: contacto presente y `fiscalCompleteness.complete=true`, `missing=[]`. |
| Sede sintética | `cce5c44c-4be1-43da-8323-6a73b3f07182`, creada por API; supervisión ADMIN/NOC y técnico operativo asignados en la sede del fixture. |
| Plantilla publicada | Plantilla `fd10ecdf-06f1-b08b-c742-e41280248c2a`, `INSTALACION_ESTANDAR`, versión 3 `0f58fa6a-9130-cb13-9be2-f3a39dd28f7f`, `PUBLISHED` y requisito `PROVISIONING`. |
| OT de instalación | `2ab52cdf-1118-41ec-98c9-d9d5ab55d01a`, despachada por API como NOC con origen CRM y referencia al expediente. Estado `ASSIGNED`, técnico `baf7fbcd-4b12-426e-ac89-8667547ae048`, plantilla v3 con `PROVISIONING`; asignación por comando con versión `If-Match` e idempotencia. |

La creación de usuarios los dejó inicialmente en `PENDING_VERIFICATION`; se activaron exclusivamente los tres usuarios nuevos mediante `PATCH /users/:id`, y se repitieron login, lectura propia y permisos. NOC y técnico son usuarios diferentes. La activación y las asignaciones de sede resolvieron el rechazo 404 inicial del despacho/asignación, sin cambiar controles de producto.

Al principio faltaba el texto `AUTORIZACION` vigente: consentimiento devolvió 422 `PRIVACY_LEGAL_TEXT_NOT_PUBLISHED` y la creación manual de suscriptor, 422 `SUBSCRIBER_DATA_AUTHORIZATION_REQUIRED`. El precedente de fixture del repositorio permitió preparar el texto explícitamente sintético por API. Tras registrar consentimiento y transicionar el expediente se comprobó el suscriptor convertido, sin omitir controles ni insertar filas por SQL. No se pretende que este contenido sintético sea una política o autorización de producción.

Durante la preparación, el primer intento de crear expediente perdió la conexión (`ECONNRESET`) y el API dejó de responder (`ECONNREFUSED`). El agente padre reinició el servidor sin cambiar producto; al recuperarse se listaron expedientes antes de crear/reintentar para evitar duplicados. La relectura final confirmó todas las precondiciones de este bloque.

**Conteo real:** verificador por API con **10 comprobaciones aprobadas / 0 fallidas**, más una comprobación posterior de igualdad exacta de permisos del usuario de lectura (**1 aprobada / 0 fallida**): **11 comprobaciones / 0 fallos**. Tres sesiones completas y activas verificadas. **0 suites / 0 tests V1 ejecutados**; este bloque prepara fixtures y no sustituye el recorrido E2E pendiente. No se modificó código de producto, tests ni archivos distintos del entorno local y esta sección; no se hizo commit.

## Ola 11 · V1-r · preflight y matriz

**Estado:** bloqueado durante el preflight funcional de V1-r. Tras la recuperación coordinada, health respondió 200 y `ds-owner` confirmó las capturas iniciales sin mutar la OT. La prueba portal verificó health 200 y login NOC 200, pero la petición al contexto de aprovisionamiento respondió 500. El coordinador preservó el tail saneado. No reiniciaré el API ni ampliaré el flujo mientras falle este preflight. La OT FX-v1 sigue sin cambios por V1-r.

El coordinador guardó antes de cualquier reinicio un tail saneado del intento actual de arranque: la compilación informó `Found 0 errors`, pero TypeORM registró `Unable to connect to the database` y `ECONNREFUSED 127.0.0.1:5433`; Redis registró `ECONNREFUSED 127.0.0.1:6380`; Nest no abrió listener. La sesión del proceso que precedía a Ola 11 ya no existía y no fue posible recuperar su tail. El preflight HTTP de `GET http://127.0.0.1:3000/api/v1/health` falló con `ECONNREFUSED`. La causa queda clasificada como **entorno/infraestructura no disponible**, sin evidencia para atribuirla al producto.

**Actualización de preflight, 2026-10-23:** después de `docker compose up -d postgres redis`, Redis quedó `healthy`. El nuevo tail saneado del API mostró reintentos 1–9 de TypeORM y terminó con `ExceptionHandler: connect ECONNREFUSED 127.0.0.1:5433`; el health siguió fallando. El servicio no se reinició de nuevo. Esta evidencia mantiene V1 bloqueado por dependencia PostgreSQL; no se atribuye al producto ni se infiere estado de las migraciones.

**Recuperación de infraestructura, 2026-10-23:** el coordinador confirmó que PostgreSQL y Redis quedaron `healthy` y que `GET /api/v1/health` volvió a responder 200. La evidencia anterior de arranque fallido se conserva como historial del incidente. En esa ventana no se iniciaron pruebas ni mutaciones; `ds-owner` capturó el estado inicial y confirmó que no modificó la OT. El health 200 confirmó disponibilidad básica en ese momento, pero no reemplazó la comprobación de interactividad ni demostró que todo el flujo V1 estuviera listo. El API volvió a caer antes de empezar V1-r, según se documenta a continuación.

**Caída durante Ola 11, 2026-10-23:** después de la recuperación y antes de empezar V1-r, el coordinador capturó un tail saneado: solicitudes a `GET /api/v1/network/provisioning/orders/:id/context` terminaron en `QueryFailedError`, con `sqlstate=22P02` (`TYPEORM_QUERY_ERROR operation=SELECT`); el proceso API salió con código 1 y el health volvió a fallar. El valor UUID de la ruta y cualquier dato sensible se omiten. Se clasifica como **incidente del API en runtime, causa pendiente de diagnóstico**; V1-r no intentó reiniciarlo.

**Reproducción controlada, 2026-10-23:** tras el reinicio coordinado, health → 200 y la lectura de la OT seguía `ASSIGNED`. Una sola sonda autenticada NOC hizo login → 200 y consultó el contexto de esa OT por GET → 500, sin devolver un código de error seguro; la siguiente comprobación de health recibió `ECONNREFUSED`. No hubo clics ni cambios de datos. El coordinador preservó la salida saneada: `nest --watch` mostró una nueva inicialización y `NestApplication successfully started`; `22P02` no reapareció en el tramo de salida disponible. Esto apunta a una reinicialización automática del watcher tras la caída, pero no identifica la causa del 500. V1-r se detuvo aquí y no repetirá la consulta hasta nueva coordinación. La sonda reproduce el fallo del endpoint de contexto y la indisponibilidad posterior, pero no constituye una suite ni cubre el flujo funcional.

**Corrida E2E controlada, 2026-10-23:** se añadió `e2e/tests/portal-network-provisioning-live.spec.ts`, que comprueba health, autentica NOC desde variables de entorno, siembra la cookie de sesión del portal y abre la OT FX-v1. La primera invocación falló en una URL de health mal construida por el harness (1 suite, 1 test; 404 en `/health` sin prefijo); se corrigió para usar la URL completa `/api/v1/health`. En la invocación final, health → 200, login → 200 y la petición real del portal `GET /api/v1/network/provisioning/orders/:id/context` → 500. El coordinador guardó este tail saneado antes de cualquier recuperación: `TYPEORM_QUERY_ERROR operation=SELECT sqlstate=22P02`; `TenantContextMissingFilter` registró `UNHANDLED_ERROR`, método GET, ruta con UUID redactado y clase `QueryFailedError`; también apareció una advertencia de PostgreSQL sobre `client.query` concurrente. No se observó salida de `process exit` en ese tail. La suite final tuvo **1 suite, 1 test, 0 aprobados, 1 fallido, 0 omitidos**. No hubo clics ni mutaciones. Se conserva el test como reproducción y el flujo termina aquí hasta corregir/estabilizar el endpoint.

**Preparación estática de V1-r:** el flujo feliz y el caso `NOT_EXECUTED` requieren órdenes separadas, porque el cierre negativo libera la reserva y termina la OT. FX-v1 documenta una OT `ASSIGNED`; aún debe iniciarse como técnico para llegar a `IN_PROGRESS`, y no hay evidencia en este informe de que tenga el CPE registrado. Cuando el coordinador recupere el API, se comprobará el estado por API/UI antes de interactuar; si falta CPE o una segunda OT, se preparará en el tenant dedicado mediante el API y sin tocar otros tenants. La matriz de abajo conserva estos puntos como pendientes hasta validarlos en runtime.

No se ejecutó el flujo funcional completo de V1-r ni hubo llamadas de mutación a la API. La prueba de preflight descrita arriba sí se ejecutó: health y login pasaron; la carga del contexto falló. No hubo clics de navegador. El runtime del panel y la interactividad de controles posteriores siguen sin validar. `ds-owner` confirmó que concluyó las capturas iniciales de la OT sin cambios; esa liberación no elimina el bloqueo del endpoint.

| CA | Test o evidencia asignada | Estado de V1-r |
| --- | --- | --- |
| 01 | `apps/api/src/modules/network/tests/ipam.service.postgres.integration.spec.ts`; V1-r debía observar la IP sugerida tras crear la red /24. | **No ejecutado/bloqueado:** el contexto falló antes de crear router/red o reservar; suite IPAM no se corrió en esta ola. |
| 02 | Misma integración PostgreSQL: 20 reservas concurrentes y unicidad. | **Pasó previamente en R-pg:** 20 IP distintas sin duplicados; **no ejecutado en V1-r**. Evidencia en [R-pg](INFORME-MOD13-PRUEBAS-R-PG-v1.0.md). |
| 03 | Misma integración IPAM: IP manual fuera de rango, gateway, excluida u ocupada. | **No ejecutado/bloqueado:** no se alcanzó el catálogo ni el flujo de reserva; la suite IPAM no se corrió en esta ola. |
| 04 | `apps/api/src/modules/network/service-provisioning.service.spec.ts`; reserva sobre OT no elegible. | **No ejecutado en V1-r:** el escenario de rechazo de OT no elegible no forma parte del recorrido §V1 y la suite no se corrió en esta ola. |
| 05 | `service-provisioning.service.spec.ts`, `network-provisioning.controller.http.spec.ts` y contexto NOC/técnico de V1-r. | **Ola 11 histórica:** contexto 500/22P02. **Revalidación post-Ola 12:** contexto 200, pero `cpe=null`; el recorrido que exige serial y MAC queda bloqueado por fixture no representable mediante las rutas públicas de inventario. No se alcanzó certificación. |
| 06 | `apps/api/src/modules/tasks/tests/execution-orders.provisioning-gate.spec.ts`; cierre sin certificado y cierre certificado desde portal. | **No ejecutado/bloqueado:** el flujo no llegó al panel ni al formulario de cierre; la suite relacionada no se corrió en V1-r. |
| 07 | `apps/api/src/modules/network/network-execution-event.postgres.integration.spec.ts` (`CA-NET-07/09`) y ficha activa tras cierre. | **No ejecutado/bloqueado:** el contexto post-Ola 12 respondió 200 con `cpe=null`; sin registrar el CPE con MAC no se inició el flujo NOC → técnico ni se certificó/cerró la OT. No se verificaron servicio, expediente ni suscriptor activos desde V1-r. Evidencia previa de integración en R-pg/B3 no se suma como ejecución de V1-r. |
| 08 | Misma integración (`CA-NET-08`) y cierre separado `NOT_EXECUTED` con liberación de IP. | **No ejecutado/bloqueado:** no se creó segunda OT ni se ejecutó cierre negativo; evidencia previa de reconciliación no sustituye este recorrido. |
| 09 | Misma integración (`CA-NET-07/09`): reintento idempotente e inbox único. | **No ejecutado en V1-r:** no se generó evento de cierre. Evidencia previa de integración permanece separada. |
| 10 | Misma integración (`CA-NET-10`) y `apps/portal/src/components/network/NetworkProvisioningComponents.spec.tsx`. | **No ejecutado en V1-r:** no se cerró una OT ni se abrió la ficha de suscriptor. La prueba de componente existente no se corrió aquí. |
| 11 | Misma integración (`CA-NET-11`); regularización del caso de origen reservada a G7. | **No ejecutado en V1-r / fuera de alcance:** no se tocó ni consultó el caso de origen. Evidencia de integración previa queda separada. |
| 12 | `apps/api/src/modules/network/tests/network-catalog.controller.http.spec.ts` y acciones del usuario de solo lectura de F1-v. | **No ejecutado en V1-r:** no se abrió el catálogo; la suite HTTP y F1-v2 corresponden a otras ejecuciones. |
| 13 | `apps/portal/src/components/network/NetworkProvisioningComponents.spec.tsx` y validación de bandeja en F1/F2. | **No ejecutado en V1-r:** no se visitó la bandeja; el test de componente y su validación live no se corrieron en esta ola. |
| 14 | V4-bis-r: panel OT, bandeja y ficha a 375/768/1280 px, claro/oscuro, sidebar y WCAG. | **No ejecutado en V1-r:** evidencia visual parcial se reporta en V4-bis-r; no se declara cerrado por esta prueba. |


La matriz CA-NET → test queda clasificada criterio por criterio; **V1 no se declara completo**. En la corrida histórica de Ola 11 el runtime bloqueó el flujo antes de crear router/red o interactuar con la OT. CA-NET-13/14 se validan en F1/V4. Conteo real de aquella invocación final: **1 suite, 1 test, 0 aprobados, 1 fallido, 0 omitidos**. La invocación previa del harness, corregida antes de la final, también fue **1 suite / 1 test fallido** por URL de health mal construida (404). En total hubo dos intentos de la misma suite; no se suman como dos pruebas distintas. No hubo mutaciones, clics, cambios de fixtures, datos de dominio ni código de producto.

## Ola 12 · reanudación V1-r · fixture CPE bloqueada

**Estado:** `[BLOQUEO]` — V1 detenido antes de mutar dominio. El prompt FX-v1 exige crear por API un activo serializado CPE con número de serie y MAC en custodia del técnico; si se necesita cambiar código para preparar esa fixture, ordena detenerse. La inspección del contrato público confirma que no hay una vía soportada para suministrar la MAC.

### Preflight y evidencia

- `GET /api/v1/health` respondió **200**; el portal `/auth/login` respondió **200**. El login NOC y la lectura de `GET /network/provisioning/orders/:id/context` respondieron **200**. En el contexto, `cpe` estaba ausente (`cpe=null`). No se imprimieron tokens ni datos del CPE.
- Las lecturas de inventario devolvieron un artículo de categoría CPE, **0 activos serializados**, y ubicaciones existentes. No se escribieron filas ni se usó SQL.
- `CreateCounterPurchaseSchema` y `ReceivePurchaseOrderSchema` admiten `serialNumbers`, pero no `macAddress`; sus servicios crean el activo pasando el serial y omiten la MAC. `InventoryController` expone lectura de activos, sin ruta pública de creación/actualización de un activo serializado. `RegisterExecutionOrderItemUsageSchema` acepta `serialNumber`, pero tampoco `macAddress`.
- Se había confirmado worker presente en el preflight coordinado. No se registró equipo desde el portal ni se inició/cambió la OT en esta reanudación. `tenant_iwana` no fue consultado ni modificado.

La limitación no se resuelve añadiendo un campo al DTO, usando SQL, llamando servicios internos o fabricando un endpoint: eso excedería el encargo de QA y el prompt exige parar si la fixture requiere tocar producto. Se requiere que el backend provea una vía de fixture soportada o que el responsable ajuste el contrato/fixture fuera de este bloque. Se notificó al orquestador y a `ds-owner`; no se pidió repetir credenciales.

### Matriz de estado tras Ola 12

| CA | Prueba asignada / comprobación requerida | Estado de esta reanudación |
| --- | --- | --- |
| 01 | IPAM PostgreSQL y recorrido con router/red `/24`, IP sugerida. | No ejecutado: el bloqueo de la fixture CPE se detectó antes de iniciar el flujo. |
| 02 | IPAM PostgreSQL, 20 reservas concurrentes únicas. | No ejecutado en esta reanudación; el resultado previo de R-pg permanece separado. |
| 03 | IPAM PostgreSQL, validación de IP manual. | No ejecutado: no se creó router/red. |
| 04 | Rechazo de reserva con OT no elegible. | No ejecutado; fuera del recorrido feliz V1. |
| 05 | Contexto, roles, certificación, evidencia y acciones NOC/técnico. | Parcial de preflight: health/login/contexto 200, pero `cpe=null`; fixture serial+MAC bloqueada, sin clics ni certificación. |
| 06 | Gate de cierre y certificación del expediente. | No ejecutado: OT no iniciada ni cerrada por V1. |
| 07 | Evento de cierre, servicio/expediente/suscriptor activos. | No ejecutado: no se certificó ni cerró una OT. |
| 08 | Segunda OT `NOT_EXECUTED`, liberación y reutilización de IP. | No ejecutado: no se creó segunda OT ni se reservó IP. |
| 09 | Reintento idempotente e inbox único. | No ejecutado: no se generó evento de cierre. |
| 10 | Servicio activo y ficha del suscriptor. | No ejecutado: no hubo cierre ni navegación a ficha. |
| 11 | Regularización del caso de origen. | No ejecutado; fuera del alcance V1. |
| 12 | Denegación de catálogo y sesión de solo lectura. | No ejecutado en esta reanudación; la validación de permisos de otras olas sigue separada. |
| 13 | Bandeja, filtros y paginación. | No ejecutado en esta reanudación; asignado a F1/F2. |
| 14 | E2E visual y accesibilidad. | No ejecutado en esta reanudación; asignado a V4-bis. |

**Conteo real de esta reanudación:** **0 suites, 0 tests ejecutados**; no se lanzó Playwright ni se inició el flujo E2E. La consulta autenticada de contexto fue una comprobación manual de preflight, no se cuenta como suite/test. Se conservan por separado los conteos históricos de Ola 11: intento de URL 404 corregido y corrida final de 1 suite/1 test fallido por 22P02. El 22P02 fue corregido en Ola 12 según el encargo del orquestador, pero el criterio de CPE con serial y MAC sigue sin poder validarse hasta que exista una ruta API soportada. **V1 permanece incompleto y bloqueado.**

## Ola 11 · V1-r · revalidación posterior a Ola 12

**Estado:** `[BLOQUEO]` — el recorrido llegó a la reserva desde la UI, pero el endpoint respondió HTTP **500**. Health siguió en **200**. No hay un tail actual accesible que identifique la causa; no se vuelve a enviar la reserva hasta resolverla. V1 no se declara completo.

### Preflight y evidencia actual

- Health y login NOC respondieron **200**. `GET /network/provisioning/orders/:id/context` respondió **200** y devolvió el CPE serializado; la consulta del comodato abierto también se había confirmado. No se imprimieron credenciales, tokens, MAC ni datos personales.
- El test registró por la UI un router y una red IPv4 `/24` sintéticos en el tenant FX-v1. Ambos quedaron activos según las respuestas y las lecturas posteriores. El contexto NOC conservaba el CPE y `provisioning=null`; no se observó reserva ni asignación parcial de IP.
- La UI envió la acción de reservar y recibió HTTP **500**. El harness solo informó el status y que no recibió un `code` de error de nivel superior; no conservó ni mostró el cuerpo de respuesta. Por eso no se puede atribuir el fallo a validación del payload ni al backend sin revisar la respuesta/log correspondiente. La lectura posterior GET confirmó que el servicio seguía ausente. No se repitió el POST después de ese 500.
- Revisé los archivos de log existentes sin imprimir su contenido. Los dos logs locales con marcadores genéricos `QueryFailedError`/`TYPEORM_QUERY_ERROR` tienen fecha **2026-10-17** y no contienen el marcador `22P02` ni la ruta actual; los logs de arranque API disponibles son de agosto. El terminal de esta tarea no contiene el tail del proceso actual. **No se obtuvo log aplicable al 500 de reserva.** La lectura de logs no permite identificar la causa.
- El preflight final fue GET-only: health **200**, login **200**, contexto **200**, CPE presente y `provisioning=null`. No se reinició el API, no se volvió a reservar, certificar ni cerrar la OT, y no se consultó ni modificó `tenant_iwana`.

### Corridas E2E de esta reanudación

Las ejecuciones fueron invocaciones separadas del mismo spec y cada una contó una suite con un test. Se conserva cada resultado, incluidas las fallas de harness; ninguna se convierte en evidencia de V1 completo.

| Invocación | Evidencia | Resultado |
| --- | --- | --- |
| 1 | Corrección incremental del parser de contexto; falló al interpretar la lista de comodatos. | 1 suite / 1 test fallido; defecto del test, sin mutación. |
| 2 | Parser de lista corregido; lectura de contexto y comodato. | 1 suite / 1 test aprobado. |
| 3 | Alta de catálogo; selector de submit ambiguo. | 1 suite / 1 test fallido antes de mutar. |
| 4 | Selector exacto; alta de router y red `/24`. | 1 suite / 1 test aprobado. |
| 5 | Primer intento de interacción con el selector de aprovisionamiento oculto. | 1 suite / 1 test fallido antes del POST. |
| 6 | Selector visible; la respuesta de reserva no produjo el servicio esperado. | 1 suite / 1 test fallido; GET posterior no encontró reserva. |
| 7 | Reserva con reporte seguro de status/código. | 1 suite / 1 test fallido; HTTP 500, código no informado. |
| 8 | Preflight GET-only después del 500. | 1 suite / 1 test fallido por ausencia esperada del servicio; health/login/contexto 200 y sin reserva parcial. |

**Conteo de las primeras ocho invocaciones de esta reanudación:** **8 suites, 8 tests ejecutados, 2 aprobados, 6 fallidos, 0 omitidos**. Son ejecuciones del mismo test en iteraciones del harness, no ocho criterios independientes. El intento histórico con URL `/health` 404, las corridas históricas de 22P02 y el bloqueo de fixture de Ola 12 quedan en sus secciones anteriores y no están incluidos en este conteo.

### Reintento controlado tras el preflight GET-only

El preflight GET-only aprobó **1 suite / 1 test**: health 200, OT `IN_PROGRESS`, uso de CPE serializado presente, contexto NOC con CPE y `provisioning=null`, comodato abierto y router/red sintéticos ya existentes. No hubo clics ni mutaciones en el preflight.

Con esas condiciones confirmadas se hizo **un solo** intento de reserva desde la UI; no se crearon de nuevo el CPE, router ni red. El test falló con HTTP **500**. La respuesta saneada contenía únicamente las claves `message,statusCode`, sin `code`; el mensaje genérico fue `Internal server error`. El cuerpo completo no se imprimió ni persistió. La lectura previa no mostraba servicio y el POST no devolvió un servicio/ID; el coordinador confirmó que no quedó reserva parcial. Health permaneció en 200 y no hubo reinicio. La comparación estática confirmó que la UI arma las claves requeridas por `ReserveProvisioningBodySchema`; el 500 sigue sin causa raíz verificable. No se repitió el POST.

**Conteo acumulado de esta serie:** **10 invocaciones de suite, 10 tests ejecutados, 3 aprobados, 7 fallidos, 0 omitidos**. Son diez ejecuciones iterativas del mismo test (incluido el preflight GET-only), no diez criterios independientes; la corrida controlada de reserva fue **1 suite / 1 test fallido**, y el preflight inmediatamente anterior fue **1 suite / 1 test aprobado**.

### Matriz CA-NET → test, estado actualizado de V1-r

| CA-NET | Test o evidencia | Estado de esta reanudación |
| --- | --- | --- |
| 01 | `e2e/tests/portal-network-provisioning-live.spec.ts`; catálogo de router/red `/24`, IP sugerida y reserva. | **Parcial:** router/red `/24` existentes confirmados por GET; un solo intento controlado de reserva desde UI devolvió HTTP 500. Sin IP sugerida confirmada, reserva/ID ni asignación. |
| 02 | `apps/api/src/modules/network/tests/ipam.service.postgres.integration.spec.ts`; 20 reservas concurrentes. | No ejecutado en esta reanudación. El resultado previo de R-pg se mantiene separado. |
| 03 | Misma integración IPAM; rechazo de IP manual no utilizable. | No ejecutado. |
| 04 | `apps/api/src/modules/network/service-provisioning.service.spec.ts`; reserva para OT no elegible. | No ejecutado en V1-r; no forma parte del camino feliz ejercitado. |
| 05 | Spec live; contexto NOC/técnico, CPE y aprovisionamiento. | **Parcial:** preflight health/login/contexto 200, OT `IN_PROGRESS`, serial y comodato abierto confirmados; reserva controlada HTTP 500 con claves `message,statusCode`, sin `code`, mensaje genérico saneado. Evidencia y certificación NOC no ejecutadas. |
| 06 | `apps/api/src/modules/tasks/tests/execution-orders.provisioning-gate.spec.ts`; cierre sin certificar y cierre certificado. | No ejecutado; la reserva falló antes de certificar o cerrar. |
| 07 | `apps/api/src/modules/network/network-execution-event.postgres.integration.spec.ts`; servicio/expediente/suscriptor activos tras cierre. | No ejecutado; no se certificó ni cerró la OT y no se comprobó ficha activa. |
| 08 | Misma integración; OT separada `NOT_EXECUTED`, liberación y reutilización de IP. | No ejecutado; no se creó segunda OT ni hubo IP reservada para liberar. |
| 09 | Misma integración; reintento idempotente e inbox único. | No ejecutado; no se generó evento de cierre. |
| 10 | Misma integración y `apps/portal/src/components/network/NetworkProvisioningComponents.spec.tsx`; ficha/servicio activo. | No ejecutado en esta reanudación; no hubo cierre ni navegación a la ficha. |
| 11 | Misma integración; regularización del origen. | No ejecutado; fuera del alcance de V1. |
| 12 | `apps/api/src/modules/network/tests/network-catalog.controller.http.spec.ts`; solo lectura. | No ejecutado en V1-r; las pruebas de permisos de otras olas no se suman. |
| 13 | Prueba de bandeja y filtros, asignada a F1/F2. | No ejecutado en V1-r. |
| 14 | Evidencia visual/a11y, asignada a V4-bis. | No ejecutado en V1-r; evidencia visual de otros agentes se reporta por separado. |

**Cierre:** `[BLOQUEO]` por HTTP 500 genérico en la única reserva controlada tras preflight aprobado; health siguió 200 y no hay tail actual aplicable. El body completo no se conservó y la raíz permanece indeterminada. No se observó reserva parcial ni se reinició el API. La OT no se certificó ni cerró. No se hacen nuevos POST sin evidencia adicional que permita explicar el 500. **V1 permanece incompleto.**

## Ola 11 · V1-r · ejecución FX-v1 reanudada (2026-10-23)

**Resultado:** el camino de certificación y cierre quedó completado en el estado FX-v1 y la corrida final del E2E aprobó. No fue una corrida única desde `RESERVED`: la OT ya tenía router/red activos y servicio reservado al iniciar; una invocación intermedia comprobó el cierre prematuro `422`, certificó como NOC (`200`) y dejó la OT `CERTIFIED`; la corrida final continuó desde `CERTIFIED` para cerrar como técnico. El envío de reserva no se repitió.

La corrida final cerró la OT desde el portal y comprobó: el evento dejó el servicio `ACTIVE`, el comodato del CPE siguió abierto y la ficha del suscriptor mostró “Activo”; la lectura autenticada del suscriptor devolvió `ACTIVE`. La prueba comprobó además router/red activos, el IP del servicio dentro del `/24`, CPE serializado en contexto, la sesión técnica sin acción de certificar y la firma de aceptación disponible. La certificación NOC y el `CLOSURE_GATE_INCOMPLETE` por intento de cierre antes de certificar se aprobaron en una invocación previa, que falló después en la transición de sesión; el estado `CERTIFIED` se conservó y permitió reanudar sin repetir mutaciones.

### Precondiciones y seguridad

- `GET /api/v1/health` y `/auth/login` respondieron `200` antes del recorrido; el API y el portal también respondieron `200` después de las fallas del harness. No hubo caída del API, así que no se guardó tail ni se reinició el proceso.
- Worker y Redis estaban disponibles. No se consultó ni modificó `tenant_iwana`, no se imprimieron credenciales/tokens y las salidas Playwright quedaron bajo `%TEMP%`.
- Las pruebas esperan el handler React antes de los clics. Para evitar mezclar actores, el cierre técnico se ejecutó en un contexto de navegador nuevo; la fixture de cookie usa una cookie host-only y no duplica la cookie del login.
- La evidencia de la aceptación quedó reutilizable por `requirementKey` para que una reanudación no suba duplicados. El helper espera el reset cuando recibe `429` y reintenta una sola vez.

### Conteo real

| Ejecución | Suites | Tests | Aprobados | Fallidos | Omitidos |
| --- | ---: | ---: | ---: | ---: | ---: |
| Corrida final del recorrido V1-r | 1 | 1 | **1** | 0 | 0 |
| Corridas de diagnóstico/preflight de esta serie | 4 | 4 | 4 | 0 | 0 |
| Iteraciones previas del recorrido completo (incluida la limitación inicial `429`) | 8 | 8 | 0 | 8 | 0 |
| **Total de invocaciones** | **13** | **13** | **5** | **8** | **0** |

Cada invocación ejecutó una suite y un test; las iteraciones fallidas son intentos del mismo caso, no criterios adicionales. El conteo de la última corrida es **1 suite / 1 test aprobado**.

Comando de la corrida final contra el portal ya servido, con resultados fuera del repositorio:

```powershell
$resultDir = Join-Path $env:TEMP 'mod13-v1-r-full-results-evidence'
pnpm exec playwright test --config e2e/playwright.mod13-live.tmp.config.ts --output $resultDir e2e/tests/portal-network-provisioning-live.spec.ts
```

Resultado literal: `1 passed (14.4s)`. La configuración temporal se eliminó al terminar. `pnpm exec eslint e2e/tests/portal-network-provisioning-live.spec.ts e2e/tests/helpers/portal-session.ts` salió con código `0`.

### Matriz CA-NET → test, actualización de V1-r

| CA-NET | Test o evidencia | Estado comprobado |
| --- | --- | --- |
| 01 | `e2e/tests/portal-network-provisioning-live.spec.ts`; catálogo, `/24`, IP esperado y servicio. | **Aprobado con continuidad de fixture:** router/red activos y el servicio conserva el host esperado dentro del `/24`; la reserva ya existía por la Ola 13, no se repitió desde la UI. |
| 02 | `apps/api/src/modules/network/tests/ipam.service.postgres.integration.spec.ts`; [R-pg](INFORME-MOD13-PRUEBAS-R-PG-v1.0.md). | **Aprobado por R-pg, separado de V1:** incluye las 20 reservas concurrentes sin duplicados; R-pg cerró 4 suites / 23 tests. |
| 03 | Suite IPAM de R-pg; validación de dirección manual. | **Aprobado por R-pg, separado de V1.** |
| 04 | `apps/api/src/modules/network/service-provisioning.service.spec.ts`; OT no elegible. | No ejecutado en este recorrido feliz. |
| 05 | Spec live; contexto NOC/técnico, CPE, comodato y permisos de certificar. | **Aprobado acumulado:** CPE serializado y comodato abierto; el técnico no ve Certificar; NOC certificó con HTTP `200`. |
| 06 | Spec live; cierre antes de certificar y cierre de OT. | **Aprobado acumulado:** cierre prematuro `422` con `CLOSURE_GATE_INCOMPLETE`; luego certificación NOC y cierre técnico en portal con HTTP `200`. |
| 07 | Spec live; evento de cierre y activación. [Cableado del consumidor](INFORME-MOD13-CABLEADO-CONSUMIDOR-v1.0.md). | **Aprobado:** la corrida final observó servicio `ACTIVE`; el cableado consumidor cubre además el procesamiento firmado contra PostgreSQL/Redis reales. |
| 08 | Integración de evento para OT `NOT_EXECUTED`, liberar y reutilizar IP. | No ejecutado por este recorrido V1. B-wire verifica liberación; la reutilización de IP no se declara probada aquí. |
| 09 | `network-execution-event.wiring.postgres.integration.spec.ts`; reentrega e inbox. | **Aprobado por B-wire, separado de V1:** 2 tests de cableado real. |
| 10 | Spec live y ficha de suscriptor. | **Aprobado:** el portal mostró servicio técnico “Activo” y el API devolvió `ACTIVE`. |
| 11 | Regularización de origen. | Fuera del alcance V1; no ejecutado. |
| 12 | `network-catalog.controller.http.spec.ts` y sesión de solo lectura de F1-v. | No ejecutado en V1-r; la comprobación de solo lectura corresponde a F1-v. |
| 13 | Bandeja, filtros y paginación. | Fuera de este recorrido; corresponde a F1/F2. |
| 14 | Capturas responsive/tema y WCAG. | Fuera de este recorrido; corresponde a V4-bis. |

**Cierre V1-r:** camino de certificación/cierre y activación completado con conteo final verde. CA-NET-02/03 y 09 conservan su evidencia de integración en R-pg/B-wire; 08, 11–14 no se declaran cubiertos por este E2E.

## Ola 15 · V1-ci · bloqueo por gate de cierre de NOT_EXECUTED (2026-10-23)

**Resultado:** `[BLOQUEO]`. V1-ci no pudo crear el spec autocontenido ni ejecutar pruebas. La secuencia exigida incluye una segunda OT `INSTALLATION` que cierre como `NOT_EXECUTED` y cuya reserva IP quede `RELEASED`. No preparé esa OT ni sus fixtures porque el estado no se puede alcanzar con el flujo API vigente sin registrar como instalado un CPE de un trabajo no ejecutado o cambiar el contrato/producto.

### Evidencia del bloqueo

- HLD v1.1 §5.3, punto 5, establece que para `NOT_EXECUTED` no se consulta el puerto `PROVISIONING`. Esto evita exigir certificación de aprovisionamiento; no elimina los demás requisitos de la plantilla de cierre.
- La plantilla estándar v2 define `installed-equipment` como `MATERIAL` obligatorio, categoría `CPE`, disposición `INSTALLED_AT_CUSTOMER` ([migración 131](../../packages/database/src/migrations/tenant/131_publish_instalacion_estandar_v2.ts:184)). Las migraciones 163/164 copian la última versión publicada y agregan `PROVISIONING`; no retiran ese requisito ([migración compartida](../../packages/database/src/migrations/tenant/ensure-provisioning-requirement.migration.ts:93)).
- En `ExecutionOrdersService.close`, `NOT_EXECUTED` excluye del snapshot solo requisitos `PROVISIONING`; luego evalúa los requisitos restantes y devuelve `CLOSURE_GATE_INCOMPLETE` si falta alguno ([execution-orders.service.ts](../../apps/api/src/modules/tasks/services/execution-orders.service.ts:2158)). El evaluador de `MATERIAL` requiere una utilización CPE cuyo `finalDisposition` coincida con `INSTALLED_AT_CUSTOMER` ([closure-gate-evaluator.service.ts](../../apps/api/src/modules/tasks/services/closure-gate-evaluator.service.ts:184)).

Por lo tanto, cerrar honestamente como `NOT_EXECUTED` deja insatisfecho `installed-equipment`; añadir una utilización para satisfacerlo falsearía el estado del inventario. No hice llamadas de mutación para crear expedientes, suscriptores, CPE adicionales, órdenes o redes, y no alteré el spec legado de FX-v1.

### Fixture que sí quedó creada

API y portal respondieron `200` en health/login. Se creó por API en el tenant de pruebas un plan comercial sintético de 300/100 Mbps y se guardó su perfil PCQ, para que V4-plan pueda usar «ajustes con planes»:

| Recurso | Resultado |
| --- | --- |
| `POST /api/v1/commercial/catalog/plans` | `201` |
| `PUT /api/v1/network/plan-profiles/:planId` | `200` |
| ID del plan | `ce81b3f6-9f1c-4019-9f4d-106fce5902c7` |

No se imprimieron credenciales, tokens ni datos personales. No se modificó código de producto ni se tocó `tenant_iwana`.

### Conteo de V1-ci

| Corridas | Suites | Tests | Aprobados | Fallidos | Omitidos |
| ---: | ---: | ---: | ---: | ---: | ---: |
| **0** | **0** | **0** | **0** | **0** | **0** |

No se ejecutaron pruebas; este conteo indica ausencia de corridas, no un resultado verde. V1-ci queda pendiente de una decisión sobre el gate de cierre para instalaciones `NOT_EXECUTED` que preserve la semántica del inventario y del contrato.

## Ola 16 · V1-ci2 · spec autocontenido y liberación por anulación (2026-10-23)

**Resultado:** aprobado. Las dos últimas corridas consecutivas completaron el flujo y pasaron con fixtures propios. V1-ci2 usa el plan PCQ existente. Cada corrida crea, por API y solo en el tenant de pruebas, expediente/suscriptor/contrato sintéticos, CPE serializado comprado y transferido a custodia técnica, router/red `/24` con sufijo único y OTs propias. El CPE principal se registra desde el portal; las evidencias pasan por carga real, análisis y registro. NOC reserva y certifica; el cierre prematuro devuelve `422 CLOSURE_GATE_INCOMPLETE`; el técnico cierra la instalación. Se comprueban `COMPLETED`, servicio y suscriptor `ACTIVE`, activo `INSTALLED_COMODATO` y comodato abierto.

Para la liberación, una segunda OT queda `IN_PROGRESS` y recibe una segunda reserva viva en la misma red. NOC la anula; el test verifica la OT en `CANCELLED` con `annulled=true`, la reserva en `RELEASED` con motivo `ANNULLED` y la ocupación restaurada. La segunda OT no lleva equipo ni se cierra como `NOT_EXECUTED`; no se registra una instalación ficticia.

### Ajuste por límite de evidencia

La inspección del guard confirmó un bucket `eo-evidence-media` de 10 solicitudes/minuto por actor y tenant. Todas las rutas con `/evidence` en el path, incluidos los GET de estado, consumen el mismo bucket. El spec dejó de sondear el recibo entre la carga y el registro: espera diez segundos al análisis, confirma `AVAILABLE` en la respuesta del POST de registro y lee después el detalle/completion con el GET normal de la OT. También elimina un reload manual tras iniciar la ejecución; la interfaz actualiza el detalle al completar la mutación. No se reintentan escrituras ni se hacen sondas de evidencia.

### Historial de intentos y residuos

Las 19 invocaciones siguientes ejecutaron el mismo archivo y un test cada una, con sufijos aleatorios distintos. Las fallidas no se reutilizaron ni limpiaron por SQL; los datos sintéticos parciales permanecen aislados en el tenant de pruebas.

| Invocación | Resultado y último estado observado | Fixture parcial que queda |
| ---: | --- | --- |
| 1 | Falló la aserción de suscriptor `ACTIVE` antes de instalar; la API lo mantenía en `PROSPECT`. | Expediente, suscriptor y contrato sintéticos. |
| 2 | El traslado del CPE devolvió `400` por falta de `lotId`. | Registros comerciales y CPE comprado en almacén. |
| 3 | La prueba consultó `START` con sesión NOC; esa acción corresponde a la sesión técnica. | Registros comerciales, CPE transferido, router/red y OT asignada. |
| 4 | El texto esperado para el estado de ejecución no coincidía con la etiqueta visible. | Fixture propia; sin evidencia ni cierre. |
| 5 | El locator de inicio coincidía con más de un control. | Fixture propia; sin evidencia ni cierre. |
| 6 | La tabla contenía otras OTs en progreso y el locator seguía siendo ambiguo. | Fixture propia; sin evidencia ni cierre. |
| 7 | El POST de inicio respondió `200`, pero la lista no reflejó la actualización; la lectura autenticada confirmó `IN_PROGRESS`. | Fixture propia con OT iniciada; no se reutilizó. |
| 8 | La carga respondió `202`; el GET de estado de asset recibió `429`. | OT con CPE real registrado y un asset de evidencia pendiente de análisis/registro. |
| 9 | El primer POST de carga respondió `429`. | Datos de dominio y OT propias; sin asset de evidencia confirmado. |
| 10 | El primer POST de carga respondió `429` después de esperar una ventana. | Datos de dominio y OT propias; sin asset de evidencia confirmado. |
| 11 | El primer POST de carga respondió `429` tras otro intervalo sin actividad. | Datos de dominio y OT propias; sin asset de evidencia confirmado. |
| 12 | La carga con sesión NOC respondió `403`; no se creó media. | Datos de dominio y OT propias; sin asset de evidencia. |
| 13 | La carga y la lectura de estado alcanzaron `AVAILABLE`; el POST de registro respondió `429`. | Un asset disponible sin vincular como evidencia a esa OT, además de los datos de dominio. |
| 14 | El primer POST de carga respondió `429`. | Datos de dominio y OT propias; sin asset de evidencia confirmado. |
| 15 | El primer POST de carga respondió `429` aun con la página en blanco. | Datos de dominio y OT propias; sin asset de evidencia confirmado. |
| 16 | El flujo principal cerró y el servicio se observó `ACTIVE`; falló la expectativa `CLOSED` frente al estado contractual `COMPLETED`, antes de crear la segunda OT. | OT sintética `COMPLETED`; no se alcanzaron las lecturas posteriores de suscriptor y CPE. No se reutilizó. |
| 17 | El cierre principal y la reserva/anulación de la segunda OT llegaron a ejecutarse; el receipt devolvió `CANCELLED` sin incluir `annulled`. La prueba se detuvo antes de observar la proyección final de liberación. | Instalación sintética completada y segunda OT anulada; la liberación de ese intento no se cuenta como verificada. No se reutilizó. |
| 18 | **Aprobada**, 51.3 s. | Flujo principal completado y segunda OT anulada/liberada; ocupación restaurada. |
| 19 | **Aprobada**, 54.6 s. | Flujo principal completado y segunda OT anulada/liberada; ocupación restaurada. |

Durante el diagnóstico se hicieron además cinco GET de solo lectura a IDs UUID sintácticamente válidos pero inexistentes; no escribieron datos y no se cuentan como suites. Las respuestas alternaron entre `404` con bucket `10`, restante `9` y `429` con restante `0`. El probe posterior a la invocación 14 confirmó que el límite era el bucket de evidencia, no el global. Los probes se eliminaron del workspace al terminar el diagnóstico. No se reinició el API/portal, no se consultó ni modificó `tenant_iwana`, no se imprimieron secretos y no hubo limpieza de datos por SQL.

### Conteo real de V1-ci2

| Ejecuciones | Suites | Tests | Aprobados | Fallidos | Omitidos |
| --- | ---: | ---: | ---: | ---: | ---: |
| Invocaciones 1–17 | 17 | 17 | 0 | 17 | 0 |
| Invocaciones consecutivas 18–19 | 2 | 2 | **2** | 0 | 0 |
| **Total de esta serie** | **19** | **19** | **2** | **17** | **0** |

Los dos verdes requeridos son dos corridas consecutivas completas, cada una con **1 suite / 1 test aprobado**. `pnpm exec eslint e2e/tests/portal-network-provisioning-live.spec.ts e2e/.portal-ci2-temp.config.ts` terminó con código `0`; `pnpm exec playwright test --config e2e/.portal-ci2-temp.config.ts --list` encontró un test. La configuración temporal y los resultados de Playwright quedaron fuera del entregable final; las salidas de las corridas estuvieron bajo `%TEMP%`.

### Matriz CA-NET → test, actualización V1-ci2

| CA-NET | Test/evidencia | Resultado de esta serie |
| --- | --- | --- |
| 01 | Spec live: catálogo, router/red `/24`, dos reservas del mismo rango e IPs distintas. | **Aprobado en las corridas 18 y 19**; el estado y la ocupación se comprobaron mediante API. |
| 02 | Suite IPAM PostgreSQL de [R-pg](INFORME-MOD13-PRUEBAS-R-PG-v1.0.md). | No se volvió a ejecutar en V1-ci2; se conserva el conteo previo de R-pg: 4 suites / 23 tests, incluidas 20 reservas concurrentes sin duplicados. |
| 03 | Suite IPAM PostgreSQL de R-pg. | No se volvió a ejecutar en V1-ci2; evidencia previa de R-pg. |
| 05 | Spec live: registro real del CPE por técnico, separación de acciones y certificación NOC. | **Aprobado en las corridas 18 y 19**; el técnico no certifica y NOC lo hace desde el portal. |
| 06 | Spec live: intento de cierre prematuro y cierre tras certificar. | **Aprobado en las corridas 18 y 19**; `422 CLOSURE_GATE_INCOMPLETE`, luego la OT termina `COMPLETED`. |
| 07 | Spec live y [cableado del consumidor](INFORME-MOD13-CABLEADO-CONSUMIDOR-v1.0.md). | **Aprobado en las corridas 18 y 19**; la proyección de aprovisionamiento llega a `ACTIVE` y el CPE queda en comodato. B-wire cubre el consumidor con PostgreSQL/Redis reales. |
| 08 | Spec live: reserva segunda OT, anulación y lectura de proyección. | **Aprobado en las corridas 18 y 19**: `CANCELLED`, `annulled=true`, reserva `RELEASED` con motivo `ANNULLED` y ocupación restaurada. |
| 10 | Spec live: lectura posterior de suscriptor y activo/comodato. | **Aprobado en las corridas 18 y 19**; el suscriptor termina `ACTIVE`, el activo `INSTALLED_COMODATO` y el comodato está abierto. |

**Cierre V1-ci2:** G4 queda cubierto por las dos corridas consecutivas verdes. El resto de la matriz conserva el estado ya documentado en V1-r, R-pg y B-wire; esta serie no amplía sus conteos.
