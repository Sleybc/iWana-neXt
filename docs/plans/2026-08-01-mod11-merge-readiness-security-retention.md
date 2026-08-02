# Plan MOD11: merge readiness, seguridad y retencion

**Fecha:** 2026-08-01  
**Estado:** Ejecutado parcialmente; cierre pendiente de CI Linux  
**Contrato:** documento de gates G6.5 ADR-069 (propuesto)

## Objetivo

Cerrar los riesgos de ABAC, rate limit, persistencia local, retencion de
evidencia e integridad del CI sin confundir G6/G6.5 con la autorizacion
productiva G7.

## Protocolo multiagente

1. AI-SR-FULL: guard ABAC deny-by-default, replay de evidencia y pruebas HTTP.
2. AI-DATA-ENG: migraciones tenant 100/101, FK tipada, purga y CLI de reparacion.
3. AI-PLAT-OPS: variables efimeras de CI, gates de conteo y artefactos sanitizados.
4. AI-SR-QA: QA-33 con aislamiento actor/tenant y Redis real; QA-49 storage.
5. AI-SEC-ENG: re-verificacion AppSec y veredicto v1.1; el ejecutor EM-ARCH
   cruza toda evidencia dinamica antes de registrar el gate.
6. AI-EM-ARCH: integracion, registro G6/G6.5/G7 y autorizacion explicita del push.

## Entregables

- Decorator tenant-scoped y guard sin rama fail-open.
- CI con secretos por corrida, `::add-mask::`, cleanup obligatorio y resumen
  sin tokens.
- Tests QA-33 4c/4d/4e y QA-49 sobre localStorage, sessionStorage e IndexedDB.
- `execution_upload_intent_id` tipado mediante migraciones reversibles 100/101,
  purga protegida por FK y reparación no productiva dry-run/apply.
- Replay terminal para intents purgados, fallidos, rechazados y vencidos.
- Informe AppSec v1.1 y actualización de claims Nodemailer.

## Verificacion

- Typecheck y lint monorepo: exit 0.
- Portal: 169 suites, 1080 tests, 1 skip, exit 0.
- Migraciones database: 72/72 unit y 32/32 integración PostgreSQL.
- Mailer: 15/15; throttler: 5/5; evidencia: 56/56; reliability: 61/61.
- `pnpm install --frozen-lockfile`: exit 0.
- Pendiente: primera corrida Linux real de `production-images` y
  `execution-orders-e2e`; hasta entonces G6.5 queda pendiente.
