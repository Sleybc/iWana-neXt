# INFORME — Transversal · Importación desde UISP · Cierre v1.0

**Fecha:** 2026-11-12
**Spec:** [2026-11-10-transversal-exportacion-importacion-suscriptor-uisp](../specs/2026-11-10-transversal-exportacion-importacion-suscriptor-uisp.md) v1.1 (G0 2026-11-12) · **ADR:** [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md) · **Plan:** [2026-11-12-transversal-importacion-uisp](../plans/2026-11-12-transversal-importacion-uisp.md)
**Publicación:** un solo commit al terminar las 5 olas (decisión del usuario)
**Estado:** G6 ✅ · G6.5 ✅ 2026-11-12 (CI de `4b0a5971`, run 43238683376; E2E `portal-importacion-uisp-live` verde con API y worker reales)

## 1. Entregado

| Ola | Resultado |
|---|---|
| 1 | W0 (línea base); migraciones 194–198: lotes, intermedias cifradas, equivalencias, etiquetas, `external_id` + `import_batch_id`, estado `IMPORTADO`, permiso `migration.import.manage` |
| 2 | Etiquetas manuales (API, ficha, Ajustes, filtro); módulo `migration`: subida segura de ZIP, job, simulación e informe |
| 3 | Promoción idempotente (titulares, contratos, etiquetas, facturas `IMPORTADO` con PDF, pagos, tickets, soportes en `subscriber_documents`, migración 199), conciliación y reversión por lote |
| 4 | Portal Ajustes → Importaciones y pestaña Documentos; simulación anticipa rechazos de promoción; supresión borra soportes |
| 5 | E2E `portal-importacion-uisp-live`; revisiones boundary, sec-eng y contract-drift con todos sus hallazgos corregidos; migración 200 (D14 deuda importada cobrable) |

## 2. Evidencia

| Corrida | Resultado |
|---|---|
| API unit completa (sin caché) | 533 suites · 7131 tests |
| Portal unit completa | 381 suites · 3810 passed · 1 skipped (último ajuste: 45/45 focal) |
| Shared · Database unit | 586 · 429 tests |
| Integración `DB_NAME=test` (migración, cobro IMPORTADO, pagos, supresión, cli, reloj fiscal) | En verde; 5 fallos preexistentes en HEAD (4 `close-by-result` por plantilla INSTALACION_ESTANDAR v3, 1 MOD13 CA-NET-11) |

Revisiones: boundary (1 bloqueante, 2 mayores) y sec-eng (H1 alto) corregidos; contract-drift (6 mayores) corregido.

## 3. Decisiones de ejecución

D13 soportes en `subscriber_documents`; D14 deuda `IMPORTADO` cobrable y en el reloj fiscal; titular importado entra `PROSPECT`; contrato importado sigue «sin cobros» hasta «Generar primer cobro»; processor en `apps/api` (precedente); claves de storage deterministas y cifradas (`IWE1`); Parties expone `removeOrphanImportedParties`.

## 4. No verificado, deudas y riesgos

- Muestra real de UISP no contrastada (campos según la API pública); enlace PDF–factura por id o número.
- Conector por API de UISP y exportación (§2): fases siguientes.
- Titular creado a mano, anonimizado y luego importado: no se detecta (el HMAC se borra al anonimizar).
- Bloqueos de reversión: solo `PAGO_POSTERIOR` probado contra Postgres real.

## 5. Siguiente

1. Arreglos tras el commit único: `9c498701` (conteo de tareas), `4151ec8c` (re-simulación antes de promover), `87bb3281` (contexto de tenant en la promoción), `b70e03e5` y `4b0a5971` (E2E).
2. Exportación del paquete del suscriptor (ADR-110 D12).
