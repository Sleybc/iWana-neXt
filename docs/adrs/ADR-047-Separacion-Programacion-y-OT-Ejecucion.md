# ADR-047: Separacion entre Programacion como Centro de Agendamiento y OT de Ejecucion

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-06-24  
**Autor:** AI-EM-ARCH  
**Aprobado por:** CTO  
**Modulo principal:** MOD09 Programacion / WFM  
**Modulo relacionado:** MOD11 Ejecucion Operativa / Tareas  
**PRD relacionado:** docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md, docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md, docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md  
**Spec relacionada:** docs/specs/2026-06-24-mod09-mod11-programacion-centro-agendamiento-ot-ejecucion-design.md  
**ADRs antecedentes:** docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md, docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md

---

## Contexto

ADR-037 aprobo `WfmModule` como owner de agenda y de una `WorkOrder` ligera orientada al scheduling. ADR-046 aprobo `MOD11` como bounded context para ejecucion operativa transversal.

La evolucion funcional acordada para operacion de campo requiere una OT con mas profundidad que la cubierta por la OT ligera actual de WFM. La OT requerida debe soportar:

- tecnico o cuadrilla asignada;
- cliente y direccion del trabajo;
- actividades ejecutadas;
- materiales y equipos usados;
- novedades, evidencias y resultado tecnico;
- trazabilidad de inventario desde bodega hasta destino final.

Ese alcance convierte a la OT en owner de ejecucion de campo, no en subproducto de agenda.

Las restricciones vigentes siguen siendo:

- modulith con boundaries explicitos;
- multi-tenant por schema PostgreSQL;
- sin acceso directo a tablas de otro modulo;
- stack aprobado NestJS + Next.js + TypeORM + Turborepo + Redis/BullMQ;
- seguridad y auditoria como parte de la arquitectura.

---

## Decision

Se adopta la separacion explicita entre:

1. `Programacion / WFM` como owner de coordinacion de visita y agenda.
2. `MOD11` como owner de la OT enriquecida y de la ejecucion operativa de campo.

### Alcance de ownership despues de esta decision

#### MOD09 / WFM

Owner de:

- `VisitRequest`
- `ScheduleEvent`
- capacidad y conflictos de agenda
- despacho, reasignacion y reprogramacion
- supervision operativa resumida

#### MOD11

Owner de:

- orden de trabajo enriquecida
- actividades de campo
- resultado tecnico
- consumo operativo de inventario asignado a tecnico/cuadrilla
- cierre tecnico y trazabilidad de ejecucion

#### Inventario / Almacen

Owner de:

- stock global
- bodega
- custodia por tecnico/cuadrilla
- movimientos y destino final de activos/materiales

### Decision complementaria

La `WorkOrder` ligera actual de WFM se mantiene como artefacto transitorio de compatibilidad o puente de handoff, pero deja de ser el modelo final de OT de campo.

---

## Consecuencias

### Positivas

- Se evita que `Programacion` absorba ejecucion detallada e inventario.
- Se alinea mejor el producto con la operacion real de ISP.
- Se preserva claridad entre coordinacion, ejecucion e inventario.
- Se habilita una OT capaz de crecer hacia materiales, seriales, evidencias y cierre tecnico sin contaminar agenda.
- Se vuelve trazable el flujo bodega -> tecnico/cuadrilla -> OT -> cliente/consumo/retorno.

### Costos y tradeoffs

- Requiere ajustar PRD/HLD de MOD09 y MOD11.
- Requiere definir nuevos contratos entre MOD09, MOD11 e Inventario.
- Obliga a convivir temporalmente con una `WorkOrder` ligera en WFM mientras se migra el ownership real.
- Incrementa el trabajo de integracion y pruebas entre bounded contexts.

### Riesgos aceptados

- Puede existir duplicidad transitoria entre OT ligera WFM y OT enriquecida MOD11 hasta cerrar la migracion.
- El modulo de Inventario debe estar preparado para persistir movimientos disparados desde OT sin ceder ownership de stock.
- Si no se formaliza pronto el handoff de estados, agenda y OT pueden quedar desalineadas.

---

## Reglas de implementacion

1. `Programacion` no debe capturar materiales, equipos, checklist de campo ni cierre tecnico.
2. `MOD11` no debe convertirse en owner de agenda o conflictos horarios.
3. El tecnico debe trabajar sobre la OT, no sobre el evento de agenda.
4. La OT puede consumir inventario ya asignado al tecnico/cuadrilla.
5. Todo movimiento de materiales/equipos debe conservar trazabilidad de origen y destino.
6. No introducir FKs cross-module entre MOD09, MOD11 e Inventario.
7. Mantener integracion por referencias logicas, eventos o puertos aprobados.

---

## Alternativas consideradas

### A1: Mantener OT enriquecida dentro de WFM

Descartada. Mezcla agenda con ejecucion y termina convirtiendo `Programacion` en owner de materiales, evidencias y cierre tecnico.

### A2: Mantener OT enriquecida dentro de `TasksModule` sin separacion conceptual adicional

Parcialmente valida. Se acepta siempre que `MOD11` haga explicito que ya no es solo owner de tareas transversales sino tambien de OT de campo enriquecida.

### A3: Crear otro modulo adicional separado de MOD11 para OT de campo

Descartada por ahora. La prioridad es consolidar ownership en el modulith actual sin abrir mas bounded contexts de los necesarios.

---

## Aprobacion requerida

Si.

Motivo:

- cambia ownership funcional respecto a la OT definida en ADR-037;
- reinterpreta el alcance aprobado de MOD11 en ADR-046;
- afecta boundaries entre agenda, ejecucion e inventario.

---

## Referencias

- AGENTS.md
- docs/prds/Stack_Tecnologico.md
- docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md
- docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md
- docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md
- docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md
- docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md
- docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md
- docs/specs/2026-06-24-mod09-mod11-programacion-centro-agendamiento-ot-ejecucion-design.md
