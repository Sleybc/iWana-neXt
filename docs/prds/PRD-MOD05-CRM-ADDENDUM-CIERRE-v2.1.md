# PRD - MOD05 CRM Addendum de Cierre Sprint 02 — Entidades Hijas, Compliance y Consolidacion

**Version:** 2.1  
**Estado:** Aprobado para cierre extendido de Sprint 02  
**Fecha:** 2026-03-26  
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH (Engineering Manager + Lead Software Architect)  
**PRD base:** docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md  
**HLD base:** docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md  
**ADRs aplicables:** ADR-016, ADR-018, ADR-019, ADR-022, ADR-024  
**Informe vigente:** docs/informes/INFORME-MOD05-DEFINICION-v1.0.md (v3.0)  
**Sprint anterior:** docs/sprints/PLAN-MOD05-CRM-SPRINT-02-v1.0.md

---

## 1. Contexto

Sprint 02 implemento el nucleo del Expediente Unico Progresivo: ExpedienteRecord (~60 columnas), 8 endpoints REST, 12 estados, completitud 4D, cifrado AES-256-GCM y portal con overview/listado/detalle. Las 26 tareas del backlog fueron completadas.

Sin embargo, la auditoria post-sprint identifico que las **entidades hijas** (ContactAttempt, ConsentRecord v2, CoverageCheck) quedaron como entidades de datos sin CRUD expuesto. Esto genera tres gaps criticos:

1. **CU-04 incompleto** — El asesor no puede registrar intentos de contacto desde el portal.
2. **Ley 1581 sin demostrabilidad** — El consentimiento triple existe como entidad pero no tiene gestion independiente.
3. **CU-05 incompleto** — Las verificaciones de cobertura no se pueden crear ni consultar como historial.

Este addendum completa el PRD v2.0 como parte del cierre extendido de Sprint 02, integrando los requisitos funcionales faltantes, la consolidacion de deuda tecnica y el hardening de seguridad necesarios para cerrar los tres gaps detectados en auditoria.

---

## 2. Alcance de cierre Sprint 02

### En scope

- **CRUD de entidades hijas:** ContactAttempt, ConsentRecord v2, CoverageCheck.
- **Enums faltantes:** ContactChannel, ContactResult, EvidenceMode en `packages/shared/src/enums/crm/`.
- **UI portal para entidades hijas:** tab/seccion de intentos de contacto, gestion de consentimientos, historial de cobertura.
- **Asignacion de expediente:** campo `assignedTo` (uuid FK) para ownership del asesor.
- **Actor name resolution:** denormalizacion `actorName` en StatusChange y ContactAttempt.
- **Busqueda mejorada:** busqueda por numero de documento (descifrado en query) y filtro por asesor asignado.
- **Audit de seguridad PII:** revision de campos cifrados en respuestas API, campos sensibles no expuestos en listados.
- **E2E expandido:** escenarios de error, descarte/reactivacion, filtros, entidades hijas.
- **Limpieza legacy:** remocion de endpoints deprecated (PotentialsModule, ProspectsModule, ReviewsModule).
- **Tests >= 80% cobertura** en servicios core + servicios hijos.

### Fuera de scope

- Implementacion real de puertos stub (billing, provisioning, inventory, tickets, work orders).
- Exportacion CSV/Excel de pipeline (fase posterior).
- Notificaciones automaticas por inactividad (fase posterior).
- Flujo ARCO automatizado (fase posterior; ArcoRequest entity existe pero sin workflow).
- Subscriber creation automatica al alcanzar CLIENTE_ACTIVO (fase posterior; definicion de boundary pendiente).

---

## 3. Requisitos funcionales nuevos

### RF-CRM-09: CRUD de intentos de contacto (ContactAttempt)

- **POST /api/v1/crm/expedientes/:id/contact-attempts**
  - Body: `{ channel: ContactChannel, result: ContactResult, durationMinutes?: number, notes?: string }`
  - `advisorId` = actor autenticado (`@CurrentUser().sub`).
  - `attemptedAt` = timestamp del server.
  - Validacion Zod via `ZodBodyValidationPipe(CreateContactAttemptSchema)`.
  - Response 201: `{ data: ContactAttempt }`.

