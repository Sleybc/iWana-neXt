# PRD - MOD04 Usuarios Internos

**Version:** 1.1  
**Estado:** Aprobado y cerrado  
**Fecha:** 2026-03-24  
**Modo activo:** Mixto (EM + Architect)  
**Autor:** AI-EM-ARCH (Lead Software Architect Senior)  
**Trazabilidad base:** docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md  
**PRD relacionado:** docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD04-USUARIOS-INTERNOS-v1.0.md (pendiente actualizar a v1.1)  
**Informe relacionado:** docs/informes/INFORME-MOD04-DEFINICION-v1.0.md  
**ADRs aplicables:** ADR-016, ADR-018, ADR-019, ADR-020, ADR-022  
**Version anterior:** docs/prds/PRD-MOD04-USUARIOS-INTERNOS-v1.0.md

**Cierre operativo:** completado el 2026-03-26 con evidencia consolidada en `docs/informes/INFORME-MOD04-REFACTOR-v1.0.md`.

> Nota de gobernanza: este modulo opera dentro del bounded context `UsersModule` existente. No crea un bounded context nuevo, sino que formaliza la gestion CRUD completa de usuarios internos del tenant con RBAC por rol y auditoria integrada.

---

## Changelog v1.0 → v1.1

| Cambio                                                                     | Tipo           | Razon                                                                                                                                       |
| -------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Eliminar cifrado AES-256-GCM de email, firstName, lastName, documentNumber | Simplificacion | Los datos no se exponen externamente; cifrado at-rest se activara antes de produccion con datos reales                                      |
| Mantener cifrado AES-256-GCM solo en mfaSecret                             | Seguridad      | Clave TOTP permite bypass de MFA si se expone                                                                                               |
| Mantener emailHash como campo derivado (no eliminar)                       | Compatibilidad | emailHash es dependencia transversal de AuthModule, PlatformBootstrap, Worker y JWT payload; se sigue computando desde email en texto plano |
| Agregar RF-USR-08: Admin reset password                                    | Feature nueva  | Endpoint faltante referenciado por frontend                                                                                                 |
| Agregar RF-USR-09: Busqueda por texto                                      | Feature nueva  | Filtros insuficientes para gestion operativa                                                                                                |
| Agregar RF-USR-10: Self-service profile                                    | Feature nueva  | CU-05/06 sin implementacion backend                                                                                                         |
| Corregir desalineaciones API portal ↔ backend                              | Bug fix        | 2 endpoints del portal con 404 en produccion                                                                                                |
| Agregar CU-09: Admin reinicia password de usuario                          | Caso de uso    | Operacion necesaria sin infraestructura de email                                                                                            |

---

## 1. Contexto y motivacion

Una empresa aprovisionada dispone de un usuario administrador inicial (seed ADR-020) que puede autenticarse y operar en apps/portal. Sin embargo, la capacidad de gestionar equipo interno — crear, editar, suspender y eliminar usuarios — no estaba formalizada como modulo funcional completo.

El estado actual observado en el repositorio previo a la v1.0 era:

- La entidad `User` existia con columnas basicas de autenticacion (email, password_hash, role, status, MFA).
- El `AuthModule` cubria login, refresh, MFA setup/verify.
- No existian endpoints CRUD completos para gestion de usuarios por parte del administrador del tenant.
- No existian campos de perfil profesional (nombre, telefono, cargo, documento).

La v1.0 implemento el CRUD con cifrado at-rest. La v1.1 simplifica el cifrado (solo mfaSecret), agrega endpoints faltantes (reset password, self-service profile, busqueda) y corrige desalineaciones detectadas entre frontend y backend.

Problema de negocio:

Un ISP colombiano necesita gestionar su equipo operativo (NOC, soporte, ventas, contabilidad, tecnicos, RRHH) con roles diferenciados y trazabilidad de cada operacion CRUD.

Objetivo del modulo:

