# ADR-044: Separacion entre OrganizationSite y futuro NmsNode

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-23  
**Modo activo:** Architect  
**Autor:** AI-EM-ARCH  
**Modulo:** MOD00 Configuracion Control Plane / futuro MOD-NMS  
**Aprobado por:** CTO Humano  
**PRD relacionado:** docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md  
**Spec relacionada:** docs/specs/2026-05-23-mod00-sedes-nodos-nms-design.md  
**ADR antecedente:** docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md

---

## Contexto

MOD00 ya formalizo `OrganizationSite` como dato maestro transversal del tenant para sedes fisicas y ubicaciones operativas. En paralelo, el repo ya conserva un concepto legacy de `CommercialNode` en TenantModule orientado a cobertura/comercial, no a sede administrativa ni a nodo tecnico de NMS.

La necesidad nueva es dejar trazado un boundary claro antes de construir NMS:

1. negocio quiere mantener sedes organizacionales como maestro administrativo y operativo;
2. NMS necesitara nodos tecnicos consumibles por diagnostico, monitoreo e inventario de red;
3. la UI de sedes debe enriquecerse con coordenadas y contacto operativo local;
4. el sistema no debe deformar `OrganizationSiteType` para absorber semantica tecnica que pertenece a NMS.

La decision afecta boundaries entre modulos y el modelo futuro de integracion MOD00 -> NMS, por lo que requiere ADR propio y posterior aprobacion CTO.

---

## Decision

Se adopta como direccion arquitectonica propuesta la **separacion explicita entre `OrganizationSite` y futuro `NmsNode`**.

### D1. `OrganizationSite` permanece como maestro fisico y administrativo

`OrganizationSite` sigue representando la sede o ubicacion operativa del tenant. Su alcance incluye:

- identidad del sitio;
- clasificacion fisica principal;
- direccion y contexto geografico;
- coordenadas del sitio;
- contacto operativo local;
- capacidades organizacionales consumibles por otros modulos.

### D2. El concepto de nodo tecnico pertenece a NMS

El futuro modulo NMS sera owner de su propia entidad `NmsNode`. Esa entidad no reemplaza a `OrganizationSite` ni se modela como un `siteType` nuevo dentro de MOD00.

Consecuencia directa:

- no se agrega `NODE` a `OrganizationSiteType` en este corte documental;
- no se reutiliza `CommercialNode` como sustituto de `OrganizationSite` ni de `NmsNode`.

### D3. Relacion objetivo entre sede y nodo

La relacion objetivo es:

- una sede puede hospedar cero, uno o varios nodos tecnicos;
- un nodo tecnico pertenece como maximo a una sede organizacional;
- el futuro `NmsNode` debe referenciar `organizationSiteId` cuando exista una sede fisica anfitriona.

Para permitir migraciones o importaciones legacy, `organizationSiteId` podra nacer nullable en el primer corte de NMS, pero el modelo objetivo de operacion local debe tender a informarlo.

### D4. Coordenadas y contacto pertenecen a la sede

Las coordenadas y el contacto operativo local se documentan como parte del dato maestro de sede, no como atributos exclusivos del nodo NMS.

Campos objetivo del refinamiento de MOD00:

- `latitude`
- `longitude`
- `contactName`
- `contactPhone`

Estos campos no sustituyen responsables, asignaciones ni usuarios internos. Representan el contacto operativo del sitio.

---

## Reglas de boundary

1. MOD00 sigue siendo owner de sedes organizacionales.
2. NMS futuro sera owner de nodos tecnicos y telemetria de red.
3. NMS consumira sedes por puerto tipado o contrato aprobado; no por acceso directo a tablas de MOD00.
4. `CommercialNode` legacy de cobertura/comercial no se usa como sustituto de `OrganizationSite` ni como contrato base de NMS.
5. `OrganizationSiteType` describe clasificacion fisica del sitio; no debe absorber semantica tecnica propia de NMS.

---

## Consecuencias

### Positivas

- preserva un maestro unico de sedes para Configuracion, WFM, Billing, Inventory y futuros modulos;
- evita mezclar semantica tecnica de red con clasificacion fisica administrativa;
- deja a NMS crecer con contrato propio sin deformar MOD00;
- permite que la UI de sedes resuelva coordenadas y contacto sin esperar la construccion de NMS.

### Costos y tradeoffs

- obliga a modelar una relacion futura sitio -> nodos en vez de una simplificacion por `siteType`;
- agrega una decision de integracion para NMS que debera implementarse con tabla y contratos propios;
- requiere migracion aditiva para agregar contacto del sitio en `organization_sites`.

### Riesgos aceptados

- coexistencia temporal de `CommercialNode` legacy y futuro `NmsNode` hasta que NMS formalice su bounded context;
- durante una fase inicial de NMS podran existir nodos importados sin `organizationSiteId`, siempre que quede documentado como deuda de normalizacion.

---

## Alternativas consideradas

### A1. Agregar `NODE` a `OrganizationSiteType`

Descartada. Convierte una clasificacion fisica singular en contenedor de una semantica tecnica adicional. No expresa bien que una sede puede seguir siendo oficina, base tecnica o NOC y ademas hospedar nodos.

### A2. Reutilizar `CommercialNode` como nodo NMS

Descartada. El repo ya lo trata como concepto de cobertura/comercial legacy. Reusarlo cruzaria boundaries y mezclaria dominios distintos.

### A3. Mantener `OrganizationSite` y crear `NmsNode` separado con relacion explicita

Elegida. Es la opcion mas coherente con ADR-040, con la evolucion de MOD00 y con el crecimiento futuro de NMS.

---

## Impacto documental y de implementacion

- actualizar PRD MOD00 con addendum de sedes y nodos NMS;
- actualizar HLD MOD00 con relacion futura `OrganizationSite` -> `NmsNode`;
- crear spec de soporte para UX, datos y validaciones del refinamiento;
- cuando NMS entre en scope, crear su PRD/HLD y definir tabla `nms_nodes`, contratos y migracion de relacion.

---

## Referencias

- AGENTS.md
- docs/prds/Stack_Tecnologico.md
- docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md
- docs/specs/2026-05-15-mod09-wfm-operating-hours-design.md
- docs/adrs/ADR-028-Extraccion-Modulo-Comercial.md
