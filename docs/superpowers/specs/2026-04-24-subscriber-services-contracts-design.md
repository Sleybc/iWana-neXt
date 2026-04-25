# Servicios contratados por suscriptor — diseño

**Fecha:** 2026-04-24
**Módulo:** MOD05 CRM — Subscribers + Contracts
**Estado:** Diseño aprobado (A/A/C), pendiente de implementación.
**Relacionado:** ADR-024 Expediente Único · ADR-025 Subscriber dos dimensiones · ADR-027 Conversión expediente→subscriber two-stage.

---

## 1. Problema

La tab **Servicios** de `/dashboard/crm/subscribers/:id` actualmente muestra solo el interés comercial capturado en el expediente de origen (un plan + productos + servicios sueltos). Limitaciones:

1. Un cliente real puede contratar **varios servicios** (hogar + local comercial), cada uno con dirección, segmento, plan, add-ons, contrato y facturación propios.
2. El selector de catálogo es una lista plana de radios/checkboxes — no escala cuando el catálogo crece.
3. No existe aún una sección de **contratos** en la UI pese a que la entidad `Contract` ya está en el backend.

## 2. Decisiones base (confirmadas)

| ID | Decisión |
|---|---|
| D1 | El interés comercial del expediente es **pre-venta únicamente**. Post-conversión manda el contrato. |
| D2 | El **segmento vive en el contrato/servicio**, no en el subscriber. El `customerSegment` del subscriber queda como "primario" informativo. |
| D3 | La tab Servicios es **híbrida**: lee contratos reales; cuando el subscriber no tenga contratos, muestra el interés del expediente como placeholder con acción "Convertir a contrato". |
| D4 | Estados: `DRAFT → ACTIVE → SUSPENDED → ARCHIVED`. `TERMINATED` se mantiene como estado terminal alternativo. Flujo: contrato nace en DRAFT y al firmar pasa a ACTIVE. |
| D5 | Alias del servicio: **obligatorio**, autogenerado a partir de la dirección (`"Servicio — {city} {address}"`), editable por el usuario. |

## 3. Modelo conceptual

```
Subscriber (titular)
 ├── Contract / Servicio 1 ─┬─ Plan Internet
 │                          ├─ Add-on Productos (catálogo)
 │                          ├─ Add-on Servicios (catálogo)
 │                          ├─ Dirección de instalación
 │                          ├─ Segmento override
 │                          ├─ Configuración de facturación
 │                          ├─ Tickets propios        (futuro)
 │                          └─ Facturas propias       (futuro)
 └── Contract / Servicio 2 ─…
```

**Agregado raíz = `Contract`.** Un contrato ≡ un servicio contratado.

## 4. Cambios de datos (migración 028)

Tabla `contracts` — nuevos campos:

```sql
-- Identificación visible
alias                       VARCHAR(120) NOT NULL    -- editable, default autogenerado

-- Dirección de instalación (propia del servicio)
installation_address        VARCHAR(255)
installation_city           VARCHAR(120)
installation_department     VARCHAR(120)
installation_postal_code    VARCHAR(20)
installation_notes          TEXT

-- Segmento override (nullable — hereda del subscriber si null)
customer_segment            VARCHAR(20)

-- Add-ons del catálogo
additional_product_ids      JSONB NOT NULL DEFAULT '[]'::jsonb
additional_service_ids      JSONB NOT NULL DEFAULT '[]'::jsonb

-- Facturación por contrato
payment_method              VARCHAR(30)
billing_cycle               VARCHAR(20)
fiscal_name                 VARCHAR(200)
fiscal_document             VARCHAR(30)
fiscal_address              VARCHAR(255)

-- Relajar FK: contrato puede crearse sin quote (conversión desde expediente o venta directa)
ALTER COLUMN quote_id DROP NOT NULL
```

Enum `ContractStatus` — agregar:

```
ARCHIVED = 'ARCHIVED'
```

Máquina de estados:

```
DRAFT ──firmar──▶ ACTIVE ──suspender──▶ SUSPENDED ──archivar──▶ ARCHIVED
  │                 │                       │
  │                 └──terminar──▶ TERMINATED
  └──descartar──▶ (delete)
```

