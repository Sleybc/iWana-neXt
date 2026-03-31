# PRD - MOD03 Configuracion Empresarial

**Version:** 1.1  
**Estado:** Aprobado  
**Fecha:** 2026-03-24  
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH (Engineering Manager + Lead Architect)  
**Trazabilidad base:** docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md  
**PRD relacionado:** docs/prds/PRD-MOD02-DASHBOARD-EMPRESA-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md  
**Informe relacionado:** docs/informes/INFORME-MOD03-AUDITORIA-ESTADO-v1.0.md  
**ADRs aplicables:** ADR-016, ADR-018, ADR-019, ADR-022, ADR-023  
**PRDs cruzados:** PRD-MOD04-USUARIOS-INTERNOS-v1.0.md, PRD-MOD05-CRM-DEFINICION-v2.0.md

> **Changelog v1.1 (2026-03-24):** Ampliacion aprobada tras auditoria de estado. Se incorporan secciones de Cobertura Comercial (nodos y zonas con mapa interactivo Leaflet), Catalogo de Planes y Valores, endpoints DELETE para soft-delete, y pruebas E2E con validacion de roles. El ABM de cobertura y planes es responsabilidad exclusiva de MOD03; MOD05 CRM los consume en modo read-only via puertos tipados.

> Nota de gobernanza: este modulo no crea un bounded context nuevo ni mueve ownership fuera de TenantModule. Formaliza la capacidad de configuracion self-service para una empresa ya creada y autenticada dentro del boundary vigente de tenant empresarial.

---

## 1. Contexto y motivacion

La empresa ya creada puede autenticarse en apps/portal, consumir contratos self-service del tenant y visualizar un dashboard empresarial basico. Sin embargo, la ruta de configuracion de empresa sigue siendo un placeholder y hoy no existe una capacidad funcional completa para administrar datos operativos, legales y politicas basicas del tenant desde la propia consola empresarial.

El estado actual observado en el repositorio es el siguiente:

- Existe lectura self-service de datos base del tenant mediante `GET /api/v1/tenants/me`.
- Existe lectura y actualizacion minima de configuracion operativa mediante `GET/PATCH /api/v1/tenants/me/settings`.
- La UI de configuracion en apps/portal expone las secciones correctas, pero no tiene formularios ni flujos de guardado.
- El contrato actual de settings cubre `timezone`, `currency`, `language`, `country`, `maxSubscribers` y `features`, pero no resuelve aun la experiencia completa de perfil empresarial y gobernanza de campos editables.

Problema de negocio:

Una empresa aprovisionada necesita completar y mantener su configuracion base para operar con coherencia regional, seguridad y trazabilidad sin depender de la consola de plataforma para cambios cotidianos.

Problema arquitectonico:

Si la configuracion empresarial no se formaliza como modulo, la plataforma queda con una mezcla incompleta entre datos del tenant, flags de settings, placeholders de UI y decisiones de permisos no explicitadas. Eso degrada el boundary entre configuracion self-service del tenant y administracion global de plataforma.

Objetivo del modulo:

Definir e implementar la capacidad de Configuracion Empresarial para que el tenant autenticado pueda consultar y actualizar su propia configuracion dentro de limites aprobados, con auditoria, aislamiento por tenant y reglas claras de ownership de cada campo.

---

## 2. Alcance en scope / fuera de scope

### En scope

- Configuracion self-service de la empresa autenticada en apps/portal.
- Consulta y edicion de perfil empresarial basico: nombre legal, NIT, email de contacto, telefono, sitio web y ubicacion operativa disponible en el modelo actual.
- Consulta y edicion de configuracion operativa: zona horaria, moneda, idioma, pais y limite operativo expuesto por el contrato vigente.
- Politicas basicas controladas por tenant sobre seguridad operativa, incluyendo MFA obligatorio a nivel empresa cuando el campo sea tenant-managed.
- Vista consolidada de configuracion con estados de carga, error, guardado exitoso y cambios pendientes.
- Auditoria de cambios de configuracion con oldValue y newValue.
- Reglas RBAC para lectura y escritura dentro del tenant.
- Alertas de onboarding relacionadas con configuracion incompleta o inconsistente.
- **(v1.1)** CRUD completo de Cobertura Comercial: nodos de red y zonas de cobertura con coordenadas geograficas, ABM visual en portal con tablas y dialogos.
- **(v1.1)** Mapa interactivo Leaflet para posicionar nodos y visualizar radios de zonas de cobertura, con tiles OpenStreetMap (sin dependencia de API keys externas).
- **(v1.1)** CRUD completo de Catalogo de Planes y Valores: tecnologia, velocidades, precios, reglas de instalacion, vigencia.
- **(v1.1)** Endpoints DELETE (soft-delete) para nodos de cobertura y zonas de cobertura.
- **(v1.1)** Validador de factibilidad comercial por coordenadas (`coverage/check`).
- **(v1.1)** Pruebas E2E Playwright para flujos CRUD de cobertura y planes, incluyendo validacion de roles (NOC read-only).

