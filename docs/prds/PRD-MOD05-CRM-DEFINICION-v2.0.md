# PRD - MOD05 CRM Expediente Unico Progresivo

**Version:** 2.0  
**Estado:** Aprobado  
**Fecha:** 2026-03-23  
**Modo activo:** Architect  
**Autor:** AI-EM-ARCH (Lead Software Architect Senior)  
**Trazabilidad base:** docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md  
**PRD anterior:** PRD-MOD05-CRM-DEFINICION-v1.1 (perdido; absorbido en esta version)  
**HLD relacionado:** docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md  
**Informe relacionado:** docs/informes/INFORME-MOD05-DEFINICION-v1.0.md  
**Addendum de cierre Sprint 02:** docs/prds/PRD-MOD05-CRM-ADDENDUM-CIERRE-v2.1.md  
**ADRs aplicables:** ADR-016, ADR-018, ADR-019, ADR-022, ADR-024

> Nota de gobernanza: este PRD documenta la version vigente del modulo CRM. Las versiones v1.0 (CRM clasico) y v1.1 (lifecycle leads/prospects) fueron reemplazadas por el rediseno de Expediente Unico Progresivo aprobado en Sprint 02. Los documentos historicos no fueron preservados en disco; las decisiones se mantienen trazables via INFORME-MOD05-DEFINICION-v1.0.md y el addendum de cierre Sprint 02 emitido el 2026-03-26.

---

## 1. Contexto y motivacion

### 1.1 Evolucion del modulo

El CRM de iWana neXt atraveso tres iteraciones de diseno:

1. **PRD v1.0 — CRM clasico:** leads, suscriptores, contratos como entidades planas separadas.
2. **PRD v1.1 — Lifecycle comercial-operativo:** pipeline PotentialLead → ProspectCase → instalacion → cliente. Ejecutado en Sprint 01 con backend funcional (PotentialsModule, ProspectsModule, ReviewsModule) y portal basico.
3. **PRD v2.0 — Expediente Unico Progresivo (actual):** un registro maestro (`ExpedienteRecord`) reemplaza las entidades separadas. 8 secciones de captura progresiva, 12 estados de pipeline, 4 dimensiones de completitud, consentimiento triple, entidades hijas para trazabilidad.

### 1.2 Problema resuelto

Un ISP colombiano necesita gestionar todo el ciclo de vida comercial desde la captacion de un potencial hasta la activacion como cliente activo, con:

- Captura progresiva de datos (no toda la informacion esta disponible al primer contacto).
- Regulacion colombiana (Ley 1581 Habeas Data, CRC tiempos PQR, consentimiento triple).
- Trazabilidad operativa de cada cambio de estado, intento de contacto y verificacion de cobertura.
- Integracion con facturacion, provisioning, inventario y ordenes de trabajo (via puertos).
- Metricas de pipeline para gestion comercial.

### 1.3 Decision arquitectonica clave

El modelo Expediente Unico Progresivo unifica en un solo registro toda la informacion del prospecto, evitando la fragmentacion de datos entre entidades separadas (PotentialLead, ProspectCase, Subscriber) y simplificando el pipeline de 12 estados.

---

## 2. Alcance en scope / fuera de scope

### En scope

- Expediente Unico Progresivo como entidad maestra del pipeline comercial.
- 8 secciones de captura progresiva: identificacion, contacto, ubicacion, interes comercial, viabilidad tecnica, consentimiento legal, facturacion, instalacion.
- 12 estados de pipeline: NUEVO_POTENCIAL → CONTACTADO → PENDIENTE_DATOS → PRECALIFICADO → VALIDANDO_COBERTURA → VIABLE_COMERCIALMENTE → EN_COTIZACION → PENDIENTE_DECISION → LISTO_PARA_INSTALACION → INSTALACION_AGENDADA → CLIENTE_ACTIVO → DESCARTADO.
- 4 dimensiones de completitud: comercial (10 campos), legal (3 campos), tecnica (4 campos), operativa (6 campos).
- Consentimiento triple conforme a Ley 1581: tratamiento de datos, contacto comercial, contacto operativo.
- Entidades hijas: ContactAttempt, ConsentRecord v2, CoverageCheck, StatusChange.
- Cifrado AES-256-GCM para PII: documentNumber, phones, emails, altContactPhone, siteContactPhone.
- Validacion por transicion: cada cambio de estado tiene campos minimos requeridos.
- CRUD completo de expedientes con 8 endpoints REST.
- Vista pipeline con metricas recientes y resumen por estado.
- Portal empresarial con listado, detalle en accordion, timeline separado, panel metadata.
- 9 puertos de integracion con modulos futuros (mayoria stubs).
- Zod schemas para validacion de entrada en boundaries.
- Soporte para descarte y reactivacion.

