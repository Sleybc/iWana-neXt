# INFORME-MOD13 — Revisión de seguridad de diseño · Interfaces, direcciones locales y registro IPv4 (O1-S)

**Versión:** 1.0
**Estado:** Superado por [INFORME-MOD13-INTERFACES-SEGURIDAD-v1.1](INFORME-MOD13-INTERFACES-SEGURIDAD-v1.1.md); conservar como registro histórico de la revisión contra API v1.0.
**Fecha:** 2026-10-26
**Emisor:** AI-SEC-ENG (Security Engineer / AppSec), solo lectura
**Encargo:** O1-S, revisión de seguridad a nivel de diseño antes de G4
**Entradas revisadas:** PRD addendum v1.0 · HLD addendum v1.0 (§4, §5, §5.5, §5.6, §6, §9) · spec de modelo v1.1 (§3, §4, §6, §7, §7.1, §9, §12) · ADR-101 (Propuesto) · spec UX v1.1 (§5, §6, §7, §9, §13) · spec de API (ver §1, versión en disco 1.0)
**Código contrastado (solo lectura):** `apps/api/src/modules/network/**`, `apps/api/src/modules/access-control/**`, `apps/api/src/modules/audit/**`, `apps/api/src/modules/auth/**`, `apps/api/src/modules/tenant/tenant.middleware.ts`, `packages/shared/src/contracts/network/**`, `packages/database/src/migrations/tenant/160_*`, `161_*`, `162_*`, `packages/database/src/data-source.ts`
**Skills aplicadas:** `security-auditor` y `backend-security-coder` (obligatorias); `frontend-security-coder` (apoyo, porque la UI expone datos de catálogo). `auth-implementation-patterns` descartada: no se rediseña auth.

**Alcance de la revisión:** lectura estática de documentos y código. No se ejecutaron pruebas, migraciones, comandos `pnpm`, dev servers ni consultas a bases de datos. Las afirmaciones de PostgreSQL y de terceros marcadas como supuesto requieren verificación en G1 con fuente oficial.

---

## 0. Veredicto

**APTO CON CONDICIONES.** No emito G4.

- El diseño es sólido en aislamiento por tenant (schema con `SET LOCAL` por transacción, FK compuestas, referencias validadas por puerto del dueño), en el orden de locks L0 a L3 y en la invariante I-1 (ninguna IP local coexiste con una asignación viva del mismo host).
- No hay hallazgos **Críticos**. No se detecta fuga entre tenants ni acceso sin autenticación.
- Hay **ocho bloqueantes de G4** (§4). Son cambios de contrato y de decisiones documentales, no cambios de alcance. La opción B queda intacta.
- Hay cuatro hallazgos **Altos**. Dos bloquean G4: contrato de corrección de host (SEC-M13-03) y notas en auditoría (SEC-M13-02). Uno bloquea producción y G6, no G4: rollback que puede liberar protección (SEC-M13-04). El cuarto es transversal de plataforma: alcance de permisos por sede tomado del cliente (SEC-M13-01); en MOD13 se cierra con la condición B8.

**Bloqueantes de G4 (resumen):**

1. Un único contrato de corrección de host/prefijo (`correct`) con guardas (a) a (g) completas y motivo enumerado (SEC-M13-03, SEC-M13-08).
2. Auditoría sin `notes` y con forma de `newValue` cerrada por entidad (SEC-M13-02, DC-11).
3. Respuesta uniforme ante referencias ajenas e inexistentes, con precedencia «pertenencia antes que estado» (SEC-M13-05, DC-13).
4. Un validador por ruta, con paridad probada, y DC-17 implementado en servicio (SEC-M13-06).
5. Encargo de implementación con H-1 a H-8 y las brechas de locks de SEC-M13-10 (A-1).
6. ADR-101 (propuesto) aprobado por el CTO (DC-15 no es congelable sin ella; D-8).
7. API v1.1 publicada, con nombres de código y campos unificados (SEC-M13-12).
8. Decisión de no asignar alcance por sede desde body o query en las rutas MOD13 (SEC-M13-01, condición de contrato, no de plataforma).

---

## 1. Estado de la API (aviso obligatorio)

- `docs/specs/2026-10-26-mod13-interfaces-api.md` declara **Versión 1.0** en su cabecera y estado «En revisión — contrato documental preliminar, no congelado ni implementado». **No existe una v1.1 en disco.**
- El HLD (§4 y §11), el modelo (§12.5, A-2) y el encargo citan «API v1.1». Esa versión no está publicada.
- **Conclusión:** el contrato **no es estable**. Esta revisión se hace sobre el contenido de v1.0. Debe repetirse cuando se publique v1.1, porque varias conclusiones dependen de su texto (§3, SEC-M13-03 y SEC-M13-12).

---

## 2. Respuestas a las siete preguntas del encargo

### 2.1 Tenancy

**Diseño.** Cada ID nuevo (router, interfaz, dirección, red, sede, nodo comercial) se valida por tenant y por router. Las FK compuestas `(tenant_id, router_id, interface_id)` son `RESTRICT` (modelo §4). La API declara que ajenos e inexistentes producen el mismo resultado (API §2). **Cumple.**

**Código actual.**

- Las lecturas por ID filtran por tenant además del schema: `network-catalog.service.ts:179`, `:259`, `:341-343`, `:398`, `:487`; `service-provisioning.service.ts:106-111`, `:463-468`.
- El aislamiento por schema se fija con `SET LOCAL search_path` por transacción y el nombre se valida antes de interpolarlo (`packages/database/src/data-source.ts:203`, `:212`).
- El tenant procede del JWT verificado. Con sesión autenticada, la cabecera `X-Tenant-Slug` no sustituye el contexto (`apps/api/src/modules/tenant/tenant.middleware.ts:72-79`, `:96-118`).

**Brechas.**

- `ipv4_networks.router_id` tiene FK simple a `network_routers(id)` (`160_network_catalog.ts:45`), sin tenant. La FK nueva de `interface_id` debe ser compuesta, como exige el modelo §4. La FK compuesta a router también debe añadirse (SEC-M13-14, Baja).
- No encontré lecturas de tablas de otro módulo en el código de MOD13. Los procesadores consultan `public.tenants` para resolver el tenant de un job (`network-provisioning-reconciler.processor.ts:91`, `:166`; `network-execution-event.processor.ts:272`). Es el registro de plataforma, no datos de otro módulo. Se debe mantener la prohibición de leer `commercial_nodes` (D-6).

### 2.2 Autorización

**Estado actual.** Las 14 rutas del catálogo tienen la cadena `JwtAuthGuard`, `NetworkTenantGuard`, `RolesGuard`, `PermissionsGuard` (`network-catalog.controller.ts:115`), además de `@Roles(UserRole.ADMIN, UserRole.NOC)` y `@Permissions(NETWORK_CATALOG_READ | NETWORK_CATALOG_MANAGE)` en cada método (por ejemplo `:120-122`, `:135-137`, `:153-155`). Las rutas de aprovisionamiento aplican el mismo patrón con `NETWORK_PROVISIONING_*` (`network-provisioning.controller.ts:59-65`, `:69-153`). **No encontré lecturas sin guard.**

**D-5 (sin roles ni permisos nuevos).** Acepto la decisión **con tres condiciones**:

1. La autorización efectiva es rol **y** permiso. `RolesGuard` exige `user.role` dentro de la lista (`apps/api/src/modules/auth/guards/roles.guard.ts:55`). Por tanto, «persona con lectura de catálogo» solo funciona para ADMIN o NOC. La matriz por ruta debe escribirse en el contrato.
2. El alcance por sede no puede derivarse de body ni de query en las rutas MOD13 (SEC-M13-01).
3. Las rutas nuevas con `:routerId` no llevan `siteId`. `PermissionsGuard` queda entonces con alcance vacío y solo cuentan los perfiles globales (`effective-permissions.service.ts:133-139`). Es un comportamiento seguro (cierra por defecto), pero debe documentarse porque un operador con perfil de sede no verá las rutas nuevas.

**SEC-M13-01 (Alta en plataforma; Media en MOD13).** `PermissionsGuard.resolveScopedSiteId` toma `siteId` u `organizationSiteId` del body y de la query (`apps/api/src/modules/access-control/guards/permissions.guard.ts:71-78`) y lo usa como alcance de permisos (`:44`). Los perfiles con `scopeSiteId` se incluyen cuando coinciden (`apps/api/src/modules/access-control/services/effective-permissions.service.ts:133-139`). El cliente elige el alcance, así que la restricción por sede se convierte en concesión. Afecta a `POST /network/routers` (`network-catalog.controller.ts:135-137`) y a `PATCH /network/routers/:id` (`:153-155`), porque ambos aceptan `organizationSiteId` en el body (`network-catalog.service.ts:126-129`, `:174-202`). La exposición en MOD13 es Media con la configuración estándar, porque la plantilla «Acceso estándar NOC» ya concede todos los permisos de red de forma global (`packages/database/src/migrations/tenant/162_seed_network_permissions.ts:126-129`). Se vuelve Alta cuando un perfil personalizado restringe a un operador a una sede (`access-control.service.ts:237` permite crear perfiles con `scopeSiteId`).

### 2.3 Transacciones y locks

**Lo que está bien en el diseño.**

- Orden L0 < L1 < L2 < L3 explícito (modelo §7), con L2 por UUID ascendente y L3 en orden fijo de tablas.
- Las reservas revalidan router, interfaz y red con `FOR SHARE` bajo L2 (DC-05).
- La invariante I-1 queda protegida en ambos lados: la alta de IP local y la reserva toman el mismo L2 del pool que contiene el host, y el pool es único por tenant gracias al `EXCLUDE` GiST (`160_network_catalog.ts:75-77`). No veo una carrera que cruce las dos tablas sin serialización (modelo §7, tabla de carreras).
- No veo ciclo de espera entre las rutas nuevas tal como las describe el diseño: todas adquieren L0 y L2 antes de filas, y la reserva no pide L0.
- Auditoría y mutación comparten transacción (`network-catalog.service.ts:136-160`, `:220-236`, `:365-381`; `service-provisioning.service.ts:218-237`). `runInTenantSchema` revierte en error (`data-source.ts:216-218`).

**Cobertura de H-1 a H-8 en el diseño.**

| Hallazgo | Estado en el diseño | Brecha que queda |
| --- | --- | --- |
| H-1 `reserve` sin lock sobre router y red (`service-provisioning.service.ts:106-111`) | Cubierto (DC-05, modelo §7 paso 3) | Aplicar también a `regularize` (`:463-468`) y al replay de `reserve` (`:146-160`), que devuelve la reserva existente y repite la instrucción al router sin bloqueo sobre router y red, y sin comprobar la interfaz (SEC-M13-10 a) |
| H-2 `updateIpv4Network` toma `FOR UPDATE` antes que L0/L2 (`network-catalog.service.ts:397-400`) | Cubierto (modelo §7.1) | Sin reordenar, hay deadlock real entre reserva (L2 y luego `FOR SHARE` de la red) y edición (`FOR UPDATE` de la red y luego L2). Riesgo de disponibilidad (40P01) |
| H-3 `createIpv4Network` sin L0 (`:337-348`) | Cubierto (modelo §7 paso 1) | Falta `FOR SHARE` del router bajo L0 en la alta de red (`:341-343`), porque un router puede desactivarse entre la lectura y el insert (SEC-M13-10 e) |
| H-4 inactivación de router y de red solo con bloqueo de fila (`:258-260`, `:486-489`) | Cubierto para interfaz (modelo §7 paso 2) | **No define el conjunto de pools** al inactivar un router. Debe ser todas las redes del router, por UUID ascendente (SEC-M13-10 b) |
| H-5 `release`/`certify` sin L1; escrituras de `ip_assignments` sin L2 (`service-provisioning.service.ts:244-300`, `:302-330`; consumidor `network-execution-event.processor.ts:347`; reconciliador `network-provisioning-reconciler.processor.ts:201`) | Cubierto (modelo §7.1) | Sin brecha de diseño. Verificar en implementación que el consumidor y el reconciliador toman L2 además de L1 |
| H-6 insert de servicio antes de L2 (`service-provisioning.service.ts:196-197`) | Cubierto | El modelo afirma «las reservas toman solo L2», pero la reserva toma L1 primero (`:103-105`). Corregir el texto (SEC-M13-10 c) |
| H-7 exclusiones sin pertenencia al bloque (`network-catalog.service.ts:651-681`; `160_network_catalog.ts:51`) | Cubierto (DC-17, CHECK `NOT VALID`) | El CHECK no cubre máscara por elemento ni normalización (SEC-M13-06, SEC-M13-07) |
| H-8 sede y cobertura sin validar dueño (`network-catalog.service.ts:126-129`, `:174-202`) | Cubierto (§5.5 y puerto del dueño) | La precedencia de errores debe fijarse (SEC-M13-05) |

**Brechas de locks no recogidas en §7 ni en §7.1 (SEC-M13-10):**

- (a) Replay de reserva (`service-provisioning.service.ts:146-160`): devuelve la reserva existente sin bloqueo sobre router y red, y sin comprobar la interfaz. El diseño debe definir si un replay sobre interfaz inactiva se permite (la reserva ya existe) o se rechaza.
- (b) Conjunto de pools al inactivar un router sin definir.
- (c) El modelo dice «las reservas toman solo L2» (§7, «Las reservas conservan el lock de un solo pool»), pero la reserva toma L1 de la OT antes (`service-provisioning.service.ts:103-105`).
- (d) La asociación red-interfaz debe declarar explícitamente L2 de la red afectada, no solo L0.
- (e) La alta de red sin `FOR SHARE` del router bajo L0 (`network-catalog.service.ts:341-343`).

**Rollback que libera protección IPAM (D-7).** Sí, hay caminos. Ver SEC-M13-04. La liberación de asignaciones de servicio (ADR-098 D3, `service-provisioning.service.ts:337-342`) **no** toca la protección de IP locales, porque viven en tablas distintas. Esa separación es correcta.

### 2.4 Errores y enumeración

