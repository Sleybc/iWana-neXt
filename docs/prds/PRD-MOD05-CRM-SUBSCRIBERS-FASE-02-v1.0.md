# PRD - MOD05 CRM Módulo Subscriber — Fase 02 (Frontend Portal)

**Version:** 1.0  
**Estado:** Propuesto  
**Fecha:** 2026-04-17  
**Modo activo:** Architect  
**Autor:** AI-EM-ARCH  
**Trazabilidad base:** docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md  
**PRD padre:** docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md  
**PRD Fase 01:** docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-01-v1.0.md (completado)  
**HLD relacionado:** docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md  
**ADRs aplicables:** ADR-002 (multi-tenant por schema), ADR-004 (soft delete + auditoría), ADR-025 (modelo dos dimensiones), ADR-026 (consolidación pipeline)  
**Identidad corporativa:** docs/identity/Manual_Implementacion_Identidad_Iwana.md — Obligatorio respetar en todo el frontend

---

## 1. Contexto y motivación

### 1.1 Estado actual

La Fase 01 (Backend) del módulo Subscriber está completa:

- Entity Subscriber con dos dimensiones (personType + customerSegment)
- VatTreatmentService (motor IVA colombiano) — 28 tests
- SubscriberStatusTransitionService (máquina de estados) — 31 tests
- SubscribersService (CRUD + PII + búsqueda hash) — 28 tests
- SubscribersController (8 endpoints REST con RBAC + Zod) — 16 tests
- SubscriberCreationService (Expediente → Subscriber + eventos + auditoría) — 24 tests
- 127/127 tests pasando, typecheck limpio
- Migraciones 012, 013, 014 aplicadas

### 1.2 Necesidad

El portal empresarial (`apps/portal`) no tiene interfaz para gestionar suscriptores. Los endpoints REST están listos pero no hay páginas, componentes ni cliente API para consumirlos. Se necesita:

1. Una página de listado con filtros y búsqueda.
2. Una página de detalle 360° con tabs.
3. Un formulario de creación/edición discriminado por personType (NATURAL vs JURIDICA).
4. Un componente de transición de estado con justificación obligatoria.
5. Integración con la identidad corporativa iWana (Exo 2, colores, bordes redondeados).

### 1.3 Restricciones

- Seguir el patrón existente del portal: `useState` + `useEffect` (sin React Query/SWR).
- Usar componentes `@iwana/ui` (Button, Card, Input, Select, Badge, Dialog, SectionAccordion).
- Tailwind CSS v4 con `@theme` directive (no `tailwind.config.js`).
- Contraste AA (WCAG 2.1): texto sobre blanco usa `iwana-secondary-700` o `iwana-primary`.
- Dark mode con tokens `dark-surface-*` (nunca `gray-700/800/900`).
- Componentes separados (no inline de 900 líneas como expedientes).

---

## 2. Alcance

### 2.1 En scope

- Exportar schemas Zod de Subscriber desde `@iwana/shared` para validación cliente.
- Extender `api-client.ts` con módulo `subscribersApi` (8 métodos tipados).
- Utilidades UI: `subscriber-ui.ts` (status meta, labels, formatters, transiciones permitidas).
- Página de listado de suscriptores con filtros, búsqueda y paginación.
- Página de detalle 360° con tabs (datos personales, contactos stub, contratos stub, habeas data stub).
- Formulario discriminado por personType: NATURAL (documento, nombre, estrato, fecha nacimiento) vs JURIDICA (NIT, razón social, representante legal).
- Banner automático de IVA/taxRegime (read-only, calculado por backend).
- Componente de transición de estado (dialog con transiciones permitidas y razón obligatoria).
- Navegación en sidebar y CrmOverviewClient.
- Redirect actualizado: `/dashboard/subscribers` → `/dashboard/crm/subscribers`.

### 2.2 Fuera de scope

- Implementación real de tabs de Contactos, Contratos, Habeas Data (stubs informativos).
- Portal del suscriptor (público).
- Integración con Billing, Provisioning, Inventory.
- E2E tests de Playwright (se desarrolloŕan en fase dedicada).
- Refactor del expediente detail de 998 líneas (decisión futura).