### Fuera de scope

- Creacion, suspension o reprovisioning del tenant.
- Cambio de `slug` o `schemaName`; ambos permanecen inmutables post-creacion.
- Cambios de licenciamiento, enablement comercial de modulos o features controladas por plataforma.
- CRUD completo de usuarios internos, roles, permisos o secretos tecnicos.
- Configuracion tributaria avanzada, resoluciones DIAN, numeracion o adaptadores contables definitivos.
- Parametros de infraestructura, Redis, pgBouncer, JWT, correo saliente o integraciones externas.
- Cualquier cambio de stack, tenancy o boundary entre apps/web y apps/portal.
- **(v1.1)** Geocoding inverso (conversion automatica de direccion a coordenadas) — mejora futura.
- **(v1.1)** Edicion de perimetro de zona como poligono — solo radio circular por ahora.
- **(v1.1)** Google Maps u otros proveedores de mapas con API key de pago.
- **(v1.1)** Validacion de integridad referencial al eliminar nodos/zonas vinculados a suscriptores — se implementara cuando MOD05 CRM vincule contratos a cobertura.
- **(v1.1)** Importacion masiva de nodos/zonas via CSV/Excel — mejora futura.

### Decision de boundary

- apps/portal sigue siendo la consola empresarial tenant-aware.
- apps/web sigue siendo la consola de plataforma.
- La configuracion empresarial se implementa sobre contratos self-service del tenant autenticado, nunca sobre endpoints globales `/:id` como atajo desde portal.
- Los campos tenant-managed y platform-managed deben quedar separados de forma explicita en backend y frontend.

---

## 3. Personas y casos de uso

### Personas primarias

| Persona | Rol | Necesidad principal |
| --- | --- | --- |
| Administrador de empresa | ADMIN | Mantener configuracion legal, operativa y de seguridad de la empresa |
| Responsable financiero | ACCOUNTANT | Consultar configuracion fiscal y operativa relevante para facturacion y region |
| Operador tecnico | NOC | Consultar configuracion operativa y de seguridad que afecta la operacion diaria |
| Soporte interno | SUPPORT | Ver datos base del tenant y detectar configuraciones faltantes, sin modificar informacion sensible |

### Casos de uso prioritarios

**CU-01: Ver configuracion empresarial actual**

- Un usuario interno autorizado entra a la ruta de configuracion.
- El sistema muestra datos base de empresa, configuracion operativa y politicas vigentes del tenant autenticado.

**CU-02: Actualizar perfil empresarial**

- El ADMIN modifica nombre legal, NIT, datos de contacto o ubicacion disponibles.
- El sistema valida, persiste y audita el cambio sin salir del boundary self-service.

**CU-03: Actualizar configuracion operativa**

- El ADMIN cambia timezone, moneda, idioma o pais de operacion.
- El sistema aplica merge parcial estable y devuelve el contrato normalizado.

**CU-04: Configurar politica de MFA organizacional**

- El ADMIN decide si la empresa exige MFA de forma global en el ambito tenant-managed.
- El cambio queda auditado y el dashboard refleja el estado actualizado.

**CU-05: Detectar configuracion incompleta**

- El sistema identifica faltantes criticos como NIT ausente, timezone invalida para Colombia o MFA pendiente.
- El dashboard y la vista de configuracion muestran alertas accionables.

**(v1.1) CU-06: Administrar nodos de cobertura**