- **Diseño.** Los códigos nuevos son `IP_PROTECTED_BY_INFRASTRUCTURE` (DC-15, modelo §12.4) o `IP_INFRASTRUCTURE_PROTECTED` (API §8 y §9); `404 RESOURCE_NOT_FOUND` para ajenos e inexistentes (API §9); `409 INTERFACE_NOT_AVAILABLE` y `409 CATALOG_REFERENCE_INACTIVE` para inactivos. El mensaje de IP protegida no revela nombres de router ni de interfaz (API §9; UX §9 fila 19). Esto es correcto.
- **Riesgo 1 (SEC-M13-05).** El diseño no fija la precedencia. Si se comprueba el estado antes que la pertenencia, una interfaz inactiva de **otro router del mismo tenant** responde `409` y una inexistente responde `404`. Eso revela existencia dentro del tenant. La regla correcta: primero pertenencia (tenant, router, empresa), y solo después estado. Ajeno e inexistente deben responder igual.
- **Hallazgo ya en código.** La reserva responde de forma distinta según exista la red en el tenant bajo otro router: `NETWORK_NOT_IN_ROUTER` con 409 (`service-provisioning.service.ts:114-116`) frente a `PROVISIONING_ORDER_NOT_ELIGIBLE` con 422 cuando la red no existe o está inactiva (`:112-113`; `:1082-1087`). Es el mismo oráculo, dentro del tenant.
- **Riesgo 2 (SEC-M13-11).** `IP_INFRASTRUCTURE_PROTECTED` frente a `IP_IN_USE` permite que un rol con solo permiso de reserva descubra qué IP son de infraestructura. Ya existe un oráculo equivalente para servicios ocupados (`ipam.service.ts:268-273`). Se acepta con el mensaje genérico actual.
- **Mensajes.** `updateIpv4Network` devuelve mensajes de producto sin nombres ajenos (`network-catalog.service.ts:401`, `:428-432`).

### 2.5 Auditoría y PII

**Lo que está bien.**

- `updateRouter` y `networkAuditValue` registran nombres de campos cambiados, no valores (`network-catalog.service.ts:228-233`, `:744-756`). Las exclusiones aparecen como conteo (`excludedIpCount`, `:753`).
- `notes` no aparece en `newValue` de `logWithin` (`network-catalog.service.ts:136-160`).
- Los procesadores registran `event=omitted tenant=omitted` (`network-execution-event.processor.ts:257-266`).
- El `newValue` pasa por una política de sanitización (`apps/api/src/modules/audit/audit.service.ts:67-68`).

**Incumplimiento (SEC-M13-02).** La auditoría HTTP global registra la respuesta completa de cada operación CUD como `newValue`, después de una denylist (`apps/api/src/modules/audit/audit.interceptor.ts:168-169`, `:258-265`; registrado globalmente en `apps/api/src/app.module.ts:261`). `RouterDto` incluye `notes` (`network-catalog.service.ts:702`; `network-catalog.dto.ts:293-294`). La denylist no contiene `notes` (`apps/api/src/modules/audit/audit-sanitize.policy.ts:11-89`), y el patrón de sufijos PII no lo cubre. **Resultado:** el texto libre de las notas de router (hasta 1000 caracteres) se persiste en `audit_logs` en cada alta, edición, activación y desactivación de router.

**Campos sensibles de la auditoría (clasificación de SEC-ENG):**

| Campo | Dónde aparece | Clasificación | Decisión |
| --- | --- | --- | --- |
| `notes` (router, interfaz, dirección) | Interceptor HTTP (hoy) y previsto en contrato | Texto libre del operador; potencialmente personal | **Fuera de auditoría, logs y URLs** |
| `reason` (liberación, regularización, corrección) | `service-provisioning.service.ts:359`, `:568`; persistido en `regularization_reason` (`161_network_provisioning.ts:40`) | Texto libre; potencialmente personal | Motivo enumerado; ver SEC-M13-08 |
| `interfaceName`, `name` de red | Auditoría y respuestas | Nombre técnico del operador; puede contener nombres de personas | Tratado como potencialmente personal (A-5) |
| `managementHost`, `lanInterface` | Interceptor (respuesta de router) | Infraestructura; sensible para reconocimiento, no PII | Aceptable; restringir a lectura de catálogo |
| `ip` de servicio + `executionOrderId` + `routerId` | `service-provisioning.service.ts:226-233` | IP de cliente vinculable a una OT y, por ella, a una persona | Dato operativo según ADR-098; la clasificación como PII indirecta **requiere verificación con fuente oficial** (Ley 1581) |
| Denylist en vez de lista cerrada | `audit-sanitize.policy.ts` | Un campo nuevo pasa por defecto | Lista cerrada por entidad (SEC-M13-02) |

**Cumplimiento de DC-11.** No aprobado hasta corregir SEC-M13-02. Acepto que `DC-12` (sin `updated_by`) se apoye en la auditoría, siempre que la auditoría sea transaccional y obligatoria (`logWithin` con el mismo `EntityManager`).

### 2.6 Entrada

**Diseño.** Zod y CHECK de base de datos cubren prefijo (`masklen` 1 a 32), host utilizable (red, difusión, `0.0.0.0`, `255.255.255.255`, multicast), gateway dentro del bloque, máscara /32 del gateway y cardinalidad de exclusiones (modelo §4; DC-06, DC-17). **Cubre parcialmente.**

**Brechas.**

- **Dos validadores para la misma ruta (SEC-M13-06).** El servidor del catálogo valida con class-validator (`network-catalog.controller.ts:214` con `CreateIpv4NetworkDto`; `dto/network-catalog.dto.ts:149-186`). Los esquemas Zod de catálogo (`packages/shared/src/contracts/network/network.bodies.ts:104-147`) los usan el portal para validar formularios (`apps/portal/src/components/network/Ipv4NetworkDrawer.tsx`, `NetworkRouterDrawer.tsx`) y una prueba del servicio, pero ninguna ruta del API los aplica. La HLD §4 exige un único validador por ruta y una prueba de paridad. AGENTS (tabla de Architecture Rules, fila Security) pide Zod en boundaries externos. Divergencias ya presentes: `name` solo espacios (DTO `:154-158` con `\S`; Zod `:127` solo `min(1)`) y exclusiones sin deduplicar (`:176-181`, `network.bodies.ts:132`).
- **DC-17 no implementado.** Las exclusiones no se validan contra el bloque (`network-catalog.service.ts:651-681`), no se normalizan a /32 ni se deduplican. La base solo limita cardinalidad (diseño §4), no pertenencia ni máscara por elemento.
- **Gateway.** `assertNetworkRange` acepta gateway igual a dirección de red o de difusión, porque usa `<<=` (`network-catalog.service.ts:661-664`). Se mitiga porque IPAM excluye red y difusión (`ipam.service.ts:196-197`), pero el dato es inválido. El CHECK de diseño corrige el caso nuevo; las filas legadas quedan como `NOT VALID` (A-7).
- **Nombres.** Los nombres de interfaz (`varchar(64)`, `btrim`, `lower()` único) no prohíben caracteres de control ni de dirección de texto (SEC-M13-15).

### 2.7 Riesgos residuales

Véase §3 para el detalle y §5 para la tabla consolidada.

---

## 3. Hallazgos [SEC-REVIEW]

Formato de perfil §8.3. Severidades según perfil §9.2. Todos son de **diseño o de código existente**, verificados por lectura. Ninguno se ha reproducido con pruebas dinámicas.

