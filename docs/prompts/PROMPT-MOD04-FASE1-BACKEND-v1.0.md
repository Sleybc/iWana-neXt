# PROMPT — MOD04 Fase 1: Backend — Refactor y Endpoints Nuevos

**Version:** 1.0  
**Estado:** Ejecutado  
**Fecha:** 2026-03-24  
**Generado por:** AI-EM-ARCH (Engineering Manager + Lead Architect)  
**Plantilla base:** docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md

**Resultado:** fase ejecutada y validada; ver `docs/informes/INFORME-MOD04-REFACTOR-v1.0.md`.

## Modulo

- Nombre: Usuarios Internos
- Codigo: MOD04
- Fase: FASE-01-BACKEND
- Version: 1.0
- Nombre de archivo destino: `PROMPT-MOD04-FASE1-BACKEND-v1.0.md`

---

## 1. Objetivo exacto de la fase

**Resultado esperado:**  
Backend del modulo UsersModule completamente alineado con PRD-MOD04 v1.1: cifrado eliminado de todos los campos excepto mfaSecret, endpoints nuevos implementados (reset password, self-service profile, busqueda), migracion de datos creada, OpenAPI actualizada.

**Lo que si entra:**
- Eliminar cifrado AES-256-GCM de email, firstName, lastName, documentNumber en el servicio.
- Mantener cifrado AES-256-GCM solo para mfaSecret.
- Eliminar columna emailHash y funciones hashEmail(), encryptValue(), decryptValue(), decodeProfileValue(), looksLikeEncryptedValue().
- Simplificar toDto() eliminando logica de descifrado (excepto mfaSecret).
- Crear migration 005_simplify_user_fields: descifrar datos existentes, eliminar emailHash, cambiar tipos de columna, crear indice UNIQUE en email, agregar indices para busqueda.
- Implementar endpoint PATCH /api/v1/users/:id/password (RF-USR-08: reset password por admin).
- Implementar endpoints GET /api/v1/users/me y PATCH /api/v1/users/me (RF-USR-10: self-service profile).
- Agregar query param `search` a GET /api/v1/users (RF-USR-09: busqueda ILIKE).
- Crear DTOs: ResetPasswordDto, UpdateProfileDto.
- Actualizar entity User: email VARCHAR(255) UNIQUE (mantener emailHash como campo derivado), firstName VARCHAR(100), lastName VARCHAR(100), documentNumber VARCHAR(30).
- Actualizar Swagger/OpenAPI decorators en todos los endpoints nuevos.
- Mantener soporte legacy: decodeProfileValue() para datos cifrados preexistentes durante transicion.

**Lo que no entra:**
- Cambios en frontend/portal — eso es Fase 3.
- Nuevos tests (mas alla del smoke basico) — eso es Fase 2.
- Cambios en AuthModule, TenantModule o AuditModule.
- Cambio de contratos de DTOs compartidos en @iwana/shared (mas alla de agregar enums si faltan).

---

## 2. Artefactos de entrada obligatorios

- **PRD del modulo:** `docs/prds/PRD-MOD04-USUARIOS-INTERNOS-v1.1.md` — Secciones 4, 6, 7, 8, 12, 13
- **HLD del modulo:** `docs/hlds/HLD-MOD04-USUARIOS-INTERNOS-v1.0.md`
- **ADRs aplicables:** ADR-019 (JWT RS256), ADR-020 (Seed Credenciales), ADR-022 (Ejecucion Modular)
- **Sprint plan aplicable:** N/A — ejecucion individual por fases
- **Prompt arquitectonico origen:** Este documento
- **Artefactos faltantes detectados:** Ninguno

---

## 3. Instrucciones para Sr. Dev Fullstack

### Paso 1 — Migración de base de datos (prioridad maxima)

Crear archivo `packages/database/src/migrations/tenant/005_simplify_user_fields.ts`:

```
up(queryRunner):
1. Para cada registro con email en formato cifrado ({iv}:{tag}:{cipher}):
   - Descifrar usando MFA_ENCRYPTION_KEY (AES-256-GCM)
   - Actualizar email a texto plano
   - Re-computar emailHash = SHA-256(email_descifrado.toLowerCase().trim())
   - Repetir descifrado para firstName, lastName, documentNumber
2. ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(255)
3. ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email) (si no existe)
4. ALTER TABLE users ALTER COLUMN first_name TYPE VARCHAR(100)
5. ALTER TABLE users ALTER COLUMN last_name TYPE VARCHAR(100)
6. ALTER TABLE users ALTER COLUMN document_number TYPE VARCHAR(30)
7. CREATE INDEX IF NOT EXISTS idx_users_first_name ON users (first_name)
8. CREATE INDEX IF NOT EXISTS idx_users_last_name ON users (last_name)
-- NO eliminar email_hash ni idx_users_email_hash: son dependencia transversal de AuthModule, TenantSeedService, JWT payload

down(queryRunner):
1. DROP CONSTRAINT IF EXISTS uq_users_email
2. ALTER COLUMN email TYPE VARCHAR(512)
3. DROP INDEX IF EXISTS idx_users_first_name
4. DROP INDEX IF EXISTS idx_users_last_name
5. ALTER COLUMN first_name TYPE VARCHAR(512)
6. ALTER COLUMN last_name TYPE VARCHAR(512)
7. ALTER COLUMN document_number TYPE VARCHAR(512)
```

