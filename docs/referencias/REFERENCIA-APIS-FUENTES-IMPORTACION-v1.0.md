# Referencia — APIs de las fuentes de importación (WispHub, UISP, AdminOLT, Siigo)

**Versión:** 1.0 · **Fecha:** 2026-11-16 · **Emisor:** Claude Code (AI-EM-ARCH) · **No normativa**
**Para:** [spec de importación multi-fuente](../specs/2026-11-16-transversal-importacion-multifuente.md), fase FD (descubrimiento).
**Método:** documentación oficial, contratos públicos y unas pocas peticiones sin credencial. No se usaron credenciales ni se llamó a instancias del ISP. Todo lo marcado **NV** (no verificado) se cierra con las llamadas del §6.

## 1. Resumen: cómo se conecta iWana a cada sistema

| | WispHub | UISP | AdminOLT | Siigo |
|---|---|---|---|---|
| Papel | Cartera, cortes, IPs y MikroTik. Se apaga | Tickets y programación (se migran); monitoreo de radio (sigue) | Fibra; convive | Contabilidad y FE; permanente |
| Contrato de la API | **OpenAPI 3.0 público**: `https://wisphub.net/static/yaml/api/api-main.yaml` (v1.2.0, Django REST) | CRM: blueprint Apiary público. NMS: solo Swagger en vivo (`/nms/api-docs/` de la instancia) | **Sin documentación**. Existe `/api/` con respuestas tipo Django REST | Oficial (`developers.siigo.com` + Apiary) |
| Base URL | «URL de consulta de API» de *Mi Empresa* (normalmente `https://api.wisphub.net/api/`) | `https://<host>/crm/api/v1.0`, `https://<host>/nms/api/v2.1` | `https://<empresa>.adminolt.com/api/` | `https://api.siigo.com/v1/` |
| Autenticación | `Authorization: Api-Key <prefijo.secreto>` | CRM `X-Auth-App-Key` (clave **Read**). NMS `x-auth-token` | `Authorization: Token <key>` (NV) | `POST /auth` → JWT de 24 h, `Authorization: Bearer`, `Partner-Id: iWanaNeXt` |
| ¿Credencial de solo lectura? | Indirecta: un staff dedicado con permisos de solo listar. **Una sola key por empresa** | Sí en CRM. En NMS, NV | **No** (el token puede autorizar o borrar ONU) | **No** (puede anular facturas y emitir a la DIAN) |
| Red | SaaS, salida HTTPS | **Autoalojado.** La guardia SSRF bloquea IP privadas y CGNAT en producción | SaaS | SaaS |
| Paginación | `limit`/`offset`, máximo 300 | `limit`/`offset`, máximo NV | DRF `next` (NV) | `page`/`page_size` (máximo NV, 100 según terceros) |
| Incremental | Solo rangos de fecha (facturas: emisión y pago; tickets: creación). Cliente: `ultimo_cambio` sin filtro | Solo `createdDate`; tickets ordenados por `lastActivity` | Ninguno: snapshot y diferencia por SN | `updated_start/end` en customers, invoices y credit-notes |
| Webhooks | No | CRM sí (client, service, invoice, payment; ticket y job NV), sin firma | No | Solo productos |
| Límite de tasa | No publicado (anunciado a futuro) | No publicado | No publicado | **100/min** (10 en pruebas); bloquea al usuario si más del 80 % de errores en 7 días |
| Exportación | Excel/CSV de clientes y facturas | ZIP por cliente (ya importado) | **CSV de ONU autorizadas** | Excel de terceros; XML de FE |
| Vía recomendada | API + CSV para conciliar | API (CRM) + ZIP actual | **CSV ahora**; API cuando el proveedor la documente | API |

**Control común obligatorio.** Ninguna credencial es confiable como solo lectura, así que cada cliente HTTP de iWana lleva su lista explícita de método y ruta `GET` permitidos (más `POST /auth` en Siigo) y rechaza todo lo demás antes de salir. Se agrega a ADR-111 (propuesto) D4.

## 2. WispHub

**Credencial.** El ISP crea un staff «iWana lectura» con solo estos permisos: Lista de Clientes, Lista de Facturas, Formas de Pagos Facturas, Soporte Técnico, Planes de Internet y Lista de Gastos. Desde ese staff pulsa «Generar Mi APIKey»; la clave se muestra una vez.
- Hay **una sola key por empresa**: si otra integración ya la usa (chatbot, AdminOLT), generar otra la rompe. Hay que confirmarlo antes.
- Riesgo: el detalle de velocidades de plan exige el permiso «Agregar Registros».
- NV: que un staff que no es admin pueda generar la key.

