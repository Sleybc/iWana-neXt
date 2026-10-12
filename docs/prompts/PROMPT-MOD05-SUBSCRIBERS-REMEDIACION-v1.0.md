# PROMPT DE EJECUCIÓN — MOD05/MOD08 Suscriptores · Remediación de cumplimiento

**Version:** 1.0
**Estado:** **Superado** el 2026-10-12 por [v1.1](PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.1.md) (re-sync de C-API-2 y C-NORM-1). Se conserva porque B1 cerró contra esta versión y la v1.1 remite a sus secciones sin cambios
**Fecha:** 2026-10-11
**Plantilla:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) (en revisión)
**Emisor:** AI-EM-ARCH (modo Orchestrator)
**Informe de origen:** [INFORME-MOD05-SUBSCRIBERS-AUDITORIA-CUMPLIMIENTO-v1.0.md](../informes/INFORME-MOD05-SUBSCRIBERS-AUDITORIA-CUMPLIMIENTO-v1.0.md)
**Plan:** [2026-10-11-mod05-subscribers-remediacion-cumplimiento.md](../plans/2026-10-11-mod05-subscribers-remediacion-cumplimiento.md)
**Agentes destinatarios:** `data-eng` · `sr-backend` · `fe-platform` · `prod-ux` · `sec-eng` · `sr-qa`

---

## 0. Cómo se usa este prompt

Cada agente ejecuta **solo su bloque** (§3). Los bloques de una misma ola corren en paralelo contra los contratos congelados de §2. Un cambio de contrato es el único evento que fuerza re-sync y se coordina vía AI-EM-ARCH: se versiona este prompt y se notifica; **nunca se parchea en silencio**. Si algo no se resuelve dentro de la sesión, emitir `[BLOQUEO]` antes de cerrarla.

## 1. Entradas obligatorias (leer en este orden)

1. `AGENTS.md`.
2. El informe de origen, §2 (matriz ADR), §5 (hallazgos) y §6 (propuestas).
3. ADR-027, ADR-030 (l.97), ADR-052, ADR-058, ADR-067 — completos.
4. `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md` y `docs/hlds/HLD-MOD08-PARTIES-v1.0.md`.
5. Los `SKILL.md` que el plan asigna a tu bloque (`.agents/skills/<nombre>/SKILL.md`, como documentación).

## 2. Contratos congelados

| ID | Contrato | Productor | Consumidores |
| --- | --- | --- | --- |
| **C-DDL-1** | Columnas e índices del informe §6.1, §6.2 (SQL) y §6.4 (`uq_subscribers_expediente`, `crm_conversion_failures`). Más: `subscribers.whatsapp` → `whatsapp_encrypted varchar(500)` + `whatsapp_hmac varchar(64)` | `data-eng` (B1) | B5 |
| **C-API-1** | `POST /crm/subscribers/search`, cuerpo `{ documentNumber?, nit?, email?, phone? }` (al menos uno, Zod en `@iwana/shared`), respuesta `{ data: SubscriberListItem[] }`. **Se elimina** `GET /crm/subscribers/search` | `sr-backend` (B2) | `fe-platform` (B3) |
| **C-API-2** | `SubscriberListItem` en `@iwana/shared` = proyección del listado: campos no personales + los de `SUBSCRIBER_LIST_FIELD_PURPOSE` (informe §6.3). **No** incluye `birthDate`, `legalRepresentativeId`, `manualOverrideReason`, `externalId`, `createdBy` | `sr-backend` (B2) | B3, B6 |
| **C-PORT-1** | `IPartyWritePort.ensurePartyWithRole` sin cambio de firma; `EnsurePartyInput.documentNumber` es **siempre texto plano** y el adaptador normaliza, cifra y calcula HMAC | `sr-backend` (B5) | CRM, MOD12 Compras |
| **C-NORM-1** | `normalizeDocumentNumber(type, raw)` en `@iwana/shared`: CC/CE/NIT/TI → solo dígitos; PASAPORTE/PEP/PTP → alfanumérico en mayúsculas sin espacios | `data-eng` (B1) — lo necesita el backfill | B2, B5 |

