# SPEC — Bulk Import CSV de Usuarios Internos

**Versión:** 1.0
**Fecha:** 2026-06-13
**Autor:** AI-EM-ARCH (Modo Architect)
**Estado:** Pendiente aprobación
**Módulo:** Portal → Users (gestión de accesos)

---

## 1. Contexto y Motivación

El operador de plataforma necesita crear múltiples usuarios internos de forma eficiente. El método actual (formulario individual por usuario) es lento cuando se requiere onboarding de 5-20 colaboradores nuevos.

Este feature permite cargar un archivo CSV con datos de usuarios, previsualizar la información antes de confirmar, y procesar el batch con reportes de éxito y error parcial.

**Decisiones de diseño tomadas:**
- Formato CSV (no XLSX) — menor dependencia, más simple de generar desde cualquier herramienta
- Columnas: email, role, firstName, lastName, phone, jobTitle, documentType, documentNumber (role obligatorio, resto opcional)
- MFA por defecto: false
- Perfiles de acceso: fase posterior (por ahora solo rol base)
- Manejo de errores: "El operador elige" → preview + confirmación antes de procesar, reporte parcial de fallidos
- Procesamiento síncrono (BullMQ solo si el volumen lo justifica en fase posterior)

---

## 2. Alcance

### En scope
- Modal de bulk import accesible desde la página `/dashboard/users`
- Parsing CSV client-side con librería ligera (`csv-parse` o `papaparse`)
- Preview en tabla editable antes de confirmar
- Endpoint `POST /users/bulk` que acepta array de `CreateUserDto[]`
- Validación por item con reporte de errores específicos
- Creación de usuarios con password temporal generado por el sistema
- Respuesta con resumen: creados exitosamente + lista de fallidos con causa

### Fuera de scope (fase 1)
- Importación de perfiles de acceso por CSV
- Columna `mfaRequired` en CSV
- Cola asíncrona (BullMQ)
- Importación XLSX
- Validación de duplicados contra usuarios existentes en la misma batch (se procesan todos, los duplicados reales fallan con error de DB)
- Reintento automático de items fallidos

---

## 3. Personas y Casos de Uso

| Persona | Rol | Caso de uso |
|---------|-----|-------------|
| Administrador de plataforma | Gestiona accesos internos | Onboarding rápido de nuevos colaboradores al sistema |
| Administrador de TI | Configura usuarios y permisos | Carga masiva de usuarios desde hoja de cálculo del departamento de RRHH |

**Caso de uso primario:**
1. El administrador descarga la plantilla CSV desde el portal
2. Prepara el archivo con emails, roles y datos personales
3. Sube el CSV en el modal de bulk import
4. El sistema muestra preview de registros válidos e inválidos
5. El administrador revisa, corrige si es necesario, y confirma
6. El sistema importa los usuarios válidos y reporta los fallidos

---

## 4. Requerimientos Funcionales

### RF-BI-01 — Descarga de plantilla CSV
El portal debe proporcionar un enlace o botón para descargar una plantilla CSV con las columnas esperadas y una fila de ejemplo.

### RF-BI-02 — Upload de archivo CSV
- El modal tiene un dropzone para arrastrar el archivo o un botón para seleccionar
- Acepta solo archivos `.csv` (MIME: `text/csv`, `application/csv`)
- Validación de tamaño máximo: 1MB (aprox. 500 usuarios max por archivo)
- Validación de estructura: al menos columnas `email` y `role` presentes

### RF-BI-03 — Preview y validación client-side
- Parsing del CSV con librería `csv-parse` o `papaparse`
- Validación de cada fila:
  - `email`: formato email válido, max 255 caracteres
  - `role`: valor枚举 de `UserRole` (valores válidos: ADMIN, OPERATOR, SUPPORT, SALES, TECHNICIAN, ACCOUNTING, HR, SUBSCRIBER, CONTRACTOR, ALLY, AUDITOR, INVESTOR)
  - `firstName`, `lastName`: texto, max 100 caracteres (opcional)
  - `phone`: formato E.164 opcional (`+\d{7,15}`) (opcional)
  - `jobTitle`: texto, max 150 caracteres (opcional)
  - `documentType`: enum `DocumentType` (CC, CE, PASAPORTE, PEP, PTP, NIT_PERSONA) (opcional)
  - `documentNumber`: texto, max 30 caracteres (opcional)
- Mostrar en tabla: fila number, email, role, nombre, teléfono, estado (válido/error), mensaje de error si aplica

### RF-BI-04 — Confirmación y procesamiento
- Botón "Importar usuarios" habilitado solo si hay al menos 1 registro válido
- Llamada a `POST /users/bulk` con array de DTOs
- Processing síncrono — timeout 60 segundos
- Barra de progreso visual durante el procesamiento

