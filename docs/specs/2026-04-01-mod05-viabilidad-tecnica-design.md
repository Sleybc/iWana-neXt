# Spec: Refinamiento de Viabilidad Técnica en Expediente CRM

**Version:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-04-01  
**Tipo:** Feature  
**Modulo:** MOD05 CRM  
**Alcance:** Portal tenant-aware + contrato expediente + backend expediente  
**PRD de referencia:** docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md  
**HLD de referencia:** docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md  
**Spec base relacionada:** docs/superpowers/specs/SPEC-MOD05-EXPEDIENTE-UNICO-v1.0.md  
**Informe vivo relacionado:** docs/informes/INFORME-MOD05-DEFINICION-v1.0.md

---

## 1. Objetivo

Refinar la sección `Viabilidad técnica` del detalle de expediente CRM para que deje de depender de texto libre y pase a capturar una evaluación operativa útil para escenarios reales de cobertura rural y periurbana, especialmente cuando el mapa no confirma cobertura de forma suficiente pero la validación técnica en sitio sí puede habilitar una solución.

El refinamiento debe permitir:

- distinguir entre factibilidad confirmada, factibilidad pendiente de validación técnica y no viabilidad;
- registrar tecnologías candidatas y una tecnología recomendada final;
- modelar casos donde se requiere `Refuerzo de cobertura` o `Requiere expansión de red`;
- mejorar el valor operativo del expediente sin romper el flujo progresivo vigente del portal.

---

## 2. Contexto

### Estado actual del código

La sección `technical_feasibility` en el portal hoy solo expone dos campos libres:

- `coverageResult`
- `feasibility`

Sin embargo, el backend y el modelo de datos ya contemplan capacidad técnica adicional:

- `availableTechnology`
- `estimatedDistanceM`
- `technicalObservations`
- `estimatedEquipment`

Esto produce una brecha entre el valor operativo del modelo y la información efectivamente capturada por la UI.

### Problema operativo

En zonas rurales y en algunos bordes de cobertura:

- el mapa puede no mostrar cobertura concluyente;
- la ubicación puede ser aproximada o referencial;
- una visita técnica puede confirmar viabilidad por `Radio enlace`, `Fibra óptica` o una solución condicionada a `Refuerzo de cobertura`;
- algunos casos solo son atendibles si se ejecuta `Requiere expansión de red`.

La UI actual no permite representar bien estos escenarios porque reduce la evaluación técnica a texto libre sin semántica operativa ni estructura para seguimiento posterior.

---

## 3. Alcance

### Incluye

- rediseño funcional de la sección `Viabilidad técnica` del detalle de expediente;
- definición de catálogos visibles para resultado técnico y tecnologías;
- reglas de obligatoriedad por estado;
- propuesta de impacto sobre completitud visible y completitud técnica backend;
- definición de cambios requeridos en portal, contrato y servicio de expediente.

### No incluye

- rediseño del mapa de cobertura o del módulo de nodos / zonas;
- creación de una nueva entidad de visita técnica;
- automatización GIS o validación topológica de cobertura;
- implementación de workflow independiente de cuadrillas o agenda de inspección.

---

## 4. Diseño funcional aprobado

### 4.1 Resultado de viabilidad técnica

El resultado principal deja de ser texto libre y pasa a catálogo controlado con estos valores:

- `Viable`
- `Validación técnica requerida`
- `No viable`

Interpretación operativa:

| Valor | Significado operativo |
| --- | --- |
| `Viable` | Existe criterio técnico suficiente para avanzar comercialmente con una solución identificada. |
| `Validación técnica requerida` | La información disponible no permite cerrar la evaluación; se requiere validación adicional, normalmente en sitio o con revisión técnica más profunda. |
| `No viable` | No existe factibilidad técnica con las condiciones actuales del caso. |

### 4.2 Tecnologías

La sección debe manejar dos niveles:

- `Tecnologías candidatas`: selección múltiple
- `Tecnología recomendada`: selección única

Catálogo inicial aprobado:

- `Fibra óptica`
- `Radio enlace`
- `Satelital`
- `Requiere expansión de red`
- `Refuerzo de cobertura`

