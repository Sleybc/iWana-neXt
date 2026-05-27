---
name: iwana-identity-ui-review
description: Use when designing, reviewing, or improving any iWana neXt UI, screen, section, module, dashboard, form, settings page, table, modal, or visual pattern so it follows the iWana identity manual with operational B2B clarity.
metadata:
  category: discipline
  triggers: identidad, UI, interfaz, pantalla, modulo, seccion, dashboard, settings, diseño, visual, iWana, brand, tokens
---

# iWana Identity UI Review

Disciplina para traducir la identidad corporativa iWana a interfaces operativas del producto.

## Regla De Hierro

**Toda interfaz nueva o refinada debe sentirse iWana: fresca, minimalista, equilibrada, profesional, accesible y clara para trabajo operativo real.**

La identidad no es decoracion. Si un efecto, borde, card, gradiente o animacion no mejora claridad, escaneo, confianza o accion, no pertenece a la interfaz.

## Cuando Usarla

- Antes de crear o rediseñar una pantalla, seccion o modulo.
- Al mejorar dashboards, settings, tablas, formularios, modales, drawers o estados vacios.
- Cuando una UI se siente generica, pesada, plana, ruidosa o poco alineada a iWana.
- Cuando se vaya a introducir un nuevo patron visual o una nueva primitive.

## Fuentes De Verdad

1. `docs/identity/Manual_Implementacion_Identidad_Iwana.md` para personalidad, tokens y principios.
2. `packages/ui/src/styles/globals.css` para tokens reales Tailwind v4 CSS-first.
3. `apps/portal/src/components/shared/portal-ui.tsx` para primitives portal.
4. `.github/instructions/system-vocabulary.instructions.md` para tono y copy amigable.

## Apoyo Consultivo

Usa `ui-ux-pro-max` como biblioteca de apoyo cuando necesites ampliar criterio sobre heuristicas UX, patrones de interaccion, tipografia, color, responsive, accesibilidad, performance visual, tablas, formularios, modales, dashboards o charts.

Regla de precedencia: `ui-ux-pro-max` nunca reemplaza esta skill, el manual de identidad iWana, los tokens reales, las primitives del portal ni las decisiones de accesibilidad. Si propone un patron generico que choque con iWana, adaptalo o descartalo.

Casos utiles:

- Revisar si una pantalla tiene problemas de jerarquia, densidad, responsive o estados.
- Comparar alternativas de layout antes de crear una primitive compartida.
- Afinar tablas, formularios, modales, drawers, charts o dashboards con criterios UX mas amplios.
- Detectar riesgos de accesibilidad, interaccion tactil, performance visual o carga cognitiva.

## Checklist Obligatorio

1. Clasifica la pantalla: dashboard, listado, formulario, configuracion, detalle, modal/drawer o estado.
2. Define la tarea principal del usuario y elimina ruido visual que compita con ella.
3. Usa tokens iWana antes de estilos arbitrarios: primario, secundario accesible, neutros, radios, sombras y dark surfaces.
4. Mantén jerarquia clara: un bloque dominante, secundarios subordinados y acciones frecuentes visibles.
5. Controla densidad: suficiente informacion para operar, sin comprimir controles ni crear cards dentro de cards.
6. Resuelve estados: hover, focus, active, disabled, loading, empty, error, success, warning y readonly.
7. Revisa responsive: mobile no debe ocultar acciones frecuentes ni romper lectura.
8. Valida accesibilidad: contraste AA, foco visible, labels accesibles y no depender solo del color.
9. Si hay copy visible, usa tambien `system-vocabulary-review`.
10. Si el problema requiere una segunda mirada UI/UX generalista, consulta `ui-ux-pro-max` y adapta sus sugerencias a iWana.

## Reglas Visuales iWana

- `iwana-primary` comunica estructura, confianza y acciones secundarias importantes.
- `iwana-secondary` es acento de marca; para texto sobre blanco usa `iwana-secondary-700`.
- `rounded-2xl` es el radio caracteristico, pero no justifica anidar superficies sin funcion.
- Sombras iWana deben ser suaves; evita elevacion dramatica en herramientas operativas.
- Glassmorphism es selectivo: overlays, drawers, controles flotantes o botones sobre contenido. No usarlo masivamente en tablas o formularios.
- Eyebrows deben ser discretos, consistentes y legibles; evita letter-spacing exagerado.
- Microinteracciones deben ser rapidas y naturales; no bloquean tareas ni distraen.

## Red Flags

- UI generica de Tailwind/shadcn sin rasgos iWana.
- Superficies anidadas que hacen que todo parezca importante.
- Acciones frecuentes escondidas o comprimidas en mobile.
- Gradientes, blur o glass usados como decoracion sin proposito.
- Texto de acento con `iwana-secondary` sobre blanco.
- Valores arbitrarios repetidos (`tracking-[0.22em]`, colores hex, sombras locales) sin promocion a utility o primitive.
- Estados de foco, error, empty o loading ausentes.

## Validacion Antes De Cerrar

- La primera vista muestra que se puede hacer y donde actuar.
- La pantalla se reconoce como iWana sin depender del logo.
- Mobile y desktop mantienen jerarquia y acciones operables.
- El contraste y el foco pasan revision basica WCAG AA.
- El patron reusable quedo en primitive, utility o instruccion si puede repetirse.

## Excepciones

- Flujos legacy pueden adoptar la identidad por fases, pero no deben introducir nuevos patrones contrarios al manual.
- Si identidad y accesibilidad chocan, prevalece accesibilidad y se documenta la adaptacion.