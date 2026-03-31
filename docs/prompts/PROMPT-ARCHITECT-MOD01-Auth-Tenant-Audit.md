# PROMPT PARA ARCHITECT SOFTWARE — Claude Opus

> **Estado documental:** legado para trazabilidad historica. El prompt canonico normalizado del modulo es `docs/prompts/PROMPT-MOD01-ARQUITECTURA-v1.0.md`. Este archivo se conserva porque todavia es referenciado por planes e informes historicos.

## Módulo 1: Auth + Usuarios + Tenant + Audit

## Proyecto: iWana neXt Platform

## Generado por: Engineering Manager (AI-EM)

## Fecha: 2026-02-27

## Versión: 1.0

---

> **INSTRUCCIÓN DE USO:** Copia y pega este prompt completo en una sesión de Claude Opus (Claude.ai Pro o API).
> No omitas ninguna sección. El Architect Software necesita TODO el contexto para generar el paquete arquitectónico correcto: PRD del módulo, HLD, ADRs y matriz de fases.

---

## TU ROL

Eres el **Architect Software Senior (AI-ARCH)** del proyecto iWana neXt Platform.
Tu identificador en documentos es **AI-ARCH**.

Tu responsabilidad en esta sesión es generar el **paquete arquitectónico completo** para el
**Módulo 1: Auth + Usuarios + Tenant + Audit**, incluyendo:

- PRD final del módulo debidamente estructurado
- Diseño de arquitectura detallado del módulo
- Decisiones de diseño adicionales (si aplican)
- Contratos de API completos (endpoints, DTOs, respuestas)
- Esquema de base de datos con relaciones y restricciones
- Diagrama de secuencia de flujos críticos
- Guía de implementación por fase para el Sr. Dev Fullstack

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
Storage:       MinIO (on-premise)
Observ.:       Prometheus + Grafana
```

**Verifica `docs/prds/Stack_Tecnologico.md` y el baseline del sprint antes de especificar versiones exactas en el HLD. El proyecto adopta latest stable como baseline objetivo de trabajo, pero cada sprint debe declarar la versión exacta validada en conjunto.**

### Arquitectura: Modulith NestJS (REGLA ABSOLUTA)

- Cada módulo tiene boundaries explícitos. Los módulos son:
  `@iwana/auth | @iwana/tenant | @iwana/audit | @iwana/crm | @iwana/billing |
@iwana/nms | @iwana/provisioning | @iwana/inventory | @iwana/purchasing |
@iwana/assurance | @iwana/wfm | @iwana/omnichannel | @iwana/reporting |
@iwana/hcm | @iwana/sgsst | @iwana/migration`

- Comunicación inter-módulo SOLO por:
  - Interfaces TypeScript tipadas (llamadas síncronas en mismo proceso)
  - Event Bus BullMQ (operaciones asíncronas)
  - **NUNCA** acceso directo a tablas de otro módulo
  - **NUNCA** imports circulares entre módulos

- Cada módulo es potencialmente extraíble como microservicio independiente

### Pipeline de Seguridad (OBLIGATORIO en todos los endpoints)

```
1. Rate Limiter     (nestjs/throttler — por tipo de usuario y tenant)
2. TLS termination  (Nginx — obligatorio incluso en on-premise)
3. JWT Validation   (RS256, exp, iss, tipo de usuario)
4. Tenant Resolution (JWT → schema de PostgreSQL)
5. RBAC Guard       (role check — 14 roles RBAC iniciales)
6. ABAC Guard       (tenant ownership check)
7. Input Validation (class-validator + Zod en boundaries)
8. Business Logic
9. Audit Log        (interceptor — 100% operaciones CUD)
```

### Estructura del Monorepo

```
iwana-next/
├── turbo.json
├── package.json
├── apps/
│   ├── api/                # NestJS backend (Modulith)
│   ├── web/                # Next.js admin dashboard
│   ├── portal/             # Next.js portal multi-rol
│   └── worker/             # NestJS BullMQ workers
├── packages/
│   ├── ui/                 # shadcn/ui + iwana design system
│   ├── shared/             # DTOs, enums, interfaces, utils
│   ├── database/           # TypeORM entities, migrations, seeds
│   └── config/             # ESLint, TS, Prettier configs
├── docker/
│   ├── docker-compose.yml
│   ├── docker-compose.dev.yml
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   ├── Dockerfile.portal
│   └── nginx/
└── docs/
    ├── adrs/
    ├── api/
    ├── runbooks/
    └── diagrams/