### [SEC-REVIEW] SEC-M13-01 — Alcance de permisos por sede tomado de body o query

- **Severidad:** Alta en plataforma. Media en MOD13 con la configuración estándar.
- **Archivo:línea:** `apps/api/src/modules/access-control/guards/permissions.guard.ts:44`, `:71-78`; `apps/api/src/modules/access-control/services/effective-permissions.service.ts:47-49`, `:133-139`; afectados `apps/api/src/modules/network/network-catalog.controller.ts:135-137`, `:153-155`; `apps/api/src/modules/network/network-catalog.service.ts:126-129`, `:174-202`.
- **Hallazgo:** el alcance de permisos por sede lo fija el cliente. Un perfil con `scopeSiteId = A` se activa al enviar `organizationSiteId: A` en el body, incluso para routers de otra sede. El alcance funciona como concesión, no como restricción.
- **Riesgo:** un operador restringido a una sede puede crear o modificar routers de cualquier sede del tenant y reasignar su sede. No hay fuga entre tenants.
- **Control requerido:** el alcance no se deriva de body ni de query en rutas sin recurso de sede. Debe resolverse en servidor desde el recurso objetivo (`routerId`) o declararse por metadato de ruta. Prueba de regresión: un usuario con perfil de sede A que envía `PATCH` a un router de sede B con `organizationSiteId: A` recibe `403`.
- **Referencia:** ASVS V4 (control de acceso); perfil §5.4 pasos 5 y 6; `network-catalog.controller.ts:115`.
- **Dueño:** AI-SR-FULL (guard y ruta), con AI-EM-ARCH para la regla transversal.
- **Bloquea G4:** no como hallazgo de plataforma, preexistente y transversal a todos los módulos que usan `PermissionsGuard`. Sí bloquea G4 su condición en MOD13 (B8): ningún endpoint nuevo acepta `siteId` ni `organizationSiteId` en body o query como fuente de alcance, y el contrato declara la matriz por ruta.

### [SEC-REVIEW] SEC-M13-02 — Notas de router en la auditoría HTTP global

- **Severidad:** Alta.
- **Archivo:línea:** `apps/api/src/modules/audit/audit.interceptor.ts:168-169`, `:258-265`; `apps/api/src/app.module.ts:261`; `apps/api/src/modules/network/network-catalog.dto.ts:293-294`; `apps/api/src/modules/network/network-catalog.service.ts:702`; `apps/api/src/modules/audit/audit-sanitize.policy.ts:11-89`.
- **Hallazgo:** el interceptor global persiste como `newValue` la respuesta completa de cada CUD. `RouterDto` incluye `notes`, y la denylist no lo filtra. Contradice DC-11, HLD §9 («`notes` y datos de suscriptor fuera de auditoría y logs») y PRD §5.
- **Riesgo:** texto libre del operador (hasta 1000 caracteres, sin validación de contenido) en `audit_logs`, con retención de auditoría. Si el operador escribe datos personales, se incumple Ley 1581 (principio de minimización). **El contenido real no se ha verificado; el hallazgo es del control.**
- **Control requerido:**
  1. Excluir `notes` de `newValue` en el interceptor para entidades MOD13 mediante una **lista cerrada por entidad**, no con la denylist.
  2. Prueba de integración: tras `POST`, `PATCH`, `activate` y `deactivate` de router y de interfaz, `audit_logs.new_value` no contiene la clave `notes` ni su valor.
  3. Las respuestas de interfaces y direcciones no incluyen `notes` en la auditoría.
- **Referencia:** ASVS V7 (contenido de logs) y V8 (datos sensibles); HLD §9; DC-11; A-5.
- **Dueño:** AI-SR-FULL (implementación); AI-SEC-ENG (verificación).
- **Bloquea G4:** sí. La forma de respuesta de interfaces incluye `notes` (modelo §3.1), y la regla de auditoría debe quedar en el contrato antes de congelar.

### [SEC-REVIEW] SEC-M13-03 — Contrato de corrección de host ambiguo y guardas incompletas

- **Severidad:** Alta.
- **Archivo:línea:** `docs/specs/2026-10-26-mod13-interfaces-api.md:59` (PATCH de dirección con `addressWithPrefix`), `:62`, `:93` («de una red vinculada»); `docs/specs/2026-10-26-mod13-interfaces-modelo.md:207` (no se acepta cambio de host en un PATCH genérico), `:209` (DC-14 con `POST …/correct`, `{newAddress, version, reason}` y guardas (a) a (g)); `docs/hlds/HLD-MOD13-INTERFACES-IPV4-ADDENDUM-v1.0.md:45`, `:79-85` (§5.6), `:81` (D-1).
- **Hallazgo:**
  1. La API v1.0 no tiene la ruta `correct`. Cambiar host o prefijo se hace con `PATCH` de la dirección (`UpdateRouterInterfaceIpv4AddressBody { addressWithPrefix, version }`), que el modelo prohíbe en un PATCH de identificación.
  2. La guarda (a) de la API limita el gateway a «red vinculada». El modelo (DC-14 a) y la HLD (§5.6 a) dicen «cualquier red del tenant».
  3. La API no exige confirmación explícita del efecto (liberar protección del host anterior) ni motivo.
- **Riesgo:** un cambio de host libera protección de infraestructura sin confirmación ni trazabilidad de motivo. Un host que es gateway de una red no vinculada puede quedar sin protección como dirección local, y el operador no recibe aviso. Con la guarda restringida, la inconsistencia no se detecta.
- **Control requerido:**
  1. Una sola ruta `POST …/addresses/:addressId/correct` (la de DC-14). El `PATCH` de dirección solo modifica identificación no protectora, y no contiene host ni prefijo.
  2. Guardas (a) a (g) completas. La (a) aplica a **cualquier red del tenant, activa o inactiva**.
  3. Confirmación explícita del efecto sobre el host anterior, en el cuerpo de la petición.
  4. Motivo como enumeración (SEC-M13-08), no texto libre.
  5. Auditoría before/after en la misma transacción, sin `notes`.
  6. Prueba de carrera: `correct` frente a reserva del host nuevo, en ambos órdenes, con conciliación I-1 igual a cero.
- **Referencia:** ASVS V11 (lógica de negocio); DC-14; D-1; ADR-101 (propuesto) (protección de IP de infraestructura).
- **Dueño:** AI-SR-FULL (contrato); AI-EM-ARCH (alcance, que D-1 ya asigna).
- **Bloquea G4:** sí.

### [SEC-REVIEW] SEC-M13-04 — Rollback que puede retirar o ignorar la protección de infraestructura

- **Severidad:** Alta.
- **Archivo:línea:** `docs/hlds/HLD-MOD13-INTERFACES-IPV4-ADDENDUM-v1.0.md:97` (D-7); `docs/specs/2026-10-26-mod13-interfaces-modelo.md:309-314` (`down()` con `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN`), `:321` (rollback de aplicación); ADR-101 (propuesto), enmienda de ADR-098 D3, `docs/adrs/`, línea 40; patrón de referencia `packages/database/src/migrations/tenant/160_network_catalog.ts:115-139` (la única condición es la variable de entorno).
- **Hallazgo:**
  1. La condición de D-7 («I-1 devuelve cero filas y no hay direcciones locales nuevas capturadas») es insuficiente en su primera parte. I-1 mira las asignaciones vivas en el momento del rollback. El binario anterior no comprueba IP locales al **reservar después**, así que puede asignar a un servicio una IP de infraestructura en la siguiente reserva. Esta comprobación no se puede hacer sobre datos.
  2. El `down()` destructivo solo exige una variable de entorno (`=== 'true'`). Borra la protección sin segundo control, aunque el modelo pida habilitación humana y exportación verificada.