Implementar la gestion completa de usuarios internos del tenant con CRUD seguro, RBAC explicito, paginacion por cursor, soft delete, idempotencia, busqueda por texto, self-service de perfil, reset de password por admin y auditoria integrada.

---

## 2. Alcance en scope / fuera de scope

### En scope

- CRUD completo de usuarios internos del tenant autenticado.
- 14 roles diferenciados: ADMIN, NOC, SUPPORT, SALES, TECHNICIAN, ACCOUNTANT, HR, SUBSCRIBER, CONTRACTOR, PARTNER, AUDITOR, INVESTOR, SYSTEM_ADMIN, IWANA_SUPPORT.
- 4 estados de ciclo de vida: PENDING_VERIFICATION, ACTIVE, SUSPENDED, INACTIVE.
- Datos de perfil en texto plano: email, firstName, lastName, phone, jobTitle, documentType, documentNumber, avatarUrl.
- Cifrado AES-256-GCM at-rest solo para mfaSecret (clave TOTP).
- Busqueda por texto (ILIKE) en email, firstName, lastName, jobTitle.
- Email con constraint UNIQUE directo (sin hash intermediario).
- Generacion de password temporal cuando el administrador no provee password en la creacion.
- Reset de password por admin: genera password temporal y fuerza cambio en proximo login.
- Self-service de perfil: usuarios no-admin ven y editan su propio perfil via /users/me.
- Cambio de email de acceso con verificacion de password actual y sincronizacion con contactEmail del tenant.
- Soft delete con restauracion automatica si se recrea usuario con email previamente eliminado.
- Idempotencia via header `Idempotency-Key` en POST y PATCH.
- Paginacion cursor-based eficiente (sin OFFSET).
- RBAC: solo ADMIN y SYSTEM_ADMIN pueden gestionar. RF-RBAC-04: ADMIN no puede eliminar otro ADMIN.
- Auditoria CUD completa con oldValue/newValue via AuditModule.
- 4 tipos de documento de identidad: CC, CE, PASAPORTE, NIT_PERSONA.
- Campo `documentNumber` nunca incluido en respuestas API (minimizacion de datos).
- Soporte para MFA obligatorio por usuario (`mfaRequired` configurable por admin).
- Portal empresarial con tabla de usuarios, filtros, busqueda, modales de creacion/edicion/eliminacion, reset password.

### Fuera de scope

- Autenticacion (login, JWT, refresh, MFA setup/verify) — resuelto por AuthModule.
- Roles de plataforma (SYSTEM_ADMIN, IWANA_SUPPORT) — no asignables desde portal.
- Permisos granulares ABAC por recurso — diferido a modulos futuros que lo requieran.
- Integracion con directorio externo (LDAP, AD, SAML, OIDC) — diferido a necesidad de cliente.
- Gestion de suscriptores (Subscriber entity) — resuelto por MOD05 CRM.
- Verificacion de email via token enviado por correo — infraestructura de email pendiente.
- Cifrado at-rest de PII (email, firstName, lastName, documentNumber) — diferido como deuda tecnica; se activara antes de produccion con datos reales de clientes.

### Deuda tecnica documentada

| DT    | Descripcion                                                                         | Cuando activar                                       | Riesgo si se omite                                          |
| ----- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| DT-01 | Cifrado at-rest de PII (email, firstName, lastName, documentNumber) con AES-256-GCM | Antes de produccion con datos reales de clientes ISP | Incumplimiento Ley 1581/2012 ante breach de BD              |
| DT-02 | Verificacion de email via token                                                     | Cuando infraestructura de email este disponible      | Emails no verificados pueden causar notificaciones fallidas |

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

| Persona          | Rol          | Necesidad principal                                               |
| ---------------- | ------------ | ----------------------------------------------------------------- |
| Admin Empresa    | ADMIN        | Crear, editar, suspender, eliminar usuarios y reiniciar passwords |
| Admin Plataforma | SYSTEM_ADMIN | Gestionar usuarios de cualquier tenant con privilegios elevados   |

