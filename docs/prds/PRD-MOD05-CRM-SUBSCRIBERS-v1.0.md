# PRD - MOD05 CRM Módulo Subscriber

**Version:** 1.0  
**Estado:** Propuesto  
**Fecha:** 2026-04-16  
**Modo activo:** Architect  
**Autor:** AI-EM-ARCH  
**Trazabilidad base:** docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md  
**PRD padre:** docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md  
**ADRs aplicables:** ADR-002 (multi-tenant por schema), ADR-004 (soft delete + auditoría), ADR-007 (TypeORM), ADR-016 (construcción modular incremental), ADR-022 (política de ejecución por fases), ADR-024 (migración a Expediente Único)  
**ADRs nuevos requeridos:** ADR-025 (modelo de dos dimensiones: personType + customerSegment), ADR-026 (consolidación pipeline CRM de 12 a 8 estados)
**Identidad corporativa:** docs/identity/Manual_Implementacion_Identidad_Iwana.md — Obligatorio respetar en todo frontend

---

## 1. Contexto y motivación

### 1.1 Problema

El módulo CRM actual (MOD05) gestiona el pipeline comercial mediante Expediente Único Progresivo, pero carece de la entidad Subscriber como registro independiente y completo. La entidad `Subscriber` existente en código es un stub incompleto:

- No tiene servicio, controller ni módulo NestJS.
- No tiene migración de base de datos.
- Usa un enum `SubscriberType` (RESIDENTIAL/COMMERCIAL/CORPORATE) que mezcla dimensión fiscal con dimensión de negocio.
- No implementa el motor IVA colombiano (EXEMPT/EXCLUDED/STANDARD por estrato y tipo de persona).
- No tiene relación con el pipeline de Expediente (el Subscriber se crea al alcanzar CLIENTE_ACTIVO).
- No tiene ficha 360° ni integración con los módulos ya implementados (Contacts, Contracts, HabeasData).
- El comentario en `SubscriberContact` dice "subscribers es legado en proceso de retiro", lo cual contradice el PRD maestro.

### 1.2 Decisión arquitectónica

El Subscriber es la **entidad central post-activación** del sistema. El Expediente gestiona el pipeline pre-activación; el Subscriber gestiona la vida del cliente activo. Ambos coexisten:

- **Expediente** → proceso comercial (12 estados, captura progresiva, consentimiento).
- **Subscriber** → entidad fiscal y operativa (tipo de persona, estrato, IVA, segmento, ciclo de vida).

El Subscriber se **crea automáticamente** cuando el Expediente transiciona a `CLIENTE_ACTIVO`, copiando datos PII del expediente y calculando el tratamiento IVA.

### 1.3 Modelo de dos dimensiones

El PRD maestro §6.4 define `personType` (NATURAL | JURIDICA) como única dimensión. Tras análisis con el CTO, se confirma que el sistema necesita **dos dimensiones ortogonales**:

1. **`personType`** (NATURAL | JURIDICA) → régimen tributario colombiano, tipo de documento, tratamiento IVA.
2. **`customerSegment`** (RESIDENTIAL | SOHO | PYME | CORPORATE | GOVERNMENT | WHOLESALE) → segmento de negocio del ISP, tipo de plan, SLA, provisioning.

Estas dimensiones son independientes: una persona natural puede ser cliente residencial o SOHO; una persona jurídica puede ser PYME, CORPORATE, GOVERNMENT o WHOLESALE.

### 1.4 Corrección del PRD maestro §6.4

El PRD maestro define `personType` con valores `NATURAL | JURIDICAL`. Se corrige a `NATURAL | JURIDICA` (sin tilde en mayúsculas, consistente con el código) y se agrega `customerSegment` como campo obligatorio independiente.

El PRD maestro define `vatTreatment` con valores `EXENTO | EXCLUIDO | IVA 19%`. Se corrige a `EXEMPT | EXCLUDED | STANDARD` para consistencia con el código existente y claridad semántica.

**Corrección regulatoria confirmada:** Las entidades gubernamentales (GOVERNMENT) **NO están exentas de IVA** en servicios de Internet. El IVA para servicios de Internet se determina exclusivamente por `personType` + `stratum`:

- NATURAL estrato 1-2 → EXEMPT (gravado tarifa 0%, se declara)
- NATURAL estrato 3 → EXCLUDED (fuera del régimen, no se declara)
- NATURAL estrato 4-6 → STANDARD (IVA 19%)
- JURIDICA (cualquier segmento) → STANDARD (IVA 19%)

### 1.5 Consolidación del pipeline CRM

El pipeline actual tiene 12 estados. Tras análisis, se consolidan a **8 estados** eliminando 4 estados redundantes:

| Estado eliminado        | Razón                                                              | Cómo se cubre                                                               |
| ----------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `CONTACTADO`            | La completitud ya indica si hay datos de contacto                  | Transición `NUEVO_POTENCIAL → PRECALIFICADO` requiere datos de contacto     |
| `PENDIENTE_DATOS`       | La completitud por dimensión ya muestra qué falta                  | Permanece en el estado actual; la completitud guía al asesor                |
| `VIABLE_COMERCIALMENTE` | Sin validación real; si hay cobertura, se avanza a cotización      | `VALIDANDO_COBERTURA` con resultado VIABLE avanza directo a `EN_COTIZACION` |
| `PENDIENTE_DECISION`    | `EN_COTIZACION` ya cubre "cotización enviada, esperando respuesta" | El asesor gestiona la decisión dentro de `EN_COTIZACION`                    |

Pipeline consolidado:

```
NUEVO_POTENCIAL → PRECALIFICADO → VALIDANDO_COBERTURA → EN_COTIZACION
     → LISTO_PARA_INSTALACION → INSTALACION_AGENDADA → CLIENTE_ACTIVO
     → DESCARTADO (desde cualquier estado, reactivable)
```

---

## 2. Alcance

### 2.1 En scope

- Entidad Subscriber rediseñada con dos dimensiones (personType + customerSegment).
- Motor IVA colombiano (VatTreatmentService) con cálculo automático según personType + stratum.
- Máquina de estados del Subscriber (LEAD → PROSPECT → ACTIVE → SUSPENDED → CANCELLED).
- CRUD completo de Subscriber con cifrado AES-256-GCM para PII.
- Integración con Expediente: creación automática de Subscriber al alcanzar CLIENTE_ACTIVO.
- Ficha 360° del Subscriber (agregación de Contacts, Contracts, HabeasData + stubs para módulos futuros).
- Enum `CustomerSegment` con 6 valores (RESIDENTIAL, SOHO, PYME, CORPORATE, GOVERNMENT, WHOLESALE).
- Enum `PersonType` con 2 valores (NATURAL, JURIDICA).
- Enum `VatTreatment` con 3 valores (EXEMPT, EXCLUDED, STANDARD).
- Enum `SubscriberStatus` con 5 valores (LEAD, PROSPECT, ACTIVE, SUSPENDED, CANCELLED).
- Extensión de `DocumentType` con PEP y PTP.
- Migración de base de datos para la tabla `subscribers` (drop y recrear — no hay datos en producción).
- Migración para consolidar pipeline de Expediente de 12 a 8 estados.
- Actualización de `ExpedienteStatus` enum en shared.
- Actualización de `StatusTransitionService` con transiciones consolidadas.
- Actualización de `CompletenessCalculator` para reflejar estados eliminados.
- Endpoints REST para CRUD de Subscriber, transiciones de estado, búsqueda y ficha 360°.
- Validación Zod con schemas discriminados por personType.
- Frontend portal: lista de suscriptores, detalle con tabs, formulario de creación/edición.

### 2.2 Fuera de scope

- Implementación real de Billing, Provisioning, Inventory, WFM, Assurance (stubs permanecen).
- Portal del suscriptor (público) — se desarrolla en Sprint 11.
- Integración con pasarelas de pago.
- Integración con Siigo/Alegra.
- Migración ETL desde sistemas origen.
- App móvil del técnico.
- Geolocalización con PostGIS (se usa latitude/longitude como NUMERIC por ahora).

### 2.3 Decisiones de boundary

- SubscriberModule vive dentro de CrmModule como sub-módulo (igual que ExpedientesModule, ContactsModule, etc.).
- Subscriber NO comparte tabla con ExpedienteRecord. Son entidades distintas con ciclos de vida separados.
- La creación del Subscriber al alcanzar CLIENTE_ACTIVO se hace vía evento `ExpedienteStatusChanged` (EventEmitter2 in-process).
- Otros módulos acceden al Subscriber vía `SubscriberReadPort` (interfaz tipada).
- El motor IVA es un servicio interno de CrmModule, consumible por Billing cuando exista vía puerto.

