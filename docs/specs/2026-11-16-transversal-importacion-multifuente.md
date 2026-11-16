# Spec — Transversal · Importación multi-fuente (WispHub, UISP, AdminOLT, Siigo, Excel)

**Versión:** 1.0
**Estado:** G0 pendiente del usuario. [ADR-111](../adrs/ADR-111-Importacion-Multi-Fuente.md) (propuesto)
**Fecha:** 2026-11-16
**Emisor:** Claude Code (AI-EM-ARCH)
**Módulos:** plataforma (migración) · MOD05 · MOD12 · MOD13 · MOD14 · MOD09 · privacy
**Relacionado:** [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md) v1.2 · [spec UISP](2026-11-10-transversal-exportacion-importacion-suscriptor-uisp.md) · PRD §5.8 y §15

---

## 0. Problema

iWana importa clientes de UISP por ZIP; su conector API solo lee `/version` y `/users/admins`. El resto de la información operativa vive en WispHub (cartera, cortes, IPs, MikroTik), AdminOLT (fibra) y Siigo (contabilidad y facturación electrónica), además de hojas de Excel. El lado fuente del módulo está atado a UISP (ADR-111 (propuesto) §1).

Hechos sobre las fuentes (investigación del 2026-11-16; detalle y verificación pendiente en la [referencia de APIs](../referencias/REFERENCIA-APIS-FUENTES-IMPORTACION-v1.0.md)):

| Fuente | API | Datos útiles | Riesgo |
|---|---|---|---|
| UISP CRM v1.0 + NMS v2.1 | Oficial, `X-Auth-App-Key` / `x-auth-token`, `limit`/`offset` | clients, services, plans, invoices+PDF, payments, credit-notes, tickets, jobs, documents, attributes; NMS sites y devices | Límites no publicados; rutas ONU del NMS no verificadas |
| WispHub | Oficial, OpenAPI 3.0 público (`wisphub.net/static/yaml/api/api-main.yaml`); `Authorization: Api-Key`; una sola key por empresa | clientes con IP, PPPoE, SN de ONU y estado de corte; planes y velocidades; facturas con el pago embebido (rango de fechas obligatorio); FE con CUFE; tickets; máximo 300 por página | Sin listado de pagos ni pools; devuelve contraseñas en claro; sin filtro incremental; límites no publicados |
| AdminOLT | **Sin API pública** (solo el token de integración con WispHub) | ONU (SN, External ID = id de servicio de WispHub, perfil, OLT/PON) | Vía CSV/Excel; la API se pide al proveedor |
| Siigo | Oficial: `POST /auth` → JWT de 24 h + header `Partner-Id`; 100 req/min (10 en la empresa de pruebas) | customers (NIT, DV, DANE), invoices (CUFE, `balance`) | Sandbox lento |

## 1. Decisiones del usuario (2026-11-16)

| # | Decisión |
|---|---|
| U1 | Ninguna fuente es maestra de identidad: el primer lote crea al titular, los siguientes rellenan vacíos y los choques se revisan a mano. |
| U2 | Lotes re-ejecutables con resincronización manual; WispHub y UISP terminan con corte. Sin sincronización programada. |
| U3 | AdminOLT: la ONU entra como equipo de MOD12 ligado al titular; OLT, PON y señal llegan con GPON. |
| U4 | Siigo: terceros y datos fiscales, más facturas históricas con CUFE. Sin saldo inicial ni recibos. La nómina se queda en Siigo. |
| U5 | Operación paralela en espejo: iWana no factura a los titulares importados hasta el corte. |
| U6 | WispHub es la fuente de la cartera. UISP y Siigo se migran como referencia, o no se migran. AdminOLT convive; Siigo es permanente. |