### Personas secundarias

| Persona         | Rol                       | Necesidad principal           |
| --------------- | ------------------------- | ----------------------------- |
| Usuario interno | NOC, SUPPORT, SALES, etc. | Ver y editar su propio perfil |

### Casos de uso

| CU    | Actor   | Descripcion                                                                                          |
| ----- | ------- | ---------------------------------------------------------------------------------------------------- |
| CU-01 | Admin   | Listar usuarios del tenant con filtros por estado, rol y busqueda por texto, paginacion cursor-based |
| CU-02 | Admin   | Crear usuario nuevo con rol asignado; recibe password temporal si no se provee                       |
| CU-03 | Admin   | Editar perfil, rol y estado de un usuario existente                                                  |
| CU-04 | Admin   | Eliminar (soft delete) un usuario; no puede eliminar otro ADMIN                                      |
| CU-05 | Usuario | Ver su propio perfil via /users/me                                                                   |
| CU-06 | Usuario | Editar su propio perfil (nombre, telefono, cargo) via /users/me                                      |
| CU-07 | Usuario | Cambiar su email de acceso con verificacion de password actual                                       |
| CU-08 | Admin   | Configurar MFA obligatorio para un usuario especifico                                                |
| CU-09 | Admin   | Reiniciar password de un usuario; genera password temporal y fuerza cambio                           |

---

## 4. Requisitos funcionales

### RF-USR-01: Listado paginado por cursor con busqueda

- GET /api/v1/users con parametros: cursor (uuid), limit (1-100, default 50), status (enum), role (enum), search (string).
- Busqueda por texto: ILIKE en email, firstName, lastName, jobTitle.
- Retorna `{ data: UserResponseDto[], meta: { nextCursor, total } }`.
- Cursor-based: usa `MoreThan(cursor)` + `take: limit+1` para detectar pagina siguiente.
- Multi-tenant: opera sobre el schema del tenant autenticado via `TenantContext`.

### RF-USR-02: Creacion con password temporal

- POST /api/v1/users con CreateUserDto (11 campos).
- Email almacenado en texto plano; constraint UNIQUE en email y en emailHash.
- emailHash se auto-computa como SHA-256(email.toLowerCase().trim()) al crear/actualizar.
- Si no se provee password, se genera uno temporal de 32 caracteres hex y se retorna en la respuesta.
- El flag `passwordResetRequired` se activa automaticamente.
- Verifica unicidad por email incluyendo registros soft-deleted.
- Si existe un registro soft-deleted con el mismo email, lo restaura y reinicializa todos sus campos.
- Requiere header `Idempotency-Key` unico.
- Auditoria: registra CREATE con ipAddress.

### RF-USR-03: Actualizacion con auditoria delta

- PATCH /api/v1/users/:id con UpdateUserDto.
- Solo ADMIN/SYSTEM_ADMIN pueden modificar status, role de otros.
- Usuarios no-admin solo pueden editar su propio perfil.
- Registra oldValue/newValue en audit log.
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

### RF-USR-06: Datos en texto plano con excepcion mfaSecret

- Campos de perfil (email, firstName, lastName, documentNumber) almacenados en texto plano.
- emailHash: SHA-256(email.toLowerCase().trim()), se mantiene como campo derivado auto-computado. Es dependencia transversal de AuthModule (login, JWT payload), PlatformBootstrapService, TenantSeedService. MOD04 no lo elimina.
- mfaSecret: cifrado con AES-256-GCM, IV aleatorio de 12 bytes.
- Formato almacenado mfaSecret: `{iv_hex_24}:{authTag_hex_32}:{ciphertext_hex}`.
- Clave: MFA_ENCRYPTION_KEY (64 chars hex → 32 bytes), variable de entorno.
- documentNumber nunca se incluye en UserResponseDto (minimizacion de datos).
- Soporte legacy: `decodeProfileValue()` tolera valores cifrados de versiones anteriores.
- **DT-01:** Cifrado at-rest de PII se activara antes de produccion con datos reales.