---

## 3. Requerimientos funcionales

### 3.1 Página de listado

| ID       | Requerimiento                                                                                                         | Prioridad |
| -------- | --------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-FE-01 | Página `/dashboard/crm/subscribers` con tabla de suscriptores                                                         | MVP       |
| RF-FE-02 | Filtros: status (dropdown), personType (dropdown), customerSegment (dropdown), stratum (dropdown 1-6), búsqueda libre | MVP       |
| RF-FE-03 | Columnas: Nombre/RZ, Documento/NIT, Segmento, Tipo Persona, Tratamiento IVA, Ciudad, Estado, Fecha creación           | MVP       |
| RF-FE-04 | Badges de color para status, personType y customerSegment usando variantes iWana                                      | MVP       |
| RF-FE-05 | Paginación con selector de límite (10/25/50)                                                                          | MVP       |
| RF-FE-06 | Botón "Nuevo suscriptor" que navega a formulario de creación                                                          | MVP       |
| RF-FE-07 | Click en fila navega a detalle 360° del suscriptor                                                                    | MVP       |
| RF-FE-08 | Búsqueda determinista por documento, NIT, email (usa endpoint `/search`)                                              | MVP       |

### 3.2 Página de detalle 360°

| ID       | Requerimiento                                                                  | Prioridad |
| -------- | ------------------------------------------------------------------------------ | --------- |
| RF-FE-09 | Página `/dashboard/crm/subscribers/[id]` con ficha 360°                        | MVP       |
| RF-FE-10 | Header con nombre/RZ, status badge, personType badge, customerSegment badge    | MVP       |
| RF-FE-11 | Banner read-only mostrando vatTreatment (EXEMPT/EXCLUDED/STANDARD) y taxRegime | MVP       |
| RF-FE-12 | Botón cambiar estado que abre dialog de transición                             | MVP       |
| RF-FE-13 | Tab "Datos personales": formulario editable discriminado por personType        | MVP       |
| RF-FE-14 | Tab "Contactos": stub informativo "Disponible en próxima fase"                 | MVP       |
| RF-FE-15 | Tab "Contratos": stub informativo                                              | MVP       |
| RF-FE-16 | Tab "Habeas Data": stub informativo                                            | MVP       |
| RF-FE-17 | Breadcrumb: CRM > Suscriptores > [Nombre]                                      | MVP       |

### 3.3 Formulario discriminado por personType

| ID       | Requerimiento                                                                                           | Prioridad |
| -------- | ------------------------------------------------------------------------------------------------------- | --------- |
| RF-FE-18 | Toggle personType (NATURAL/JURIDICA) con limpieza de campos al cambiar                                  | MVP       |
| RF-FE-19 | NATURAL muestra: documentType (dropdown), documentNumber, firstName, lastName, stratum (1-6), birthDate | MVP       |
| RF-FE-20 | JURIDICA muestra: NIT, digito verificación, razón social, nombre comercial, representante legal         | MVP       |
| RF-FE-21 | Campos compartidos: customerSegment, email, phone, whatsapp, dirección completa, lat/lng                | MVP       |
| RF-FE-22 | Validación Zod cliente con discriminated union ( coincide con backend)                                  | MVP       |
| RF-FE-23 | IVA calculado por backend — mostrar banner read-only con resultado tras crear/actualizar                | MVP       |
| RF-FE-24 | Tooltips explicativos: personType = "dimensión fiscal", customerSegment = "segmento de negocio"         | MVP       |
| RF-FE-25 | Error display inline por campo con estilo iWana                                                         | MVP       |
| RF-FE-26 | Botón guardar con indicador de carga, feedback de éxito/error                                           | MVP       |

### 3.4 Transición de estado