- **Riesgo:** pérdida de protección de IP de infraestructura, con doble uso de IP entre router y servicio. Las IP de router pueden caer en un cliente.
- **Control requerido:**
  1. Rollback de aplicación solo con parada técnica **server-side** de reservas (corte en las tres entradas: `reserve`, `regularize` y reconciliador/consumidor), no solo con I-1. Mientras existan direcciones locales, el binario anterior no puede estar en servicio.
  2. `down()` con filas en `network_router_interface_ipv4_addresses` no ejecutable, ni siquiera con variable de entorno, salvo procedimiento aprobado por PLAT-OPS y CTO con exportación verificada.
  3. Prueba de regresión: tras un rollback simulado, una reserva sobre una IP local protegida devuelve conflicto.
  4. Confirmar que la liberación de asignaciones de servicio (ADR-098 D3) no toca la protección (ya verificado en código).
- **Referencia:** ASVS V11; ADR-098 D3; ADR-101 (propuesto) consecuencias.
- **Dueño:** AI-DATA-ENG (migración), AI-PLAT-OPS (procedimiento), AI-EM-ARCH y CTO (aprobación del rollback).
- **Bloquea G4:** no. **Bloquea O3, G6 y cualquier despliegue a producción.**

### [SEC-REVIEW] SEC-M13-05 — Enumeración en reserva y precedencia de referencias no fijada

- **Severidad:** Media.
- **Archivo:línea:** `apps/api/src/modules/network/service-provisioning.service.ts:112-116` (`NETWORK_NOT_IN_ROUTER` frente a `orderNotEligible`), `:1082-1087`; API `§2` y `§9` (`404 RESOURCE_NOT_FOUND`, `409 INTERFACE_NOT_AVAILABLE`, `409 CATALOG_REFERENCE_INACTIVE`).
- **Hallazgo:** el código actual distingue «red existente en el tenant bajo otro router» de «red inexistente o inactiva». El diseño no fija la precedencia entre pertenencia y estado para interfaces nuevas.
- **Riesgo:** oráculo de existencia de recursos dentro del tenant. Mitigado porque los UUID no son adivinables y la acción exige permiso de ejecución.
- **Control requerido:**
  1. Ajenos e inexistentes responden **igual**: mismo código, mismo estado HTTP y mismo mensaje (DC-13).
  2. Precedencia: pertenencia (tenant, router, empresa) antes que estado. Solo una referencia que pertenece al router puede responder `INTERFACE_NOT_AVAILABLE`.
  3. Unificar `NETWORK_NOT_IN_ROUTER` y `PROVISIONING_ORDER_NOT_ELIGIBLE` para la misma condición de pertenencia.
- **Referencia:** ASVS V4 y V7; DC-13; PRD §5 («referencias ajenas e inexistentes no revelan existencia diferente»).
- **Dueño:** AI-SR-FULL.
- **Bloquea G4:** sí. La precedencia debe quedar en el contrato de errores.

### [SEC-REVIEW] SEC-M13-06 — Validador dual, DC-17 no implementado y exclusiones sin pertenencia ni normalización

- **Severidad:** Media.
- **Archivo:línea:** `apps/api/src/modules/network/network-catalog.controller.ts:214`; `apps/api/src/modules/network/dto/network-catalog.dto.ts:149-186`, `:154-158`, `:176-181`, `:206-211`; `packages/shared/src/contracts/network/network.bodies.ts:124-147` (no aplicados a estas rutas); `apps/api/src/modules/network/network-catalog.service.ts:651-681`; `packages/database/src/migrations/tenant/160_network_catalog.ts:51`.
- **Hallazgo:** dos validadores para una misma ruta, con divergencias (`name` solo espacios). Las exclusiones no se validan contra el bloque, no se normalizan a /32 ni se deduplican (DC-17). La base solo limita cardinalidad.
- **Riesgo:** una exclusión fuera del bloque o con máscara distinta no se comporta como se espera en IPAM (ver SEC-M13-07). Contrato y servicio divergen.
- **Control requerido:**
  1. Un validador por ruta. Recomendado: Zod en las rutas nuevas (la unión `source` de la API se expresa mejor en Zod, y AGENTS pide Zod en boundaries). Prueba de paridad entre DTO/OpenAPI y Zod.
  2. Normalizar exclusiones a /32, deduplicar, validar pertenencia al bloque y cardinalidad ≤ 256 **en servicio**, antes de persistir (DC-17).
  3. Gateway: rechazar red y difusión en servicio, además del CHECK.
  4. Nombres: restringir caracteres de control y de dirección de texto (SEC-M13-15).
- **Referencia:** ASVS V5 (validación); HLD §4; DC-17; AGENTS (Architecture Rules).
- **Dueño:** AI-SR-FULL.
- **Bloquea G4:** sí, en cuanto al validador elegido por ruta (lo fija el contrato O2-C). La implementación de DC-17 puede ir en O2-H.

### [SEC-REVIEW] SEC-M13-07 — IPAM compara gateway y exclusiones por igualdad `inet` sin normalizar máscara

- **Severidad:** Media.
- **Archivo:línea:** `apps/api/src/modules/network/ipam.service.ts:141-142`, `:195`, `:198`, `:228`, `:231`; `packages/database/src/migrations/tenant/160_network_catalog.ts:48`, `:51`; modelo §4 (CHECK `NOT VALID`).
- **Hallazgo:** IPAM compara `n.gateway` y `n.excluded_ips` con `inet` directamente. Un valor con máscara distinta de /32 nunca iguala a un candidato /32, y el gateway o la exclusión dejarían de estar protegidos. Hoy la API solo escribe IPs sin máscara (`IsIP('4')`), así que el riesgo es **latente**: aparece con filas legadas, escrituras SQL manuales o un cambio futuro de contrato. El CHECK de máscara del gateway es `NOT VALID`, y no hay CHECK por elemento para `excluded_ips`.
- **Riesgo:** IP de gateway o excluida asignable a un servicio.
- **Control requerido:**
  1. Comparar siempre por host: `host(x)::inet` o la columna `host_address` de la tabla nueva (que es /32 por diseño).
  2. CHECK de máscara por elemento de `excluded_ips`, mediante dominio o trigger, porque CHECK no admite subconsultas.
  3. Prueba con fila legada de máscara distinta de /32: la reserva no debe asignar ni el gateway ni la exclusión.
  4. Comprobaciones previas de modelo §8 (exclusiones fuera del bloque, gateway con máscara) antes de `VALIDATE` (A-7).
- **Referencia:** ASVS V5; modelo §4 y §8; DC-01.
- **Dueño:** AI-SR-FULL (IPAM), AI-DATA-ENG (CHECK y comprobaciones).
- **Bloquea G4:** no. Es condición de implementación de O2-M.

