# INFORME - MOD09 Programacion / WFM Definicion

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-06  
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH  
**Modulo:** MOD09 Programacion / WFM

---

## 1. Resumen

Se consolido la definicion inicial de MOD09 Programacion / WFM como nuevo bounded context aprobado para iWana neXt. El alcance aprobado por producto para el primer corte es **Agenda operativa + Work Order ligera**, dejando materiales, firma, evidencias, inventario real, mapa operativo y app movil para fases posteriores.

---

## 2. Artefactos generados

| Artefacto | Archivo | Estado |
| --- | --- | --- |
| Spec de diseno | docs/specs/SPEC-MOD09-PROGRAMACION-WFM-DISENO-v1.0.md | Aprobado |
| PRD | docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md | Aprobado |
| HLD | docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md | Aprobado |
| ADR | docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md | Aprobado |
| Plan | docs/plans/PLAN-MOD09-PROGRAMACION-WFM-FASE-01-v1.0.md | Aprobado |
| Prompt | docs/prompts/PROMPT-MOD09-PROGRAMACION-WFM-FASE-01-v1.0.md | Aprobado |

---

## 3. Decisiones principales

1. MOD09 se define como `WfmModule`, no como extension de CRM.
2. La Fase 01 implementa agenda + Work Order ligera.
3. CRM integrara por puerto/evento y conservara `workOrderId` como referencia logica.
4. Service Assurance e Inventory quedan como integraciones futuras.
5. La UI inicial vive en `apps/portal` bajo `/dashboard/scheduling`.

---

## 4. Decisiones abiertas

| Decision | Estado | Accion requerida |
| --- | --- | --- |
| ADR-037 por nuevo bounded context | Resuelto | CTO aprobo el boundary `WfmModule` el 2026-05-06. |
| Nombre visible del modulo | Abierto | Producto/CTO debe confirmar si UI usa Programacion, Agenda operativa u Ordenes de trabajo. |
| Ticket requerido para instalaciones | Abierto | Definir si Fase 01 genera solo Work Order o tambien referencia ticket stub. |

---

## 5. Riesgos residuales

- Riesgo de scope creep hacia WFM completo; mitigacion: Fase 01 excluye materiales, firma, evidencias y mapa.
- Riesgo de acoplamiento CRM-WFM; mitigacion: ADR-037 exige puertos/eventos.
- Riesgo de PII duplicada; mitigacion: WFM usa referencias logicas y no almacena documentos/telefonos.

---

## 6. Recomendacion EM-ARCH

Recomiendo ejecutar MOD09 Fase 01 con el prompt `docs/prompts/PROMPT-MOD09-PROGRAMACION-WFM-FASE-01-v1.0.md`.

La ejecucion debe iniciar por backend y migraciones, con TDD en reglas de solapamiento y ownership, antes de construir la UI de calendario.
