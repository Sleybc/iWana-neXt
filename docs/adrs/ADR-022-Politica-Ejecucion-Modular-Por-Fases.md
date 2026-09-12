# ADR-022: Politica de Ejecucion Modular por Fases, Repriorizacion Controlada y Cierre en Produccion

**Estado:** Aprobado  
**Fecha:** 2026-03-07  
**Autor:** AI-EM-ARCH  
**Aprobado por:** CTO Humano (2026-07-19, vía [ADR-056](ADR-056-Integridad-Base-Normativa-Diseno.md) — sin cambios de contenido; regulariza 91 citas y la regla de completitud que gobierna la cadencia de fases del programa)
**Enmendado por:** [ADR-080](ADR-080-Dependencia-Descubierta-y-Cierre-En-Construccion.md) (Aprobado por el CTO el 2026-08-09) — **§Decisión puntos 3 y 4**. El resto de este ADR sigue vigente sin cambios.

---

> ## ⚠ Enmienda vigente — 2026-08-09
>
> **Este ADR sigue vigente. Dos de sus cinco puntos de decisión quedan enmendados** por [ADR-080](ADR-080-Dependencia-Descubierta-y-Cierre-En-Construccion.md). Léelos siempre junto con esa enmienda.
>
> ### §Decisión punto 3 — "Cierre real solo en producción"
>
> **Enmendado por contradicción con un ADR posterior.** Este punto exige *"despliegue en producción validados"* para cerrar un módulo. [ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md) (superado) (Aprobado, 2026-08-02) **difiere formalmente la producción** y deja G7 NO-GO por diseño. Leídos juntos y sin enmienda, ningún módulo del programa podía cerrarse nunca.
>
> ADR-080 §Decisión 5 separa **cierre en construcción** —backend, frontend, datos, pruebas y documentación completos, con **G6 y G6.5** ([ADR-069](ADR-069-Gates-G6.5-Merge-Readiness.md)), lo aprueba AI-EM-ARCH y **habilita abrir el módulo siguiente**— de **cierre en producción**, que añade **G7**, lo aprueba el CTO y permanece diferido.
>
> **La Regla de Completitud de este ADR no se relaja: se satisface con el cierre en construcción.** Su ausencia de G7 **no constituye deuda** mientras ADR-070 (superado) esté vigente.
>
> ### §Decisión punto 4 — "Repriorización controlada"
>
> **Enmendado por insuficiencia, no por error.** Este punto es correcto y sigue vigente para lo que cubre: mover el orden del roadmap **antes de abrir** un módulo, por necesidad de negocio o ventana operativa.
>
> No cubría el caso más frecuente del programa: constatar, **construyendo el módulo N**, que N no puede terminar sin una capacidad M que no existe. Eso no es reordenar una cola — es **interrumpir**. MOD00, MOD04, MOD11 y MOD12 nacieron así, sin que ningún artefacto lo nombrara.
>
> ADR-080 §Decisión 1–4 añade la **dependencia descubierta** con sus cuatro reglas: solo si es **bloqueante, no conveniente**; N pasa a estado **`Suspendido`** con causa y condición de retorno; el retorno es **pila, no cola** —al cerrar M se retoma N antes de abrir cualquier otro—; y **cota de dos** módulos funcionales abiertos, con excepción reservada al CTO.

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
- Complementa ADR-021 (superado) sobre gobernanza tecnico-operativa.
- No modifica ADR-001, ADR-002, ADR-013 ni otras decisiones de arquitectura base.

---

## Dependencias

- docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md
- docs/roles/_historico/Perfil_IA_EM_Architect_Unificado_v1.md
- docs/sprints/PLAN-SISTEMA-ARRANQUE-v1.0.md
- ADR-016
- ADR-021 (superado)
