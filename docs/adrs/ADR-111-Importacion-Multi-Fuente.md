# ADR-111: Importación multi-fuente (WispHub, UISP, AdminOLT, Siigo y Excel)

**Versión:** 1.0
**Estado:** Propuesto
**Fecha:** 2026-11-16
**Autor:** Claude Code (AI-EM-ARCH) · **Revisión pendiente:** AI-SEC-ENG (credenciales de terceros), AI-DATA-ENG
**Módulos:** plataforma (migración) · MOD05 CRM · MOD12 Inventario · MOD13 Red · MOD14 Facturación · MOD09 Soporte · privacy
**Spec:** [2026-11-16-transversal-importacion-multifuente](../specs/2026-11-16-transversal-importacion-multifuente.md) v1.0
**Enmienda:** [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md) D1, D3, D11 y D14 · `RF-MIG-01…09` y §15 del [PRD maestro](../prds/PRD_Sistema_ISP_Colombia_v2_4.md)

## 1. Contexto

ADR-110 dejó un módulo de importación cuyo lado destino ya es genérico (puertos por módulo dueño en `apps/api/src/modules/migration/ports/migration-import.ports.ts`), pero cuyo lado fuente está atado a UISP:
- CHECK `source IN ('UISP_ZIP')` y `external_id ~ '^uisp:…'` en `194_migration_import_tables.ts:43,80`.
- `source_system IN ('UISP')` en 194:111 y 211:50.
- Filtros `uisp:%` en `billing-migration-import.adapter.ts:232,241,266`.

El ISP usa cinco sistemas con papeles distintos (usuario, 2026-11-16):

| Sistema | Papel hoy | Destino |
|---|---|---|
| WispHub | Facturación y pagos (cartera), cortes, IPs, velocidades de radio, MikroTik | Se migra y se apaga |
| UISP | Monitoreo de radioenlaces, programación y tickets | Se migra y se apaga; el monitoreo sigue hasta que iWana tenga NMS |
| AdminOLT | Administración de OLT y ONU de fibra | Convive hasta el módulo GPON (ADR propio, por emitir) |
| Siigo | Contabilidad, facturación electrónica, nómina | Permanente; nunca se apaga |
| Excel | Datos sueltos e inventarios | Auxiliar |

## 2. Decisiones

| # | Decisión |
|---|---|
| D1 | **Adaptador de fuente.** Cada fuente implementa una interfaz única (`extract` paginado con checkpoint, `normalize` al modelo canónico y `reconciliationTotals`) y se registra en `MigrationSourceRegistry`. El resto del pipeline (validar, resolver identidad, simular, promover, conciliar, revertir) es uno solo. Los servicios genéricos no importan código de una fuente. |
| D2 | **Modelo canónico** versionado en `@iwana/shared` (`migration-canonical.contract.ts`). El staging guarda el canónico cifrado (ADR-110 D2), su versión y su `content_hash`. |
| D3 | **`external_id` por fuente** (enmienda ADR-110 D3): `<fuente>[.<instancia>]:<entidad>:<id>` con fuente en `uisp`, `wisphub`, `adminolt`, `siigo` y `xls`. UISP conserva `uisp:` sin instancia. En Excel el id es `h<HMAC16>`, nunca un documento en claro. |
| D4 | **Conexiones** por tenant, fuente e instancia, con credenciales cifradas (AAD `tenant|conexión`) según el tipo de autenticación. Fuentes SaaS: solo hosts de una lista fija en código. UISP, que es autoalojado: URL libre con la guardia SSRF y la huella TLS actuales (D15). Ninguna credencial de terceros se trata como de solo lectura: cada cliente HTTP lleva su lista explícita de método y ruta permitidos (solo `GET`, más la autenticación de Siigo) y rechaza el resto antes de salir ([referencia de APIs](../referencias/REFERENCIA-APIS-FUENTES-IMPORTACION-v1.0.md) §1). |
| D5 | **Identidad** (enmienda ADR-110 D11). Ninguna fuente es maestra: el primer lote crea al titular y los siguientes solo rellenan vacíos. Si el HMAC del documento coincide con un titular creado por otro lote importado, se complementa automáticamente. Si coincide con un titular nativo de iWana, rige D11 sin cambio. Si solo coinciden correo o teléfono, se registra un posible duplicado. Los vínculos viven en `migration_identity_links`. Siigo y AdminOLT no crean titulares. |
| D6 | **Cola de conflictos.** Todo valor que choca va a revisión humana con el valor propuesto y el anterior, ambos cifrados. Las resoluciones posibles son conservar, descartar o reemplazar; reemplazar es la única sobrescritura y queda auditada y revertible. Se purga al resolver o a los 30 días (ADR-110 D10). |
| D7 | **Fuente de cartera** (enmienda ADR-110 D14). Solo la fuente designada por tenant crea documentos `IMPORTADO` cobrables; para este ISP es WispHub. Las facturas de otras fuentes entran como referencia fiscal, excluidas de saldo, aplicaciones, conciliación y estado de cuenta, o no entran. El detalle de Siigo (CUFE y deduplicación) va en un ADR propio, por emitir. |
| D8 | **Lotes re-ejecutables.** Un lote `DELTA` repite la extracción de una conexión y compara por `content_hash`: lo igual se salta, lo cambiado rellena vacíos y abre conflictos, y lo borrado en la fuente queda como observación sin borrar nada. Los documentos financieros importados son inmutables: un cambio en la fuente abre un conflicto. Sin cron: cada lote lo lanza un ADMIN. |
| D9 | **Operación paralela y corte.** Mientras una conexión de WispHub o UISP no tenga corte, MOD14 no factura a sus titulares importados (espejo). El corte por conexión es explícito y auditado: congela las equivalencias, desactiva la conexión y libera la facturación. AdminOLT y Siigo son conexiones de convivencia, sin corte. |
| D10 | **Extracción por API** en una cola propia, con un job por tramo de páginas, página y cursor en la misma transacción, y límite de tasa por conexión que respeta `Retry-After`. Corre en `apps/api` (ADR-105). Los payloads de cola llevan solo identificadores (ADR-110 D9). |
| D11 | **Fuera de este ADR:** contraseñas PPPoE (se queda solo el usuario hasta un ADR de RADIUS), nómina de Siigo, GPON, referencia fiscal de Siigo y aprovisionamiento importado en MOD13 (cada uno con su ADR por emitir; el último enmienda ADR-098 porque `service_provisionings` exige OT y router). |

## 3. Consecuencias

- La migración tenant 213 amplía los CHECK de 194 y 211 y generaliza `migration_source_connections`. Las tablas de identidad y conflictos llegan en la fase que las usa (spec §4).
- Toda columna nueva cifrada o de texto entra al manifiesto de supresión y al inventario K2 en la misma ola (ADR-110 §3).
- El refactor de UISP a adaptador no cambia su comportamiento; lo prueban golden tests escritos antes del refactor.
- El apagado de WispHub depende de que MOD14 emita factura electrónica y MOD13 controle cortes e IPs. Son encargos fuera de este módulo y bloquean el corte (D9).
