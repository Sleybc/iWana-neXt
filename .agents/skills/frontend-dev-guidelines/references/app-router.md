# App Router — checklist y heurística de revisión (migrado de nextjs-app-router-patterns)

Complementa el cuerpo de `frontend-dev-guidelines`.

## Checklist de revisión

- La pantalla usa Server Components por defecto cuando es viable.
- Los Client Components están justificados y acotados.
- La carga de datos no expone lógica sensible al cliente.
- Loading, empty y error states están cubiertos.
- La estructura de rutas refleja el dominio y no genera ruido.
- La implementación respeta accesibilidad, seguridad e i18n cuando aplican.

## Heurística para revisar código

Busca y corrige estas señales:

- `use client` en páginas completas sin razón clara
- fetches duplicados entre cliente y servidor sin necesidad
- componentes gigantes que mezclan layout, data y mutaciones
- errores sin manejo visible o estados vacíos inexistentes
- rutas o segmentos nombrados solo por conveniencia técnica
- lógica sensible serializada al cliente