Transiciones permitidas:

| Desde | A | Acción |
|---|---|---|
| DRAFT | ACTIVE | firmar |
| DRAFT | — | eliminar (delete físico/soft) |
| ACTIVE | SUSPENDED | suspender |
| ACTIVE | TERMINATED | terminar |
| SUSPENDED | ACTIVE | reactivar |
| SUSPENDED | ARCHIVED | archivar |
| SUSPENDED | TERMINATED | terminar |
| TERMINATED | ARCHIVED | archivar |
| ARCHIVED | — | estado final |

## 5. Backend — endpoints (Fase 1)

```
POST   /crm/subscribers/:id/contracts                 Crear servicio (estado DRAFT)
GET    /crm/subscribers/:id/contracts                 Listar servicios del cliente
POST   /crm/subscribers/:id/contracts/from-expediente Convertir interés del expediente → DRAFT

GET    /crm/contracts/:contractId                      (ya existe)
PATCH  /crm/contracts/:contractId                      (amplía DTO con nuevos campos)
POST   /crm/contracts/:contractId/activate             DRAFT → ACTIVE (firma)
POST   /crm/contracts/:contractId/suspend              ACTIVE → SUSPENDED
POST   /crm/contracts/:contractId/reactivate           SUSPENDED → ACTIVE
POST   /crm/contracts/:contractId/terminate            ACTIVE|SUSPENDED → TERMINATED
POST   /crm/contracts/:contractId/archive              SUSPENDED|TERMINATED → ARCHIVED
DELETE /crm/contracts/:contractId                      Solo permitido en DRAFT
```

El endpoint `GET /crm/subscribers/:id/360` incorpora:

```ts
contracts: ContractSummary[]   // todos los contratos del subscriber (incluye archivados)
```

`ContractSummary` incluye alias, estado, planId, planSnapshot.name, dirección, segmento, counts de tickets/facturas (stubs 0 por ahora).

## 6. Validaciones backend

- Crear contrato: `subscriberId` válido y existente; si `quoteId` presente debe pertenecer al tenant y al subscriber.
- `alias` obligatorio; si viene vacío se autogenera server-side.
- Transición de estado solo por endpoints dedicados (no vía `PATCH`).
- No permitir editar `planId` después de `ACTIVE` sin flujo explícito de cambio de plan (fuera de alcance en esta fase → retornar 409 `CONTRACT_IMMUTABLE_AFTER_SIGN`).
- `customerSegment` del contrato: si null → hereda del subscriber en el response.
- Conversión `from-expediente`: el expediente debe existir y pertenecer al tenant; no validamos "doble conversión" (un mismo expediente puede generar múltiples contratos sucesivos).

## 7. Frontend — Fase 2

### Tab Servicios — estructura

```
[ Vista general | Facturación | Tributario | Servicios ← | Financiero | … ]

┌─ Servicios contratados ────────────────────────────────────┐
│                                            [+ Nuevo servicio] │
│                                                              │
│  ┌── Hogar Cra 10 ─────────────── ACTIVO · RESIDENTIAL ─┐   │
│  │  Plan Fibra 300 Mbps           $120.000/mes           │   │
│  │  + Router WiFi 6 · + Decodificador TV                 │   │
│  │  Cra 10 #23-45, Bogotá                                │   │
│  │  Ciclo mensual · PSE                                  │   │
│  │                                   [Ver detalle]  [⋮] │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌── Local Centro ──────────────── ACTIVO · PYME ───────┐   │
│  │  …                                                    │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘

▾ Interés comercial original (expediente)  — colapsable, lectura
   Plan de interés · Productos · Notas
```

### Estados vacíos

- **Sin contratos + con interés en expediente:** banner prominente _"Este cliente tiene interés registrado en el expediente de origen. ¿Convertirlo en servicio contratado?"_ con CTA **"Convertir a contrato"**.
- **Sin contratos + sin interés:** CTA **"+ Nuevo servicio"** centrado.

### Componentes Fase 2

