# INFORME-MOD13 — Revisión de seguridad de diseño · Interfaces, direcciones locales y registro IPv4 (O1-S)

**Versión:** 1.2  
**Estado:** O1-S PASS semántico para rollback HLD D-7, UX D7/D13 y HLD/API D-23–D-25; G1 cerrado; G2/G3 pendientes; G4 no emitido. O2-C/G4 no se habilitan hasta cerrar G2/G3 y publicar/revisar contratos runtime.  
**Fecha:** 2026-10-26  
**Emisor:** AI-SEC-ENG (Security Engineer / AppSec), revisión independiente de solo lectura  
**Encargo:** O1-S del plan de orquestación MOD13; sincronización del informe contra los artefactos consolidados  
**Antecedente:** [revisión v1.1](INFORME-MOD13-INTERFACES-SEGURIDAD-v1.1.md), superada por esta versión.  
**Entradas revisadas:** PRD addendum v1.0; HLD addendum v1.0; modelo v1.6; UX v1.8; aprovisionamiento UX v1.3; API v1.2 sincronizada; matriz QA v0.6; ADR-044, ADR-098 y ADR-101 v1.1 aprobado por CTO el 2026-10-26; plan de orquestación v1.2.  
**Código contrastado en lectura estática:** `apps/api/src/modules/access-control/{guards/permissions.guard.ts,services/effective-permissions.service.ts}`, `apps/api/src/modules/network/{network-catalog.controller.ts,network-provisioning.controller.ts,service-provisioning.service.ts}`, y referencias de auditoría/IPAM del informe v1.1. La búsqueda actual no encuentra `confirmReleasedHost`, `ADDRESS_RELEASE_CONFIRMATION_REQUIRED`, `IP_PROTECTED_BY_INFRASTRUCTURE`, `ipProtection` ni `reservationsPaused` en el runtime de MOD13 o sus contratos compartidos.  
**Skills:** `security-auditor` y `backend-security-coder` obligatorias; `frontend-security-coder` de apoyo para estados y errores de UI; `auth-implementation-patterns` descartada porque no se rediseña autenticación.

## 1. Dictamen

La revisión independiente **aprueba en semántica de seguridad** D-23, D-24 y D-25 del HLD/API v1.2 y los estados D7/D13 descritos en UX v1.8: el alcance se obtiene del recurso/destino validado, las referencias no autorizadas se ocultan con 404 uniforme, la falta de permiso de acción dentro del scope conserva 403, y `correct` exige `confirmReleasedHost: true` solo cuando cambia el host. En `reserve`/`regularize`, la referencia inexistente, fuera de scope o con padre incorrecto es 404; un recurso accesible pero inactivo permanece 422; pausa y conflictos reales permanecen 409. La tabla de errores limita el cambio de `NETWORK_NOT_IN_ROUTER` a esas dos operaciones.

Esta aprobación es de diseño. La integración D-23 es factible sin ciclo en el grafo observado, pero G3 aún necesita un puerto tipado de Access Control para consultar el permiso efectivo y conjunto de sedes autorizadas, puertos de lectura de Organización y Tenant para validar referencias, y el dictamen de factibilidad frontend. El `PermissionsGuard` actual corre antes del servicio y obtiene scope desde params/body/query; por sí solo no puede cumplir el contrato nuevo.

G1 de PRD/HLD está cerrado con PASS independiente de AI-SR-FULL y AI-PROD-UX. G2 sigue pendiente: este informe da PASS semántico a la revisión SEC de D7/D13, pero UX v1.8 todavía los marca abiertos y requiere sincronizar ese registro; además faltan el contrato/revisión DS, cierre de D3, D9/D10 y D12 y la revisión UX conjunta. G3 está pendiente. G4 no se ha emitido: API v1.2 continúa siendo documental y no hay contrato runtime ni congelación verificable.

La captura de direcciones locales **permanece bloqueada** hasta que CA-R12 pruebe las tres rutas IPAM (reserva manual, automática y ocupación) y exista evidencia de rollout/rollback conforme a D-7/ADR-101. No ejecuté pruebas, migraciones ni verificaciones dinámicas; no declaro G2–G7 ni habilitación de captura.

## 2. Decisiones y hallazgos frente a v1.1