- El ADMIN accede al sub-tab Cobertura dentro de Configuracion Comercial.
- Crea un nodo indicando nombre, latitud y longitud (manual o click en mapa).
- Puede editar, activar/desactivar o eliminar (soft-delete) nodos existentes.
- Los nodos se visualizan como markers en el mapa interactivo.

**(v1.1) CU-07: Administrar zonas de cobertura**

- El ADMIN crea una zona con nombre, coordenadas de centro y radio en km.
- Las zonas se visualizan como circulos en el mapa.
- Puede editar, activar/desactivar o eliminar zonas.

**(v1.1) CU-08: Visualizar cobertura en mapa interactivo**

- El mapa Leaflet muestra nodos (markers) y zonas (circulos) del tenant.
- Click en marker abre dialogo de edicion del nodo.
- Click en mapa vacio pre-llena latitud y longitud para crear nuevo nodo.
- Markers activos en azul, inactivos en gris.

**(v1.1) CU-09: Validar factibilidad comercial**

- Un usuario con rol autorizado ingresa coordenadas o direccion.
- El sistema responde si hay cobertura disponible y lista los matches (nodos y zonas).

**(v1.1) CU-10: Administrar catalogo de planes**

- El ADMIN accede al sub-tab Planes dentro de Configuracion Comercial.
- Crea planes con nombre, tecnologia, velocidades (simetrica/asimetrica), precio base, tarifa de instalacion, regla de instalacion y vigencia.
- Puede editar, activar/desactivar o eliminar (soft-delete) planes.

**(v1.1) CU-11: Consulta read-only para NOC/ACCOUNTANT/SUPPORT**

- Roles no-ADMIN ven tablas de nodos, zonas y planes sin botones de accion.
- El mapa se muestra pero sin capacidad de click-para-crear.

---

## 4. Requerimientos funcionales

### 4.1 Perfil empresarial

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-CE-01 | El modulo debe mostrar nombre de empresa, slug, estado, email de contacto, nombre legal, NIT, ciudad, departamento, pais, telefono, sitio web y fecha de creacion cuando el dato exista. | MVP |
| RF-CE-02 | El modulo debe permitir al ADMIN editar los campos empresariales tenant-managed definidos en el contrato de perfil. | MVP |
| RF-CE-03 | El slug del tenant y cualquier referencia a schema deben mostrarse como solo lectura cuando se expongan. | MVP |
| RF-CE-04 | Los cambios de perfil empresarial deben auditarse como eventos sensibles de configuracion. | MVP |

### 4.2 Configuracion operativa

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-CE-05 | El modulo debe mostrar y permitir editar `timezone`, `currency`, `language` y `country` del tenant autenticado. | MVP |
| RF-CE-06 | El backend debe seguir entregando un contrato normalizado con defaults para claves faltantes. | MVP |
| RF-CE-07 | La actualizacion debe ser parcial, idempotente a nivel de payload y sin sobrescribir claves no enviadas. | MVP |
| RF-CE-08 | El modulo debe reflejar el impacto de la configuracion operativa en dashboard y flujos dependientes del tenant. | MVP |

### 4.3 Seguridad y politicas tenant-managed

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-CE-09 | El modulo debe exponer de forma visible la politica de MFA organizacional del tenant cuando el campo sea tenant-managed. | MVP |
| RF-CE-10 | Solo ADMIN puede modificar politicas de configuracion sensibles. | MVP |
| RF-CE-11 | Las features controladas por plataforma o licenciamiento no deben ser editables desde la consola empresarial. | MVP |
| RF-CE-12 | Si el contrato tecnico actual expone flags mixtos, la implementacion del modulo debe separar visual y funcionalmente los flags editables de los solo lectura. | MVP |

### 4.4 UX y onboarding

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-CE-13 | La pagina de configuracion debe dejar de ser placeholder y convertirse en una vista funcional con formularios por seccion. | MVP |
| RF-CE-14 | La UI debe organizar la configuracion al menos en bloques de Perfil Empresarial, Configuracion Operativa y Seguridad. | MVP |
| RF-CE-15 | El usuario debe ver feedback explicito de cambios guardados, errores de validacion y estados de guardado en curso. | MVP |
| RF-CE-16 | El modulo debe mostrar alertas de configuracion incompleta o inconsistente derivadas del summary del tenant o de validaciones del propio modulo. | MVP |