---

## 3. Personas y casos de uso

### 3.1 Personas

| Persona           | Rol        | Acción con Subscriber                                    |
| ----------------- | ---------- | -------------------------------------------------------- |
| Administrador ISP | ADMIN      | CRUD completo, cambiar estados, ver ficha 360°           |
| Agente de soporte | SUPPORT    | Ver ficha 360°, cambiar estado SUSPENDED/ACTIVE          |
| Vendedor          | SALES      | Crear subscriber desde expediente, ver datos comerciales |
| Contador          | ACCOUNTANT | Ver datos fiscales (IVA, régimen, NIT)                   |
| Suscriptor        | SUBSCRIBER | Ver sus propios datos en portal (futuro)                 |
| Técnico de campo  | TECHNICIAN | Ver datos de contacto y dirección para instalación       |

### 3.2 Casos de uso principales

| CU        | Descripción                                                 | RF                   |
| --------- | ----------------------------------------------------------- | -------------------- |
| CU-SUB-01 | Crear subscriber automáticamente al activar expediente      | RF-CRM-02            |
| CU-SUB-02 | Crear subscriber manualmente (para migración ETL)           | RF-MIG-01            |
| CU-SUB-03 | Ver ficha 360° del subscriber                               | RF-CRM-02            |
| CU-SUB-04 | Actualizar datos del subscriber (con recalculo de IVA)      | RF-CRM-07, RF-CRM-09 |
| CU-SUB-05 | Cambiar estado del subscriber (ACTIVE → SUSPENDED → ACTIVE) | RF-BIL-06, RF-BIL-07 |
| CU-SUB-06 | Buscar subscriber por documento, NIT, email, nombre         | RF-CRM-02            |
| CU-SUB-07 | Calcular tratamiento IVA automáticamente                    | RF-BIL-09            |
| CU-SUB-08 | Listar subscribers por segmento, estrato, estado            | RF-CRM-11            |
| CU-SUB-09 | Registrar persona jurídica con representante legal          | RF-CRM-08            |
| CU-SUB-10 | Vincular subscriber con User del portal                     | RF-SEC-01            |

---

## 4. Requerimientos funcionales

### 4.1 Entidad Subscriber

| ID        | Requerimiento                                                                                                                                               | Prioridad |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-SUB-01 | Subscriber tiene dos dimensiones obligatorias: personType (NATURAL/JURIDICA) y customerSegment (RESIDENTIAL/SOHO/PYME/CORPORATE/GOVERNMENT/WHOLESALE)       | MVP       |
| RF-SUB-02 | Persona Natural requiere: documentType, documentNumber (cifrado), firstName, lastName, stratum (1-6), birthDate opcional                                    | MVP       |
| RF-SUB-03 | Persona Jurídica requiere: nit (cifrado), nitVerificationDigit, businessName, commercialName opcional, legalRepresentativeId (FK a otro subscriber NATURAL) | MVP       |
| RF-SUB-04 | Ambos tipos comparten: email (cifrado), phone (cifrado), whatsapp opcional, address, neighborhood, city, department, postalCode, latitude/longitude         | MVP       |
| RF-SUB-05 | vatTreatment se calcula automáticamente según personType + stratum y NO es editable manualmente                                                             | MVP       |
| RF-SUB-06 | taxRegime se asigna automáticamente: NATURAL → SIMPLIFIED, JURIDICA → COMMON                                                                                | MVP       |
| RF-SUB-07 | Subscriber tiene ciclo de vida: LEAD → PROSPECT → ACTIVE → SUSPENDED → CANCELLED                                                                            | MVP       |
| RF-SUB-08 | Subscriber tiene relación 1:1 opcional con User (userId nullable — se crea al activar portal)                                                               | MVP       |
| RF-SUB-09 | Subscriber tiene externalId para trazabilidad con sistemas origen durante migración                                                                         | MVP       |
| RF-SUB-10 | Soft delete (deletedAt) en Subscriber — nunca eliminación física                                                                                            | MVP       |
| RF-SUB-11 | Cifrado AES-256-GCM para: documentNumber, email, phone, nit — mismo formato que ExpedienteService (iv:authTag:ciphertext)                                   | MVP       |

