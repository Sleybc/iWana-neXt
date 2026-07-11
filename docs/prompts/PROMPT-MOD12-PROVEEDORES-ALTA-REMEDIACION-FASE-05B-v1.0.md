# PROMPT - MOD12 Proveedores Alta REMEDIACION Fase 05-B

**Version:** 1.0
**Estado:** Aprobado (remediacion de gate NO-GO)
**Fecha:** 2026-07-11
**Modo activo:** Ejecucion
**Generado por:** AI-EM-ARCH
**Ejecutor:** Sr. Dev Fullstack (AI-SR-FULL)
**Origen:** docs/informes/INFORME-MOD12-PROVEEDORES-ALTA-AUDITORIA-ARCH-v1.0.md
**Archivo destino:** `docs/prompts/PROMPT-MOD12-PROVEEDORES-ALTA-REMEDIACION-FASE-05B-v1.0.md`

---

## 1. Objetivo exacto

Cerrar los hallazgos de la auditoria de 2ª capa de la Fase 05 para habilitar el GO de cierre. No re-implementa la funcionalidad (que en su mayoria CUMPLE); corrige defectos funcionales, cierra gaps de prueba/evidencia y resuelve la desviacion de boundary del adapter. **Un unico commit atomico** que toque SOLO archivos de proveedores/MOD12 (mas Parties para M1).

## 2. Artefactos de entrada obligatorios

- `docs/informes/INFORME-MOD12-PROVEEDORES-ALTA-AUDITORIA-ARCH-v1.0.md` (fuente de los hallazgos)
- `docs/adrs/ADR-052-Alta-Proveedores-SupplierProfile-Puerto-Comando-Parties.md`
- `docs/prds/PRD-MOD12-PROVEEDORES-v1.0.md`
- `AGENTS.md`, `.github/instructions/{api,database,frontend,portal,testing}.instructions.md`
- Skills: `testing-patterns`, `e2e-testing-patterns`, `systematic-debugging`, `backend-security-coder`, `database-migration`.

## 3. Alcance exacto (por hallazgo)

### Bloqueantes de cierre

- **[A1] `party` null en el response de create.** Componer el `SupplierPartySummary` del `POST /suppliers` **sin** abrir una transaccion nueva sobre datos no confirmados: leer dentro del mismo `manager` transaccional, o componer el resumen desde el `EnsurePartyResult` + input ya conocidos, o resolver tras el commit. El response de alta debe traer `party` poblado. Test que lo pruebe contra servicio+DB reales.
- **[A3 + C2 + C3] Pruebas reales y evidencia.**
  - Reemplazar/añadir una **integracion HTTP real** (sin mockear `SupplierProfileService`) que ejercite alta nueva, **alta reutilizando** documento existente, y **409** por restriccion unica **real** (no `mockRejectedValue`).
  - Añadir `supplier-profile.isolation.spec.ts` que pruebe aislamiento cross-tenant (un tenant no ve/《no colisiona con》proveedores de otro; unicos por tenant).
  - Añadir **test de arquitectura/imports [M3]** que falle si `modules/inventory` importa entidades `party*`.
  - Adjuntar **evidencia** en `docs/quality/`: salida de `pnpm lint`, `pnpm typecheck`, `pnpm test` y **cobertura core >=80%** (reporte, no afirmacion).
  - Extender el E2E para cubrir **proveedor BLOCKED rechazado en RFQ/OC** (flujo extremo a extremo del DoD).
- **[M2] `supplier_code` idempotente.** Capturar tambien el 23505 de `uq_supplier_profiles_tenant_supplier_code` y reintentar con el siguiente numero libre (bucle acotado). Test de colision concurrente/simulada.
- **[M1] Delegacion del adapter (resolver revision AI-SEC-ENG).** Opcion preferida: que `PartyWriteAdapter.ensurePartyWithRole` delegue en `PartyService`/`PartyRoleService`/`PartyContactService` (usando un metodo `ensure`/`findOrCreate` que no lance en documento existente), operando sobre el `manager` transaccional. Si por diseno de esos servicios no es viable sin refactor mayor, **documentar la excepcion** en el ADR-052 (nota de implementacion) con visto bueno AI-SEC-ENG y test que garantice las reglas omitidas (unicidad de documento, normalizacion). No dejar la desviacion silenciosa.