### Fuera de scope

- Implementacion real de facturacion, provisioning, inventario, ticketing, ordenes de trabajo.
- Gestion de suscriptores como entidad independiente (legacy; absorbido en ExpedienteRecord hasta activacion).
- Flujo legacy PotentialLead/ProspectCase (deprecado; backend legacy preservado temporalmente).
- Integraciones con sistemas externos (DIAN, CRC, pasarelas de pago).
- Automatizacion de cobro, generacion de facturas o corte de servicio.
- ABM del catalogo de planes (pertenece a MOD03).
- Verificacion real de cobertura (pertenece a MOD03 via puerto).

### Decision de boundary

- CrmModule es bounded context propio. No comparte entidades con otros modulos.
- MOD03 provee cobertura y catalogo via ICoverageReadPort, IPlanCatalogReadPort.
- MOD03 provee politica de ejecucion via IExecutionPolicyReadPort.
- Facturacion, provisioning, inventario → puertos con stubs hasta implementacion real.
- Subscriber entity legacy se mantiene en CRM pero no se crea hasta activacion como cliente.

---

## 3. Personas y casos de uso

### Personas primarias

| Persona | Rol | Necesidad principal |
| --- | --- | --- |
| Asesor comercial | SALES | Capturar y gestionar expedientes desde primer contacto hasta cierre |
| Jefe comercial | ADMIN | Supervisar pipeline, metricas, asignar expedientes |
| Tecnico de campo | TECHNICIAN | Consultar expediente para instalacion agendada |

### Personas secundarias

| Persona | Rol | Necesidad principal |
| --- | --- | --- |
| Soporte | SUPPORT | Consultar expediente en contexto de PQR |
| Admin plataforma | SYSTEM_ADMIN | Gestion cross-tenant de expedientes |

### Casos de uso

| CU | Actor | Descripcion |
| --- | --- | --- |
| CU-01 | Asesor | Crear expediente con nombre y fuente (captura rapida) |
| CU-02 | Asesor | Completar secciones de forma progresiva segun informacion disponible |
| CU-03 | Asesor | Transicionar estado del expediente cumpliendo campos minimos |
| CU-04 | Asesor | Registrar intento de contacto con canal, resultado y notas |
| CU-05 | Asesor | Obtener verificacion de cobertura (via puerto MOD03) |
| CU-06 | Asesor | Registrar consentimiento triple (Ley 1581) |
| CU-07 | Jefe | Consultar pipeline summary (metricas por estado) |
| CU-08 | Asesor | Descartar expediente con motivo |
| CU-09 | Admin | Reactivar expediente descartado |
| CU-10 | Asesor | Consultar timeline del expediente (cambios, actividades, metadata) |

---

## 4. Requisitos funcionales

### RF-CRM-01: Creacion rapida de expediente
- POST /api/v1/crm/expedientes con `fullName` (1-160 chars) y `source` (1-120 chars).
- Estado inicial: NUEVO_POTENCIAL.
- `createdBy` = actor autenticado (JWT sub).
- Completitud inicializada a 0% en 4 dimensiones.
- Validacion Zod via `ZodBodyValidationPipe(CreateExpedienteSchema)`.

### RF-CRM-02: Listado con filtros y paginacion
- GET /api/v1/crm/expedientes con query: status (enum), municipality, search (fullName), page, limit.
- Retorna `{ data: ExpedienteRecord[], total }`.
- Multi-tenant: opera sobre schema del tenant autenticado.

### RF-CRM-03: Detalle con completitud
- GET /api/v1/crm/expedientes/:id
- Retorna `{ data: ExpedienteRecord, completeness: { commercial, legal, technical, operational } }`.
- Incluye relaciones: contactAttempts, consents, coverageChecks, statusChanges.

