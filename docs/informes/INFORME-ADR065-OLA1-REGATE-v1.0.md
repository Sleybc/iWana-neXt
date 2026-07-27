# INFORME — Re-gate: DEF-2 + Ola 1 ADR-065 (post-remediación)

**Versión:** 1.1 → **supersedida por** [INFORME-ADR065-OLA1-REGATE-v1.2](INFORME-ADR065-OLA1-REGATE-v1.2.md) (Ola 1 **GO-CON-DEUDA**; D-4 cerrada con 088)
**Fecha:** 2026-07-24
**Modo activo:** **Orchestrator + EM**
**Autor:** AI-EM-ARCH
**Antecedente v1.0:** este archivo en historial git / contenido previo GO-CON-DEUDA prematuro
**Veredicto vigente del gate:** [INFORME-ADR065-OLA1-REGATE-v1.2](INFORME-ADR065-OLA1-REGATE-v1.2.md) — **prevalece**
**Clasificación:** Uso interno
**Changelog v1.0 → v1.1:** alinea veredicto con auditoría v1.1; Ola 1 = NO-GO hasta R-1; D-4 = **abierta** (R-3); confirma cierres 1–6 y 8–13.
**Changelog → v1.2:** R-1 y R-3 cerrados; suite verde (resumen Jest); ver [REGATE-v1.2](INFORME-ADR065-OLA1-REGATE-v1.2.md).

> **Estado:** documento histórico del NO-GO intermedio. No usar como veredicto actual.

---

## Veredicto (alineado a gate v1.1)

| Gate | v1.0 (este informe) | **v1.1** |
| --- | --- | --- |
| **Ola 1 de ADR-065** | GO-CON-DEUDA (prematuro) | **NO-GO hasta R-1** → luego GO-CON-DEUDA |
| **DEF-2 hotfix** | GO-CON-DEUDA (D-4 como deuda) | **GO-CON-DEUDA** con **D-4 abierta** (R-3) |
| **Escalaciones** | Cerradas | Cerradas |

**No dejan de estar vigentes dos veredictos:** el A del gate es la auditoría v1.1; este re-gate v1.1 la refleja.

---

## Tabla de cierres (confirmada por auditoría v1.1)

Disposiciones **1–6 y 8–13** del gate v1.0: **cerradas** con evidencia propia de la re-auditoría.  
Disposición **7 / D-4**: rediseño al alza (hash + 087) pero **abierta** hasta migración de datos **088** (backfill).

---

## Bloqueantes restantes

| ID | Acción | Responsable |
| --- | --- | --- |
| R-1 | Mocks `addOrderBy` + aserción ORDER BY | AI-SR-FULL |
| R-3 | Migración datos `088_*` backfill hash | AI-SR-FULL |
| R-2 | Docs índices → **089** (no 088; 088 = backfill) | AI-EM-ARCH |

---

## Numeración de migraciones (desempate R-2 ↔ R-3)

| # | Contenido |
| --- | --- |
| **087** | Schema `document_number_hash` (hecho) |
| **088** | Backfill datos hash (R-3, bloqueante D-4) |
| **089** | `089_pagination_ordering_indexes` (Ola 2; `transactional=false`) |

La auditoría v1.1 pedía renumerar índices a `088_*`; al fijar backfill en `088_*` (disposición 2), los índices pasan a **089** para no colisionar.

---

## Deuda absorbible (no bloquea firma post R-1+R-3)

- R-4 / D-5: clamp fuera de `runInTenantSchema` — Ola 2
- R-5: test de orden efectivo por recurso — stop/go Ola 2
- Pepper HMAC documentos — propuesta futura, ambas columnas
