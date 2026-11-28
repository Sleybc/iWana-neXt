# Spec — Transversal · Importación UISP: usuarios del personal

**Versión:** 1.4 (2026-11-15: §2.4 invitación para crear la contraseña; §2.3 «Enlazar con…» un usuario existente. 2026-11-26: §2.2 personal eliminado desde los procesos de UISP; v1.4 §2.3 «Recuperar» descartados y §2.2 duración y fecha de la lectura)
**Estado:** G0 aprobado por el usuario el 2026-11-15 («Apruebo el G0»). [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md) enmendado en v1.2 (D15)
**Fecha:** 2026-11-15
**Emisor:** Claude Code, con criterio de AI-DATA-ENG
**Módulos:** plataforma (migración) · MOD04 Usuarios · MOD09 Soporte · MOD14 Facturación
**Relacionado:** [spec de importación UISP](2026-11-10-transversal-exportacion-importacion-suscriptor-uisp.md) · [spec de complemento de titular](2026-11-15-transversal-importacion-uisp-complementar-titular.md) · ADR-110 D3, D7, D9, D10

---

## 0. Problema

La importación por ZIP trae tickets, comentarios y pagos, pero UISP solo identifica a su personal por **número** (`assignedUserId`, `activity[].userId` en tickets; `userId` en pagos). Hoy todo queda a nombre de quien importa, y se pierde quién atendió cada ticket o recibió cada pago, incluido el personal que ya no trabaja en la empresa.

Hechos verificados el 2026-11-15:
- **En UISP:**
  - la lista de asignación de tickets tiene **62 usuarios** con número, nombre y grupo (Admin Group 18, Facturación 13, Técnico 27, Read-only 2, RECAUDO 2);
  - solo 11 tienen cuenta de acceso hoy;
  - los 24 números que aparecen en el ZIP del cliente 22 están entre esos 62.
- **API de UISP:** `GET /crm/api/v1.0/users/admins`, con cabecera `X-Auth-App-Key`, devuelve `id`, `unmsId`, `email`, `username`, `firstName`, `lastName`, `avatarColor` e `isActive`. **No devuelve el grupo.** La documentación no dice si incluye usuarios eliminados.
- **En iWana:** usuarios por tenant con rol (`UserRole`), estado (`UserStatus`, incluido `INACTIVE`), correo único (`uq_users_email_hash`) y la marca `is_operational_resource`, que define quién aparece en Programación.

## 1. Decisiones del usuario (2026-11-15)

| # | Decisión |
|---|---|
| U1 | **Fuente: API de UISP**, con una clave de aplicación de solo lectura creada en UISP por el usuario. |
| U2 | **Rol elegido a mano:** iWana muestra los usuarios traídos y el administrador elige el rol de cada uno (con selección múltiple). No se deduce del grupo de UISP. |
| U3 | **Invitación cuando el administrador la envíe:** ningún usuario importado tiene acceso hasta que se le invite desde la lista. |
| U4 | **Re-atribuir lo ya importado:** un paso por lote corrige autores y asignados sin reimportar. |
| U5 | Los usuarios que ya no trabajan **se importan igual**, inactivos y sin acceso, porque el historial los necesita. |

## 2. Diseño

### 2.1 Conexión con UISP

- En **Configuración → Importaciones → Usuarios de UISP**, el administrador registra la dirección de UISP y la clave de aplicación.
- La clave se guarda cifrada (clave PII del tenant), nunca se vuelve a mostrar y se puede reemplazar o retirar.
- Una sola conexión por tenant.
- Solo ADMIN con `migration.import.manage`.
- iWana solo hace `GET` y valida la conexión con `GET /crm/api/v1.0/version` antes de guardar.
- **TLS:** la instancia real usa un certificado autofirmado. Se acepta solo si el administrador marca «Confiar en este certificado», que fija su huella SHA-256; nunca se desactiva la verificación en general.

### 2.2 Traer usuarios

