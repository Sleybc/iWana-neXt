# SPEC - MOD05 Expediente Unico Progresivo

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-03-23  
**Autor:** AI-EM-ARCH  
**PRD de referencia:** docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md  
**HLD de referencia:** docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md  
**ADR de referencia:** docs/adrs/ADR-024-Migracion-CRM-Expediente-Unico.md  
**Informe soporte:** docs/informes/INFORME-MOD05-DEFINICION-v1.0.md (§10.1-10.20)

---

## 1. Proposito

Especificacion tecnica detallada del modelo Expediente Unico Progresivo: la entidad maestra, sus 8 secciones de captura, los 12 estados del pipeline, las 4 dimensiones de completitud, el consentimiento triple y las entidades hijas de trazabilidad.

---

## 2. Entidad maestra: ExpedienteRecord

### 2.1 Tabla: expediente_records

Tabla principal del expediente unico. ~60 columnas organizadas en 8 secciones funcionales mas secciones de soporte (referencias operativas, completitud, metadatos).

### 2.2 Secciones de captura

| # | Seccion | Key tecnico | Campos principales | Captura esperada |
| --- | --- | --- | --- | --- |
| 1 | Identificacion | IDENTIFICATION | fullName, documentType, documentNumberEncrypted, gender, birthDate, personType, companyName | Al crear o primer contacto |
| 2 | Contacto | CONTACT | phonePrimaryEncrypted, phoneSecondaryEncrypted, emailPrimaryEncrypted, emailSecondary, altContactName, altContactPhoneEncrypted, contactPreference, bestContactTime | Primer contacto exitoso |
| 3 | Ubicacion | LOCATION | address, municipality, department, stratum, neighborhood, latitude, longitude, coordinatesSource, coordinatesConfidence, accessReferences, zoneType | Pre-calificacion |
| 4 | Interes comercial | COMMERCIAL_INTEREST | source (required), interestedPlanId, campaign, casePriority, estimatedBudget, commercialNotes | Creacion y cotizacion |
| 5 | Viabilidad tecnica | TECHNICAL_FEASIBILITY | coverageResult, availableTechnology, estimatedDistanceM, feasibility, technicalObservations, estimatedEquipment | Validacion cobertura |
| 6 | Consentimiento legal | LEGAL_CONSENT | identityVerified, legalComplianceStatus | Pre-calificacion |
| 7 | Facturacion | BILLING | paymentMethod, billingCycle, fiscalName, fiscalDocument, fiscalAddress, rutReference | Pre-instalacion |
| 8 | Instalacion | INSTALLATION | installationAddress, availabilityWindow, siteContactName, siteContactPhoneEncrypted, specialAccessNotes, requiredMaterials | Agendamiento |

### 2.3 Campos operativos (no seccionados)

| Campo | Proposito |
| --- | --- |
| ticketId | Referencia a ticket de soporte vinculado |
| workOrderId | Referencia a orden de trabajo |
| inventoryAssignmentRef | Referencia a asignacion de inventario |
| expansionRequestId | Referencia a solicitud de expansion |
| executionPolicyRef | Referencia a politica de ejecucion |
| checklistCompleted | Checklist pre-activacion |
| evidenceMode | Modalidad de evidencia (ACTA_CONFORMIDAD / SOPORTE_CONTRACTUAL) |
| conformityEvidenceRef | Referencia de evidencia contractual |
| lastRescheduleReason | Motivo del ultimo reagendamiento |
| lastRescheduleNotes | Notas del ultimo reagendamiento |

### 2.4 Campos de completitud

| Campo | Tipo | Rango |
| --- | --- | --- |
| completenessCommercial | smallint | 0-100 |
| completenessLegal | smallint | 0-100 |
| completenessTechnical | smallint | 0-100 |
| completenessOperational | smallint | 0-100 |

### 2.5 Campos cifrados (AES-256-GCM)

| Campo | Formato almacenado |
| --- | --- |
| documentNumberEncrypted | {iv_hex_24}:{authTag_hex_32}:{ciphertext_hex} |
| phonePrimaryEncrypted | idem |
| phoneSecondaryEncrypted | idem |
| emailPrimaryEncrypted | idem |
| altContactPhoneEncrypted | idem |
| siteContactPhoneEncrypted | idem |

---

## 3. Pipeline: 12 estados

```
NUEVO_POTENCIAL → CONTACTADO → PENDIENTE_DATOS → PRECALIFICADO
→ VALIDANDO_COBERTURA → VIABLE_COMERCIALMENTE → EN_COTIZACION
→ PENDIENTE_DECISION → LISTO_PARA_INSTALACION → INSTALACION_AGENDADA
→ CLIENTE_ACTIVO

Desde cualquier estado (excepto CLIENTE_ACTIVO): → DESCARTADO
DESCARTADO → NUEVO_POTENCIAL (via reactivacion)
```

### Campos minimos por transicion