| iWana | GET | Notas |
|---|---|---|
| Servicio/contrato | `/clientes/`, `/clientes/{id_servicio}/` | `id_servicio`, `usuario`, `usuario_rb` (PPPoE), `ip`, `ip_local`, `mac_cpe`, `sn_onu`, `estado` (1 activo, 2 suspendido, 3 cancelado, 4 gratis), `fecha_corte`, `plan_internet`, `zona`, `router`, `sectorial`, `tecnico`, `coordenadas`, `ultimo_cambio`. Unos 40 filtros |
| Titular/fiscal | `/clientes/{id}/perfil/` | `cedula`, `tipo_identificacion`, `tipo_persona`, `regimen_tributacion`, `retenciones`, `email_facturacion`, `saldo` |
| Cartera | `/clientes/{id}/saldo/` | facturas pendientes |
| Planes y velocidades | `/plan-internet/`, `/plan-internet/queue/{id}/`, `/plan-internet/pppoe/{id}/` | subida/bajada, burst, `id_plan_*_adminolt` |
| Catálogos | `/zonas/`, `/router/`, `/sectorial/`, `/staff/`, `/formas-de-pago/`, `/ips-disponibles/sistema/` | `/router/` = ¿MikroTik? NV. No hay pools ni redes |
| Facturas y pagos | `/facturas/?fecha_emision__range_0/1`, `/facturas/{id}/` | **Sin rango solo devuelve 3 meses.** El pago va dentro de la factura (`fecha_pago`, `total_cobrado`, `forma_pago`, `cajero`); no hay listado de pagos. Un abono parcial genera una factura nueva |
| FE DIAN | `/facturas/sigma/` | `cufe`, `estado` → deduplicación con Siigo |
| Tickets | `/tickets/`, `/tickets/{id}/` | `respuestas[]`, `archivo_ticket` |

**Precauciones.**
- La API devuelve **en claro** `password_servicio`, `password_cpe` y `password_router_wifi`: iWana los descarta al extraer (spec P2).
- Sin orden estable: deduplicar por `id_servicio`/`id_factura` y cuadrar contra `count`.
- No hay PDF de factura por API (solo descarga en lote desde la interfaz).
- Una key inválida da 403, no 401.

## 3. UISP

**Credenciales.** Clave de aplicación **Read** del CRM (la que ya usa iWana) y token NMS aparte (NV que pueda ser de solo lectura).
- **Bloqueante de red:** la instancia debe tener un nombre o una IP pública alcanzable desde iWana. Si solo está en la LAN o tras CGNAT, el conector no funciona en producción sin una decisión de arquitectura (VPN y excepción de la guardia SSRF).

| iWana | GET (CRM salvo que se indique) | Notas |
|---|---|---|
| Programación → OT/WFM | `/scheduling/jobs`, `/jobs/tasks?jobId=`, `/jobs/comments`, `/jobs/attachments/{id}/file` | **Lo que el ZIP no trae** (`jobs.json` llega vacío). Que `ticketId` venga en el job es NV |
| Tickets | `/ticketing/tickets`, `/tickets/comments`, `/tickets/comments/attachments/{id}/file`, `/ticketing/ticket-groups`, `/ticket-tags` | `order=lastActivity`; comentarios con `createdDate` |
| Titular (complemento) | `/clients`, `/clients/{id}/contacts`, `/custom-attributes?attributeType=client` | Cédula en `companyTaxId` o en un atributo (cuál, NV) |
| Servicio | `/clients/services` | `unmsClientSiteId` → sitio NMS |
| Catálogos | `/service-plans`, `/users/admins`, `/organizations`, `/documents` | |
| Red de radio (NMS) | `/nms/api/v2.1/sites`, `/devices?siteId=`, `/devices/{id}/detail`, `/data-links`, `/outages` | serial, MAC, modelo, firmware, IP; sin telemetría |

**Precauciones.**
- El cliente actual limita cada respuesta a 5 MB, y los tickets traen `activity[]`: hay que paginar con `limit` bajo y descargar los archivos por streaming con un tope propio.
- Sin filtro de modificación: la resincronización es una relectura completa por id. Los webhooks solo aceleran, y exigen que UISP alcance a iWana.

## 4. AdminOLT

**Situación.** Su FAQ dice que la API es «futura», pero `/api/` existe, la usa WispHub y responde 401 a las rutas protegidas.
- Rutas que existen (sin probar con credencial): `/api/onus/authorized/`, `/api/onu/unauthorized/`, `/api/zones/`, `/api/naps/`, `/api/onu-types/`, `/api/vlans/{olt}/`.
- No hay rutas de planes de velocidad ni de puertos PON.
- Algunas rutas son asíncronas y ejecutan comandos en la OLT real (VLAN, señal, ONU no autorizadas): **prohibidas en ciclos programados**.

