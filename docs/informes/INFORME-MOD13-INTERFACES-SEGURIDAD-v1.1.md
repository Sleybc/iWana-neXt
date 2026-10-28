# INFORME-MOD13 — Revisión de seguridad de diseño · Interfaces, direcciones locales y registro IPv4 (O1-S)

**Versión:** 1.1  
**Estado:** SUPERADO por [INFORME-MOD13-INTERFACES-SEGURIDAD-v1.2](INFORME-MOD13-INTERFACES-SEGURIDAD-v1.2.md); conservar como antecedente histórico.  
**Fecha:** 2026-10-26  
**Emisor:** AI-SEC-ENG (Security Engineer / AppSec), solo lectura  
**Encargo:** O1-S del plan de orquestación MOD13, revisión de seguridad antes de G4  
**Antecedente:** [revisión v1.0](INFORME-MOD13-INTERFACES-SEGURIDAD-v1.0.md), superada en sus referencias de versión por este informe.  
**Entradas:** PRD addendum v1.0; HLD addendum v1.0; modelo v1.5; UX v1.6; API v1.2; matriz QA v0.4; ADR-044 y ADR-098 aprobados; ADR-101 v1.1 aprobado por el CTO el 2026-10-26.  
**Código contrastado:** `apps/api/src/modules/access-control/{guards/permissions.guard.ts,services/effective-permissions.service.ts}`, `apps/api/src/modules/network/{network-catalog.controller.ts,network-catalog.service.ts,service-provisioning.service.ts,network-provisioning.controller.ts}`, `apps/api/src/modules/audit/{audit.interceptor.ts,audit-sanitize.policy.ts}`, contratos compartidos de red y migraciones tenant vigentes.  
**Skills:** `security-auditor` y `backend-security-coder` (obligatorias); `frontend-security-coder` de apoyo para estados/errores de UI; `auth-implementation-patterns` descartada porque no se cambia autenticación.

## 1. Dictamen

El diseño actualizado recoge la aprobación de ADR-101, conserva la separación entre infraestructura y exclusiones manuales y define una protección por host tenant-wide para reserva manual, automática y ocupación. También mejora el diseño de rollback y separa metadatos de captura y pausa según permisos.

No encontré evidencia de fuga cross-tenant en la lectura estática. Sí sigue abierta una incompatibilidad de integración de autorización por sede: el `PermissionsGuard` vigente evalúa body/query antes de resolver el router y la spec deja pendiente demostrar que una autorización final basada en sede persistida funcionará para actores site-scoped sin falso rechazo. El contrato de `correct` también deja sin resolver la confirmación del lado servidor para liberar el host anterior. Ambos puntos impiden un dictamen de seguridad sin condiciones para G4.

La revisión es documental/estática. No ejecuté pruebas, migraciones, consultas de base de datos ni pruebas de abuso. No declaro G1, G2, G3, G4, G6 ni habilitación de captura. La captura de direcciones debe seguir cerrada hasta que el backend proteja las tres rutas IPAM y CA-R12 pase.

## 2. Cambios respecto de la revisión v1.0