| Hallazgo                                         | Estado en esta revisión                                                                                                                                                | Disposición                                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| SEC-M13-01, autorización por sede                | D-23 cierra el contrato: sede persistida/destino validado; fuera de scope 404; lista filtra antes de page/count. El mecanismo runtime sigue sin puerto AC site-scoped. | PASS semántico; G3/O2-H abiertos.                                                                     |
| SEC-M13-02, `notes` y auditoría de respuesta     | HLD/API conservan allowlist y exclusión de `notes`; el interceptor global y el código siguen pendientes de prueba de ruta efectiva.                                    | Hallazgo de implementación abierto para O2-H/G6.                                                      |
| SEC-M13-03, confirmación de `correct`            | D-24 exige `confirmReleasedHost: true` si cambia el host; `400 ADDRESS_RELEASE_CONFIRMATION_REQUIRED` tras versión/locks y sin mutación ni auditoría.                  | PASS contractual; implementación y prueba sin side effects abiertas.                                  |
| SEC-M13-04, rollback que pierde protección       | D-7 y ADR-101 requieren conservar backend protector o pausar y verificar reserve, replay y regularize; I-1 en cero no basta.                                           | Diseño PASS; ensayo operacional O3 pendiente y bloquea captura.                                       |
| SEC-M13-05, enumeración y errores de provisión   | D-23/D-25 fijan 404 uniforme, 403 para falta de acción dentro de scope, 422 para accesible inactivo y 409 para pausa/conflicto real.                                   | PASS semántico; mapeo runtime y compatibilidad siguen abiertos.                                       |
| SEC-M13-06/07, protección IPAM y metadatos/pausa | ADR-101 define protección tenant-wide y API separa `ipProtection` de `reservationsPaused`; UX es fail-closed y el 409 es autoritativo.                                 | D7 UX pasa en diseño; código de las tres rutas IPAM y pruebas siguen pendientes.                      |
| SEC-M13-08, oráculo de IP protegida              | Error tipado puede distinguir infraestructura de `IP_IN_USE`, sin necesidad de revelar ubicación o interfaz.                                                           | Residual Bajo no bloqueante: mensaje sin datos del recurso; validar respuesta pública al implementar. |
| SEC-M13-10/12/14                                 | Modelo v1.6 fija locks, nombres compartidos y FK compuesta/preflight.                                                                                                  | Diseño revisable; concurrencia, contrato runtime y migración reversible pendientes.                   |

## 3. Revisión SEC de D7, D13 y D-23–D-25

### [SEC-REVIEW] SEC-M13-01 — Autorización por sede y guard temprano

- **Severidad:** Alta si se implementara usando `siteId` del request; sin vulnerabilidad runtime nueva confirmada en este encargo documental.
- **Evidencia:** `apps/api/src/modules/access-control/guards/permissions.guard.ts:64-80` toma `siteId`/`organizationSiteId` de params, body o query. `effective-permissions.service.ts:137-139` compara el `scopeSiteId` contra ese valor. `network-catalog.controller.ts:115` y `network-provisioning.controller.ts:59` ejecutan `PermissionsGuard` a nivel de controlador, antes de que el servicio resuelva el recurso.
- **Criterio revisado (HLD D-23, API v1.2 §§2, 4.3 y 13.5):** recurso tenant-local resuelto con su sede persistida; destino de alta validado primero por Organización y luego autorizado; sin sede destino se exige permiso tenant-wide; al cambiar sede se autorizan origen y destino; listas filtran el conjunto autorizado antes de contar/paginar. Recurso inexistente, padre incorrecto o fuera de scope devuelve el mismo `404 RESOURCE_NOT_FOUND`; dentro de scope sin permiso de acción devuelve 403. Ningún body/query concede alcance.
- **Dictamen:** **PASS semántico, G3 pendiente.** La spec identifica correctamente que el guard genérico no debe ser decisor temprano en esas rutas y propone una fachada/guard MOD13 respaldada por puertos tipados. El grafo modular observado permite esa integración sin ciclo, pero no existe aún el puerto público de Access Control para evaluación site-scoped ni están cerrados los puertos Org/Tenant. No se recomienda autorización únicamente en servicio si el guard anterior puede denegar primero.
- **Cierre verificable en O2-H/O3:** caso `PATCH router B?siteId=A` con grant A → 404 idéntico a inexistente/padre incorrecto; grant real B autoriza; falta de permiso de acción en B dentro del scope → 403; alta valida destino Org→AC; alta sin destino requiere tenant-wide; lista A excluye B antes de page/count. Pruebas deben cubrir que los rechazos no escriben ni filtran datos.

### [SEC-REVIEW] SEC-M13-02 — `notes` y auditoría de respuesta