## 3. Bloques

### B1 · `data-eng` · Ola 1 — DDL y backfill (SUB-C01, A03, M01, M08, M09, B01)

1. Migración tenant con C-DDL-1, reversible, `up/down/up` probado sobre un tenant con datos.
2. `uq_subscribers_expediente`: el `up()` primero cuenta duplicados; si hay, **aborta** con reporte (no fusiona).
3. Backfill de `party.document_number` como CLI tenant-aware, idempotente, con `--dry-run`: distingue ciphertext (`^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$`), `NODATA-*` y texto plano; cifra lo plano; calcula HMAC con C-NORM-1; emite **reporte de candidatos a fusión** sin fusionar. Igual para `party_contact.value` y `subscribers.whatsapp`.
4. Índice trigram del informe §6.2 con `public.gin_trgm_ops` (patrón de `tenant/084`).
5. `C-NORM-1` en `@iwana/shared` con tests unitarios.
**Fuera de alcance:** servicios NestJS, relajar `NOT NULL` de contacto (espera E-3), Habeas Data.
**Stop/go:** migración y backfill con test integrado contra Postgres real (conteo real); reporte de dry-run sobre el seed de desarrollo adjunto al informe del bloque.

### B2 · `sr-backend` · Ola 1 — Superficie PII del suscriptor (SUB-C02, A05 parcial, A08, M06, M11)

1. C-API-1: `POST /crm/subscribers/search`; eliminar el `GET`. Registrar `LIST_ACCESS` **awaited** con el criterio como `"(aplicado)"`.
2. `?search=` del listado: mover al cuerpo del mismo patrón o limitar a filtros no personales; escapar `%` y `_`.
3. `subscriber-projection.ts` con `SUBSCRIBER_LIST_FIELD_PURPOSE` y un `SubscriberListFieldRoleMap` cuyo **valor por defecto** es la proyección actual menos los campos sin finalidad (C-API-2). El listado sirve `SubscriberListItem`; `GET :id` y `/360` siguen sirviendo la ficha.
4. `GET :id` y `GET :id/360` registran `RECORD_ACCESS` awaited, sin datos leídos. `LIST_ACCESS` deja de ser `void`.
5. Diff de auditoría de `update` sin valores personales (informe §6.6).
6. Citar ADR-067 en el `.github/instructions` que aplique a `apps/api/src/modules/crm/**`.
**Fuera de alcance:** `subscriber-creation.service.ts`, parties, DDL, Habeas Data, reglas IVA.
**Stop/go:** tests HTTP: el `GET /search` responde 404; ningún `@Query` del controlador recibe campos personales; `audit_logs` sin PII tras un `update`; conteo real de suites/tests.

### B3 · `fe-platform` · Ola 1 — Consumo del contrato (SUB-C02)

1. `apps/portal/src/lib/api-client.ts` `subscribers.search` → `POST` con cuerpo (C-API-1).
2. Ajustar consumidores (`TaskCoreFields` y listados) a `SubscriberListItem` (C-API-2); nada de la UI lee campos retirados.
**Fuera de alcance:** cambios visuales, copy, rediseño del listado.
**Stop/go:** `pnpm --filter portal test` con conteo real; `grep` sin `URLSearchParams` con campos personales en `api-client.ts`.

### B4 · `prod-ux` · Ola 1 — Mapa campo × rol (ADR-067 §9)

Proponer, contra el PRD del módulo y ADR-083, qué campos de `SUBSCRIBER_LIST_FIELD_PURPOSE` ve cada uno de los 7 roles de lectura, y si el listado debe **mostrar** el documento (premisa de ADR-067 hoy no materializada en `SubscribersListClient.tsx:516`). Salida: `docs/specs/2026-10-11-mod05-subscriber-list-field-role-map.md`. AI-EM-ARCH lo ratifica; no lo aprueba el productor.
**Fuera de alcance:** código, diseño visual.

