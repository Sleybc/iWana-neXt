# INFORME-MOD05-DEUDA-B2-v1.0

**Fecha:** 2026-10-17  
**Agente:** `sr-backend` (B2)  
**Alcance:** R5–R8 de `PROMPT-MOD05-DEUDA-CODIGO-v1.0.md`. No se modificaron contratos de `@iwana/shared`, migraciones ni las áreas asignadas a B1. No se hicieron commits.

## Resultado

Implementé cifrado AES-256-GCM y HMAC del documento fiscal en contratos y expedientes. Las escrituras guardan `fiscal_document_encrypted` y `fiscal_document_hmac`, y dejan `fiscal_document` en `NULL`. Las claves se obtienen de `ConfigService`; las lecturas descifran el valor y conservan el fallback a texto plano para filas heredadas. La conversión expediente→contrato y la creación de suscriptor usan ese mismo mecanismo. La forma pública de los DTO no cambia.

El CLI `backfill:fiscal-document` simula por defecto, acepta `--apply` y `--tenant=<uuid|slug>`, procesa lotes de 100 filas, informa únicamente conteos, pone el texto plano en `NULL` y devuelve error en modo apply si quedan filas en claro. El proceso es idempotente.

La supresión del titular en CRM, `anonymize-titular` y la comprobación de residuales incluyen `fiscal_document_encrypted` y `fiscal_document_hmac` como datos de categoría FISCAL. Se ampliaron las pruebas de backfill, conversión, compatibilidad de lectura heredada y privacidad. Los fixtures contienen solo valores sintéticos.

## Evidencia de pruebas y calidad

- Pruebas B2 focalizadas: **5 suites y 212 tests pasaron** con Node 24.13.1 directo, Jest `--runInBand --no-cache`.
- Cobertura comparable de `crm/contracts` (excluyendo de ambos cálculos archivos de pruebas e integración):

  | Métrica    | Línea base `main` (`09af7f60`) |           Actual |   Cambio |
  | ---------- | -----------------------------: | ---------------: | -------: |
  | Statements |               91.38% (689/754) | 91.73% (721/786) | +0.35 pp |
  | Branches   |               89.46% (348/389) | 89.65% (355/396) | +0.19 pp |
  | Functions  |                 87.10% (81/93) |   87.63% (85/97) | +0.53 pp |
  | Lines      |               92.24% (654/709) | 92.51% (679/734) | +0.27 pp |

  Comando aplicado en ambos estados: Jest directo con `--runInBand --no-cache --coverage`, `--collectCoverageFrom="modules/crm/contracts/**/*.ts"` y `--testPathPattern=modules/crm/contracts`. El resumen bruto del recolector incluye specs e integración no ejecutada; la comparación anterior filtra esos mismos archivos de ambos estados y muestra el código de producto.

- Suite completa final de `@iwana/api`: **390 suites pasaron, 4 omitidas; 5,283 tests pasaron, 15 omitidos; 0 fallos**. Se ejecutó sin caché con Node 24.13.1 directo en 287.2 s; resultado JSON en `node_modules/.cache/jest-b2-api-final-v2.json`.
- `tsc --noEmit -p tsconfig.typecheck.json`, ESLint sobre archivos TypeScript B2, Prettier `--check` y `git diff --check`: pasaron.
- Turbo directo con `--force --continue`: **exit 1, 0 tareas en caché, 10 tareas**. Conteos reportados por el ejecutor:

  | Paquete         | Suites                  | Tests                                |
  | --------------- | ----------------------- | ------------------------------------ |
  | `@iwana/api`    | 390 pasaron, 4 omitidas | 5,283 pasaron, 15 omitidos; 0 fallos |
  | `@iwana/db`     | 73 pasaron              | 414 pasaron                          |
  | `@iwana/worker` | 21 pasaron              | 171 pasaron                          |
  | `@iwana/shared` | 20 pasaron              | 179 pasaron                          |
  | `@iwana/ui`     | 5 pasaron               | 34 pasaron                           |
  | `@iwana/web`    | 35 pasaron, 1 falló     | 228 pasaron, 1 falló                 |
  | `@iwana/portal` | 299 pasaron, 4 fallaron | 3,034 pasaron, 2 fallaron, 1 omitido |

  El ejecutor aisló el fallo web de `SecuritySettings.spec` (18/18 pasa aislado) y el de `AccessControlSettingsClient` de portal (67/67 pasa aislado) como sensible a concurrencia. Los otros fallos de portal pertenecen al contrato B3 pendiente: dos `TS2551` por `legalRepresentativeId` y un fixture de alta sin campos nuevos. B2 no modificó `apps/portal` ni `apps/web`.

## Bloqueos de entorno

- **[BLOQUEO TÉCNICO] Integración PostgreSQL B2:** `127.0.0.1:5433` no responde; Docker Desktop devuelve `permission denied`. No se migró `tenant_test`, no se corrieron las integraciones de API ni el backfill contra PostgreSQL. No se tocó `dbiw`. Por eso no hay conteo de casos de integración ejecutados; quedaron sin ejecutar.
- **[BLOQUEO TÉCNICO] API en `/health`:** `apps/api` compiló correctamente con Node 24.13.1. El arranque temporal con configuración sintética apuntó a `iwana_it_g7_ci` en 5433 y Redis local sintético en 6399; Nest inicializó módulos, pero Redis devolvió `ECONNREFUSED` y TypeORM no completó el arranque. `GET /api/v1/health` no quedó disponible. El proceso se detuvo y no quedó servicio escuchando.
- `pnpm` intentó descargar Node 24.13.1 y falló con `ENOTFOUND` al resolver nodejs.org. Se usó el binario local existente de Node 24.13.1; no se cambió configuración.

## Seguridad y alcance

No se incluyeron PII, ciphertext, HMAC ni claves reales en código, pruebas o informe. La ruta del informe estaba libre antes de crear este archivo. La integración y el health quedan pendientes de un entorno con PostgreSQL y Redis disponibles.
