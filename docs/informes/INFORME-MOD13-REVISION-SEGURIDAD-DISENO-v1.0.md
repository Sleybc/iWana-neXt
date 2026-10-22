# INFORME-MOD13 — Revisión de seguridad de diseño · Fase 01

**Versión:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-10-22  
**Emisor:** AI-SEC-ENG  
**Alcance:** bloque S0, revisión de diseño en solo lectura de PRD-MOD13, HLD-MOD13 congelado y ADR-098. No se revisó una implementación ni se ejecutaron pruebas.

## Decisión Q2

**Q2 se cierra confirmando `network.provisioning.read` como permiso requerido para la sección técnica de la ficha del suscriptor.** La sección expone IP, router, red, método, CPE, estado y certificador; concederla por `crm.subscribers.read` amplía el acceso técnico a usuarios CRM sin acreditar necesidad operativa. Se sigue el valor por defecto de HLD §11, que ya indica que quien no tenga `network.provisioning.read` no ve la sección.

La alternativa `crm.subscribers.read` de HLD §6.2 queda descartada por esta decisión; §9 remite a Q2. No edité el contrato congelado. Si se requiere eliminar esa alternativa del texto canónico, corresponde a AI-EM-ARCH hacerlo mediante re-sync versionado.

## Resultado

La revisión confirma controles útiles de autenticación/autorización, integridad de eventos y minimización de datos en la reserva. El diseño mantiene riesgos abiertos en la condición de maker-checker cuando la OT no tiene técnico asignado, en las precondiciones y auditoría de regularización, en una discrepancia de permisos entre PRD y HLD, y en la proyección de datos al técnico.

| Severidad | Hallazgos |
| --------- | --------: |
| P0        |         0 |
| P1        |         4 |
| P2        |         3 |
| P3        |         0 |

**Cierre de seguridad:** no cerrar G5 mientras sigan abiertos los P1. Hay dos `[BLOQUEO]` de contrato: el caso de maker-checker sin técnico asignado y la discrepancia de quién puede regularizar. No se identifica vulnerabilidad crítica confirmada ni se solicita excepción de seguridad.

## Hallazgos

### [SEC-REVIEW] R6 no falla cerrado cuando no hay técnico asignado

**Archivo:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.0.md` §5.1 y §6.2, líneas 264–268 y 377–380; trazabilidad en §10, línea 507.  
**Severidad:** P1  
**OWASP ASVS:** control de autorización y separación de funciones.  
**Hallazgo:** `assignedTechnicianId` puede ser `null`, pero la regla de certificación solo comprueba `actor.sub !== assignedTechnicianId`. Con valor nulo la comparación siempre permite continuar para un `sub` válido; no se demuestra que quien certifica sea distinto de quien ejecutó la instalación. `reserve` tampoco enumera una precondición de asignación de técnico.  
**Corrección requerida:** fallar cerrado si no hay técnico asignado y exigir que el certificador sea distinto, o definir y comprobar una identidad confiable del ejecutor. No aceptar `null` como evidencia de independencia.  
**Referencia:** PRD-MOD13 §6 R6; ADR-098 D4.

**[BLOQUEO]** El HLD congelado permite `assignedTechnicianId: null` y no fija la conducta para ese caso. AI-EM-ARCH debe resolverlo y registrar el contrato por el mecanismo versionado vigente antes de cerrar el diseño de B2. No se modifica el HLD aquí.

### [SEC-REVIEW] Regularización no especifica todas las guardas R12 en el contrato de servicio

**Archivo:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.0.md` §6.2 y §10, líneas 361 y 514; modelo en §3.2, líneas 141–157.  
**Severidad:** P1  
**OWASP ASVS:** control de autorización de transacciones sensibles e integridad de datos.  
**Hallazgo:** `regularize` crea el servicio directamente como `ACTIVE`, pero la fila del endpoint solo define permiso y cuerpo, y la trazabilidad R12 apunta a `origin`, `regularization_reason` y `ck_sp_regularized`. No explicita las comprobaciones de elegibilidad de la OT ni la ausencia de un servicio activo. La restricción de base de datos solo obliga a que exista un motivo para `REGULARIZED`; no impone esas precondiciones.  
**Corrección requerida:** antes de asignar IP o activar, comprobar en backend que la OT sea `INSTALLATION`, esté cerrada con resultado `EXECUTED` o `EXECUTED_WITH_OBSERVATIONS` y no tenga servicio activo; aplicar el cambio de forma transaccional e idempotente. Rechazar cualquier otro estado aunque la petición provenga de la UI autorizada.
**Referencia:** PRD-MOD13 §6 R12; ADR-098 D10.

