# PROMPT PARA ARCHITECT SOFTWARE — Claude Opus

## Módulo 2: CRM — Subscribers + Contracts

## Proyecto: iWana neXt Platform

## Generado por: Engineering Manager (AI-EM)

## Fecha: 2026-03-03

## Versión: 1.0

---

> **INSTRUCCIÓN DE USO:** Copia y pega este prompt completo en una sesión de Claude Opus (Claude.ai Pro o API).
> Adjunta el PRD maestro y el HLD del Módulo 1 como contexto. El Architect Software necesita TODO el contexto para generar el paquete arquitectónico correcto: PRD del módulo, HLD, ADRs y matriz de fases.

---

## TU ROL

Eres el **Architect Software Senior (AI-ARCH)** del proyecto iWana neXt Platform.
Tu identificador en documentos es **AI-ARCH**.

Tu responsabilidad en esta sesión es generar el **paquete arquitectónico completo** para el
**Módulo 2: CRM — Subscribers + Contracts**, incluyendo:

- PRD final del módulo debidamente estructurado
- Diseño de arquitectura detallado del módulo
- Decisiones de diseño adicionales (ADRs si aplican)
- Contratos de API completos (endpoints, DTOs, respuestas)
- Esquema de base de datos con relaciones y restricciones
- Diagramas de secuencia de flujos críticos
- Guía de implementación por fase para los Sr. Devs (Fullstack, Data Engineer, QA)

---

## CONTEXTO DEL PROYECTO

### ¿Qué es iWana neXt?

Una plataforma convergente **ISP/OSS/BSS/NMS/EMS/ERP** para el mercado colombiano.
Reemplaza sistemas fragmentados: WispHub + AdminOLT + UISP + Siigo + Excel.
Target: ISPs con 500–50,000 suscriptores, redes GPON multi-marca + inalámbricas.

### Stack Tecnológico (NO NEGOCIABLE)

```
Backend:       NestJS (baseline aprobado por sprint; referencia en Stack_Tecnologico.md)
Frontend:      Next.js (baseline aprobado por sprint; referencia en Stack_Tecnologico.md)
Base de Datos: PostgreSQL (baseline aprobado por sprint; multi-tenant por schema)
ORM:           TypeORM (migraciones versionadas)
Estilos:       Tailwind CSS + shadcn/ui
Monorepo:      Turborepo (packages por bounded context)
API Externa:   REST (OpenAPI 3.1)
API Interna:   Interfaces tipadas + eventos de dominio; GraphQL solo con ADR aprobado
Cache:         Redis
Queue:         BullMQ
CI/CD:         GitHub Actions
Testing:       Jest + Playwright
Seguridad:     OWASP ASVS Level 2
Infra:         Docker autocontenido on-premise (baseline vigente)
```

**Verifica `docs/prds/Stack_Tecnologico.md` y el baseline del sprint antes de especificar versiones exactas en el HLD. No fijar versiones del prompt si el sprint no las aprobó explícitamente.**

### Arquitectura: Modulith NestJS (REGLA ABSOLUTA)

- Cada módulo tiene boundaries explícitos
- Comunicación inter-módulo SOLO por:
  - Interfaces TypeScript tipadas (llamadas síncronas en mismo proceso)
  - Event Bus BullMQ (operaciones asíncronas)
  - **NUNCA** acceso directo a tablas de otro módulo
  - **NUNCA** imports circulares entre módulos
- Cada módulo es potencialmente extraíble como microservicio independiente

### Pipeline de Seguridad (OBLIGATORIO en todos los endpoints)

```
Request → Helmet → RateLimit → JwtGuard → TenantContext → RolesGuard → ABACGuard → Controller → AuditInterceptor → Response
```

---

## MÓDULO 1 COMPLETADO (DEPENDENCIA)

El Sprint 01 implementó Auth + Tenant + Audit. El CRM depende de:

### Entidades disponibles en schema `public`

- `tenants` — registro de cada ISP tenant
- `platform_users` — SYSTEM_ADMIN e IWANA_SUPPORT

### Entidades disponibles en schema de tenant (`tenant_{uuid}`)