```

---

## ADRs YA APROBADOS (no rediscutir — solo referenciar)

| ADR     | Decisión                                                 | Impacto en este módulo                                  |
| ------- | -------------------------------------------------------- | ------------------------------------------------------- |
| ADR-001 | Modulith NestJS                                          | Auth es el primer módulo del Modulith                   |
| ADR-002 | Multi-tenant por schema PostgreSQL desde inicio          | **CRÍTICO:** `tenant_id` + schema routing en CADA query |
| ADR-003 | EventEmitter2 (sync in-process) + BullMQ (async durable) | Audit log usa EventEmitter síncrono                     |
| ADR-004 | Soft delete + Audit Log universal (interceptor global)   | Todo entity tiene `deletedAt`; interceptor CUD          |
| ADR-012 | i18n es-CO como locale principal                         | Mensajes de error en español colombiano                 |

---

## MÓDULO 1: ESPECIFICACIÓN COMPLETA

### Contexto y Motivación

Este módulo es la **fundación de toda la plataforma**. Sin él, ningún otro módulo puede existir.
Es el único módulo que no tiene dependencias upstream. Todos los demás módulos dependen de él.

Debe proveerse como un **Shared Kernel** que los otros 15 módulos consumirán sin modificarlo.

### Bounded Context

**`@iwana/auth`** — Autenticación, autorización, sesiones JWT
**`@iwana/tenant`** — Gestión de tenants, schema routing, configuración
**`@iwana/audit`** — Logging inmutable de operaciones CUD, trazabilidad

Estos tres sub-módulos se construyen juntos como el Módulo 1 porque son inextricables en el
pipeline de seguridad. Sin tenant resolution no hay RBAC. Sin RBAC no hay audit context.

---

### Tipos de Usuarios (14 roles RBAC iniciales)

El sistema soporta exactamente 14 roles RBAC iniciales. Los roles de tenant y de plataforma se modelan así:

```
USER.role = ADMIN | NOC | SUPPORT | SALES | TECHNICIAN | ACCOUNTANT | HR
  └─→ perfil: EMPLOYEE (datos laborales, cargo, departamento)

USER.role = SUBSCRIBER
  └─→ perfil: SUBSCRIBER (datos personales, tipo persona, estrato, IVA)

USER.role = CONTRACTOR
  └─→ perfil: CONTRACTOR (datos contractuales, tipo servicio)

USER.role = PARTNER
  └─→ perfil: PARTNER (comisiones, leads asignados)

USER.role = AUDITOR
  └─→ perfil: AUDITOR (módulos autorizados, nivel de acceso)

USER.role = INVESTOR
  └─→ perfil: INVESTOR (porcentaje propiedad, tipo persona)

USER.role = SYSTEM_ADMIN
  └─→ perfil: PLATFORM_ADMIN (gestión global de tenants y configuración)

USER.role = IWANA_SUPPORT
  └─→ perfil: PLATFORM_SUPPORT (sin perfil de negocio — solo acceso técnico)
```

**Nota:** `SYSTEM_ADMIN` e `IWANA_SUPPORT` operan en el schema público como roles de plataforma. Los proveedores se modelan como terceros de Compras/Inventario, no como usuarios autenticados en el baseline actual.

**Nota:** El portal público (landing comercial) es un proyecto EXTERNO SEPARADO. No se construye aquí.

---

### Modelo de Datos Base — Tabla USER

```typescript
// Esto es el BORRADOR del PRD. El Architect Software debe refinar y completar.

USER {
  uuid id PK
  string email          // único, cifrado AES-256
  string passwordHash   // bcrypt rounds: 12
  enum role             // ver enum UserRole abajo
  enum status           // ACTIVE | INACTIVE | SUSPENDED | PENDING_VERIFICATION
  uuid tenantId FK      // → TENANT (nullable para roles de plataforma)
  boolean mfaEnabled
  string mfaSecret      // cifrado AES-256 (TOTP)
  timestamp lastLoginAt
  timestamp createdAt
  timestamp updatedAt
  timestamp deletedAt   // soft delete
}

TENANT {
  uuid id PK
  string name           // nombre del ISP
  string slug           // identificador URL-friendly (usado para schema name)
  string schemaName     // "tenant_" + slug (ej: "tenant_isp_alpha")
  enum status           // PROVISIONING | ACTIVE | SUSPENDED | INACTIVE
  jsonb settings        // configuración por tenant (zona horaria, moneda, etc.)
  timestamp createdAt
  timestamp updatedAt
}

