# SectionAccordion: keepMounted

## Contrato

`SectionAccordion` admite `keepMounted?: boolean` con valor predeterminado `false`.

Cuando `keepMounted` es `true`, cada panel se monta de forma lazy en su primera apertura y permanece montado al contraerse. El panel cerrado usa `hidden`, conserva `aria-controls` y no participa en el árbol accesible ni en el orden de tabulación.

## Uso inicial

`ExpedienteSections` activa `keepMounted` para conservar el estado local de los pickers de la sección "Interés del cliente". Las demás superficies mantienen el comportamiento anterior porque no habilitan la propiedad.

## Criterios de aceptación

- Los paneles nunca abiertos no se montan.
- Cerrar y reabrir no repite la hidratación remota ni pierde cambios no guardados.
- La cabecera cerrada mantiene `aria-expanded="false"` y controla el mismo panel.
- El panel cerrado tiene `hidden` y no expone contenido a tecnologías de asistencia.
- La propiedad no cambia el comportamiento predeterminado de otros consumidores.