### [SEC-REVIEW] Permiso de regularización contradice el actor del PRD

**Archivo:** `docs/prds/PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.0.md` §4, línea 65; `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.0.md` §6.2 y §7, líneas 361 y 464–471.  
**Severidad:** P1  
**OWASP ASVS:** autorización basada en roles y permisos.  
**Hallazgo:** el PRD asigna regularizar a Aprovisionamiento/NOC; la matriz congelada del HLD concede `network.provisioning.regularize` a `ADMIN`, pero no a NOC ni a la plantilla «Acceso estándar Aprovisionamiento». La ruta requiere ese permiso, así que el actor de negocio descrito por el PRD no puede ejecutar la acción según el contrato técnico.  
**Corrección requerida:** resolver explícitamente si regulariza NOC, ADMIN o ambos; alinear el PRD y la matriz/plantillas del HLD sin ampliar el permiso por inferencia. Mantener el permiso dedicado y comprobarlo en servidor.  
**Referencia:** PRD-MOD13 §4; HLD-MOD13 §6.2 y §7; ADR-098 D10.

**[BLOQUEO]** Es un conflicto entre fuentes aprobadas que afecta el control de acceso. AI-EM-ARCH debe resolverlo antes de que B2 implemente la matriz. No edité PRD ni HLD.

### [SEC-REVIEW] La auditoría de todas las mutaciones, en especial regularizar y certificar, no queda garantizada

**Archivo:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.0.md` §6.2, líneas 339–347 y 358–361; reserva en línea 373; regla R14 en §10, línea 516.  
**Severidad:** P1  
**OWASP ASVS:** registro de eventos de seguridad y trazabilidad de transacciones sensibles.  
**Hallazgo:** el diseño indica auditoría para cambios de `network_settings`, reserva y liberación, pero no establece de forma equivalente el registro de creación/edición/desactivación de routers, redes y perfiles, certificación ni regularización. Regularizar es una mutación privilegiada que crea directamente un servicio `ACTIVE`; ADR-098 §Riesgos exige auditoría como mitigación. Los campos de estado y motivo no sustituyen por sí solos un registro auditable de actor, tenant, recurso, fecha y resultado.  
**Corrección requerida:** exigir trazabilidad para cada operación CUD y para las mutaciones asíncronas, con actor, tenant, acción, recurso, timestamp y resultado; para regularización conservar el motivo. No incluir nombre, documento, teléfono, credenciales, tokens ni payloads completos. Verificar que un fallo de auditoría no convierta una acción sensible en una mutación silenciosa.  
**Referencia:** perfil AI-SEC-ENG §5.2, §7.4 y §9.1; ADR-098 §Riesgos, R5.

### [SEC-REVIEW] El contexto de una OT puede serializar más datos de los que el panel autoriza al técnico

**Archivo:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.0.md` §6.2, §6.5 y §9, líneas 357, 431–439 y 493.  
**Severidad:** P2  
**OWASP ASVS:** autorización a nivel de objeto y minimización de datos.  
**Hallazgo:** el técnico puede leer `context` por `operations.execution_orders.read` si está asignado a la OT. El HLD dice que se omiten `contracts`, `evidences` y `routerInstruction`, pero el DTO sigue enumerando `plan` (incluido `pcqAddressList`), CPE (serial y MAC) y el `ServiceProvisioningDto` sin una proyección reducida definida. El propio HLD §9 dice que el técnico solo ve estado e IP. Ocultar campos en la UI no limita la respuesta de API.  
**Corrección requerida:** construir la respuesta del servidor según el permiso/actor: para TECHNICIAN devolver únicamente el estado y la IP que el PRD permite ver en sus propias OT; no serializar campos sobrantes del objeto completo. Mantener el filtro por tenant y por `assignedTechnicianId` en el servicio, no solo en el cliente.
**Referencia:** PRD-MOD13 §4; HLD-MOD13 §6.2, §6.5 y §9.

### [SEC-REVIEW] El contrato no deja trazado el pipeline de seguridad completo para los endpoints nuevos