### 4.5 Permisos y lectura por rol

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-CE-17 | ADMIN puede leer y editar la configuracion empresarial completa dentro del alcance tenant-managed. | MVP |
| RF-CE-18 | ACCOUNTANT y NOC pueden consultar la configuracion operativa y empresarial en modo lectura segun contratos aprobados. | MVP |
| RF-CE-19 | SUPPORT puede consultar datos base y alertas de configuracion, pero no editar configuracion sensible. | MVP |
| RF-CE-20 | Ningun rol del tenant puede leer o modificar configuracion de otro tenant. | MVP |

### 4.6 Cobertura comercial (v1.1)

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-CE-21 | El modulo debe permitir al ADMIN crear, editar, activar/desactivar y eliminar (soft-delete) nodos de cobertura comercial con nombre, latitud, longitud y estado. | MVP |
| RF-CE-22 | El modulo debe permitir al ADMIN crear, editar, activar/desactivar y eliminar (soft-delete) zonas de cobertura con nombre, coordenadas de centro y radio en km. | MVP |
| RF-CE-23 | Los endpoints DELETE para nodos y zonas deben ejecutar soft-delete (setear `deletedAt` + `isActive=false`), consistente con el patron de planes. | MVP |
| RF-CE-24 | La UI debe mostrar tablas de nodos y zonas con columnas relevantes (nombre, coordenadas, radio, estado) y acciones contextuales. | MVP |
| RF-CE-25 | La creacion y edicion de nodos y zonas debe usar dialogos modales con validacion Zod frontend (nombre requerido, lat -90 a 90, lng -180 a 180, radio 0.1 a 300 km). | MVP |
| RF-CE-26 | El validador de factibilidad (`coverage/check`) debe aceptar coordenadas y retornar los matches de nodos y zonas con indicador de disponibilidad. | MVP |
| RF-CE-27 | Los contadores de nodos activos y zonas activas deben actualizarse dinamicamente tras cada mutacion. | MVP |

### 4.7 Mapa interactivo (v1.1)

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-CE-28 | El sub-tab Cobertura debe incluir un mapa interactivo Leaflet con tiles OpenStreetMap, sin dependencia de API keys de pago. | MVP |
| RF-CE-29 | Los nodos deben representarse como markers (azul = activo, gris = inactivo) con popup de nombre. | MVP |
| RF-CE-30 | Las zonas deben representarse como circulos con radio visual proporcional a `radiusKm`. | MVP |
| RF-CE-31 | Click en marker del mapa debe abrir el dialogo de edicion del nodo correspondiente. | MVP |
| RF-CE-32 | Click en area vacia del mapa debe pre-llenar latitud y longitud en el dialogo de creacion de nodo. | MVP |
| RF-CE-33 | El mapa debe centrarse en el primer nodo existente o en coordenadas de Colombia por defecto (4.6097, -74.0817 Bogota). | MVP |
| RF-CE-34 | El mapa debe renderizarse de forma segura con SSR deshabilitado (`next/dynamic` con `ssr: false`) para evitar errores de `window` en servidor. | MVP |
| RF-CE-35 | En modo read-only (NOC/ACCOUNTANT/SUPPORT), el mapa no dispara acciones de creacion por click. | MVP |

### 4.8 Catalogo de planes y valores (v1.1)

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-CE-36 | El modulo debe permitir al ADMIN crear, editar, activar/desactivar y eliminar (soft-delete) planes del catalogo de servicios. | MVP |
| RF-CE-37 | Cada plan debe incluir: nombre, tecnologia, velocidad descarga/subida (simetrica/asimetrica), precio base, tarifa instalacion, regla de instalacion (NONE/ALWAYS/FIBER_DROP_THRESHOLD), vigencia y estado. | MVP |
| RF-CE-38 | La UI debe mostrar tabla de planes con formateo de moneda COP y velocidades en Mbps. | MVP |
| RF-CE-39 | La creacion y edicion de planes debe usar dialogo modal con validacion Zod frontend que incluya logica cruzada (velocidad simetrica, regla de instalacion). | MVP |
| RF-CE-40 | MOD05 CRM debe consumir cobertura y planes en modo read-only via puertos tipados (`CoverageReadPort`, `PlanCatalogReadPort`), sin acceso directo a tablas de MOD03. | MVP |

