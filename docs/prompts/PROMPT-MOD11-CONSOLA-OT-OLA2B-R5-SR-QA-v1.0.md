# PROMPT — MOD11 Consola OT · Ola 2b · R5 calidad

**Versión:** 1.0 · **Fecha:** 2026-10-05 · **Destinatario:** `sr-qa`
**Estado:** preparado; espera integración B0, R2, R3, R4 y E4-portal con informes revisados.
**G4 — revisado y adoptado por AI-EM-ARCH el 2026-10-05.** No lo emitió el orquestador. Se contrastó con el informe B0 §5 (propiedad de archivos), con el dictamen G3 y con las condiciones registradas en el plan v1.2. Se adopta sin cambios de alcance.

## 1. Entrada

Lee AGENTS.md/bootstrap/reglas, plan consola v1.2, UX del 2026-10-05 v1.1, contrato de componente v1.0, tablas v1.2, API v1.4/completion v1, G3 §8 y todos los informes del tramo. Plantilla ejecución v1.2 propuesta; AGENTS.md gobierna ubicación.

## 2. Responsabilidad

Posees pruebas de integración/regresión/accesibilidad y evidencia de navegador, no implementación productiva. No estás solo; conserva tests de otros dueños. No debilites OLA1, Commitment, Experience, payload/cierre/offline/storage. Hallazgos productivos se devuelven al dueño con ruta y reproducción. No toques contratos ni dependencias.

Verifica matriz cuatro momentos×tres lentes, permisos por allowedActions, snapshots v1/v2 y degradado, requisito opcional Sin registrar, historial por requisito, firma PNG/expiresAt/conformidad, espera y reintento mismo asset, custodia bajo demanda y paginada, refetch selectivo y ventana nula. Prueba teclado, foco/retorno/Escape, un overlay, controles de firma y anuncios; excepción WCAG 2.1.1 solo trazo. Comprueba responsive y light/dark con evidencia visual, sin atribuir cumplimiento total a una auditoría automática.

## 3. Skills y salida

Lee testing-patterns, e2e-testing-patterns, playwright-skill, wcag-audit-patterns e iwana-identity-ui-review; frontend-dev-guidelines para ubicar fallos. Typecheck, suites operations/ con conteo real y Cached: 0, audit-ui.mjs limpio; navegador con servidor nuevo, fixtures declaradas aparte de OT reales y regresión visual sin P1. La condición de medición real p95 de R2 sigue siendo un gate independiente.

## 4. Informe y decisión

Entrega `docs/informes/INFORME-MOD11-CONSOLA-OT-OLA2B-R5-SR-QA-v1.0.md`: criterio↔prueba, comandos/conteos, evidencia, hallazgos por severidad y [BLOQUEO]/[CONSULTA]. GO solo con gates cumplidos y sin P1. G6, G6.5 y G7 se registran separados; no declarar producción por una prueba local. No commit/push.