| Hallazgo previo                                  | Estado actual                                                                                                                | Disposición                                                                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| SEC-M13-01, alcance de sede tomado de body/query | Diseño definido; factibilidad con el guard vigente sin demostrar                                                             | Bloquea G3 hasta resolver estrategia y verificar autorización positiva/negativa.                                            |
| SEC-M13-02, `notes` en auditoría                 | Allowlist por entidad definida en API/HLD; interceptor global existente sigue auditando respuestas completas                 | Criterio documental cerrado; corrección y prueba de integración siguen pendientes en O2-H/G6.                               |
| SEC-M13-03/08, `correct` y motivo libre          | Ruta única, versionada y con motivo enumerado definidos; el request no exige confirmación de liberación                      | Bloquea G4 hasta decidir y fijar la confirmación server-side o aceptar explícitamente el riesgo operacional.                |
| SEC-M13-04, rollback que pierde protección       | ADR-101, HLD D-7 y API §12.2 ya exigen mantener backend protector o una pausa externa que cubra reserve, replay y regularize | Diseño cerrado; ensayo operativo/rollback sigue siendo requisito O3 y de producción.                                        |
| SEC-M13-05, precedencia y enumeración            | 404 uniforme para referencias inexistentes/ajenas/parent incorrecto y pertenencia antes de estado                            | Parcial: API aún distingue 403 para recurso existente sin permiso de sede y mantiene abiertos errores de reserva/provisión. |
| SEC-M13-06/07, validación y máscaras             | Zod por ruta tocada, exclusiones normalizadas a /32 y `host_address` generado para comparar hosts                            | Diseño cerrado; ejecución y pruebas de migración/IPAM pendientes.                                                           |
| SEC-M13-10, locks                                | Modelo v1.5 describe H-1–H-12 y el orden L0–L3                                                                               | Diseño cerrado; pruebas concurrentes reales pendientes en O2-M/O3.                                                          |
| SEC-M13-12, deriva de nombres                    | API v1.2 fija `IP_PROTECTED_BY_INFRASTRUCTURE`, `INTERFACE_NOT_AVAILABLE`, `available/reason:null` y `interfaceVersion`      | Cerrado en el contrato documental; snapshot runtime y revisión de contratos pendientes de O2-C/G4.                          |
| SEC-M13-14, FK compuesta de router               | Modelo v1.5 incorpora FK compuesta `NOT VALID` para la pareja tenant/router y preflight legado                               | Diseño cerrado; migración reversible y ensayo poblado pendientes.                                                           |

## 3. Hallazgos abiertos y condiciones

### [SEC-REVIEW] SEC-M13-01 — Autorización por sede y `PermissionsGuard`

- **Severidad:** Alta en plataforma; Media para esta evolución hasta integrar D-23.
- **Evidencia:** `permissions.guard.ts:44,64-80` selecciona `siteId`/`organizationSiteId` de params, body o query. `effective-permissions.service.ts:133-140` compara ese valor con `profile.scopeSiteId`. El controlador de catálogo aplica el guard antes de entrar al servicio (`network-catalog.controller.ts:115`).
- **Estado de diseño:** API v1.2 §§2, 4.3 ordena resolver el recurso dentro del tenant, autorizar según la sede persistida y filtrar resultados antes de paginar/contar. También especifica el caso negativo `PATCH router B?siteId=A` con grant solo en A.
- **Brecha:** el guard puede permitir el request porque el atacante declara sede A; por otro lado, una ruta sin `siteId` puede descartar el grant de un usuario limitado a una sede antes de que el servicio resuelva su router real. La spec reconoce esta dependencia y deja la factibilidad en G3/O2-H.
- **Cierre verificable:** demostrar con HTTP que grant A + `siteId=A` no permite leer/mutar router B; grant real B sí permite la acción; listado de A no revela B antes de page/count; el mismo enfoque cubre creación y cambios de sede. No se acepta body/query como autorización final ni se amplía el guard global sin revisión de impacto.
- **Gate:** bloquea G3 hasta aprobar mecanismo viable. La condición de código queda abierta para O2-H/O3.

### [SEC-REVIEW] SEC-M13-02 — `notes` y auditoría de respuesta

- **Severidad:** Alta para texto libre si se persiste sin filtro.
- **Estado de diseño:** API v1.2 §12.1 y HLD D-21 exigen allowlist por entidad y excluyen `notes`. Esto corrige el defecto contractual detectado en v1.0.
- **Riesgo actual:** el interceptor global sigue sanitizando la respuesta CUD completa (`audit.interceptor.ts:151-169,258-269`). El controlador de catálogo no declara `@SkipAudit()`; los logs manuales `logWithin` que omiten `notes` no impiden por sí solos que el interceptor global registre el DTO de respuesta.
- **Cierre verificable:** las rutas CUD modificadas usan una vía de auditoría única y allowlist efectiva; prueba de integración comprueba que `notes`, valores de `managementHost`, `lanInterface` y request completo no aparecen en `audit_logs` ni logs. Mantener trazabilidad de actor/tenant/acción/versionado.
- **Gate:** no bloquea la publicación de tipos por sí solo; bloquea completar O2-H/G6 si no se cumple.

