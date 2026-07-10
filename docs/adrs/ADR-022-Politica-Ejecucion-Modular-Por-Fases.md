# ADR-022: Politica de Ejecucion Modular por Fases, Repriorizacion Controlada y Cierre en Produccion

**Estado:** Propuesto  
**Fecha:** 2026-03-07  
**Autor:** AI-EM-ARCH  
**Aprobador Requerido:** CTO Humano

---

## Contexto

El PRD maestro define que los modulos de iWana neXt se construyen de forma incremental y que no se inicia el siguiente modulo hasta que el anterior este production-ready. Sin embargo, el proyecto necesitaba dejar por escrito cuatro reglas adicionales para operar sin ambiguedad:

1. Cada modulo debe nacer con PRD formalmente estructurado por el Architect Software.
2. La ejecucion no puede depender de instrucciones informales; cada fase debe tener un prompt detallado para Sr. Dev Fullstack y evidencia documental obligatoria.
3. El cierre del modulo no ocurre al terminar un sprint, sino cuando backend, frontend y base de datos estan funcionando y validados en produccion.
4. El orden del roadmap puede cambiar por necesidad de negocio o bloqueo tecnico, pero solo bajo una excepcion controlada y documentada.

Sin esta politica, el equipo corre el riesgo de:

- confundir cierre de sprint con cierre de modulo,
- saltar modulos sin trazabilidad,
- ocultar bloqueos tecnicos y mover deuda critica hacia adelante,
- producir entregas sin evidencia documental suficiente.

---

## Decision

Se adopta la siguiente politica obligatoria para todos los modulos:

1. **Definicion formal del modulo**
   - El Architect Software emite el PRD final del modulo.
   - El mismo paquete de definicion debe incluir HLD y ADRs necesarios.

2. **Ejecucion por fases con instrucciones cerradas**
   - El Engineering Manager genera un prompt detallado por fase para Sr. Dev Fullstack.
   - Cada fase debe dejar evidencia documental minima en `docs/`.

3. **Cierre real solo en produccion**
   - Un modulo se considera cerrado solo cuando backend, frontend, base de datos, pruebas, documentacion operativa y despliegue en produccion estan validados.

4. **Repriorizacion controlada**
   - El orden normal del roadmap se respeta por defecto.
   - CTO + Engineering Manager pueden mover la prioridad de un modulo cuando exista necesidad de negocio o ventana operativa mas valiosa.
   - La repriorizacion no puede romper dependencias fundacionales ni introducir refactorizacion mayor evitable.

5. **Regla de stop tecnico**
   - Si no existe camino tecnico seguro para continuar un modulo, el equipo se detiene.
   - Debe emitirse un documento formal con causa, impacto, opciones y recomendacion antes de continuar o cambiar prioridad.

---

## Artefactos obligatorios por modulo

| Momento    | Artefacto                            | Carpeta                        |
| ---------- | ------------------------------------ | ------------------------------ |
| Definicion | PRD del modulo                       | `docs/prds/`                   |
| Definicion | HLD del modulo                       | `docs/hlds/`                   |
| Definicion | ADRs requeridos                      | `docs/adrs/`                   |
| Ejecucion  | Prompt detallado por fase            | `docs/prompts/`                |
| Ejecucion  | Informe por fase                     | `docs/informes/`               |
| Ejecucion  | Evidencia de calidad y pruebas       | `docs/quality/`                |
| Cierre     | Informe de cierre del modulo         | `docs/informes/`               |
| Cierre     | Checklist de salida a produccion     | `docs/quality/`                |
| Excepcion  | Decision de bloqueo o repriorizacion | `docs/adrs/` o `docs/quality/` |

---

## Consecuencias

### Positivas

- El flujo Architect -> EM -> Sr. Dev -> QA queda trazable y auditable.
- Se evita declarar modulos terminados antes de produccion.
- Los cambios de prioridad dejan evidencia y justificacion.
- Los bloqueos tecnicos dejan de resolverse por intuicion o silencio.

### Negativas

- Aumenta la disciplina documental requerida por modulo.
- Obliga a mantener plantillas y checklists actualizadas.

### Riesgos

- Que el equipo vea la documentacion como burocracia y no como gate de calidad.
- Que se abuse de la repriorizacion sin resolver dependencias estructurales.

Mitigaciones:

- Mantener artefactos minimos y repetibles.
- Exigir aprobacion del CTO para excepciones.
- Auditar cada modulo contra esta politica antes de produccion.

---

## Relacion con ADRs existentes

- Refuerza ADR-016 sobre completitud modular.
- Complementa ADR-021 sobre gobernanza tecnico-operativa.
- No modifica ADR-001, ADR-002, ADR-013 ni otras decisiones de arquitectura base.

---

## Dependencias

- docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md
- docs/roles/_historico/Perfil_IA_EM_Architect_Unificado_v1.md
- docs/sprints/PLAN-SISTEMA-ARRANQUE-v1.0.md
- ADR-016
- ADR-021
