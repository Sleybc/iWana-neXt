# PRD - MOD12 Proveedores (Alta y gestion de proveedores)

**Version:** 1.0
**Fecha:** 2026-07-11
**Estado:** Aprobado
**Modo activo:** Product Architect + Architect
**Responsable:** AI-EM-ARCH
**Aprobado por:** CTO
**Modulo:** MOD12 Inventario / SCM
**Submodulo:** Compras
**ADR de decision:** docs/adrs/ADR-052-Alta-Proveedores-SupplierProfile-Puerto-Comando-Parties.md
**ADR base (identidad):** docs/adrs/ADR-030-Modelo-Party-Multi-Rol.md

---

## 1. Contexto y motivacion

El submodulo de Compras de MOD12 ya opera sobre proveedores en todo su ciclo (RFQ, cotizacion, orden de compra, recepcion, proveedor preferido del articulo), pero **siempre asumiendo que el proveedor ya existe** en el maestro de terceros (MOD08 Parties) como `Party` con rol `SUPPLIER`, referenciado por `party_ref_id`. Hoy **no hay forma de darlo de alta ni de gestionar su ficha comercial** desde el producto: los selectores (`SupplierPicker`, `SupplierMultiPicker`) solo pueden elegir proveedores que ya esten en el maestro por alguna via externa.

Este PRD define el **Alta y gestion de proveedores**: crear/reutilizar la identidad del proveedor (Party + rol SUPPLIER) y administrar su **perfil comercial de compra** (`SupplierProfile`), cerrando el paso previo a todo el flujo de compras. Es la realizacion del `supplier_profile` que ADR-030 D5 dejo "futuro, en Purchasing" y del caso de uso "el futuro comprador creara `Party` + rol `SUPPLIER` + `SupplierProfile`" del PRD Taxation+Parties §7.

## 2. Alcance

### En scope

- Alta de proveedor: crear o **reutilizar** un `Party` por documento y asignarle rol `SUPPLIER`, mas la creacion de su `SupplierProfile`.
- Gestion del perfil comercial: condiciones de pago, moneda, incoterm por defecto, lead time por defecto, contacto de compras, notas.
- Estado de habilitacion del proveedor: `ACTIVE | INACTIVE | BLOCKED`.
- Listado, detalle, edicion de campos comerciales y cambio de estado.
- Codigo legible de proveedor (`PROV-NNNNNN`).
- Pestana "Proveedores" en la UI de Inventario del portal.
- Contrato de escritura `IPartyWritePort` (propiedad de Parties) para asegurar identidad de forma atomica.

### Fuera de scope

- Tabla `suppliers` de identidad propia (descartada por ADR-030).
- Edicion de datos de identidad (documento, razon social, contactos base) desde Compras: se hace en Parties.
- Datos bancarios del proveedor / PII financiera (escalado al CTO; diferido a tesoreria).
- Scoring / evaluacion avanzada de proveedores (fuera del PRD de Compras vigente).
- Contratos marco de compras.
- Portal de proveedor / autogestion del proveedor.
- Deduplicacion automatica de terceros (Parties v1 solo hace merge manual).
- Reglas de retencion en la fuente / autorretencion (aplican en OC/pago; requieren fuente oficial DIAN).

## 3. Personas y casos de uso

- **Comprador / Almacenista (rol operativo PURCHASER/ADMIN_SCM, mapeado a ADMIN/NOC/SUPPORT en v1).**
  - CU-01: Dar de alta un proveedor nuevo (no existe en el maestro): captura documento, identidad y condiciones comerciales.
  - CU-02: Dar de alta como proveedor a un tercero que **ya existe** (p. ej. ya es cliente): busca por documento, reutiliza identidad y solo agrega rol + perfil.
  - CU-03: Consultar el listado de proveedores y abrir la ficha de uno.
  - CU-04: Editar condiciones comerciales de un proveedor (plazo de pago, contacto de compras, lead time).
  - CU-05: Inactivar o bloquear un proveedor para que no se pueda usar en nuevas compras.
- **Administrador tenant.** Igual que el comprador, con acceso total al submodulo.
- **Sistema (RFQ / Cotizacion / OC / Articulo).** Consume proveedores habilitados via los pickers y el `party_ref_id`; sin cambios de contrato para los consumidores existentes.

## 4. Requerimientos funcionales (RF-PROV)