### [SEC-REVIEW] SEC-M13-03 — `correct` libera el host previo sin confirmación exigida por API

- **Severidad:** Alta para integridad operacional; no es bypass de autorización.
- **Estado de diseño:** API v1.2 §6 fija una sola ruta, versionado, motivo enumerado y guardas de pertenencia, actividad, gateway, asignaciones, duplicado, locks y auditoría. PATCH no cambia host/prefijo. La interfaz informa que `releasedHost` podrá asignarse y pide confirmación visual.
- **Brecha:** `CorrectRouterInterfaceIpv4AddressBody` no contiene un token/campo que confirme explícitamente la liberación. Una llamada directa autorizada al endpoint puede ejecutar el mismo cambio sin haber pasado por esa confirmación de UI. El mismo contrato deja esta decisión abierta (API §6/§13.5).
- **Cierre verificable:** AI-EM-ARCH decide si el servidor exige `confirmReleasedHost: true` cuando cambie el host y, si sí, lo incorpora al esquema/OpenAPI y prueba 400/409 sin side effects. Si se acepta solo confirmación de UI, registrar explícitamente el riesgo en PRD/HLD y asegurar que la ruta no se exponga a automatizaciones no interactivas.
- **Gate:** bloquea G4 hasta resolver la decisión y congelar el contrato. ADR-101 no decide esta semántica.

### [SEC-REVIEW] SEC-M13-04 — Rollback después de capturar IP locales

- **Severidad:** Alta; afecta asignación de direcciones y producción.
- **Estado de diseño:** resuelto por ADR-101 v1.1 aprobado y HLD/API D-7 actualizados. I-1 en cero no basta. Después de capturar direcciones se conserva el backend protector; si se debe desplegar una versión antigua, un control externo debe detener y verificar reserva, replay que reemite instrucción y regularización antes de reanudarlas. La pausa no debe dar por protegida una versión backend que no la interpreta.
- **Cierre verificable:** en O3, demostrar configuración por entorno con `PENDING/false` por defecto, bloqueo efectivo de las tres entradas bajo fallback, asignaciones vivas preservadas y rollback/retorno sin liberar IP. Conservar evidencia operacional y dueño de reanudación.
- **Gate:** no bloquea G4 de contrato; bloquea habilitación de captura (CA-R12), O3, G6 y cualquier despliegue.

### [SEC-REVIEW] SEC-M13-05 — Diferencias observables por existencia y permisos

- **Severidad:** Media.
- **Cerrado en diseño:** API v1.2 §2 fija pertenencia/padre antes de consultar estado y 404 uniforme para ID ajeno, inexistente o con padre incorrecto.
- **Residual 1:** §2 dice que un ID existente en el tenant, pero fuera de las sedes autorizadas, devuelve 403. Un actor site-scoped puede diferenciar ese caso de un UUID inexistente (404). AI-EM-ARCH debe decidir si esta señal es aceptable o si el recurso fuera del conjunto autorizado se oculta con 404.
- **Residual 2:** API §13.5 mantiene por resolver la condición→código/HTTP de `NETWORK_NOT_IN_ROUTER` frente a red inexistente/inactiva en reserva y aprovisionamiento; el código actual aún distingue `409` de `422` en `service-provisioning.service.ts:108-116`.
- **Cierre verificable:** fijar política de errores y probar IDs ajenos/inexistentes, padre incorrecto, recurso en otra sede e interfaz inactiva de otro router. No consultar estado antes de comprobar pertenencia/autorización.
- **Gate:** bloquea G4 mientras la matriz de errores de MOD13 conserve esta decisión abierta; la corrección de contratos/provisioning depende de SR-BACKEND.