- Botón **«Traer usuarios de UISP»**. Un job lee `users/admins` y guarda cada usuario como fila de revisión, **por número de UISP** (repetir actualiza, nunca duplica).
- **Coincidencia:** si el correo de UISP pertenece a un usuario de iWana (por HMAC del correo), la fila propone **enlazarlo**.
- **Huecos:** los números de UISP que aparecen en las intermedias vigentes de algún lote y que la API no devolvió (usuarios eliminados) se agregan como filas «Usuario de UISP n.º 1234 (sin datos)». Se pueden crear igual, con el nombre que escriba el administrador, o dejar sin usuario.
- **Personal eliminado en los procesos (v1.3, 2026-11-26):** `users/admins` solo devuelve el personal vigente (en producción trajo 28 de unos 66). La misma lectura recorre por páginas `ticketing/tickets` (100 por página), `payments` y `scheduling/jobs` (500) y reúne los números de: asignado del ticket, autor de cada actividad, asignado en una reasignación, quien registró el pago y asignado de la tarea. Los que no están en `users/admins` entran como «sin datos» aunque no haya lotes. Solo se guardan números; nada del contenido. Un proceso que UISP no entrega (4xx, respuesta que no es lista) queda «sin leer» y la lectura sigue; red, tiempo agotado, 5xx o clave rechazada hacen fallar o reintentar el job sin escribir. Tope de 400 páginas por proceso. Una fila «sin datos» pendiente que vuelve a aparecer renueva su fecha de lectura, así la purga de 30 días no se la lleva mientras siga en UISP. La auditoría (`lectura: USERS_ADMINS_Y_PROCESOS`) guarda los conteos por proceso. **v1.4:** con unos 165 000 elementos la lectura tarda de 2 a 5 minutos; el portal sondea hasta 10. La lectura renueva también la fecha de las filas ya resueltas que vuelve a ver (sin tocar estado ni datos), para que «Última lectura» sea la real.

### 2.3 Revisar y elegir el rol

Lista con:
- nombre;
- correo, enmascarado salvo para el administrador;
- activo o inactivo en UISP;
- coincidencia en iWana;
- rol elegido.

Admite **selección múltiple** para asignar un rol a varios a la vez.

Acciones por fila o en lote:

| Acción | Resultado |
|---|---|
| **Enlazar** (hay coincidencia) | Se vincula el número de UISP con ese usuario de iWana. No se le cambia nada. |
| **Enlazar con…** (elección manual, v1.2) | Para filas «sin datos» o sin coincidencia por correo: el administrador elige un usuario existente del personal (nunca SUBSCRIBER, PARTNER ni INVESTOR). Se vincula igual y no se le cambia nada. Varias filas pueden enlazar con la misma persona. |
| **Crear** (activo en UISP) | Usuario con el rol elegido, estado `PENDING_VERIFICATION`, contraseña inutilizable, sin invitación. `is_operational_resource` según el rol (como en el alta manual), editable antes de crear. |
| **Crear** (inactivo en UISP o sin datos) | Usuario `INACTIVE`, contraseña inutilizable, `is_operational_resource = false` siempre. Nunca aparece en Programación ni puede entrar. |
| **Descartar** | Sin usuario; el historial de ese número queda a nombre de quien importa y el informe lo cuenta. |
| **Recuperar** (v1.4, solo descartados) | La fila vuelve a pendiente, sin nombre ni correo; el portal lanza enseguida «Traer usuarios», que se los devuelve a las de la API. Enlazados y creados no se reabren. Auditoría `accion: RECUPERAR` con ids y conteos. Después de enlazar o crear, «Actualizar autores» del lote corrige lo ya importado (§2.7). No renueva la fecha de lectura: si la purga de 30 días (§4) se lleva una fila recuperada antes de releer, la siguiente lectura la vuelve a crear pendiente (no tiene PII ni equivalencia que perder). |

- **Correo:** si UISP no trae correo o el correo ya está tomado por otro usuario (que no es coincidencia), se usa `uisp-<id>@importado.invalid`. Nunca recibe mensajes, y el dominio `.invalid` lo bloquea el mailer.
- **Rol obligatorio** para crear. No se permite `SUBSCRIBER` ni roles externos (`PARTNER`, `INVESTOR`).

### 2.4 Invitar