| ID       | Requerimiento                                                              | Prioridad |
| -------- | -------------------------------------------------------------------------- | --------- |
| RF-FE-27 | Dialog para cambiar estado con transiciones permitidas según estado actual | MVP       |
| RF-FE-28 | Campo razón obligatorio para SUSPENDED y CANCELLED                         | MVP       |
| RF-FE-29 | Confirmación antes de enviar transición                                    | MVP       |
| RF-FE-30 | Feedback inmediato: badge de estado actualiza sin recarga                  | MVP       |

### 3.5 Integración API

| ID       | Requerimiento                                                  | Prioridad |
| -------- | -------------------------------------------------------------- | --------- |
| RF-FE-31 | `subscribersApi.create(payload)` — POST con Idempotency-Key    | MVP       |
| RF-FE-32 | `subscribersApi.list(params)` — GET con filtros y paginación   | MVP       |
| RF-FE-33 | `subscribersApi.search(params)` — GET determinista             | MVP       |
| RF-FE-34 | `subscribersApi.getById(id)` — GET con PII descifrado          | MVP       |
| RF-FE-35 | `subscribersApi.update(id, payload)` — PATCH                   | MVP       |
| RF-FE-36 | `subscribersApi.remove(id)` — DELETE soft                      | MVP       |
| RF-FE-37 | `subscribersApi.transitionStatus(id, payload)` — PATCH /status | MVP       |
| RF-FE-38 | `subscribersApi.get360(id)` — GET ficha completa               | MVP       |

### 3.6 Navegación

| ID       | Requerimiento                                                       | Prioridad |
| -------- | ------------------------------------------------------------------- | --------- |
| RF-FE-39 | Item "Suscriptores" en sidebar bajo sección CRM                     | MVP       |
| RF-FE-40 | Redirect `/dashboard/subscribers` → `/dashboard/crm/subscribers`    | MVP       |
| RF-FE-41 | Card/sección de suscriptores en CrmOverviewClient con conteo y link | MVP       |

---

## 4. Requerimientos no funcionales