### RF-BI-05 — Reporte de resultados
- Modal muestra resultado después de procesar:
  - Cantidad de usuarios creados exitosamente
  - Lista de fallidos con fila, email, causa del error
- Cada usuario creado muestra password temporal generado (solo se puede ver en este momento — después no es recoverable)
- Opción de descargar reporte de errores en CSV

### RF-BI-06 — Cancelación
- Botón "Cancelar" en cualquier momento cierra el modal sin efectos
- Si ya se inició el procesamiento, el botón cambia a "Cancelando..." y se deshabilita

---

## 5. Requerimientos No Funcionales

### RNF-BI-01 — Performance
- Parsing CSV client-side: < 2s para archivo de 1MB
- Endpoint bulk: < 1s por cada 10 usuarios procesados
- Límite de batch: 100 usuarios por request (si el CSV tiene más, se chunkea automáticamente o se rechaza con mensaje de "Superaste el límite de 100 usuarios por archivo")

### RNF-BI-02 — Seguridad
- Validación de inputs con Zod schema en backend
- Sanitización de strings antes de guardar
- Logs sin PII (no guardar emails en logs de error)
- Rate limiting en endpoint bulk: 5 request por minuto por tenant

### RNF-BI-03 — Observabilidad
- Logging de: inicio de batch, cantidad de items, cantidad de éxitos, cantidad de errores
- Cada error de item debe incluir: fila del CSV, causa (sin exponer PII)

### RNF-BI-04 — Accesibilidad
- Dropzone con label accesible
- Tabla de preview con headers proper y aria
- Estados de loading con aria-busy
- Mensajes de error enfocables

---

## 6. Modelo de Datos

### Endpoint Contract

**Request:**
```
POST /users/bulk
Content-Type: application/json
Idempotency-Key: <uuid> (opcional, reutilizable del header de users individual)
```

```typescript
// Body
interface BulkCreateUsersRequest {
  users: CreateUserDto[]; // Array de DTOs, max 100 items
}
```

**Response (éxito parcial):**
```typescript
interface BulkCreateUsersResponse {
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
  succeeded: Array<{
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: UserRole;
    temporaryPassword: string; // Solo en respuesta, no se guarda en BD
    createdAt: string;
  }>;
  failed: Array<{
    rowIndex: number; // 1-based, fila en el CSV original
    email: string;
    reason: string; // Causa del error, sin PII
  }>;
}
```

### DTO de validación (Zod)

```typescript
// En apps/api/src/modules/users/dto/bulk-create-users.dto.ts

export const BulkCreateUserItemSchema = z.object({
  email: z.string().email().max(255),
  role: z.nativeEnum(UserRole),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  phone: z.string().regex(/^\+\d{7,15}$/).optional(),
  jobTitle: z.string().max(150).optional(),
  documentType: z.nativeEnum(DocumentType).optional(),
  documentNumber: z.string().max(30).optional(),
});

export const BulkCreateUsersRequestSchema = z.object({
  users: z.array(BulkCreateUserItemSchema).min(1).max(100),
});

export type BulkCreateUsersRequest = z.infer<typeof BulkCreateUsersRequestSchema>;
```

---

## 7. Contratos de API