**Nota critica:** La migracion DEBE ser idempotente. Verificar existencia de columnas/indices antes de operar. Usar `IF EXISTS` / `IF NOT EXISTS`.

### Paso 2 — Actualizar entidad User

Archivo: `packages/database/src/entities/user.entity.ts`

Cambios:
- `email`: cambiar `length: 512` → `length: 255`, agregar `unique: true`
- **Mantener** propiedad `emailHash` y su decorador `@Column` — es dependencia transversal de AuthModule (login, JWT payload), PlatformBootstrapService y TenantSeedService. El indice `idx_users_email_hash` tambien se mantiene.
- `firstName`: cambiar `length: 512` → `length: 100`
- `lastName`: cambiar `length: 512` → `length: 100`
- `documentNumber`: cambiar `length: 512` → `length: 30`
- Agregar indices individuales para firstName y lastName si no existen

### Paso 3 — Refactorizar UsersService

Archivo: `apps/api/src/modules/users/users.service.ts`

**Eliminar funciones:**
- `encryptValue()` — solo mfaSecret necesita cifrado, y ese flujo esta en AuthModule
- `decryptValue()` — idem
- `looksLikeEncryptedValue()` — idem

**Mantener:**
- `hashEmail()` — sigue siendo necesaria para computar emailHash al crear/actualizar usuarios. AuthModule, TenantSeedService y JWT payload dependen de esta columna.
- `decodeProfileValue()` — renombrar a `decodeLegacyValue()`. Solo se usa para leer mfaSecret y como fallback durante transicion de datos cifrados preexistentes. Agregar comentario: `// TODO: eliminar tras confirmar que no quedan datos cifrados legacy`.

**Simplificar `create()`:**
- Eliminar llamadas a `encryptValue()` para email, firstName, lastName, documentNumber
- **Mantener** calculo de emailHash via `hashEmail()` — sigue siendo campo obligatorio de la entidad
- Email se almacena en texto plano con constraint UNIQUE
- Buscar duplicados via `email` directo en WHERE (no por hash)

**Simplificar `update()`:**
- Eliminar cifrado de campos actualizados

**Simplificar `changeLoginEmail()`:**
- Eliminar cifrado del nuevo email
- **Mantener** re-computo de emailHash via `hashEmail()` al cambiar email
- Buscar duplicados por `email` directo

**Simplificar `toDto()`:**
- Eliminar llamadas a `decodeProfileValue()` para email, firstName, lastName
- Retornar campos directamente del entity
- Mantener exclusion de documentNumber del response

**Simplificar `findAll()`:**
- Agregar parametro `search?: string`
- Si `search` esta presente, agregar condiciones ILIKE:
  ```typescript
  if (search) {
    const pattern = `%${search}%`;
    qb.andWhere(
      '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.jobTitle ILIKE :search)',
      { search: pattern }
    );
  }
  ```
- Mantener filtros existentes (status, role, cursor, limit)

**Agregar `resetPassword()`:**
```typescript
async resetPassword(
  id: string,
  actorId: string,
  actorRole: UserRole,
  ipAddress: string,
  password?: string,
): Promise<{ temporaryPassword: string }> {
  // 1. Verificar que el usuario existe
  // 2. RF-RBAC: ADMIN no puede resetear a SYSTEM_ADMIN
  // 3. Generar password temporal si no se provee
  // 4. Hash con bcrypt 12 rounds
  // 5. Actualizar passwordHash + passwordResetRequired=true
  // 6. Audit log con entityType 'UserPasswordReset'
  // 7. Retornar { temporaryPassword }
}
```

**Agregar `findMe()` y `updateMe()`:**
```typescript
async findMe(actorId: string): Promise<UserResponseDto> {
  // Buscar por ID del actor, retornar toDto()
}

async updateMe(
  actorId: string,
  dto: UpdateProfileDto,
  ipAddress: string,
): Promise<UserResponseDto> {
  // Solo campos de perfil: firstName, lastName, phone, jobTitle, documentType, documentNumber, avatarUrl
  // NO permite role ni status
  // Audit log con entityType 'UserProfile'
}
```

