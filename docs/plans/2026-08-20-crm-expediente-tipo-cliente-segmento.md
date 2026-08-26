# Plan: Campo "Tipo de cliente" (segmento) en oportunidades CRM

## Contexto y hallazgos (análisis)

**Cómo está diseñado hoy el alta de oportunidad** (`/dashboard/crm/expedientes`, en `apps/portal`):
- Es un formulario **inline** (no modal) dentro de un `PortalPanel` "Nueva oportunidad", en `apps/portal/src/components/crm/expedientes/ExpedientesLandingClient.tsx:463-554`.
- Es un alta mínima (PRD MOD05 §7.1 CA-01): solo **Nombre completo**, **Asesor de origen** (opcional) y **Origen** (canal de adquisición). El resto del expediente se completa después, en el detalle, por secciones.
- **No existe ningún campo de segmento/tipo de usuario** ni en el formulario, ni en el DTO, ni en la entidad `ExpedienteRecord` (~80 columnas, ninguna de segmento).

**El vocabulario ya es canónico**: el enum `CustomerSegment` existe en `packages/shared/src/enums/customer-segment.enum.ts` con exactamente los 6 valores pedidos (`RESIDENTIAL, SOHO, PYME, CORPORATE, GOVERNMENT, WHOLESALE`), respaldado por el enum PostgreSQL `customer_segment_enum` (migración tenant `012_add_subscribers.ts`) y por ADR-025. Hoy solo lo porta `subscribers.customer_segment`, y se **infiere** al convertir (Natural→RESIDENTIAL, Jurídica→PYME) en `subscriber-creation.service.ts:326-331`.

**Momento recomendado para capturarlo**: en el **alta de la oportunidad** (es dato comercial conocido desde el primer contacto y alimenta pricing, impuestos y reporting downstream), editable después en la sección **Interés comercial** del detalle.

**Decisiones confirmadas con el usuario**:
- Segmento **obligatorio** en el formulario de alta (sin default preseleccionado: el asesor elige).
- Alcance: **alta + edición en detalle (Interés comercial) + propagación al suscriptor en la conversión**.

## Cambios

### 1. Migración tenant (BD)

- Crear `packages/database/src/migrations/tenant/116_add_customer_segment_to_expediente_records.ts` (siguiente correlativo tras `115_seed_default_iva_tax_rules.ts`, convención de nombre `AddCustomerSegmentToExpedienteRecords1160000000000`):
  - `up()`: `ALTER TABLE expediente_records ADD COLUMN IF NOT EXISTS customer_segment customer_segment_enum NULL;` — el tipo enum ya existe en cada schema tenant desde la migración 012. Nullable para no romper filas existentes; la obligatoriedad se fuerza a nivel DTO en el alta.
  - `down()`: `ALTER TABLE expediente_records DROP COLUMN IF EXISTS customer_segment;`
- Registrar la migración en el array `TENANT_MIGRATIONS` de `packages/database/src/migrations/tenant/runner.ts` (en orden, tras la 115).
- Agregar spec hermano `116_....spec.ts` siguiendo la convención de las migraciones recientes.

### 2. Backend — entidad y DTO de creación

- `apps/api/src/modules/crm/expedientes/entities/expediente-record.entity.ts`: agregar columna `customerSegment` mapeada a `customer_segment` (varchar(20), nullable), replicando la declaración de `apps/api/src/modules/crm/subscribers/entities/subscriber.entity.ts:59-60`.
- `apps/api/src/modules/crm/expedientes/dto/create-expediente.dto.ts`: agregar `customerSegment: z.nativeEnum(CustomerSegment)` (**requerido**) al `CreateExpedienteSchema` y el campo a la clase `CreateExpedienteDto` (importar `CustomerSegment` de `@iwana/shared`).
- Verificar que el `create()` del servicio de expedientes (`apps/api/src/modules/crm/expedientes/expediente.service.ts`) persista el nuevo campo (si mapea campos explícitos del DTO, agregarlo ahí).

### 3. Backend — sección "Interés comercial" (edición en detalle)

- `apps/api/src/modules/crm/expedientes/expediente.service.ts`:
  - En el `case ExpedienteSection.COMMERCIAL_INTEREST` (~línea 1737): aceptar `customerSegment`, validar contra los valores de `CustomerSegment` (rechazar valores inválidos con error de campo, como hace el resto de la sección) y mapearlo a la entidad.
  - Agregar label en `SECTION_FIELD_LABELS`: `customerSegment: 'Tipo de cliente'` (~línea 133).
- No tocar `completeness-calculator.service.ts` (no agregarlo a campos requeridos de completitud, para no degradar expedientes históricos sin el dato).

### 4. Backend — propagación al suscriptor

- `apps/api/src/modules/crm/subscribers/subscriber-creation.service.ts`, método `resolveCustomerSegment` (líneas 326-331): si `expediente.customerSegment` tiene valor, retornarlo; si no, mantener el fallback actual (`JURIDICA → PYME`, si no `RESIDENTIAL`).