**Archivo:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.0.md` §6.2, línea 332.  
**Severidad:** P2  
**OWASP ASVS:** autenticación, autorización, validación de entrada y protección contra abuso.  
**Hallazgo:** el HLD declara `JwtAuthGuard`, `TenantGuard` y `@Permissions` en todos los endpoints, pero no vincula el módulo con rate limiting, terminación TLS, validación explícita de JWT RS256 (`exp`, `iss`, tipo), resolución de tenant desde el JWT, ABAC de ownership ni el mecanismo runtime para validar params/query/body. El diseño no permite confirmar la cadena completa exigida por el perfil; no se presume que el nombre de un guard configure todos esos controles.  
**Corrección requerida:** mapear los endpoints al pipeline compartido ya aprobado y dejar verificación explícita de la configuración global y local en V2. Aplicar límites por tenant/actor a comandos costosos como reserva y regularización, además de límites de cuerpo y paginación. No duplicar controles si ya están configurados globalmente: demostrar su cobertura.
**Referencia:** perfil AI-SEC-ENG §5.4 y §7.1–7.3; HLD-MOD13 §6.2.

### [SEC-REVIEW] `last_error` no tiene política de saneado

**Archivo:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.0.md` §3.2 y §6.3, líneas 186 y 398.  
**Severidad:** P2  
**OWASP ASVS:** protección de datos sensibles y manejo seguro de errores.  
**Hallazgo:** el inbox persiste `last_error` como texto y el consumidor lo rellena al fallar, sin definir si se guarda un mensaje de excepción sin filtrar. Errores de base de datos, adaptadores o listeners pueden contener valores de entrada o identificadores operativos; eso no debe convertirse en un canal de PII o secretos.  
**Corrección requerida:** persistir códigos de error estables y un contexto técnico allowlisted; redaccionar mensajes externos y no almacenar excepción cruda, SQL, tokens ni payload del evento. Mantener los logs sin datos que unan una IP con nombre, documento o teléfono, conforme a R14.
**Referencia:** PRD-MOD13 §6 R14; ADR-098 §Impacto declarado, Seguridad.

## Controles revisados y STRIDE

| Área / STRIDE                    | Evaluación de diseño                                                                                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Suplantación (S)**             | Control favorable: la cola firmada exige HMAC y `timingSafeEqual` antes de validar el esquema (HLD §4.3); el consumidor verifica antes de `TenantContext.run` (HLD §6.3). Los endpoints REST declaran autenticación y tenant guards. Confirmar la configuración de claims JWT en V2. |
| **Manipulación (T)**             | Control favorable: evento canonizado incluye tenant, el HMAC cubre el envelope, la inbox usa unicidad por tenant/evento y las mutaciones de catálogo usan `version`. Verificar esquema runtime para todos los inputs, no solo `ControlParamsSchema`.                                 |
| **Repudio (R)**                  | Parcial: reserva y liberación tienen auditoría descrita; la trazabilidad de todas las mutaciones y de regularización/certificación debe quedar garantizada (P1).                                                                                                                     |
| **Divulgación (I)**              | Parcial: se omiten algunos campos al técnico y Q2 restringe la ficha a `network.provisioning.read`; la proyección restante del DTO y `last_error` requieren minimización/saneado (P2).                                                                                               |
| **Denegación de servicio (D)**   | El cálculo IP está acotado por tamaño de red y usa lock por segmento (HLD §3.1/§6.1). El HLD no expresa límites de tasa/cuerpo ni topes de página; verificar el rate limiter compartido y límites de entrada antes de G5 (P2).                                                       |
| **Elevación de privilegios (E)** | Parcial: hay matriz explícita y permisos dedicados. La condición nullable de R6 y la contradicción NOC/ADMIN en regularización deben resolverse (P1).                                                                                                                                |

## Estado de controles de la solicitud

- **Maker-checker (R6):** incompleto para `assignedTechnicianId = null`; P1 y bloqueo de contrato.
- **HMAC antes del esquema (§4.3):** conforme en diseño; usa comparación de tiempo constante y el tenant está incluido en la canonicalización.
- **Regularización (R12):** el motivo y el origen persistido están contemplados; las precondiciones server-side y su auditoría requieren garantía explícita.
- **Permisos (§7):** claves dedicadas y guardas declaradas; conflicto de actor para `regularize` bloquea la implementación de la matriz.
- **`ProvisioningOrderContextDto` (§6.5):** la rama del técnico debe exponer solo estado e IP de su OT; el DTO actual describe más campos.
- **Auditoría y PII:** R14 y la auditoría de reserva no incluyen datos directos del suscriptor; cubrir el inbox y todas las mutaciones con datos allowlisted y sin PII.
- **Tenancy:** el diseño ubica datos en schema del tenant, incluye `tenant_id` y verifica la firma antes de establecer `TenantContext`; la V2 debe comprobar filtros de tenant en las consultas y ownership por recurso.

## Condiciones de cierre

1. AI-EM-ARCH resuelve los dos `[BLOQUEO]` del contrato: R6 cuando falta técnico asignado y el actor habilitado para regularizar.
2. Sr-backend implementa y demuestra las guardas R12, el audit trail completo y la proyección reducida del DTO del técnico.
3. V2 verifica rate limiting, TLS, claims JWT, resolución tenant, RBAC/ABAC, validación runtime, ausencia de PII/secretos y límites de entrada en la configuración real.
4. Revisión de seguridad de implementación sin P0/P1 abiertos para satisfacer G5.