### Paso 4 — Crear DTOs nuevos

Archivo: `apps/api/src/modules/users/dto/user.dto.ts`

**Agregar ResetPasswordDto:**
```typescript
export class ResetPasswordDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @ApiPropertyOptional({ description: 'Password nuevo. Si no se provee, se genera uno temporal.' })
  password?: string;
}
```

**Agregar UpdateProfileDto:**
```typescript
export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(100)
  firstName?: string;

  @IsOptional() @IsString() @MaxLength(100)
  lastName?: string;

  @IsOptional() @IsString() @Matches(/^\+\d{7,15}$/)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(150)
  jobTitle?: string;

  @IsOptional() @IsEnum(DocumentType)
  documentType?: DocumentType;

  @IsOptional() @IsString() @MaxLength(30)
  documentNumber?: string;

  @IsOptional() @IsUrl() @MaxLength(500)
  avatarUrl?: string;
}
```

### Paso 5 — Actualizar UsersController

Archivo: `apps/api/src/modules/users/users.controller.ts`

**Agregar query param `search`** al endpoint GET /:
```typescript
@ApiQuery({ name: 'search', required: false, type: String, description: 'Busqueda ILIKE en email, firstName, lastName, jobTitle' })
async findAll(
  ...,
  @Query('search') search?: string,
): Promise<...> {
  return this.usersService.findAll(cursor, limit, status, role, search);
}
```

**Agregar endpoints /me ANTES de /:id** (orden critico para evitar conflicto con ParseUUIDPipe):
```typescript
@Get('me')
@UseGuards(JwtAuthGuard)
@ApiOperation({ summary: 'Obtener perfil propio' })
async getMe(@CurrentUser() actor: JwtPayload) {
  return { data: await this.usersService.findMe(actor.sub) };
}

@Patch('me')
@UseGuards(JwtAuthGuard)
@ApiOperation({ summary: 'Actualizar perfil propio' })
async updateMe(
  @CurrentUser() actor: JwtPayload,
  @Body() dto: UpdateProfileDto,
  @Headers('idempotency-key') idempotencyKey: string,
  @Headers('x-forwarded-for') ipAddress?: string,
) {
  if (!idempotencyKey) throw new BadRequestException('Idempotency-Key header required');
  return { data: await this.usersService.updateMe(actor.sub, dto, ipAddress || 'unknown') };
}
```

**Agregar endpoint reset password:**
```typescript
@Patch(':id/password')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SYSTEM_ADMIN)
@ApiOperation({ summary: 'Reiniciar password de usuario' })
async resetPassword(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser() actor: JwtPayload,
  @Body() dto: ResetPasswordDto,
  @Headers('idempotency-key') idempotencyKey: string,
  @Headers('x-forwarded-for') ipAddress?: string,
) {
  if (!idempotencyKey) throw new BadRequestException('Idempotency-Key header required');
  return { data: await this.usersService.resetPassword(id, actor.sub, actor.role, ipAddress || 'unknown', dto?.password) };
}
```

**Nota critica de ordenamiento:** En NestJS, las rutas se evaluan en orden de declaracion. La ruta `@Get('me')` DEBE ir ANTES de `@Get(':id')` para que NestJS no intente parsear "me" como UUID y lance 400.  
Orden correcto del controller:
1. GET / (findAll)
2. POST / (create)
3. GET /me (getMe)
4. PATCH /me (updateMe)
5. GET /:id (findOne)
6. PATCH /:id (update)
7. PATCH /:id/login-email (changeLoginEmail)
8. PATCH /:id/password (resetPassword)
9. DELETE /:id (remove)

### Paso 6 — Actualizar OpenAPI

Verificar que todos los endpoints nuevos tengan:
- `@ApiOperation({ summary })` con descripcion clara en espanol
- `@ApiResponse()` para codigos 200, 201, 400, 403, 404, 409 segun aplique
- `@ApiBearerAuth()` en los que requieran JWT
- `@ApiHeader({ name: 'idempotency-key' })` donde sea obligatorio
- `@ApiQuery()` para el nuevo parametro `search`

---

## 4. Restricciones no negociables

1. No romper boundaries del modulith — UsersModule no accede a tablas de otro modulo directamente.
2. No usar credenciales, PII real ni connection strings en codigo, tests ni logs.
3. No usar `synchronize: true` en TypeORM.
4. La migracion 005 debe ser reversible y testeable.
5. Mantener compatibilidad con datos cifrados preexistentes via `decodeLegacyValue()` durante transicion.
6. **No eliminar emailHash ni hashEmail()** — es dependencia transversal de AuthModule (login, JWT), PlatformBootstrapService y TenantSeedService. Se mantiene como campo derivado auto-computado.
7. Roles siempre con `UserRole.*` enum, nunca strings.
7. Idempotency-Key obligatorio en POST y PATCH.
8. Comentarios en espanol para logica no trivial.
9. mfaSecret permanece cifrado con AES-256-GCM — nunca en texto plano.
10. `search` debe usar parametros bindados (`$1`, no concatenacion) para prevenir SQL injection.

