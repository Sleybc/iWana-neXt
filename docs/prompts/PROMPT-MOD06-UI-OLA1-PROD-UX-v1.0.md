---
description: "Wave 1 Comercial UI — AI-PROD-UX: spec delta (precio null, focus, delete confirm) antes de código FE."
name: "Commercial UI Wave1 PROD-UX"
argument-hint: "Ejecutar tras GO del informe v1.5; entregar spec delta y CA checklist"
agent: "prod-ux"
---

# Prompt de ejecución — Wave 1 · AI-PROD-UX

**Modo:** Product Designer / UX (sin código productivo).  
**Orquestador:** AI-EM-ARCH.  
**Entradas:**
- [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.5](../../docs/informes/INFORME-COMMERCIAL-UI-ALIGNMENT-v1.5.md)
- [Plan remediación](../../docs/plans/2026-07-23-commercial-ui-audit-remediation.md) · Tarea W1.1
- Spec vigente: `docs/specs/2026-07-12-commercial-ux-spec.md`
- Skills: `iwana-identity-ui-review`, `system-vocabulary-review` (copy)

## Alcance exacto

Especificar **solo** el delta Wave 1 (H20–H22 + navegación KPI):

1. Precio ausente → copy y tratamiento visual «Sin precio vigente» (par tonal warning/error; **no** lima como urgencia; **nunca** `$0`).
2. Deep-link `?tab=<CommercialTab>&focus=<uuid>`: comportamiento al montar (abrir side peek **o** resaltar fila + scroll); limpieza de `focus` tras consumir.
3. Dialog de confirmación al eliminar plan (título, cuerpo sentence case, CTA destructive, cancelar).
4. KPI «Listos para vender» → misma regla que `resolveCatalogIncompleteTab`.
5. Criterios de aceptación verificables (checklist) alineados al informe v1.5.

## Fuera de alcance

- Rediseño de shell, tabs, tributación, H19.  
- Edición combos/promos (Wave 2.6).  
- Tokens nuevos de marca.  
- Implementación FE.

## Entregables

1. Spec delta versionada (actualizar la spec UX **o** crear `docs/specs/2026-07-23-commercial-ux-delta-wave1.md` si se prefiere no reescribir el congelado entero).  
2. Checklist CA para SR-QA.  
3. Nota de copy (español, sentence case, sin enums crudos).

## Restricciones

- Precedencia: Firma iWana + tokens reales `globals.css` + `portal-ui`.  
- Vocabulario: no «null», no `missing_current_price` en UI.  
- No contradecir aterrizaje Planes / panel Actividad (H19).

## Stop / go

- **GO** → EM-ARCH aprueba spec → disparar prompt FE-PLATFORM Wave 1.  
- **NO-GO** → ambigüedad en focus o copy; resolver antes de código.