### [SEC-REVIEW] SEC-M13-08 — Texto libre de motivo en auditoría y en persistencia

- **Severidad:** Media.
- **Archivo:línea:** `apps/api/src/modules/network/service-provisioning.service.ts:359` (auditoría de liberación), `:519` (`regularizationReason`), `:568` (auditoría de regularización); `packages/shared/src/contracts/network/network.bodies.ts:39`, `:87`, `:99` (motivo de 10 a 500 caracteres, libre); `packages/database/src/migrations/tenant/161_network_provisioning.ts:40`.
- **Hallazgo:** el motivo libre se persiste en auditoría y en base de datos. Es un patrón que el diseño de `correct` (DC-14, campo `reason`) podría copiar.
- **Riesgo:** datos personales escritos en el motivo, en auditoría con retención. Mismo riesgo que SEC-M13-02.
- **Control requerido:**
  1. Para `correct` y para cualquier operación nueva: motivo como **enumeración** (por ejemplo `HARDWARE_REPLACED`, `TYPO_CORRECTED`, `OTHER`), sin texto libre en auditoría.
  2. Para el motivo libre existente: no añadirlo a `newValue`; registrar solo el código, o sanear. Corrección fuera del alcance de MOD13, con owner en MOD05/MOD11.
- **Referencia:** ASVS V7 y V8; Ley 1581 (principio de minimización; **requiere verificación con fuente oficial**).
- **Dueño:** AI-SR-FULL; AI-PROD-UX (lista de motivos).
- **Bloquea G4:** sí para `correct` (la enumeración debe estar en el contrato). No bloquea el código existente.

### [SEC-REVIEW] SEC-M13-09 — Coste de ocupación por red en listados paginados

- **Severidad:** Media (disponibilidad frente a usuario autenticado).
- **Archivo:línea:** `apps/api/src/modules/network/network-catalog.service.ts:317-328`, `:715` (ocupación por cada red de la página); `apps/api/src/modules/network/ipam.service.ts:213-257` (`generate_series` sobre el pool completo, `host()` por fila, `:222-231`).
- **Hallazgo:** cada red de una página recorre su pool completo. Con 100 redes de máscara /16 (65 534 candidatas), una sola petición evalúa del orden de seis millones de candidatas. El diseño añade consultas de IP locales por pool (modelo §5.2).
- **Riesgo:** degradación de servicio por un usuario autenticado con permiso de lectura, dentro del límite global de 100 peticiones por minuto (`apps/api/src/app.module.ts:156-164`), que no mide coste de consulta.
- **Control requerido:** ocupación por lote con agregación SQL; límite de redes con cálculo completo por petición; medir con `EXPLAIN (ANALYZE, BUFFERS)` (modelo §10) antes de G6 y registrar el umbral.
- **Referencia:** ASVS V11 (abuso de lógica de negocio).
- **Dueño:** AI-SR-FULL; AI-PLAT-OPS (medición).
- **Bloquea G4:** no.

### [SEC-REVIEW] SEC-M13-10 — Brechas de locks no recogidas en el diseño

- **Severidad:** Media.
- **Archivo:línea:** `apps/api/src/modules/network/service-provisioning.service.ts:146-160` (replay sin revalidación), `:103-105` (L1 en reserva frente al texto «solo L2»); `apps/api/src/modules/network/network-catalog.service.ts:250-260` (inactivación de router sin conjunto de pools), `:337-348` (alta de red sin `FOR SHARE` del router).
- **Hallazgo:** cinco brechas del diseño, descritas en §2.3 (a) a (e).
- **Riesgo:** ventanas de carrera que permiten reservar sobre interfaz o router inactivados, o crear red bajo router inactivado. No hay doble asignación, porque la unicidad parcial de `ip_assignments` la impide (`161_network_provisioning.ts:93-96`).
- **Control requerido:** incorporar (a) a (e) al encargo de implementación (A-1) con pruebas de carrera en ambos órdenes (modelo §10) y `pg_stat_activity` para confirmar la espera.
- **Referencia:** ASVS V11; modelo §7 y §7.1.
- **Dueño:** AI-SR-FULL (implementación); AI-SR-QA (pruebas de carrera).
- **Bloquea G4:** sí, por A-1 (el encargo debe incluir la lista de caminos a corregir).

### [SEC-REVIEW] SEC-M13-11 — Oráculo de IP de infraestructura para roles de reserva

- **Severidad:** Baja.
- **Archivo:línea:** `docs/specs/2026-10-26-mod13-interfaces-api.md:176`, `:193`; `docs/specs/2026-10-26-mod13-interfaces-ux.md` §9 fila 19; contraste con `apps/api/src/modules/network/ipam.service.ts:268-273` (`IP_IN_USE`).
- **Hallazgo:** un rol con permiso de reserva pero sin lectura de catálogo puede descubrir qué IP son de infraestructura de la empresa.
- **Riesgo:** reconocimiento de la topología de routers dentro del tenant. Ya existe el mismo oráculo para servicios ocupados.
- **Control requerido:** mantener el mensaje genérico (sin router, interfaz ni nombre). Documentar la aceptación del riesgo.
- **Dueño:** AI-SEC-ENG (aceptación); AI-SR-FULL.
- **Bloquea G4:** no.

### [SEC-REVIEW] SEC-M13-12 — Divergencias de contrato antes de congelar

- **Severidad:** Baja (de forma), pero bloquea la congelación porque los nombres de error son contrato.
- **Archivo:línea:**
  - Código de IP protegida: `API:176`, `:193` (`IP_INFRASTRUCTURE_PROTECTED`) frente a `HLD:47` y `modelo:452` (`IP_PROTECTED_BY_INFRASTRUCTURE`).
  - Interfaz inactiva: `API:190` (`CATALOG_REFERENCE_INACTIVE`) y `API:191` (`INTERFACE_NOT_AVAILABLE`) para el mismo caso.
  - `reservationAvailability.reason`: `API:162` (`'AVAILABLE'`) frente a `HLD:101` (`null`).
  - `notes` en interfaz: `API:71-76` no lo incluye; `modelo:67` sí lo incluye como columna.
  - `interfaceVersion` opcional en la alta de red asistida (`API:115`), aunque `API:25` dice que se envían las versiones observadas.
- **Hallazgo:** la API v1.0 no coincide con HLD ni modelo en nombres de error, campos y obligatoriedad.
- **Riesgo:** un cliente implementado contra una versión entiende otro código. Un código de error que no coincide con el de auditoría o pruebas impide verificar DC-15.
- **Control requerido:** un nombre por concepto, fijado en `NETWORK_ERROR_CODES`. Una sola decisión de `notes` en interfaz: si existe, se excluye de auditoría (SEC-M13-02). `interfaceVersion` obligatoria cuando hay `interfaceId`.
- **Dueño:** AI-SR-FULL; AI-EM-ARCH (publicación).
- **Bloquea G4:** sí (congelación de nombres).

### [SEC-REVIEW] SEC-M13-13 — Datos de interfaz en proyecciones de aprovisionamiento

