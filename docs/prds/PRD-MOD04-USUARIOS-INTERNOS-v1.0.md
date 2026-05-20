# PRD - MOD04 Usuarios Internos

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-03-23  
**Modo activo:** Architect  
**Autor:** AI-EM-ARCH (Lead Software Architect Senior)  
**Trazabilidad base:** docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md  
**PRD relacionado:** docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD04-USUARIOS-INTERNOS-v1.0.md  
**Informe relacionado:** docs/informes/INFORME-MOD04-DEFINICION-v1.0.md  
**ADRs aplicables:** ADR-016, ADR-018, ADR-019, ADR-020, ADR-022

> Nota de gobernanza: este modulo opera dentro del bounded context `UsersModule` existente. No crea un bounded context nuevo, sino que formaliza la gestion CRUD completa de usuarios internos del tenant con cifrado de PII, RBAC por rol y cumplimiento Ley 1581/2012.

---

## 1. Contexto y motivacion

Una empresa aprovisionada dispone de un usuario administrador inicial (seed ADR-020) que puede autenticarse y operar en apps/portal. Sin embargo, la capacidad de gestionar equipo interno — crear, editar, suspender y eliminar usuarios — no estaba formalizada como modulo funcional completo.

El estado actual observado en el repositorio previo a este PRD era:

- La entidad `User` existia con columnas basicas de autenticacion (email, password_hash, role, status, MFA).
- El `AuthModule` cubria login, refresh, MFA setup/verify.
- No existian endpoints CRUD completos para gestion de usuarios por parte del administrador del tenant.
- No existian campos de perfil profesional (nombre, telefono, cargo, documento).
- No existia cifrado de PII at-rest mas alla del email ya hash-eado.

Problema de negocio:

Un ISP colombiano necesita gestionar su equipo operativo (NOC, soporte, ventas, contabilidad, tecnicos, RRHH) con roles diferenciados, datos personales protegidos bajo Ley 1581 y trazabilidad de cada operacion CRUD.

Problema arquitectonico:

Sin un modulo de usuarios internos formalizado, la plataforma depende del seed inicial y no tiene capacidad de escalar el equipo del tenant. Los datos personales quedarian en texto plano, violando Habeas Data y exponiendo al ISP a riesgo regulatorio.

Objetivo del modulo:

Implementar la gestion completa de usuarios internos del tenant con CRUD seguro, cifrado de PII at-rest (AES-256-GCM), RBAC explicito, paginacion por cursor, soft delete, idempotencia y auditoria integrada.

---

## 2. Alcance en scope / fuera de scope

### En scope

- CRUD completo de usuarios internos del tenant autenticado.
- 14 roles diferenciados: ADMIN, NOC, SUPPORT, SALES, TECHNICIAN, ACCOUNTANT, HR, SUBSCRIBER, CONTRACTOR, PARTNER, AUDITOR, INVESTOR, SYSTEM_ADMIN, IWANA_SUPPORT.
- 4 estados de ciclo de vida: PENDING_VERIFICATION, ACTIVE, SUSPENDED, INACTIVE.
- Cifrado AES-256-GCM at-rest para email, firstName, lastName, documentNumber, mfaSecret.
- Busqueda por email via SHA-256 hash indexado (sin exponer texto plano).
- Generacion de password temporal cuando el administrador no provee password en la creacion.
- Cambio de email de acceso con verificacion de password actual y sincronizacion con contactEmail del tenant.
- Soft delete con restauracion automatica si se recrea usuario con email previamente eliminado.
- Idempotencia via header `Idempotency-Key` en POST y PATCH.
- Paginacion cursor-based eficiente (sin OFFSET).
- RBAC: solo ADMIN y SYSTEM_ADMIN pueden gestionar. RF-RBAC-04: ADMIN no puede eliminar otro ADMIN.
- Auditoria CUD completa con oldValue/newValue via AuditModule.
- 4 tipos de documento de identidad: CC, CE, PASAPORTE, NIT_PERSONA.
- Campo `documentNumber` cifrado at-rest y nunca incluido en respuestas API (Ley 1581).
- Campos de perfil profesional: firstName, lastName, phone (E.164), jobTitle, documentType, documentNumber, avatarUrl.
- Soporte para MFA obligatorio por usuario (`mfaRequired` configurable por admin).
- Portal empresarial con tabla de usuarios, filtros, modales de creacion/edicion/eliminacion.

### Fuera de scope