- En la misma lista, **«Enviar invitación»** (por fila o en lote) solo para usuarios creados desde UISP en `PENDING_VERIFICATION` y con correo real.
- Envía el correo **«Te invitaron a iWana»** (`user-invitation.template.ts`) con un enlace para **crear la contraseña**: `${PORTAL_URL}/auth/reset-password?tenant=<empresa>&token=<token>&origen=invitacion`. El token es de un solo uso, se guarda solo su hash y vence a los **7 días**. La empresa sale del contexto verificado, nunca de la petición.
- Al crear la contraseña, un usuario en `PENDING_VERIFICATION` queda `ACTIVE` y con el correo verificado. `INACTIVE` y `SUSPENDED` nunca se activan por esta vía.
- (v1.0 decía reutilizar el correo de verificación del alta manual; se descartó porque dejaba la cuenta sin contraseña utilizable.)
- Reenviar es posible y anula el enlace anterior. Un usuario `INACTIVE` no se invita: primero se reactiva por el flujo normal de Usuarios.

### 2.5 Vínculo número de UISP → usuario

- Nueva equivalencia `USUARIO` en `migration_mappings`: `external_value` = número de UISP y `target_ref` = id del usuario de iWana. Solo admite `EQUIVALE`.
- La crean «Enlazar» y «Crear». Persiste entre lotes y **no guarda PII**: `external_label` siempre es `NULL`.
- La fila de revisión con nombre y correo se purga cuando el usuario se enlaza, se crea o se descarta. Lo que dura es la equivalencia.

### 2.6 Atribución al promover

Al promover un lote, con la equivalencia `USUARIO`:

| Dato de UISP | Destino en iWana |
|---|---|
| `tickets[].assignedUserId` | `support_tickets.assigned_user_id` |
| `tickets[].activity[].userId` (comentario) | `ticket_comments.author_user_id` |
| primer comentario del ticket | `support_tickets.created_by_user_id` (sin comentarios: quien importa) |
| `payments[].userId` | `billing_payments.created_by` |

- Un número sin equivalencia, o con una que apunta a un usuario borrado, queda como hoy: a nombre de quien importa.
- El informe del lote cuenta **«Usuarios de UISP sin enlazar: N»**, sin nombres.
- Nada de esto cambia permisos ni dispara notificaciones: asignar un ticket importado no avisa al usuario.

### 2.7 Re-atribuir lo ya importado

- Botón por lote, **«Actualizar autores»**, en lotes `PROMOVIDO` o `CONCILIADO` cuyas intermedias no se hayan purgado (D10: 30 días).
- Recorre las intermedias promovidas del lote (con `promoted_entity_id`) y, por los puertos de Soporte y Facturación, actualiza asignado, autor y registrador. **Solo cambia filas cuyo valor actual sigue siendo quien importó**; si alguien lo cambió después, lo respeta y lo cuenta.
- Es idempotente: repetirlo no cambia nada nuevo. Queda auditado con conteos, sin PII.
- Con las intermedias purgadas el botón no aparece y el informe explica por qué.

### 2.8 Reversión (D7)

- Revertir un lote no borra usuarios: son configuración del tenant, como las equivalencias.
- Las filas importadas que se retiran se llevan su atribución.
- Un usuario creado desde UISP se gestiona después como cualquier otro, desde Usuarios.

## 3. Cambios por capa

| Capa | Cambio |
|---|---|
| Contrato (`packages/shared`) | kind `USUARIO`; esquemas de conexión (sin la clave en respuestas), fila de revisión, acciones y resultados; observación `USUARIO_UISP_SIN_ENLAZAR`; códigos `MIGRATION_SOURCE_UNREACHABLE`, `MIGRATION_SOURCE_UNAUTHORIZED`, `MIGRATION_USER_ROLE_NOT_ALLOWED`. |
| Base de datos (tenant) | `migration_source_connections`: URL, clave cifrada, huella TLS, actor y fechas. `migration_uisp_users`: número de UISP, nombre, `email_encrypted` + `email_hash`, activo, estado de revisión, rol propuesto; las columnas PII se vacían al resolver la fila. `chk_migration_mappings_kind` admite `USUARIO`. Manifiesto de supresión e inventario K2 para las columnas cifradas. |
| API migración | Conexión (guardar, probar, retirar); job de lectura (BullMQ, payload solo con ids); lista de revisión; enlazar, crear, descartar e invitar en lote; atribución en la promoción; «Actualizar autores». |
| Puertos | Usuarios: crear usuario importado e invitar, reusando la validación del alta. Soporte y Facturación: atribuir y re-atribuir filas importadas. Sin SQL de la migración sobre tablas ajenas. |
| Worker | Cliente HTTP de UISP con tiempo de espera, reintentos acotados, huella TLS fijada y sin registrar la clave ni datos personales. |
| Portal | Sección «Usuarios de UISP»: conexión, traer, lista de revisión con selección múltiple, invitar; botón «Actualizar autores» en el lote; conteo de no enlazados en el informe. |
| Documentación | Enmienda de ADR-110 (D15: conector de lectura por API para usuarios); runbook breve para crear la clave de aplicación en UISP. |