### [SEC-REVIEW] SEC-M13-06 — Confirmación de protección en las tres rutas IPAM

- **Severidad:** Alta si se habilita captura antes de la protección.
- **Estado de diseño:** ADR-101 v1.1 y API v1.2 §10 requieren proteger por host todas las direcciones locales del tenant, también cross-router e interfaz inactiva, en reserva manual, automática y ocupación, sin moverlas a exclusiones. `ipProtection=PENDING` rechaza escrituras de direcciones; la protección no se desactiva con ese flag.
- **Estado de implementación:** el código actual de IPAM no incluye aún la consulta a direcciones locales; la protección no está desplegada. La matriz v0.4 programa CA-R12, I-1 y ambas carreras.
- **Cierre verificable:** PostgreSQL real prueba las tres rutas, host /32 normalizado, deduplicación, otra interfaz/router, estado inactivo, transiciones y carreras en ambos órdenes; I-1 queda en cero. La UI solo habilita captura cuando catálogo devuelve `ipProtection=ACTIVE` después de CA-R12.
- **Gate:** no bloquea G4 de tipos; bloquea CA-R12 y captura hasta pasar la prueba integrada.

### [SEC-REVIEW] SEC-M13-07 — Metadatos separados y pausa de aprovisionamiento

- **Severidad:** Media; impacto alto si una pausa deja una ruta de asignación libre.
- **Estado de diseño:** API/HLD D-14 separan `GET /network/catalog-meta` (`network.catalog.read`, devuelve solo `ipProtection`) de `GET /network/provisioning/meta` (`network.provisioning.read`, devuelve solo `reservationsPaused`). El enforcement no depende de que el consumidor pueda leer metadatos: reserve, replay que reemite instrucción y regularize devuelven `409 RESERVATIONS_PAUSED`; release/certify siguen disponibles para resolver estados vivos.
- **Cierre verificable:** O2/O3 prueba permiso positivo/negativo para ambos endpoints, ausencia de filtración cruzada, respuesta 409 sin mutación/emisión para execute/regularize sin `provisioning.read`, y que release/certify conservan su propósito. La UX muestra el estado cerrado sin inferirlo desde metadatos no autorizados.
- **Gate:** diseño consistente; pruebas runtime de rutas/permisos quedan en O2-H/O3. No reutilizar la pausa como sustituto de IPAM activo.

### [SEC-REVIEW] SEC-M13-08 — Confirmación de oráculo de IP protegida

- **Severidad:** Baja, dentro del tenant.
- **Hallazgo:** API v1.2 distingue `IP_PROTECTED_BY_INFRASTRUCTURE` de `IP_IN_USE`, y el texto informa que una dirección corresponde a infraestructura. Un operador con permiso de reserva puede aprender esa clasificación aunque no tenga `network.catalog.read`.
- **Disposición:** el mensaje no debe incluir router, interfaz, dirección ni ubicación. Mantenerlo como residual de reconocimiento de bajo impacto —similar al resultado de una IP ocupada ya existente— o usar un error público genérico para ambas causas si AI-EM-ARCH prioriza ocultar esa distinción. No bloquea G4 mientras el mensaje sea genérico en cuanto al recurso y no devuelva datos identificadores.

## 4. Otros controles y riesgos