### RF-USR-07: RBAC y autorizacion

- @Roles(UserRole.ADMIN, UserRole.SYSTEM_ADMIN) para operaciones de gestion.
- Solo UserRole enum, nunca strings (prevencion de 403 silencioso).
- Guards: JwtAuthGuard → RolesGuard en todo el controller.
- Verificacion adicional en controller para operaciones sobre perfil propio.

### RF-USR-08: Reset de password por admin (v1.1)

- PATCH /api/v1/users/:id/password con ResetPasswordDto opcional.
- Solo ADMIN y SYSTEM_ADMIN.
- Header: Idempotency-Key obligatorio.
- Genera password temporal de 32 caracteres hex si no se provee password.
- Hash con bcrypt 12 rounds.
- Activa `passwordResetRequired=true`.
- No puede resetear a SYSTEM_ADMIN (solo otro SYSTEM_ADMIN puede).
- Registra en auditoria con entityType `UserPasswordReset`.
- Response: `{ data: { temporaryPassword: string } }`.

### RF-USR-09: Busqueda por texto (v1.1)

- Query param `search` en GET /api/v1/users.
- Busqueda ILIKE en: email, firstName, lastName, jobTitle.
- Compatible con filtros existentes (status, role) — se combinan con AND.
- Case-insensitive.

### RF-USR-10: Self-service de perfil (v1.1)

- GET /api/v1/users/me: retorna perfil del usuario autenticado (sin guardia de rol).
- PATCH /api/v1/users/me: actualiza campos de perfil propio (firstName, lastName, phone, jobTitle, documentType, documentNumber, avatarUrl, mfaRequired).
- No permite cambiar role ni status desde /me.
- Header: Idempotency-Key obligatorio en PATCH.
- Registra auditoria con entityType `UserProfile`.
- Nota tecnica: registrar rutas /me ANTES que /:id en el controller para evitar conflicto con ParseUUIDPipe.

---

## 5. Requisitos no funcionales

| RNF    | Descripcion               | Criterio                                                      |
| ------ | ------------------------- | ------------------------------------------------------------- |
| RNF-01 | mfaSecret cifrado at-rest | AES-256-GCM; IV unico por registro                            |
| RNF-02 | Rendimiento paginacion    | Cursor-based, respuesta < 200ms para 100 registros            |
| RNF-03 | Auditoria                 | Retencion minima 7 anos (Ley 1581/2012)                       |
| RNF-04 | Multi-tenant              | Aislamiento total por schema PostgreSQL                       |
| RNF-05 | Idempotencia              | Header Idempotency-Key obligatorio en POST/PATCH              |
| RNF-06 | Seguridad password        | bcrypt 12 rounds; password temporal 32 chars hex              |
| RNF-07 | Accesibilidad portal      | WCAG 2.2 AA; dark mode completo                               |
| RNF-08 | Cobertura tests           | >= 80% en servicio y controller; tests unitarios + HTTP + E2E |
| RNF-09 | Busqueda                  | ILIKE en 4 campos; respuesta < 200ms                          |

---

## 6. Modelo de datos principal

### Entidad User (tabla: users, schema del tenant)

