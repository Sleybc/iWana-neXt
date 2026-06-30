# RUNBOOK: Escala de capas z-index para Portal

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-06-04  
**Modulo:** Portal empresarial  
**Owner:** Frontend platform

## 1. Objetivo

Definir una escala unica de capas visuales para evitar conflictos entre sidebar, header, overlays, drawers y modales en `apps/portal`.

## 2. Regla raiz

1. Ningun componente del portal debe usar valores extremos como `z-[9999]` o `z-[999]` sin excepcion documentada.
2. Todo overlay de bloqueo visual debe renderizarse por portal a `document.body`.
3. El fondo atenuado de overlays debe cubrir toda la app, incluyendo menu lateral y header.

## 3. Escala oficial de capas (Portal)

| Capa | Uso | Clase recomendada |
| --- | --- | --- |
| Base | Contenido normal | `z-0` |
| Header sticky | Barra superior del portal | `z-30` |
| Overlay mobile sidebar | Fondo del drawer mobile | `z-35` |
| Sidebar | Menu lateral | `z-40` |
| Overlay modal/drawer global | Fondo atenuado principal | `z-[100]` |
| Superficie modal/drawer global | Contenedor visible principal | `z-[120]` |

## 4. Convenciones por patron

### 4.1 Sidebar + header

1. Sidebar por encima del header.
2. Header por encima del contenido base.
3. Ambos por debajo de cualquier modal o drawer de flujo.

### 4.2 Drawer/modal de flujo operativo

1. Render en `document.body` con `createPortal`.
2. Overlay bloqueante con `position: fixed` e `inset-0`.
3. Drawer o modal por encima del overlay y del shell.

### 4.3 Overlay mobile del sidebar

1. Solo para `lg:hidden`.
2. Debe quedar por debajo del sidebar mobile.
3. Nunca debe superar capas de modales o drawers globales.

## 5. Red flags

1. El menu lateral no se atenúa cuando un drawer/modal esta abierto.
2. El header queda por encima de un modal.
3. Overlays visibles solo dentro del contenido y no en toda la pantalla.
4. Uso de z-index arbitrario para tapar problemas de stacking context.

## 6. Checklist antes de merge

1. Validar que overlay cubra sidebar y header.
2. Validar click de cierre en backdrop.
3. Validar comportamiento en desktop y mobile.
4. Validar foco y navegacion por teclado en panel abierto.
5. Validar que no se introdujeron nuevos `z-[9999]` o similares.

## 7. Archivos de referencia actual

1. apps/portal/src/components/layout/Sidebar.tsx
2. apps/portal/src/components/layout/TopHeader.tsx
3. apps/portal/src/app/dashboard/layout.tsx
4. apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx

## 8. Notas de compatibilidad

1. Primitives compartidas de `@iwana/ui` que usan portal propio pueden manejar su propia escala interna.
2. Si una primitive necesita quedar sobre el modal actual, documentar la excepcion en el informe de fase.
3. Cualquier nueva excepcion debe dejar evidencia visual y prueba de no regresion.