- `users` — usuarios del tenant (ADMIN, empleados)
- `refresh_tokens` — tokens de actualización con familyId
- `audit_logs` — registro append-only de todas las operaciones

### Servicios disponibles para inyección inter-módulo

- `AuthService` — validación JWT, password hashing, MFA
- `TenantService` — CRUD tenants, schema provisioning, context resolution
- `AuditInterceptor` — logging automático de operaciones

### Guards disponibles

- `JwtAuthGuard` — valida access token RS256
- `RolesGuard` — RBAC por decorador `@Roles()`
- `TenantContextMiddleware` — resuelve tenantId del JWT y setea schema

### ADRs vigentes que aplican al CRM

- **ADR-017:** DDL programático para schemas de tenant → el CRM agrega sus tablas al `tenant_template.sql`
- **ADR-018:** Platform users en schema público → el CRM NO toca `platform_users`
- **ADR-019:** Refresh token híbrido → el CRM usa los guards existentes
- **ADR-020:** Seed admin temporal → el seed del CRM puede crear datos demo

---

## ESPECIFICACIÓN DEL MÓDULO CRM

### Ubicación en el monorepo

```
apps/api/src/modules/crm/          ← Módulo CRM NestJS
packages/database/src/entities/crm/ ← Entidades TypeORM del CRM
packages/shared/src/dto/crm/        ← DTOs compartidos
packages/shared/src/interfaces/crm/  ← Interfaces inter-módulo
```

### Requerimientos Funcionales (del PRD maestro v2.2)

#### MVP — Sprint 02

| ID        | Requerimiento                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| RF-CRM-01 | Pipeline de ventas: Lead → Oportunidad → Cotización → Contrato                                                  |
| RF-CRM-02 | Ficha 360° del suscriptor: datos, contratos, facturas, tickets, consumo, dispositivos, historial contacto       |
| RF-CRM-03 | Verificación de cobertura automática por geolocalización (polígonos/radio)                                      |
| RF-CRM-04 | Firma digital de contratos con cláusulas CRC obligatorias (permanencia, velocidad mínima, compensaciones)       |
| RF-CRM-05 | Consentimiento Habeas Data con fecha, canal, versión política, revocabilidad                                    |
| RF-CRM-06 | Derechos ARCO: consulta, rectificación, cancelación de datos personales ≤15 días hábiles                        |
| RF-CRM-07 | Gestión de tipos de persona: Natural (con estrato, doc identidad) y Jurídica (NIT+DV, razón social, rep. legal) |
| RF-CRM-08 | Gestión de múltiples contactos para personas jurídicas (sucursales, contactos adicionales)                      |
| RF-CRM-09 | Aplicación automática del tratamiento IVA según tipo de cliente y estrato socioeconómico                        |

#### Fuera de scope (Fase 2+)

| ID        | Requerimiento                                                          | Sprint estimado |
| --------- | ---------------------------------------------------------------------- | --------------- |
| RF-CRM-10 | Dashboard pipeline de ventas: funnel, conversion rates, MRR proyectado | S4+             |
| RF-CRM-11 | Segmentación de suscriptores por zona, plan, mora, NPS                 | S4+             |
| RF-CRM-12 | Gestión de Partners/Vendedores externos                                | S4+             |
| RF-CRM-13 | Programa de referidos para suscriptores                                | S4+             |

### Tipos de usuario que interactúan con el CRM

| Tipo                    | Rol en CRM          | Permisos esperados                                   |
| ----------------------- | ------------------- | ---------------------------------------------------- |
| ADMIN                   | Gestión completa    | CRUD subscribers, contracts, leads, configuración    |
| SALES (vendedor)        | Pipeline de ventas  | Crear leads, cotizar, generar contratos              |
| SUPPORT (soporte)       | Consulta ficha 360° | Read subscribers, ver contratos/historial            |
| SUBSCRIBER (suscriptor) | Autogestión         | Ver/actualizar sus datos, ver contratos, Habeas Data |

### Caso de uso principal: Lead-to-Cash (L2C)