---

## 5. Entregables tecnicos obligatorios

| # | Archivo | Accion |
| --- | --- | --- |
| 1 | `packages/database/src/migrations/tenant/005_simplify_user_fields.ts` | Crear |
| 2 | `packages/database/src/entities/user.entity.ts` | Modificar (tipos columna, mantener emailHash como derivado) |
| 3 | `apps/api/src/modules/users/users.service.ts` | Refactorizar (eliminar cifrado, agregar resetPassword, findMe, updateMe, search) |
| 4 | `apps/api/src/modules/users/dto/user.dto.ts` | Agregar ResetPasswordDto, UpdateProfileDto |
| 5 | `apps/api/src/modules/users/users.controller.ts` | Agregar /me, /:id/password, search param, reordenar rutas |
| 6 | `apps/api/src/modules/users/users.module.ts` | Verificar imports/exports si hay nuevas dependencias |

---

## 6. Entregables documentales obligatorios

- Actualizar informe vigente `docs/informes/INFORME-MOD04-REFACTOR-v1.0.md` (crear si no existe, actualizar si ya existe). Incluir: lista de archivos modificados, decisiones tomadas, riesgos encontrados.
- No crear informe nuevo si ya existe uno para esta fase.

---

## 7. Criterios de aceptacion

| CA | Descripcion | Como verificar |
| --- | --- | --- |
| CA-01 | Migracion 005 aplica y revierte sin errores | `pnpm --filter @iwana/db migration:run` y `migration:revert` |
| CA-02 | Email almacenado en texto plano con UNIQUE constraint | Insertar dos registros con mismo email → 409 |
| CA-03 | Columna emailHash mantenida y sincronizada | Crear usuario → verificar que emailHash === SHA-256(email.toLowerCase().trim()) en BD |
| CA-04 | Busqueda ILIKE funciona en GET /api/v1/users?search=xxx | Probar con fragmento de nombre, email, cargo |
| CA-05 | PATCH /users/:id/password genera temp password | Llamar sin body.password → recibir `{ temporaryPassword }` |
| CA-06 | PATCH /users/:id/password activa passwordResetRequired | Verificar flag en BD tras reset |
| CA-07 | GET /users/me retorna perfil del actor sin guardia de rol | Autenticar como NOC y llamar →  200 |
| CA-08 | PATCH /users/me no permite cambiar role ni status | Enviar `{ role: 'ADMIN' }` → campo ignorado |
| CA-09 | mfaSecret permanece cifrado en BD | Verificar formato `{iv}:{tag}:{cipher}` tras escribir |
| CA-10 | OpenAPI refleja todos los endpoints nuevos | Abrir /api/docs y verificar |
| CA-11 | `decodeLegacyValue()` tolera datos cifrados preexistentes | Test con valor en formato antiguo |
| CA-12 | `pnpm lint` y `pnpm typecheck` pasan sin errores | Ejecutar ambos comandos |

---

## 8. Criterio de stop/go

- **Detenerse inmediatamente si:**
  - La migracion 005 causa perdida de datos al descifrar.
  - MFA_ENCRYPTION_KEY no esta disponible en el entorno para descifrar datos legacy.
  - Se descubre otro modulo que dependa de email cifrado (no de emailHash) para operar.
- **Documentar causa en:** `docs/informes/INFORME-MOD04-REFACTOR-v1.0.md` con etiqueta `[BLOQUEADO]`.
- **Escalar a:** CTO — `[ESCALACION AL CTO]` si se afecta boundary o seguridad.
- **Recomendacion esperada:** Proponer alternativa documentada antes de escalar.

---

## 9. Criterio de salida de la fase

- [ ] Backend compilando sin errores: `pnpm --filter @iwana/api build`
- [ ] Migracion 005 aplicada y reversible
- [ ] Entity User actualizada con tipos correctos (emailHash mantenido como derivado)
- [ ] Servicio refactorizado sin funciones de cifrado innecesarias (hashEmail mantenido)
- [ ] 3 endpoints nuevos funcionales: GET /me, PATCH /me, PATCH /:id/password
- [ ] Busqueda ILIKE operativa en findAll
- [ ] OpenAPI actualizada con todos los endpoints
- [ ] Lint y typecheck limpios
- [ ] Informe de fase archivado

---

*Prompt generado por AI-EM-ARCH. Vinculado a PRD-MOD04 v1.1.*
