# INFORME-MOD13 — Revisión de seguridad de la implementación

**Versión:** 1.0
**Fecha:** 2026-10-22
**Estado:** Revisión estática; G5 de seguridad no cerrado
**Emisor:** AI-SEC-ENG
**Modo:** Solo lectura
**Alcance:** MOD13 contra HLD v1.1 y el informe de diseño S0: comandos de aprovisionamiento, evento firmado, auditoría, inbox, persistencia multi-tenant, configuración del pipeline y cambios de portal F2 relacionados.

## Dictamen

Se revisó el código y configuración versionados, sin ejecutar pruebas ni hacer peticiones al API. No se inspeccionaron secretos locales ni se imprimieron valores de credenciales.

| Severidad | Hallazgos |
| --- | ---: |
| P0 | 0 |
| P1 | 1 |
| P2 | 0 |
| P3 | 2 |

El P2 del pipeline de S0 queda **verificado en configuración estática**: hay throttling y CSRF globales, límite específico de MOD13, validación estricta, JWT RS256 y resolución de tenant desde claims. La verificación de comportamiento desplegado, handshake TLS, ownership en HTTP y límites efectivos queda para V1, según el prompt. G5 sigue abierto por SEC-IMPL-01 (P1).

## Hallazgos

### [SEC-REVIEW] SEC-IMPL-01 — El reemplazo durante `regularize` no audita la fila previa

**Archivo:** `apps/api/src/modules/network/service-provisioning.service.ts:443` (llamada); `apps/api/src/modules/network/service-provisioning.service.ts:891` (mutación); `apps/api/src/modules/network/service-provisioning.service.ts:541` (única auditoría de regularización).
**Severidad:** P1 — una mutación sensible de estado carece de una entrada de auditoría atribuible.
**OWASP ASVS:** registro de eventos de seguridad y trazabilidad de transacciones sensibles.
**Referencia:** regla común 7 del prompt; HLD v1.1 §6.2, §6.8.

**Evidencia:** cuando `regularize` encuentra una fila `FAILED` cuya asignación no se puede reutilizar, invoca `releaseExistingWithin` y continúa creando una fila nueva (`service-provisioning.service.ts:443–446`). El helper libera la asignación y cambia la fila anterior a `RELEASED`, fija actor y motivo, pero no llama `logWithin` (`:873–896`). Después, la única llamada de auditoría del flujo registra `REGULARIZE` sobre la fila guardada al final y solo incluye OT, IP/router nuevos y motivo (`:541–558`); no identifica la fila previa ni su IP/estado liberado. En la rama de reutilización, además, el mismo registro usa `AuditAction.CREATE` sobre una fila existente que se actualiza desde `FAILED` (`:477–516`, `:541–559`).

**Riesgo:** el historial no permite reconstruir ni atribuir de forma completa la liberación del aprovisionamiento anterior que acompaña a la regularización. El registro final de la operación no sustituye el audit trail de la fila modificada.

**Acción requerida:** el backend debe auditar cada fila/asignación mutada dentro de la misma transacción y con el `manager` compartido. Si la lista cerrada del HLD no permite identificar la operación de reemplazo en `regularize`, escalar la discrepancia para re-sync del contrato antes de ampliar los campos auditados. No se debe introducir un campo fuera de la allowlist por inferencia.

### [SEC-REVIEW] SEC-IMPL-02 — Lectura del actor sin predicado explícito `tenantId`

**Archivo:** `apps/api/src/modules/network/ports/network-actor-read.adapter.ts:18–22`.
**Severidad:** P3 — defensa en profundidad multi-tenant.
**OWASP ASVS:** aislamiento de datos entre tenants.
**Referencia:** regla común 4 del prompt; `AGENTS.md`, Architecture Rules.

**Evidencia:** la búsqueda de `User` filtra por los UUID solicitados, pero no añade `tenantId`. Se ejecuta con `runInTenantSchema(schemaName, ...)`, lo que limita la consulta al schema recibido. El método también busca `PlatformUser` globalmente para los UUID no encontrados (`:25–31`), como espera el adaptador de actores.

**Riesgo residual:** no observé una ruta de petición que permita elegir el schema: los callers usan el `schemaName` del contexto autenticado. El aislamiento por schema reduce el riesgo actual; la consulta a `User` no conserva, sin embargo, el predicado explícito exigido por la regla de tenant y queda más expuesta a errores de wiring o reutilización futura del puerto.

**Acción recomendada:** propagar el `tenantId` autenticado al adaptador y añadirlo al filtro de `User`; mantener la búsqueda de `PlatformUser` separada por su ámbito global.

### [SEC-REVIEW] SEC-IMPL-03 — Auditoría de alta de router omite campos opcionales modificados