- **Severidad:** Alta para datos libres si la respuesta completa se persiste sin filtrado.
- **Estado documental:** HLD D-21 y API v1.2 §12.1 exigen allowlist por entidad y excluyen `notes`.
- **Riesgo de implementación:** según la revisión estática anterior, el interceptor global todavía recoge respuestas CUD y una llamada manual que omite `notes` no demuestra que el interceptor deje de guardarlo. No hay evidencia en este encargo de una ruta efectiva de auditoría con allowlist.
- **Cierre:** verificar en las rutas CUD finales que la única escritura de auditoría aplica la allowlist, y en integración que `notes`, `managementHost`, `lanInterface` y el request completo no aparecen en `audit_logs` ni logs; conservar actor, tenant, acción y recurso.
- **Gate:** O2-H/G6, no bloquea por sí solo O2-C.

### [SEC-REVIEW] SEC-M13-03 — `correct` y liberación del host

- **Severidad:** Alta de integridad operacional si el cambio se acepta sin confirmar su efecto.
- **Criterio revisado (HLD D-24; API v1.2 §6; UX v1.8 §13.19):** compara host ignorando prefijo. Si cambia, solo el booleano literal `confirmReleasedHost: true` permite continuar; falta/false → `400 ADDRESS_RELEASE_CONFIRMATION_REQUIRED`, tras comprobar versión y bajo locks, sin mutar dirección/versión ni registrar auditoría de cambio. La confirmación visual adicional se conserva. Solo cambio de prefijo omite confirmación y responde `releasedHost: null`.
- **Dictamen:** **PASS semántico.** El booleano es suficiente como afirmación de intención en el contrato y evita omitir accidentalmente el paso de UI; no prueba criptográficamente que una persona haya leído el texto ni pretende frenar a un actor autorizado malicioso.
- **Cierre en O2-H/O3:** HTTP/PostgreSQL para host cambiado con campo ausente/false, comparando estado, versión y auditoría; comprobar host cambiado con `true` y prefijo-only sin el campo. Contrato compartido/OpenAPI debe modelar el campo y el código de error.

### [SEC-REVIEW] SEC-M13-04 — Rollback después de capturar direcciones

- **Severidad:** Alta; riesgo de reasignación de infraestructura.
- **Estado de diseño:** D-7 y ADR-101 v1.1 pasan: tras la primera captura, se conserva el backend protector; si una reversión requiere una versión antigua, una pausa externa debe bloquear y verificar `reserve`, replay que reemite instrucción y `regularize` antes de reanudar. I-1 en cero es necesario, no suficiente.
- **Cierre operacional:** O3 debe probar defaults fail-closed, bloqueo de esas tres rutas con backend de fallback, preservación de asignaciones vivas, secuencia de rollback/retorno, autoridad para reanudar y evidencia de conciliación. Una bandera `reservationsPaused` que el backend antiguo ignore no satisface D-7.
- **Gate:** no impide G4 documental/runtime por sí solo; bloquea CA-R12/captura, rollout y producción.

### [SEC-REVIEW] SEC-M13-05 — Enumeración, D13 UX y errores de provisioning

- **Severidad:** Media; diferencias de existencia dentro del tenant o de scope elevan riesgo de IDOR/enumeración.
- **Criterio revisado (HLD D-23/D-25; API v1.2 §§2, 4.3, 11.1–11.2 y 13.5; UX v1.8 §13.19; aprovisionamiento UX v1.3 §§6 y 9):** misma respuesta pública `404 RESOURCE_NOT_FOUND` para referencia inexistente, padre/router incorrecto o fuera del scope autorizado, incluidos resultados/listas sin contar recursos fuera de scope. 403 solo para recurso dentro del scope sin permiso de acción. En `reserve`/`regularize`, destino accesible pero inactivo → `422 PROVISIONING_ORDER_NOT_ELIGIBLE`; pausa/conflictos reales → 409. No usar `NETWORK_NOT_IN_ROUTER` para padre incorrecto en esas dos operaciones.
- **Dictamen:** **PASS semántico D-23–D-25 y D13 UX.** La política 404 es uniforme y no crea una fuga distinta; el tenant sigue resolviéndose desde JWT y el 403 cross-tenant de la guarda de tenant permanece conforme a AGENTS.md. La clasificación accesible/inactivo solo se revela después de pertenencia y autorización efectiva. La separación de estado pausa 409 mantiene el 409 como respuesta autoritativa.
- **Compatibilidad pendiente:** el código actual de `service-provisioning.service.ts:115,472` aún emite 409 `NETWORK_NOT_IN_ROUTER` para router/red con relación incorrecta. La spec conserva el código en el enum por compatibilidad, pero elimina su emisión para esos casos concretos. SR-BACKEND debe inventariar consumidores y probar la transición sin cambiar emisores ajenos a `reserve`/`regularize`.
- **Oráculo IP protegido:** `IP_PROTECTED_BY_INFRASTRUCTURE` informa la categoría del host solicitado pero no debe incluir router, interfaz, ubicación ni otra dirección. Es un residual **Bajo** comparable a conocer que una IP está ocupada, dentro del tenant y con permiso de reserva; no bloquea G4 si el cuerpo público permanece genérico y no se exponen datos identificadores.
- **Gate:** política documental cerrada; emisión HTTP, igualdad de status/cuerpo, filtrado previo a paginación y compatibilidad quedan en O2-H/O3.