### Nuevo endpoint

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/users/bulk` | Creación batch de usuarios |

**Tags OpenAPI:** `users`, `bulk`

**Responses:**
- `201 Created` — BulkCreateUsersResponse (siempre devuelve body con summary)
- `400 Bad Request` — Zod validation error (schema inválido)
- `413 Payload Too Large` — Más de 100 items
- `429 Too Many Requests` — Rate limit excedido

### Dependencias de otros módulos

- `UsersService.create()` — ya existe, reutilizable
- `TenantContext` — para resolución de tenant
- `IdempotencyKeyMiddleware` — ya existe, reutilizable

---

## 8. Criterios de Aceptación

### CA-BI-01 — Plantilla descargable
- [ ] Given el operador está en `/dashboard/users`
- [ ] When hace clic en "Importar desde CSV"
- [ ] Then ve un botón "Descargar plantilla" que descarga `plantilla_usuarios.csv` con columnas: email, role, firstName, lastName, phone, jobTitle, documentType, documentNumber y 1 fila de ejemplo

### CA-BI-02 — Upload y parsing
- [ ] Given el operador arrastra un archivo `.csv` al dropzone
- [ ] When el archivo tiene columnas email y role
- [ ] Then el sistema parsea y muestra preview en tabla con todos los registros

### CA-BI-03 — Validación client-side
- [ ] Given el CSV tiene filas con email inválido, role inexistente, o teléfono malformado
- [ ] Then la tabla de preview marca esas filas como error y muestra el mensaje específico
- [ ] And el botón "Importar usuarios" sigue deshabilitado si no hay al menos 1 fila válida

### CA-BI-04 — Procesamiento batch
- [ ] Given la tabla de preview muestra 10 registros válidos y 2 inválidos
- [ ] When el operador hace clic en "Importar usuarios"
- [ ] Then el sistema hace `POST /users/bulk` con los 10 registros válidos
- [ ] And muestra barra de progreso
- [ ] And al terminar muestra: "9 creados, 1 fallido" con lista de errores

### CA-BI-05 — Manejo de errores parciales
- [ ] Given el batch tiene 10 registros
- [ ] And 8 se crean exitosamente, 2 fallan (email duplicado, role inválido en DB)
- [ ] When el procesamiento termina
- [ ] Then el sistema muestra los 8 usuarios creados CON sus passwords temporales
- [ ] And muestra los 2 fallidos con causa (sin exponer datos personales del conflictante)
- [ ] And ofrece descargar CSV de errores

### CA-BI-06 — Límite de batch
- [ ] Given el operador sube un CSV con 150 registros
- [ ] When el sistema detecta más de 100 items
- [ ] Then rechaza el archivo con mensaje "El archivo supera el límite de 100 usuarios por importación. Divide el archivo en batches más pequeños."

---

## 9. Dependencias y Riesgos

### Dependencias
| Dependencia | Tipo | Estado |
|-------------|------|--------|
| `csv-parse` o `papaparse` | Librería client-side |需 agregar a `packages/ui` o `apps/portal` |
| `UsersService.create()` | Servicio existente | Listo para reutilizar |
| `ZodValidationPipe` | Pipe existente | Listo para reutilizar |
| `IdempotencyKeyMiddleware` | Middleware existente | Listo para reutilizar |

### Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Email duplicado en DB | Media | Bajo | El error se reporta en el response, no bloquea la batch |
| CSV con encoding incorrecto (UTF-8 vs Latin-1) | Media | Medio | Validar encoding y mostrar error si no es UTF-8 |
| Timeout en batch > 50 usuarios | Baja | Bajo | Chunking automático o límite de 100 con mensaje claro |
| Librería de parsing inflando bundle | Baja | Medio | Usar `csv-parse` (tree-shakeable) y no `papaparse` |

### Decisiones documentadas en ADR

- No requiere ADR nuevo — es extensión de funcionalidad existente dentro del módulo users
- Storage: no se necesita — el CSV se procesa en memoria, no se persiste

---

## 10. Definition of Done

### Para considerarlo "Done" el feature debe cumplir:

1. **Código:**
   - Endpoint `POST /users/bulk` implementado y testeado
   - DTOs con Zod schema para validación de request
   - Servicio `UsersService.bulkCreate()` implementdo (reutilizando `create()` por item)
   - UI del modal en `BulkImportUsersModal.tsx`
   - Preview table con validación client-side usando `csv-parse`

2. **Tests:**
   - Test unitario de `UsersService.bulkCreate()`
   - Test de validación de Zod schema
   - Test E2E del flujo completo: upload CSV → preview → confirmar → resultado

3. **Documentación:**
   - OpenAPI actualizado con nuevo endpoint
   - Template CSV disponible para descarga

4. **Calidad:**
   - Lint y typecheck pasando
   - Sin PII en logs
   - Rate limiting configurado

5. **Gates obligatorios:**
   - [ ] Sin vulnerabilidades criticas
   - [ ] Sin boundary violations
   - [ ] Tests cubriendo el flujo core
   - [ ] OpenAPI actualizado
   - [ ] Migraciones no necesarias (no hay cambio de schema)

---

## Estructura de Archivos Esperada

```
apps/api/src/modules/users/
├── dto/
│   ├── index.ts                        # Exporta todos los DTOs
│   ├── user.dto.ts                     # CreateUserDto, UpdateUserDto (existente)
│   └── bulk-create-users.dto.ts        # NUEVO: BulkCreateUsersRequestSchema, BulkCreateUsersResponse
├── users.controller.ts                 # Actualizar: agregar POST /bulk
├── users.service.ts                    # Actualizar: agregar bulkCreate()
└── users.service.spec.ts               # Actualizar: tests de bulkCreate

apps/portal/src/components/users/
├── BulkImportUsersModal.tsx            # NUEVO: Modal completo con dropzone, preview, resultado
└── BulkImportUsersModal.spec.tsx       # NUEVO: Tests del componente

apps/portal/src/lib/
└── api-client.ts                       # Actualizar: agregar bulkCreateUsers() al apiClient

packages/shared/src/
└── index.ts                            # Exportar tipos de BulkCreateUsersRequest/Response si se necesitan en portal
```