**Archivo:** `apps/api/src/modules/network/network-catalog.service.ts:144–149`; DTO en `apps/api/src/modules/network/dto/network-catalog.dto.ts:74–88`.
**Severidad:** P3 — trazabilidad parcial de catálogo.
**OWASP ASVS:** registro de cambios administrativos.
**Referencia:** HLD v1.1 §6.8.

**Evidencia:** `CreateRouterDto` admite `organizationSiteId`, `commercialNodeId` y `notes`; el alta los persiste (`network-catalog.service.ts:127–130`), pero la auditoría inicial fija `changedFields` solo en `name`, `managementHost`, `lanInterface` y `supportedControlMethods` (`:144–149`). La entrada no refleja si esos tres campos opcionales se enviaron.

**Riesgo:** queda incompleta la explicación auditable de la configuración que se creó. No se registran los valores de esos campos, lo que evita una exposición adicional en el log, pero tampoco consta si se asignaron.

**Acción recomendada:** incluir los nombres de los campos opcionales presentes en `changedFields`, sin añadir valores que excedan la allowlist de HLD §6.8.

## Evidencia del pipeline de seguridad (P2 de S0)

| Control | Evidencia estática | Resultado y límite |
| --- | --- | --- |
| Throttling global | `apps/api/src/app.module.ts:155–164` configura bucket global de 100 solicitudes/60 s; `:255–258` registra `CsrfGuard` y `ThrottlerGuard` como `APP_GUARD`. | Configurado para el API. No se midió en una instancia desplegada. |
| CSRF | `apps/api/src/main.ts:91–92` instala `cookie-parser`; `apps/api/src/modules/auth/guards/csrf.guard.ts:36–70` exige `X-Requested-With` en mutaciones autenticadas por cookie y deja pasar métodos de lectura, rutas públicas y Bearer. | Guard global funcional por código; no se ejecutó una petición HTTP en V2. |
| Límite por actor en comandos | `apps/api/src/modules/network/network-provisioning.controller.ts:59–65` aplica `TenantAwareThrottlerGuard` al controlador; `apps/api/src/modules/tasks/guards/tenant-aware-throttler.guard.ts:25–35` fija 30/min para `network-provisioning-command`, `:76–113` falla cerrado si Redis no responde y `:145–172` deriva actor/tenant del JWT y reconoce la ruta. | `reserve`, `certify`, `release` y `regularize` son POST en el controlador (`network-provisioning.controller.ts:69–127`). La configuración estática coincide con HLD §6.9; el contador efectivo en Redis queda sin prueba runtime. |
| TLS | `nginx/nginx.prod.conf:43–65` redirige HTTP a HTTPS y configura el vhost API con TLS 1.3; `:101–115` enruta `/api/` al upstream. | Es configuración de producción, no evidencia de handshake o despliegue. El proxy de desarrollo expone HTTP (`docker-compose.yml:276–284`). La comprobación operativa queda para V1. |
| JWT | `apps/api/src/modules/auth/auth.module.ts:41–59` configura RS256 y emisores/audiencias aceptados. `jwt.strategy.ts:44–50` fija `ignoreExpiration: false`, `algorithms: ['RS256']`, `issuer` y `audience`; `:82–89` comprueba que `type` corresponda al par `iss`/`aud`. `auth.service.ts:1378–1398` emite token tenant con `tenantId`, `schemaName`, `type`, `exp`, `iss` y `aud`. | Los claims requeridos están implementados. Su aceptación por una instancia real queda para V1. |
| Tenant desde JWT | `apps/api/src/modules/tenant/tenant.middleware.ts:68–87` verifica el JWT, resuelve el tenant por `tenantId` y comprueba que su `schemaName` coincide con el claim. `network/guards/network-tenant.guard.ts:8–26` exige que `TenantContext` coincida con ambos claims. | El header de tenant no sustituye los claims en una petición autenticada. |
| RBAC y ownership | Los controladores MOD13 combinan `JwtAuthGuard`, `NetworkTenantGuard`, `RolesGuard` y `PermissionsGuard`; por ejemplo, `network-provisioning.controller.ts:59–65`, `:69–72` y `:82–94`. `service-provisioning.service.ts:591–603` autoriza el contexto técnico solo al técnico asignado o a quien tenga permiso de aprovisionamiento. Maker-checker se comprueba en `:83–85`, `:252–256` y `:383–388`; liberar `CERTIFIED` verifica permiso de certificar en `:307–312`. | RBAC y la regla de ownership del contexto están en código. No se encontró `AbacGuard` aplicado a estos controladores; el control de ownership específico está en el servicio. V1 debe cubrir las respuestas HTTP reales. |
| Validación y límites | `main.ts:43–44` instala `createGlobalValidationPipe`; `common/pipes/global-validation.pipe.ts:4–10` configura `whitelist`, `forbidNonWhitelisted` y `transform`. Los cuerpos de aprovisionamiento pasan por `ZodValidationPipe` (`network-provisioning.controller.ts:75–76`, `:90–92`, `:103–106`, `:121–124`) y los esquemas del inbox son `.strict()` con `limit.max(100)` (`:47–53`). `network-catalog.dto.ts:237–265` valida paginación y `@Max(100)`. Todos los `@Param` UUID de ambos controladores MOD13 usan `ParseUUIDPipe` (`network-catalog.controller.ts:160,174,188,228,242,256,278`; `network-provisioning.controller.ts:104,122,150,159`). | Confirmado estáticamente; no se enviaron cuerpos o parámetros inválidos en runtime. |
| Auditoría | Los comandos y mutaciones de catálogo usan `AuditService.logWithin` con el manager transaccional; ejemplos: `network-catalog.service.ts:136–153`, `:211–229`, `:357–374`, `:454–466`, `:557–568`, `:616–630`; provisioning: `service-provisioning.service.ts:211–230`, `:273–289`, `:342–359`, `:541–558`. | La atomicidad del patrón está presente en los caminos revisados, con la excepción concreta SEC-IMPL-01. No se ejecutó un fallo de auditoría en V2. |