**Vía ahora:** el CSV de «ONUs Autorizadas». Columnas: ID, Nombre, SN, Estado, Modelo, OLT, Zona, NAP, Modo, VLAN, Comentarios, **External ID** (= `id_servicio` de WispHub), Fecha de autorización. Con «Columnas Visibles» se agregan Chasis, Slot, Puerto, ONU ID y Service Port. Que traiga la señal es NV.

**Cruce:** SN (único) y External ID. iWana lee el External ID y **nunca lo sobrescribe**, porque lo usa WispHub.

**Preguntas al proveedor** (enviarlas por escrito):
1. ¿Hay documentación oficial de la API (OpenAPI) y política de versiones?
2. ¿Cuál es el header exacto?
3. ¿Existe un token de **solo lectura**, con rotación, expiración y restricción por IP?
4. ¿Qué endpoints de lectura hay para OLT, puertos PON, ONU autorizadas (chasis, slot, puerto, índice, service port, VLAN, plan de velocidad, External ID), planes, zonas y NAP?
5. ¿Qué rutas consultan la OLT en vivo?
6. ¿Hay señal masiva con la hora de la última lectura?
7. ¿Cómo es la paginación y hay filtro `updated_since`?
8. ¿Cuáles son los límites de tasa?
9. ¿Hay webhooks?
10. ¿Tiene costo?
11. ¿Se puede agregar la señal y el puerto PON al CSV?
12. ¿Pueden ofrecer un segundo campo externo, para no compartir el External ID con WispHub?

## 5. Siigo

**Credencial.** Siigo Nube → Alianzas → «Mi Credencial API» → usuario API + `access_key`. Requiere plan Profesional independiente, Emprendedor o Premium (costo del API: NV). `Partner-Id` fijo `iWanaNeXt`, sin registro documentado. **No hay credencial de solo lectura.**

| iWana | GET | Notas |
|---|---|---|
| Datos fiscales del titular | `/customers` (+`?identification=`) | `id_type.code` (13 CC, 31 NIT…), `identification`, `check_digit`, `branch_office`, `person_type`, `fiscal_responsibilities`, dirección con DANE, `contacts`, `metadata.last_updated`. Por defecto filtra `type=Customer&active=true`: **pedir también `active=false`** |
| Factura de referencia | `/invoices` por ventanas de `date_start/end`; `/invoices/{id}`, `/{id}/pdf`, `/{id}/xml` | `prefix`, `number`, `stamp.status`, `stamp.cufe` (solo si `Accepted`), `total`. Profundidad histórica NV |
| Nota crédito | `/credit-notes` | `stamp.cude`, `invoice.id` (solo conteo, spec U4) |
| Catálogos | `/document-types?type=FV`, `/users` | prefijos electrónicos |

**Precauciones.**
- Limitar a 90 req/min con backoff ante 429, 408, 503 y 504, y timeout de 120 s.
- Cortar ante una racha de errores, para no caer en el bloqueo del 80 %.
- Cachear el token unas 23 h.
- El cruce por CUFE con WispHub solo funciona si WispHub emitió a través de Siigo (NV).
- La clave del tercero es `id_type + identification + branch_office`.

## 6. Lista de verificación con el ISP (fase FD)

El ISP crea las credenciales y ejecuta solo GET; iWana no las usa hasta que existan en el tenant. Las respuestas que se guarden como fixtures se **anonimizan** antes de entrar al repo.

| # | Sistema | Acción del ISP | Cierra |
|---|---|---|---|
| V1 | WispHub | Confirmar si ya hay una APIKey en uso; crear el staff de lectura y generar la key | Credencial segura |
| V2 | WispHub | `GET /clientes/?limit=2`, `?limit=500`, dos lecturas `limit=300` comparadas, `/{id}/`, `/perfil/`, `/saldo/`, `?estado=2&limit=5` | Tope, orden, formatos de `estado`, `fecha_corte` y `coordenadas` |
| V3 | WispHub | `/plan-internet/queue/{id}/` y `/pppoe/{id}/` con el staff de lectura | Permiso «Agregar Registros» |
| V4 | WispHub | `/facturas/?fecha_emision__range_0=2015-01-01&…_1=2026-12-31&limit=2`, `/facturas/{id}/`, `/facturas/sigma/?limit=2`, `/router/` | Histórico, pagos, CUFE, MikroTik |
| V5 | UISP | Confirmar URL pública alcanzable desde el servidor de iWana | Bloqueante de red |
| V6 | UISP | `/scheduling/jobs?limit=5`, `/jobs/{id}`, adjuntos; `/custom-attributes?attributeType=client`; `/clients?limit=1000` | Jobs, atributo de cédula, tope |
| V7 | UISP | Pantalla de webhooks (¿eventos `ticket.*` y `job.*`?) y pantalla de tokens NMS (¿solo lectura?) | Resincronización y NMS |
| V8 | AdminOLT | Exportar el CSV de autorizadas con Chasis, Slot, Puerto y ONU ID visibles; enviar el cuestionario del §4 | Vía CSV y futuro de la API |
| V9 | Siigo | Confirmar el plan con API; crear la credencial; `/users`, `/document-types?type=FV`, `/customers?page_size=100` y `101`, `?active=false`, `/invoices?date_start=2018-01-01&date_end=2018-12-31&page_size=5`, `/invoices/{id}` | Plan, tope, profundidad, CUFE |