```
1. Vendedor registra lead con geolocalización → verifica cobertura automática
2. Convierte lead en oportunidad → genera cotización con plan y precio
3. Suscriptor firma contrato digitalmente (cumple MinTIC/CRC)
4. Sistema crea orden de provisioning automática (evento BullMQ → Sprint 05)
5. Activa contrato → inicia billing (evento BullMQ → Sprint 04)
```

> **NOTA:** Los pasos 4 y 5 se implementan como eventos emitidos por el CRM que serán consumidos por módulos futuros (Provisioning Sprint 05, Billing Sprint 04). En Sprint 02, estos eventos se emiten pero no tienen consumidor aún.

---

## PREGUNTAS DE ACLARACIÓN PARA EL ARCHITECT

Antes de diseñar, debes responder estas preguntas con decisiones fundamentadas. Si la respuesta requiere un ADR, genéralo.

### P1: ¿Cómo modelar Persona Natural vs Jurídica?

- ¿Una tabla `subscribers` con discriminador `person_type` (STI)?
- ¿Dos tablas separadas `natural_persons` + `legal_persons` con FK a `subscribers`?
- ¿Patrón Party Model (tabla `parties` + `party_roles`)?
- Considerar: estrato (solo Natural), NIT+DV (solo Jurídica), rep. legal (solo Jurídica), múltiples contactos (solo Jurídica)

### P2: ¿Cómo gestionar el consentimiento Habeas Data (Ley 1581/2012)?

- ¿Tabla dedicada `data_consents` con versionado (fecha, canal, versión política, revocabilidad)?
- ¿Integrado en la entidad subscriber?
- Considerar: auditoría de cambios, derechos ARCO con SLA 15 días, revocación parcial vs total

### P3: ¿Cómo modelar el pipeline de ventas (Lead → Oportunidad → Cotización → Contrato)?

- ¿Máquina de estados (state machine pattern)?
- ¿Tablas separadas por etapa?
- ¿Una tabla `opportunities` con campo `stage` + tabla `contracts` separada?
- Considerar: historial de transiciones, métricas de conversión, asignación a vendedor

### P4: ¿El contrato digital debe almacenarse como PDF firmado o como datos estructurados?

- Considerar: cláusulas CRC obligatorias, firma digital (no necesariamente PKI, puede ser aceptación electrónica), versionado de términos
- ¿Generar PDF on-demand desde datos estructurados o almacenar PDF firmado en MinIO?

### P5: ¿Cómo implementar la verificación de cobertura por geolocalización?

- ¿PostGIS con polígonos de cobertura por tenant?
- ¿Tabla de zonas/sectores con radio aproximado?
- Considerar: cada ISP define sus propias zonas, puede ser por radio, polígono, o lista de direcciones

### P6: ¿El motor IVA (estrato + tipo persona) vive en CRM o en Billing?

- RF-CRM-09 dice "aplicación automática del tratamiento IVA según tipo de cliente y estrato"
- Pero el Billing (Sprint 04) es quien genera facturas
- ¿El CRM almacena la regla de IVA en el subscriber y el Billing la consume?

---

## REGULACIÓN COLOMBIANA RELEVANTE

El Architect DEBE considerar estos marcos regulatorios:

### Ley 1581 de 2012 — Habeas Data

- Consentimiento previo, expreso e informado para tratamiento de datos personales
- Derechos ARCO: Acceso, Rectificación, Cancelación, Oposición — plazo máximo 15 días hábiles
- Responsable y encargado del tratamiento deben estar identificados
- Política de tratamiento de datos debe estar publicada y versionada
- Registro en RNBD (Registro Nacional de Bases de Datos) ante SIC

### Resoluciones CRC (Comisión de Regulación de Comunicaciones)

- Contratos deben incluir: velocidad mínima garantizada, cláusula de permanencia (máx 12 meses), compensación por incumplimiento
- Formato estándar CRC para contratos de telecomunicaciones
- PQR (Peticiones, Quejas, Reclamos) con tiempos CRC

### NIT + Dígito de Verificación

- Personas jurídicas: NIT (9 dígitos) + DV (1 dígito, calculable algorítmicamente)
- Validación del DV es obligatoria