---

## 5. Requerimientos no funcionales

| Categoria | Requerimiento |
| --- | --- |
| Seguridad | Todo request debe resolverse via JWT valido y TenantMiddleware, sin aceptar tenant hardcodeado ni cross-tenant access. |
| Seguridad | Los boundaries externos deben validar entrada con contratos tipados y rechazar formatos invalidos para moneda, pais, longitud y campos sensibles. |
| Seguridad | No se deben registrar PII, tokens, secretos ni payloads completos de configuracion en logs de cliente o servidor. |
| Auditoria | Toda escritura sobre perfil o settings debe dejar evidencia con actor, entidad, oldValue, newValue y timestamp. |
| UX | La pagina debe ser util en desktop y mobile, con secciones legibles, foco visible y mensajes de error comprensibles. |
| Accesibilidad | El flujo debe cumplir WCAG AA en contraste, labels, navegacion por teclado y mensajes de estado. |
| Mantenibilidad | La separacion entre perfil empresarial y settings operativos debe permitir evolucionar los contratos sin romper el dashboard ni el boundary de plataforma. |
| Performance | La carga inicial de configuracion debe usar consultas self-service acotadas y mantener tiempos interactivos acordes al portal empresarial. |
| Observabilidad | Deben existir errores trazables por request sin fuga de datos sensibles. |

---

## 6. Modelo de datos borrador

### Entidades y superficies afectadas

| Superficie | Tipo | Uso en el modulo |
| --- | --- | --- |
| `public.tenants` | Entidad de plataforma | Fuente de datos empresariales base del tenant autenticado |
| `tenants.settings` JSONB | Configuracion operativa | Fuente de settings editables y defaults funcionales |
| `audit_logs` o servicio equivalente | Auditoria tenant-aware | Evidencia de cambios y actividad reciente |

### Campos empresariales base observados

| Campo | Estado actual | Regla propuesta |
| --- | --- | --- |
| `name` | Existe | Editable solo si se confirma como tenant-managed; no debe romper naming comercial de plataforma |
| `slug` | Existe | Solo lectura |
| `status` | Existe | Solo lectura |
| `contactEmail` | Existe | Editable |
| `legalName` | Existe | Editable |
| `nit` | Existe | Editable con validacion de formato aprobada |
| `city` | Existe | Editable |
| `department` | Existe | Editable |
| `countryCode` | Existe | Editable |
| `phone` | Existe | Editable |
| `website` | Existe | Editable |

### Campos operativos base observados

| Campo | Estado actual | Regla propuesta |
| --- | --- | --- |
| `timezone` | Existe | Editable |
| `currency` | Existe | Editable |
| `language` | Existe | Editable |
| `country` | Existe | Editable |
| `maxSubscribers` | Existe en contrato tecnico | Mantener criterio de ownership explicito antes de exponerlo como editable al tenant |
| `features.mfa_required_all` | Existe | Editable si se mantiene como tenant-managed |
| `features.billing` | Existe | Solo lectura si representa enablement/licenciamiento de plataforma |

### Regla de ownership de datos

El HLD y la ejecucion deben clasificar cada campo en una de estas categorias:

- tenant-managed: editable por ADMIN del tenant;
- tenant-readable: visible pero no editable;
- platform-managed: solo lectura desde portal empresarial y editable solo en apps/web o procesos de plataforma.

---

## 7. Contratos de API borrador

### Contratos de lectura

| Metodo | Ruta | Proposito |
| --- | --- | --- |
| `GET` | `/api/v1/tenants/me` | Obtener perfil empresarial base del tenant autenticado |
| `GET` | `/api/v1/tenants/me/settings` | Obtener configuracion operativa normalizada del tenant autenticado |
| `GET` | `/api/v1/tenants/me/summary` | Obtener resumen del dashboard y alertas relacionadas |
| `GET` | `/api/v1/tenants/me/coverage` | **(v1.1)** Obtener configuracion de cobertura: nodos y zonas activos |
| `GET` | `/api/v1/tenants/me/coverage/check` | **(v1.1)** Validar factibilidad comercial por coordenadas |
| `GET` | `/api/v1/tenants/me/plans` | **(v1.1)** Obtener catalogo completo de planes del tenant |

