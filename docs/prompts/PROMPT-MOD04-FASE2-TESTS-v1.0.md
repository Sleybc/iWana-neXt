# PROMPT — MOD04 Fase 2: Tests — Cobertura >= 80%

**Version:** 1.0  
**Estado:** Ejecutado  
**Fecha:** 2026-03-24  
**Generado por:** AI-EM-ARCH (Engineering Manager + Lead Architect)  
**Plantilla base:** docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md  
**Prerequisito:** Fase 1 completada y validada

**Resultado:** fase ejecutada y validada; ver `docs/informes/INFORME-MOD04-REFACTOR-v1.0.md`.

## Modulo

- Nombre: Usuarios Internos
- Codigo: MOD04
- Fase: FASE-02-TESTS
- Version: 1.0
- Nombre de archivo destino: `PROMPT-MOD04-FASE2-TESTS-v1.0.md`

---

## 1. Objetivo exacto de la fase

**Resultado esperado:**  
Cobertura de tests >= 80% en UsersService y UsersController. Tests unitarios actualizados para reflejar la eliminacion de cifrado, tests HTTP del controller, tests de validacion de DTOs, y tests de integracion del modulo.

**Lo que si entra:**
- Actualizar tests unitarios existentes en `users.service.spec.ts` para reflejar eliminacion de cifrado.
- Agregar tests para las nuevas funciones: `resetPassword()`, `findMe()`, `updateMe()`, busqueda ILIKE.
- Crear `users.controller.http.spec.ts` con tests HTTP via supertest para los 9 endpoints.
- Crear `users.dto.spec.ts` con tests de validacion para todos los DTOs.
- Verificar cobertura >= 80% lineas + branches en service y controller.
- Tests para `decodeLegacyValue()` con datos cifrados y planos.

**Lo que no entra:**
- Tests E2E con Playwright — eso es Fase 3.
- Cambios en la implementacion del backend (si se descubre un bug, documentar pero no corregir en esta fase; escalar).
- Tests de otros modulos (Auth, Tenant, Audit).

---

## 2. Artefactos de entrada obligatorios

- **PRD del modulo:** `docs/prds/PRD-MOD04-USUARIOS-INTERNOS-v1.1.md` — Secciones 4, 7, 8, 11
- **HLD del modulo:** `docs/hlds/HLD-MOD04-USUARIOS-INTERNOS-v1.0.md`
- **ADRs aplicables:** ADR-019 (JWT), ADR-020 (Seed), ADR-022 (Ejecucion Modular)
- **Codigo fuente:** `apps/api/src/modules/users/` (post-Fase 1)
- **Tests existentes:** `apps/api/src/modules/users/users.service.spec.ts` (36 cases, 63% cobertura)
- **Prompt Fase 1:** `docs/prompts/PROMPT-MOD04-FASE1-BACKEND-v1.0.md`
- **Artefactos faltantes detectados:** Ninguno

---

## 3. Instrucciones para Sr. Dev Fullstack

### Paso 1 — Actualizar tests unitarios del servicio

Archivo: `apps/api/src/modules/users/users.service.spec.ts`

**Tests existentes a actualizar:**
- Remover todos los mocks de encryptValue, decryptValue — ya no existen (hashEmail se mantiene)
- Actualizar assertions de create() que verificaban email cifrado → verificar email en texto plano + emailHash computado
- Actualizar assertions de findAll() que verificaban busqueda por emailHash → verificar busqueda por email directo (ILIKE)
- Actualizar mock de repositorio para reflejar nuevo schema (emailHash se mantiene como campo derivado)

**Tests nuevos a agregar (minimo 15 casos):**

```
describe('resetPassword', () => {
  it('genera password temporal de 32 chars si no se provee password')
  it('usa bcrypt 12 rounds para hashear')
  it('activa passwordResetRequired=true')
  it('lanza ForbiddenException si ADMIN intenta resetear SYSTEM_ADMIN')
  it('lanza NotFoundException si usuario no existe')
  it('registra audit log con entityType UserPasswordReset')
})

describe('findMe', () => {
  it('retorna el perfil del actor autenticado')
  it('lanza NotFoundException si actor no existe')
  it('no incluye documentNumber en el response')
})

describe('updateMe', () => {
  it('actualiza campos de perfil sin modificar role ni status')
  it('registra audit log con entityType UserProfile')
  it('retorna UserResponseDto actualizado')
})

describe('findAll - search', () => {
  it('filtra por email con ILIKE')
  it('filtra por firstName con ILIKE')
  it('combina search con filtros de status y role')
  it('retorna vacio si no hay coincidencias')
})

describe('decodeLegacyValue', () => {
  it('retorna texto plano sin cambios')
  it('descifra valor en formato legacy {iv}:{tag}:{cipher}')
})
```

### Paso 2 — Crear tests HTTP del controller

Archivo: `apps/api/src/modules/users/users.controller.http.spec.ts`

Use `@nestjs/testing` + `supertest`. Mock del servicio con `jest.fn()`.

**Casos minimos (15-18 tests):**

```
describe('GET /api/v1/users', () => {
  it('200 con lista paginada')
  it('200 con filtro status')
  it('200 con filtro role')
  it('200 con search param')
  it('401 sin JWT')
  it('403 con rol no autorizado')
})

describe('POST /api/v1/users', () => {
  it('201 crea usuario con password temporal')
  it('400 sin Idempotency-Key')
  it('400 email invalido')
  it('409 email duplicado')
})

describe('GET /api/v1/users/me', () => {
  it('200 retorna perfil del actor')
  it('401 sin JWT')
})

describe('PATCH /api/v1/users/me', () => {
  it('200 actualiza perfil propio')
  it('400 sin Idempotency-Key')
})

describe('PATCH /api/v1/users/:id/password', () => {
  it('200 genera password temporal')
  it('403 ADMIN reseteando SYSTEM_ADMIN')
  it('400 sin Idempotency-Key')
})

describe('DELETE /api/v1/users/:id', () => {
  it('204 soft delete exitoso')
  it('400 auto-eliminacion')
  it('403 ADMIN eliminando ADMIN')
})
```