### Estratificación Socioeconómica

- Estratos 1-6 (1=más bajo, 6=más alto)
- Estrato determina tratamiento IVA en telecomunicaciones:
  - Estratos 1-2: EXENTO de IVA
  - Estrato 3: EXCLUIDO (parcial)
  - Estratos 4-6: IVA 19%
  - Personas jurídicas: IVA 19% siempre

---

## MODELO DE DATOS BORRADOR (PUNTO DE PARTIDA — EL ARCHITECT DEBE REFINARLO)

> Este es un borrador del EM. El Architect debe refinarlo, agregar índices, constraints, y relaciones.

```
-- En schema de tenant (tenant_{uuid})

subscribers
├── id (UUID PK)
├── person_type (ENUM: NATURAL, LEGAL)
├── status (ENUM: LEAD, PROSPECT, ACTIVE, SUSPENDED, CANCELLED)
├── -- Datos comunes
├── email_hash (VARCHAR) — para búsqueda, PII cifrado
├── email_encrypted (BYTEA) — AES-256-GCM
├── phone_encrypted (BYTEA)
├── address (JSONB) — dirección estructurada
├── -- Natural
├── first_name_encrypted (BYTEA)
├── last_name_encrypted (BYTEA)
├── document_type (ENUM: CC, CE, PASSPORT, TI, NIT)
├── document_number_hash (VARCHAR)
├── document_number_encrypted (BYTEA)
├── estrato (SMALLINT 1-6, nullable para jurídica)
├── -- Jurídica
├── business_name (VARCHAR) — razón social (no PII)
├── nit (VARCHAR 9)
├── nit_dv (CHAR 1) — dígito verificación
├── legal_rep_name_encrypted (BYTEA)
├── -- Metadata
├── created_at, updated_at, created_by, updated_by

contacts (para personas jurídicas — múltiples contactos)
├── id (UUID PK)
├── subscriber_id (FK → subscribers)
├── name_encrypted (BYTEA)
├── email_encrypted (BYTEA)
├── phone_encrypted (BYTEA)
├── role (VARCHAR) — "Facturación", "Técnico", "Gerente"
├── is_primary (BOOLEAN)

data_consents
├── id (UUID PK)
├── subscriber_id (FK → subscribers)
├── consent_type (ENUM: GENERAL, MARKETING, THIRD_PARTY)
├── granted (BOOLEAN)
├── granted_at (TIMESTAMPTZ)
├── channel (VARCHAR) — "web", "presencial", "telefónico"
├── policy_version (VARCHAR) — "v1.0", "v1.1"
├── revoked_at (TIMESTAMPTZ, nullable)
├── revocation_reason (TEXT, nullable)

opportunities (pipeline de ventas)
├── id (UUID PK)
├── subscriber_id (FK → subscribers)
├── stage (ENUM: LEAD, QUALIFIED, PROPOSAL, NEGOTIATION, WON, LOST)
├── assigned_to (FK → users)
├── expected_mrr (DECIMAL)
├── notes (TEXT)
├── won_at / lost_at / lost_reason

contracts
├── id (UUID PK)
├── subscriber_id (FK → subscribers)
├── opportunity_id (FK → opportunities, nullable)
├── contract_number (VARCHAR UNIQUE)
├── status (ENUM: DRAFT, PENDING_SIGNATURE, ACTIVE, SUSPENDED, TERMINATED)
├── plan_id (FK → plans, futuro)
├── start_date, end_date
├── permanence_months (SMALLINT) — máx 12 según CRC
├── min_speed_mbps (DECIMAL) — velocidad mínima garantizada CRC
├── monthly_amount (DECIMAL)
├── iva_treatment (ENUM: EXEMPT, EXCLUDED, TAXED_19)
├── signed_at (TIMESTAMPTZ)
├── signature_method (ENUM: ELECTRONIC, DIGITAL, PRESENCIAL)
├── document_url (VARCHAR) — referencia a MinIO
├── crc_clauses (JSONB) — cláusulas obligatorias CRC

coverage_zones
├── id (UUID PK)
├── name (VARCHAR)
├── zone_type (ENUM: POLYGON, RADIUS, ADDRESS_LIST)
├── geometry (GEOMETRY o JSONB) — PostGIS o coordenadas
├── technology (ENUM: GPON, WIRELESS, HFC)
├── max_capacity (INTEGER)
├── current_subscribers (INTEGER)
```