| Columna                   | Tipo BD            | Nullable | Notas                                                                             |
| ------------------------- | ------------------ | -------- | --------------------------------------------------------------------------------- |
| id                        | UUID (PK)          | No       | gen_random_uuid()                                                                 |
| email                     | VARCHAR(255)       | No       | Texto plano; constraint UNIQUE                                                    |
| email_hash                | VARCHAR(64) UNIQUE | No       | SHA-256 derivado de email; auto-computado; dependencia transversal AuthModule/JWT |
| password_hash             | VARCHAR(60)        | No       | bcrypt 12 rounds                                                                  |
| role                      | ENUM UserRole      | No       | 14 valores                                                                        |
| status                    | ENUM UserStatus    | No       | Default PENDING_VERIFICATION                                                      |
| tenant_id                 | UUID               | No       | FK logica a public.tenants.id                                                     |
| mfa_enabled               | BOOLEAN            | No       | Default false                                                                     |
| mfa_secret                | VARCHAR(512)       | Si       | AES-256-GCM cifrado                                                               |
| mfa_required              | BOOLEAN            | No       | Default false                                                                     |
| password_reset_required   | BOOLEAN            | No       | Default false                                                                     |
| password_reset_token      | VARCHAR(512)       | Si       | Token de reset                                                                    |
| password_reset_expires_at | TIMESTAMPTZ        | Si       | 24h expiracion                                                                    |
| failed_login_attempts     | INTEGER            | No       | Default 0; lockout a 5                                                            |
| locked_until              | TIMESTAMPTZ        | Si       | 15 min lockout                                                                    |
| last_login_at             | TIMESTAMPTZ        | Si       | —                                                                                 |
| email_verified            | BOOLEAN            | No       | Default false                                                                     |
| email_verification_token  | VARCHAR(512)       | Si       | Token de verificacion                                                             |
| first_name                | VARCHAR(100)       | Si       | Texto plano                                                                       |
| last_name                 | VARCHAR(100)       | Si       | Texto plano                                                                       |
| phone                     | VARCHAR(20)        | Si       | E.164                                                                             |
| job_title                 | VARCHAR(150)       | Si       | Texto plano                                                                       |
| document_type             | VARCHAR(20)        | Si       | CC/CE/PASAPORTE/NIT_PERSONA                                                       |
| document_number           | VARCHAR(30)        | Si       | Texto plano; nunca en API responses                                               |
| avatar_url                | VARCHAR(500)       | Si       | URL                                                                               |
| created_at                | TIMESTAMPTZ        | No       | Default now()                                                                     |
| updated_at                | TIMESTAMPTZ        | No       | Default now()                                                                     |
| deleted_at                | TIMESTAMPTZ        | Si       | Soft delete                                                                       |

### Columnas mantenidas por compatibilidad transversal (v1.1)

| Columna    | Razon                                                                                                                                                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| email_hash | Dependencia transversal: AuthModule (login, forgotPassword, JWT payload), PlatformBootstrapService, TenantSeedService. Se mantiene como campo derivado auto-computado desde email en texto plano. UsersModule (MOD04) no lo usa para busquedas — usa email directo con ILIKE. |

### Indices

| Nombre                  | Columnas          | Tipo                            |
| ----------------------- | ----------------- | ------------------------------- |
| idx_users_email         | email             | UNIQUE                          |
| idx_users_email_hash    | email_hash        | UNIQUE (existente, se mantiene) |
| idx_users_tenant_role   | tenant_id, role   | COMPOSITE                       |
| idx_users_tenant_status | tenant_id, status | COMPOSITE                       |
| idx_users_first_name    | first_name        | BTREE (para ILIKE)              |
| idx_users_last_name     | last_name         | BTREE (para ILIKE)              |

---

## 7. Contratos API

### GET /api/v1/users

- **Guards:** JwtAuthGuard, RolesGuard
- **Roles:** ADMIN, SYSTEM_ADMIN
- **Query:** cursor? (uuid), limit? (1-100), status? (enum), role? (enum), search? (string)
- **Response 200:** `{ data: { data: UserResponseDto[], meta: { nextCursor: string | null, total: number } } }`

### POST /api/v1/users

- **Guards:** JwtAuthGuard, RolesGuard
- **Roles:** ADMIN, SYSTEM_ADMIN
- **Headers:** Idempotency-Key (obligatorio)
- **Body:** CreateUserDto
- **Response 201:** `{ data: UserResponseDto & { temporaryPassword?: string } }`
- **Response 409:** email duplicado

### GET /api/v1/users/me (v1.1)

