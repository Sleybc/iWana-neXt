# ADR-110: Importación por lotes desde UISP y portabilidad del suscriptor

**Versión:** 1.3 (2026-11-15: D11 complementar titular existente; D15 conector de usuarios por API. 2026-11-26: D15 lee también tickets, pagos y tareas para hallar al personal eliminado)
**Estado:** Aprobado
**Aprobado por:** el usuario, 2026-11-12, con el G0 de la spec v1.1 (D1–D6); v1.1 el 2026-11-15 con el G0 de la [spec de complemento](../specs/2026-11-15-transversal-importacion-uisp-complementar-titular.md); v1.2 el 2026-11-15 con el G0 de la [spec de usuarios](../specs/2026-11-15-transversal-importacion-uisp-usuarios.md); v1.3 el 2026-11-26 por el usuario («Leer procesos de UISP»)
**Fecha:** 2026-11-12
**Autor:** Claude Code (criterio AI-DATA-ENG) · **Revisión pendiente:** AI-SEC-ENG
**Módulos:** plataforma (worker) · MOD05 CRM · MOD14 Facturación · MOD09 Soporte · privacy
**Spec:** [2026-11-10-transversal-exportacion-importacion-suscriptor-uisp](../specs/2026-11-10-transversal-exportacion-importacion-suscriptor-uisp.md) v1.1
**Enmienda:** `RF-MIG-03` del [PRD maestro](../prds/PRD_Sistema_ISP_Colombia_v2_4.md) (D1)

## 1. Contexto

Los tenants vienen de UISP con clientes, servicios, facturas, pagos, tickets y documentos. El ZIP por cliente no trae manifiesto ni catálogos (spec §1). La importación no puede degradar datos que iWana cifra, tipa o calcula, ni consumir numeración DIAN.

## 2. Decisiones

