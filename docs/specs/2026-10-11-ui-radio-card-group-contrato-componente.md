# Contrato de componente — RadioCardGroup para @iwana/ui

**Versión:** 1.1  
**Fecha:** 2026-10-27 (v1.0: 2026-10-11)  
**Estado:** Aprobado por AI-DS-OWNER en carril rápido; congelado para F1; v1.1 por veredicto AI-DS-OWNER del 2026-10-27  
**Productor:** AI-DS-OWNER (ds-owner)  
**Plan:** [MOD11: registro compacto de equipos y materiales](../plans/2026-10-11-mod11-consola-registro-material.md)  
**Encargo:** [PROMPT-MOD11-CONSOLA-REGISTRO-MATERIAL-IMPL-v1.0](../prompts/PROMPT-MOD11-CONSOLA-REGISTRO-MATERIAL-IMPL-v1.0.md)

**Cambio v1.0 → v1.1:** incorpora la extensión D9 de MOD13 (matriz de interfaces IPv4, fila D9): las props `aria-describedby` y `aria-invalid`, reenviadas al `fieldset` para asociar la ayuda y el error del grupo. Reafirma la regla 5: el `fieldset` conserva su rol `group` implícito y no lleva `role="radiogroup"`. La implementación de MOD13 había añadido ese rol fuera del contrato y rompió tres suites de consumidores; AI-DS-OWNER lo rechazó. No requiere ADR.

## 1. Propósito y decisión

RadioCardGroup consolida tres grupos de elección visualmente parecidos en un control compartido de @iwana/ui. Conserva la semántica nativa de radio y elimina las diferencias de marcado, foco y teclado entre módulos.

El componente no existe hoy en @iwana/ui ni está exportado en packages/ui/src/index.ts. La primitive CheckboxCard sí existe y puede servir como referencia de anatomía, pero su input es checkbox y no se debe reutilizar con role=radio.

## 2. Evidencia de duplicación

| Implementación | Evidencia y diferencia |
| --- | --- |
| apps/portal/src/components/inventory/QuoteShippingFields.tsx:103-162 | Radios nativos dentro de fieldset y tarjetas seleccionables. El div agrega un role=radiogroup redundante dentro del fieldset. La estructura de opción está acoplada al formulario de envío. |
| apps/portal/src/components/commercial/catalog/PlanCatalogFormPeek.tsx:73-110 | Botones con roles radio/radiogroup, tabindex y navegación de flechas implementada a mano. Duplica el comportamiento nativo del grupo. |
| apps/portal/src/components/scheduling/ExhaustedAttemptsDecisionDialog.tsx:77-115 | Radios nativos en fieldset, con estilos y estados de foco propios del diálogo. No comparte la anatomía de tarjeta de las otras implementaciones. |

La repetición justifica una primitive única. El contrato no cambia ninguno de los tres flujos de negocio ni introduce tokens, dependencias o contratos de datos.

## 3. API congelada

### Props del grupo

| Prop | Tipo | Requerida | Contrato |
| --- | --- | --- | --- |
| legend | string | Sí | Nombre visible del grupo dentro del fieldset. |
| name | string | Sí | Nombre único del grupo dentro del formulario; todos sus radios lo comparten. |
| value | string o null | Sí | Valor controlado de la opción seleccionada; null significa que no hay selección. |
| onChange | (value: string) => void | Sí | Se llama con el value de la opción elegida por la persona. No expone un evento DOM. |
| options | readonly RadioCardOption[] | Sí | Opciones en el orden que decide la pantalla. Cada value debe ser único. |
| density | comfortable o compact | No | Densidad visual; default comfortable. Ambas densidades mantienen min-h-11. |
| disabled | boolean | No | Deshabilita el fieldset completo; default false. |
| aria-describedby | string | No | IDs de la ayuda y del error del grupo, reenviados al fieldset. El error debe existir como texto visible. (v1.1) |
| aria-invalid | boolean | No | Refuerzo del error, reenviado al fieldset solo cuando es true; con false no se emite el atributo. No sustituye al texto enlazado ni se propaga a cada radio. (v1.1) |