### B5 · `sr-backend` · Ola 2 — Identidad y conversión (SUB-C01, A01, A02, A03, A04, M01, M04, M07)

Arranca cuando B1 está en `main` y B2 cerró (comparten `subscribers.service.ts`).
1. Adaptador de `IPartyWritePort` según C-PORT-1; `PartyService.create` y `findByDocument` buscan por HMAC.
2. CRM usa **solo** `IPartyWritePort`, dentro de la transacción del `INSERT` del suscriptor, en la conversión **y** en `POST /crm/subscribers`. Retirar los imports de `PartyService`/`PartyRoleService`.
3. `emitPipelineEventSafely` registra en `crm_conversion_failures`; endpoint administrativo idempotente de reintento con permiso `CRM_SUBSCRIBERS_MANAGE`.
4. Reactivación: transición `CANCELLED → PROSPECT` solo con motivo `EXPEDIENTE_REACTIVATED` del mismo expediente, auditada; `reactivate` re-emite el evento del estado restaurado.
5. Violación de `uq_subscribers_expediente` = conversión idempotente (devuelve el existente).
6. Cifrar `whatsapp` con las columnas de C-DDL-1; propagar el DV del NIT desde el expediente y validarlo (módulo 11).
7. Placeholders: **solo** si E-3 está decidido; si no, se conservan y se registra `[BLOQUEO]` parcial.
**Fuera de alcance:** reglas IVA, Habeas Data, `TaxRegime`.
**Stop/go:** test integrado contra Postgres real de: dedupe por documento con formato distinto (`1.234.567` = `1234567`), carrera de dos conversiones simultáneas, reactivación completa hasta `ACTIVE`, fallo registrado y reintentado.

### B6 · `sr-backend` · Ola 2 — Aplicar el mapa ratificado

Solo `subscriber-projection.ts` y sus tests, con el mapa de B4 **ratificado**. Paralelo a B5 (no comparten archivos).

### B7 · `sec-eng` · Cierre — Revisión del diff completo

Solo lectura. ASVS L2 sobre PII, tenancy y auditoría; verificar SUB-C01, C02, A04, A05, A08 cerrados contra el código. Hallazgo que exija código = bloque nuevo para el dueño del área.

### B8 · `sr-qa` · Cierre — Evidencia y trazabilidad

Matriz hallazgo ↔ test; cobertura ≥ 80 % en `crm/subscribers`, `parties` con conteo real sin caché; ningún test que mockee `runInTenantSchema` completo cuenta como evidencia de DDL.

### No despachables hasta decisión del CTO

- **Habeas Data** (SUB-A06, A07, B03): espera E-2 → versión 1.1 de este prompt.
- **Fiscal** (SUB-C03, M03, M05): espera E-1 → ADR sucesor de ADR-025 → versión 1.2.

## 4. Restricciones no negociables

1. Modulith: CRM no toca tablas `party*`; Parties no conoce CRM.
2. Tenant desde el JWT; todo acceso por `runInTenantSchema`.
3. PII nunca en logs, errores, URLs, query strings, cursores ni `audit_logs`.
4. Migraciones versionadas y reversibles; ninguna fusión automática de identidades.
5. Sin dependencias nuevas, sin BullMQ en la conversión (ADR-027).
6. Solo `pnpm`.

## 5. Entregables documentales

Cada bloque cierra con su informe `docs/informes/INFORME-MOD05-SUBSCRIBERS-REMEDIACION-{B#}-v1.0.md`: entregables por ruta, evidencia con conteo real, deuda nueva por severidad, `[BLOQUEO]` si los hubo.

## 6. Criterio de salida

Checklist del informe de origen §8, ítems 2, 3, 5, 6 y 7 en verde; SEC-ENG GO; SR-QA con matriz completa. Los ítems 4, 8 y 9 cierran con las versiones 1.1/1.2.