### 4.2 Motor IVA

| ID        | Requerimiento                                                                                              | Prioridad |
| --------- | ---------------------------------------------------------------------------------------------------------- | --------- |
| RF-IVA-01 | NATURAL + estrato 1-2 → EXEMPT (gravado tarifa 0%, se declara en IVA)                                      | MVP       |
| RF-IVA-02 | NATURAL + estrato 3 → EXCLUDED (fuera del régimen IVA, no se declara)                                      | MVP       |
| RF-IVA-03 | NATURAL + estrato 4-6 → STANDARD (IVA 19%)                                                                 | MVP       |
| RF-IVA-04 | JURIDICA (cualquier segmento incluyendo GOVERNMENT) → STANDARD (IVA 19%)                                   | MVP       |
| RF-IVA-05 | customerSegment NO afecta el cálculo de IVA — es dimensión de negocio, no fiscal                           | MVP       |
| RF-IVA-06 | Al crear o actualizar subscriber, vatTreatment se recalcula automáticamente si cambia personType o stratum | MVP       |
| RF-IVA-07 | Si personType es NATURAL y stratum es null, el sistema rechaza la operación con error descriptivo          | MVP       |

### 4.3 Máquina de estados

| ID        | Requerimiento                                                                                                | Prioridad |
| --------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| RF-STA-01 | LEAD → PROSPECT: requiere datos básicos completos (documento, nombre, contacto)                              | MVP       |
| RF-STA-02 | PROSPECT → ACTIVE: se activa al completar el proceso de instalación (evento desde Expediente o Provisioning) | MVP       |
| RF-STA-03 | ACTIVE → SUSPENDED: por mora (evento desde Billing) o manual con justificación                               | MVP       |
| RF-STA-04 | SUSPENDED → ACTIVE: por pago registrado (evento desde Billing) o manual con justificación                    | MVP       |
| RF-STA-05 | ACTIVE → CANCELLED: cancelación voluntaria o forzosa con justificación obligatoria                           | MVP       |
| RF-STA-06 | Cualquier estado → CANCELLED: con justificación obligatoria                                                  | MVP       |
| RF-STA-07 | CANCELLED no tiene retorno — es estado terminal                                                              | MVP       |
| RF-STA-08 | Toda transición de estado genera registro en StatusChange (reutiliza entidad existente del expediente)       | MVP       |

### 4.4 Integración con Expediente

| ID        | Requerimiento                                                                                                                         | Prioridad |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-INT-01 | Al transicionar expediente a CLIENTE_ACTIVO, se crea automáticamente un Subscriber con datos del expediente                           | MVP       |
| RF-INT-02 | La creación automática copia PII del expediente (ya cifrado) al subscriber                                                            | MVP       |
| RF-INT-03 | La creación automática calcula personType a partir de los datos del expediente (si tiene NIT → JURIDICA, si tiene estrato → NATURAL)  | MVP       |
| RF-INT-04 | La creación automática calcula customerSegment según reglas del negocio (por defecto: NATURAL → RESIDENTIAL, JURIDICA con NIT → PYME) | MVP       |
| RF-INT-05 | La creación automática calcula vatTreatment según personType + stratum                                                                | MVP       |
| RF-INT-06 | El expediente se actualiza con el subscriberId del subscriber creado                                                                  | MVP       |
| RF-INT-07 | Se emite evento SubscriberCreated para downstream (Billing, Provisioning)                                                             | MVP       |

### 4.5 Pipeline consolidado (8 estados)

| ID         | Requerimiento                                                                                                                    | Prioridad |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-PIPE-01 | Consolidar ExpedienteStatus de 12 a 8 estados eliminando: CONTACTADO, PENDIENTE_DATOS, VIABLE_COMERCIALMENTE, PENDIENTE_DECISION | MVP       |
| RF-PIPE-02 | Actualizar ExpedienteStatus enum en packages/shared                                                                              | MVP       |
| RF-PIPE-03 | Actualizar StatusTransitionService con transiciones permitidas para 8 estados                                                    | MVP       |
| RF-PIPE-04 | Actualizar CompletenessCalculator para reflejar estados eliminados                                                               | MVP       |
| RF-PIPE-05 | Migración de datos: mapear estados legacy a nuevos estados                                                                       | MVP       |
| RF-PIPE-06 | Actualizar frontend (expediente-ui.ts) con nuevos labels y colores                                                               | MVP       |