| # | Decisión |
|---|---|
| D1 | **Lote** (`migration_batches`) por tenant con estado `SIMULADO → CARGADO → PROMOVIDO → CONCILIADO` o `REVERTIDO`, fuente (`UISP_ZIP` en esta fase; `UISP_API` y WispHub después), conteos, rechazos por motivo y actor. |
| D2 | **Tablas intermedias** (`migration_staging_records`): `batch_id`, entidad, `external_id`, carga útil cifrada con la clave PII (AES-GCM), estado y motivo de rechazo. La simulación valida sin escribir fuera de ellas. |
| D3 | **Promoción idempotente** por `external_id` = `uisp:<entidad>:<id>` con índice único parcial por tenant en suscriptor, contrato, documento de cobro, pago, ticket y soporte documental. Repetir un lote no duplica. Cada fila promovida guarda `import_batch_id`. |
| D4 | **Equivalencias** (`migration_mappings`) por tenant y fuente: plan, método de pago, ciclo, etiqueta. Un valor sin equivalencia rechaza el registro con motivo; no se inventa. |
| D5 | **Facturas históricas**: todas, en `billing_documents` con estado `IMPORTADO`, número externo y PDF. No consumen consecutivo, no emiten eventos ni se anulan; sí cuentan en cartera para conciliar. Pagos y coberturas entran como pagos y aplicaciones con origen importado. |
| D6 | **Conciliación** por titular: saldo, facturado y pagado de iWana = `accountBalance` y totales de UISP. Una diferencia deja el lote en `PROMOVIDO` con informe; no se ajusta en silencio. |
| D7 | **Reversión** por lote, en orden inverso de dependencias, solo si nada creado después referencia las filas (pago nuevo, documento emitido, OT). Si algo las referencia, se bloquea con motivo. |
| D8 | **Etiquetas manuales** por tenant (catálogo con color + asignación al suscriptor). Las que iWana deriva (IVA, datos faltantes, Siigo) no se importan. |
| D9 | **Ejecución** asíncrona en BullMQ con payload de solo identificadores; ZIP cifrado en storage; permiso propio `migration.import.manage` (ADMIN); auditoría en la transacción que encola. |
| D10 | **Retención**: ZIP y tablas intermedias se purgan a los 30 días del lote; el lote conserva conteos y motivos sin PII. |
| D11 | **Titulares existentes** (enmendada en v1.1): la coincidencia por HMAC del documento es conflicto por defecto, nunca fusión automática. Un ADMIN con `migration.import.manage` puede confirmar, por titular, una equivalencia `TITULAR` (cliente de UISP → suscriptor de iWana, validada por HMAC al guardar y al promover) que **complementa** al suscriptor existente: sus servicios entran como contratos históricos terminados, el historial (facturas, pagos, tickets, soportes) entra completo y de la persona solo se completan campos vacíos. Nunca se fusionan suscriptores ni se sobrescriben datos; el suscriptor complementado no recibe `import_batch_id` y la reversión devuelve solo lo que el lote escribió ([spec de complemento](../specs/2026-11-15-transversal-importacion-uisp-complementar-titular.md)). Titular anonimizado o con datos bloqueados: rechazo. Estrato: pendiente de evidencia, sin fijar IVA (ADR-093). |
| D13 | **Soportes documentales** (decisión de ejecución, ola 1): no existe tabla de documentos del suscriptor; la ola C crea `subscriber_documents` (archivo en storage con la misma política de cifrado y URL firmada que los soportes del expediente, tipo, fecha, origen `IMPORTADO`, visibilidad interna, `external_id` = `uisp:document:<código>`), que la pestaña Documentos lista junto a lo existente. |
| D14 | **Deuda histórica cobrable** (decisión de ejecución, ola 5): un documento `IMPORTADO` con saldo es cartera real; admite pagos nuevos por el flujo normal de MOD14 (sugerencia y aplicación), sigue sin emitirse, numerarse ni anularse, y entra en la supresión del titular con su PDF. Cuenta en el reloj fiscal de la supresión como soporte contable (usuario, 2026-11-12). |
| D15 | **Usuarios del personal por API** (v1.2): conector de **solo lectura** a la API de UISP (`GET /crm/api/v1.0/users/admins`), uno por tenant, con la clave de aplicación cifrada y la huella TLS fijada. Los usuarios traídos se revisan en iWana: el rol se elige a mano, las coincidencias por correo se enlazan y nadie importado tiene acceso sin invitación explícita; el personal que ya no trabaja entra `INACTIVE` y fuera de Programación. El vínculo número de UISP → usuario es la equivalencia `USUARIO` (sin PII) y atribuye tickets, comentarios y pagos al promover y al «Actualizar autores» de un lote ([spec de usuarios](../specs/2026-11-15-transversal-importacion-uisp-usuarios.md)). **v1.3:** `users/admins` solo devuelve el personal vigente; para hallar al eliminado que sigue en los procesos, la misma lectura recorre por páginas (`limit` + `offset`), también con `GET` y la misma clave, `ticketing/tickets`, `payments` y `scheduling/jobs`, y guarda **solo los números** de usuario que aparecen ahí (asignado, autor de actividad, reasignación, quien registró el pago, asignado de la tarea) como filas «sin datos». El contenido de esos elementos (PII de clientes) no se guarda ni se registra. |
| D12 | **Portabilidad** (exportación, fase posterior): paquete con `manifest.json` (versión, conteos, SHA-256), JSON + PDF legible para `CONSULTA`, URL firmada que vence y retención de 30 días. |

## 3. Consecuencias

- Columnas nuevas de texto o cifradas → manifiesto de supresión e inventario K2 en la misma ola.
- `billing_documents` gana un estado que la emisión, la numeración, los eventos y la anulación deben excluir.
- El conector por API de UISP queda para una fase siguiente; esta fase cubre ZIP por cliente (uno o varios por lote). Excepción desde v1.2: el conector de lectura de usuarios del personal (D15); los clientes siguen entrando por ZIP.