- **GET /api/v1/crm/expedientes/:id/contact-attempts**
  - Query: page?, limit?.
  - Response 200: `{ data: ContactAttempt[], total }`.
  - Ordenado por `attemptedAt` DESC.

- **Guards:** JwtAuth, Roles (ADMIN, SALES, SUPPORT, SYSTEM_ADMIN).

### RF-CRM-10: Gestion de consentimientos (ConsentRecord v2)

- **POST /api/v1/crm/expedientes/:id/consents**
  - Body: `{ consentType: ConsentType, status: ConsentStatus, channel: string(1-120), legalTextVersion: string(1-500), evidenceRef?: string(max 255) }`
  - `obtainedAt` = timestamp del server.
  - `ipAddress` = IP del request (extraida de `req.ip` o header `X-Forwarded-For`).
  - Validacion Zod via `ZodBodyValidationPipe(CreateConsentSchema)`.
  - Response 201: `{ data: ConsentRecord }`.
  - Restriccion: solo 1 registro ACCEPTED por tipo por expediente (upsert logico).

- **GET /api/v1/crm/expedientes/:id/consents**
  - Response 200: `{ data: ConsentRecord[] }`.
  - Incluye estado actual de los 3 tipos: DATA_TREATMENT, COMMERCIAL_CONTACT, OPERATIONAL_CONTACT.

- **PATCH /api/v1/crm/expedientes/:id/consents/:consentId/revoke**
  - Cambia status a REJECTED; registra `revokedAt` y `revokedReason`.
  - Response 200: `{ data: ConsentRecord }`.
  - Guardia de compliance: si se revoca DATA_TREATMENT, marcar expediente con flag `dataConsentRevoked`.

- **Guards:** JwtAuth, Roles (ADMIN, SALES, SYSTEM_ADMIN).

### RF-CRM-11: CRUD de verificaciones de cobertura (CoverageCheck)

- **POST /api/v1/crm/expedientes/:id/coverage-checks**
  - Body: `{ latitude?: number, longitude?: number, addressUsed: string(1-255), result: Feasibility, technologyAvailable?: string(max 60), distanceM?: number, snapshotJson?: object }`
  - `checkedBy` = actor autenticado.
  - `checkedAt` = timestamp del server.
  - Validacion Zod.
  - Response 201: `{ data: CoverageCheck }`.

- **GET /api/v1/crm/expedientes/:id/coverage-checks**
  - Response 200: `{ data: CoverageCheck[] }`.
  - Ordenado por `checkedAt` DESC.

- **Guards:** JwtAuth, Roles (ADMIN, SALES, TECHNICIAN, SYSTEM_ADMIN).

### RF-CRM-12: Asignacion de expediente

- Nuevo campo `assignedTo` (uuid, nullable) en ExpedienteRecord.
- **PATCH /api/v1/crm/expedientes/:id/assign**
  - Body: `{ assignedTo: uuid }`
  - Registra StatusChange con metadataJson `{ type: 'ASSIGNMENT', assignedTo }`.
  - Response 200: `{ data: ExpedienteRecord }`.
- Filtro adicional en GET /crm/expedientes: `assignedTo` query param.
- **Guards:** JwtAuth, Roles (ADMIN, SYSTEM_ADMIN).

### RF-CRM-13: Busqueda por documento

- GET /api/v1/crm/expedientes agrega query param `documentNumber`.
- El servicio descifra y compara (busqueda exacta post-descifrado, no like).
- Impacto en rendimiento aceptable para volumenes < 10K expedientes por tenant.

### RF-CRM-14: Actor name resolution

- StatusChange y ContactAttempt almacenan `actorName` (varchar 160, nullable) ademas del UUID.
- `actorName` se resuelve al momento de crear el registro desde el token JWT claim `name` o lookup en UsersModule.
- Timeline retorna `actorName` directamente sin lookup adicional.

---

