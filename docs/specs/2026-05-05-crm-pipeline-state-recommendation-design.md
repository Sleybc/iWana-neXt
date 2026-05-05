# Refinamiento de estados CRM — recomendacion asistida por hitos y progreso

- **Version:** v1.0
- **Estado:** Aprobado
- **Fecha:** 2026-05-05

## Contexto

El pipeline del expediente CRM hoy combina validaciones de transicion por estado con completitud general y readiness de instalacion. En la practica, el asesor ve el porcentaje de avance, pero no recibe una recomendacion clara del siguiente estado. Ademas, ciertos faltantes como soportes documentales aparecen como bloqueo duro en escenarios donde el negocio necesita tratarlos solo como informacion operativa.

## Problema

Los estados actuales tienen tres fricciones:

1. el pipeline no comunica de forma util cual es el siguiente estado sugerido;
2. el porcentaje de la barra y los bloqueos de transicion no siempre se perciben como coherentes;
3. soportes documentales hoy pueden terminar actuando como gate duro, aunque en casos reales como viviendas nuevas deben ser solo pendiente informativo.

## Objetivo

Hacer que el pipeline sea mas util y explicable sin automatizar transiciones por sorpresa:

1. el sistema recomienda el siguiente estado;
2. el usuario confirma manualmente la transicion;
3. la recomendacion usa hitos reales del expediente y no solo el porcentaje;
4. los soportes documentales dejan de bloquear el pipeline y pasan a informar pendientes.

## Decision aprobada

Se implementara un modelo de **pipeline asistido** con dos conceptos separados:

1. **Estado actual:** estado persistido del expediente.
2. **Estado sugerido:** recomendacion calculada por backend segun avance real.

La sugerencia se recalcula cuando cambia la informacion relevante del expediente, pero no mueve el estado automaticamente. El portal debe mostrar la recomendacion, la razon y la diferencia entre requisitos duros e informativos.

## Modelo funcional

### Estado sugerido

La recomendacion del siguiente estado debe usar una combinacion de:

- completitud general,
- readiness,
- hitos de negocio,
- hitos tecnicos.

Ejemplos de hitos:

- datos minimos completos para `PRECALIFICADO`,
- ubicacion/cobertura suficiente para `VALIDANDO_COBERTURA`,
- plan de interes + viabilidad para `EN_COTIZACION`,
- readiness suficiente para `LISTO_PARA_INSTALACION`,
- ticket y orden de trabajo para `INSTALACION_AGENDADA`.

### Rol del porcentaje

La barra de progreso influye en la recomendacion, pero no decide sola el estado sugerido. El porcentaje es una señal de madurez del expediente; los hitos del pipeline siguen siendo la base principal.

### Soportes documentales

`Soportes documentales` dejan de ser bloqueo duro del pipeline. Se mantienen como:

- pendiente visible,
- requisito informativo,
- aviso operativo para cierre posterior.

Esto permite manejar escenarios validos como viviendas nuevas sin recibo o soportes aun no emitidos.

## UX propuesta

En la vista del expediente se mostrara:

1. **Estado actual** como badge principal.
2. **Estado sugerido** como recomendacion secundaria.
3. **Motivo de la recomendacion** en texto corto.
4. **Pendientes bloqueantes** y **pendientes informativos** separados.

Despues de guardar una seccion:

- el expediente se recarga,
- el backend recalcula la recomendacion,
- si la sugerencia cambia, el portal muestra un mensaje contextual del tipo:
  - `La oportunidad ya puede avanzar a EN_COTIZACION`.

Al intentar una transicion:

- si el destino coincide con el sugerido, la UX confirma normalmente;
- si el destino supera la recomendacion, se muestra advertencia o bloqueo segun el caso;
- los mensajes dejan de ser genericos y pasan a distinguir motivo, faltantes duros y pendientes informativos.

## Arquitectura propuesta

Se separan dos responsabilidades:

1. **Validacion dura de transicion** — mantiene la verdad de lo permitido.
2. **Recomendacion de pipeline** — calcula el siguiente estado sugerido y explica por que.

La implementacion prevista es introducir una capa dedicada tipo `PipelineRecommendationService` o equivalente, consumiendo:

- expediente,
- completitud,
- readiness,
- faltantes estructurados.

Respuesta esperada al portal:

- `currentStatus`
- `suggestedStatus`
- `recommendationReason`
- `blockingRequirements`
- `informationalRequirements`

## Reglas funcionales iniciales

1. Los soportes documentales no bloquean estados del pipeline.
2. El sistema nunca cambia automaticamente el estado.
3. La sugerencia debe ser consistente con la completitud visible en el portal.
4. La recomendacion puede cambiar cuando el porcentaje sube, pero solo si tambien se cumplen los hitos del estado recomendado.

## Alcance

### Incluye

- refinar la logica de sugerencia del siguiente estado,
- separar faltantes bloqueantes vs informativos,
- mejorar los mensajes de transicion en portal,
- dejar trazabilidad clara entre progreso y recomendacion.

### No incluye

- auto-transicion del pipeline,
- reabrir el modelo documental como gate obligatorio,
- rediseño visual completo de la pagina mas alla de la superficie de estados.

## Validacion esperada

1. pruebas backend de recomendacion por hitos;
2. pruebas de no bloqueo por soportes documentales;
3. pruebas frontend de render de estado sugerido y mensajes;
4. coherencia entre progreso, readiness y recomendacion mostrada.

## Riesgos y mitigacion

- **Riesgo:** que la barra sugiera una cosa y el pipeline otra.  
  **Mitigacion:** usar el porcentaje como senal secundaria y no como unico motor de recomendacion.

- **Riesgo:** mensajes ambiguos al usuario.  
  **Mitigacion:** separar siempre bloqueantes e informativos en la respuesta backend y en la UI.

- **Riesgo:** mover demasiada logica al frontend.  
  **Mitigacion:** mantener la recomendacion como fuente de verdad en backend y que el portal solo renderice.