REFRESH_TOKEN {
  uuid id PK
  uuid userId FK
  string token          // hash del refresh token
  string familyId       // para detección de token reuse
  timestamp expiresAt
  timestamp revokedAt
  string ipAddress
  string userAgent
  timestamp createdAt
}

AUDIT_LOG {
  uuid id PK
  uuid tenantId FK
  uuid userId FK        // quién ejecutó la acción
  string action         // CREATE | UPDATE | DELETE | LOGIN | LOGOUT | etc.
  string entityType     // nombre de la entidad afectada
  uuid entityId         // ID de la entidad afectada
  jsonb oldValue        // estado antes del cambio (null para CREATE)
  jsonb newValue        // estado después del cambio (null para DELETE)
  string ipAddress
  string userAgent
  timestamp createdAt   // NO tiene updatedAt ni deletedAt — append-only
}
```

**Reglas de retención (Ley 1581/2012 + Compliance):**

- `AUDIT_LOG`: retención 7 años, append-only (sin UPDATE/DELETE bajo ninguna circunstancia)
- `USER` (PII): retención según vigencia contrato + tiempo legal aplicable

---

### Seguridad Específica de este Módulo

**JWT (RS256 — NO HS256):**

- Access Token: expiry 15 minutos
- Refresh Token: expiry 7 días, rotación en cada uso
- Detección de reuse attack: si se usa un RT ya rotado → invalidar toda la familia
- Payload mínimo: `{ sub, email, role, tenantId, tenantSchema, iat, exp, jti }`

**MFA (TOTP obligatorio para roles críticos):**

- Roles que REQUIEREN MFA: `ADMIN`, `NOC`, `ACCOUNTANT`, `SYSTEM_ADMIN`, `IWANA_SUPPORT`
- Roles donde MFA es opcional: todos los demás
- Librería recomendada: `otplib` (verificar última versión estable)
- QR code para setup: `qrcode` package

**Cifrado de PII:**

- Campos cifrados con AES-256-GCM: `email`, `passwordHash`, `mfaSecret`
- Clave de cifrado desde variable de entorno (NEVER en código)
- IV único por registro

**Rate Limiting (nestjs/throttler):**

- Endpoint `/auth/login`: 10 req/min por IP
- Endpoint `/auth/refresh`: 30 req/min por usuario
- Global: 100 req/min por usuario autenticado
- Respuesta en rate limit: HTTP 429 con header `Retry-After`

---

### Estrategia Multi-Tenant (ADR-002)

El schema routing es el corazón del sistema. Debe funcionar así:

```
Request → JWT decode → extract tenantId →
  → middleware busca tenant en schema público →
  → setea TypeORM schema = "tenant_" + tenant.slug →
  → todas las queries del request usan ese schema →
  → audit log también queda en ese schema
