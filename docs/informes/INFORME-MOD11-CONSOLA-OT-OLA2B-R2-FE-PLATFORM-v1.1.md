# Actualización R2 — Evidencia y firma de la consola de OT (Ola 2b)

- **Versión:** 1.1
- **Fecha:** 2026-10-06
- **Agente:** AI-FE-PLATFORM (`fe-platform`)
- **Informe base:** [R2 v1.0](INFORME-MOD11-CONSOLA-OT-OLA2B-R2-FE-PLATFORM-v1.0.md)
- **Fuentes actualizadas:** UX MOD11 v1.3 §15; contrato de componente v1.1; API de OT v1.5.

## Dictamen actualizado

El copy de R2 quedó ratificado por `prod-ux` en la UX v1.3 §15. El `[BLOQUEO-P95-ENTORNO-COMPARTIDO]` sigue abierto: la medición local descrita en R2 v1.0 §4 no representa staging ni producción. Por ello R2 conserva **GO condicionado** y no cierra el gate de latencia.

La firma sigue sin verificarse contra el gate `close()` del backend real. La prueba de Chromium intercepta la API; la verificación autenticada disponible fue de lectura y no modificó una OT real.

## Cambios y evidencia posteriores

- Copy del selector, la firma, el estado de análisis y el reintento aprobado en UX v1.3 §15; se retira la consulta de ratificación de R2 v1.0 §10.
- Los límites comunes de tamaño y MIME ya se consumen desde `EXECUTION_ORDER_EVIDENCE_UPLOAD_CONSTRAINTS` en `@iwana/shared`, según la corrección registrada en R2 v1.0 §14.
- Integración posterior de historial de materiales: API v1.5, UX v1.3 y contrato de componente v1.1; el slot de evidencia conserva su contrato.
- Portal: Jest `operations/` sin caché, **44 suites y 759 pruebas aprobadas**; Playwright de B0/R2/R3/OLA1, **13/13**; `audit-ui.mjs` sin hallazgos.
- Monorepo: `pnpm typecheck --force` y `pnpm lint --force` terminaron con exit 0 y caché cero. Jest global `pnpm test -- --force -- --no-cache`: **7.873 aprobadas, 16 omitidas y 0 fallidas** (737 suites reportadas por los paquetes; 4 suites y 15 casos omitidos en API, 1 caso omitido en portal); Turbo: 10 tareas exitosas, `Cached: 0`.

## Pendiente de cierre

Falta repetir el arnés de p95/p99 con carga contra un entorno compartido que use Redis y MinIO remotos. Esta sesión no tiene endpoint ni credenciales de staging/producción. Si el p95 observado supera aproximadamente 1,5 s, se debe recalibrar `retryDelaysMs` y volver a ejecutar sus pruebas. El recibo retenido permite reintentar sin volver a subir el archivo, pero no reemplaza el gate de medición.

También falta una prueba acordada de una firma real contra el backend y aceptación por `close()`, así como recorrido con lector de pantalla real. No se hicieron escrituras en la OT real observada.