**Defaults propuestos (se confirman con el G0):**
- **P1.** Siigo y AdminOLT no crean titulares.
- **P2.** Las contraseñas PPPoE no se importan.
- **P3.** Los lotes UISP nuevos traen las facturas como referencia.
- **P4.** Antes de importar WispHub, se auditan las facturas UISP ya promovidas como cobrables en el tenant real. F1 decide si se reclasifican.

## 2. Diseño

El detalle está en ADR-111 (propuesto) D1–D10.

| Fuente | Entra a |
|---|---|
| WispHub comercial | Titulares, contactos, zonas, planes (equivalencia), contratos con estado de corte, facturas `IMPORTADO` cobrables, pagos, tickets |
| WispHub red | Routers MikroTik no gestionados, pools IPv4, IP + usuario PPPoE + perfil de velocidad (ADR de aprovisionamiento importado, por emitir) |
| UISP | Tickets con comentarios y adjuntos, jobs como referencias de OT, sitios NMS como zona/nodo, antenas como equipos MOD12. Los clientes complementan; las finanzas entran como referencia |
| AdminOLT (CSV) | ONU en `serialized_assets` en comodato, perfil → equivalencia de plan, serial al aprovisionamiento si está vacío. OLT, PON y señal van a un reporte de red pendiente |
| Siigo | Datos fiscales del titular (DV, tipo de persona, régimen, DANE) y facturas CUFE como referencia fiscal (ADR fiscal de Siigo, por emitir) |
| Excel | Plantillas de titulares, servicios, pagos e inventario |

**Estrato.** Ninguna fuente lo fija: queda `ESTRATO_PENDIENTE_EVIDENCIA` (ADR-093).

## 3. Roadmap

Cada fase tiene su propia spec (con su G0), su plan y su informe.

| Fase | Contenido | Depende de | ADR |
|---|---|---|---|
| **FD** | Descubrimiento: credenciales y verificación de las APIs con el ISP ([referencia](../referencias/REFERENCIA-APIS-FUENTES-IMPORTACION-v1.0.md) §6) | — | — |
| **F0** | Marco multi-fuente y refactor de UISP sin cambio de comportamiento (§4) | — | ADR-111 (propuesto) |
| F1 | Identidad, cola de conflictos, fuente de cartera, auditoría P4 y UI «Coincidencias por revisar» | F0 | ADR-111 (propuesto) |
| F2 | Motor Excel/CSV, plantillas y vista previa por fila | F1 | — |
| F3 | WispHub comercial (API + Excel oficial) | F1 (Excel: F2) | — |
| F4 | WispHub red → MOD13 | F3 | aprovisionamiento importado (por emitir) |
| F5 | UISP API: tickets, jobs, NMS; clientes como complemento | F1 | — |
| F6 | AdminOLT: ONU en MOD12, en convivencia | F2 | — |
| F7 | Siigo: datos fiscales y facturas de referencia | F1, F3 | fiscal de Siigo (por emitir) |
| F8 | Reportes de diferencias y duplicados | F3–F7 | — |
| F9 | Corte de WispHub y UISP; fin del espejo en MOD14 | F3, F4, F5 + externos | ADR-111 (propuesto) |
| F10 | GPON en MOD13 con AdminOLT como puente | F6 | GPON (por emitir) |

- **Ruta crítica:** FD → F0 → F1 → F3 → F4 → F9. FD se cierra antes del G0 de esta spec.
- **Paralelo:** después de F1 corren a la vez F2, F3 (API) y F5.
- **Externos que bloquean F9:**
  - MOD14 debe emitir la factura electrónica (vía Siigo o directo a la DIAN).
  - MOD13 debe controlar cortes e IPs en MikroTik.

## 4. Alcance de F0