| Estado objetivo | Campos requeridos |
| --- | --- |
| CONTACTADO | phonePrimaryEncrypted OR emailPrimaryEncrypted |
| PENDIENTE_DATOS | Sin restriccion adicional |
| PRECALIFICADO | documentType, documentNumberEncrypted, phonePrimaryEncrypted OR emailPrimaryEncrypted, address, municipality |
| VALIDANDO_COBERTURA | (latitude AND longitude) OR (address AND municipality) |
| VIABLE_COMERCIALMENTE | Sin restriccion adicional |
| EN_COTIZACION | interestedPlanId |
| PENDIENTE_DECISION | Sin restriccion adicional |
| LISTO_PARA_INSTALACION | installationAddress, siteContactName |
| INSTALACION_AGENDADA | ticketId, workOrderId |
| CLIENTE_ACTIVO | completeness >= 90% en 4 dimensiones + checklistCompleted |
| DESCARTADO | Siempre permitido (reason obligatorio) |

---

## 4. Completitud 4 dimensiones

### 4.1 Dimension comercial (10 campos)

Cada campo contribuye 10% al total:

1. fullName
2. documentType
3. documentNumberEncrypted
4. phonePrimaryEncrypted (ponderacion x2: se cuenta como presente si hay telefono primario)
5. emailPrimaryEncrypted
6. source
7. interestedPlanId
8. casePriority
9. quotes.length > 0 (al menos una cotizacion)

### 4.2 Dimension legal (3 campos)

Cada campo contribuye ~33% al total:

1. ConsentRecord tipo DATA_TREATMENT con status ACCEPTED
2. ConsentRecord tipo COMMERCIAL_CONTACT con status ACCEPTED
3. identityVerified === 'verified'

### 4.3 Dimension tecnica (4 campos)

Cada campo contribuye 25% al total:

1. coverageChecks.length > 0
2. Al menos un coverageCheck con result VIABLE o CONDITIONAL
3. availableTechnology presente
4. estimatedEquipment presente

### 4.4 Dimension operativa (6 campos)

Cada campo contribuye ~17% al total:

1. installationAddress
2. siteContactName
3. siteContactPhoneEncrypted
4. paymentMethod
5. billingCycle
6. fiscalName

### 4.5 Degradacion segura

CompletenessCalculator captura errores PostgreSQL:
- `42P01` (tabla inexistente)
- `42703` (columna inexistente)

En caso de error DB, retorna 0% para la dimension sin propagar excepcion. Esto permite funcionamiento durante migraciones progresivas.

---

## 5. Consentimiento triple (Ley 1581)

### 5.1 Tipos de consentimiento

| Tipo | Proposito | Momento del pipeline |
| --- | --- | --- |
| DATA_TREATMENT | Autorizacion para tratamiento de datos personales | Antes de almacenar PII sensible |
| COMMERCIAL_CONTACT | Autorizacion para contacto con fines comerciales | Al avanzar a PRECALIFICADO |
| OPERATIONAL_CONTACT | Autorizacion para contacto operativo post-instalacion | Antes de LISTO_PARA_INSTALACION |

### 5.2 ConsentRecord v2 — campos de trazabilidad

| Campo | Proposito |
| --- | --- |
| consentType | Tipo (3 valores) |
| status | ACCEPTED / REJECTED / PENDING |
| channel | Canal por el que se obtuvo (web, presencial, telefono, etc.) |
| obtainedAt | Timestamp del consentimiento |
| ipAddress | IP del titular cuando aplica (canal web) |
| legalTextVersion | Texto legal exacto mostrado al titular |
| evidenceRef | Referencia a evidencia documental (URL, numero de acta, etc.) |

---

## 6. Entidades hijas

### 6.1 ContactAttempt
Registra cada intento de contacto con el prospecto: canal, resultado, duracion, notas, asesor.

### 6.2 CoverageCheck
Registra cada verificacion de cobertura: coordenadas, direccion usada, resultado (VIABLE/CONDITIONAL/NOT_VIABLE), tecnologia, distancia, snapshot JSON.

### 6.3 StatusChange
Registra cada transicion de estado: fromStatus, toStatus, changedBy (actor real), reason, metadata JSON.

---

## 7. UI: 4 zonas del detalle

| Zona | Ubicacion | Contenido |
| --- | --- | --- |
| Cabecera | Top | fullName, status badge, completitud barra, acciones (transicionar, descartar, reactivar) |
| Secciones accordion | Centro | 8 secciones desplegables, cada una editable y guardable independientemente |
| Panel lateral | Derecha | Timeline (changes, activities), metadata operativa, actor resolution |
| Resumen | Top 3-col | Datos clave: municipio, fuente, plan, prioridad |

---

*Spec reconstruida por AI-EM-ARCH a partir del INFORME-MOD05-DEFINICION-v1.0.md §10.1-10.20 y el codigo fuente implementado.*