- **Severidad:** Baja.
- **Archivo:línea:** `apps/api/src/modules/network/service-provisioning.service.ts:953-1028` (`toServiceDto` expone router, red, CIDR e IP a `NETWORK_PROVISIONING_READ`); `:226-233` (auditoría de reserva con `ip` y `executionOrderId`).
- **Hallazgo:** hoy los lectores de aprovisionamiento ven CIDR e IP. Si se añaden a esa proyección el nombre de interfaz o `notes`, un rol sin lectura de catálogo los vería.
- **Riesgo:** exposición de topología a roles sin lectura de catálogo.
- **Control requerido:** no añadir interfaz, `notes` ni `managementHost` a `ServiceProvisioningDto`. Mantener el nombre de interfaz fuera de la auditoría de reserva (A-5).
- **Dueño:** AI-SR-FULL.
- **Bloquea G4:** no, salvo que el contrato de aprovisionamiento incluya interfaz (entonces sí).

### [SEC-REVIEW] SEC-M13-14 — FK compuesta a router ausente en `ipv4_networks`

- **Severidad:** Baja.
- **Archivo:línea:** `packages/database/src/migrations/tenant/160_network_catalog.ts:45` (`router_id uuid NOT NULL REFERENCES network_routers(id)`); modelo §4 (recomendada, no bloqueante).
- **Hallazgo:** la FK actual no comprueba `tenant_id`. La FK de `interface_id` (nueva) sí debe ser compuesta, pero la de router no lo es.
- **Riesgo:** defensa en profundidad incompleta. Dentro de un schema el riesgo es nulo, pero la invariante de pertenencia depende de la aplicación.
- **Control requerido:** FK `(tenant_id, router_id) → network_routers(tenant_id, id)` en la misma migración aditiva.
- **Dueño:** AI-DATA-ENG.
- **Bloquea G4:** no.

### [SEC-REVIEW] SEC-M13-15 — Caracteres de control y de dirección de texto en nombres

- **Severidad:** Baja.
- **Archivo:línea:** modelo §3.1 (`name varchar(64)`, `btrim`); API `§6.3` (nombre generado `<interfaz> · <CIDR>`).
- **Hallazgo:** no se restringen caracteres de control ni de dirección de texto, que pueden alterar la lectura en pantalla. React escapa el texto (no hay `dangerouslySetInnerHTML` en `apps/portal/src/components/network`), así que el riesgo de XSS es nulo; el de suplantación visual no.
- **Control requerido:** regex de caracteres permitidos en el validador (SEC-M13-06).
- **Dueño:** AI-SR-FULL; AI-FE-PLATFORM (render).
- **Bloquea G4:** no.

### [SEC-REVIEW] SEC-M13-16 — Límite de peticiones solo global en el catálogo

- **Severidad:** Baja.
- **Archivo:línea:** `apps/api/src/app.module.ts:156-164`, `:258` (`ThrottlerGuard` global, 100 por minuto); `apps/api/src/modules/network/network-provisioning.controller.ts:62` (`TenantAwareThrottlerGuard` solo en aprovisionamiento).
- **Hallazgo:** las escrituras nuevas de interfaces y direcciones solo tienen el límite global.
- **Control requerido:** bucket por tenant para escrituras de MOD13, con límite explícito.
- **Dueño:** AI-PLAT-OPS; AI-SR-FULL.
- **Bloquea G4:** no.

---

## 4. Bloqueantes de G4 y criterios de cierre

| # | Bloqueante | Hallazgo | Criterio de cierre verificable |
| --- | --- | --- | --- |
| B1 | Ruta única `correct` con guardas (a) a (g), motivo enumerado y confirmación del efecto | SEC-M13-03, SEC-M13-08 | API v1.1 publicada sin host ni prefijo en PATCH; guarda (a) sobre todas las redes del tenant; motivo como enumeración; prueba de carrera `correct` frente a reserva |
| B2 | Auditoría sin `notes`, con forma de `newValue` cerrada por entidad | SEC-M13-02 | Lista cerrada por entidad documentada; prueba de integración que verifica ausencia de `notes` en `audit_logs` |
| B3 | Respuesta uniforme ante referencias ajenas e inexistentes; pertenencia antes que estado | SEC-M13-05 | Tabla de errores con precedencia; prueba con referencia de otro router inactivo y de inexistente, misma respuesta |
| B4 | Un validador por ruta; DC-17 en servicio | SEC-M13-06 | Validador elegido por ruta en el contrato; prueba de paridad; exclusiones normalizadas en servicio |
| B5 | Encargo de implementación con H-1 a H-8 y brechas (a) a (e) | SEC-M13-10, A-1 | Encargo con la lista completa; pruebas de carrera en ambos órdenes |
| B6 | ADR-101 (propuesto) aprobado por el CTO | DC-15, D-8 | Estado del ADR cambiado por el CTO; código `IP_*` congelado después |
| B7 | API v1.1 publicada y nombres unificados | SEC-M13-12 | Un código por concepto en `NETWORK_ERROR_CODES`; `reservationAvailability.reason` decidido; `notes` en interfaz decidido |
| B8 | Alcance de permisos no derivado de body ni de query en rutas MOD13 | SEC-M13-01 (condición) | Matriz por ruta en el contrato, con el alcance indicado; ninguna ruta MOD13 acepta `siteId` o `organizationSiteId` como fuente de alcance |

**Cierre de G4:** cuando B1 a B8 estén verificados, SEC-ENG puede re-emitir la revisión sobre v1.1 y el dictamen podrá pasar a «apto». Hasta entonces, **G4 no se declara**.

---

## 5. Riesgos residuales consolidados

| ID | Riesgo | Severidad | Dueño | Bloquea G4 |
| --- | --- | --- | --- | --- |
| SEC-M13-01 | Alcance de permisos por sede tomado del cliente | Alta (plataforma); Media en MOD13 | AI-SR-FULL, AI-EM-ARCH | No como hallazgo; sí su condición B8 |
| SEC-M13-02 | Notas en auditoría | Alta | AI-SR-FULL | Sí |
| SEC-M13-03 | Corrección de host sin guardas completas ni confirmación | Alta | AI-SR-FULL, AI-EM-ARCH | Sí |
| SEC-M13-04 | Rollback que retira o ignora protección | Alta | AI-DATA-ENG, AI-PLAT-OPS, CTO | No (bloquea O3, G6, producción) |
| SEC-M13-05 | Enumeración y precedencia de referencias | Media | AI-SR-FULL | Sí |
| SEC-M13-06 | Validador dual; DC-17 no implementado | Media | AI-SR-FULL | Sí (validador) |
| SEC-M13-07 | Comparación de gateway y exclusiones sin normalizar máscara | Media | AI-SR-FULL, AI-DATA-ENG | No |
| SEC-M13-08 | Motivo libre en auditoría | Media | AI-SR-FULL, AI-PROD-UX | Sí (para `correct`) |
| SEC-M13-09 | Coste de ocupación por red | Media | AI-SR-FULL, AI-PLAT-OPS | No |
| SEC-M13-10 | Brechas de locks | Media | AI-SR-FULL, AI-SR-QA | Sí (por A-1) |
| SEC-M13-11 | Oráculo de IP de infraestructura | Baja | AI-SEC-ENG | No |
| SEC-M13-12 | Divergencias de contrato | Baja | AI-SR-FULL, AI-EM-ARCH | Sí |
| SEC-M13-13 | Datos de interfaz en aprovisionamiento | Baja | AI-SR-FULL | No |
| SEC-M13-14 | FK compuesta de router ausente | Baja | AI-DATA-ENG | No |
| SEC-M13-15 | Caracteres de control en nombres | Baja | AI-SR-FULL, AI-FE-PLATFORM | No |
| SEC-M13-16 | Límite de peticiones solo global | Baja | AI-PLAT-OPS | No |

