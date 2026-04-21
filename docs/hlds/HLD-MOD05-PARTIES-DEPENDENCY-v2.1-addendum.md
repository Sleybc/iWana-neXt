---
title: "Addendum HLD MOD05 — Subscriber como perfil especializado sobre Party"
version: "2.1-addendum"
owner: "Arquitectura de Soluciones"
date: "2026-04-21"
status: "Aprobado"
approvedAt: "2026-04-21"
approvedBy: "CTO Humano"
classification: "Confidencial — Uso Interno"
module: "MOD05"
parentDocument: "HLD-MOD05-ARQUITECTURA-v2.0.md"
references:
  - docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md
  - docs/adrs/ADR-030-Modelo-Party-Multi-Rol.md
  - docs/adrs/ADR-025-Subscriber-Modelo-Dos-Dimensiones.md
  - docs/hlds/HLD-MOD08-PARTIES-v1.0.md
---

# Addendum HLD-MOD05 — Subscriber evoluciona a perfil especializado sobre Party

Este addendum complementa `HLD-MOD05-ARQUITECTURA-v2.0.md`. No lo reemplaza.

## 1. Impacto del ADR-030

`Subscriber` deja de ser el registro de identidad del cliente. La identidad pasa a `Party` en MOD08. `Subscriber` queda como **perfil especializado** del rol `CUSTOMER`.

## 2. Qué se conserva en Subscriber

- Dimensiones fiscales de cliente: `personType`, `stratum` (ADR-025 intacto).
- `customerSegment` (RESIDENTIAL, SOHO, PYME, CORPORATE, GOVERNMENT, WHOLESALE).
- Datos comerciales, SLAs aplicables, vínculo a Expediente Único.
- Estados propios del ciclo comercial (CLIENTE_ACTIVO, etc.).

## 3. Qué se delega a Party

- `documentType`, `documentNumber`, `displayName`, `legalName`, fecha de nacimiento o constitución.
- Contactos (email, teléfono, dirección) a `party_contact`.
- Multi-rol: un mismo Party puede ser `CUSTOMER` y también `SUPPLIER`, `EMPLOYEE` u otros.

## 4. Cambios físicos

- `Subscriber` gana columna `partyId: UUID` (not null tras migración).
- Se planifica migrar contactos de Subscriber a `party_contact` de forma aditiva.
- El `userId` opcional actual se complementa con `UserAccount.partyId`.

## 5. Consumo

- CRM consume `IPartyReadPort` para datos maestros.
- CRM ya no actualiza documento ni nombre legal desde su propio controller; redirige a PartiesModule.
- El `SubscriberTaxProfile` (valores de `personType`, `stratum`) permanece en CRM; no migra a Parties ni a Taxation.

## 6. Migración

Multi-fase aditiva (detalle en HLD-MOD08 §7). CRM mantiene su API actual durante la transición. Cuando Parties es dueño estable de la identidad, el dashboard de ficha 360° agrega datos de Party + Subscriber sin duplicar campos.

## 7. Impacto en boundaries

- CRM no consulta tablas de Parties directamente; solo puerto.
- Parties no conoce lógica comercial ni fiscal; solo identidad.

## 8. Pendientes

- Spec operativa de migración por fases, incluida en `docs/superpowers/specs/2026-04-21-parties-multi-rol-design.md`.
- ADR operativo para renombre físico de `users` → `user_accounts` si se confirma.

## 9. Referencias

- ADR-030, ADR-025
- HLD-MOD08-PARTIES-v1.0.md