- **Guards:** JwtAuthGuard
- **Roles:** cualquier autenticado
- **Response 200:** `{ data: UserResponseDto }`

### PATCH /api/v1/users/me (v1.1)

- **Guards:** JwtAuthGuard
- **Headers:** Idempotency-Key (obligatorio)
- **Body:** UpdateProfileDto (solo campos de perfil; sin role ni status)
- **Response 200:** `{ data: UserResponseDto }`

### GET /api/v1/users/:id

- **Guards:** JwtAuthGuard
- **Roles:** ADMIN/SYSTEM_ADMIN o actor.sub === id
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

### PATCH /api/v1/users/:id/password (v1.1)

- **Guards:** JwtAuthGuard, RolesGuard
- **Roles:** ADMIN, SYSTEM_ADMIN
- **Headers:** Idempotency-Key (obligatorio)
- **Body:** ResetPasswordDto (password? opcional)
- **Response 200:** `{ data: { temporaryPassword: string } }`
- **Response 403:** ADMIN reseteando a SYSTEM_ADMIN

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
Nota: status y role solo pueden ser modificados por ADMIN/SYSTEM_ADMIN.

### UpdateProfileDto (v1.1 — self-service)

Campos opcionales: firstName, lastName, phone, jobTitle, documentType, documentNumber, avatarUrl.
Nota: no incluye status, role ni mfaRequired. Solo para /users/me.

### ResetPasswordDto (v1.1)

| Campo    | Tipo   | Validaciones                    | Requerido |
| -------- | ------ | ------------------------------- | --------- |
| password | string | @MinLength(10), @MaxLength(128) | No        |

### ChangeUserLoginEmailDto

| Campo                   | Tipo    | Validaciones                    | Requerido         |
| ----------------------- | ------- | ------------------------------- | ----------------- |
| email                   | string  | @IsEmail(), @MaxLength(255)     | Si                |
| currentPassword         | string  | @MinLength(10), @MaxLength(128) | Si                |
| syncCompanyContactEmail | boolean | @IsBoolean()                    | No (default true) |

### UserResponseDto (campos expuestos)

id, email, role, status, tenantId, mfaEnabled, mfaRequired, emailVerified, passwordResetRequired, lastLoginAt, createdAt, updatedAt, deletedAt, firstName, lastName, phone, jobTitle, documentType, avatarUrl.

**Excluidos:** passwordHash, mfaSecret, documentNumber, tokens, failedLoginAttempts, lockedUntil.

---

## 9. Seguridad y cumplimiento

### Manejo de datos

- Datos de perfil almacenados en texto plano en fase de desarrollo.
- DT-01: cifrado at-rest AES-256-GCM se activara antes de produccion con datos reales.
- mfaSecret siempre cifrado (AES-256-GCM) — protege integridad de MFA.
- documentNumber excluido de API responses (minimizacion de datos).
- Audit log con retencion minima 7 anos.
- Soft delete preserva registros para trazabilidad.

### RBAC

- Solo ADMIN/SYSTEM_ADMIN gestionan usuarios.
- RF-RBAC-04: ADMIN no puede eliminar otro ADMIN; SYSTEM_ADMIN si.
- Roles se definen con enum, nunca con strings literales.

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