### Contratos de escritura propuestos

| Metodo | Ruta | Proposito |
| --- | --- | --- |
| `PATCH` | `/api/v1/tenants/me/profile` | Actualizar perfil empresarial tenant-managed |
| `PATCH` | `/api/v1/tenants/me/settings` | Actualizar configuracion operativa tenant-managed |
| `POST` | `/api/v1/tenants/me/coverage/nodes` | **(v1.1)** Crear nodo de cobertura |
| `PATCH` | `/api/v1/tenants/me/coverage/nodes/{nodeId}` | **(v1.1)** Actualizar nodo de cobertura |
| `DELETE` | `/api/v1/tenants/me/coverage/nodes/{nodeId}` | **(v1.1)** Soft-delete nodo de cobertura |
| `POST` | `/api/v1/tenants/me/coverage/zones` | **(v1.1)** Crear zona de cobertura |
| `PATCH` | `/api/v1/tenants/me/coverage/zones/{zoneId}` | **(v1.1)** Actualizar zona de cobertura |
| `DELETE` | `/api/v1/tenants/me/coverage/zones/{zoneId}` | **(v1.1)** Soft-delete zona de cobertura |
| `POST` | `/api/v1/tenants/me/plans` | **(v1.1)** Crear plan en catalogo |
| `PATCH` | `/api/v1/tenants/me/plans/{planId}` | **(v1.1)** Actualizar plan |
| `DELETE` | `/api/v1/tenants/me/plans/{planId}` | **(v1.1)** Soft-delete plan |

### Reglas contractuales

- Los endpoints de escritura solo aceptan ADMIN.
- Los endpoints de lectura usan el tenant del JWT autenticado y nunca aceptan `tenantId` por path o query desde portal.
- Las respuestas devuelven contratos normalizados y estables, con defaults donde aplique.
- Los errores de validacion deben ser accionables y no filtrar detalles internos.
- Si `PATCH /api/v1/tenants/me/settings` mantiene flags mixtos, el backend debe rechazar escrituras sobre claves platform-managed.

---

## 8. Criterios de aceptacion

| ID | Criterio |
| --- | --- |
| CA-CE-01 | La ruta de configuracion empresarial en apps/portal deja de ser placeholder y carga datos reales del tenant autenticado. |
| CA-CE-02 | ADMIN puede actualizar al menos perfil empresarial tenant-managed y configuracion operativa basica sin usar apps/web. |
| CA-CE-03 | ACCOUNTANT, NOC y SUPPORT ven la configuracion permitida en modo lectura sin capacidades de escritura indebidas. |
| CA-CE-04 | Ninguna operacion de portal usa endpoints globales `/:id` de tenants para editar configuracion de empresa. |
| CA-CE-05 | Los cambios quedan auditados con oldValue/newValue y actor identificable. |
| CA-CE-06 | Los flags platform-managed no pueden ser alterados desde el portal empresarial. |
| CA-CE-07 | El modulo muestra alertas de configuracion incompleta cuando falten datos criticos definidos por el negocio. |
| CA-CE-08 | Las validaciones de moneda, pais, formatos y permisos se aplican tanto en backend como en frontend donde corresponda. |
| CA-CE-09 | **(v1.1)** ADMIN puede crear, editar, activar/desactivar y eliminar nodos de cobertura desde el sub-tab Cobertura. |
| CA-CE-10 | **(v1.1)** ADMIN puede crear, editar, activar/desactivar y eliminar zonas de cobertura desde el sub-tab Cobertura. |
| CA-CE-11 | **(v1.1)** El mapa interactivo Leaflet muestra nodos como markers y zonas como circulos con radio proporcional. |
| CA-CE-12 | **(v1.1)** Click en area vacia del mapa pre-llena coordenadas en el formulario de creacion de nodo. |
| CA-CE-13 | **(v1.1)** El validador de factibilidad retorna matches correctos para coordenadas dentro y fuera de cobertura. |
| CA-CE-14 | **(v1.1)** ADMIN puede crear, editar, activar/desactivar y eliminar planes del catalogo con todas las validaciones de negocio. |
| CA-CE-15 | **(v1.1)** NOC/ACCOUNTANT/SUPPORT ven tablas de cobertura y planes en modo read-only sin botones de accion. |
| CA-CE-16 | **(v1.1)** Los endpoints DELETE ejecutan soft-delete y no eliminan fisicamente registros. |
| CA-CE-17 | **(v1.1)** Existen pruebas E2E Playwright que cubren flujos CRUD de cobertura y planes, incluyendo validacion de roles. |