## 4. Seguridad y privacidad

- La clave de UISP se cifra en reposo, nunca sale en respuestas ni en logs y solo se usa para `GET`.
- Ningún usuario importado puede entrar hasta que se le invite. Los inactivos nunca pueden.
- Los correos se guardan como en Usuarios (cifrado + HMAC); en la revisión se muestran enmascarados.
- Sin PII en `migration_mappings`, `counts`, payloads de cola ni auditoría (solo ids, conteos y nombres de campo).
- Crear o enlazar usuarios exige ADMIN con `migration.import.manage` y queda auditado en la misma transacción.
- Personal que ya no trabaja: sus datos (nombre y correo) se tratan como datos personales de empleados; entran en el inventario de supresión.

## 5. Criterios de aceptación

1. Con una clave válida, «Traer usuarios» crea una fila de revisión por cada usuario de la API, sin duplicar al repetir.
2. Un usuario de UISP con el correo de un usuario de iWana se propone para enlazar y, al enlazarlo, ese usuario no cambia.
3. «Crear» deja a los activos en `PENDING_VERIFICATION` sin invitación y a los inactivos en `INACTIVE`, sin acceso y fuera de Programación.
4. «Enviar invitación» manda el correo de activación solo a los elegidos; un `INACTIVE` o un correo `.invalid` no reciben nada.
5. Al promover un lote, tickets, comentarios y pagos llevan el usuario enlazado; los números sin enlazar quedan como hoy y el informe los cuenta.
6. «Actualizar autores» en el lote de Alexander corrige lo importado sin reimportar, respeta lo que alguien cambió después y repetirlo no cambia nada.
7. Un número de UISP que aparece en un lote pero no en la API se muestra como «sin datos» y se puede crear, enlazar o descartar.
8. La clave de UISP no aparece en ninguna respuesta, log ni auditoría.
9. Revertir un lote no borra usuarios.

## 6. Pruebas

- Unitarias: mapeo de la respuesta de la API, coincidencia por correo, reglas de creación por estado, atribución en la promoción y re-atribución que respeta cambios posteriores.
- Integración contra Postgres (`DB_NAME=test`): conexión cifrada; traer con un servidor UISP falso (incluye un usuario inactivo y un número «sin datos»); crear y enlazar; promover con atribución; «Actualizar autores» idempotente.
- Cliente HTTP: tiempo de espera, 401, certificado con huella distinta (rechazo).
- Portal: lista de revisión, selección múltiple de rol, invitar, botón por lote.
- E2E con el aprovisionador y un UISP falso: conectar, traer, crear, promover un ZIP sintético y ver los autores en la ficha.

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| La API no devuelve usuarios eliminados | Filas «sin datos» a partir de los números de los lotes y de los tickets, pagos y tareas de UISP (§2.2) |
| Invitar por error a quien no corresponde | Sin invitación automática (U3); solo a elegidos y con correo real |
| Exponer la clave de UISP | Cifrada, nunca devuelta, solo `GET`, retirable |
| Certificado autofirmado | Huella fijada explícitamente por el administrador; nunca verificación desactivada |
| Re-atribuir pisa cambios manuales | Solo cambia filas que siguen a nombre de quien importó (§2.7) |
| Técnicos inactivos en Programación | `is_operational_resource = false` forzado para inactivos |

## 8. Fuera de alcance

- Importar el grupo de UISP o sus permisos.
- Clientes como usuarios del portal de suscriptor.
- Sincronización periódica automática.
- Importar clientes por API (sigue el ZIP).

## 9. Gobierno

- **Enmienda de ADR-110 (D15):** «Conector de lectura por API de UISP, por tenant y con clave cifrada, para traer usuarios del personal; el rol se elige en iWana y ningún usuario importado tiene acceso sin invitación». Se actualiza §3, que dejaba el conector para una fase siguiente.
- Tras el G0: plan de orquestación con matriz agente × skill y launcher.