- **Contratos/validación:** API v1.2 elige Zod para rutas tocadas y define exclusiones normalizadas, campos nullable y errores únicos. Verificar la paridad con OpenAPI y no mezclar `class-validator` y Zod en una ruta.
- **Integridad de datos:** modelo v1.5 incluye FK tenant/router compuesta para `ipv4_networks` `NOT VALID`, preflight de legado y rollback ordenado. No ejecutar `VALIDATE` hasta revisar filas históricas; no reescribir gateway/CIDR/servicios ni inferir interfaces desde `lanInterface`.
- **Aislamiento y boundaries:** tenant desde JWT/`TenantContext`; no acceder a tablas de Organization/Tenant/Access Control; consumir sus datos por puertos tipados. La aprobación de ADR-101 no permite mezclar sede física, nodo técnico y cobertura.
- **Auditoría de `correct`:** el contrato guarda `correctionReason` enumerado y before/after en una allowlist. La IP local se trata como dato operativo de infraestructura, sensible para reconocimiento; su clasificación como dato personal y retención regulatoria **requieren verificación con fuente oficial**. No incluir dirección en logs, URL, mensajes ni cuerpos de error.
- **Rendimiento:** el costo de ocupación por pool y el rango del conjunto protegido deben medirse con `EXPLAIN (ANALYZE, BUFFERS)` y volumen sintético antes de G6. Mantener límite de página y agregación por lote.
- **Nombres:** permanece SEC-M13-15, Baja: el contrato limita longitud y trimming, pero no especifica rechazo de caracteres de control/dirección de texto. Sanitizar/controlar antes de renderizar y decidir una allowlist si la identidad visual puede ser suplantada.
- **Rate limit:** permanece SEC-M13-16, Baja: catálogo bajo throttling global; evaluar cuota tenant-aware para escrituras en O2-H, sin bloquear G4.
- **Fuera de alcance:** no se evalúan NMS, RouterOS, credenciales, VLAN/bridges, ni autorización de cobertura/nodo más allá de verificar que sus dueños y puertos se mantengan separados.

## 5. Estado por gate

| Gate        | Estado de seguridad                                 | Evidencia/condición                                                                                                                                                          |
| ----------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1          | Esta revisión no es el dictamen cruzado de PRD/HLD. | Opción B y ADR-101 aprobadas; faltan revisiones independientes SR-BACKEND y PROD-UX y decisión de AI-EM-ARCH.                                                                |
| G2          | Sin dictamen de seguridad de UX/DS.                 | DS-OWNER/SR-QA revisan accesibilidad/estados; conservar el fail-closed de captura y el 409 de pausa.                                                                         |
| G3          | **Pendiente por SEC-M13-01.**                       | Factibilidad de autorización site-scoped con guard actual, sin falsa concesión y sin falso rechazo.                                                                          |
| G4          | **No emitido; condicionado.**                       | Resolver confirmación server-side de `correct`, política de 403/404 para sede no autorizada y errores de provisioning; publicar tipos/OpenAPI runtime y revisar su snapshot. |
| O2-H/O2-M   | Pendiente.                                          | Implementar autorización D-23, allowlist de auditoría, puertos y protección IPAM; pruebas HTTP y PostgreSQL con ambos órdenes de carrera.                                    |
| O3 / CA-R12 | Pendiente y bloquea captura.                        | Evidencia de las tres rutas IPAM, permisos de metadatos/pausa, rollback fail-closed y configuración segura por entorno.                                                      |
| G6/G6.5/G7  | No evaluados.                                       | Ejecutar gates y revisión final de seguridad sobre el diff integrado; CI Linux y aprobación de producción se mantienen separados.                                            |

## 6. Límite y reproducibilidad

Lectura estática de documentos y código, sin pruebas dinámicas ni migraciones. D-23 y los controles de auditoría requieren pruebas HTTP/integración; la protección IPAM y rollback requieren PostgreSQL real y evidencia operacional. No se determinó legalmente si las IP de infraestructura son datos personales. No se revisó TLS/Nginx ni configuración de despliegue. No se hallaron secretos ni PII real en las muestras inspeccionadas.

**Firma:** AI-SEC-ENG. Revisión independiente de diseño, no autorización de excepción ni declaración de gate.