### Cómo ejecutar la sonda

`scripts/import-sources-probe.mjs` hace las llamadas V2–V6, V7 (NMS) y V9 y lee el CSV de V8. V1 y las pantallas de V7 siguen siendo manuales.

- **Variables:** `WISPHUB_BASE_URL`, `WISPHUB_API_KEY`; `UISP_BASE_URL`, `UISP_APP_KEY`, opcionales `UISP_NMS_TOKEN` y `UISP_TLS_SHA256` (huella del certificado autofirmado); `SIIGO_USERNAME`, `SIIGO_ACCESS_KEY`. La fuente sin sus variables se omite. Nunca se pasan credenciales como argumento.
- **Comando:** `pnpm probe:import-sources [--only wisphub,uisp,adminolt,siigo] [--adminolt-csv <ruta>] [--out <dir>]`.
- **Informe:** `informe-sonda-fuentes.json` en un directorio nuevo del temp del sistema, o en `--out` (vacío y fuera del repo). La consola muestra la tabla V1–V9 (OK, FALLA o NO EJECUTADO) y la ruta.
- **Qué no contiene:** valores de clientes, facturas ni equipos, ni credenciales o token. Guarda status, tiempos, tamaños, cabeceras de paginación y tasa, la forma de cada respuesta, el patrón de fechas y formatos, y los valores de una lista blanca de enumerados (estado, tipos y prefijos). Si UISP presenta un certificado no confiable, guarda su huella para fijarla tras verificarla por otro canal.
- **Garantías:** solo `GET` sobre una lista fija de rutas, más `POST /auth` de Siigo. Siigo va a una petición cada 0,7 s y se corta tras 5 errores seguidos. Cada fuente tiene un tope de 30 llamadas. AdminOLT no recibe llamadas.

## 7. Fuentes

- **WispHub:**
  - Spec OpenAPI `https://wisphub.net/static/yaml/api/api-main.yaml`.
  - [API de WispHub](https://wisphub.net/documentacion/articulo/api-de-wisphub-383/) y [sugerencias](https://wisphub.net/documentacion/articulo/sugerencias-para-usar-el-api-717/).
  - [Postman oficial](https://wisphub-media.s3.us-east-1.amazonaws.com/documentos/postman/WispHub+API.postman_collection.json).
  - [Lista de pagos](https://wisphub.net/documentacion/articulo/lista-de-pagos-497/) y [sincronizar SN con AdminOLT](https://wisphub.net/documentacion/articulo/sincronizar-sn-y-id-servicio-adminolt-227/).
- **UISP:**
  - [manual técnico](../informes/INFORME-UISP-MANUAL-TECNICO-v1.0.md) §8–§9.
  - [blueprint CRM](https://unmscrm.docs.apiary.io/).
  - [NMS en apis.io](https://apis.io/apis/ubiquiti/uisp-nms-api/).
- **AdminOLT:**
  - [token](https://adminolt.com/documentacion/articulo/integrar-adminolt-token-80/), [detalle de ONU](https://adminolt.com/documentacion/articulo/ver-detalles-de-onu-25/) y [Excel de ONU](https://adminolt.com/documentacion/articulo/actualizar-onu-desde-excel-19/).
  - [integración desde WispHub](https://wisphub.net/documentacion/articulo/adminolt-450/).
  - Referencia SmartOLT: [api.smartolt.com](https://api.smartolt.com/view/metadata/71CXC8s).
- **Siigo:**
  - [autenticación](https://developers.siigo.com/docs/siigoapi/autenticacion/autenticacion), [Partner-Id](https://developers.siigo.com/docs/siigoapi/partner-id/), [errores](https://developers.siigo.com/docs/siigoapi/manejo-de-errores/) y [bloqueo de usuarios](https://developers.siigo.com/docs/siigoapi/bloqueo-de-usuarios/).
  - [blueprint](https://siigoapi.docs.apiary.io/) y [planes con API](https://www.siigo.com/blog/siigo-api/).

Queda sin verificar todo lo marcado NV, en especial la red de UISP, el permiso de la key de WispHub y la API de AdminOLT. El riesgo principal es que ninguna credencial sea de solo lectura: el control vive en iWana.