- Autenticacion (login, JWT, refresh, MFA setup/verify) — resuelto por AuthModule.
- Roles de plataforma (SYSTEM_ADMIN, IWANA_SUPPORT) — no asignables desde portal.
- Permisos granulares ABAC por recurso — diferido a necesidad futura.
- Cambio de password por administrador sin intervencion del usuario.
- Integracion con directorio externo (LDAP, AD, SAML, OIDC).
- Gestion de suscriptores (Subscriber entity) — resuelto por MOD05 CRM.
- Verificacion de email via token enviado por correo — infraestructura de email pendiente.

### Decision de boundary

- UsersModule es el unico modulo autorizado para CRUD sobre la entidad `User`.
- AuthModule consume UsersModule para validar credenciales pero no expone endpoints de gestion.
- AuditModule registra operaciones CUD de forma fire-and-forget.
- TenantModule provee `TenantContext` y sincroniza `contactEmail` cuando el admin principal cambia su email.
- Portal empresarial (apps/portal) es la unica interfaz autorizada para gestion de usuarios del tenant.
- apps/web (consola plataforma) queda fuera del flujo operativo del tenant.

---

## 3. Personas y casos de uso

### Personas primarias

| Persona          | Rol          | Necesidad principal                                             |
| ---------------- | ------------ | --------------------------------------------------------------- |
| Admin Empresa    | ADMIN        | Crear, editar, suspender y eliminar usuarios de su equipo       |
| Admin Plataforma | SYSTEM_ADMIN | Gestionar usuarios de cualquier tenant con privilegios elevados |

### Personas secundarias

| Persona         | Rol                       | Necesidad principal           |
| --------------- | ------------------------- | ----------------------------- |
| Usuario interno | NOC, SUPPORT, SALES, etc. | Ver y editar su propio perfil |

### Casos de uso

| CU    | Actor   | Descripcion                                                                      |
| ----- | ------- | -------------------------------------------------------------------------------- |
| CU-01 | Admin   | Listar usuarios del tenant con filtros por estado y rol, paginacion cursor-based |
| CU-02 | Admin   | Crear usuario nuevo con rol asignado; recibe password temporal si no se provee   |
| CU-03 | Admin   | Editar perfil, rol y estado de un usuario existente                              |
| CU-04 | Admin   | Eliminar (soft delete) un usuario; no puede eliminar otro ADMIN                  |
| CU-05 | Usuario | Ver su propio perfil y datos desencriptados (excepto documentNumber)             |
| CU-06 | Usuario | Editar su propio perfil (nombre, telefono, cargo)                                |
| CU-07 | Usuario | Cambiar su email de acceso con verificacion de password actual                   |
| CU-08 | Admin   | Configurar MFA obligatorio para un usuario especifico                            |

---

## 4. Requisitos funcionales

### RF-USR-01: Listado paginado por cursor

- GET /api/v1/users con parametros: cursor (uuid), limit (1-100, default 50), status (enum), role (enum).
- Retorna `{ data: UserResponseDto[], meta: { nextCursor, total } }`.
- Cursor-based: usa `MoreThan(cursor)` + `take: limit+1` para detectar pagina siguiente.
- Multi-tenant: opera sobre el schema del tenant autenticado via `TenantContext`.

### RF-USR-02: Creacion con cifrado y password temporal

- POST /api/v1/users con CreateUserDto (11 campos).
- Email se cifra con AES-256-GCM y se indexa con SHA-256 hash.
- Si no se provee password, se genera uno temporal de 32 caracteres hex y se retorna en la respuesta.
- El flag `passwordResetRequired` se activa automaticamente.
- Verifica unicidad por emailHash incluyendo registros soft-deleted.
- Si existe un registro soft-deleted con el mismo email, lo restaura y reinicializa todos sus campos.
- Cifra firstName, lastName, documentNumber en la entidad.
- Requiere header `Idempotency-Key` unico.
- Auditoria: registra CREATE con ipAddress.

### RF-USR-03: Actualizacion con auditoria delta

- PATCH /api/v1/users/:id con UpdateUserDto.
- Solo ADMIN/SYSTEM_ADMIN pueden modificar status, role de otros.
- Usuarios no-admin solo pueden editar su propio perfil.
- Registra oldValue/newValue en audit log.
- Cifra campos de perfil al actualizar.
- Requiere header `Idempotency-Key`.

### RF-USR-04: Cambio de email de acceso

- PATCH /api/v1/users/:id/login-email con ChangeUserLoginEmailDto.
- Solo el propio usuario puede cambiar su email (`actor.sub === id`).
- Requiere password actual para verificacion (bcrypt.compare).
- Si es el admin principal del tenant (primer ADMIN por createdAt), sincroniza contactEmail via TenantService.
- Registra en auditoria con entityType `UserLoginEmail`.