### [SEC-REVIEW] SEC-M13-06 — Protección IPAM y fail-closed de captura

- **Severidad:** Alta; no habilitar captura sin protección efectiva.
- **Estado de diseño:** ADR-101 v1.1 exige proteger por host cada IP local del tenant en todo pool que la contenga, incluyendo otra interfaz/router e interfaz inactiva; reserva manual, automática y ocupación comparten el conjunto deduplicado y no se modifica `excluded_ips`.
- **Estado runtime:** la búsqueda actual no encuentra `ipProtection` ni `IP_PROTECTED_BY_INFRASTRUCTURE` en API/contratos compartidos. La protección de las tres rutas no está implementada/publicada; la matriz QA v0.6 no reporta nuevas pruebas ejecutadas.
- **Cierre CA-R12:** PostgreSQL real verifica reserva manual, automática y ocupación, direcciones /32, deduplicación, interfaces inactivas/otros routers, y las carreras con alta de pool en ambos órdenes; I-1 queda en cero. La UI solo habilita alta/corrección después de estado `ACTIVE` autorizado, emitido luego de CA-R12. `PENDING`, ausente, parcial o no autorizado conserva el fail-closed.
- **Gate:** bloquea CA-R12 y captura. G4 de tipos, cuando llegue, no autoriza por sí solo la captura.

### [SEC-REVIEW] SEC-M13-07 — D7 UX: metadata, pausa y consumer sin permiso de lectura

- **Severidad:** Media; alta si la pausa no bloquea una ruta de escritura.
- **Criterio revisado (HLD D-7/D-14; API v1.2 §§9.1–10; UX v1.8 §§13.16 F, 13.18–13.19; aprovisionamiento UX v1.3 §6):** `ipProtection` y `reservationsPaused` se separan y requieren permisos de lectura distintos. La UI no infiere metadatos; sin `ipProtection` autorizado/completo no afirma estado ni ofrece captura. El usuario sin `network.provisioning.read` puede recibir el 409 autoritativo y la UX conserva OT/entrada, anuncia fallo y no éxito. Release/certify siguen disponibles según sus permisos.
- **Dictamen:** **PASS semántico de SEC para D7.** La falta de permiso de metadatos no desactiva el control del servidor ni genera una inferencia; el consumidor queda fail-closed para captura y el 409 cubre la pausa. UX v1.8 todavía registra D7 como “Abierto” (§13.19 tabla); el dueño UX debe sincronizar esa fila con esta revisión antes del cierre documental de G2.
- **Pendiente runtime:** probar permisos positivos/negativos de ambos meta-endpoints, respuestas mínimas separadas, `409 RESERVATIONS_PAUSED` sin mutación ni instrucción para reserva/replay/regularize, y autorización independiente de release/certify. Configuración y fallback se verifican en O3.

## 4. Controles y riesgos residuales

- **Tenancy y límites de módulo:** conservar tenant desde JWT/`TenantContext`; MOD13 no consulta tablas de Organización, Tenant o Access Control y recibe referencias por puertos. D-23 no convierte sede física en nodo técnico ni reutiliza cobertura/nodo comercial. Una fuga cross-tenant sería Crítica y bloquearía merge/despliegue; no se observó una nueva en esta revisión documental.
- **Contratos y errores:** API v1.2 separa Zod/DTO y documenta errores, pero no está publicado en `@iwana/shared` ni en OpenAPI runtime. El snapshot real y la paridad DTO/schema siguen siendo bloqueos de G4.
- **Migración e integridad:** modelo v1.6 propone FK tenant/router compuesta `NOT VALID`, preflight legado y `down()` protegido por conteo/flag destructivo. No se ejecutó migración ni `up/down/up` con legado poblado; no validar constraints antes del preflight.
- **Auditoría de `correct`:** motivo cerrado y lista allowlist son apropiados. Tratar IP local como dato operativo sensible para reconocimiento; si es dato personal o tiene retención regulada, **requiere verificación con fuente oficial**. No incluir IP/nombre libre en logs, URL o errores.
- **Rendimiento:** medir ocupación por pool y conjunto protegido con `EXPLAIN (ANALYZE, BUFFERS)` y volumen representativo antes de G6; paginar y agregar en lote.
- **Nombres y limitación:** SEC-M13-15 (Baja): validar/rechazar controles y formato de nombres antes de renderizar. SEC-M13-16 (Baja): evaluar rate limit tenant-aware para mutaciones; no bloquean G4 por sí solos.
- **Fuera de alcance:** no se revisan NMS, descubrimiento/configuración RouterOS, credenciales, VLAN/bridges, IPv6, ni reglas de cobertura/nodo más allá de la preservación de owners y puertos separados.