## 4. Enums nuevos requeridos

| Enum | Archivo destino | Valores |
| --- | --- | --- |
| ContactChannel | `packages/shared/src/enums/crm/contact-channel.enum.ts` | TELEFONO, EMAIL, PRESENCIAL, WHATSAPP, SMS, OTRO |
| ContactResult | `packages/shared/src/enums/crm/contact-result.enum.ts` | EXITOSO, NO_CONTESTA, BUZON, OCUPADO, NUMERO_INVALIDO, RECHAZADO, REPROGRAMADO |
| EvidenceMode | `packages/shared/src/enums/crm/evidence-mode.enum.ts` | ACTA_CONFORMIDAD, SOPORTE_CONTRACTUAL, FIRMA_DIGITAL, OTRO |

Reexportar desde `packages/shared/src/enums/crm/index.ts` y `packages/shared/src/index.ts`.

---

## 5. Contratos API adicionales

### POST /api/v1/crm/expedientes/:id/contact-attempts
- **Guards:** JwtAuth, Roles (ADMIN, SALES, SUPPORT, SYSTEM_ADMIN)
- **Body:** CreateContactAttemptSchema — `{ channel, result, durationMinutes?, notes? }`
- **Response 201:** `{ data: ContactAttempt }`

### GET /api/v1/crm/expedientes/:id/contact-attempts
- **Guards:** JwtAuth, Roles
- **Query:** page?, limit?
- **Response 200:** `{ data: ContactAttempt[], total }`

### POST /api/v1/crm/expedientes/:id/consents
- **Guards:** JwtAuth, Roles (ADMIN, SALES, SYSTEM_ADMIN)
- **Body:** CreateConsentSchema — `{ consentType, status, channel, legalTextVersion, evidenceRef? }`
- **Response 201:** `{ data: ConsentRecord }`

### GET /api/v1/crm/expedientes/:id/consents
- **Guards:** JwtAuth, Roles
- **Response 200:** `{ data: ConsentRecord[] }`

### PATCH /api/v1/crm/expedientes/:id/consents/:consentId/revoke
- **Guards:** JwtAuth, Roles (ADMIN, SYSTEM_ADMIN)
- **Body:** `{ reason: string(1-255) }`
- **Response 200:** `{ data: ConsentRecord }`

### POST /api/v1/crm/expedientes/:id/coverage-checks
- **Guards:** JwtAuth, Roles (ADMIN, SALES, TECHNICIAN, SYSTEM_ADMIN)
- **Body:** CreateCoverageCheckSchema — `{ latitude?, longitude?, addressUsed, result, technologyAvailable?, distanceM?, snapshotJson? }`
- **Response 201:** `{ data: CoverageCheck }`

### GET /api/v1/crm/expedientes/:id/coverage-checks
- **Guards:** JwtAuth, Roles
- **Response 200:** `{ data: CoverageCheck[] }`

### PATCH /api/v1/crm/expedientes/:id/assign
- **Guards:** JwtAuth, Roles (ADMIN, SYSTEM_ADMIN)
- **Body:** `{ assignedTo: uuid }`
- **Response 200:** `{ data: ExpedienteRecord }`

---

## 6. Modelo de datos — cambios incrementales

### 6.1 Columna nueva en expediente_records

| Columna | Tipo | Notas |
| --- | --- | --- |
| assignedTo | uuid | FK nullable; referencia a users del tenant |

### 6.2 Columnas nuevas en status_changes

| Columna | Tipo | Notas |
| --- | --- | --- |
| actorName | varchar(160) | Nullable; nombre del actor al momento del cambio |

### 6.3 Columnas nuevas en contact_attempts

| Columna | Tipo | Notas |
| --- | --- | --- |
| actorName | varchar(160) | Nullable; nombre del asesor al momento del intento |

### 6.4 Columnas nuevas en consent_records

| Columna | Tipo | Notas |
| --- | --- | --- |
| revokedAt | timestamptz | Nullable; momento de revocacion |
| revokedReason | varchar(255) | Nullable; motivo de revocacion |
| revokedBy | uuid | Nullable; actor que revoco |