### RF-USR-05: Soft delete con reglas RBAC

- DELETE /api/v1/users/:id.
- Solo ADMIN y SYSTEM_ADMIN.
- RF-RBAC-04: ADMIN no puede eliminar otro ADMIN del mismo tenant. SYSTEM_ADMIN si puede.
- No puede auto-eliminarse (BadRequestException).
- Soft delete via TypeORM `@DeleteDateColumn`.
- Registra DELETE en auditoria.

### RF-USR-06: Cifrado at-rest conforme a Ley 1581

- Algoritmo: AES-256-GCM con IV aleatorio de 12 bytes.
- Formato almacenado: `{iv_hex_24}:{authTag_hex_32}:{ciphertext_hex}`.
- Campos cifrados: email, firstName, lastName, documentNumber, mfaSecret.
- Clave: MFA_ENCRYPTION_KEY (64 chars hex → 32 bytes).
- documentNumber nunca se incluye en UserResponseDto.
- Soporte legacy: `decodeProfileValue()` tolera valores en texto plano de migraciones anteriores.

### RF-USR-07: RBAC y autorizacion

- @Roles(UserRole.ADMIN, UserRole.SYSTEM_ADMIN) para operaciones de gestion.
- Solo UserRole enum, nunca strings (prevencion de 403 silencioso).
- Guards: JwtAuthGuard → RolesGuard en todo el controller.
- Verificacion adicional en controller para operaciones sobre perfil propio.

---

## 5. Requisitos no funcionales

| RNF    | Descripcion            | Criterio                                           |
| ------ | ---------------------- | -------------------------------------------------- |
| RNF-01 | Cifrado at-rest        | AES-256-GCM para toda PII; IV unico por registro   |
| RNF-02 | Rendimiento paginacion | Cursor-based, respuesta < 200ms para 100 registros |
| RNF-03 | Auditoria              | Retencion minima 7 anos (Ley 1581/2012)            |
| RNF-04 | Multi-tenant           | Aislamiento total por schema PostgreSQL            |
| RNF-05 | Idempotencia           | Header Idempotency-Key obligatorio en POST/PATCH   |
| RNF-06 | Seguridad password     | bcrypt 12 rounds; password temporal 32 chars hex   |
| RNF-07 | Accesibilidad portal   | WCAG 2.2 AA; dark mode completo                    |
| RNF-08 | Cobertura tests        | >= 80% en servicio; 28+ test cases                 |

---

## 6. Modelo de datos principal

### Entidad User (tabla: users, schema del tenant)

| Columna                   | Tipo BD            | Nullable | Notas                          |
| ------------------------- | ------------------ | -------- | ------------------------------ |
| id                        | UUID (PK)          | No       | gen_random_uuid()              |
| email                     | VARCHAR(512)       | No       | AES-256-GCM cifrado            |
| email_hash                | VARCHAR(64) UNIQUE | No       | SHA-256 para busqueda indexada |
| password_hash             | VARCHAR(60)        | No       | bcrypt 12 rounds               |
| role                      | ENUM UserRole      | No       | 14 valores                     |
| status                    | ENUM UserStatus    | No       | Default PENDING_VERIFICATION   |
| tenant_id                 | UUID               | No       | FK logica a public.tenants.id  |
| mfa_enabled               | BOOLEAN            | No       | Default false                  |
| mfa_secret                | VARCHAR(512)       | Si       | AES-256-GCM                    |
| mfa_required              | BOOLEAN            | No       | Default false                  |
| password_reset_required   | BOOLEAN            | No       | Default false                  |
| password_reset_token      | VARCHAR(512)       | Si       | Cifrado                        |
| password_reset_expires_at | TIMESTAMPTZ        | Si       | 24h expiracion                 |
| failed_login_attempts     | INTEGER            | No       | Default 0; lockout a 5         |
| locked_until              | TIMESTAMPTZ        | Si       | 15 min lockout                 |
| last_login_at             | TIMESTAMPTZ        | Si       | —                              |
| email_verified            | BOOLEAN            | No       | Default false                  |
| email_verification_token  | VARCHAR(512)       | Si       | Cifrado                        |
| first_name                | VARCHAR(512)       | Si       | AES-256-GCM                    |
| last_name                 | VARCHAR(512)       | Si       | AES-256-GCM                    |
| phone                     | VARCHAR(20)        | Si       | E.164, no cifrado              |
| job_title                 | VARCHAR(150)       | Si       | No cifrado                     |
| document_type             | VARCHAR(20)        | Si       | CC/CE/PASAPORTE/NIT_PERSONA    |
| document_number           | VARCHAR(512)       | Si       | AES-256-GCM, nunca en DTOs     |
| avatar_url                | VARCHAR(500)       | Si       | No cifrado                     |
| created_at                | TIMESTAMPTZ        | No       | Default now()                  |
| updated_at                | TIMESTAMPTZ        | No       | Default now()                  |
| deleted_at                | TIMESTAMPTZ        | Si       | Soft delete                    |

