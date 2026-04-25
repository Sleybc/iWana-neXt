---
title: "Addendum PRD v2.3 → incorporación de Taxation (MOD07) y Parties (MOD08)"
version: "1.0"
owner: "Arquitectura de Soluciones / Producto"
date: "2026-04-21"
status: "Aprobado"
approvedAt: "2026-04-21"
approvedBy: "CTO Humano"
classification: "Confidencial — Uso Interno"
parentDocument: "PRD_Sistema_ISP_Colombia_v2_3.md"
references:
  - docs/prds/PRD_Sistema_ISP_Colombia_v2_3.md
  - docs/adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md
  - docs/adrs/ADR-030-Modelo-Party-Multi-Rol.md
  - docs/adrs/ADR-031-Rediseno-Tributario-Comercial-Impuestos-Reglas-Simulador.md
  - docs/hlds/HLD-MOD07-TAXATION-v1.0.md
  - docs/hlds/HLD-MOD08-PARTIES-v1.0.md
---

# Addendum PRD — Taxation (MOD07) y Parties (MOD08)

Este addendum extiende el PRD maestro v2.3 sin reemplazarlo. Se consolidará en v2.4 cuando los ADRs referenciados estén aprobados y los HLDs en baseline.

## 1. Motivación de negocio

### 1.1 Catálogo unificado de impuestos

El tenant ISP requiere un único catálogo de impuestos por razones regulatorias y operativas: IVA, Retefuente, ReteICA, estampillas territoriales y tributos municipales custom. El mismo catálogo deberá ser consumido por ventas, compras (Phase 6), nómina y facturación electrónica. Sin un bounded context propio, cada módulo duplicaría el catálogo y la configuración fiscal.

### 1.2 Terceros multi-rol

Una misma persona u organización puede ser, al mismo tiempo, cliente, proveedor, empleado, contratista o vendedor. El modelo actual (User + Subscriber) no representa este escenario y, si no se corrige, forzará a Purchasing y RRHH a duplicar identificación, contactos y datos fiscales.

## 2. Nuevos requerimientos funcionales

### 2.1 Taxation (RF-TAX)

- **RF-TAX-01**: el sistema debe permitir al `TENANT_ADMIN` consultar el catálogo de impuestos del tenant, filtrando por contexto (`SALES`, `PURCHASE`, `BOTH`).
- **RF-TAX-02**: al provisionar un tenant, el sistema debe sembrar automáticamente presets de Colombia: IVA 19%, IVA exento, IVA excluido, Retefuente servicios, ReteICA y estampilla departamental placeholder, todos con `origin = SYSTEM`.
- **RF-TAX-03**: el tenant puede crear, editar, activar/desactivar impuestos `CUSTOM`. No puede editar ni eliminar presets `SYSTEM`; sí puede duplicarlos.
- **RF-TAX-04**: cada impuesto debe llevar `category`, `jurisdictionLevel`, `municipalityCode` opcional, `baseRate` opcional, `treatment` y `context`.
- **RF-TAX-05**: Commercial, Purchasing (futuro) y Billing (futuro) consumen el catálogo únicamente vía puerto `ITaxCatalogReadPort`. Ningún módulo accede a las tablas internas.
- **RF-TAX-06**: todas las operaciones CUD sobre el catálogo quedan auditadas.

### 2.2 Parties (RF-PAR)

- **RF-PAR-01**: el sistema debe mantener un maestro único de terceros por tenant, representando personas naturales y organizaciones.
- **RF-PAR-02**: un tercero puede tener N roles activos simultáneos del conjunto `CUSTOMER | SUPPLIER | EMPLOYEE | CONTRACTOR | SALES_AGENT`.
- **RF-PAR-03**: los roles se activan con `validFrom` y pueden desactivarse con `validTo` preservando historial.
- **RF-PAR-04**: cada tercero soporta múltiples contactos (email, teléfono, dirección) con marca de primario y verificación opcional.
- **RF-PAR-05**: las cuentas autenticadas (`UserAccount`) pueden vincularse opcionalmente a un `Party`. Cuentas operativas sin tercero conservan `partyId = null`.
- **RF-PAR-06**: el sistema evita duplicados mediante unique `(documentType, documentNumber)` activo. Los `MERGED` se preservan con referencia al tercero consolidado.
- **RF-PAR-07**: CRM, Purchasing y RRHH acceden al maestro únicamente vía `IPartyReadPort`.
- **RF-PAR-08**: las operaciones CUD quedan auditadas y respetan políticas PII.

## 3. Ajuste de alcance de módulos existentes

### 3.1 CRM (MOD05)

- Subscriber deja de ser dueño de la identidad del cliente; se convierte en perfil especializado del rol `CUSTOMER`.
- Conserva sus dos dimensiones (ADR-025): `personType` y `customerSegment`.
- Ficha 360° agrega datos de Party + Subscriber + Expediente.

### 3.2 Commercial (MOD06)

- Pierde ownership del catálogo tributario.
- Conserva ownership de las reglas de aplicación de impuestos a clientes.
- La pestaña tributaria se reestructura a Impuestos + Reglas de aplicación + Simulador (ADR-031).

### 3.3 Purchasing (Phase 6 — RF-PUR)

- Al implementarse, los proveedores se modelan como `Party` con rol `SUPPLIER` + `SupplierProfile`.
- Consume `ITaxCatalogReadPort` y define sus propias reglas de compras, sin mezclar con Commercial.

### 3.4 RRHH (Phase futura)

- Los empleados se modelan como `Party` + rol `EMPLOYEE` + `EmployeeProfile`.

## 4. Requisitos no funcionales

- **NFR-TAX-1**: el catálogo debe responder consultas de lectura en < 200 ms p95 para lista de hasta 200 definiciones.
- **NFR-PAR-1**: la búsqueda por `(documentType, documentNumber)` debe ser < 100 ms p95.
- **NFR-PAR-2**: contactos con PII se cifran o redactan según política definida en PRD v2.3 §13.

## 5. Restricciones y exclusiones

- Integración con DIAN, RUES y maestro DANE oficial: fuera de alcance en v1 de MOD07 y MOD08.
- Deduplicación automática avanzada: fuera de alcance en v1 de MOD08 (merge manual soportado).
- Renombre físico de `users` → `user_accounts`: se evalúa en ADR operativo posterior.

## 6. Roadmap

| Hito | Dependencia |
|---|---|
| Aprobación ADR-029, ADR-030, ADR-031 | CTO |
| HLD-MOD07-TAXATION-v1.0 en baseline | ADR-029 |
| HLD-MOD08-PARTIES-v1.0 en baseline | ADR-030 |
| Implementación MOD07 | HLD-MOD07 + plan de fase |
| Migración de catálogo desde Commercial | MOD07 listo |
| Implementación MOD08 fase 1 (esquema) | HLD-MOD08 + plan de fase |
| Migración backfill CRM → Parties | MOD08 fase 1 |
| Purchasing con Parties y Taxation desde día uno | MOD07 y MOD08 estables |

## 7. Referencias

- ADR-029, ADR-030, ADR-031
- HLD-MOD07-TAXATION-v1.0.md
- HLD-MOD08-PARTIES-v1.0.md
- PRD_Sistema_ISP_Colombia_v2_3.md