### 6.5 Indice nuevo

- `idx_expediente_tenant_assigned` en `(tenantId, assignedTo)` para filtro por asesor.

---

## 7. Seguridad — hardening de cierre Sprint 02

### 7.1 PII en respuestas API

- Los listados (GET /expedientes) **no deben incluir** campos cifrados descifrados. Retornar campos PII como `null` o `"[CIFRADO]"` en listados.
- Solo el detalle individual (GET /expedientes/:id) descifra PII para el actor autorizado.
- Consentimientos retornan `ipAddress` solo a roles ADMIN y SYSTEM_ADMIN.

### 7.2 Rate limiting

- Endpoints de creacion (POST) limitados a 30 req/min por tenant.
- Endpoint de busqueda por documento limitado a 10 req/min por tenant (prevenir enumeracion).

### 7.3 Sanitizacion

- `notes` en ContactAttempt: sanitizar HTML/scripts antes de almacenar.
- `legalTextVersion` en ConsentRecord: solo texto plano, sin HTML.

---

## 8. Criterios de aceptacion adicionales

| CA | Descripcion |
| --- | --- |
| CA-13 | Crear intento de contacto con channel, result; advisorId = actor real |
| CA-14 | Listar intentos de contacto del expediente paginados |
| CA-15 | Crear consentimiento triple por tipo; IP capturada automaticamente |
| CA-16 | Solo 1 consentimiento ACCEPTED por tipo por expediente |
| CA-17 | Revocar consentimiento DATA_TREATMENT marca flag en expediente |
| CA-18 | Crear verificacion de cobertura con coordenadas o direccion |
| CA-19 | Listar verificaciones de cobertura ordenadas por fecha |
| CA-20 | Asignar expediente a asesor; filtrar por asignado en listado |
| CA-21 | PII oculta en listados; solo visible en detalle individual |
| CA-22 | Actor name resuelto en timeline sin lookup adicional |
| CA-23 | Legacy modules removidos del backend |
| CA-24 | Enums CRM en shared/src como fuente de verdad |
| CA-25 | Tests >= 80% en servicios core + servicios hijos |
| CA-26 | E2E: crear intento de contacto, registrar consentimiento, ver timeline completo |
| CA-27 | Portal: tabs para intentos contacto, consentimientos, cobertura en detalle expediente |

---

## 9. Riesgos

| Riesgo | Severidad | Mitigacion |
| --- | --- | --- |
| Rendimiento busqueda por documento cifrado | Media | Limitar a busqueda exacta; rate limiting; evaluar indice hash en Sprint 04 |
| Removal legacy puede romper consumidores desconocidos | Baja | Verificar que portal no consume endpoints legacy antes de remover |
| Volumen de endpoints (+8) puede necesitar versionado | Baja | Mantener /v1/ consistente; documentar en OpenAPI |
| Denormalizacion actorName puede desincronizarse | Baja | Aceptable: nombre al momento de la accion es correcto historicamente |

---

## 10. Dependencias

- MOD03 (TenantModule) para puertos CoverageReadPort, ExecutionPolicyReadPort — ya implementados.
- UsersModule para resolver `actorName` desde UUID — requiere metodo de lookup.
- `packages/shared` para enums nuevos — requiere build antes de consumir en api.

---

## 11. Decision de salida de cierre Sprint 02

**GO cuando:**
- Todos los CA-13 a CA-27 validados.
- Tests >= 80% en modulos CRM.
- E2E portal expandido pasando.
- Legacy modules removidos SIN regresiones.
- Informe actualizado en docs/informes/.
- OpenAPI actualizada con endpoints nuevos.

**NO-GO si:**
- Algun CA de compliance (CA-15, CA-16, CA-17) falla.
- Cobertura de tests < 80%.
- Campos PII expuestos en listados (CA-21 falla).

---

*Addendum generado por AI-EM-ARCH como extension del PRD-MOD05-CRM-DEFINICION-v2.0.md para cerrar Sprint 02 sin abrir una fase documental paralela.*