| Componente | Responsabilidad |
|---|---|
| `ServiciosTab` (refactor) | Orquesta sección. Consume `contracts` del 360 + fallback a expediente. |
| `ContractCard` | Tarjeta de servicio en lectura con nombre, plan, add-ons resueltos del catálogo, dirección, segmento, facturación, estado. Acciones: Ver detalle, menú (Suspender/Reactivar/Terminar/Archivar). |
| `ConvertExpedienteToContractDialog` | Confirma conversión con datos pre-rellenados del expediente. |
| `ContractDetailDrawer` | Drawer lateral con detalle completo en lectura del contrato (lectura para Fase 2; edición real entra en Fase 4). |
| `ServicesExpedienteFallback` | Bloque colapsable de interés del expediente. |

### Filtros visibles

Chips por estado: `Todos · Activos · Borradores · Suspendidos · Archivados`. Default: todos excepto `ARCHIVED`.

## 8. Búsqueda en catálogos grandes — Fase 3

**Se pospone.** Cuando entre Fase 3 se construye `CatalogPicker<T>` con búsqueda, agrupación y filtros. En Fase 2 la creación/edición de contrato usa selectores simples heredados del patrón actual, porque el volumen esperado de catálogo por tenant es todavía manejable.

## 9. Fuera de alcance (Fases futuras)

- **Fase 3:** `CatalogPicker<T>` reusable + modo edición avanzado en drawer.
- **Fase 4:** formularios completos de creación/edición con `react-hook-form` + `zod`.
- **Futuro:** tickets por contrato, facturación emitida, provisioning técnico, histórico de cambios de plan.

## 10. Criterios de aceptación

### Fase 1 (backend)

- [ ] Migración 028 aplicada en los tenants; `quote_id` acepta `NULL`; campos nuevos presentes.
- [ ] `ContractStatus` incluye `ARCHIVED`.
- [ ] Endpoints listados en §5 funcionales, con guards de rol coherentes con el resto de `contracts`.
- [ ] Transiciones inválidas retornan `409 INVALID_STATE_TRANSITION`.
- [ ] `GET /crm/subscribers/:id/360` incluye `contracts[]`.
- [ ] Tests unitarios de servicio + integración de controller (transiciones + validaciones).
- [ ] Cobertura ≥ 80% en archivos tocados.
- [ ] OpenAPI actualizado.

### Fase 2 (frontend)

- [ ] Tab Servicios lista contratos desde `subscriber360.contracts`.
- [ ] `ContractCard` resuelve nombres y descripciones del catálogo (plan, productos, servicios).
- [ ] Acciones de estado funcionan y refrescan lista.
- [ ] Conversión desde expediente genera contrato DRAFT con datos pre-rellenados.
- [ ] Fallback al interés del expediente cuando no hay contratos.
- [ ] Accesibilidad: navegación por teclado, roles ARIA, contraste AA.
- [ ] Sin `any`, sin strings hardcodeadas que violen i18n de UI copy.

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Migración rompe contratos existentes (quote_id NOT NULL → NULL con datos previos). | `DROP NOT NULL` es seguro; ningún contrato existente pierde su FK. |
| Conversión expediente→contrato duplica servicios accidentalmente. | No bloqueamos por diseño (D1); la UI pide confirmación explícita. |
| `alias` autogenerado sin dirección queda feo. | Fallback: `"Servicio del {fechaCreación}"`. |
| Ampliar DTO de update abre puerta a mutar `planId` indebidamente. | Validación explícita en servicio: planId inmutable post-ACTIVE (§6). |

## 12. Plan de trabajo

**Fase 1 — Backend (bloqueante):**

1. Migración 028 (tenant).
2. Entidad + enum + DTOs.
3. Servicio: crear, listar por subscriber, transiciones, from-expediente.
4. Controller: nuevos endpoints + guards.
5. Integrar en 360.
6. Tests unit + integration.
7. OpenAPI.

**Fase 2 — Frontend:**

8. Extender tipos en api-client.
9. `ContractCard` + `ServiciosTab` refactor.
10. `ConvertExpedienteToContractDialog`.
11. `ContractDetailDrawer` (lectura).
12. Acciones de estado + refresh.
13. Filtros + estados vacíos.

**Fase 3 y 4 quedan fuera de este spec.** Se abren especificaciones separadas.