### Indices

| Nombre                  | Columnas          | Tipo      |
| ----------------------- | ----------------- | --------- |
| idx_users_email_hash    | email_hash        | UNIQUE    |
| idx_users_tenant_role   | tenant_id, role   | COMPOSITE |
| idx_users_tenant_status | tenant_id, status | COMPOSITE |

---

## 7. Contratos API

### GET /api/v1/users

- **Guards:** JwtAuthGuard, RolesGuard
- **Roles:** ADMIN, SYSTEM_ADMIN
- **Query:** cursor? (uuid), limit? (1-100), status? (enum), role? (enum)
- **Response 200:** `{ data: { data: UserResponseDto[], meta: { nextCursor: string | null, total: number } } }`

### POST /api/v1/users

- **Guards:** JwtAuthGuard, RolesGuard
- **Roles:** ADMIN, SYSTEM_ADMIN
- **Headers:** Idempotency-Key (obligatorio)
- **Body:** CreateUserDto
- **Response 201:** `{ data: UserResponseDto & { temporaryPassword?: string } }`
- **Response 409:** email duplicado

### GET /api/v1/users/:id

- **Guards:** JwtAuthGuard
- **Roles:** cualquier autenticado (controller verifica ADMIN o sub === id)
- **Params:** id (UUID)
- **Response 200:** `{ data: UserResponseDto }`

### PATCH /api/v1/users/:id

- **Guards:** JwtAuthGuard
- **Headers:** Idempotency-Key (obligatorio)
- **Body:** UpdateUserDto
- **Response 200:** `{ data: UserResponseDto }`
- **Response 403:** no-ADMIN modifica a otro

### PATCH /api/v1/users/:id/login-email

- **Guards:** JwtAuthGuard
- **Body:** ChangeUserLoginEmailDto (email, currentPassword, syncCompanyContactEmail?)
- **Response 200:** `{ data: UserResponseDto }`
- **Response 409:** email ya en uso

### DELETE /api/v1/users/:id

- **Guards:** JwtAuthGuard, RolesGuard
- **Roles:** ADMIN, SYSTEM_ADMIN
- **Params:** id (UUID)
- **Response 204:** No content
- **Response 400:** auto-eliminacion
- **Response 403:** ADMIN eliminando ADMIN (RF-RBAC-04)

---

## 8. Validaciones y DTOs

### CreateUserDto

| Campo          | Tipo         | Validaciones                    | Requerido |
| -------------- | ------------ | ------------------------------- | --------- |
| email          | string       | @IsEmail(), @MaxLength(255)     | Si        |
| role           | UserRole     | @IsEnum(UserRole)               | Si        |
| password       | string       | @MinLength(10), @MaxLength(128) | No        |
| firstName      | string       | @MaxLength(100)                 | No        |
| lastName       | string       | @MaxLength(100)                 | No        |
| phone          | string       | @Matches(/^\+\d{7,15}$/) E.164  | No        |
| jobTitle       | string       | @MaxLength(150)                 | No        |
| documentType   | DocumentType | @IsEnum(DocumentType)           | No        |
| documentNumber | string       | @MaxLength(30)                  | No        |
| avatarUrl      | string       | @IsUrl(), @MaxLength(500)       | No        |
| mfaRequired    | boolean      | @IsBoolean()                    | No        |

### UpdateUserDto

Campos opcionales: status, role, firstName, lastName, phone, jobTitle, documentType, documentNumber, avatarUrl, mfaRequired.

### ChangeUserLoginEmailDto

| Campo                   | Tipo    | Validaciones                    | Requerido         |
| ----------------------- | ------- | ------------------------------- | ----------------- |
| email                   | string  | @IsEmail(), @MaxLength(255)     | Si                |
| currentPassword         | string  | @MinLength(10), @MaxLength(128) | Si                |
| syncCompanyContactEmail | boolean | @IsBoolean()                    | No (default true) |

### UserResponseDto (campos expuestos)