### Reutilizacion de identidad (A2)

- Hacer real la reutilizacion en la UI: al hallar un tercero por documento, **fijar `documentType`/`partyType`/`legalName` desde el resultado** (no dejar NIT bloqueado), y **mostrar `SupplierSummaryCard`** del hallado para confirmar [B4]. 
- Decidir el contrato con el backend: **[DESEMPATE requerido — ver §6]** o bien anadir `partyRefId` opcional a `CreateSupplierDto` para enlace explicito, o bien fijar el dedupe backend por `(documentType, documentNumber)` como contrato unico y sincronizar el `documentType` en la UI. No dejar el aviso "Reutilizaremos su identidad" sin sustento.

### Correccion documental (obligatoria)

- Actualizar el informe de cierre del ejecutor (`INFORME-MOD12-PROVEEDORES-ALTA-FASE-05-v1.0.md`) y el checklist para **declarar los desvios reales** (isolation ausente resuelto, evidencia de cobertura adjunta, commit mezclado reconocido). Nada marcado "cerrado" sin evidencia.

### Backlog (NO en este commit salvo trivial)

- B1 (N+1 en list — considerar batch de summaries), B2 (`.refine` en UpdateSupplierSchema), B3 (`isDirty` completo), B5 (lista de incoterms), B6 (excluir Party MERGED). Registrar en deuda tecnica si no se hacen.

## 4. Restricciones no negociables

1. **Commit atomico:** solo archivos de proveedores/MOD12 (+ Parties para M1). No arrastrar trabajo comercial/otros modulos.
2. No romper boundary: Compras sin acceso directo a tablas `party*`; el test de arquitectura lo garantiza.
3. Multi-tenant estricto; migracion `064` ya aplicada — **no** crear otra salvo que un fix lo exija (y entonces `065`, reversible).
4. Sin PII/secretos en logs; CUD auditado.
5. Textos en espanol; sin enums crudos ni `partyRefId` en UI.

## 5. Entregables

- Fixes A1, A3, M1, M2 en backend; A2/B4 en portal.
- `supplier-profile.isolation.spec.ts`, integracion HTTP real, test de arquitectura, E2E extendido (BLOCKED en RFQ/OC).
- Evidencia en `docs/quality/` (lint/typecheck/test/cobertura).
- Informe y checklist corregidos.

## 6. Desempate requerido antes de ejecutar A2

**[DESEMPATE] Area RACI:** contrato de reutilizacion de identidad (Compras + Parties).
**Posiciones:** (1) anadir `partyRefId?` a `CreateSupplierDto` (enlace explicito, menos ambiguo); (2) dedupe backend por `(documentType, documentNumber)` como contrato unico + sincronizar `documentType` en UI (menos superficie, depende de unicidad exacta).
**Decision AI-EM-ARCH:** **Opcion (2)** — el dedupe por documento ya es la fuente de verdad del maestro Parties (unico `(documentType, documentNumber)`); anadir `partyRefId` al alta duplicaria caminos de identidad y abriria riesgo de inconsistencia. La UI debe sincronizar `documentType` y confirmar con `SupplierSummaryCard`. **Registro en:** este prompt + ADR-052 (nota).

## 7. Criterio stop/go

- **GO** para remediar. **STOP** y escalar a AI-EM-ARCH si M1 exige refactor mayor de los servicios de Parties (superficie de otro modulo) o si aparece necesidad de cambiar el contrato de identidad mas alla del desempate §6.
- **Gate de cierre (DoD Fase 05):** lint/typecheck/test verdes con evidencia adjunta, cobertura core >=80%, isolation en verde, integracion+E2E reales, A1/M1/M2 resueltos, boundary con test de arquitectura, informe/checklist corregidos, revision reforzada AI-SEC-ENG PASS con artefacto. Recien entonces AI-EM-ARCH da GO de cierre.