### Paso 3 — Crear tests de validacion de DTOs

Archivo: `apps/api/src/modules/users/dto/users.dto.spec.ts`

Usar `class-validator` + `plainToInstance` + `validate` de `class-transformer`.

**Casos minimos (8-10 tests):**

```
describe('CreateUserDto', () => {
  it('valida email requerido')
  it('valida role requerido como enum')
  it('acepta password opcional con >= 10 chars')
  it('rechaza password < 10 chars')
  it('acepta phone en formato E.164')
  it('rechaza phone sin formato E.164')
})

describe('ResetPasswordDto', () => {
  it('acepta body vacio (password opcional)')
  it('rechaza password < 10 chars')
})

describe('UpdateProfileDto', () => {
  it('acepta body vacio (todos opcionales)')
  it('rechaza documentNumber > 30 chars')
})
```

### Paso 4 — Verificar cobertura

Ejecutar:
```bash
pnpm --filter @iwana/api test -- --coverage --collectCoverageFrom='src/modules/users/**/*.ts'
```

**Meta:**
- `users.service.ts`: >= 80% lineas, >= 75% branches
- `users.controller.ts`: >= 80% lineas
- `dto/user.dto.ts`: >= 70% lineas (validaciones)

Si la cobertura no alcanza, identificar lineas no cubiertas y agregar tests especificos.

---

## 4. Restricciones no negociables

1. No modificar codigo de produccion en esta fase — solo tests.
2. No usar PII real en datos de test; usar datos ficticios consistentes.
3. No usar `any` en TypeScript — tipar mocks correctamente.
4. Tests deben ser deterministas — sin dependencias de orden ni estado compartido entre tests.
5. No mockear TypeORM a nivel de QueryRunner salvo que sea imprescindible — preferir mock de repositorio.
6. Comentarios en espanol en tests cuando la logica no sea trivial.
7. Si se descubre un bug durante testing, NO corregir: documentar en el informe y escalar.

---

## 5. Entregables tecnicos obligatorios

| # | Archivo | Accion |
| --- | --- | --- |
| 1 | `apps/api/src/modules/users/users.service.spec.ts` | Actualizar (~50+ casos totales) |
| 2 | `apps/api/src/modules/users/users.controller.http.spec.ts` | Crear (15-18 casos) |
| 3 | `apps/api/src/modules/users/dto/users.dto.spec.ts` | Crear (8-10 casos) |

---

## 6. Entregables documentales obligatorios

- Actualizar informe `docs/informes/INFORME-MOD04-REFACTOR-v1.0.md` con seccion de testing:
  - Resumen de cobertura (% lineas, % branches por archivo)
  - Lista de bugs encontrados (si aplica)
  - Decisiones de testing
- Captura o log de la salida de cobertura

---

## 7. Criterios de aceptacion

| CA | Descripcion | Como verificar |
| --- | --- | --- |
| CA-01 | Tests actualizados compilan sin errores | `pnpm --filter @iwana/api test` |
| CA-02 | Todos los tests pasan en verde | Exit code 0 sin failures |
| CA-03 | Cobertura >= 80% en users.service.ts | `--coverage` output |
| CA-04 | Cobertura >= 80% en users.controller.ts | `--coverage` output |
| CA-05 | Tests HTTP cubren los 9 endpoints | Verificar describe blocks |
| CA-06 | Tests de DTOs cubren validaciones criticas | Verificar CreateUserDto, ResetPasswordDto, UpdateProfileDto |
| CA-07 | Tests de resetPassword verifican RBAC | ForbiddenException para ADMIN -> SYSTEM_ADMIN |
| CA-08 | Tests de /me verifican acceso sin guard de rol | 200 con usuario NOC |
| CA-09 | Tests de search verifican ILIKE | Fragmentos de texto parciales |
| CA-10 | No hay tests flaky (ejecutar 3 veces consecutivas) | `pnpm --filter @iwana/api test` x3 |

---

## 8. Criterio de stop/go

- **Detenerse inmediatamente si:**
  - Un bug critico en el servicio impide testear (ej: error de compilacion post-Fase 1).
  - La cobertura no puede alcanzar 80% sin modificar codigo de produccion.
- **Documentar causa en:** `docs/informes/INFORME-MOD04-REFACTOR-v1.0.md` con etiqueta `[BLOQUEADO-FASE2]`.
- **Escalar a:** CTO si el bloqueo requiere revertir Fase 1.
- **Recomendacion esperada:** Documentar bugs encontrados con severity y propuesta de fix para Fase 1 bis.

---

## 9. Criterio de salida de la fase

- [ ] Todos los tests pasan: `pnpm --filter @iwana/api test` → 0 failures
- [ ] Cobertura >= 80% en service y controller
- [ ] Tests HTTP creados para los 9 endpoints
- [ ] Tests de DTOs creados para los 3 DTOs nuevos/modificados
- [ ] No hay tests flaky (3 ejecuciones consecutivas limpias)
- [ ] Informe de fase actualizado con metricas de cobertura
- [ ] Bugs encontrados documentados (si aplica)

---

*Prompt generado por AI-EM-ARCH. Vinculado a PRD-MOD04 v1.1 y PROMPT-MOD04-FASE1-BACKEND-v1.0.*