## 5. Gates, bloqueos y trabajo requerido

| Gate / bloque       | Estado SEC                       | Criterio / bloqueo concreto                                                                                                                                                                                                                                                                                    |
| ------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G1 PRD/HLD**      | **PASS y cerrado**               | PRD/HLD addenda v1.0 aprobados tras PASS independiente de AI-SR-FULL y AI-PROD-UX; revalidación incluye D-23–D-25. ADR-101 v1.1 aprobado por CTO.                                                                                                                                                              |
| **G2 UX/DS**        | **Pendiente**                    | O1-S da PASS semántico para D7/D13, pero UX v1.8 aún los etiqueta abiertos. Sincronizar ese registro; quedan contrato/revisión DS, D3, D9/D10, D12 y revisión conjunta de UX/accesibilidad.                                                                                                                    |
| **G3 factibilidad** | **Pendiente; viable sin ciclo**  | Publicar/validar puerto tipado AC para permiso efectivo por sede y conjunto autorizado; puertos de lectura de Organización y Tenant para validación de refs; cerrar búsqueda/paginación de sedes >100 y dictamen O1-F de FE. No mantener el guard genérico como denegador anterior a la resolución de recurso. |
| **O2-C / G4**       | **No habilitado; G4 no emitido** | Cerrar G2/G3; publicar Zod/DTO/errores compartidos y Swagger/OpenAPI runtime, mocks tipados y pruebas de contrato; revisar snapshot, compatibilidad de `NETWORK_NOT_IN_ROUTER`, `confirmReleasedHost` y errores; completar revisiones independientes. AI-EM-ARCH debe registrar freeze por rutas/versión real. |
| **O2-H**            | **Pendiente**                    | Implementar autorización D-23 mediante puertos, allowlist de auditoría, D-24 sin efectos en rechazo, D-25 404/422/409 y metadatos/permisos separados; correr pruebas HTTP/tenancy e inventariar consumidores afectados.                                                                                        |
| **O2-M**            | **Pendiente**                    | Migración tenant reversible y ensayo con datos legados; locks/concurrencia H-1–H-12; protección de las tres rutas IPAM; I-1/carreras en ambos órdenes.                                                                                                                                                         |
| **O3 / CA-R12**     | **Pendiente; bloquea captura**   | Evidencia PostgreSQL de las tres rutas, defaults/configuración fail-closed y rollout/rollback según D-7; validar que rollback detiene reserve, replay y regularize antes de reanudar y que I-1 está conciliado.                                                                                                |
| **G6/G6.5/G7**      | **No evaluados**                 | Gates de tests/cobertura, CI por SHA y aprobación de producción siguen siendo separados.                                                                                                                                                                                                                       |

La matriz QA v0.6 aporta casos verificables, no prueba ejecución. Hay declaraciones documentales que sus dueños deben sincronizar: el estado de la matriz en línea 7 aún dice G1–G4 pendientes; la nota de enmienda del plan v1.2 en línea 15 todavía dice que G1 está pendiente, aunque la línea 21 del plan, PRD/HLD v1.0 y sus revisiones independientes lo dan por cerrado. Además, la matriz O1-S del plan en línea 33 aún apunta al informe v1.0. Estas divergencias no reabren G1, pero deben alinearse antes del cierre de G2.

## 6. Alcance y reproducibilidad

Revisión estática de artefactos actuales y búsqueda puntual de símbolos de implementación; no ejecuté suites, migraciones, consultas PostgreSQL ni prueba de abuso. No se revisaron TLS/Nginx o despliegue. La semántica D-23–D-25 y D7/D13 queda aprobada en diseño; los hallazgos de código/runtime descritos siguen pendientes hasta evidencia. No se determinó legalmente si las IP de infraestructura son datos personales.

**Firma:** AI-SEC-ENG. Dictamen independiente de diseño; no es autorización de excepción ni declaración de G2, G3, G4, CA-R12 o producción.
