# Modo dirección — propuesta de dirección visual (migrado de senior-ui-systems-designer)

Úsalo en el **modo dirección** de `iwana-identity-ui-review`: la tarea es proponer cómo debería verse una interfaz nueva, no implementarla ni auditarla. El marco de identidad (tokens, elementos de firma, precedencia) sigue siendo el de `SKILL.md` y sus referencias; esta guía solo añade el método de propuesta.

## Método

### 1. Clasificar la interfaz

Antes de proponer cualquier estética, identifica el tipo de pantalla: dashboard operativo, listado o tabla con filtros, formulario largo o wizard, vista detalle, configuración, onboarding operativo, estado vacío / error / permisos. La composición y la densidad responden a esa categoría, no a una plantilla fija.

### 2. Leer el contexto real

Revisa siempre: patrones existentes en `apps/web`, `apps/portal` y `packages/ui`; restricciones del módulo; densidad de datos; acciones primarias y secundarias; sensibilidad de los datos visibles; responsive esperado.

### 3. Proponer 2 o 3 direcciones visuales

Cada propuesta incluye como mínimo:

- nombre corto de la dirección
- tesis estética en una frase
- ancla diferencial: qué haría reconocible esa interfaz sin logo
- por qué encaja con el flujo y el usuario
- riesgo principal de ejecución o mantenimiento

No presentes una sola salida como si fuera inevitable.

### 4. Recomendar una dirección

Elige una y justifícala por claridad operativa, fit con el producto, viabilidad de implementación, consistencia con el sistema visual y riesgo de deriva visual.

### 5. Bajar la dirección a especificación útil

La recomendación final se aterriza en:

- jerarquía del primer viewport
- layout y composición por bloques
- densidad y ritmo visual
- tipografía y tono cromático usando tokens existentes cuando sea posible
- estados obligatorios: hover, focus, active, disabled, loading, empty, error, success, warning, readonly
- responsive por breakpoint
- impacto en componentes compartidos o necesidad de nuevos patrones (si una solución debe consolidarse después en `@iwana/ui`, derívala a `core-components`)

### 6. Cerrar con criterios de aceptación visual

Deja condiciones verificables para desarrollo y review: qué debe verse primero, qué no debe competir visualmente, qué estados son obligatorios y qué riesgos visuales invalidan la entrega.

## Formato recomendado de respuesta

1. Contexto de interfaz
2. Opciones visuales
3. Recomendación
4. Sistema visual propuesto
5. Criterios de responsive y accesibilidad
6. Riesgos o deuda visual

## Heurísticas por tipo de pantalla

### Dashboard operativo

- priorizar lectura de estado y acción sobre ornamentación
- limitar el número de superficies dominantes en el primer viewport
- usar asimetría y ritmo para marcar prioridades reales

### Tablas y listados

- favorecer comparación, filtros útiles y acciones frecuentes visibles
- no convertir cada bloque en una card si la tarea es de escaneo tabular
- evitar ruido visual que reduzca la densidad efectiva

### Formularios y wizards

- agrupar por decisiones de negocio, no por azar visual
- hacer visible el progreso y el error sin dramatizar la UI
- preservar baja fatiga cognitiva en formularios largos

### Vistas detalle

- separar claramente identidad, estado, metadata y acciones
- mantener una superficie dominante y secundarios subordinados
- no esconder información frecuente detrás de tabs innecesarias

### Guardrail del repo

- no proponer landing pages o heroes de marketing para herramientas operativas