## Verificación de controles MOD13

- **Maker-checker/R6:** `reserve` falla si no hay técnico asignado; `certify` y `regularize` además rechazan al técnico como certificador/regularizador. Evidencia: `service-provisioning.service.ts:81–85`, `:249–256`, `:369–388`.
- **R6 bis:** liberar un servicio `CERTIFIED` requiere `NETWORK_PROVISIONING_CERTIFY` además del permiso de entrada al endpoint (`:304–312`).
- **Regularización/R12:** valida instalación cerrada y ejecutada, técnico distinto, toma `pg_advisory_xact_lock` por OT y controla `ACTIVE`/`FAILED` (`:370–405`, `:407–445`). La rama de reemplazo tiene el hueco de auditoría SEC-IMPL-01.
- **HMAC:** el worker crea el evento desde el esquema y firma con HMAC-SHA256 (`apps/worker/src/processors/execution-order-events.processor.ts:555–584`). El consumidor verifica HMAC con `timingSafeEqual` antes de `SignedNetworkExecutionEventSchema.parse` y `NetworkExecutionEventSchema.parse` (`apps/api/src/modules/network/network-execution-event.processor.ts:111–150`, `:169–176`).
- **Proyección técnica:** se construye desde cero con los cinco campos de HLD v1.1 §4.4; no deriva del DTO completo (`service-provisioning.service.ts:606–615`).
- **Errores del inbox:** `last_error_code` recibe códigos tipados y permitidos, no `error.message` (`network-execution-event.processor.ts:492–510`, `:530–548`). El log de reintento usa código/evento/tenant sin mensaje crudo ni payload (`:254–263`). El productor worker registra tipo de error e identificadores saneados, no la excepción completa (`apps/worker/src/processors/execution-order-events.processor.ts:518–521`).
- **PII y secretos:** en los paths de log examinados no se encontraron payloads, IP junto a nombre/documento/teléfono, tokens ni valores de claves. En componentes F2 y `networkApi` no se encontraron `dangerouslySetInnerHTML` ni llamadas `console.*`; las solicitudes usan el wrapper existente de `api-client.ts:863–987`. Esto es revisión estática, no análisis de logs en producción.
- **Filtros tenant:** IPAM y consultas de provisioning/catalogo observadas combinan `runInTenantSchema` y `tenantId` (por ejemplo, `ipam.service.ts:65–71`, `:136–151`, `:185–208`; `service-provisioning.service.ts:101–110`, `:858–860`). SEC-IMPL-02 registra la excepción en la búsqueda de actores.

## Riesgo residual y ejecución

No ejecuté Jest, Supertest, llamadas HTTP, Redis, PostgreSQL, inspección de logs runtime ni handshake TLS. Por eso no afirmo resultados de pruebas ni comportamiento de despliegue. V1 debe verificar, contra el entorno de prueba, autenticación con claims válidos e inválidos, coincidencia tenant/schema, ownership del técnico, tasa efectiva por actor y respuestas con los cinco campos exactos. La configuración de TLS solo se verificó en el archivo de Nginx de producción.

**Condición de cierre:** corregir SEC-IMPL-01 y solicitar verificación de nuevo. SEC-IMPL-02 y SEC-IMPL-03 son P3 y no bloquean entrega según el baseline del perfil; deben quedar registrados para corrección. No se detectó vulnerabilidad crítica confirmada ni se requiere excepción de seguridad.