### Opción

    type RadioCardOptionBase = {
      value: string;
      title: string;
      description?: string;
      meta?: string;
    };

    type RadioCardOption =
      | (RadioCardOptionBase & {
          disabled?: false;
          disabledReason?: never;
        })
      | (RadioCardOptionBase & {
          disabled: true;
          disabledReason: string;
        });

title y description son texto de producto. meta es texto breve y técnico y siempre se presenta en font-mono; tabular-nums puede sumarse cuando contenga cifras. Una opción deshabilitada siempre explica la razón con texto visible; no se comunica el motivo solo por tooltip o color.

El grupo es controlado: no mantiene selección local. value debe ser null o corresponder a una opción. onChange informa una selección elegida; el consumidor conserva la fuente de verdad y resuelve cualquier opción que desaparezca o deje de ser elegible.

## 4. Anatomía y comportamiento

    <fieldset disabled={disabled}>
      <legend>{legend}</legend>
      <div className="grid gap-2">
        <label className="min-h-11 has-[:focus-visible]:ring-2">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={disabled || option.disabled}
          />
          <span>{option.title}</span>
          <span>{option.description}</span>
          <span className="font-mono">{option.meta}</span>
        </label>
      </div>
    </fieldset>

El ejemplo muestra la relación semántica; el componente real debe usar cn y las utilities de foco compartidas del paquete. La clase has-[:focus-visible] se aplica a la tarjeta contenedora para que el foco del radio nativo sea visible en toda la opción.

Reglas del marcado:

1. Un fieldset y un legend visible por grupo.
2. Un input nativo type=radio por opción, todos con el mismo name; cada input permanece visible y operable.
3. El input controlado usa checked según value. onChange solo emite el valor de la opción.
4. La tarjeta es un label asociado a su input. El título, la descripción y meta forman el contenido legible de la opción.
5. No se agrega role=radiogroup ni role=radio: el fieldset y los radios nativos ya expresan la semántica. Se mantiene en v1.1 aunque el grupo exponga aria-invalid.
6. No se implementa navegación de flechas, Home, End ni Space en JavaScript. Se conserva la navegación nativa del navegador y del sistema operativo.
7. Con options vacío, la pantalla no monta el grupo: presenta su estado vacío. Las opciones deben tener values únicos.

## 5. Apariencia, densidad y estados

| Estado | Regla |
| --- | --- |
| Reposo | Tarjeta con borde sutil, superficie clara y radio nativo visible. |
| Seleccionado | border-iwana-primary y bg-iwana-primary/5; el punto del radio nativo confirma la selección. Borde, radio y texto evitan depender solo del color. |
| Hover | Cambio sutil de superficie o borde; solo si la opción está habilitada y sin mover el layout. |
| Focus visible | La tarjeta responde con has-[:focus-visible], anillo visible y sin retirar el foco del input. |
| Active | Feedback de presión breve, sin alterar dimensiones o posición de la tarjeta. |
| Opción deshabilitada | Atributo disabled nativo, affordance no accionable y disabledReason visible y asociado al input. |
| Grupo deshabilitado | Atributo disabled en fieldset; ninguna opción cambia de valor. |
| Carga | La primitive no consulta datos ni presenta spinner. El consumidor deshabilita el grupo y muestra el skeleton contextual si la carga lo requiere. |
| Vacío | Lo resuelve el consumidor; no se monta un grupo sin opciones. |
| Error | Lo resuelve el formulario consumidor junto al grupo, con texto y recuperación. El consumidor enlaza ese texto con aria-describedby y marca aria-invalid; al fallar el envío, además lo anuncia con un resumen role=alert que enlace al grupo. (v1.1) |
| Éxito | Lo comunica el consumidor tras la acción; RadioCardGroup no guarda ni confirma datos. |
| Solo lectura | No se representa como grupo deshabilitado. El consumidor muestra el valor como texto de lectura. |

