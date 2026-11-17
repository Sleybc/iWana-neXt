# PROMPT — MOD02 · Inicio «Pulso y atención» · Fase 2

**Versión:** 1.0
**Estado:** En revisión
**Fecha:** 2026-11-17
**Emitido por:** Claude Code (AI-EM-ARCH)
**Definición:** [`HLD-MOD02-DASHBOARD-EMPRESA-v3.0.md`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v3.0.md) · [ADR-112](../adrs/ADR-112-Sistema-de-Graficas-del-Portal.md) · dirección [`2026-11-16-portal-dashboard-pulso-y-atencion-direccion.md`](../specs/2026-11-16-portal-dashboard-pulso-y-atencion-direccion.md) v1.1
**Plan:** [`2026-11-17-mod02-dashboard-pulso-y-atencion-fase-2.md`](../plans/2026-11-17-mod02-dashboard-pulso-y-atencion-fase-2.md)

Reglas comunes: `AGENTS.md` manda. Solo `pnpm`. Un dato que no existe no se pinta ni se deriva. Si un contrato congelado no alcanza, `[BLOQUEO]` y parar; no se ajusta por cuenta propia. El árbol tiene cambios sin commit de otras sesiones: cada bloque toca solo sus archivos y no hace commit de lo ajeno.

## §B0 · Congelar contratos (AI-SR-FULL) — Ola 0

1. Resolver contra el esquema real las dudas G1-1, G1-2, G1-3 y G1-5 del HLD v3.0 §4, citando archivo y línea.
2. Publicar los tres contratos en `packages/shared` (tipos y esquema Zod estricto) con los campos del HLD §3. Importes como texto decimal.
3. Pasada regla → campo: cada fila de las tablas del HLD §3 apunta a una columna existente; lo que no cuadre vuelve al HLD como enmienda, no como código.

Cierra cuando: los tres contratos compilan, tienen spec de esquema y el HLD refleja las respuestas a G1.

## §B0-SEC · Revisión de autorización (AI-SEC-ENG) — Ola 0, solo lectura

Revisar el HLD §5 y el techo ya ampliado en la Fase 1 (`dashboard-role-composition.ts`): cada fuente que un rol pide está dentro del `@Roles` y del permiso de su endpoint; ninguna respuesta de N1–N3 permite reidentificar a una persona en tenants pequeños. Entrega: hallazgos con archivo y línea, y veredicto.

## §B0-DS · Contrato de gráficas (AI-DS-OWNER) — Ola 0

Emitir `docs/specs/2026-11-17-portal-graficas-ds-contrato.md`: valores de `--chart-1..4` en claro y oscuro con su tabla de contraste, API del wrapper `Chart` (barras agrupadas y líneas), estados requeridos (carga, vacío, error), resumen textual y tabla alternativa. Evaluar la promoción a `portal-ui` de la celda de pulso (`DashboardPulse.tsx`) y de las barras (`dashboard-visuals.tsx`). No escribe código.

## §B1 · N1 facturación (AI-SR-FULL) — Ola 1

`GET /billing/dashboard/summary` en archivos nuevos bajo `apps/api/src/modules/billing/dashboard/`. Reutiliza la expresión de saldo vigente; no la reescribe. Prueba de integración contra Postgres (`DB_NAME=test`) que cubra: pago anulado, imputación revertida, cortesía que salda, documento `IMPORTADO`, cada tramo de antigüedad y el límite de mes en la zona horaria del tenant. OpenAPI actualizado.

## §B2 · N2 suscriptores y N3 casos (AI-SR-FULL) — Ola 1

`GET /crm/subscribers/dashboard/summary` y `GET /assurance/dashboard/series` en archivos nuevos de su módulo. Pruebas de integración: suscriptor con borrado lógico, cancelación y reactivación en el mismo mes, caso creado y resuelto en días distintos, límite de día en la zona horaria del tenant. OpenAPI actualizado.

## §B3 · Wrapper de gráficas (AI-FE-PLATFORM) — Ola 1 (ADR-112 aprobado el 2026-11-17)

Instalar Recharts en `packages/ui`, tokens `--chart-*` en `globals.css` y wrapper `Chart` según el contrato de §B0-DS. Regla ESLint que impide importar Recharts fuera de `packages/ui`. Carga diferida sin SSR. Medir la ruta `/dashboard` en `next build` antes y después.

## §B4 · Inicio (AI-FE-PLATFORM) — Ola 2

Sobre la Fase 1 ya commiteada: clientes de API de N1–N3, tres fuentes nuevas en el fan-out y en el techo por rol, celdas de recaudo y cartera, neto y serie en suscriptores, bloque Tendencia (8) junto a la cola (4), áreas a tres columnas y área Facturación. Unitarias del módulo y `audit-ui.mjs` sin P0/P1.

## §B5 · Calidad (AI-SR-QA) — Ola 2

Ampliar `e2e/tests/portal-dashboard-empresa.spec.ts`: simulación de N1–N3, gráfica montada con axe en claro y oscuro, Contadora ve dinero y Soporte no, fuente caída no pinta cero. Trazabilidad criterio ↔ prueba de CA-PA-01…09.