### 5. Frontend — contrato en api-client

- `apps/portal/src/lib/api-client.ts`:
  - `CreateExpedienteDto` (~línea 5397): agregar `customerSegment: CustomerSegment` (requerido).
  - `ExpedienteRecord` (~líneas 5051-5133): agregar `customerSegment: CustomerSegment | null`.
  - Importar `CustomerSegment` desde `@iwana/shared` (el archivo ya importa enums compartidos).

### 6. Frontend — formulario de alta

- `apps/portal/src/components/crm/expedientes/expediente-ui.ts`: exportar `CUSTOMER_SEGMENT_OPTIONS: { value, label }[]` con los labels canónicos ya usados en portal (Residencial, SOHO, PyME, Gobierno, Corporativo, Mayorista — en el orden indicado por el usuario).
- `apps/portal/src/components/crm/expedientes/ExpedientesLandingClient.tsx`:
  - Estado `createValues` (línea 169): agregar `customerSegment: ''` (vacío; obligatorio sin default).
  - `validateCreateValues` (línea 86): exigir selección (`'Selecciona el tipo de cliente.'`).
  - Formulario (líneas 469-540): agregar `Select` nativo de `@iwana/ui` con `<label>` manual, replicando el bloque de "Origen" (líneas 515-539), con placeholder "Selecciona una opción". Ubicación: **segundo campo, después de "Nombre completo"** (enmarca la oportunidad antes que asesor/origen).
  - `handleCreateNew` (líneas 399-405): incluir `customerSegment` en el payload de `crmApi.createExpediente`.
  - Reset de `createValues` tras crear: incluir la nueva key.

### 7. Frontend — sección "Interés comercial" del detalle

- `apps/portal/src/components/crm/expedientes/sections/constants.ts`: agregar `customerSegment` a la configuración de campos de `commercial_interest` (tipo select, label "Tipo de cliente", opciones `CUSTOMER_SEGMENT_OPTIONS` re-exportadas desde `expediente-ui.ts`, siguiendo el patrón de los selects existentes como `technologyOption`).
- Verificar que `CommercialInterestSection.tsx` / `SectionFieldRenderer.tsx` rendericen el campo sin cambios estructurales (los selects ya son un patrón soportado); solo ajustar si el renderer lo requiere.

### 8. Tests

- Backend (`apps/api/src/modules/crm/expedientes/tests/` y `subscribers/`):
  - `CreateExpedienteSchema`: acepta los 6 valores; rechaza ausencia del campo y valores fuera del enum.
  - `expediente.service.spec.ts`: update de sección `commercial_interest` persiste `customerSegment` y rechaza valor inválido.
  - `subscriber-creation.service` spec: expediente con `customerSegment = GOVERNMENT` → suscriptor nace con `GOVERNMENT`; expediente sin segmento → fallback actual.
- Migración: spec hermano de la 116 (paridad/orden ya cubiertos por `migration-order.spec.ts` al registrarla).
- Frontend: si existe spec del landing de expedientes, agregar caso de validación (segmento requerido); si no existe, no crear archivo nuevo solo para esto.

### 9. Documentación y vocabulario

- Labels visibles en español, sentence case: "Tipo de cliente" + Residencial / SOHO / PyME / Gobierno / Corporativo / Mayorista (consistentes con `subscriber-ui.ts:111-116` y ADR-025). Sin términos técnicos en UI (regla `system-vocabulary-review`).
- Actualizar `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md` (§7.1 CA-01, datos mínimos del alta) para incluir el segmento.
- Crear/actualizar informe en `docs/informes/` según Documentation Rules de AGENTS.md.

## Verificación

1. `pnpm --filter @iwana/db build` y `pnpm --filter @iwana/db migration:tenant:run` (entorno local) — la 116 aplica limpio y es reversible (`migration:tenant` down manual o spec).
2. `pnpm --filter @iwana/api test` — specs de expedientes y subscribers en verde.
3. `pnpm --filter @iwana/portal typecheck` y `pnpm lint`.
4. Smoke manual: crear oportunidad en `/dashboard/crm/expedientes` eligiendo segmento → aparece en detalle (Interés comercial), editable; al convertir a suscriptor, el contrato/suscriptor hereda el segmento elegido.

## Riesgos / notas

- Expedientes históricos quedan con `customer_segment NULL` por diseño (no se hace backfill inventado); el fallback de conversión los cubre.
- El submódulo `opportunities` (`apps/api/src/modules/crm/opportunities/`) es **legacy** según PRD MOD05 (sin migración de creación de tabla): queda fuera de alcance.
- No se agrega índice nuevo; si más adelante se filtra el pipeline por segmento, evaluar `idx_expediente_records_tenant_segment` en migración aparte.
