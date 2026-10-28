# INFORME — MOD05 · Deuda de código · Cierre G6

**Versión:** 1.0 · **Fecha:** 2026-10-18 · **Emisor:** AI-EM-ARCH (consolidación; los veredictos son de los informes citados)
**Plan:** [2026-10-17-mod05-deuda-codigo.md](../plans/2026-10-17-mod05-deuda-codigo.md) · **Contratos:** [v1.0](../prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.0.md), deltas [v1.1](../prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.1.md) y [v1.2](../prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.2.md)
**Estado:**
- **G4: GO.**
- **G6: GO.**
- **G6.5: GO.** CI [`39126330380`](https://github.com/Sleybc/iWana-neXt/actions/runs/39126330380) sobre `d9018071`: 5/5 jobs en verde, con todos los pasos ejecutados (migraciones sin pendientes; integraciones de db, API y worker contra PostgreSQL real; E2E operativo; build de imágenes).
- G7 diferido hasta la beta ([ADR-095](../adrs/ADR-095-Topologia-Productiva-Dominio-TLS-Hosting.md)).

## 1. Qué entrega la fase

| Ítem | Entrega |
| --- | --- |
| M03 | `vatResponsibility` y `rutResponsibilities[]` reemplazan a `taxRegime` (ADR-093 D6), con el catálogo provisional DIAN; migración 153 con mapeo de los heredados |
| M04 | DV del NIT obligatorio y validado. Representante legal como Party con el rol `LEGAL_REPRESENTATIVE` (D-M04), con su `displayName` sujeto a las marcas de privacidad de su Party (M-1). La función del DV vive solo en `@iwana/shared`; se retiraron las copias de la API, del portal y la de 11 pesos de inventario |
| D-M05 | La conversión desde el expediente ya no inventa datos fiscales. La completitud se exige al activar y al contratar (422 `SUBSCRIBER_FISCAL_DATA_INCOMPLETE` con `missing`), con aviso en el portal y la migración 157 |
| Documento fiscal | Cifrado y con HMAC en contratos y expedientes (D-FIS), lectura compatible con los heredados, CLI `backfill-fiscal-document` y supresión ampliada |
| B02 | FK de `subscribers.expediente_id` (156) y del representante (154/157) |
| B04 | Enums de la entidad iguales a la DDL, con test de paridad |
| **DEF-01** (preexistente, crítica) | El alta manual de suscriptores estaba **rota por HTTP desde `15bda462`**: el `ValidationPipe` global deformaba `authorizations`. Corregida, con una utilidad de test que replica los pipes de `main.ts`, revisión de los 7 DTO con el mismo patrón y una guardia de arquitectura |
| DEF-02 | El 360° descifra el documento fiscal |

## 2. Evidencia de los gates

| Gate | Evidencia | Veredicto |
| --- | --- | --- |
| G4: seguridad | [V2](INFORME-MOD05-DEUDA-V2-SEC-v1.0.md) y [V2′](INFORME-MOD05-DEUDA-V2-SEC-v1.1.md): sin críticos ni altos; M-1 y la guardia de DTO cerrados | GO |
| G4: boundaries | [V3-BOUNDARY](INFORME-MOD05-DEUDA-V3-BOUNDARY-v1.0.md): lecturas por `IPartyReadPort`, escrituras por `IPartyWritePort`, sin acceso a tablas ajenas | GO |
| G4: contratos | [V3′](INFORME-MOD05-DEUDA-V3-REV-v1.1.md) más [FIX-C](INFORME-MOD05-DEUDA-FIX-C-v1.0.md): CD-01 a CD-08 y B-01 cerrados; CD-04 resuelto en el portal | GO |
| G6: E2E | [V1′](INFORME-MOD05-DEUDA-V1-QA-v1.1.md): **12/12** con `--retries=0` contra la API real, incluidas el alta manual y la regresión de la Fase 1b | GO |
| G6: gates | [V4″](INFORME-MOD05-DEUDA-V4-GATES-v1.2.md): turbo 10/10 y typecheck, lint y build 23/23, todo sin caché; integración de db 125/125 y de api 97 (15 omitidos declarados) **ejecutadas**; `subscriber.schema.ts` al 100 % ([FIX-D](INFORME-MOD05-DEUDA-FIX-D-v1.0.md)); `crm/subscribers` y `crm/contracts` sobre su línea base | GO |
| G6.5 | CI `39126330380` sobre `d9018071`: api 5 307, portal 3 073, db 417 (más 125 de integración), worker 171, web 229, shared 200, ui 34; integración de la API 97; 0 fallos | GO |

## 3. Defectos y lecciones

| Origen | Defecto |
| --- | --- |
| Emisor (AI-EM-ARCH) | <ul><li>La pasada regla → campo no trazó la conversión desde el expediente: se bloqueó B1 y salió D-M05.</li><li>Subí la migración 153 (`NOT NULL`) sin su código: `main` estuvo en rojo unas 3,5 h.</li><li>La redacción del launcher v1.1 sobre migrar `dbiw` era contradictoria.</li></ul> |
| Preexistente | DEF-01: los tests HTTP no replicaban los pipes globales de `main.ts` |
| Entorno | Docker y la red cayeron varias veces durante la fase; algunos agentes no alcanzaban `localhost` o probaban el puerto equivocado de Redis |

## 4. Deuda abierta

| Severidad | Deuda | Dueño |
| --- | --- | --- |
| P2 | Ejecutar `backfill-fiscal-document` y eliminar `fiscal_document`, `tax_regime` y `legal_representative_id` por tenant | G7 (runbook) |
| P2 | Catálogo del RUT provisional hasta el dictamen del contador (pregunta 7) | Contador |
| P2 | La supresión de una empresa no alcanza a su representante legal (otro titular) | Fase 2 de privacidad |
| P3 | `SupplierFormDrawer.tsx` con 61 % de cobertura (rutas ajenas al cambio del DV) | Inventario |
| P3 | `subscribers.nit` en claro (D-FIS, por diseño) | — |

## 5. Efecto en la re-auditoría de MOD05

SUB-M03, SUB-M04, SUB-B02 y SUB-B04 quedan **implementados**. Con esto no queda deuda de código abierta de la [re-auditoría](INFORME-MOD05-SUBSCRIBERS-REAUDITORIA-v1.0.md) §8. Los ⚠ del checklist (#2, #4, #10 y #12) dependen de G7 por tenant o del dictamen del contador. El PRD vigente recoge las reglas nuevas en la adenda §11 de la [Fase 04](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-04-v1.0.md).

## 6. Ubicación de la evidencia local

Los informes de la fase citan archivos en `.cache/` (logs, resultados de Jest, scripts y trazas sanitizadas de E2E). El 2026-10-18 esa evidencia se movió a `.backups/evidencia-mod05-deuda-2026-10-18/`, que es local y está ignorada por git, y las cachés de Jest se borraron. `.cache/` quedó en `.gitignore` para que ningún `git add` vuelva a incluirla.