### RF-CRM-04: Actualizacion por seccion
- PATCH /api/v1/crm/expedientes/:id/sections/:section
- Section = IDENTIFICATION | CONTACT | LOCATION | COMMERCIAL_INTEREST | TECHNICAL_FEASIBILITY | LEGAL_CONSENT | BILLING | INSTALLATION.
- Cifra campos PII al guardar.
- Recalcula completitud tras mutacion.
- Validacion Zod del body.

### RF-CRM-05: Transicion de estado con validacion
- PATCH /api/v1/crm/expedientes/:id/status
- Valida campos minimos requeridos por transicion objetivo (ver tabla en §4.1).
- Registra StatusChange (entidad hija).
- Recalcula completitud.
- BadRequestException con codigo semantico si transicion invalida.
- `changedBy` = actor autenticado.

### RF-CRM-06: Descarte y reactivacion
- Transicion a DESCARTADO: siempre permitida desde cualquier estado; requiere `reason`.
- Reactivacion: POST /api/v1/crm/expedientes/:id/reactivate → restaura `previousStatus`.

### RF-CRM-07: Timeline separado
- GET /api/v1/crm/expedientes/:id/timeline
- Retorna `{ changes: StatusChange[], activities: ContactAttempt[], metadata: {...} }`.
- Metadata incluye createdBy con resolucion de actor real.

### RF-CRM-08: Pipeline summary
- GET /api/v1/crm/pipeline/summary
- Retorna conteo por estado: `{ data: Record<ExpedienteStatus, number>, total }`.

### 4.1 Campos minimos por transicion

| Estado objetivo | Campos requeridos |
| --- | --- |
| CONTACTADO | Telefono o email |
| PRECALIFICADO | Tipo documento, numero documento, telefono o email, direccion, municipio |
| VALIDANDO_COBERTURA | Coordenadas (lat/lng) O direccion+municipio |
| VIABLE_COMERCIALMENTE | Sin restriccion adicional |
| EN_COTIZACION | Plan de interes seleccionado |
| PENDIENTE_DECISION | Sin restriccion adicional |
| LISTO_PARA_INSTALACION | Direccion instalacion, contacto en sitio |
| INSTALACION_AGENDADA | Ticket vinculado, orden de trabajo vinculada |
| CLIENTE_ACTIVO | Completitud >= 90% en 4 dimensiones + checklist completo |
| DESCARTADO | Siempre permitido |

---

## 5. Requisitos no funcionales

| RNF | Descripcion | Criterio |
| --- | --- | --- |
| RNF-01 | Cifrado PII at-rest | AES-256-GCM para 6 campos; IV unico por registro |
| RNF-02 | Rendimiento listado | Paginacion offset con total; < 200ms para 100 registros |
| RNF-03 | Multi-tenant | Aislamiento total por schema PostgreSQL |
| RNF-04 | Validacion Zod | En todos los boundaries de entrada (create, updateSection, transitionStatus) |
| RNF-05 | Consentimiento triple | Ley 1581: DATA_TREATMENT, COMMERCIAL_CONTACT, OPERATIONAL_CONTACT |
| RNF-06 | Auditoria status | Cada transicion registrada en StatusChange con changedBy = actor real |
| RNF-07 | Degradacion segura | CompletenessCalculator tolera errores DB (42P01/42703) sin crash |
| RNF-08 | Accesibilidad portal | WCAG 2.2 AA; labels en espanol |

---

## 6. Modelo de datos

### 6.1 ExpedienteRecord (~60 columnas)

Entidad maestra organizada en 8 secciones + referencias operativas + completitud + metadatos. Ver HLD-MOD05-ARQUITECTURA-v2.0.md para esquema completo.

### 6.2 Entidades hijas

| Entidad | Tabla | Relacion | Proposito |
| --- | --- | --- | --- |
| ContactAttempt | contact_attempts | ManyToOne → ExpedienteRecord | Trazabilidad de intentos de contacto |
| ConsentRecord v2 | consent_records | ManyToOne → ExpedienteRecord | Consentimiento triple Ley 1581 |
| CoverageCheck | coverage_checks | ManyToOne → ExpedienteRecord | Verificaciones de cobertura |
| StatusChange | status_changes | ManyToOne → ExpedienteRecord | Historial de transiciones |