comfortable usa espaciado de tarjeta generoso. compact reduce el padding vertical, pero ninguna tarjeta baja de min-h-11 y ambas conservan un área táctil mínima de 44 px. Las opciones se apilan en una columna para mantener el orden de lectura y evitar desplazamiento horizontal; cada tarjeta ocupa el ancho disponible.

### Tema oscuro

Los fondos oscuros usan únicamente la familia dark-surface-* del sistema: dark-surface-2 para reposo y dark-surface-3 para hover o selección. Se conserva border-iwana-primary en selección. Los bordes oscuros usan los tokens dark-border existentes; no se usan fondos dark:bg-gray-* ni colores nuevos. El texto y el radio mantienen contraste suficiente en ambos temas.

## 6. Accesibilidad

- legend da nombre al grupo; el texto visible de cada label da nombre al radio.
- El lector de pantalla anuncia el nombre del grupo, la opción y su estado seleccionado o deshabilitado mediante controles HTML nativos.
- La persona recorre opciones con teclado usando el comportamiento de radio nativo; el orden de tabulación coincide con el orden visual.
- El input no se oculta con display:none ni se sustituye por botones con roles ARIA.
- El foco tiene indicador visible de alto contraste a través de has-[:focus-visible] y el helper de foco compartido.
- Cada opción y control asociado tiene target táctil de al menos 44 px; las tarjetas se separan para evitar pulsaciones adyacentes.
- disabledReason se muestra dentro de la etiqueta accesible del radio deshabilitado; si se renderiza fuera del label, se asocia con aria-describedby. No basta con bajar opacidad.
- Selección, foco y deshabilitado se distinguen por forma, borde, indicador nativo y texto, además del color.
- Si el grupo necesita instrucciones, el consumidor las coloca en texto accesible junto al fieldset. Los errores y los mensajes de resultado se anuncian desde el formulario consumidor.
- aria-invalid es un refuerzo, no el canal del error (v1.1). ARIA 1.2 lo considera un uso global deprecado en un group; axe-core 4.11 no lo reporta. El error siempre vive en texto visible enlazado por aria-describedby y, al fallar el envío, en un resumen role=alert del consumidor. Se revisa si el estándar de referencia cambia.

## 7. Decisión sobre QuantityStepper

No se crea ni exporta QuantityStepper en esta fase. @iwana/ui ya ofrece Input y Button, con los que el flujo de MOD11 puede componer el control local de cada fila; hoy no hay un segundo consumidor que justifique una primitive pública.

La composición de la fila usa un input numérico etiquetado «Cantidad de {referencia}», con mínimo cero, máximo igual al disponible y paso de una unidad. Los botones se nombran «Restar una unidad de {referencia}» y «Sumar una unidad de {referencia}», tienen target de al menos 44 px y se deshabilitan en los límites o durante el envío. La pantalla limita a cero la cantidad y nunca envía una fila vacía. Si aparece otro consumidor real, DS-OWNER revisa si corresponde promover una primitive.

## 8. Veredicto G2 de componente

**GO para F1; contrato v1.0 congelado por AI-DS-OWNER en carril rápido.** RadioCardGroup consolida las tres variantes observadas con controles nativos, anatomía, props, estados, tema oscuro y reglas de accesibilidad definidos. No cambia alcance, API de datos, boundary, tokens de marca ni stack; no requiere ADR. No hay bloqueos de diseño para implementar el componente.

El veredicto corresponde al contrato de componente y al carril rápido previsto en el plan. La revisión formal de la etapa G2, si aplica al cierre de la ola, sigue el gate de EM-ARCH.

## Referencias

- packages/ui/src/index.ts
- packages/ui/src/components/CheckboxCard.tsx
- packages/ui/src/focus.ts
- packages/ui/src/styles/globals.css
- docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md, §§3, 7 y 9
- .agents/skills/core-components/SKILL.md
- .agents/skills/iwana-identity-ui-review/SKILL.md
- .agents/skills/tailwind-patterns/SKILL.md
