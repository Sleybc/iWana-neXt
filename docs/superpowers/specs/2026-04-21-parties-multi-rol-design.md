# Diseño: Bounded Context Parties (MOD08) — Maestro de terceros multi-rol

**Fecha:** 2026-04-21
**Módulo:** MOD08 — PartiesModule
**Estado:** Aprobado para implementación (condicionado a aprobación de ADR-030)
**Autor:** AI-EM-ARCH (sesión de diseño colaborativo con CTO)
**Referencias:** ADR-030, ADR-025, ADR-024, HLD-MOD08-PARTIES-v1.0.md, HLD-MOD05-ARQUITECTURA-v2.0.md

---

## Resumen ejecutivo

Una misma persona u organización puede ser, al mismo tiempo, cliente, proveedor, empleado, contratista o vendedor. El modelo actual (`User` + `Subscriber`) no soporta este escenario. Se introduce `PartiesModule` (MOD08) como master de terceros del tenant con:

- `Party` — identidad maestra.
- `PartyContact` — contactos múltiples tipados.
- `PartyRole` — roles activos simultáneos con vigencia.
- `UserAccount` — cuenta autenticada (renombre semántico de `User`) con `partyId` opcional.

Los perfiles especializados por bounded context (`Subscriber`, `SupplierProfile`, `EmployeeProfile`) cuelgan de `Party`. `Parties` no conoce lógica de ventas, compras ni nómina.

---

## Decisiones de diseño

| Área | Decisión |
|---|---|
| Nombre del módulo | `PartiesModule` |
| Alcance v1 | Identidad + contactos + roles + vínculo a UserAccount |
| Deduplicación | Unique `(documentType, documentNumber)` activo; merge manual con `mergedIntoPartyId` |
| Integración externa | Fuera de v1 (RUES, DIAN) |
| Renombre físico `users → user_accounts` | ADR operativo separado; en v1 basta semántico + columna `partyId` |
| Multi-tenant | Schema del tenant, estándar del modulith |

## Modelo objetivo

Tres tablas nuevas en el schema del tenant (`party`, `party_contact`, `party_role`) + columna nueva `users.party_id`. Detalle en HLD-MOD08 §4.

Roles v1: `CUSTOMER | SUPPLIER | EMPLOYEE | CONTRACTOR | SALES_AGENT`.

## Contrato externo

```ts
interface IPartyReadPort {
  getById(id: string): Promise<PartySnapshot | null>;
  findByDocument(documentType: DocumentType, documentNumber: string): Promise<PartySnapshot | null>;
  listRoles(partyId: string): Promise<PartyRoleSnapshot[]>;
  listContacts(partyId: string): Promise<PartyContactSnapshot[]>;
}
```

CRM, Purchasing y RRHH consumen este puerto. No acceden a las tablas.

## Plan de migración multi-fase

Fase 1 — esquema. Crear tablas `party`, `party_contact`, `party_role`. Añadir `users.party_id`. Ningún flujo operativo cambia.

Fase 2 — backfill CRM. Por cada `Subscriber` activo crear su `Party`, asignar `party_role = CUSTOMER`, portar contactos primarios. Se preserva `subscriber.id` y se añade `subscriber.party_id`.

Fase 3 — backfill Users. Cada `User` con datos de tercero se enlaza a un `Party`. Cuentas operativas sin tercero conservan `partyId = null`.

Fase 4 — nueva escritura. Alta de cliente pasa por Parties. CRM reduce responsabilidades a perfil especializado.

Fase 5 — Purchasing y RRHH nacen directamente contra Parties.

Patrón consistente con ADR-024 (migración aditiva, preservación de datos, ventanas controladas por release).

## Tests y gates

- Unit: unicidad por documento, vigencia de roles, primary único por tipo de contacto.
- HTTP: aislamiento tenant, roles permitidos por endpoint.
- Integración: backfill reproducible en DB de test.
- Cobertura mínima: 80% en servicios core.
- Gate PII: no exponer `documentNumber` ni contactos en logs; cifrado según política PRD §13.

## Riesgos

- Coexistencia temporal de modelos: mitigada por feature flags y documentación de ventanas.
- Merge manual puede dejar residuos si no se ejecuta correctamente: se audita cada merge.
- Cambios en ficha 360° de Subscriber: se coordina con frontend en release conjunta.

## Pendientes para confirmar

- Decisión sobre renombre físico de tabla `users`: se trata en ADR operativo separado.
- Formato exacto de `documentType` para extranjeros y organizaciones no colombianas.
- Política fina de cifrado para contactos (nivel registro vs columna).

## Referencias

- ADR-030, ADR-025, ADR-024
- HLD-MOD08-PARTIES-v1.0.md
- HLD-MOD05-ARQUITECTURA-v2.0.md