---

## 9. Dependencias y riesgos

### Dependencias

- docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md
- docs/prds/PRD-MOD02-DASHBOARD-EMPRESA-v1.0.md
- docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md
- Contratos existentes de TenantModule para `me`, `me/settings` y `me/summary`
- Auditoria tenant-aware disponible para registrar cambios de configuracion

### Riesgos abiertos

| Riesgo | Impacto | Mitigacion propuesta |
| --- | --- | --- |
| El contrato actual de settings expone flags mixtos de tenant y plataforma | Alto | Clasificar ownership por campo antes de abrir formularios editables |
| Editar perfil empresarial en `public.tenants` puede mezclar necesidades operativas y administrativas globales | Medio | Separar DTO y servicio self-service del tenant respecto a contratos de plataforma |
| `maxSubscribers` puede representar limite comercial o contractual, no simple setting operativo | Medio | Mantenerlo fuera de la escritura self-service hasta validar ownership con negocio/plataforma |
| Faltan validaciones de dominio para NIT y datos legales | Medio | Definir contrato y reglas en HLD/ejecucion antes de habilitar escritura |
| La UI podria duplicar logica del dashboard en lugar de reutilizar summary y contratos existentes | Bajo | Reutilizar fuentes self-service y unificar alertas de onboarding |
| **(v1.1)** Leaflet requiere `window` y rompe SSR en Next.js | Medio | Usar `next/dynamic` con `ssr: false`; importar CSS dentro del componente cliente |
| **(v1.1)** Marker icons de Leaflet no resuelven path en Next.js por defecto | Bajo | Usar `L.icon()` apuntando a assets en `public/` o importar PNGs directamente |
| **(v1.1)** Eliminacion de nodo/zona con suscriptores vinculados en MOD05 | Medio | Soft-delete por ahora; agregar validacion de integridad referencial cuando CRM vincule contratos |
| **(v1.1)** Dependencia de paquete `leaflet` (MIT) sin auditoria previa | Bajo | Verificar licencia MIT y ejecutar `pnpm audit` post-instalacion |

### Decision documental

Por el alcance actual no se requiere ADR nuevo, siempre que la implementacion mantenga el boundary dentro de TenantModule y no cambie el ownership aprobado entre plataforma y tenant. Si durante el HLD se propone mover feature flags, cambiar ownership estructural o separar un bounded context nuevo, se debe escalar y emitir ADR.

---

## 10. Definition of Done

- Existe HLD del modulo alineado a este PRD y a los boundaries vigentes.
- Existe pagina funcional de Configuracion Empresarial en apps/portal con formularios utiles, no placeholder.
- Existen contratos backend self-service para lectura y escritura dentro del alcance aprobado.
- Los campos tenant-managed y platform-managed estan clasificados y aplicados de forma consistente.
- La auditoria de cambios de configuracion funciona y tiene evidencia en pruebas.
- Hay pruebas unitarias/integracion del backend y pruebas frontend/E2E para los flujos criticos del modulo.
- La documentacion operativa e informe vivo del modulo quedan actualizados.
- No hay rutas rotas, no hay consumo de endpoints globales desde portal y no hay violaciones cross-tenant.
- **(v1.1)** El ABM de nodos y zonas de cobertura esta operativo con tablas, dialogos y mapa Leaflet.
- **(v1.1)** El ABM de catalogo de planes esta operativo con tabla, dialogo modal y validaciones de negocio.
- **(v1.1)** Los endpoints DELETE para nodos, zonas y planes ejecutan soft-delete correctamente.
- **(v1.1)** Existen pruebas E2E que validan CRUD de cobertura y planes, incluyendo variantes de rol (ADMIN activo, NOC read-only).
- **(v1.1)** El mapa Leaflet renderiza sin errores, con markers, circles y acciones de click funcionales.
- **(v1.1)** MOD05 CRM puede consumir datos de cobertura y planes via puertos read-only tipados.
