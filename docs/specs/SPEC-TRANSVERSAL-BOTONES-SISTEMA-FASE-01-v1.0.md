# SPEC — Sistema de botones iWana neXt · Fase 01

**Tipo:** SPEC  
**Módulo:** TRANSVERSAL — Sistema visual `@iwana/ui`  
**Fase:** 01 — Estandarización de botones y acciones  
**Versión:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-05-04  
**Modo activo:** Senior UI Systems Designer  
**Responsable de gobierno:** AI-EM-ARCH

---

## 1. Decisión visual propuesta

La dirección visual propuesta para botones en iWana neXt es **Command Pill + Utility Icon**.

La regla central queda fijada así:

> Las acciones de creación y comandos visibles usan botones tipo pill; las acciones repetidas, compactas o de tabla usan icon buttons gobernados. Los badges nunca deben parecer botones.

Esta fase no cambia funcionalidades, contratos API, roles, permisos, tenancy ni stack. Su objetivo es ordenar la gramática visual de acciones en `apps/web`, `apps/portal` y `packages/ui`.

## 2. Artefactos fuente

| Tipo              | Artefacto                                                                                                      | Uso                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Perfil            | [Perfil_IA_Senior_UI_Systems_Designer_v1.md](../roles/Perfil_IA_Senior_UI_Systems_Designer_v1.md)              | Autoridad visual y criterios de consistencia sistémica.        |
| Skill             | [.agents/skills/senior-ui-systems-designer/SKILL.md](../../.agents/skills/senior-ui-systems-designer/SKILL.md) | Método de definición visual SaaS.                              |
| Stack             | [Stack_Tecnologico.md](../prds/Stack_Tecnologico.md)                                                           | Baseline técnico de Next.js, React, Tailwind v4 y `@iwana/ui`. |
| Componente base   | [Button.tsx](../../packages/ui/src/components/Button.tsx)                                                      | Primitive actual de botones, variantes y tamaños.              |
| Referencia visual | Capturas del portal Comercial, Usuarios y Catálogo de impuestos                                                | Evidencia de inconsistencias de forma, radio, peso y acciones. |

**Artefactos faltantes detectados:** no existe guía transversal de botones. Esta especificación actúa como baseline visual inicial y queda subordinada a PRD, HLD, ADRs y design system vigente.

## 3. Problema a resolver

La auditoría visual identificó que varias pantallas usan botones manuales o variantes no gobernadas:

- CTAs tipo `Nuevo plan`, `Agregar producto` y `Nueva definición` tienen forma pill y buen peso visual, pero no están formalizados.
- Acciones `Editar` aparecen como outline pill, texto+icono o icon-only según la pantalla.
- Acciones destructivas `Eliminar` usan rojo sólido en listas donde pueden generar demasiado peso visual repetido.
- Acciones icon-only en tablas aparecen como íconos sueltos, con affordance débil.
- Badges como `Activo`, `2 registros`, `Administrador` y contadores pueden parecer botones si comparten radio, sombra o hover.

El problema no es solo estético: afecta escaneabilidad, foco, accesibilidad y predictibilidad operacional.

## 4. Taxonomía de botones aprobable

| Tipo          | Forma                    | Color                                     | Uso principal                                     |
| ------------- | ------------------------ | ----------------------------------------- | ------------------------------------------------- |
| `primary`     | Pill                     | `iwana-primary` sólido + texto blanco     | CTA principal de pantalla o panel.                |
| `secondary`   | Pill outline             | Borde/texto `iwana-primary`, fondo blanco | Acción secundaria visible.                        |
| `ghost`       | Compacto                 | Transparente, hover gris                  | Acciones ligeras de toolbar.                      |
| `destructive` | Pill sólido o icon suave | Rojo semántico                            | Confirmación destructiva o eliminación explícita. |
| `icon`        | Circular/compacto        | Gris o semántico                          | Acciones repetidas en tablas y toolbars.          |
| `link`        | Texto                    | `iwana-secondary-700` o semántico         | Navegación textual de baja prioridad.             |
| `badge`       | Pill pequeño             | Semántico suave                           | Estado/conteo, nunca acción.                      |

## 5. Anatomía visual

