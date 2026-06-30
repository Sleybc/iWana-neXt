# PROMPT — MOD05 CRM: Subscriber Frontend — Fase 02 (Portal Empresarial)

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-04-17  
**Generado por:** AI-EM-ARCH (Modo Mixto)  
**Destinatario:** AI-SR-FULL (Senior Developer Fullstack)  
**Modulo:** MOD05-CRM-SUBSCRIBERS  
**Fase:** 02 — Frontend Portal Empresarial (Next.js App Router)  
**PRD de referencia:** docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-02-v1.0.md  
**PRD padre:** docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md  
**PRD Fase 01 (completado):** docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-01-v1.0.md  
**HLD de referencia:** docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md  
**ADRs aplicables:** ADR-002, ADR-004, ADR-025, ADR-026  
**Identidad corporativa:** docs/identity/Manual_Implementacion_Identidad_Iwana.md — Obligatorio  
**Informe Fase 01:** docs/informes/INFORME-MOD05-SUBSCRIBERS-FASE-01-v1.0.md  
**Baseline:** Node 24/25, pnpm 10, Next.js 16.1.x, React 19, Tailwind CSS v4, shadcn/ui (@iwana/ui)

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** Frontend completo del módulo Subscriber en el portal empresarial (`apps/portal`), incluyendo página de listado con filtros, página de detalle 360° con tabs, formulario discriminado por personType, componente de transición de estado, integración API con 8 endpoints REST, y navegación actualizada — todo siguiendo la identidad corporativa iWana (Exo 2, #17163A/#A5C330, rounded-2xl, dark mode).

**Lo que sí entra:**

- Consumir schemas Zod + tipos ya exportados desde `@iwana/shared` para validación cliente
- Módulo `subscribersApi` en `api-client.ts` con 8 métodos tipados
- Utilidades UI (`subscriber-ui.ts`) con metadata de estados, labels, formateadores
- Página de listado `/dashboard/crm/subscribers` con filtros, búsqueda, paginación
- Página de detalle `/dashboard/crm/subscribers/[id]` con tabs (datos personales, contactos stub, contratos stub, habeas data stub)
- Formulario discriminado NATURAL/JURIDICA con validación Zod
- Componente de transición de estado (dialog con razón obligatoria)
- Banner IVA automático (read-only)
- Navegación sidebar + redirect actualizados
- CrmOverviewClient actualizado con link a suscriptores

**Lo que no entra:**

- Implementación real de tabs de Contactos, Contratos, Habeas Data (stubs informativos únicamente)
- E2E tests de Playwright (fase dedicada)
- Refactor del expediente detail existente (998 líneas)
- Portal del suscriptor (público)
- Integración con Billing, Provisioning, Inventory

---

## 2. Contexto técnico

### 2.1 Backend (Fase 01 — completado)

8 endpoints REST disponibles:

| Método | Ruta                          | Roles                             | Descripción           |
| ------ | ----------------------------- | --------------------------------- | --------------------- |
| POST   | `/crm/subscribers`            | ADMIN, SALES                      | Crear suscriptor      |
| GET    | `/crm/subscribers`            | ADMIN, SALES, SUPPORT, ACCOUNTANT | Listar con filtros    |
| GET    | `/crm/subscribers/search`     | ADMIN, SALES, SUPPORT, ACCOUNTANT | Búsqueda determinista |
| GET    | `/crm/subscribers/:id`        | ADMIN, SALES, SUPPORT, ACCOUNTANT | Detalle con PII       |
| PATCH  | `/crm/subscribers/:id`        | ADMIN, SALES                      | Actualizar            |
| DELETE | `/crm/subscribers/:id`        | ADMIN                             | Soft delete           |
| PATCH  | `/crm/subscribers/:id/status` | ADMIN, SUPPORT                    | Transición estado     |
| GET    | `/crm/subscribers/:id/360`    | ADMIN, SALES, SUPPORT, ACCOUNTANT | Ficha 360°            |

### 2.2 Patrones existentes del portal

- **API client**: Singleton `request<T>()` con auth, refresh token, tenant slug, `ApiError`. Módulos: `authApi`, `crmApi`, `usersApi`, `tenantSelfApi`, `dashboardApi`, `userApi`, `auditApi`.
- **Componentes**: Patrón `*Client.tsx` con `useState` + `useEffect` (sin React Query).
- **UI**: `@iwana/ui` (Button, Card, Input, Select, Badge, Dialog, SectionAccordion, ProgressMeter). Tailwind v4 CSS-first.
- **Formularios**: Esta fase fija validación basada en Zod reutilizando `@iwana/shared`. No duplicar reglas con validación manual ad hoc.
- **Idempotencia**: POST/PUT usan `Idempotency-Key` header.
- **Errores**: Inline `<div>` con `AlertTriangle` icon, no toast.
- **Dark mode**: Tokens `dark-surface-*` y `dark-border-*`, nunca `gray-700/800/900`.

### 2.4 Decisiones de implementación cerradas para esta fase

- `subscribersApi` debe implementarse como **objeto exportado** dentro de `apps/portal/src/lib/api-client.ts`, alineado al patrón actual de `crmApi`. No introducir clase, SDK separado ni un patrón alterno.
- La validación del formulario debe reutilizar `CreateSubscriberSchema` y `UpdateSubscriberSchema` de `@iwana/shared`. Se permite estado local del formulario, pero no duplicar reglas de negocio fuera de esos schemas.
- `VatTreatmentBanner` es exclusivamente de lectura: consume `vatTreatment` y `taxRegime` devueltos por backend. Está prohibido recalcular IVA o régimen tributario en cliente.
- `ALLOWED_TRANSITIONS` en UI es metadata de apoyo visual. La fuente de verdad sigue siendo backend; no se amplían transiciones por conveniencia frontend.

### 2.3 Identidad iWana (obligatorio)

- **Tipografía**: Exo 2 (display + body), JetBrains Mono (mono)
- **Colores**: primary #17163A, secondary #A5C330, secondary-700 #6A7A1C (texto sobre blanco)
- **Bordes**: rounded-2xl estándar, rounded-xl para inputs, rounded-[20px]/[24px] para cards
- **Sombras**: shadow-iwana, shadow-iwana-lg, shadow-iwana-card
- **Dark mode**: dark-surface (#181818), dark-surface-2 (#222222), dark-surface-3 (#2A2A2A), dark-surface-4 (#333333)
- **Contraste**: Texto sobre blanco → secondary-700 o primary, NUNCA secondary DEFAULT sobre blanco

---

## 3. Instrucciones

### Paso 1: Verificar y consumir schemas Zod desde @iwana/shared

**Estado esperado actual:**

- `packages/shared/src/schemas/subscriber.schema.ts` ya existe
- `packages/shared/src/index.ts` ya reexporta los schemas
- Los DTOs backend de subscribers ya importan schemas desde `@iwana/shared`

**Archivos a verificar:**

- `packages/shared/src/schemas/subscriber.schema.ts`
- `packages/shared/src/index.ts`
- `apps/api/src/modules/crm/subscribers/dto/create-subscriber.dto.ts`
- `apps/api/src/modules/crm/subscribers/dto/update-subscriber.dto.ts`
- `apps/api/src/modules/crm/subscribers/dto/transition-subscriber-status.dto.ts`

**Si faltara algo, aplicar estas correcciones:**

- Copiar `CreateSubscriberSchema` (discriminated union por personType) desde el DTO del backend
- Copiar `UpdateSubscriberSchema` (flat, todos opcionales)
- Copiar `TransitionSubscriberStatusSchema`
- Exportar tipos inferidos: `CreateSubscriberPayload`, `UpdateSubscriberPayload`, `TransitionStatusPayload`
- Exportar tipos helper: `NaturalSubscriberPayload`, `JuridicaSubscriberPayload`

**Actualizar barrel exports en `packages/shared/src/index.ts`:**

- Agregar: `export * from './schemas/subscriber.schema'`

**Actualizar imports en backend:**

- Los DTOs del backend deben importar los schemas desde `@iwana/shared` en lugar de definirlos localmente. Las clases DTO (`CreateSubscriberDto`, `UpdateSubscriberDto`, `TransitionSubscriberStatusDto`) se mantienen para NestJS (con `@Allow()`), pero los schemas Zod se importan.

**Verificación:** `pnpm typecheck` pasa. Los 127 tests del backend siguen pasando.

---

### Paso 2: Agregar subscribersApi al API client

**Archivo a modificar:** `apps/portal/src/lib/api-client.ts`

**Agregar tipos TypeScript reutilizando enums y payloads de `@iwana/shared` siempre que sea posible:**

```typescript
interface SubscriberRecord {
  /* todos los campos de SubscriberResponse */
}
interface ListSubscribersParams {
  /* filtros + paginación */
}
interface SearchSubscribersParams {
  /* búsqueda determinista */
}
interface TransitionStatusPayload {
  targetStatus: SubscriberStatus;
  reason?: string;
}
```

**Agregar objeto exportado `subscribersApi` con 8 métodos:**

- `create(payload)` → POST `/crm/subscribers` con `Idempotency-Key`
- `list(params?)` → GET `/crm/subscribers`
- `search(params?)` → GET `/crm/subscribers/search`
- `getById(id)` → GET `/crm/subscribers/${id}`
- `update(id, payload)` → PATCH `/crm/subscribers/${id}`
- `remove(id)` → DELETE `/crm/subscribers/${id}`
- `transitionStatus(id, payload)` → PATCH `/crm/subscribers/${id}/status`
- `get360(id)` → GET `/crm/subscribers/${id}/360`

**Exportar con el patrón vigente del portal:** `export const subscribersApi = { ... }`

**Restricción:** no crear clase `SubscribersApi`; mantener consistencia con `crmApi`, `dashboardApi`, `authApi` y el resto del archivo.

**Verificación:** `pnpm --filter @iwana/portal typecheck` pasa.

---

### Paso 3: Crear subscriber-ui.ts

**Archivo a crear:** `apps/portal/src/components/crm/subscribers/subscriber-ui.ts`

**Contenido:**

```typescript
// SUBSCRIBER_STATUS_META — Badge variant + label para cada estado
// PERSON_TYPE_META — label + descripción + tooltip para NATURAL/JURIDICA
// CUSTOMER_SEGMENT_META — label + descripción para cada segmento (6 opciones)
// VAT_TREATMENT_META — label + descripción + color para EXEMPT/EXCLUDED/STANDARD
// TAX_REGIME_META — label para SIMPLIFIED/COMMON
// DOCUMENT_TYPE_OPTIONS — opciones dropdown para NATURAL
// STRATUM_OPTIONS — opciones 1-6 con labels descriptivos
// ALLOWED_TRANSITIONS — mapa de transiciones permitidas por estado
// formatSubscriberName(subscriber) — nombre completo o RZ social según personType
// formatDocumentDisplay(subscriber) — documento o NIT según personType
// formatVatTreatmentLabel(vatTreatment) — etiqueta legible con descripción corta
```

**Colores de badge (seguir patrón de expediente-ui.ts):**

- LEAD → neutral
- PROSPECT → info
- ACTIVE → success/lime
- SUSPENDED → warning
- CANCELLED → error

**Verificación:** TypeScript compila sin errores.

---

### Paso 4: Página de listado de suscriptores

**Archivos a crear:**

- `apps/portal/src/app/dashboard/crm/subscribers/page.tsx` — Server component wrapper
- `apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx` — Client component principal

**Funcionalidad:**

- Tabla con columnas: Nombre/RZ, Documento/NIT, Tipo Persona, Segmento, IVA, Ciudad, Estado, Fecha
- Filtros: status (Select), personType (Select), customerSegment (Select), stratum (Select 1-6), búsqueda (Input)
- Badges para status, personType, customerSegment con variantes iWana
- Paginación con selector de límite (10/25/50)
- Botón "Nuevo suscriptor" → navega a `/dashboard/crm/subscribers/new`
- Click en fila → navega a `/dashboard/crm/subscribers/[id]`
- Búsqueda determinista usa `subscribersApi.search()` con debounce
- Estados de carga y error following patrón existente

**Identidad iWana:**

- Cards con `rounded-2xl shadow-iwana-card`
- Tabla con `rounded-xl` headers, `divide-y divide-gray-100 dark:divide-dark-border`
- Badges con variantes de `@iwana/ui/Badge`
- Inputs con `rounded-xl` (estilo Input de @iwana/ui)
- Botones con `@iwana/ui/Button`
- Dark mode: `bg-dark-surface-2` para cards, `dark-surface-3` para inputs/hover

**Verificación:** La página renderiza sin errores de TypeScript.

---

### Paso 5: Página de detalle 360° + header + tabs

**Archivos a crear:**

- `apps/portal/src/app/dashboard/crm/subscribers/[id]/page.tsx` — Server component wrapper
- `apps/portal/src/app/dashboard/crm/subscribers/new/page.tsx` — Server component wrapper (crear nuevo)
- `apps/portal/src/components/crm/subscribers/SubscriberDetailClient.tsx` — Client component principal
- `apps/portal/src/components/crm/subscribers/SubscriberHeader.tsx` — Header con badges y acciones
- `apps/portal/src/components/crm/subscribers/SubscriberTabsContainer.tsx` — Tabs container

**SubscriberHeader:**

- Nombre completo (NATURAL) o razón social (JURIDICA)
- Badge de status con color
- Badge de personType (NATURAL en azul info, JURIDICA en primary)
- Badge de customerSegment
- VatTreatmentBanner (read-only: "IVA: Exento (tarifa 0%)" / "IVA: Excluido" / "IVA: 19%")
- Botón "Cambiar estado" → abre dialog de transición
- Breadcrumb: CRM > Suscriptores > [Nombre]

**SubscriberTabsContainer:**

- Tab 1: "Datos personales" (SubscriberForm)
- Tab 2: "Contactos" (stub: card informativa)
- Tab 3: "Contratos" (stub: card informativa)
- Tab 4: "Habeas Data" (stub: card informativa)

**Stubs para tabs futuros:**

```tsx
<Card variant="default" padding="lg">
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <Briefcase className="h-12 w-12 text-iwana-neutral/40 mb-4" />
    <h3 className="text-lg font-semibold text-iwana-primary dark:text-white">
      Módulo de Contactos
    </h3>
    <p className="text-sm text-iwana-neutral mt-2">Disponible en próxima fase</p>
  </div>
</Card>
```

**Verificación:** TypeScript compila. La página carga sin errores de runtime.

---

### Paso 6: Formulario discriminado por personType

**Archivos a crear:**

- `apps/portal/src/components/crm/subscribers/SubscriberForm.tsx` — Formulario principal
- `apps/portal/src/components/crm/subscribers/NaturalPersonFields.tsx` — Campos NATURAL
- `apps/portal/src/components/crm/subscribers/JuridicaPersonFields.tsx` — Campos JURIDICA
- `apps/portal/src/components/crm/subscribers/SharedPersonFields.tsx` — Campos compartidos
- `apps/portal/src/components/crm/subscribers/VatTreatmentBanner.tsx` — Banner IVA read-only

**SubscriberForm:**

- Prop `initialData?: SubscriberRecord` (null = crear, objeto = editar)
- Prop `onSave: (data) => Promise<void>`
- Prop `onCancel: () => void`
- Estado local: `personType`, `draftValues`, `errors`, `saving`
- Toggle personType: segmented control (NATURAL | JURIDICA) con descripción tooltip
- Al cambiar personType: limpiar campos específicos del tipo anterior
- Renderizado condicional: si NATURAL → `<NaturalPersonFields />`, si JURIDICA → `<JuridicaPersonFields />`
- `<SharedPersonFields />` siempre visible
- `<VatTreatmentBanner />` cuando hay datos de response (solo en edición, no en creación)
- Validación Zod cliente-side usando `CreateSubscriberSchema` (si crear) o `UpdateSubscriberSchema` (si editar)
- Errores inline por campo con estilo iWana error
- Botón guardar con `loading` prop, deshabilitado si hay errores

**Restricción:** no reintroducir `validateCreateValues()` ni variantes locales paralelas para reglas ya cubiertas por shared.

**NaturalPersonFields:**

- documentType: Select con opciones `DOCUMENT_TYPE_OPTIONS`
- documentNumber: Input text
- firstName: Input text
- lastName: Input text
- stratum: Select 1-6 con labels descriptivos ("Estrato 1 - Bajo-Bajo", etc.)
- birthDate: Input date

**JuridicaPersonFields:**

- nit: Input text (NIT sin digito)
- nitVerificationDigit: Input text (1 carácter)
- businessName: Input text
- commercialName: Input text (opcional)
- legalRepresentativeId: Input text con búsqueda (stub — input manual por ahora)

**SharedPersonFields:**

- customerSegment: Select con 6 opciones
- email: Input email
- phone: Input text
- whatsapp: Input text (opcional)
- address: Input text
- neighborhood: Input text (opcional)
- city: Input text (opcional)
- department: Input text (opcional)
- postalCode: Input text (opcional)
- latitude: Input number (opcional)
- longitude: Input number (opcional)

**VatTreatmentBanner:**

- Card con fondo `bg-iwana-primary/5 dark:bg-dark-surface-3` y borde izquierdo color según tratamiento
- EXEMPT → borde verde, ícono info
- EXCLUDED → borde amarillo, ícono warning
- STANDARD → borde rojo, ícono alerta
- Texto: "Tratamiento IVA: [label] — [descripción corta]"
- Segunda línea: "Régimen tributario: [SIMPLIFIED|COMMON]"

**Restricción:** nunca calcular `vatTreatment` o `taxRegime` en frontend. Solo reflejar la respuesta del backend.

**Verificación:** Validación funciona para ambos tipos de persona. Tipo de persona cambia correctamente los campos visibles.

---

### Paso 7: Componente de transición de estado

**Archivo a crear:** `apps/portal/src/components/crm/subscribers/SubscriberStatusTransitionDialog.tsx`

**Funcionalidad:**

- Prop `currentStatus: SubscriberStatus`
- Prop `onTransition: (targetStatus, reason) => Promise<void>`
- Usa `Dialog` de `@iwana/ui`
- Muestra transiciones permitidas según `ALLOWED_TRANSITIONS[currentStatus]`
- Radio buttons para seleccionar estado destino
- Campo "Razón" (textarea) — obligatorio si targetStatus es SUSPENDED o CANCELLED
- Botón confirmar deshabilitado si:
  - No se seleccionó estado destino
  - Razón es obligatoria y está vacía
- Confirmación secundaria para CANCELLED (dialog "¿Está seguro?")
- Loading state en botón confirmar

**Verificación:** Dialog abre, muestra transiciones correctas, validación funciona.

---

### Paso 8: Actualizar navegación sidebar

**Archivo a modificar:** `apps/portal/src/components/layout/Sidebar.tsx`

**Cambios:**

- Verificar item "Suscriptores" con icono `Users` apuntando a `/dashboard/crm/subscribers`
- Mantenerlo debajo de "CRM" en el mismo bloque de navegación

**Archivo a modificar:** `apps/portal/src/app/dashboard/subscribers/page.tsx`

**Cambios:**

- Verificar y preservar redirect histórico hacia `/dashboard/crm/subscribers` (mantener compatibilidad histórica)

**Verificación:** Sidebar muestra item "Suscriptores" y redirige correctamente.

---

### Paso 9: Actualizar CrmOverviewClient

**Archivo a modificar:** `apps/portal/src/components/crm/CrmOverviewClient.tsx`

**Cambios:**

- Agregar card/sección "Suscriptores" con:
  - Conteo de suscriptores por estado (llamada a `subscribersApi.list()` con limit=1 para obtener total)
  - Link "Ver todos" → `/dashboard/crm/subscribers`
  - Badges con conteo por estado (LEAD, PROSPECT, ACTIVE, SUSPENDED, CANCELLED)
- Ajustar métricas y copy del pipeline para eliminar referencias a estados legacy removidos por ADR-026 (`CONTACTADO`, `PENDIENTE_DATOS`, `VIABLE_COMERCIALMENTE`, `PENDIENTE_DECISION`)

**Verificación:** CrmOverviewClient renderiza sin errores. Card de suscriptores visible.

---

### Paso 10: Verificación final

**Ejecutar:**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

**Criterios:**

- Typecheck limpio (0 errores)
- Lint limpio (0 errores, 0 warnings nuevos)
- 127 tests del backend siguen pasando
- Portal compila sin errores

---

## 4. Criterios de aceptación

| CA       | Descripción                                                                    |
| -------- | ------------------------------------------------------------------------------ |
| CA-FE-01 | Página de listado muestra suscriptores con filtros funcionales y paginación    |
| CA-FE-02 | Badges de color para status, personType y customerSegment con labels correctos |
| CA-FE-03 | Formulario discrimina campos por personType (NATURAL vs JURIDICA)              |
| CA-FE-04 | Validación Zod coincide con backend: campos obligatorios por tipo, formatos    |
| CA-FE-05 | Banner IVA muestra tratamiento calculado (read-only, no editable)              |
| CA-FE-06 | Transición de estado valida transiciones permitidas y razón obligatoria        |
| CA-FE-07 | Navegación sidebar y redirect actualizados                                     |
| CA-FE-08 | CrmOverviewClient muestra card de suscriptores                                 |
| CA-FE-09 | Identidad iWana: Exo 2, colores, rounded-2xl, dark mode                        |
| CA-FE-10 | Typecheck limpio, lint limpio, tests existentes pasando                        |
| CA-FE-11 | Schemas Zod exportados desde @iwana/shared                                     |
| CA-FE-12 | Zero PII en logs client-side                                                   |

---

## 5. Stop / Go

- **Stop si:** falta PRD, HLD, identidad corporativa; error de TypeScript que no se pueda resolver; violación de boundary con otros módulos; PII en logs client-side.
- **Go si:** todos los artefactos leídos, backend funcionando (127/127 tests), identidad corporativa disponible, y sin bloqueos de arquitectura.

---

_Prompt generado por AI-EM-ARCH para Fase 02 del módulo Subscriber._