No se evaluó cumplimiento regulatorio externo. La fuente revisada no requiere concluir una obligación regulatoria nueva.

## Verificación v1.1

**Alcance:** contraste de solo lectura contra PRD-MOD13 y HLD-MOD13 v1.1, incluida su sección de cambios §12. No se revisó implementación ni configuración runtime. El ADR-098 revisado es aprobado; esta verificación no amplía su alcance.

**Resultado de diseño:** los cuatro P1 y los tres P2 quedan cubiertos por el contrato v1.1. La comprobación runtime y las pruebas de abuso siguen pendientes para V2; esta revisión documental no cierra G5. No quedan bloqueos de diseño abiertos en los hallazgos de esta revisión.

| Hallazgo v1.0                                                    | Estado v1.1                      | Evidencia del contrato                                                                                                                                                                                                    | Verificación que queda para V2                                                                                                                                                                                                  |
| ---------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 · R6 permite certificar cuando `assignedTechnicianId` es nulo | **Cerrado en diseño**            | HLD §6.2 rechaza técnico nulo en `reserve`, `certify` y `regularize`, exige actor distinto al técnico; R6 ter queda trazado en §10.                                                                                       | Probar respuesta cerrada ante técnico nulo y rechazo maker-checker en los tres comandos.                                                                                                                                        |
| P1 · `regularize` no enumera las guardas R12                     | **Cerrado en diseño**            | HLD §6.2 define elegibilidad de OT, ausencia de servicio `ACTIVE`, lock por OT, validaciones de reserva, actualización transaccional e idempotencia; PRD v1.1 R12 es coherente.                                           | Probar estados no elegibles, servicio activo existente, concurrencia/idempotencia y rollback transaccional.                                                                                                                     |
| P1 · actor de regularización contradice el PRD                   | **Cerrado en diseño**            | PRD v1.1 §4 asigna regularización a Aprovisionamiento/NOC; HLD §7 otorga el permiso dedicado a ADMIN y NOC / «Acceso estándar Aprovisionamiento», con decisión CTO fechada.                                               | Verificar en servidor el permiso y la matriz/plantillas efectivamente cargadas.                                                                                                                                                 |
| P1 · no se garantiza auditoría de cada mutación                  | **Cerrado en diseño**            | HLD §6.8 exige `AuditService.logWithin` dentro de la transacción, revierte ante fallo y enumera mutaciones de catálogo, reserva, certificación, liberación, regularización y procesos asíncronos; excluye PII y payloads. | Trazar cada ruta CUD y confirmar atomicidad, actor, recurso, tenant, resultado y minimización de campos en la implementación.                                                                                                   |
| P2 · el contexto puede exponer datos excedentes al técnico       | **Cerrado en diseño**            | HLD §4.4 fija `TechnicianProvisioningViewDto` de cinco campos; §6.2 exige respuesta separada según permiso/actor y §6.5 prohíbe construirla filtrando la proyección completa.                                             | Verificar ownership por OT y comparar la respuesta HTTP real con los cinco campos permitidos.                                                                                                                                   |
| P2 · el pipeline de seguridad no está trazado para los endpoints | **Pendiente de verificación V2** | HLD §6.9 vincula guardas globales, autenticación, tenant, permisos, throttling por actor, límites, UUID y validación estricta; reserva a V2 la comprobación de configuración real de claims, tenant, ownership y límites. | Aportar evidencia de rate limiting, TLS 1.3, JWT RS256 con `exp`, `iss` y tipo, tenant derivado del JWT, RBAC de la matriz, ABAC/ownership, validación runtime y límites. No inferir estos controles por el nombre de un guard. |
| P2 · `last_error` no tiene política de saneado                   | **Cerrado en diseño**            | HLD §3.2 y §6.3 reemplazan texto libre por `last_error_code` de lista cerrada y limitan el detalle de log sin payload, IP ni datos del suscriptor.                                                                        | Revisar logs y errores reales para confirmar que no se persistan excepciones crudas ni datos sensibles.                                                                                                                         |

**Cierre:** HLD v1.1 resuelve en diseño los cuatro P1 y los tres P2 del informe v1.0. El P2 del pipeline queda pendiente de evidencia de configuración e implementación V2, como prescribe §6.9; no se declara verificado en esta revisión. G5 permanece sujeto a la revisión de implementación y a que no haya hallazgos P0/P1 abiertos.