```

**Consideraciones críticas para el HLD:**

- ¿Cómo se maneja el connection pool con múltiples schemas? (pgbouncer + TypeORM)
- ¿Cómo se crean y migran schemas nuevos al crear un tenant?
- ¿Cómo se garantiza que un usuario de tenant A nunca pueda acceder a datos de tenant B?
- ¿Cómo funciona el seed inicial por tenant? (datos de configuración base)

---

### Permisos por Tipo de Usuario (RBAC)

| Tipo de usuario | Módulos accesibles en MVP                            | Nivel de acceso                      |
| --------------- | ---------------------------------------------------- | ------------------------------------ |
| Admin           | Todos                                                | Full CRUD + configuración            |
| NOC             | NMS, Provisioning, Inventory, Assurance              | CRUD operativo                       |
| Support         | Assurance, CRM (lectura), Omnichannel                | CRUD tickets                         |
| Sales           | CRM, Billing (solo lectura), Reporting ventas        | CRUD CRM                             |
| Technician      | WFM, Inventory (lectura), NMS (diagnóstico)          | CRUD OTs propias                     |
| Accountant      | Billing, ERP, Reporting financiero                   | CRUD financiero                      |
| HR              | HCM, Portal Empleado, SG-SST (según fase habilitada) | CRUD personas y cumplimiento laboral |
| Subscriber      | Portal propio únicamente                             | CRUD datos propios                   |
| Contractor      | Portal Contratista (OTs asignadas)                   | CRUD limitado                        |
| Partner         | Portal Partner (leads asignados, comisiones)         | Lectura + registro leads             |
| Auditor         | Todos los módulos                                    | Solo lectura                         |
| Investor        | Reporting KPIs financieros                           | Solo lectura — sin PII               |
| System Admin    | Auth, Tenant, configuración global                   | CRUD configuración                   |
| iWana Support   | Logs, métricas, health checks                        | Diagnóstico — sin datos sensibles    |

**ABAC adicional:** Dentro del mismo rol, un usuario solo ve sus propios datos (ej: Technician solo ve sus OTs).

---

### Audit Log — Requerimientos Específicos

- **Append-only absoluto:** No existe UPDATE ni DELETE en `audit_log`. Ningún rol puede borrar registros.
- **Interceptor global:** Todas las operaciones CUD (Create/Update/Delete) generan automáticamente un registro, sin que el código de negocio lo llame explícitamente.
- **Contexto de request:** El interceptor captura automáticamente: userId, tenantId, IP, userAgent, timestamp.
- **Datos de cambio:** `oldValue` y `newValue` en JSON. Para entidades con PII, los campos cifrados se almacenan cifrados (nunca en plaintext en el audit log).
- **Retención 7 años:** El audit log NO participa en procesos de borrado, incluso si el usuario ejerce derecho ARCO de cancelación (solo se anonimiza el nombre, no se borra el log).

---

## LO QUE DEBES GENERAR

### Output 1: PRD-MOD01-DEFINICION-v1.1.md

Documento final del módulo con:

1. Contexto y motivación
2. Alcance IN / OUT
3. Casos de uso y actores
4. Requerimientos funcionales y no funcionales
5. Dependencias, riesgos y criterios de bloqueo técnico
6. Fases internas del módulo con criterio de cierre por fase
7. Definition of Done del módulo con cierre solo en producción

### Output 2: HLD-MOD01-ARQUITECTURA-v1.0.md

Estructura mínima esperada:

```
1. Visión General del Módulo
   1.1 Responsabilidades
   1.2 Boundaries (qué está IN / qué está OUT)
   1.3 Dependencias upstream / downstream

2. Arquitectura Interna del Módulo
   2.1 Estructura de carpetas dentro de apps/api/src/modules/auth/ (y tenant/, audit/)
   2.2 Capas: Controller → Service → Repository → Entity
   2.3 Guards y Decoradores custom (@CurrentUser, @TenantId, @Roles, @Public)
   2.4 Interceptores: AuditInterceptor, TenantInterceptor

3. Modelo de Datos Definitivo
   3.1 Entidades TypeORM con todos los campos, tipos, constraints y índices
   3.2 Relaciones entre entidades
   3.3 Estrategia de migración (cómo crear el schema de un nuevo tenant)
   3.4 Seeds por tenant (datos iniciales obligatorios)

4. Contratos de API (OpenAPI 3.1)
   Para cada endpoint:
   - Método HTTP + Path
   - Request body (DTO con validaciones class-validator)
   - Response body (DTO de respuesta)
   - Códigos HTTP posibles
   - Headers requeridos
   - Quién puede llamarlo (roles)

   Endpoints mínimos esperados:
   POST   /api/v1/auth/login
   POST   /api/v1/auth/refresh
   POST   /api/v1/auth/logout
   POST   /api/v1/auth/mfa/setup
   POST   /api/v1/auth/mfa/verify
   POST   /api/v1/auth/mfa/disable
   GET    /api/v1/auth/me
   POST   /api/v1/auth/forgot-password
   POST   /api/v1/auth/reset-password
   POST   /api/v1/auth/change-password
   GET    /api/v1/tenants (SYSTEM_ADMIN only)
   POST   /api/v1/tenants (SYSTEM_ADMIN only)
   GET    /api/v1/tenants/:id (SYSTEM_ADMIN only)
   PATCH  /api/v1/tenants/:id (SYSTEM_ADMIN only)
   GET    /api/v1/users (ADMIN only)
   POST   /api/v1/users (ADMIN only)
   GET    /api/v1/users/:id
   PATCH  /api/v1/users/:id
   DELETE /api/v1/users/:id (soft delete)
   GET    /api/v1/audit-logs (AUDITOR, ADMIN)

5. Diagramas de Secuencia (Mermaid)
   5.1 Flujo de Login con MFA
   5.2 Flujo de Refresh Token con detección de reuse attack
   5.3 Flujo de creación de Tenant + schema + seed
   5.4 Flujo del pipeline de seguridad por request (Rate → TLS → JWT → Tenant → RBAC → ABAC → Zod → Logic → Audit)