Interpretación:

- una oportunidad puede tener más de una alternativa técnicamente posible;
- el asesor o técnico puede registrar varias opciones candidatas;
- cuando exista decisión suficiente, una de ellas se marca como recomendada final.

### 4.3 Campos complementarios

Además del resultado y la tecnología, la sección debe incorporar:

- `Nivel de certeza`: `Alta`, `Media`, `Baja`
- `Fuente de evaluación`: `Mapa`, `Referencia comercial`, `Llamada con cliente`, `Visita técnica`
- `Observación técnica`: texto operativo corto

Objetivo:

- distinguir evaluaciones preliminares frente a validaciones más confiables;
- dejar contexto cuando el mapa no refleja la realidad física del terreno;
- registrar por qué se propone una tecnología o por qué se requiere visita técnica.

---

## 5. Reglas de comportamiento

### 5.1 Si el resultado es `Viable`

Debe exigirse:

- al menos una tecnología candidata;
- una tecnología recomendada;
- nivel de certeza;
- fuente de evaluación.

La observación técnica es opcional, pero recomendada cuando la solución depende de condiciones especiales, por ejemplo `Refuerzo de cobertura`.

### 5.2 Si el resultado es `Validación técnica requerida`

Debe exigirse:

- al menos una tecnología candidata;
- nivel de certeza;
- fuente de evaluación;
- observación técnica.

La tecnología recomendada puede quedar vacía porque todavía no existe cierre técnico suficiente.

### 5.3 Si el resultado es `No viable`

Debe exigirse:

- fuente de evaluación;
- observación técnica.

Las tecnologías candidatas y la tecnología recomendada pueden quedar vacías.

### 5.4 Reglas especiales para `Refuerzo de cobertura`

`Refuerzo de cobertura` puede registrarse como:

- tecnología candidata cuando la solución todavía está bajo análisis;
- tecnología recomendada cuando la factibilidad depende explícitamente de extender o reforzar la cobertura existente en el sector.

El objetivo del término no es modelar un activo de red preciso sino una necesidad técnica operativa comprensible por CRM.

---

## 6. Propuesta de UI

### 6.1 Estructura de la sección

La sección `Viabilidad técnica` del detalle debe pasar de 2 campos libres a una composición guiada:

1. `Resultado de viabilidad` — select único
2. `Tecnologías candidatas` — grupo de checkboxes
3. `Tecnología recomendada` — select único
4. `Nivel de certeza` — select único
5. `Fuente de evaluación` — select único
6. `Observación técnica` — textarea corta

### 6.2 Comportamiento visual

- la `Tecnología recomendada` se habilita visualmente siempre, pero se valida como obligatoria solo cuando el resultado sea `Viable`;
- la `Observación técnica` debe mostrar helper contextual cuando el resultado sea `Validación técnica requerida` o `No viable`;
- el copy visible debe ser operativo y empresarial, no geoespacial ni de ingeniería profunda.

### 6.3 Principio de simplicidad

No se recomienda abrir un subflujo aparte de visita técnica dentro del expediente en esta fase. El valor principal está en estructurar la evaluación técnica sin convertir el detalle en una mini herramienta OSS.

---

## 7. Impacto en modelo y contrato

### 7.1 Campos actuales reutilizables

Se recomienda reutilizar y reinterpretar campos ya existentes cuando sea viable:

| Necesidad nueva | Campo actual candidato | Observación |
| --- | --- | --- |
| Resultado de viabilidad | `feasibility` | Conviene normalizarlo a catálogo controlado. |
| Tecnología recomendada | `availableTechnology` | Puede usarse como valor final recomendado si se mantiene compatibilidad. |
| Observación técnica | `technicalObservations` | Encaja directamente. |

### 7.2 Campos que requieren extensión

Para cumplir el diseño propuesto sin sobrecargar strings libres, se incorporan explícitamente:

- `candidateTechnologies` o equivalente serializable;
- `technicalConfidence`;
- `evaluationSource`.

Decisión de diseño:

- `availableTechnology` se conserva como tecnología recomendada final para mantener continuidad conceptual con el modelo existente;
- `candidateTechnologies` se introduce como campo nuevo explícito del expediente;
- `technicalConfidence` se introduce como campo nuevo explícito del expediente;
- `evaluationSource` se introduce como campo nuevo explícito del expediente.

Esta decisión evita codificaciones transitorias en strings libres y deja el expediente preparado para evolución estable del módulo.

---

## 8. Impacto en completitud

### 8.1 Problema actual

La completitud técnica backend vigente evalúa:

- existencia de `coverageChecks`;
- existencia de `coverageCheck` viable o condicional;
- `availableTechnology`;
- `estimatedEquipment`.

La UI visible del portal y el cálculo visual por secciones no reflejan toda esa semántica.

### 8.2 Regla propuesta

La dimensión técnica no debe darse por completada solo por escoger un estado.

Recomendación funcional:

- `resultado de viabilidad` aporta avance, pero no cierra la dimensión por sí solo;
- `tecnología recomendada` cuenta como requisito clave cuando el estado sea `Viable`;
- `fuente de evaluación` y `nivel de certeza` deben contribuir al avance porque hacen la evaluación auditable;
- `observación técnica` debe contar al menos cuando el resultado no sea concluyente o sea negativo.

### 8.3 Recomendación de implementación incremental

Fase inicial:

- alinear primero la completitud visible del portal con los nuevos campos de la sección técnica.

Fase posterior:

- revisar `CompletenessCalculator` backend para incorporar semántica más rica sin romper criterios existentes del PRD.

Esto evita introducir una regresión de estado en pipeline mientras se mejora el detalle del expediente.

---

## 9. Criterios de aceptación

### CA-01 Catálogo controlado

La sección `Viabilidad técnica` ya no usa texto libre para el resultado principal; el usuario selecciona una de tres opciones controladas.

### CA-02 Escenario rural modelable

El usuario puede registrar casos donde la solución aún no está confirmada, pero existe posibilidad técnica pendiente de validación en sitio.

### CA-03 Múltiples alternativas técnicas

El usuario puede registrar más de una tecnología candidata y luego marcar una recomendada cuando exista decisión suficiente.

### CA-04 Soporte a refuerzo

`Refuerzo de cobertura` aparece como opción válida dentro del catálogo técnico.

### CA-05 Reglas coherentes

Las validaciones cambian según el resultado de viabilidad y evitan exigir una tecnología final cuando todavía no existe cierre técnico.

### CA-06 Completitud visible consistente

El overview del expediente refleja el avance técnico real de la sección sin depender solo de texto libre o de backend no alineado con la UI nueva.

---

## 10. Riesgos y decisiones cerradas

### Riesgos controlados

- si la completitud backend no se ajusta después, puede persistir una diferencia entre semántica 4D y semántica visible del portal;
- la incorporación de campos nuevos en `ExpedienteRecord` obliga a alinear contrato, persistencia y cálculo de completitud de forma coordinada.

### Decisiones ya cerradas

- resultado de viabilidad: `Viable`, `Validación técnica requerida`, `No viable`;
- tecnologías base: `Fibra óptica`, `Radio enlace`, `Satelital`, `Requiere expansión de red`, `Refuerzo de cobertura`.

### Decisiones cerradas para implementación

- `candidateTechnologies` se introduce como campo nuevo explícito del expediente;
- la selección múltiple en portal se implementa con checkboxes por claridad, menor complejidad visual y mejor lectura operativa.

---

## 11. Recomendación ejecutiva

Implementar el refinamiento en dos capas:

1. **Primera capa**
   - rediseño UI de `Viabilidad técnica` con catálogos y reglas de obligatoriedad;
   - extensión mínima de contrato para soportar tecnologías candidatas, certeza y fuente;
   - alineación de completitud visible del portal.

2. **Segunda capa**
   - revisión del `CompletenessCalculator` backend para que la dimensión técnica incorpore la nueva estructura sin degradar el pipeline.

Esta secuencia mantiene controlado el riesgo y mejora de inmediato el valor operativo del expediente para los casos rurales que hoy no están bien modelados.