| Elemento   | Regla                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Radio      | Botones de comando: `rounded-full`. Botones utilitarios: `rounded-full` o `rounded-xl`, preferir circular para icon-only. |
| Altura     | `sm`: 32px; `default`: 40px; `lg`: 44-48px; `icon`: 36-40px según densidad.                                               |
| Tipografía | `text-sm font-semibold` para comandos; `text-xs` solo en botones compactos o densos.                                      |
| Iconos     | Lucide, 16px en botones normales, 18px máximo en CTA grande.                                                              |
| Gap        | 8px entre icono y texto.                                                                                                  |
| Focus      | `focus-visible:ring-2` con token accesible. Obligatorio.                                                                  |
| Loading    | Spinner de 16px + `aria-busy`; conserva ancho suficiente para evitar salto brusco.                                        |
| Disabled   | `opacity-50`, sin hover, `disabled:pointer-events-none`.                                                                  |

## 6. Reglas por contexto

| Contexto              | Regla aprobada                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| Header de pantalla    | Una acción primaria máxima. Texto + icono si crea o inicia flujo.                                               |
| Toolbar de filtros    | Usar ghost o secondary compacto. No competir con CTA principal.                                                 |
| Tabla/listado         | Usar icon buttons contenidos para acciones repetidas; evitar texto largo por fila.                              |
| Card de item          | `Editar` puede ser secondary pill si hay poco contenido; en listas densas usar icon button.                     |
| Modal de confirmación | Acción destructiva roja sólida; acción cancelar secondary/ghost.                                                |
| Badges y contadores   | No hover, no cursor pointer, altura menor que botón.                                                            |
| Mobile                | Botones primarios ocupan ancho disponible si la acción es crítica; icon buttons mantienen target táctil mínimo. |

## 7. Estados obligatorios

Todo botón implementado o migrado debe cubrir:

- `default`
- `hover`
- `active`
- `focus-visible`
- `disabled`
- `loading` cuando dispare async
- `danger` cuando represente eliminación o acción irreversible
- `selected/current` solo si el botón actúa como segmented control o filtro interactivo

El color no puede ser el único canal de estado: usar label, icono o atributo accesible según aplique.

## 8. Criterios de aceptación visual

| ID        | Criterio                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| CA-BTN-01 | `packages/ui/src/components/Button.tsx` soporta variantes coherentes con Command Pill + Utility Icon.           |
| CA-BTN-02 | Acciones primarias de creación usan `Button` con `variant="primary"`, forma pill e icono cuando aplique.        |
| CA-BTN-03 | Acciones `Editar` repetidas en tablas usan icon button o secondary compacto, sin estilos manuales divergentes.  |
| CA-BTN-04 | Acciones `Eliminar` repetidas no usan rojo sólido por fila salvo confirmación; en tabla usan icon danger suave. |
| CA-BTN-05 | Iconos accionables no quedan sueltos: tienen área clicable, hover y focus visible.                              |
| CA-BTN-06 | Badges y contadores no tienen affordance de botón si no son interactivos.                                       |
| CA-BTN-07 | No se introduce nueva librería UI ni cambio global de paleta/tipografía.                                        |
| CA-BTN-08 | Contraste de texto e iconos funcionales cumple WCAG 2.2 AA cuando aplique.                                      |
| CA-BTN-09 | Web y portal usan la misma taxonomía para CTAs, outline, ghost, destructive e icon-only.                        |
| CA-BTN-10 | La migración queda documentada en informe vivo con pantallas auditadas y deuda residual.                        |

## 9. Fuera de alcance

- Cambios backend, endpoints, DTOs, migraciones, roles, auth, MFA o tenancy.
- Rediseñar flujos funcionales de Comercial, Usuarios, CRM o Configuración.
- Crear librerías nuevas o modificar stack.
- Rehacer todos los badges del sistema fuera del alcance de botones; solo ajustar los que se confunden con botones.
- Cambiar paleta global o introducir tokens nuevos sin aprobación EM-ARCH.

## 10. Criterios de salida

- Spec, plan y prompt versionados.
- `Button` y usos prioritarios migrados o con deuda documentada.
- Validación técnica en verde: `typecheck`, `lint` y tests relevantes.
- Evidencia visual before/after de Comercial, Usuarios y Catálogo de impuestos.
- Informe vivo actualizado con stop/go y deuda visual residual.
