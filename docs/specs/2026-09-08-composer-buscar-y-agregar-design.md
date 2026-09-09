# Spec — Composer de salidas: "Buscar y agregar" (búsqueda primero)

**Fecha:** 2026-09-08 · **Estado:** Aprobado · **Módulo:** MOD12 Inventario · Salidas
**Origen:** con catálogos de 100+ productos, la sección "Agregar productos" (tabs Con material/Catálogo + listas con checkboxes) escala mal para el flujo dominante validado con producto: el operador **ya sabe qué llevar**. Dirección elegida: búsqueda primero. Recientes/frecuentes: fuera de alcance (siguiente iteración).

## 1. Interacción

- **En reposo** la sección muestra solo el buscador ("Busca por código, nombre, marca o escanea") y el botón "Agregar línea manual". Sin tabs, sin listas, sin checkboxes, sin barra de selección.
- **Al buscar** (≥2 caracteres, debounce 300, búsqueda de servidor contra el catálogo completo): resultados acotados (20 por página, pager ADR-065). Cada fila: `SKU · Nombre` + disponibilidad en origen como dato ("8 disponibles · 2 nuevo, 6 reacondicionado") o badge "Sin disponible en origen". Sin filtro de stock: lo buscado aparece siempre.
- **Alta**: clic en el resultado (o Enter con coincidencia única — escáner) abre el panel de captura (condición · lote · seriales · cantidad, vía `openPeekForItem`). Confirmar agrega la línea y **el foco vuelve al buscador**. Ítem ya en borrador → el panel abre en edición (CA-S2.1-FE01, sin duplicar).
- **Móvil**: misma estructura; el panel sigue siendo pantalla completa.

## 2. Se retira (superseded)

Tabs (`StockIssueSourceTabs`), listas con checkboxes (`PurchaseSuggestionList`, `StockIssueCatalogSelector`), barra "Agregar N producto(s)" (`PurchaseSelectionBar`), la cola secuencial del alta (`addFlowActive`/`addFlowQueue`/`pendingDuplicateLineId` — un panel por producto la hace innecesaria) y la auto-marca del escáner (pasa a auto-abrir panel). El stepper −/+, edición masiva, "Agregar línea manual", panel y "Modificar" no cambian.

## 3. Datos y prerrequisitos

- Búsqueda por `listPickableItems` scope `catalog` (maestro completo con disponibilidad B1). **Bug corregido en esta iteración:** el cliente no serializaba `page` en la query; el pager dependía de ello y la prueba de cubrimiento se agrega.
- La paginación de la lista vive en estado de componente (desviación conocida de ADR-065 §9, ya presente; no se cambia en esta iteración).

## 4. Vocabulario

"Buscar y agregar" (título de sección); placeholder que nombra código/nombre/escáner; badge "Sin disponible en origen"; sin enums crudos.

## 5. Criterios de aceptación

1. En reposo no hay lista ni controles de selección.
2. Buscar muestra resultados con disponibilidad; clic abre el panel; confirmar agrega la línea configurada y devuelve el foco al buscador.
3. Escáner con coincidencia única abre el panel directamente; con múltiple, los resultados quedan listados para elegir.
4. Ítem sin stock en origen: fila con badge "Sin disponible en origen"; el panel abre y su confirmación queda bloqueada.
5. Ítem ya en borrador: clic abre edición sobre esa línea (una sola fila).
6. El paginado de resultados funciona (page viaja en la query).
7. Suite del composer en verde con los casos del flujo nuevo; E2E `portal-inventory-scm` ajustado al camino de búsqueda.
