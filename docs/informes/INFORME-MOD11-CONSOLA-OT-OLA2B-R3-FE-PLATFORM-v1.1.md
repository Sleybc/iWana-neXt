# Actualización R3 — Custodia e historial de materiales de la consola de OT

- **Versión:** 1.1
- **Fecha:** 2026-10-06
- **Agente:** AI-FE-PLATFORM (`fe-platform`)
- **Informe base:** [R3 v1.0](INFORME-MOD11-CONSOLA-OT-OLA2B-R3-FE-PLATFORM-v1.0.md)
- **Fuentes actualizadas:** API de OT v1.5; UX MOD11 v1.3 §14.1–14.2; contrato de componente v1.1.

## Dictamen actualizado

Se resuelve la deuda de atribución exacta del historial de consumos registrada en R3 v1.0 §8–9. API y portal distinguen ahora consumos enlazados al requisito MATERIAL exacto y consumos antiguos sin esa procedencia. Se conserva el **GO funcional de R3**; los pendientes de backend autenticado, custodia de cuadrilla y lector de pantalla siguen declarados abajo.

## Contrato y comportamiento

- API v1.5 acepta `requirementKey` opcional al registrar consumo y devuelve `requirementKey: string | null` en el historial.
- La clave enviada debe identificar exactamente un requisito MATERIAL del snapshot inmutable de la OT, y la categoría del artículo debe coincidir con la categoría declarada por ese requisito. El servicio consulta Inventario por su interfaz tipada; no lee tablas de otro módulo.
- La migración tenant 137 añade la columna nullable. No atribuye registros existentes; su `NULL` expresa procedencia desconocida. El rollback rechaza perder claves ya persistidas.
- El portal muestra cada consumo con clave bajo el requisito coincidente. Consumos `null` o ausentes en respuestas de clientes anteriores aparecen una sola vez en «Consumos sin requisito asociado»; nunca se duplican bajo todos los requisitos.
- Conteo y paginación reflejan el conjunto global de la OT una sola vez. Los vacíos por requisito aparecen solo cuando la colección está completa y no hay error de lectura.
- Un error del historial conserva registros y metadatos previamente válidos y ofrece «Reintentar» para volver a consultar solo consumos.
- El evaluador mantiene su fallback legado por categoría y disposición para consumos sin clave. Solo una clave almacenada exige coincidencia exacta.

## Verificación

- Jest API focalizado: **6 suites y 240 pruebas aprobadas**; cubre validación del DTO, persistencia, serialización, rechazo de clave/categoría inválida y evaluación.
- Migración 137: **3 pruebas unitarias aprobadas** y **1 integración aprobada contra PostgreSQL real** en schema aislado.
- Portal: typecheck aprobado; Jest `operations/` sin caché, **44 suites y 759 pruebas aprobadas**; lint sin errores (45 advertencias preexistentes fuera de Operations); `audit-ui.mjs` sin hallazgos.
- Playwright B0/R2/R3/OLA1: **13/13** aprobadas en Chromium con backend interceptado. El fixture R3 ahora incluye `requirementKey`.
- Monorepo: typecheck y lint con exit 0, caché cero; Jest global `pnpm test -- --force -- --no-cache`: **7.873 aprobadas, 16 omitidas, 0 fallidas**; Turbo reportó 10 tareas exitosas y `Cached: 0`.

## Pendientes que permanecen

- No se probó el flujo de escritura de consumo con una sesión autenticada contra el backend del portal. La integración de migración sí se ejecutó contra PostgreSQL real; el usuario autenticado solo observó lecturas GET en una OT real y no se hicieron mutaciones.
- Custodia `CREW` de punta a punta y rendimiento bajo catálogos grandes siguen sin verificación específica.
- La lectura con NVDA, JAWS o VoiceOver real sigue pendiente; Jest y Chromium automatizado no sustituyen esa prueba.

La consulta sobre «asignación compatible» queda documentada como resuelta conforme a UX §5: se ofrecen artículos activos de la categoría requerida que pertenecen a la custodia del responsable de la OT.