1. **Golden tests de UISP antes de tocar código.** Un ZIP de fixture debe producir el mismo staging, la misma promoción, la misma conciliación y la misma reversión.
2. **Contrato canónico v1** en `packages/shared/src/contracts/migration/migration-canonical.contract.ts`. Cubre solo las entidades que UISP ya produce: titular, contrato, documento de cobro, pago, ticket y soporte. Cada fase agrega las suyas.
3. **Catálogos ampliados** en `migration-import.contract.ts`: fuentes, sistemas y prefijo de `external_id` por fuente (ADR-111 (propuesto) D3).
4. **Migración tenant 213:**
   - amplía los CHECK de 194 y 211;
   - en `migration_source_connections` agrega `auth_kind`, `credentials_encrypted`, `instance_slug` y `coexistence`, y copia `app_key_encrypted`;
   - `down()` bloquea si hay valores fuera del dominio anterior.
5. **`migration/sources/`:**
   - `source-adapter.port.ts` y `MigrationSourceRegistry`;
   - UISP se mueve a `sources/uisp/` como adaptador;
   - el cliente HTTP seguro (SSRF + TLS) se extrae a `sources/shared/`.
6. **Promoción desacoplada:**
   - consume el canónico;
   - el predicado `uisp:%` del puerto de Facturación pasa a «importado de las fuentes X».

**Fuera de F0:** fuentes nuevas, tablas de identidad y conflictos, lotes delta, cola de extracción y UI.

**Lotes vivos al desplegar:** un lote `SIMULADO` o `CARGADO` cuyo staging no tenga versión canónica se vuelve a simular desde su ZIP (`restageForPromotion`).

## 5. Criterios de aceptación de F0

| # | Criterio |
|---|---|
| CA1 | Los golden tests pasan sin modificarse antes y después del refactor. |
| CA2 | Las E2E `portal-importacion-uisp-live.spec.ts` y `portal-importacion-uisp-usuarios-live.spec.ts` siguen en verde. |
| CA3 | La 213 hace up/down contra Postgres real; los datos de 211 siguen leyéndose; la clave de UISP no aparece en ninguna respuesta. |
| CA4 | Ningún archivo fuera de `sources/uisp/` importa código de UISP (boundary-reviewer). |
| CA5 | Ningún `uisp:%` literal fuera de `sources/uisp/` y de la migración 194. |
| CA6 | El conteo de pruebas es igual o mayor a la línea base. |

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Regresión de UISP ya publicado | Golden tests antes del refactor (CA1) |
| R2 | Cartera duplicada UISP + WispHub | P4 en F1, antes de F3 |
| R3 | API de WispHub no verificada | F3 arranca contra el sandbox; Excel oficial como plan B |
| R4 | Credenciales de terceros | ADR-111 (propuesto) D4; sec-eng en cada fase con conexión nueva |
| R5 | Doble cobro durante la operación paralela | ADR-111 (propuesto) D9 |
| R6 | UISP sin URL pública: la guardia SSRF lo bloquea en producción | Verificación V5 en FD; si falla, ADR de conectividad (VPN) antes de F5 |
| R7 | Ninguna credencial de terceros es de solo lectura (Siigo, AdminOLT; WispHub depende del staff) | Lista de rutas GET permitidas en cada cliente HTTP, ADR-111 (propuesto) D4 |

## 7. Gobierno

- **Gates:**
  - G0 lo da el usuario sobre esta spec, después de cerrar FD.
  - G1 es un review cruzado: sr-backend revisa la factibilidad y prod-ux la UX de conflictos de F1.
  - Al aprobar el G0, el CTO aprueba ADR-111 (propuesto).
- **Plan de F0:** [2026-11-16-transversal-importacion-multifuente-f0](../plans/2026-11-16-transversal-importacion-multifuente-f0.md).
- **Pendientes del CTO:**
  - ADRs por emitir: GPON, referencia fiscal de Siigo y aprovisionamiento importado (enmienda de ADR-098); el número se asigna al crearlos.
  - Encargo de factura electrónica en MOD14.
  - Enmienda del PRD §5.8 y §15.
- **Al proveedor de AdminOLT:** pedir por escrito la documentación de su API y la exportación de ONU.