### 6.3 Entidades legacy preservadas

| Entidad | Tabla | Estado |
| --- | --- | --- |
| PotentialLead | potential_leads | Deprecada — absorbida por ExpedienteRecord |
| ProspectCase | prospect_cases | Deprecada — absorbida por ExpedienteRecord |
| ConsentRecord v1 | consent_records (legacy) | Deprecada — evolucionada a v2 |
| CustomerActivation | customer_activations | Deprecada — absorbida en transiciones |

### 6.4 Entidades auxiliares CRM

| Entidad | Tabla | Estado |
| --- | --- | --- |
| Quote | quotes | Activa — FK dual: opportunityId (legacy) + expedienteId (v2) |
| Contract | contracts | Activa — FK quoteId |
| Subscriber | subscribers | Activa — creacion post-CLIENTE_ACTIVO |
| SubscriberContact | subscriber_contacts | Activa — contactos del suscriptor |
| Opportunity | opportunities | Legacy — reemplazada conceptualmente por expediente |
| HabeasDataConsent | habeas_data_consents | Legacy — reemplazada por ConsentRecord v2 |
| ArcoRequest | arco_requests | Activa — derechos ARCO Ley 1581 |

---

## 7. Completitud 4 dimensiones

### Comercial (10 campos, peso uniforme)
fullName, documentType, documentNumberEncrypted, phonePrimaryEncrypted (x2), emailPrimaryEncrypted, source, interestedPlanId, casePriority, quotes.length > 0.

### Legal (3 campos)
ConsentRecord tipo DATA_TREATMENT ACCEPTED, ConsentRecord tipo COMMERCIAL_CONTACT ACCEPTED, identityVerified === 'verified'.

### Tecnica (4 campos)
coverageChecks.length > 0, coverageCheck con result VIABLE o CONDITIONAL, availableTechnology, estimatedEquipment.

### Operativa (6 campos)
installationAddress, siteContactName, siteContactPhoneEncrypted, paymentMethod, billingCycle, fiscalName.

Completitud total: promedio de las 4 dimensiones. Para CLIENTE_ACTIVO se requiere >= 90% en cada una.

---

## 8. Consentimiento triple (Ley 1581)

| Tipo | Proposito | Momento |
| --- | --- | --- |
| DATA_TREATMENT | Autorizacion para tratamiento de datos personales | Antes de almacenar PII |
| COMMERCIAL_CONTACT | Autorizacion para contacto con fines comerciales | Al avanzar a PRECALIFICADO |
| OPERATIONAL_CONTACT | Autorizacion para contacto operativo post-instalacion | Antes de LISTO_PARA_INSTALACION |

Cada consentimiento registra: canal, fecha, IP, version del texto legal, referencia de evidencia.

---

## 9. Puertos de integracion

| Puerto | Interfaz | Modulo proveedor | Estado |
| --- | --- | --- | --- |
| CoverageReadPort | checkAvailability(tenantId, schema, address, coords?) | MOD03 | Adaptador real |
| ExecutionPolicyReadPort | resolvePolicy(tenantId, schema) | MOD03 | Adaptador real |
| PlanCatalogReadPort | getActivePlans(), createSnapshot() | MOD03 | Stub |
| TicketReferencePort | ensureReference(tenantId, schema, ticketId) | MOD-Ticketing | Stub |
| WorkOrderReferencePort | ensureReference(tenantId, schema, workOrderId) | MOD-WorkOrders | Stub |
| InventoryAssignmentPort | registerAssignment(tenantId, schema, prospectId) | MOD-Inventory | Stub |
| ExpansionRequestPort | createRequest(tenantId, schema, ...) | MOD-Network | Stub |
| BillingActivationPort | activate(tenantId, schema, ...) | MOD-Billing | Stub |
| ProvisioningActivationPort | activate(tenantId, schema, ...) | MOD-Provisioning | Stub |

---

## 10. Contratos API