Ningún hallazgo es **Crítico**. Ninguno exige escalar como incidente. No se ha detectado PII real, secretos ni credenciales en los documentos revisados.

---

## 6. Decisiones abiertas con dueño SEC-ENG y disposición

| Decisión | Disposición de AI-SEC-ENG |
| --- | --- |
| **A-2** (guardas de `correct`, permisos, auditoría, error uniforme) | **No confirmada.** Confirmo condicionalmente: D-5 y DC-10 sujetos a B8 y a la matriz por ruta; DC-11 y DC-13 no aprobados hasta B2 y B3; DC-14 aprobado en alcance (D-1) solo con B1 |
| **A-5** (`notes` y nombres como dato personal) | **Decisión de AI-SEC-ENG (criterio conservador):** `notes` y nombres de interfaz se tratan como potencialmente personales. No entran en auditoría, logs ni URLs. Si se confirma que son PII, la retención la decide CTO con Legal. La clasificación de la norma **requiere verificación con fuente oficial** |
| **DC-10** (sin permisos nuevos) | Aceptado sin permisos nuevos. Condición: matriz por ruta con `@Roles(ADMIN, NOC)` explícito y `NETWORK_CATALOG_READ`/`MANAGE` |
| **DC-11** (auditoría) | No aprobado hasta B2 |
| **DC-12** (sin `updated_by`) | Aceptado, siempre que la auditoría sea transaccional y obligatoria |
| **DC-13** (error uniforme) | No aprobado hasta B3 |
| **DC-14** (`correct`) | Aprobado en alcance (D-1). Guardas y forma: no aprobadas hasta B1 |
| **DC-17** (exclusiones) | No implementado; aprobado en diseño, condicionado a B4 |
| **ADR-101** (propuesto) | **Recomiendo la opción A.** Condiciones de la enmienda: (i) la protección aplica a pools inactivos y a otros routers del tenant; (ii) el rollback no se permite mientras existan direcciones locales (SEC-M13-04). La decisión es del CTO |
| **D-7** (rollback) | No aprobado en su redacción actual (SEC-M13-04) |
| **A-7** (filas legadas) | Obligatorio antes de `VALIDATE`; incluir la comprobación de máscara por elemento (SEC-M13-07) |
| **A-6** (volatilidad de funciones de PostgreSQL) | Pendiente en G1 con fuente oficial de la versión desplegada. No verificado en esta revisión |

---

## 7. Trazabilidad regla → campo (pasada de seguridad)

Se aplica la pasada regla → campo que pide la memoria de proyecto para contratos congelados.

| Regla de seguridad | Campo o validación de diseño | Estado |
| --- | --- | --- |
| Tenant desde contexto autenticado (HLD §9) | `TenantContext` y JWT verificado (`tenant.middleware.ts:72-79`) | Cumple |
| IDs nuevos validados por tenant y router (DC-13) | FK compuesta (modelo §4) y validación de servicio (API §2) | Cumple en diseño; falta precedencia (B3) |
| Sin lectura de tablas ajenas (PRD §5) | Puerto de dueño (HLD §8; D-6) | Cumple en diseño y código |
| `notes` fuera de auditoría y logs (DC-11) | Interceptor sin lista cerrada | **No cumple** (SEC-M13-02) |
| Permisos de catálogo (D-5) | `@Roles` + `@Permissions` (`network-catalog.controller.ts:121-122`) | Cumple; alcance de sede **no** (SEC-M13-01) |
| Protección de IP local en las tres rutas IPAM (ADR-101 (propuesto)) | Gateway, red, difusión, exclusiones (`ipam.service.ts:138-142`, `:195-198`, `:228-231`); IP local **pendiente** | Pendiente de implementación |
| Host usable (DC-06, D-12) | CHECK `NOT VALID` y validador | Diseño cumple; validador no implementado (SEC-M13-06) |
| Exclusiones dentro del bloque y /32 (DC-17) | Solo cardinalidad en base | **No cumple** (SEC-M13-06, SEC-M13-07) |
| Cambio de host explícito y auditado (DC-14) | Ruta `correct` (API ausente) | **No cumple** en v1.0 (SEC-M13-03) |
| Motivo sin texto libre en auditoría | `reason` libre (`network.bodies.ts:39`) | Pendiente para `correct` (SEC-M13-08) |
| Versión de contrato obligatoria | `version` en PATCH y en estado (API §2) | Cumple en diseño; `correct` pendiente |
| Un error uniforme, sin datos de otra organización (D13) | `404` previsto | Pendiente de precedencia (B3) |

---

## 8. Límites de la revisión y verificación pendiente

- **Sin ejecución.** No se ejecutaron pruebas, migraciones, `pnpm`, dev servers ni consultas a bases de datos. Todas las conclusiones proceden de lectura de código y documentos.
- **Sin prueba dinámica de SEC-M13-01.** La conclusión procede de la lectura de `PermissionsGuard`, `EffectivePermissionsService` y del alcance de los perfiles. Debe reproducirse con una prueba HTTP en G6 o en la verificación de G3.
- **Configuración de infraestructura no verificada.** TLS 1.3, Nginx y el procedimiento de despliegue no están en el repositorio revisado. Pertenecen a AI-PLAT-OPS.
- **JWT.** Verifiqué algoritmo RS256, emisor y audiencia (`apps/api/src/modules/auth/auth.module.ts:52-58`). No revisé `exp`, rotación ni revocación, que están fuera del alcance de MOD13.
- **Regulación.** No he clasificado como PII ningún campo con base legal. Las clasificaciones de A-5 y de IP de cliente requieren verificación con fuente oficial (Ley 1581 y Habeas Data). No se inventa regulación.
- **PostgreSQL.** La volatilidad de `set_masklen`, `host`, `network` y `broadcast` (DC-01, A-6) es un supuesto de diseño a verificar en G1.
- **Enlaces externos.** Los enlaces de MikroTik citados en el modelo §5.1 no se abrieron. Ninguna regla de seguridad depende de ellos.
- **Frontend.** Revisión de la UI en modo de apoyo. No hay `dangerouslySetInnerHTML` en `apps/portal/src/components/network`. El render de `notes` es un control textarea. La revisión completa de UI corresponde a AI-FE-PLATFORM en G3.
- **Oportunidad.** Esta revisión se hizo sobre API v1.0. La conclusión sobre el contrato debe repetirse con v1.1.
- **Estado de revisiones posteriores.** Esta revisión no sustituye la de implementación. Se requiere otra revisión de SEC-ENG antes de cerrar la fase (protocolo §4 y AGENTS Gates Before Merge).

---

**Firma de la revisión:** AI-SEC-ENG. Revisión de diseño sin autoridad de aprobación de excepciones: cualquier excepción a los controles de este informe se eleva al CTO.