- **RF-PROV-01.** El sistema permite dar de alta un proveedor capturando: tipo y numero de documento, tipo de tercero (`NATURAL | ORGANIZATION`), nombre a mostrar, razon social opcional, contactos opcionales (email/telefono), y campos comerciales opcionales.
- **RF-PROV-02.** El alta es **idempotente por documento**: si `(documentType, documentNumber)` ya existe como `Party`, se reutiliza la identidad y solo se agrega el rol `SUPPLIER` (si falta) y el `SupplierProfile`. No se duplica identidad.
- **RF-PROV-03.** Un mismo `Party` puede tener rol `SUPPLIER` y otros roles (`CUSTOMER`, etc.) simultaneamente (ADR-030 CA-05).
- **RF-PROV-04.** El alta es **atomica**: si falla la creacion del perfil, no queda un Party/rol huerfano de la operacion; si falla el aseguramiento de identidad, no se crea perfil.
- **RF-PROV-05.** Cada proveedor recibe un `supplier_code` unico por tenant, patron `PROV-NNNNNN`, autogenerado; colision se resuelve con el siguiente numero libre.
- **RF-PROV-06.** El sistema impide crear **dos perfiles** de proveedor para el mismo `Party` (unico `(tenant_id, party_ref_id)`); el intento devuelve 409 con mensaje en espanol.
- **RF-PROV-07.** El perfil comercial admite: `payment_terms_days`, `currency`, `incoterm`, `default_lead_time_days`, `purchasing_contact_name/email/phone`, `notes`. Todos opcionales.
- **RF-PROV-08.** El proveedor tiene estado `ACTIVE | INACTIVE | BLOCKED`. Solo los `ACTIVE` se ofrecen para nuevas compras; `BLOCKED`/`INACTIVE` permanecen visibles en historico.
- **RF-PROV-09.** El sistema lista proveedores con filtro por estado y busqueda por texto (nombre/documento/codigo), paginado.
- **RF-PROV-10.** La ficha de proveedor muestra identidad (resumen desde Parties) + perfil comercial + estado.
- **RF-PROV-11.** La edicion desde Compras modifica **solo** campos comerciales y estado; la identidad se edita en Parties.
- **RF-PROV-12.** Todas las operaciones CUD son auditadas (`AuditInterceptor`).
- **RF-PROV-13.** Los consumidores existentes (RFQ, cotizacion, OC, proveedor preferido del articulo, pickers) siguen funcionando sin cambios de contrato.

## 5. Requerimientos no funcionales (NFR)

- **NFR-01.** Listado de proveedores < 200 ms p95 con 500 registros.
- **NFR-02.** Busqueda de proveedor por documento/codigo < 100 ms p95.
- **NFR-03.** `documentNumber` cifrado en `Party`; el `SupplierProfile` no duplica PII de identidad; sin PII/secretos en logs.
- **NFR-04.** Aislamiento tenant garantizado por `search_path` en transaccion; test de isolation obligatorio.
- **NFR-05.** Cobertura >= 80% en servicios y controllers nuevos del submodulo.
- **NFR-06.** OpenAPI actualizado antes de cerrar la fase.
- **NFR-07.** Alta atomica bajo transaccion tenant unica.

## 6. Modelo de datos (borrador)

Detalle en ADR-052 §D1. Resumen:

- **`supplier_profiles`** (nueva, schema tenant): `id`, `tenant_id`, `party_ref_id` (ref logica MOD08, unico por tenant), `party_role_id` (ref logica), `supplier_code` (unico por tenant, `PROV-NNNNNN`), `payment_terms_days?`, `currency?`, `incoterm?`, `default_lead_time_days?`, `purchasing_contact_name/email/phone?`, `status` (`supplier_profile_status`), `notes?`, `created_by_user_id?`, `created_at`, `updated_at`.
  - Unicos: `(tenant_id, party_ref_id)`, `(tenant_id, supplier_code)`. Indice: `(tenant_id, status)`.
- **Enum** `SupplierProfileStatus { ACTIVE, INACTIVE, BLOCKED }` en `packages/shared`.
- **Sin cambios** en `party`, `party_role`, `party_contact` (se consumen via puerto). No hay FK cross-module.

## 7. Contratos API (borrador)

Ver ADR-052 §D4. Bajo `/purchasing`, Zod, multi-tenant, roles ADMIN/NOC/SUPPORT:

- `POST /purchasing/suppliers` — alta (asegura Party + rol SUPPLIER + crea SupplierProfile).
- `GET /purchasing/suppliers` — listado paginado (filtro estado/texto).
- `GET /purchasing/suppliers/:partyRefId` — detalle (perfil + resumen identidad).
- `PATCH /purchasing/suppliers/:partyRefId` — editar campos comerciales.
- `POST /purchasing/suppliers/:partyRefId/status` — activar / inactivar / bloquear.
- `GET /purchasing/providers` y `.../summary` (existentes) — se conservan para los pickers.

Puerto de comando (interno, no HTTP): `IPartyWritePort.ensurePartyWithRole(input, SUPPLIER, { manager })` — propiedad de MOD08 Parties.

## 8. Criterios de aceptacion

- **CA-01.** Se crea un proveedor nuevo (Party + rol SUPPLIER + SupplierProfile) en una sola operacion atomica.
- **CA-02.** Dar de alta como proveedor a un tercero existente por documento **reutiliza** el Party (no duplica identidad) y agrega rol + perfil.
- **CA-03.** Intentar crear un segundo perfil para el mismo Party devuelve 409 en espanol.
- **CA-04.** `supplier_code` se autogenera unico por tenant con patron `PROV-NNNNNN`.
- **CA-05.** El listado filtra por estado y busca por texto, paginado; la ficha muestra identidad + perfil.
- **CA-06.** Editar desde Compras cambia solo campos comerciales/estado; no altera identidad.
- **CA-07.** Un proveedor `BLOCKED`/`INACTIVE` no se ofrece para nuevas compras pero permanece en historico.
- **CA-08.** Compras no accede a tablas `party*`: toda escritura de identidad pasa por `IPartyWritePort` (verificado por revision de imports / test de arquitectura).
- **CA-09.** Migracion `063` aplica y revierte en DB de test.
- **CA-10.** Aislamiento tenant probado (`*.isolation.spec.ts`).
- **CA-11.** Cobertura >= 80% en servicios/controllers nuevos.
- **CA-12.** OpenAPI actualizado y cliente del portal alineado.
- **CA-13.** Los flujos existentes (RFQ, cotizacion, OC, pickers) siguen funcionando sin regresion.

## 9. Dependencias y riesgos

**Dependencias:**
- MOD08 Parties operativo (`PartyService`, `PartyRoleService`, `PartyContactService`, `IPartyReadPort`) — presente.
- `SupplierPartyPort` de Compras (lectura) — presente.
- Aprobacion CTO de ADR-052 (nuevo boundary de escritura + schema).

**Riesgos:**
| Riesgo | Mitigacion |
| --- | --- |
| Alta no atomica deja Party sin perfil o rol sin identidad | Puerto de comando opera sobre el `EntityManager` del llamante; test de rollback |
| Compras rompe boundary escribiendo tablas de Parties | `IPartyWritePort` + adapter en Parties; test de arquitectura/imports; revision AI-SEC-ENG |
| Proveedores "solo identidad" vs "con perfil" coexistiendo | Listado de gestion basado en `SupplierProfile`; backfill opcional posterior |
| PII de datos bancarios | Fuera de v1 (escalacion CTO opcion a) |
| Mapeo de rol PURCHASER | ADMIN/NOC/SUPPORT en v1; permiso gobernado en fase posterior sin enum ad hoc |

## 10. Definicion de hecho (DoD)

- Lint + typecheck + tests verdes; cobertura core >= 80%.
- Migracion `063` aplica y revierte.
- Alta atomica y reutilizacion por documento verificadas en integracion.
- OpenAPI actualizado; cliente del portal alineado; vocabulario en espanol; sin enums crudos en UI.
- Sin PII/secretos en logs; auditoria activa; test de isolation en verde.
- Boundary verificado (Compras no toca tablas de Parties).
- Informe vivo de fase creado en `docs/informes/` y checklist del modulo actualizado al cierre.

---

## Referencias

- AGENTS.md
- docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md
- docs/adrs/ADR-052-Alta-Proveedores-SupplierProfile-Puerto-Comando-Parties.md
- docs/adrs/ADR-030-Modelo-Party-Multi-Rol.md
- docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md
- docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md
- docs/prds/PRD-TAXATION-PARTIES-COMMERCIAL-REDESIGN-v1.0.md
- docs/hlds/HLD-MOD08-PARTIES-v1.0.md
- docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md