| ID        | Requerimiento                                                                                        | Prioridad |
| --------- | ---------------------------------------------------------------------------------------------------- | --------- |
| RNF-FE-01 | Identidad iWana: Exo 2, primary #17163A, secondary #A5C330, bordes rounded-2xl, sombras shadow-iwana | MVP       |
| RNF-FE-02 | Tailwind CSS v4, CSS-first, @theme directive (no tailwind.config.js)                                 | MVP       |
| RNF-FE-03 | Componentes @iwana/ui (Button, Card, Input, Select, Badge, Dialog) como base                         | MVP       |
| RNF-FE-04 | Contraste AA: texto sobre blanco usa secondary-700 (#6A7A1C) o primary (#17163A)                     | MVP       |
| RNF-FE-05 | Dark mode con tokens dark-surface-\* (nunca gray-700/800/900)                                        | MVP       |
| RNF-FE-06 | Componentes separados por responsabilidad (no inline de 900+ líneas)                                 | MVP       |
| RNF-FE-07 | Zero PII en logs client-side                                                                         | MVP       |
| RNF-FE-08 | Type safety: TypeScript strict con exactOptionalPropertyTypes                                        | MVP       |
| RNF-FE-09 | Validación Zod reutilizada: schemas exportados desde @iwana/shared                                   | MVP       |
| RNF-FE-10 | Idioma español colombiano en UI: labels, errores, tooltips                                           | MVP       |

---

## 5. Modelo de datos frontend

### 5.1 Tipos TypeScript

```typescript
type PersonType = 'NATURAL' | 'JURIDICA';
type CustomerSegment = 'RESIDENTIAL' | 'SOHO' | 'PYME' | 'CORPORATE' | 'GOVERNMENT' | 'WHOLESALE';
type SubscriberStatus = 'LEAD' | 'PROSPECT' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
type VatTreatment = 'EXEMPT' | 'EXCLUDED' | 'STANDARD';
type TaxRegime = 'SIMPLIFIED' | 'COMMON';
type DocumentType = 'CC' | 'CE' | 'PASAPORTE' | 'PEP' | 'PTP' | 'NIT_PERSONA';

interface SubscriberRecord {
  id: string;
  tenantId: string;
  userId: string | null;
  personType: PersonType;
  customerSegment: CustomerSegment;
  documentType: DocumentType | null;
  documentNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  stratum: number | null;
  birthDate: string | null;
  nit: string | null;
  nitVerificationDigit: string | null;
  businessName: string | null;
  commercialName: string | null;
  legalRepresentativeId: string | null;
  email: string;
  phone: string;
  whatsapp: string | null;
  vatTreatment: VatTreatment;
  taxRegime: TaxRegime;
  address: string;
  neighborhood: string | null;
  city: string | null;
  department: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  coverageNodeId: string | null;
  status: SubscriberStatus;
  externalId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface ListSubscribersParams {
  status?: SubscriberStatus;
  personType?: PersonType;
  customerSegment?: CustomerSegment;
  stratum?: number;
  search?: string;
  page?: number;
  limit?: number;
}

interface SearchSubscribersParams {
  documentNumber?: string;
  nit?: string;
  email?: string;
  phone?: string;
}

interface TransitionStatusPayload {
  targetStatus: SubscriberStatus;
  reason?: string;
}
```

### 5.2 Transiciones permitidas

```text
LEAD      → PROSPECT, CANCELLED
PROSPECT  → ACTIVE, CANCELLED
ACTIVE    → SUSPENDED, CANCELLED
SUSPENDED → ACTIVE, CANCELLED
CANCELLED → (terminal, sin retorno)
```

### 5.3 Regla IVA para UI

| personType | Estrato | vatTreatment | Etiqueta UI               | Color   |
| ---------- | ------- | ------------ | ------------------------- | ------- |
| NATURAL    | 1-2     | EXEMPT       | "Exento (tarifa 0%)"      | success |
| NATURAL    | 3       | EXCLUDED     | "Excluido (fuera de IVA)" | warning |
| NATURAL    | 4-6     | STANDARD     | "IVA 19%"                 | error   |
| JURIDICA   | —       | STANDARD     | "IVA 19%"                 | error   |

---

## 6. Rutas y componentes

### 6.1 Rutas

| Ruta                              | Componente                          | Descripción               |
| --------------------------------- | ----------------------------------- | ------------------------- |
| `/dashboard/crm/subscribers`      | SubscribersListClient               | Listado con filtros       |
| `/dashboard/crm/subscribers/[id]` | SubscriberDetailClient              | Detalle 360° + formulario |
| `/dashboard/crm/subscribers/new`  | SubscriberDetailClient (isNew=true) | Crear nuevo suscriptor    |

### 6.2 Componentes

| Archivo                                            | Responsabilidad                                 |
| -------------------------------------------------- | ----------------------------------------------- |
| `subscribers/SubscribersListClient.tsx`            | Listado con tabla, filtros, paginación          |
| `subscribers/SubscriberDetailClient.tsx`           | Detalle 360° con tabs                           |
| `subscribers/SubscriberHeader.tsx`                 | Header con badges, acciones                     |
| `subscribers/SubscriberTabsContainer.tsx`          | Tabs container                                  |
| `subscribers/SubscriberForm.tsx`                   | Formulario discriminado por personType          |
| `subscribers/NaturalPersonFields.tsx`              | Campos persona natural                          |
| `subscribers/JuridicaPersonFields.tsx`             | Campos persona jurídica                         |
| `subscribers/SharedPersonFields.tsx`               | Campos compartidos (email, teléfono, dirección) |
| `subscribers/SubscriberStatusTransitionDialog.tsx` | Dialog de transición de estado                  |
| `subscribers/VatTreatmentBanner.tsx`               | Banner read-only de IVA/taxRegime               |
| `subscribers/subscriber-ui.ts`                     | Metadata de estados, labels, formatters         |

---

## 7. Criterios de aceptación

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

**Resultado esperado:** Frontend completo del módulo Subscriber en el portal empresarial, integrado con los 8 endpoints REST de Fase 01, siguiendo la identidad corporativa iWana.