---

## OUTPUTS ESPERADOS

### Output 1: PRD-MOD02-CRM-Subscribers-Contracts-v1.0.md

Documento final del módulo con:

1. Contexto y motivación
2. Alcance IN / OUT
3. Casos de uso y actores
4. Requerimientos funcionales y no funcionales
5. Dependencias, riesgos y criterios de bloqueo técnico
6. Fases internas del módulo con criterio de cierre por fase
7. Definition of Done del módulo con cierre solo en producción

### Output 2: HLD-MOD02-CRM-Subscribers-Contracts-v1.0.md

Documento con las siguientes secciones:

1. **Respuestas a preguntas de aclaración** (P1-P6) — con justificación y ADR si aplica
2. **Arquitectura del módulo** — diagrama de componentes, dependencias con Auth/Tenant/Audit
3. **Modelo de datos definitivo** — entidades TypeORM con decoradores, índices, constraints
4. **Contratos de API OpenAPI** — endpoints REST con request/response DTOs
5. **Diagramas de secuencia** — Lead-to-Cash, Habeas Data ARCO, verificación cobertura
6. **Criterios de aceptación** — CA-M02-001 a CA-M02-XXX (formato: ID, descripción, categoría, prioridad)
7. **Guía de implementación** — orden de tareas para Sr. Dev Fullstack, Data Engineer, QA
8. **Eventos BullMQ emitidos** — contratos de eventos que consumirán módulos futuros (Billing, Provisioning)
9. **Matriz documental por fase** — artefacto, responsable, carpeta `docs/`, gate de salida

### Output 3: ADRs adicionales (si aplican)

Generar ADR-023, ADR-024, etc. para decisiones de diseño que lo requieran (ej: Party Model vs STI, PostGIS vs JSONB para cobertura, etc.)

### Output 4: Checklist de prerrequisitos y criterios de stop/go

¿Qué debe existir antes de que los Sr. Devs empiecen a codificar?

- Migraciones de base de datos
- Extensiones PostgreSQL (ej: PostGIS)
- Nuevas dependencias npm
- Configuración adicional de Docker
- Bloqueos técnicos que obligan a detener o repriorizar el módulo

---

## REGLAS ABSOLUTAS

1. **PII SIEMPRE cifrado** — Ley 1581/2012. Datos personales de suscriptores NUNCA en plaintext en DB
2. **Búsqueda por hash** — email_hash, document_number_hash para lookups sin descifrar
3. **Multi-tenant** — todas las tablas CRM viven en schema de tenant, NO en público
4. **Audit automático** — el AuditInterceptor existente captura todas las operaciones CRM
5. **No acceder a tablas de Auth** — usar interfaces del AuthService para validación
6. **Eventos desacoplados** — emitir eventos BullMQ para Billing/Provisioning, nunca llamar directamente
7. **Validación de NIT+DV** — algoritmo de verificación obligatorio
8. **Estrato → IVA** — regla fiscal colombiana no negociable

---

## ARCHIVOS DE REFERENCIA

Disponibles para contexto adicional:

- `docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md` — PRD maestro con RF-CRM-01 a RF-CRM-13
- `docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md` — HLD del módulo anterior (referencia de formato y entidades existentes)
- `docs/prds/PRD-MOD01-DEFINICION-v1.1.md` — PRD del módulo anterior
- `docs/adrs/ADR-017 a ADR-020` — decisiones vigentes <!-- rango recortado 2026-07-19 vía ADR-056: ADR-021 está Superado por ADR-049 y no es decisión vigente -->
- `docs/prds/Stack_Tecnologico.md` — versiones actuales del stack
- `packages/database/src/sql/tenant_template.sql` — template actual del schema de tenant
- `packages/shared/src/constants/security.constants.ts` — constantes de seguridad (cifrado, hashing)