### POST /api/v1/crm/expedientes
- **Guards:** JwtAuth, Roles (ADMIN, SALES, SUPPORT, SYSTEM_ADMIN)
- **Body:** CreateExpedienteSchema — `{ fullName: string(1-160), source: string(1-120) }`
- **Response 201:** `{ data: ExpedienteRecord }`

### GET /api/v1/crm/expedientes
- **Guards:** JwtAuth, Roles
- **Query:** status?, municipality?, search?, page?, limit?
- **Response 200:** `{ data: ExpedienteRecord[], total }`

### GET /api/v1/crm/expedientes/:id
- **Response 200:** `{ data: ExpedienteRecord, completeness }`

### PATCH /api/v1/crm/expedientes/:id/sections/:section
- **Body:** `{ data: Record<string, unknown> }`
- **Response 200:** `{ data: ExpedienteRecord }`

### PATCH /api/v1/crm/expedientes/:id/status
- **Body:** `{ targetStatus: ExpedienteStatus, reason?: string(max 255) }`
- **Response 200:** `{ data, completeness }`

### POST /api/v1/crm/expedientes/:id/reactivate
- **Response 200:** `{ data: ExpedienteRecord }`

### GET /api/v1/crm/expedientes/:id/timeline
- **Response 200:** `{ data: { changes, activities, metadata } }`

### GET /api/v1/crm/pipeline/summary
- **Response 200:** `{ data: Record<status, count>, total }`

---

## 11. Seguridad y cumplimiento

### Ley 1581/2012 — Habeas Data
- Consentimiento triple obligatorio (DATA_TREATMENT, COMMERCIAL_CONTACT, OPERATIONAL_CONTACT).
- Derechos ARCO via ArcoRequest entity.
- PII cifrada at-rest con AES-256-GCM (6 campos).
- Evidencia de consentimiento: canal, IP, version texto legal, referencia.

### CRC (Comision de Regulacion de Comunicaciones)
- Trazabilidad de tiempos en pipeline para reportes PQR.
- StatusChange con timestamps para cumplimiento de plazos.

### RBAC
- ADMIN, SALES, SUPPORT, SYSTEM_ADMIN para lectura y operaciones.
- Solo ADMIN, SALES, SYSTEM_ADMIN para transiciones y reactivacion.
- Guards: JwtAuthGuard + RolesGuard con UserRole enum.

---

## 12. Criterios de aceptacion

| CA | Descripcion |
| --- | --- |
| CA-01 | Crear expediente rapido con solo fullName y source |
| CA-02 | Completar secciones de forma progresiva; completitud recalculada en cada mutacion |
| CA-03 | Transiciones de estado validan campos minimos requeridos |
| CA-04 | Consentimiento triple registrado con canal, IP, texto legal |
| CA-05 | Timeline separado: changes, activities, metadata con actor real |
| CA-06 | Pipeline summary funcional con conteo por estado |
| CA-07 | PII cifrada at-rest; datos descifrados solo en respuesta API |
| CA-08 | Descarte con motivo y reactivacion restauran previousStatus |
| CA-09 | Portal: listado con filtros, detalle accordion 8 secciones, guardar por seccion |
| CA-10 | CompletenessCalculator degrada sin crash ante errores DB |

---

## 13. Riesgos residuales

| Riesgo | Severidad | Estado |
| --- | --- | --- |
| Tests con datos reales de tenant insuficientes | Media | Pendiente |
| E2E escenarios error/descarte/reactivacion | Media | Pendiente |
| Revision seguridad campos cifrados en respuestas | Media | Pendiente |
| Retiro definitivo flujo legacy Sprint 01 backend | Baja | Documentado |
| Enums CRM sin fuente .ts en packages/shared/src | Media | Solo compilados en dist |

---

## 14. Decision de salida

**GO** — El modulo CRM con Expediente Unico Progresivo esta implementado, operativo en portal, con 8 secciones de captura, 12 estados, completitud 4D, consentimiento triple y 9 puertos de integracion. Riesgos residuales documentados para Sprint 03.

---

*Documento reconstruido por AI-EM-ARCH a partir del INFORME-MOD05-DEFINICION-v1.0.md (v2.8) y el codigo fuente implementado, como parte de la restauracion de gobernanza documental MOD05.*