id, email (descifrado), role, status, tenantId, mfaEnabled, mfaRequired, emailVerified, passwordResetRequired, lastLoginAt, createdAt, updatedAt, deletedAt, firstName (descifrado), lastName (descifrado), phone, jobTitle, documentType, avatarUrl.

**Excluidos:** passwordHash, mfaSecret, emailHash, documentNumber, tokens, failedLoginAttempts, lockedUntil.

---

## 9. Seguridad y cumplimiento

### Ley 1581/2012 — Habeas Data

- documentNumber cifrado at-rest y nunca expuesto en API.
- email, firstName, lastName cifrados at-rest.
- Audit log con retencion minima 7 anos.
- Soft delete preserva registros para trazabilidad.

### RBAC

- Solo ADMIN/SYSTEM_ADMIN gestionan usuarios.
- RF-RBAC-04: ADMIN no puede eliminar otro ADMIN; SYSTEM_ADMIN si.
- Roles se definen con enum, nunca con strings literales.

### Cifrado

- AES-256-GCM con IV unico de 12 bytes por operacion.
- Clave derivada de MFA_ENCRYPTION_KEY (variable de entorno, 64 hex chars).
- Legacy tolerance: valores previos en texto plano se leen sin error.

### Lockout

- 5 intentos fallidos → bloqueo 15 minutos.
- Campos: failedLoginAttempts, lockedUntil (consumidos por AuthModule).

---

## 10. Dependencias inter-modulo

| Modulo       | Tipo       | Detalle                                           |
| ------------ | ---------- | ------------------------------------------------- |
| AuthModule   | Upstream   | Provee JWT, guards, autenticacion                 |
| TenantModule | Upstream   | Provee TenantContext, sincronizacion contactEmail |
| AuditModule  | Downstream | Registra operaciones CUD fire-and-forget          |
| apps/portal  | Consumer   | Interfaz de gestion de usuarios                   |

---

## 11. Criterios de aceptacion

| CA    | Descripcion                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------- |
| CA-01 | ADMIN puede listar usuarios con filtros y paginacion cursor-based                                  |
| CA-02 | ADMIN puede crear usuario con o sin password; recibe password temporal en respuesta                |
| CA-03 | Campos PII cifrados at-rest con AES-256-GCM; documentNumber nunca en respuestas                    |
| CA-04 | ADMIN no puede eliminar otro ADMIN (RF-RBAC-04); SYSTEM_ADMIN si                                   |
| CA-05 | No puede auto-eliminarse                                                                           |
| CA-06 | Soft delete funcional; re-creacion con email eliminado restaura y reinicializa                     |
| CA-07 | Cambio de email de acceso requiere password actual y sincroniza contactEmail si es admin principal |
| CA-08 | Auditoria CUD completa con oldValue/newValue                                                       |
| CA-09 | Portal: tabla con filtros, modales create/edit/delete, password temporal copiable                  |
| CA-10 | >= 80% cobertura de tests; 28+ test cases                                                          |

---

## 12. Migraciones requeridas

### 003_add_user_profile_fields

Agrega a tabla `users` en todos los schemas de tenant activos:

- first_name VARCHAR(512) — AES-256-GCM
- last_name VARCHAR(512) — AES-256-GCM
- phone VARCHAR(20)
- job_title VARCHAR(150)
- document_type VARCHAR(20)
- document_number VARCHAR(512) — AES-256-GCM
- avatar_url VARCHAR(500)

Usa `ADD COLUMN IF NOT EXISTS` (idempotente).

### 004_add_mfa_required_to_users

Agrega `mfa_required BOOLEAN NOT NULL DEFAULT false` a `users` en todos los schemas activos.

---

## 13. Riesgos y mitigaciones

| Riesgo                                 | Impacto                      | Mitigacion                                                |
| -------------------------------------- | ---------------------------- | --------------------------------------------------------- |
| Password temporal expuesto en red      | Credencial comprometida      | TLS obligatorio; flag passwordResetRequired fuerza cambio |
| Desalineacion api-client vs controller | 404/500 silent               | Endpoints frontend alineados a contratos documentados     |
| Rendimiento con cifrado por campo      | Latencia en listados grandes | Cursor-based pagination; descifrado solo en toDto()       |
| Legacy plaintext en campos cifrados    | Error al descifrar           | decodeProfileValue() tolera texto plano sin error         |

---

## 14. Decision de salida

**GO** — El modulo esta implementado, testeado y operativo en portal. Cumple con cifrado Ley 1581, RBAC, auditoria y todos los criterios de aceptacion documentados.

---

_Documento reconstruido por AI-EM-ARCH a partir del codigo fuente implementado, como parte de la restauracion de gobernanza documental MOD04._