| CA    | Descripcion                                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------- |
| CA-01 | ADMIN puede listar usuarios con filtros status, role y busqueda por texto                                   |
| CA-02 | ADMIN puede crear usuario con o sin password; recibe password temporal en respuesta                         |
| CA-03 | documentNumber nunca aparece en respuestas API                                                              |
| CA-04 | ADMIN no puede eliminar otro ADMIN (RF-RBAC-04); SYSTEM_ADMIN si                                            |
| CA-05 | No puede auto-eliminarse                                                                                    |
| CA-06 | Soft delete funcional; re-creacion con email eliminado restaura y reinicializa                              |
| CA-07 | Cambio de email de acceso requiere password actual y sincroniza contactEmail si es admin principal          |
| CA-08 | Auditoria CUD completa con oldValue/newValue                                                                |
| CA-09 | Portal: tabla con filtros, busqueda, modales create/edit/delete, password temporal copiable, reset password |
| CA-10 | >= 80% cobertura de tests en servicio y controller                                                          |
| CA-11 | Admin puede reiniciar password de usuario; usuario es forzado a cambiar en proximo login                    |
| CA-12 | Usuario no-admin puede ver y editar su perfil via /users/me                                                 |
| CA-13 | Busqueda ILIKE funciona en email, firstName, lastName, jobTitle                                             |
| CA-14 | api-client del portal alineado 1:1 con endpoints del controller                                             |
| CA-15 | mfaSecret permanece cifrado con AES-256-GCM                                                                 |

---

## 12. Migraciones requeridas

### 005_simplify_user_fields (v1.1)

Migra la entidad User para descifrar datos y simplificar columnas. **No elimina emailHash** — es dependencia transversal.

- Descifrar datos existentes de email, firstName, lastName, documentNumber (si contienen formato cifrado `xx:xx:xx`).
- Re-computar emailHash como SHA-256(email_descifrado.toLowerCase().trim()) para cada registro.
- Cambiar email a VARCHAR(255); agregar constraint UNIQUE en email (ademas del existente en emailHash).
- Cambiar firstName a VARCHAR(100), lastName a VARCHAR(100), documentNumber a VARCHAR(30).
- Agregar indices: idx_users_email (UNIQUE), idx_users_first_name, idx_users_last_name.
- Idempotente: usar `IF EXISTS` / `IF NOT EXISTS`.
- Reversible: down() debe eliminar constraint UNIQUE en email, restaurar VARCHAR(512) en columnas reducidas, eliminar indices nuevos.

### Migraciones previas (referencia)

- 003_add_user_profile_fields: agrega columnas de perfil (ya aplicada).
- 004_add_mfa_required_to_users: agrega mfaRequired (ya aplicada).

---

## 13. Desalineaciones a corregir (v1.1)

| #   | Problema                                                                                         | Solucion                                                             |
| --- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| D1  | api-client `changeEmail()` usa path `/email`; backend usa `/login-email`                         | Corregir path en api-client a `/login-email`                         |
| D2  | api-client `changeEmail()` envia solo `{ email }`; backend requiere `{ email, currentPassword }` | Agregar currentPassword al payload del api-client                    |
| D3  | api-client `resetPassword()` llama endpoint que no existia                                       | Implementar PATCH /users/:id/password en backend (RF-USR-08)         |
| D4  | Portal no tiene self-service profile para usuarios no-admin                                      | Implementar /users/me en backend + ruta /dashboard/profile en portal |

---

## 14. Riesgos y mitigaciones

| Riesgo                                     | Impacto                                   | Mitigacion                                                                                       |
| ------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Password temporal expuesto en red          | Credencial comprometida                   | TLS obligatorio; flag passwordResetRequired fuerza cambio                                        |
| Datos de perfil en texto plano ante breach | PII expuesta                              | DT-01: cifrado se activa antes de produccion real; aislamiento por schema reduce superficie      |
| Desalineacion api-client vs controller     | 404/500 silent                            | v1.1 corrige todas las desalineaciones documentadas                                              |
| Legacy data cifrada tras migracion         | Error de lectura                          | decodeProfileValue() tolera ambos formatos durante transicion                                    |
| emailHash desincronizado tras descifrado   | Login falla con email hasheado incorrecto | Migracion 005 re-computa emailHash desde email descifrado; validacion post-migracion obligatoria |

---

## 15. Decision de salida

**Pendiente** — La v1.1 requiere implementacion de las 3 fases definidas en los prompts de ejecucion antes de declarar GO.

---

_Documento actualizado por AI-EM-ARCH como parte de la revision integral MOD04 v1.1._