### 4.6 Ficha 360°

| ID        | Requerimiento                                                                                              | Prioridad |
| --------- | ---------------------------------------------------------------------------------------------------------- | --------- |
| RF-360-01 | Endpoint GET /subscribers/:id/360 retorna datos personales + contacts + contracts + habeas data + consents | MVP       |
| RF-360-02 | Incluir stubs para tabs futuros: billing, tickets, equipment, network                                      | MVP       |
| RF-360-03 | PII se descifra solo en la respuesta del endpoint (nunca se almacena descifrado)                           | MVP       |

---

## 5. Requerimientos no funcionales

| ID         | Requerimiento                                                                                                                                                                                                                                                                                           | Prioridad |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RNF-SUB-01 | Cifrado AES-256-GCM para campos PII (documentNumber, email, phone, nit) — mismo formato que ExpedienteService                                                                                                                                                                                           | MVP       |
| RNF-SUB-02 | Búsqueda por documento/NIT/email usa comparación de valores cifrados (hash o búsqueda determinista)                                                                                                                                                                                                     | MVP       |
| RNF-SUB-03 | Multi-tenant: todas las operaciones usan SET LOCAL search_path al schema del tenant                                                                                                                                                                                                                     | MVP       |
| RNF-SUB-04 | RBAC: ADMIN, SALES, SUPPORT, ACCOUNTANT pueden CRUD subscribers; SUBSCRIBER solo ve sus propios datos                                                                                                                                                                                                   | MVP       |
| RNF-SUB-05 | Audit log en toda operación CUD de Subscriber                                                                                                                                                                                                                                                           | MVP       |
| RNF-SUB-06 | Rate limiting en endpoints de búsqueda (100 req/min)                                                                                                                                                                                                                                                    | MVP       |
| RNF-SUB-07 | Validación Zod en todo boundary externo con schemas discriminados por personType                                                                                                                                                                                                                        | MVP       |
| RNF-SUB-08 | Índices compuestos: (tenantId, status), (tenantId, documentNumberEncrypted), (tenantId, emailEncrypted), (tenantId, stratum), (tenantId, customerSegment)                                                                                                                                               | MVP       |
| RNF-SUB-09 | Identidad visual iWana: todo frontend debe usar los design tokens, tipografía (Exo 2), colores (primary #17163A, secondary #A5C330), componentes (IwanaButton, IwanaCard), bordes redondeados (2xl estándar), sombras y animaciones definidos en docs/identity/Manual_Implementacion_Identidad_Iwana.md | MVP       |
| RNF-SUB-10 | Tailwind CSS v4 con configuración CSS-first (no tailwind.config.js) — tokens iWana en @theme directive                                                                                                                                                                                                  | MVP       |
| RNF-SUB-11 | shadcn/ui como base de componentes, personalizados con tokens iWana (colores, bordes, tipografía)                                                                                                                                                                                                       | MVP       |
| RNF-SUB-12 | Contraste de color AA (WCAG 2.1): texto sobre fondo blanco usa iwana-secondary-700 (#6A7A1C) o iwana-primary (#17163A), nunca iwana-secondary DEFAULT sobre blanco                                                                                                                                      | MVP       |

---

## 6. Modelo de datos

### 6.1 Tabla subscribers (tenant schema)

```sql
CREATE TABLE subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID,  -- FK → users, nullable hasta activación de portal

  -- Dimensión fiscal
  person_type VARCHAR(20) NOT NULL,  -- NATURAL | JURIDICA
  -- Dimensión de negocio
  customer_segment VARCHAR(20) NOT NULL,  -- RESIDENTIAL | SOHO | PYME | CORPORATE | GOVERNMENT | WHOLESALE

  -- Persona Natural
  document_type VARCHAR(20),  -- CC | CE | PASAPORTE | PEP | PTP | NIT_PERSONA
  document_number_encrypted VARCHAR(500),
  first_name VARCHAR(300),
  last_name VARCHAR(300),
  stratum SMALLINT CHECK (stratum IS NULL OR stratum BETWEEN 1 AND 6),
  birth_date DATE,

  -- Persona Jurídica
  nit VARCHAR(500),  -- Cifrado AES-256-GCM
  nit_verification_digit VARCHAR(1),
  business_name VARCHAR(300),
  commercial_name VARCHAR(300),
  legal_representative_id UUID REFERENCES subscribers(id),

  -- Compartido
  email_encrypted VARCHAR(500) NOT NULL,
  phone_encrypted VARCHAR(100) NOT NULL,
  whatsapp VARCHAR(50),

  -- Fiscal (calculado automáticamente)
  vat_treatment VARCHAR(20) NOT NULL,  -- EXEMPT | EXCLUDED | STANDARD
  tax_regime VARCHAR(20) NOT NULL,  -- SIMPLIFIED | COMMON

  -- Ubicación
  address VARCHAR(500) NOT NULL,
  neighborhood VARCHAR(100),
  city VARCHAR(50),
  department VARCHAR(50),
  postal_code VARCHAR(20),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),

  -- Cobertura
  coverage_node_id UUID,  -- FK → commercial_nodes

  -- Ciclo de vida
  status VARCHAR(20) NOT NULL DEFAULT 'LEAD',  -- LEAD | PROSPECT | ACTIVE | SUSPENDED | CANCELLED
  external_id VARCHAR(160),  -- ID en sistema origen para migración

  -- Auditoría
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Índices
CREATE INDEX idx_subscribers_tenant_status ON subscribers(tenant_id, status);
CREATE INDEX idx_subscribers_tenant_doc ON subscribers(tenant_id, document_number_encrypted);
CREATE INDEX idx_subscribers_tenant_email ON subscribers(tenant_id, email_encrypted);
CREATE INDEX idx_subscribers_tenant_stratum ON subscribers(tenant_id, stratum);
CREATE INDEX idx_subscribers_tenant_segment ON subscribers(tenant_id, customer_segment);
CREATE UNIQUE INDEX idx_subscribers_user_id ON subscribers(user_id) WHERE user_id IS NOT NULL;

-- Constraint: persona natural requiere campos, jurídica requiere otros
ALTER TABLE subscribers ADD CONSTRAINT chk_subscriber_person_fields
  CHECK (
    (person_type = 'NATURAL' AND stratum IS NOT NULL AND stratum BETWEEN 1 AND 6
     AND first_name IS NOT NULL AND last_name IS NOT NULL)
    OR
    (person_type = 'JURIDICA' AND nit IS NOT NULL AND business_name IS NOT NULL)
  );
```

### 6.2 Enums (packages/shared)

```typescript
// person-type.enum.ts
export enum PersonType {
  NATURAL = 'NATURAL',
  JURIDICA = 'JURIDICA',
}

// customer-segment.enum.ts
export enum CustomerSegment {
  RESIDENTIAL = 'RESIDENTIAL',
  SOHO = 'SOHO',
  PYME = 'PYME',
  CORPORATE = 'CORPORATE',
  GOVERNMENT = 'GOVERNMENT',
  WHOLESALE = 'WHOLESALE',
}

// vat-treatment.enum.ts
export enum VatTreatment {
  EXEMPT = 'EXEMPT',
  EXCLUDED = 'EXCLUDED',
  STANDARD = 'STANDARD',
}

// tax-regime.enum.ts
export enum TaxRegime {
  SIMPLIFIED = 'SIMPLIFIED',
  COMMON = 'COMMON',
}

// subscriber-status.enum.ts
export enum SubscriberStatus {
  LEAD = 'LEAD',
  PROSPECT = 'PROSPECT',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED',
}
```

### 6.3 Extensión de DocumentType

```typescript
// document-type.enum.ts (extender existente)
export enum DocumentType {
  CC = 'CC', // Cédula de Ciudadanía
  CE = 'CE', // Cédula de Extranjería
  PASAPORTE = 'PASAPORTE',
  PEP = 'PEP', // Permiso Especial de Permanencia (nuevo)
  PTP = 'PTP', // Permiso Temporal de Permanencia (nuevo)
  NIT_PERSONA = 'NIT_PERSONA', // NIT de persona natural
}
```

### 6.4 Cambios en ExpedienteStatus (consolidación)

```typescript
// expediente-status.enum.ts (actualizado)
export enum ExpedienteStatus {
  NUEVO_POTENCIAL = 'NUEVO_POTENCIAL',
  PRECALIFICADO = 'PRECALIFICADO',
  VALIDANDO_COBERTURA = 'VALIDANDO_COBERTURA',
  EN_COTIZACION = 'EN_COTIZACION',
  LISTO_PARA_INSTALACION = 'LISTO_PARA_INSTALACION',
  INSTALACION_AGENDADA = 'INSTALACION_AGENDADA',
  CLIENTE_ACTIVO = 'CLIENTE_ACTIVO',
  DESCARTADO = 'DESCARTADO',
}
// Eliminados: CONTACTADO, PENDIENTE_DATOS, VIABLE_COMERCIALMENTE, PENDIENTE_DECISION
```

---

## 7. Contratos de API

### 7.1 CRUD Subscriber

```
POST   /api/v1/subscribers                    # Crear subscriber (Natural o Jurídica)
GET    /api/v1/subscribers                    # Listar con filtros + paginación
GET    /api/v1/subscribers/:id                # Detalle (PII descifrada)
PATCH  /api/v1/subscribers/:id                # Actualizar (recalcula IVA si cambia personType/stratum)
DELETE /api/v1/subscribers/:id                 # Soft delete
```

### 7.2 Transiciones de estado

```
PATCH  /api/v1/subscribers/:id/status          # Cambiar estado con motivo
```

### 7.3 Búsqueda

```
GET    /api/v1/subscribers/search?documentNumber=xxx&nit=xxx&email=xxx&name=xxx
```

### 7.4 Ficha 360°

```
GET    /api/v1/subscribers/:id/360             # Agregación: datos + contacts + contracts + habeas data + stubs
```

### 7.5 Integración con Expediente (interno)

```
Event: subscriber.created
Payload: { subscriberId, tenantId, schemaName, expedienteId, personType, customerSegment, vatTreatment }
```

---

## 8. Criterios de aceptación

| ID        | Criterio                                                                                     | Validación                        |
| --------- | -------------------------------------------------------------------------------------------- | --------------------------------- |
| CA-SUB-01 | Crear subscriber NATURAL con estrato 2 → vatTreatment = EXEMPT                               | Test unitario VatTreatmentService |
| CA-SUB-02 | Crear subscriber NATURAL con estrato 3 → vatTreatment = EXCLUDED                             | Test unitario VatTreatmentService |
| CA-SUB-03 | Crear subscriber NATURAL con estrato 5 → vatTreatment = STANDARD                             | Test unitario VatTreatmentService |
| CA-SUB-04 | Crear subscriber JURIDICA con cualquier estrato → vatTreatment = STANDARD                    | Test unitario VatTreatmentService |
| CA-SUB-05 | Crear subscriber JURIDICA segmento GOVERNMENT → vatTreatment = STANDARD (no exento)          | Test unitario VatTreatmentService |
| CA-SUB-06 | Crear subscriber NATURAL sin estrato → error 400 con mensaje descriptivo                     | Test de validación                |
| CA-SUB-07 | Crear subscriber JURIDICA sin NIT → error 400 con mensaje descriptivo                        | Test de validación                |
| CA-SUB-08 | Crear subscriber vía expediente CLIENTE_ACTIVO → subscriber se crea con datos del expediente | Test de integración               |
| CA-SUB-09 | Actualizar strato de subscriber NATURAL → vatTreatment se recalcula automáticamente          | Test de servicio                  |
| CA-SUB-10 | Cambiar personType de NATURAL a JURIDICA → vatTreatment cambia a STANDARD                    | Test de servicio                  |
| CA-SUB-11 | PII se cifra al guardar y descifra al leer                                                   | Test de cifrado                   |
| CA-SUB-12 | Búsqueda por documento retorna subscriber correcto                                           | Test de búsqueda                  |
| CA-SUB-13 | Ficha 360° retorna datos personales + contacts + contracts + habeas data                     | Test de integración               |
| CA-SUB-14 | Pipeline de expediente tiene 8 estados (no 12)                                               | Test de StatusTransitionService   |
| CA-SUB-15 | Transición expediente → CLIENTE_ACTIVO crea subscriber y emite evento                        | Test E2E                          |
| CA-SUB-16 | Migración de estados legacy a nuevos estados funciona sin pérdida de datos                   | Test de migración                 |
| CA-SUB-17 | Cada operación CUD genera registro en audit_logs                                             | Test de auditoría                 |
| CA-SUB-18 | RBAC: solo ADMIN, SALES, SUPPORT, ACCOUNTANT pueden CRUD subscribers                         | Test de guards                    |

---

## 9. Dependencias y riesgos

### 9.1 Dependencias

| Dependencia                       | Módulo       | Estado                                   |
| --------------------------------- | ------------ | ---------------------------------------- |
| ExpedienteRecord (entidad)        | CrmModule    | ✅ Implementado                          |
| StatusTransitionService           | CrmModule    | ✅ Implementado (requiere actualización) |
| CompletenessCalculator            | CrmModule    | ✅ Implementado (requiere actualización) |
| ContactsModule                    | CrmModule    | ✅ Implementado                          |
| ContractsModule                   | CrmModule    | ✅ Implementado                          |
| HabeasDataModule                  | CrmModule    | ✅ Implementado                          |
| Cifrado AES-256-GCM               | CrmModule    | ✅ Implementado en ExpedienteService     |
| TenantContext + schema resolution | TenantModule | ✅ Implementado                          |
| AuditModule                       | AuditModule  | ✅ Implementado                          |
| AuthModule (guards RBAC)          | AuthModule   | ✅ Implementado                          |

### 9.2 Riesgos

| #   | Riesgo                                                                | Prob. | Impacto | Mitigación                                                                                        |
| --- | --------------------------------------------------------------------- | ----- | ------- | ------------------------------------------------------------------------------------------------- |
| R01 | Consolidación de 12 a 8 estados rompe datos existentes en expedientes | Media | Alto    | Migración aditiva que mapea estados eliminados a estados vecinos                                  |
| R02 | Motor IVA incorrecto por cambio regulatorio                           | Baja  | Crítico | VatTreatmentService aislado y testeable; monitoreo normativo mensual                              |
| R03 | Cifrado PII inconsistente entre Expediente y Subscriber               | Media | Alto    | Reutilizar mismo encryption key y formato (iv:authTag:ciphertext)                                 |
| R04 | Creación automática de Subscriber falla al alcanzar CLIENTE_ACTIVO    | Media | Alto    | Evento con retry (BullMQ); si falla, expediente permanece en CLIENTE_ACTIVO con subscriberId null |
| R05 | Confusión entre personType y customerSegment en UI                    | Media | Medio   | UI con labels claros y tooltips explicativos; validación backend por schema discriminado          |

---

## 10. Definition of Done

| Criterio                                                                 | Verificación                                   |
| ------------------------------------------------------------------------ | ---------------------------------------------- |
| Backend: SubscriberService CRUD + VatTreatmentService + StatusTransition | Tests unitarios ≥ 80%                          |
| Backend: Integración Expediente → Subscriber en CLIENTE_ACTIVO           | Test de integración                            |
| Backend: Pipeline consolidado (8 estados)                                | StatusTransitionService actualizado y testeado |
| Backend: Migración de datos (estados legacy → nuevos)                    | Migración reversible verificada                |
| Frontend: Lista de suscriptores con filtros                              | Navegación y filtros funcionales               |
| Frontend: Detalle de subscriber con tabs (360°)                          | Tabs con datos reales + stubs                  |
| Frontend: Formulario de creación/edición con validación por personType   | Validación frontend + backend                  |
| Base de datos: Migración de tabla subscribers + índices + constraints    | Migración aplicada y reversible                |
| Base de datos: Migración de ExpedienteStatus (12 → 8)                    | Migración aplicada y reversible                |
| Seguridad: Cifrado PII, RBAC, audit log                                  | Verificación manual + tests                    |
| OpenAPI: Endpoints documentados                                          | Swagger UI actualizado                         |
| Sin PII real en código, tests o logs                                     | Grep verification                              |
| Informe de fase archivado en docs/informes/                              | Documento generado                             |

---

## Historial de cambios

| Versión | Fecha      | Cambios                                                                                                                             |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-04-16 | Versión inicial. Modelo de dos dimensiones (personType + customerSegment). Motor IVA. Pipeline consolidado a 8 estados. Ficha 360°. |
