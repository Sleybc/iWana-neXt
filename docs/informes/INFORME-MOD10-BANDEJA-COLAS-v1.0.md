# Informe de cierre — MOD10 Mesa de ayuda · Bandeja con colas de trabajo v1.0

**Fecha:** 2026-11-18 · **Spec:** [2026-11-18-mod10-bandeja-colas-de-trabajo-ux](../specs/2026-11-18-mod10-bandeja-colas-de-trabajo-ux.md) v1.0 (+D5) · **Plan:** [2026-11-18-mod10-bandeja-colas-de-trabajo](../plans/2026-11-18-mod10-bandeja-colas-de-trabajo.md)
**Estado:** G6 de ambos pasos · publicado en `2ba172cc` y `ea2853ff` · G6.5 ✅ 2026-11-18 (CI run 44356011807, intento 2)

## 1. Resultado

Bandeja de `/dashboard/assurance` con siete colas en SQL (Míos, Por vencer, Vencidos, Sin asignar, Espera del cliente, Visita técnica, Todos), búsqueda de servidor en la URL, nombre del cliente por fila con la regla de nulo del detalle, columna «Vence» en tiempo relativo, fila clicable, «Asignarme» y resumen plegado. Ningún indicador, filtro, enlace entrante ni acción se perdió (CA-1).

## 2. Decisiones tomadas durante la ejecución

| # | Decisión | Quién |
|---|---|---|
| — | «En progreso», «SLA vencidos» y el conteo de Abierto van al bloque F (columna «Se conserva» de B) | Orquestador, desde la spec |
| — | Formateador de tiempo relativo extraído a `apps/portal/src/lib/format-relative-time.ts` | Usuario |
| D5 | Vencidos incluye cerrados con plazo incumplido; coincide con «SLA vencidos» | Usuario |

## 3. Mediciones (navegador integrado, `localhost:3002`, rol administrador)

| | Antes | Paso 1 | Paso 2 |
|---|---|---|---|
| Primera fila a 1440×900 (px) | 1125 | 348 | 348 |
| Filas visibles a 1440×900 (meta ≥6) | 0 | 7 (77 px) | 7 (71 px, con nombre del cliente) |
| Scroll horizontal a 375 px | — | no | no |

## 4. Pruebas (sin caché, conteo real)

| Paquete | Línea base W0 | Cierre |
|---|---|---|
| Portal `components/assurance` | 17 suites / 424 | 20 / 542+ |
| Portal completo | — | 441 / 4930 (+1 omitida preexistente) |
| Shared | — | 56 / 786 |
| API unitaria | — | 8171 de 8172 (fallo ajeno, §6) |
| Integración assurance | — | 8 / 85 |

tsc y lint limpios en los tres paquetes; `audit-ui.mjs` P0–P2 en 0 (P3 preexistente); cobertura de los archivos tocados ≥ 80 % en líneas.

## 5. Revisores

`test-change-reviewer` (P1 y P2: cada ajuste trazado a la spec; los huecos que señaló se corrigieron), `boundary-reviewer` GO, `contract-drift-reviewer` GO, `sec-eng` GO (SEC-B4-01/02 bajos, 03/04 informativos), `gate-verifier` con los gates abiertos de §6.

## 6. Deudas y pendientes

1. **E2E ejecutadas 2026-11-18** en el 3002 del usuario: 52/52 tras añadir `exact: true` a dos selectores que el botón «Asignarme TK-…» volvía ambiguos (triage: prueba desalineada, sin regresión).
2. **`app.config.production-urls.spec.ts`:** falla por orden de suites (`MIGRATION_UISP_ALLOWED_PRIVATE_HOSTS` de `.env.development`); ajeno, viene de 46dd6d55. Dueño: sr-backend o plat-ops.
3. **SEC-B4-01:** la búsqueda por nombre puede omitir resultados sin aviso por encima de 500 suscriptores coincidentes.
4. **SEC-B4-03:** el `access_log` de Nginx registraría `search`; queda para G7 (ADR-095).
5. **R6:** la búsqueda recorre la tabla; unos 100 ms estimados con 200 000 tickets. Hoy sin índice.
6. «Resueltos hoy» cuenta desde la medianoche del servidor, no la del tenant (preexistente).
7. Contraste y Tab real en oscuro, sin verificar en navegador.
8. El seed E2E `portal-network-provisioning-live.spec.ts:465-466` crea titulares con apellido técnico («Titular mvli5…»).
9. **`BillingPolicySettingsClient.spec.tsx`:** falló en el intento 1 del CI y pasó al relanzar sin cambios; intermitente, ajena a la bandeja y sin endurecer. Dueño: fe-platform.

Frente siguiente: consola de la orden de ejecución, con su propia spec.