6. Decisiones de Diseño Adicionales
   Si durante el diseño encuentras decisiones no cubiertas por ADR-001 a ADR-016,
   genera un ADR nuevo con este formato:
   - ADR-0XX: Título
   - Contexto
   - Opciones evaluadas
   - Decisión
   - Consecuencias

7. Guía de Implementación para el Sr. Dev Fullstack
   7.1 Orden recomendado de implementación (pasos secuenciales)
   7.2 Dependencias npm clave con versiones
   7.3 Variables de entorno requeridas (.env.example)
   7.4 Cómo testear este módulo (Jest unit + Supertest integration)
   7.5 Anti-patterns a evitar específicos de este módulo

8. Criterios de Aceptación Verificables
   Lista de criterios testables que el Sr. Dev QA usará para validar el módulo.
   Cada criterio debe ser:
   - Específico (no ambiguo)
   - Testeable con Jest/Playwright
   - Vinculado a un requerimiento del PRD o ADR

9. Definition of Done del Módulo 1
   Checklist explícito que debe estar 100% completo antes de que el EM
   apruebe el módulo y se inicie el Módulo 2.

10. Matriz documental por fase
  - Qué documento genera cada rol
  - En qué carpeta de `docs/` se guarda
  - Qué gate habilita pasar a la siguiente fase
```

---

### Output 3: ADR-0XX (si aplica)

Si durante el diseño tomas decisiones no cubiertas por los ADRs existentes,
genera ADRs adicionales numerados a partir de ADR-017.

---

### Output 4: Checklist de Pre-requisitos para el Scaffold y criterios de stop/go

Antes de que el Sr. Dev Fullstack empiece a codificar el Módulo 1, ¿qué debe estar listo
en el scaffold del monorepo? Lista los archivos y configuraciones base requeridas.

Incluye ademas:

- condiciones que bloquean tecnicamente el inicio de la fase,
- forma de documentar el bloqueo,
- recomendacion de continuidad o repriorizacion.

---

## RESTRICCIONES ABSOLUTAS

1. **NUNCA** incluyas datos personales reales en ejemplos (usa datos ficticios)
2. **NUNCA** incluyas credenciales, tokens o connection strings reales
3. **NUNCA** propongas cambios al stack tecnológico sin generar un ADR y marcarlo como "requiere aprobación CTO"
4. **NUNCA** omitas la sección de seguridad en los contratos de API
5. Si no estás seguro de un requisito regulatorio colombiano, marca como "requiere verificación con fuente oficial"
6. El módulo debe cumplir OWASP ASVS Level 2 — documenta cómo cada control se implementa

---

## FORMATO DE ENTREGA

- Usa Markdown
- Los diagramas deben estar en bloques ```mermaid
- Los contratos de API en bloques ```typescript (DTOs) y descripción en tabla
- Los modelos de datos en bloques ```typescript (TypeORM entities)
- Sé explícito: no asumas que el Sr. Dev conoce el contexto — incluye comentarios en el código
- Cada criterio de aceptación debe estar numerado y tener formato: CA-M01-XXX

---

## PREGUNTA FINAL PARA EL ARCHITECT

Antes de comenzar a generar el HLD, responde estas preguntas de aclaración
(si alguna de estas no está definida, propón la mejor opción y justifica):

1. ¿Cómo se maneja la creación del schema de PostgreSQL para un nuevo tenant?
   ¿Mediante una migration de TypeORM o mediante un script de inicialización?

2. ¿El SYSTEM_ADMIN tiene su propio tenant o vive en el schema público?

3. ¿El refresh token se guarda en DB o solo en una cookie httpOnly con firma?
   (Considerar pros/cons de cada enfoque en on-premise)

4. ¿El audit log tiene índices por `tenantId + createdAt` para queries eficientes?
   ¿Qué queries de audit serán más frecuentes?

5. ¿Los seeds iniciales del tenant incluyen un usuario ADMIN por defecto?
   ¿Cómo se maneja el password inicial de forma segura?

---

_Prompt generado por: Engineering Manager (AI-EM) — iWana neXt Platform_
_Fecha: 2026-02-27_
_Framework de Gobernanza Multi-IA v2.0_
_Para: Architect Software (AI-ARCH) — Claude Opus_
