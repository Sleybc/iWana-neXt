# MOD13 — Modelo de interfaces, direcciones locales y redes IPv4

**Versión:** 1.7  
**Estado:** Modelo aprobado G1–G4; E-2/E-5 ejecutados en PostgreSQL desechable con semilla sintética determinista; E-6/E-7 y G6 siguen pendientes.  
**Fecha:** 2026-10-27  
**Modo:** Architect, consulta AI-DATA-ENG a AI-EM-ARCH  
**Encargo:** O0-D del [prompt de definición](../prompts/PROMPT-MOD13-INTERFACES-IPV4-DEFINICION-v1.0.md), más diseño de baseline E-2/E-5 del [plan de orquestación](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md).

La decisión humana de opción B y las revisiones G1–G4 constan en el plan vigente y el [informe vivo](../informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md). Las secciones 1–10 conservan el modelo aprobado; 11 y 12 son el corte histórico O0-D. La v1.7 registra el generador sintético y la evidencia E-2/E-5 en una base aislada, sin cambiar el esquema productivo ni ejecutar IPAM. G4 congela el contrato API; no equivale a G6 ni habilita captura. G6 permanece NO PASS, `NETWORK_IP_PROTECTION=PENDING`; E-6/E-7 y E-8 continúan pendientes. Este documento no crea tablas, migraciones ni endpoints.

**Cambio v1.6 → v1.7:** añade el diseño y resultado ejecutado del baseline sintético determinista en §13: migraciones reales tenant hasta 164, cuatro cortes E-5, distribución por estado, huellas SHA-256 y clones E-6/E-7 en bases desechables separadas. No altera el modelo de producción ni levanta gates.

## 1. Fuentes, hechos y alcance

Prevalecen `AGENTS.md`, el bootstrap del workspace, las instrucciones documentales y el protocolo multiagente. Se consultaron las skills `postgresql`, `architect-review` e `iwana-tenant-migration` (esta última como apoyo condicional). `docs-architect` no se abrió en la revisión v1.1; la v1.0 la citaba sin haberla leído, y esa cita queda corregida. Los consejos de generación automática y migraciones tenant dinámicas de la skill genérica `database-migration` no se aplican: contradicen la fuente maestra y el runner real.

Baseline normativo:

- [PRD MOD13 v1.1](../prds/PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md) y [HLD MOD13 v1.1](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md).
- [ADR-044: separación entre sede y nodo técnico](../adrs/ADR-044-Separacion-OrganizationSite-NmsNode.md), aprobado.
- [ADR-098: IPAM y aprovisionamiento certificado](../adrs/ADR-098-IPAM-y-Aprovisionamiento-Certificado-MOD13.md), aprobado.
- [HLD addendum de interfaces IPv4](../hlds/HLD-MOD13-INTERFACES-IPV4-ADDENDUM-v1.0.md), re-sync en revisión de HLD v1.1; sus gates siguen pendientes. La protección de IP locales remite a [ADR-101 v1.1](../adrs/ADR-101-Enmienda-ADR-098-Proteccion-IP-Infraestructura-MOD13-v1.1.md), aprobado por el CTO el 2026-10-26; esta aprobación no publica ni congela los contratos runtime.
- [Análisis de los seis puntos del catálogo](../informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md), en revisión, y [spec UX vigente](2026-10-22-mod13-aprovisionamiento-ux.md).

| Hecho comprobado en el código o la norma                                                                                                               | Referencia local                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| El router conserva una referencia LAN libre y opcional, sin colección de interfaces                                                                    | `packages/database/src/entities/network-router.entity.ts:29`; `packages/shared/src/contracts/network/network.bodies.ts:62`                                                                                                                 |
| Cada red pertenece a un router y tiene CIDR, gateway, rango y exclusiones propios                                                                      | `packages/database/src/entities/ipv4-network.entity.ts:17` (entidad completa en 9–55)                                                                                                                                                      |
| Pools limitados a /16–/30; gateway dentro del bloque; bloques sin solapamiento por tenant                                                              | `packages/database/src/migrations/tenant/160_network_catalog.ts:59–63` (prefijo, gateway, rango) y `:75–77` (`EXCLUDE`)                                                                                                                    |
| Gateway y CIDR no se editan mediante PATCH de red                                                                                                      | HLD v1.1 §6.2 (fila PATCH de `ipv4-networks`); `packages/shared/src/contracts/network/network.bodies.ts:138–147` (`.strict()`, sin `cidr` ni `gateway`); `apps/portal/src/components/network/Ipv4NetworkDrawer.tsx:277–288` (solo lectura) |
| Las tres rutas IPAM (manual, automática, ocupación) ya excluyen gateway, red, difusión y exclusiones; ninguna considera IP locales, que hoy no existen | `apps/api/src/modules/network/ipam.service.ts:139–142` (manual), `:195–198` (automática), `:228–231` (ocupación)                                                                                                                           |
| Reserva serializada por segmento; unicidad de IP viva por tenant                                                                                       | `apps/api/src/modules/network/ipam.service.ts:61–63` (lock) y `:69` (`FOR SHARE` de la red); `packages/database/src/migrations/tenant/161_network_provisioning.ts:93–96`                                                                   |
| Sede física, futuro nodo técnico y cobertura comercial son conceptos separados                                                                         | ADR-044 D1–D3 y reglas de boundary; ADR-098 D1                                                                                                                                                                                             |
| La fase vigente produce instrucciones manuales y no descubre configuración del router                                                                  | ADR-098 D9                                                                                                                                                                                                                                 |

Todo lo que sigue es **modelo propuesto**, sujeto a consolidación con API/UX y revisión independiente.

Quedan fuera NMS, nodos técnicos nuevos, VRF, solapamientos, IPv6, credenciales, descubrimiento RouterOS y configuración de puertos, bridges o VLAN. Las clases de interfaz solo describen un dato registrado; no representan órdenes al equipo.

## 2. Cardinalidades y propiedad

| Relación                            | Cardinalidad y regla                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Router → interfaces                 | Un router contiene cero o varias interfaces; cada interfaz pertenece a un único router y tenant                    |
| Interfaz → direcciones IPv4 locales | Una interfaz contiene cero o varias direcciones; cada dirección pertenece a una interfaz del mismo router y tenant |
| Router → redes IPv4                 | Se mantiene un router por red y cero o varias redes por router                                                     |
| Interfaz → redes IPv4               | Una interfaz puede tener cero o varias redes; cada red referencia como máximo una interfaz de su propio router     |
| Red sin interfaz                    | Admitida en transición y en registro manual; conserva las reglas actuales de router/red                            |
| Dirección local → red/gateway       | No se crea una dependencia viva: el gateway confirmado de la red es un valor independiente                         |

Una interfaz sin IP es válida. Una interfaz con dos IP no equivale a dos interfaces. El bloque asignable y la dirección configurada son datos diferentes: `192.0.2.7/24` es una dirección local; `192.0.2.0/24` es el bloque derivable de ese prefijo, si el operador confirma usarlo como pool.

MOD13 es dueño de las dos tablas nuevas y del vínculo red→interfaz. MOD00 conserva las sedes y TenantModule la cobertura. No se añaden FK, joins ni repositorios de MOD13 hacia tablas de esos otros módulos; sus referencias se validan mediante puertos de sus dueños.

ADR-044 ya define sede→cero o varios nodos técnicos futuros. No se agrega `NODE` a tipos o capacidades de Organización ni se reutiliza cobertura para resolverlo. Una sede puede documentar el lugar físico de una base técnica o monitoreo operativo sin crear un nodo NMS.

## 3. Estructura propuesta

Los nombres físicos son una propuesta para la consolidación de O0-B. Se mantienen UUID, metadatos de auditoría y versionado coherentes con el catálogo vigente. Los DTO públicos y sus nombres definitivos corresponden a SR-FULL.

### 3.1 `network_router_interfaces` — `RouterInterface`

| Columna                    | Tipo propuesto  | Nulabilidad y regla                                                                                                          |
| -------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | `uuid`          | PK, generado en servidor                                                                                                     |
| `tenant_id`                | `uuid`          | Obligatorio; contexto autenticado, nunca input del operador                                                                  |
| `router_id`                | `uuid`          | Obligatorio; FK interna que verifica tenant/router                                                                           |
| `name`                     | `varchar(64)`   | Obligatorio, sin espacios externos ni vacío; nombre visible con mayúsculas preservadas; la unicidad es case-insensitive (§4) |
| `kind`                     | `varchar(16)`   | Obligatorio; clase de catálogo `PHYSICAL`, `BRIDGE`, `VLAN` u `OTHER` (CHECK en §4)                                          |
| `notes`                    | `varchar(1000)` | Opcional; descripción de operación, sin credenciales ni datos personales; nunca entra en auditoría ni logs                   |
| `status`                   | `varchar(16)`   | `ACTIVE` o `INACTIVE`, inicialmente activo                                                                                   |
| `created_by`               | `uuid`          | Actor de creación resuelto por servidor                                                                                      |
| `created_at`, `updated_at` | `timestamptz`   | Obligatorios                                                                                                                 |
| `version`                  | `integer`       | Obligatorio, inicialmente 1; mayor o igual a 1                                                                               |

No se introducen `parent_interface_id`, listas de puertos miembros, etiquetas VLAN, VRID, parámetros del equipo ni un grafo de topología. Una interfaz virtual que no encaje en las clases descriptivas puede documentarse como `OTHER`; no se deduce gateway desde `kind`.

### 3.2 `network_router_interface_ipv4_addresses` — `RouterInterfaceIpv4Address`

| Columna                    | Tipo propuesto  | Nulabilidad y regla                                                                                                                                                                                                                                                                                                      |
| -------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                       | `uuid`          | PK, generado en servidor                                                                                                                                                                                                                                                                                                 |
| `tenant_id`                | `uuid`          | Obligatorio; contexto autenticado                                                                                                                                                                                                                                                                                        |
| `router_id`                | `uuid`          | Obligatorio; refuerza el vínculo con interfaz/tenant                                                                                                                                                                                                                                                                     |
| `interface_id`             | `uuid`          | Obligatorio; FK compuesta a interfaz                                                                                                                                                                                                                                                                                     |
| `address`                  | `inet`          | Obligatorio, familia IPv4; conserva el prefijo de la dirección configurada                                                                                                                                                                                                                                               |
| `host_address`             | `inet`          | Generada: `set_masklen(address, 32)`, columna `STORED`. Es la única forma de comparar una IP local con `ip_assignments.ip` (/32), con los pools y con los índices de rango. Nunca se escribe desde la API. `set_masklen` se verificó IMMUTABLE en PostgreSQL dev 18.3; no se generaliza a otras versiones/entornos (A-6) |
| `notes`                    | `varchar(1000)` | Opcional; contexto de la dirección, sin datos personales                                                                                                                                                                                                                                                                 |
| `created_by`               | `uuid`          | Actor resuelto por servidor                                                                                                                                                                                                                                                                                              |
| `created_at`, `updated_at` | `timestamptz`   | Obligatorios                                                                                                                                                                                                                                                                                                             |
| `version`                  | `integer`       | Obligatorio, inicialmente 1; mayor o igual a 1                                                                                                                                                                                                                                                                           |

La entrada debe incluir prefijo explícito; no se acepta que la coerción de PostgreSQL complete `/32` a partir de una IP sin máscara. El prefijo de dirección se admite entre /1 y /32; los prefijos que no permiten derivar un pool vigente se conservan como dirección de infraestructura y exigen bloque manual en el alta de red. La dirección debe ser un host IPv4 utilizable; no se admite dirección no especificada, multicast o difusión limitada como IP local asignable al equipo. Para prefijos /1–/30 tampoco se admiten la dirección de red ni la de difusión de ese prefijo; /31 y /32 no tienen esa restricción. La validación detallada de host/prefijo se define en el contrato Zod y las pruebas, manteniendo soportes válidos de /31 y /32, y se refuerza con los CHECK de §4.

No hay toggle independiente de dirección en este corte. Toda dirección persistida protege su IP host. El estado de su interfaz no la retira. No se confunde esta tabla con `ip_assignments`, que continúa representando reservas y direcciones de servicios.

### 3.3 Extensión de `network_routers` e `ipv4_networks`

**`network_routers`** (decisión D-15 de AI-EM-ARCH):

| Cambio                              | Regla                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legacy_lan_interface_id uuid NULL` | Referencia a la interfaz creada al convertir `lan_interface`. Solo la escribe la conversión explícita de §8 (`POST /network/routers/:id/interfaces` con el campo de conversión que fija SR-FULL). Nunca se infiere del texto. Ningún CHECK la exige: el legado queda `NULL`. FK compuesta en §4 |

**`ipv4_networks`**

| Cambio                   | Regla                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `interface_id uuid NULL` | Asociación opcional y validada con una interfaz del mismo tenant/router                                                              |
| `gateway inet`           | Se conserva obligatorio y como snapshot confirmado; sin actualización en cascada; CHECK nuevo `NOT VALID` (§4)                       |
| `cidr cidr`              | Conserva prefijo /16–/30 y normalización de red                                                                                      |
| `name`                   | Se conserva como etiqueta del segmento; la UX puede sugerirla y permitir edición                                                     |
| `excluded_ips`           | Conserva únicamente exclusiones adicionales del operador, separadas de protección automática; CHECK de cardinalidad `NOT VALID` (§4) |

La selección de una dirección local puede proponer CIDR y gateway durante el alta. No crea una FK red→dirección, ni hace que el pool dependa del estado futuro del candidato. La operación puede registrar su origen en la auditoría mediante el servicio aprobado. La alternativa de persistir una referencia de procedencia es ampliación del contrato a evaluar por SR-FULL; no es requisito de este modelo mínimo ni habilita actualizaciones automáticas.

## 4. Constraints e índices por patrón de consulta

### Claves e integridad dentro de MOD13

- `network_routers`: añadir unicidad `(tenant_id, id)`; es el destino de las FK compuestas. El UUID sigue siendo PK.
- `network_routers`, columna `legacy_lan_interface_id` (D-15): FK compuesta `(tenant_id, id, legacy_lan_interface_id)` → `network_router_interfaces(tenant_id, router_id, id)`, `ON DELETE RESTRICT`, `ON UPDATE NO ACTION`, MATCH SIMPLE. Con nulo no se evalúa, que es el estado de todas las filas legadas. Ningún CHECK la exige. Hay un ciclo de FK (interfaces → routers y routers → interfaces): se crea en dos pasos (tabla de interfaces y después `ALTER` de routers) y se retira en orden inverso en `down()` (§9).
- `network_router_interfaces`: FK `(tenant_id, router_id)` a `network_routers(tenant_id, id)`, `RESTRICT` al borrar; unicidad `(tenant_id, router_id, id)` como destino de referencias internas; **índice único** `(tenant_id, router_id, lower(name))`, que es índice y no `UNIQUE` de tabla porque es una expresión. Mismo criterio que `uq_network_routers_tenant_name` (`160_network_catalog.ts:37–38`). El nombre se muestra con sus mayúsculas (DC-02).
- Dirección local: FK compuesta `(tenant_id, router_id, interface_id)` a la clave de interfaz; `ON DELETE RESTRICT`, `ON UPDATE NO ACTION`, MATCH SIMPLE (por defecto). Nunca `SET NULL` ni `CASCADE` sobre la clave compuesta: anularía `tenant_id` o `router_id`.
- Red: FK compuesta `(tenant_id, router_id, interface_id)` a la clave de interfaz, con las mismas reglas. `interface_id` es nulo en redes legadas: con nulo la FK no se evalúa (MATCH SIMPLE). Se añade además una FK compuesta `NOT VALID` `(tenant_id, router_id) → network_routers(tenant_id, id)` para reforzar la pertenencia incluso cuando la red no tiene interfaz; se conserva la FK simple existente por compatibilidad. La aplicación sigue validando router e interfaz antes de escribir. La nueva FK se valida solo tras una consulta previa de filas legadas; no se corrigen filas automáticamente.
- CHECK en tablas nuevas: `kind IN ('PHYSICAL','BRIDGE','VLAN','OTHER')`; `status IN ('ACTIVE','INACTIVE')`; `name = btrim(name) AND name <> ''`; `version >= 1`.
- CHECK de dirección local: `family(address) = 4`; `masklen(address) BETWEEN 1 AND 32`; `host_address <> '0.0.0.0'::inet AND host_address <> '255.255.255.255'::inet`; `NOT (host_address << '224.0.0.0/4'::inet)`; y, si `masklen(address) <= 30`, `host(address) <> host(network(address)) AND host(address) <> host(broadcast(address))`. Estas funciones resultaron IMMUTABLE en la instancia PostgreSQL dev 18.3 consultada; confirmar de nuevo si el entorno de destino usa otra versión (A-6).
- CHECK nuevos sobre `ipv4_networks`, **`NOT VALID`** (no escanean ni corrigen filas legadas):
  - `ck_ipv4_gateway_host`: `masklen(gateway) = 32 AND host(gateway) <> host(network(cidr)) AND host(gateway) <> host(broadcast(cidr))`.
  - `ck_ipv4_excluded_cardinality`: `cardinality(excluded_ips) <= 256`.
  - `assertNetworkRange` admite un gateway igual a la dirección de red (`apps/api/src/modules/network/network-catalog.service.ts:661`, operador `<<=`), así que pueden existir filas legadas que incumplan el primero (§8).
- Pertenencia de exclusiones al bloque: solo en aplicación. `assertNetworkRange` no la comprueba (`network-catalog.service.ts:651–681`), y un CHECK exigiría una subconsulta sobre el array.
- Se conservan la exclusión GiST de bloques solapados por tenant (`160_network_catalog.ts:75–77`) y la unicidad parcial de `ip_assignments` en estados `RESERVED`/`ACTIVE` (`161_network_provisioning.ts:93–96`). No se amplía su ámbito a VRF ni se permite duplicar pools de redundancia.
- No se añade FK hacia Organización, usuarios, cobertura o auditoría desde estas tablas por conveniencia de implementación; se respetan los mecanismos aprobados de sus dueños (HLD v1.1 §3.1; ADR-098 D6).

### Índices justificados

| Consulta                                                                                                                                     | Índice/constraint propuesto                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Listar interfaces de un router y evitar nombre repetido                                                                                      | Índice único `(tenant_id, router_id, lower(name))`: cubre acceso por propietario y orden por nombre; PK desempata                                                                                                                                                                                                                     |
| Validar pertenencia de interfaz a tenant/router                                                                                              | Clave única compuesta `(tenant_id, router_id, id)`                                                                                                                                                                                                                                                                                    |
| Listar direcciones de una interfaz sin duplicar la misma IP host con otro prefijo                                                            | Índice único `(tenant_id, router_id, interface_id, host_address)`                                                                                                                                                                                                                                                                     |
| Averiguar si una IP está registrada como local en cualquier router del tenant; conjunto protegido de un pool (§5.2); conciliación I-1 (§5.4) | Índice no único `(tenant_id, host_address)`, btree sobre `inet`: sirve igualdad y rangos (`host_address BETWEEN assignable_from AND assignable_to`). No se usa `host(address)`: devuelve `text` (el propio código compara `host(...)` como texto en `ipam.service.ts:139–140`) y un índice sobre texto no sirve para rangos de `inet` |
| Localizar redes vinculadas al cambiar estado o asociación                                                                                    | Índice `(tenant_id, interface_id)` parcial para `interface_id IS NOT NULL`; sirve también a las comprobaciones de la FK de red→interfaz                                                                                                                                                                                               |
| Enumerar pools de un router para inactivación y validar la FK compuesta de `ipv4_networks`                                                   | Índice `(tenant_id, router_id, id)` en `ipv4_networks`; el `id` fija el orden determinista de locks                                                                                                                                                                                                                                   |
| Localizar el router que referencia una interfaz (RESTRICT de la FK de §4 y conversión de `lan_interface`)                                    | Índice parcial `(tenant_id, legacy_lan_interface_id) WHERE legacy_lan_interface_id IS NOT NULL`. Sin índice de soporte, cada comprobación de referencia desde la interfaz escanea `network_routers`; el índice parcial solo contiene las filas convertidas, y las legadas quedan fuera                                                |
| Encontrar el pool que contiene una IP nueva o anterior                                                                                       | El `EXCLUDE` de `160_network_catalog.ts:75–77` ya crea un GiST sobre `(tenant_id, cidr inet_ops)`, que sirve para `cidr >>= host`; no añadir otro                                                                                                                                                                                     |

La misma IP local puede constar en más de una interfaz o router, por ejemplo una dirección virtual documentada. No se implementa su redundancia; la protección IPAM deduplica por host. El índice único local evita repetir el mismo host en una interfaz con máscaras diferentes; modificar el prefijo es editar el mismo registro.

Los índices de claves compuestas son un coste justificado de integridad, no una sustitución de `SET LOCAL search_path`. Cualquier índice adicional debe justificarse con la consulta real y volumen medido.

## 5. Invariantes IPv4 y disponibilidad

### 5.1 Distinción entre dirección y pool

1. El prefijo configurado en una dirección local no modifica las reglas de un pool. Una dirección `/32` es registrable; no genera un pool `/32` ni inventa su máscara.
2. Solo una dirección con prefijo /16–/30 permite sugerir un CIDR compatible con el pool actual. El CIDR se obtiene del prefijo explícito; no de la IP de administración, del texto LAN ni de convenciones como `.1`.
3. Una candidata no demuestra que sea gateway: el operador confirma el valor o ingresa uno manual/virtual. El gateway debe ser un host utilizable dentro del CIDR, distinto de red/difusión y de una asignación de servicio viva.
4. Gateway y CIDR existentes conservan su inmutabilidad. No se cambia un servicio ni el gateway de una red al editar una dirección de interfaz.
5. No se limita una interfaz a un solo pool ni se impone que todo pool tenga una dirección local registrada. Se mantiene el modo manual.

RouterOS permite múltiples IP o ninguna por interfaz; también diferencia direcciones físicas y virtuales VRRP. Estas capacidades justifican el modelo y la entrada manual, sin autorizar integración: [manual oficial de fundamentos](https://manual.mikrotik.com/docs/getting-started/networking-fundamentals/) y [VRRP oficial](https://help.mikrotik.com/docs/spaces/ROS/pages/81362945/VRRP). Estos enlaces no se abrieron en la revisión v1.1 (supuesto; ninguna regla de datos depende de ellos).

### 5.2 Conjunto único de direcciones no asignables

Para una red, el conjunto protegido es la unión de:

- dirección de red y difusión;
- gateway confirmado;
- todas las IP host de direcciones locales registradas en el tenant que pertenezcan al bloque, aunque sean de otro router o de una interfaz inactiva;
- exclusiones adicionales válidas dentro del bloque;
- asignaciones de servicios `RESERVED` o `ACTIVE`, tratadas aparte como ocupación de servicios.

La unión deduplica por dirección host, no por `inet` con máscara. Se aplica con la misma definición en reserva automática, validación de reserva manual y cálculo de ocupación. No se materializan silenciosamente las IP locales en `excluded_ips`: se perdería la distinción entre reserva automática y exclusión del operador.

**Estado verificado (v1.1).** Las tres rutas ya aplican gateway, red, difusión y exclusiones (`ipam.service.ts:139–142`, `:195–198`, `:228–231`). La extensión es un cuarto conjunto: el `host_address` de las IP locales de cualquier router del tenant que caigan en el bloque. La comparación se hace siempre sobre `host_address` (/32). `ip_assignments.ip` tiene `masklen = 32` por CHECK (`161_network_provisioning.ts:89`), mientras que `gateway` y `excluded_ips` se comparan hoy como `inet` asumiendo /32 sin CHECK en BD; por eso §4 añade los CHECK de máscara.

La ocupación conserva su semántica actual: `total` es el número de hosts del rango asignable que quedan tras las protecciones automáticas y exclusiones adicionales; `reserved` y `active` son los servicios vivos; `free = total - reserved - active`. Una IP que sea simultáneamente gateway/local/excluida se resta una sola vez. La exclusión de IP locales es una ampliación explícita de esa semántica y debe reflejarse en API y UI. Datos inconsistentes no se ocultan mediante un cero artificial: se reporta el conflicto sin reasignar servicios.

La petición manual de una IP local devuelve el conflicto de infraestructura propuesto en O0-B, distinto de `IP_IN_USE` para una IP ocupada por servicio (DC-15). Registrar o editar una dirección local cuyo destino esté `RESERVED`/`ACTIVE` devuelve `IP_IN_USE` y revierte la transacción completa.

### 5.3 Exclusiones adicionales

- Deben ser IPv4, pertenecer al bloque y respetar el máximo actual de 256. Se almacenan siempre con máscara /32 (DC-17).
- Normalizar y deduplicar; una exclusión redundante con protección automática no aumenta el conteo.
- Actualizar exclusiones o rango nunca puede dejar fuera ni excluir una IP reservada/activa. Se rechaza la operación completa. Esta comprobación ya existe en `updateIpv4Network` (`network-catalog.service.ts:418–433`).
- La pertenencia de exclusiones requiere validación nueva: `assertNetworkRange()` actual no revisa el contenido de `excludedIps`, aunque el campo forme parte de su tipo de entrada (`network-catalog.service.ts:651–681`).

### 5.4 Invariante cruzada I-1 y conciliación

- **I-1:** en un tenant nunca coexisten una dirección local con host `h` y una asignación `RESERVED` o `ACTIVE` con `ip = h`. La BD no puede expresarlo con una restricción, porque son tablas distintas. Lo garantizan el orden de locks de §7 y la comprobación bajo lock de ambos lados (alta de dirección y reserva).
- **Conciliación (debe devolver 0 filas):**

```sql
SELECT a.id, l.id
  FROM ip_assignments a
  JOIN network_router_interface_ipv4_addresses l
    ON l.tenant_id = a.tenant_id AND l.host_address = a.ip
 WHERE a.status IN ('RESERVED', 'ACTIVE');
```

Se usa en las pruebas de carrera (§10) y como diagnóstico operativo. No se corrige automáticamente.

## 6. Estado, asociación y cambios de dirección

| Operación                                                     | Efecto propuesto                                                                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Crear interfaz                                                | Router válido y activo del tenant; nombre único; ninguna IP o red creada por inferencia                                |
| Cambiar nombre/clase/notas                                    | Solo modifica identificación; no altera IP, CIDR, gateway ni servicios                                                 |
| Inactivar interfaz                                            | Bloquea nuevas asociaciones y reservas en sus redes vinculadas; preserva servicios y todas sus IP locales protegidas   |
| Reactivar interfaz                                            | Permite usarla de nuevo cuando router/red también estén activos; conserva direcciones y servicios                      |
| Asociar una red nueva o cambiar su interfaz                   | Destino activo del mismo router/tenant; omisión conserva, `null` desasocia, UUID valida/asigna; no cambia gateway/CIDR |
| Guardar otro campo de una red con interfaz histórica inactiva | Conserva la referencia sin exigir sustituirla; continúa legible, aunque no admite reservas nuevas                      |
| Registrar dirección                                           | Operación explícita, interfaz activa y validación de conflicto IPAM bajo locks                                         |
| Cambiar host/prefijo de dirección                             | Operación explícita, versionada y auditada; validación de ambas IP y sus pools; nunca actualización masiva de redes    |
| Borrar interfaz o dirección                                   | No se expone borrado físico ni vaciado equivalente en este corte; entidades históricas y referencias se conservan      |

La edición de host/prefijo necesita semántica cerrada para G1/G3: se permite corregir una dirección libre y no referenciada, conservando el registro/versionado. Si el host anterior coincide con el gateway confirmado de **cualquier** red del tenant, se rechaza el cambio de host (el gateway es un valor independiente de la asociación, §3.3); la corrección coordinada del gateway requiere un encargo futuro y no se simula editando infraestructura. Un cambio solo de prefijo conserva el host protegido y no altera redes; la UI pide revisar la coherencia de las asociaciones. Cualquier nueva IP `RESERVED`/`ACTIVE` rechaza el cambio sin efectos.

Para evitar que una corrección retire protección de infraestructura inadvertidamente, cambiar el host de una dirección que pertenece a un pool existente requiere confirmación explícita del efecto sobre el host anterior y revisión de referencias; este acto no configura ni certifica el router. No se acepta hacerlo en un PATCH genérico de identificación. El procedimiento de retiro permanente de infraestructura, liberación o reutilización masiva queda fuera. SR-FULL y SEC-ENG deben confirmar este corte antes de congelar el API; si no existe esa operación explícita, el primer contrato mantendrá host/prefijo inmutables una vez registrados, con corrección futura gobernada.

**Decisión v1.1 (DC-14).** Se recomienda incluir en v1 una operación explícita `correct` (ruta `POST …/addresses/:addressId/correct`, cuerpo `{ newAddress, version, reason }`) con estas guardas: (a) el host anterior no es gateway de ninguna red del tenant; (b) ni el host anterior ni el nuevo tienen asignación `RESERVED`/`ACTIVE`; (c) la interfaz está `ACTIVE`; (d) el nuevo host cumple §3.2 y no duplica otra dirección de la misma interfaz; (e) bloqueos L0 y L2 de los pools de ambos hosts, en orden, y L3; (f) auditoría con before/after en la misma transacción; (g) no modifica redes, gateways ni asignaciones. Sin esta operación, un host mal registrado queda protegido sin vía de corrección en la UI. El alcance lo decide AI-EM-ARCH (A-3); las guardas las valida SEC-ENG (A-2). Si se excluye, la inmutabilidad de host/prefijo solo es aceptable con una enmienda del PRD que indique el procedimiento alternativo.

La inactivación de un router o red conserva la regla vigente: impide reservas nuevas sin liberar IP activas. El estado mostrado es estado del catálogo, no salud ni encendido del equipo. El botón visual ya corregido no se reimplementa como parte del modelo.

## 7. Transacciones y orden de locks

Todas las operaciones se ejecutan en `runInTenantSchema()` con `TenantContext` autenticado, parámetros SQL y `SET LOCAL search_path` por transacción. La consulta y la mutación relevante usan el mismo `EntityManager`; los locks se liberan al commit/rollback, no al cerrar el navegador.

### Orden propuesto (v1.1)

**Regla: L0 < L1 < L2 < L3.** Cada operación toma solo los niveles que necesita y nunca los invierte; dentro de L2, por UUID ascendente; dentro de L3, por orden fijo de tabla y `id` ascendente. Se añade **L1 · orden de la OT** (`provisioning-order:<executionOrderId>`), que ya usan `service-provisioning.service.ts:103` y `:400`, `network-execution-event.processor.ts:290` y `network-provisioning-reconciler.processor.ts:184`. Orden fijo de tablas en L3: `network_routers` → `network_router_interfaces` → `network_router_interface_ipv4_addresses` → `ipv4_networks` → `service_provisionings` → `ip_assignments` → `network_settings`.

Derivado de la regla: toda escritura sobre `service_provisionings` o `ip_assignments` de una OT toma L1 de esa OT antes que cualquier otra fila. Hoy no lo hacen `release` ni `certify` (§7.1, H-5). La fila de servicio bloqueada tras L1 puede preceder a L2 porque L1 la serializa; ningún camino que tome L2 puede después esperar esa fila.

Los niveles y conjuntos siguen este orden:

1. **L0 · Catálogo IPv4 del tenant** (clave `ipv4-catalog:<tenantId>`), cuando la operación crea/edita direcciones locales, crea pools o modifica su asociación/rango/estado de forma que afecte la elegibilidad. Este lock serializa cambios de estructura, no todas las reservas. Cubre: alta, edición, inactivación y reactivación de router y de red; asociación de red a interfaz; alta, edición e inactivación de interfaz; alta y corrección de direcciones locales; conversión de `lan_interface` a interfaz (§8). Las reservas no lo toman.
2. **L1 · Orden de la OT**, para cualquier operación que crea, reemplaza, libera, certifica o repite idempotentemente una reserva/provisión de esa OT. Se toma antes de L2 y de cualquier bloqueo de filas. El flujo actual de reserva adquiere L1, pero inserta la fila de servicio antes de adquirir L2 (H-6); la implementación debe respetar L1 → L2 → L3.
3. **L2 · Pools afectados**, con la clave `ipv4:<networkId>` de `IpamService` (`apps/api/src/modules/network/ipam.service.ts:61–63`), uno por segmento y ordenados por UUID ascendente. Para editar una dirección se incluyen los pools que contienen el host anterior o nuevo, aun inactivos y aun de otro router (por EXCLUDE hay como máximo uno por host). Para inactivar/reactivar un router se incluyen todos sus pools, activos e inactivos, leídos después de L0 y ordenados por UUID. Para cambiar estado de interfaz se incluyen todas sus redes vinculadas, también activas e inactivas. Para asociar/desasociar una red se incluye esa red. La asociación y los cambios de catálogo toman L0, así que esos conjuntos no pueden cambiar mientras se enumeran y bloquean.
4. **L3 · Filas**, después de los advisory locks: router, interfaz, dirección y red que se modificarán; comprobar versión, pertenencia y estado dentro de la transacción. Orden estable por tabla/ID cuando sean varias filas. Reserva y replay leen router, interfaz y red con `FOR SHARE` bajo L2; alta de red valida el router con `FOR SHARE` después de L0 y antes del insert. `IpamService.reserveIp` ya hace `FOR SHARE` sobre la red (`ipam.service.ts:69`).

Las reservas toman L1 y el L2 del pool solicitado antes de revalidar router, red e interfaz con `FOR SHARE`; consultan direcciones locales/exclusiones antes de insertar la asignación. `regularize` y `reserve` siguen el mismo orden. Un replay de la misma OT también toma L1 y L2: primero localiza sin bloqueo la red de la asignación existente, luego bloquea en orden los pools solicitado y existente, y finalmente vuelve a leer/bloquear las filas en L3. Si router, red o interfaz están inactivos, responde con el error de elegibilidad correspondiente, no vuelve a emitir la instrucción al router, no libera ni reasigna la asignación viva y no crea otra reserva. Si está activo, el replay conserva la idempotencia actual.

No puede existir un camino que bloquee primero una fila de red/interfaz y espere después su lock advisory mientras otra ruta lo hace al revés. La publicación del contrato y la implementación deben revisar también los flujos existentes de `updateIpv4Network`, activación/desactivación y reservas antes de fijar el orden. En v1.1 esos flujos se han contrastado con el código (§7.1). La comprobación preliminar fuera de transacción no reemplaza esta defensa.

### Carreras que deben resolverse

| Carrera                                                        | Serialización y resultado admisible                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reserva gana antes del alta de dirección local                 | Alta obtiene el lock después, detecta `RESERVED`/`ACTIVE` y devuelve conflicto; dirección no creada                                                                                                                                                                                                                                                         |
| Dirección local gana antes de reserva                          | Reserva ve la protección y elige otra IP; petición manual de esa IP devuelve conflicto de infraestructura                                                                                                                                                                                                                                                   |
| Alta de pool gana antes de alta de dirección                   | Ambas comparten lock de catálogo; al llegar dirección, el pool ya existe y se toma también su lock antes del conflicto                                                                                                                                                                                                                                      |
| Dirección gana cuando todavía no existe pool                   | Commit de dirección precede al alta de pool; cualquier reserva posterior encuentra la IP local protegida                                                                                                                                                                                                                                                    |
| Edición de host cruza de un bloque a otro                      | Lock de catálogo y ambos pools en orden estable; el destino ocupado provoca rollback sin perder protección anterior                                                                                                                                                                                                                                         |
| Inactivación de interfaz y reserva                             | Quien obtiene el lock primero fija el resultado: reserva previa puede completarse y se conserva; después de inactivar no entra otra                                                                                                                                                                                                                         |
| Inactivación de router y reserva                               | Hoy `setRouterStatus` solo bloquea la fila del router (`network-catalog.service.ts:260`) y `reserve` lee el router sin lock (`service-provisioning.service.ts:106–108`): hay una ventana TOCTOU. Con L0/L2 y `FOR SHARE` del router bajo L2, quien llegue primero fija el resultado                                                                         |
| Inactivación de router con varios pools                        | Tras L0, el cambio de estado enumera y toma L2 para todos sus pools, activos e inactivos, por UUID ascendente; después bloquea la fila del router. La reserva de cualquiera de ellos toma L1 y su L2 antes de revalidar el router con `FOR SHARE`. Quien gana termina primero y la otra operación vuelve a validar; no se liberan servicios ni protecciones |
| Alta de red frente a inactivación del router                   | Ambas toman L0. La alta valida con `FOR SHARE` que el router pertenezca al tenant y siga activo antes de insertar; no puede crear un pool bajo un router ya inactivo                                                                                                                                                                                        |
| Asociación/desasociación de interfaz frente a reserva          | La mutación toma L0 y el L2 de la red antes de bloquearla en L3. Reserva toma L2 antes de leer la interfaz vinculada. El resultado se decide en orden, sin reservar a través de una interfaz inactiva                                                                                                                                                       |
| Replay de reserva frente a inactivación de interfaz/red/router | El replay toma L1 y L2 antes de validar estado y aplicar una instrucción. Si el destino está inactivo, devuelve error sin mutar ni liberar el servicio existente ni volver a configurar el router                                                                                                                                                           |

La unicidad parcial de `ip_assignments` sigue siendo defensa final contra doble servicio. No protege por sí sola el cruce entre dos tablas diferentes —direcciones locales y asignaciones—; esa carrera exige la coordinación anterior (I-1, §5.4) y pruebas reales.

### 7.1 Caminos existentes contrastados con el código (v1.1)

| #    | Hallazgo verificado                                                                                                                                                            | Cita                                                                                                                                                                          | Acción                                                                                                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H-1  | `reserve` lee router y red sin lock. El router se valida como `ACTIVE` fuera de cualquier bloqueo que compita con `setRouterStatus`                                            | `apps/api/src/modules/network/service-provisioning.service.ts:106–111`; `network-catalog.service.ts:250–260`                                                                  | Revalidar router, interfaz y red con `FOR SHARE` bajo L2                                                                                                                                                                  |
| H-2  | `updateIpv4Network` bloquea la fila de red (`FOR UPDATE`) antes que cualquier advisory; hoy no toma L0 ni L2                                                                   | `network-catalog.service.ts:397–400`, `:418–433`                                                                                                                              | Al añadir L0/L2, mover el bloqueo de fila tras ellos y repetir bajo L2 la comprobación de IP vivas                                                                                                                        |
| H-3  | `createIpv4Network` no toma L0, así que el alta de pool no se serializa con el alta de IP locales                                                                              | `network-catalog.service.ts:337–348`                                                                                                                                          | Añadir L0 antes de la validación de solapamiento                                                                                                                                                                          |
| H-4  | `setRouterStatus` y `setIpv4NetworkStatus` bloquean solo la fila, sin L0 ni L2                                                                                                 | `network-catalog.service.ts:250–260`, `:478–488`                                                                                                                              | Añadir L0 y L2 de los pools afectados, luego la fila                                                                                                                                                                      |
| H-5  | `release` y `certify` no toman L1. `regularize` reutiliza una asignación con `save` sin L2. El consumidor y el reconciliador escriben `ip_assignments` sin L2                  | `service-provisioning.service.ts:244–300`, `:302–372`, `:538`; `network-execution-event.processor.ts:348`, `:416`; `network-provisioning-reconciler.processor.ts:202`, `:247` | L1 en `release` y `certify`; L2 en toda escritura de `ip_assignments`. Riesgo bajo: el índice `uq_ip_assignments_live` impide la doble asignación                                                                         |
| H-6  | `reserve` inserta la fila de servicio antes de tomar L2 (el `save` está en `service-provisioning.service.ts:196` y `reserveIp` en `:197`, con el lock en `ipam.service.ts:61`) | Recomendación de orden, no deadlock hoy según el análisis de §7                                                                                                               | Tomar L2 antes del insert. `pg_advisory_xact_lock` es reentrante dentro de la misma transacción: basta con adelantar el bloqueo (p. ej. `IpamService.lockPool`) y que `reserveIp` lo repita sin coste                     |
| H-7  | `assertNetworkRange` no valida exclusiones dentro del bloque, y `excluded_ips` no tiene cardinalidad en BD                                                                     | `network-catalog.service.ts:651–681`; `160_network_catalog.ts:51`                                                                                                             | Validación en aplicación y CHECK `NOT VALID` (§4)                                                                                                                                                                         |
| H-8  | `createRouter` y `updateRouter` aceptan sede y cobertura solo como UUID, sin consultar a su dueño. El `PATCH` no admite `null` para desasociar                                 | `network-catalog.service.ts:126–129` (creación), `:174–202` (actualización); `packages/shared/src/contracts/network/network.bodies.ts:113–114`                                | Validación por puerto del dueño (PRD §5) y `null` explícito en el contrato (SR-FULL)                                                                                                                                      |
| H-9  | El replay idempotente vuelve a emitir la instrucción y el camino actual no toma L2 ni revalida la interfaz vinculada antes del replay                                          | `service-provisioning.service.ts:103–160`; bloque `existing` y llamada a `routerProvisioningPort.apply`                                                                       | Tomar L1 y los pools solicitado/existente con L2 ordenados antes de bloquear filas; revalidar router, red e interfaz. Si alguno está inactivo, no emitir una nueva instrucción y conservar sin cambios la asignación viva |
| H-10 | `setRouterStatus` no declara el conjunto de pools que debe serializar con las reservas antes de cambiar estado                                                                 | `network-catalog.service.ts:250–260`                                                                                                                                          | Después de L0, bloquear todos los pools del router (activos e inactivos) por UUID ascendente; luego actualizar la fila. Añadir prueba de carrera contra reserva                                                           |
| H-11 | `createIpv4Network` no revalida con lock que el router permanezca activo al insertar una red                                                                                   | `network-catalog.service.ts:337–348`                                                                                                                                          | Tomar L0 y `FOR SHARE` de router antes de insertar; validar tenant/estado dentro de la transacción                                                                                                                        |
| H-12 | El `updateIpv4Network` existente no toma L0 ni L2; la asociación de `interface_id` aún no existe y se incorporaría a ese PATCH                                                 | `network-catalog.service.ts:397–433`                                                                                                                                          | Implementar asociación/desasociación como L0 → L2 de esa red → L3; revalidar bajo lock que la interfaz pertenece al router y está activa. La regla aplica aunque el PATCH solo cambie otro campo que altere elegibilidad  |

H-1 y H-5 son ventanas de concurrencia, no de doble asignación. H-2 y H-3 bloquean la implementación segura de la protección de IP locales. H-9 a H-12 amplían el inventario de caminos que deben entrar en O2-H/O2-M; no implican modificar el alcance. La ruta actual toma L1 antes de leer filas (`service-provisioning.service.ts:103–105`), pero persiste la fila de servicio antes de adquirir L2 (H-6). El orden previsto L1 → L2 para reserva y replay coincide con el HLD addendum §5.3. ADR-098 D3 fija el lock por segmento sin definir L1, por lo que es compatible y no contradice ese orden. H-1 a H-12 conservan los hallazgos y acciones de implementación del modelo; no queda una discrepancia documental de locks pendiente.

## 8. Transición legacy y migración aditiva

### Expansión

1. Elegir al ejecutar el siguiente número tenant disponible; no reservar ahora un número documental. Es el siguiente libre al ejecutar: leer el último `NNN_` del directorio en ese momento (`iwana-tenant-migration`, paso 1).
2. Escribir a mano la migración nueva, registrarla al final de `TENANT_MIGRATIONS` y mantener `synchronize: false`.
3. Crear claves/índices de soporte internos, las dos tablas nuevas y `ipv4_networks.interface_id NULL` con su FK e índice. Antes de añadir restricciones sobre datos existentes, comprobar consistencia sin corregirla silenciosamente.
4. Mantener `network_routers.lan_interface`, nombres, estados, CIDR, gateway, versiones, asignaciones y servicios actuales. No añadir NOT NULL que impida operar redes históricas.
5. Construir prueba con migraciones reales, no solo las tablas simplificadas del fixture de IPAM. `@iwana/db` debe compilarse antes de ejecutar migraciones.
6. No hay backfill. `legacy_lan_interface_id` queda `NULL` en todas las filas al terminar la migración. Solo la conversión explícita de «Normalización confirmada» la escribe (D-15).

Orden DDL dentro de la migración. Es transaccional por defecto (`packages/database/src/migrations/tenant/runner.ts:355–363`); no usa `CREATE INDEX CONCURRENTLY`, que exigiría `transactional = false` y el procedimiento de ADR-066.

- (a) `UNIQUE (tenant_id, id)` en `network_routers`.
- (b) Tabla de interfaces, con sus CHECK, `UNIQUE (tenant_id, router_id, id)` y el índice único `(tenant_id, router_id, lower(name))`.
- (c) Tabla de direcciones, con `host_address` generada, CHECK e índices.
- (d) `ipv4_networks.interface_id uuid NULL`, FK compuesta e índice parcial. La FK puede validarse de inmediato porque todas las filas legadas tienen `interface_id` nulo.
- (e) FK compuesta `NOT VALID` `(tenant_id, router_id)` de `ipv4_networks` a `network_routers(tenant_id, id)`, y su índice `(tenant_id, router_id, id)`. Se conserva la FK simple actual. Validar la nueva FK solo tras consulta previa de filas legadas.
- (f) CHECK `NOT VALID` sobre gateway y cardinalidad de exclusiones.
- (g) `network_routers.legacy_lan_interface_id uuid NULL`, FK compuesta e índice parcial. Va después de (b), porque referencia la tabla de interfaces. La FK no tiene datos que validar: todas las filas tienen nulo, así que se crea `VALID`. Ninguna sentencia de la migración escribe la columna.

`VALIDATE CONSTRAINT` de (e) no va en esta migración. Se hace en una migración posterior o en un procedimiento operativo, solo cuando §8 «Comprobaciones previas» esté limpio. El bloqueo sobre `ipv4_networks` debe ser breve: es una tabla de catálogo pequeña por tenant; se mide en G1 en un schema con volumen sintético (A-6).

La migración no hace backfill ni transforma `lan_interface`: esa normalización es operación explícita (ver «Normalización confirmada»).

### Comprobaciones previas (solo lectura)

Antes de `VALIDATE`, o de cualquier restricción sobre filas legadas, se ejecutan y se registran en el informe de fase. La migración no las corrige.

1. Exclusiones fuera del bloque: `SELECT n.id FROM ipv4_networks n, unnest(n.excluded_ips) AS e WHERE NOT (e <<= n.cidr);`
2. Exclusiones por encima de 256: `SELECT id FROM ipv4_networks WHERE cardinality(excluded_ips) > 256;`
3. Gateway igual a red o difusión, o con máscara distinta de /32: `SELECT id FROM ipv4_networks n WHERE masklen(n.gateway) <> 32 OR host(n.gateway) = host(network(n.cidr)) OR host(n.gateway) = host(broadcast(n.cidr));`
4. Redes cuya pareja `(tenant_id, router_id)` no coincide con una pareja de `network_routers`: `SELECT n.id FROM ipv4_networks n LEFT JOIN network_routers r ON r.tenant_id = n.tenant_id AND r.id = n.router_id WHERE r.id IS NULL;`. Informativo antes de añadir o validar la FK compuesta; no se corrige automáticamente.
5. Referencias a sede o cobertura sin comprobar: informativo. No hay FK por ADR-044; se cuentan, no se corrigen.

Si 1–4 devuelven filas, la FK o los CHECK no se validan hasta resolverlas mediante el procedimiento de catálogo (versionado y auditado); el paso 5 es solo informativo.

### Normalización confirmada

- El texto LAN legado se presenta como referencia histórica pendiente de confirmar. No se transforma automáticamente en interfaz, IP local, gateway ni CIDR.
- El operador crea/confirma interfaz y direcciones explícitas, y elige qué redes asociar. La sintaxis de un valor libre no acredita la configuración real.
- La asociación se hace por los mismos comandos versionados y validaciones que una alta normal; no por SQL ad hoc.
- Si una IP local propuesta coincide con un servicio vivo, se rechaza y se expone el conflicto. No se libera, mueve ni regulariza al cliente para hacer espacio.
- Redes sin interfaz siguen operativas bajo las reglas actuales de router/red. Registrar direcciones locales añade su protección a todos los pools correspondientes, sin modificar el gateway existente.
- **Conversión explícita de `lan_interface` (D-15).** `POST /network/routers/:id/interfaces` crea una interfaz. Solo con el campo explícito de conversión que fija SR-FULL (propuesta: `convertLegacyLan: true`) escribe también `legacy_lan_interface_id` del router, en la misma transacción. Sin ese campo, el POST crea una interfaz normal y no toca la columna. El servidor no deriva nombre, clase ni direcciones del texto `lan_interface`: los recibe confirmados en la petición. La UI puede prellenar el nombre con ese texto, sin copiarlo en silencio. `lan_interface` no se borra ni se modifica. Si el router ya tiene `legacy_lan_interface_id`, o no tiene `lan_interface`, la conversión se rechaza (código por fijar en SR-FULL). Orden de locks: L0; fila del router bloqueada (`FOR UPDATE`) antes que la interfaz nueva (orden de tablas de §7); inserción de la interfaz; escritura de la columna; auditoría de ambas mutaciones.

## 9. Reversibilidad y rollback operativo

`down()` debe deshacer exactamente los objetos creados, en orden inverso a las dependencias. En un schema aislado vacío debe poder completar; no se acepta un `throw` incondicional que haga nominal la reversibilidad.

### Condición de seguridad del `down()`

- Comprobar si hay interfaces/direcciones nuevas, vínculos de red no nulos o `network_routers.legacy_lan_interface_id` no nulos antes de remover columnas/tablas. El conteo es explícito: el patrón de `160_network_catalog.ts:4–9` y `:115–139` solo cuenta tablas que crea su migración, y `ipv4_networks` no lo es.
- Orden de `down()`: CHECK y FK compuestas de `ipv4_networks` → índices nuevos de `ipv4_networks` → columna `interface_id` → tabla de direcciones → FK e índice de `network_routers.legacy_lan_interface_id` → columna `legacy_lan_interface_id` → tabla de interfaces → `UNIQUE (tenant_id, id)` de `network_routers`. `lan_interface` y el resto de columnas legadas no se tocan.
- Sin datos nuevos: eliminar FK/índice/columna aditivos y tablas/constraints de soporte, conservando el catálogo original. Solo retirar objetos que creó esta migración; no eliminar un índice/constraint preexistente compartido.
- Con datos nuevos: bloquear por defecto con diagnóstico de conteos, sin IP ni datos personales. No borrar datos para lograr un test verde.
- Un camino destructivo, si se ofrece siguiendo `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN` (mismo patrón que `160_network_catalog.ts:3`), requiere habilitación humana explícita y exportación/recuperación previamente verificadas. La excepción no es una aprobación automática para ejecutarla. El ensayo usa exclusivamente schema/fixtures sintéticos aislados.
- Probar `up → down → up` en vacío y verificar que `down` con datos rechaza y conserva filas/vínculos. También comprobar el camino excepcional en un schema desechable si forma parte de la migración; nunca sobre datos del usuario. Procedimiento completo en §10.

### Rollout y rollback de aplicación

1. Desplegar esquema expandido y backend que protege IP locales en reserva manual, automática y ocupación.
2. Verificar las tres rutas y sus carreras antes de habilitar captura de direcciones en UI/API.
3. Habilitar la experiencia nueva después de esa verificación. Deshabilitar una pantalla no basta si la API sigue aceptando escrituras sin protección.
4. Para volver a una versión anterior después de registrar IP locales, conservar un backend que entienda estas protecciones o detener nuevas reservas en todas sus entradas hasta reconciliar y verificar una representación compatible. No restaurar automáticamente el código antiguo que ignora las direcciones locales.
5. La reconciliación al formato legado debe incluir cada IP local protegida en los bloques afectados y respetar el límite legacy de exclusiones. Si no cabe o cambia semántica, se mantiene la versión compatible o las reservas detenidas; no se trunca la protección.
6. Conservar exportación de interfaces/direcciones/asociaciones y un procedimiento probado de recuperación antes de cualquier `down` poblado. Preservar `lan_interface` no permite reconstruir por sí solo los datos nuevos.

La ejecución operativa y autorización de revertir se gobiernan por AGENTS.md y PLAT-OPS/CTO. Esta propuesta no ejecuta un rollback ni aprueba producción.

## 10. Criterios verificables de datos

| Criterio del análisis | Verificación requerida                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-R01                | Router con dos interfaces; una sin IP y otra con dos direcciones y dos redes; claves e IDs conservados                                                                                                                                                                                                                                                                                                                                   |
| CA-R03                | Dirección con prefijo deriva bloque solo cuando es compatible; `/32` no genera pool y host se normaliza sin perder prefijo configurado                                                                                                                                                                                                                                                                                                   |
| CA-R04                | Gateway manual/virtual y gateway existente no cambian al editar interfaz/dirección; rechazo del cambio de host protegido por referencia                                                                                                                                                                                                                                                                                                  |
| CA-R05                | Gateway/red/difusión/locales tenant-wide/exclusiones no asignables; una coincidencia múltiple se descuenta una vez; ocupación consistente                                                                                                                                                                                                                                                                                                |
| CA-R06                | Registro/edición de IP local frente a servicio vivo y todas las carreras de §7, en ambos órdenes y con barreras/locks, sin sleeps como garantía                                                                                                                                                                                                                                                                                          |
| CA-R07                | Relaciones a otro tenant/router inexistentes o inactivas se rechazan según política; DB compuesta y validación de servidor complementarias; mismo error para ajenas e inexistentes (DC-13)                                                                                                                                                                                                                                               |
| CA-R08                | `lan_interface` ambiguo no se convierte sin confirmación; red con interfaz nula sigue operativa; los servicios no cambian. La conversión solo escribe `legacy_lan_interface_id` y la interfaz nueva: se compara un snapshot antes y después de `network_routers`, redes, direcciones, asignaciones y servicios, y deben ser iguales salvo esas dos escrituras. Tras la migración, `legacy_lan_interface_id` es `NULL` en todas las filas |
| CA-R09                | Exclusión fuera del CIDR o que afecte reserva/servicio vivo provoca rollback completo                                                                                                                                                                                                                                                                                                                                                    |
| CA-R10                | Inactivar interfaz/router/red impide reservas y replay que volvería a emitir instrucciones conforme a §7; no libera ni reasigna servicios ni IP locales                                                                                                                                                                                                                                                                                  |
| CA-R12                | Up/down/up vacío; rollback poblado bloqueado o excepcionalmente recuperable con evidencia; ensayo de rollback de aplicación mantiene protecciones                                                                                                                                                                                                                                                                                        |

Conservar además la prueba vigente de 20 reservas concurrentes con IP distintas, los locks por segmento y el índice parcial. Ejecutar aislamiento con dos tenants y la misma IP host para demostrar independencia. Los fixtures serán sintéticos y las migraciones se aplicarán sobre schemas de prueba explícitos.

### Procedimiento de verificación (diseño, sin ejecución en esta ola)

**Up/down/up en esquema aislado** (patrón de `packages/database/src/migrations/tenant/r2_4_down.integration.spec.ts` e `iwana-tenant-migration`):

1. Schema de prueba sintético y aislado. Se aplican las migraciones tenant reales hasta la anterior a la nueva, con el runner. Nunca contra la base de desarrollo.
2. Capturar la definición del schema (`pg_dump --schema-only` restringido al schema, o consultas a `information_schema`/`pg_catalog`).
3. `up`: verificar columnas, FK compuestas, índices y CHECK `NOT VALID` (`convalidated = false`).
4. `down` en vacío: la definición debe igualar la del paso 2 (diff vacío).
5. `up` de nuevo.
6. Datos sintéticos: dos tenants en schemas distintos; routers, interfaces, direcciones, redes vinculadas y exclusiones.
7. `down` sin la variable de entorno: debe fallar y no alterar conteos.
8. `down` con la variable, solo en el schema desechable: deben conservarse redes, `lan_interface` y reservas; desaparecen solo los objetos y datos nuevos.

**Carreras (PostgreSQL real, sin `sleep`):** la sesión de prueba retiene el `pg_advisory_xact_lock` que se quiere probar. La segunda sesión arranca la operación y se espera hasta que `pg_stat_activity` muestre `wait_event_type = 'Lock'` para ella; entonces se libera la primera. Se prueban ambos órdenes de cada carrera de §7 y los caminos H-1 a H-12. Resultado esperado: una gana y la otra recibe el código de la tabla, sin estados intermedios. Se mantiene la prueba de 20 reservas concurrentes con IP distintas.

**Conciliación I-1:** la consulta de §5.4 debe devolver 0 filas al final de cada prueba de carrera.

**Rendimiento:** `EXPLAIN (ANALYZE, BUFFERS)` de la consulta de conjunto protegido y de la de ocupación, con un pool de tamaño máximo (/16, 65 534 hosts; ADR-098, Escala) y con volumen sintético de direcciones locales. No hay objetivo numérico nuevo (PRD §5): se registran los valores y su comparación con la versión anterior.

CA-R02 y CA-R11 corresponden principalmente a UX/UI; el modelo aporta el contexto de router y relaciones para no pedir datos conocidos. La corrección visual previa y sus 13 pruebas son antecedente, no evidencia de estas tablas ni de su concurrencia.

## 11. Dependencias y decisiones para consolidación (corte original O0-D)

- SR-FULL debe alinear nombres de entidades, campos, errores y DTO documentales; confirmar la política de edición de host/prefijo y el orden de locks de todas las rutas existentes antes de publicar contratos runtime.
- PROD-UX debe exponer origen de candidatas, confirmación del gateway, modo manual y diferencia entre protecciones automáticas y exclusiones adicionales.
- SEC-ENG debe revisar referencias, locks, permisos, auditoría, operación de cambios de dirección y rollback. Los IDs inexistentes/ajenos no revelan información distinta.
- AI-EM-ARCH consolida las adendas PRD/HLD sin alterar ADR-044/098 ni aprobar su propio gate. Cambios de boundary o descubrimiento RouterOS requieren decisión documental propia fuera de esta fase.
- La revisión de estado/inmutabilidad propuesta no transforma el catálogo en configuración de equipo ni en certificación de conectividad.

**Resolución v1.1 de las decisiones de esta sección** (detalle en §12.4 y §12.5):

| Punto                                                                                                  | Resolución                                                                                                                                                                                                        | Dueño que confirma                      | Estado             |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------ |
| SR-FULL: nombres, errores, DTO, política host/prefijo y orden de locks                                 | Nombres de §3 se mantienen. Orden de locks fijado en §7 (L0–L3) con la lista de caminos a corregir (§7.1). Política host/prefijo en DC-14                                                                         | SR-FULL (implementa); SEC-ENG (guardas) | Abierto (A-1, A-2) |
| PROD-UX: origen de candidatas, confirmación de gateway, modo manual, protecciones frente a exclusiones | Origen derivable de la dirección local de la interfaz; las protecciones y exclusiones son conjuntos separados en el modelo (§5.2). No requiere columnas nuevas                                                    | PROD-UX                                 | Abierto (A-4)      |
| SEC-ENG: referencias, locks, permisos, auditoría, cambios y rollback                                   | DC-10 (permisos), DC-11 (auditoría), DC-13 (error uniforme), DC-14 (corrección)                                                                                                                                   | SEC-ENG                                 | Abierto (A-2)      |
| AI-EM-ARCH: consolidar PRD/HLD sin alterar ADR-044/098                                                 | Sin contradicción con ADR-044. La protección de direcciones locales amplía ADR-098 D3 y queda aprobada por ADR-101 v1.1; el HLD addendum v1.0 es el artefacto de re-sync en revisión y pendiente de gates (§12.3) | AI-EM-ARCH                              | Abierto (A-3)      |
| Estado e inmutabilidad: sin transformar el catálogo en configuración de equipo                         | Se mantiene: `status` de interfaz y de red = disponibilidad para reservas, sin telemetría (ADR-098 D9)                                                                                                            | AI-EM-ARCH                              | Cerrado por datos  |

**Dictamen de datos:** viable con los ajustes descritos. **Estado de G1–G4:** pendiente de consolidación y revisión, sin autoaprobación. No se han ejecutado pruebas funcionales, migraciones ni consultas a datos reales para esta propuesta.

## 12. Revisión de cierre (v1.6)

**Alcance.** Verificación de cada cita contra el código y los artefactos; cierre de claves, índices, orden de locks, transición legacy y rollback; resolución de decisiones y declaración de impacto. No se ejecutaron pruebas, migraciones, dev servers ni consultas a datos reales. Las afirmaciones sobre PostgreSQL marcadas como supuesto quedan para G1 (A-6).

**Cambio v1.4 (evidencia A-6).** La consulta de solo lectura en la instancia de desarrollo `dbiw`, `server_version_num=180003`, confirma la volatilidad `IMMUTABLE` de las cinco funciones de §4. La evidencia aplica a PostgreSQL dev 18.3 y no se extiende a otros entornos/versiones. El `EXPLAIN` con volumen sintético sigue pendiente.

**Cambio v1.5 (AI-DATA-ENG).** Se sincroniza el estado documental con ADR-101 v1.1, aprobado por el CTO el 2026-10-26. Se retira su aprobación de los pendientes; G1 permanece sujeto a revisión cruzada y G4 a publicación y congelación del contrato runtime.

**Cambio v1.6 (AI-DATA-ENG).** Se alinea la lectura del orden de locks: el código y el HLD addendum §5.3 indican L1 → L2 para reserva y replay; ADR-098 D3 fija el lock por segmento y no define ni contradice L1. Se elimina la discrepancia documental obsoleta, conservando H-1–H-12 y sus riesgos de implementación. G1 sigue pendiente de revisión cruzada y G4 de contratos runtime publicados y congelados.

**Cambio v1.2 (decisión D-15 de AI-EM-ARCH, comunicada por el coordinador).** Se añade `network_routers.legacy_lan_interface_id uuid NULL` con FK compuesta a `network_router_interfaces(tenant_id, router_id, id)`. Solo la escribe la conversión explícita de `lan_interface` (§8). Nunca se infiere del texto. No hay CHECK que la exija ni backfill: el legado queda `NULL`. Cambios: §3.3, §4 (FK e índice parcial), §7 (L0 incluye la conversión), §8 (expansión, DDL (f), conversión explícita), §9 (orden de `down()` y guarda), §10 (CA-R08), §12.3, §12.4 (DC-18; DC-11 conserva su numeración y amplía su contenido) y §12.5 (A-1 y A-8). La decisión no añade abiertos nuevos: la ruta y el campo de conversión entran en A-1.

### 12.1 Verificación de citas

El borrador v1.0 citaba las primeras filas de esta tabla. Las filas de `network-catalog.service.ts` y la de `network.bodies.ts:111` proceden del análisis de origen (`docs/informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md` §2), que esta spec hereda. Se verifican aquí porque la spec las usa.

| Cita revisada                                                                             | Resultado                                                                                                                                                           | Corrección                                                          |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `network-router.entity.ts:29` (LAN libre)                                                 | Correcta                                                                                                                                                            | Sin cambio                                                          |
| `network.bodies.ts:62` (`lanInterface`)                                                   | Correcta: `z.string().max(64).optional()`                                                                                                                           | Sin cambio                                                          |
| `ipv4-network.entity.ts:17` (router por red)                                              | Correcta; la entidad completa ocupa 9–55                                                                                                                            | Ampliada en §1                                                      |
| `160_network_catalog.ts:58` (pools, gateway, solapamiento)                                | Parcial: la línea 58 es `family(cidr)`. Prefijo en 59, gateway en 60, rango en 61–63, `EXCLUDE` en 75–77                                                            | Citas corregidas en §1 y §4                                         |
| `HLD v1.1, §7, catálogo` (CIDR y gateway inmutables)                                      | Incorrecta: §7 de la HLD son permisos. La regla está en §6.2                                                                                                        | Corregida a §6.2; añadido `network.bodies.ts:138–147` (`.strict()`) |
| `Ipv4NetworkDrawer.tsx`                                                                   | Correcta: CIDR y gateway son de solo lectura en `:277–288`                                                                                                          | Línea añadida                                                       |
| `ipam.service.ts:130`, `:180`, `:212` (omisiones de gateway, red, difusión y exclusiones) | **Incorrecta en el fondo.** Las tres rutas ya excluyen esos valores (`:139–142`, `:195–198`, `:228–231`). Lo que falta es IP locales. `:212` queda fuera de función | Corregido en §1 y §5.2                                              |
| `ipam.service.ts:64` (lock por segmento)                                                  | Desplazada: el lock está en `:61–63` y el `FOR SHARE` de red en `:69`                                                                                               | Corregida                                                           |
| `161_network_provisioning.ts:93` (IP viva única)                                          | Correcta; la definición ocupa `:93–96`                                                                                                                              | Corregida a rango                                                   |
| `network-catalog.service.ts:118` y `:185` (referencias sin validar)                       | Correcta en el fondo: `createRouter` asigna sede y cobertura sin puerto (`:126–129`); `updateRouter` las trata como campos sin consulta (`:174–202`)                | Ampliada en §7.1 H-8                                                |
| `network-catalog.service.ts:651` (`assertNetworkRange` sin exclusiones)                   | Correcta: `:651–681`; no revisa `excludedIps`                                                                                                                       | Ampliada en §4 y §7.1 H-7                                           |
| `network.bodies.ts:111` (sin sede/nodo, `null` no admitido)                               | Desplazada: `organizationSiteId` y `commercialNodeId` están en `:113–114`. `:111` es `lanInterface`. El `null` no se admite porque es `uuidSchema.optional()`       | Corregida en §7.1 H-8                                               |
| ADR-044 D1–D3; ADR-098 D1, D9                                                             | Correctas en contenido: ADR-044 D2 excluye `NODE`; ADR-098 D9 define el adaptador manual                                                                            | Sin cambio                                                          |
| Skill `docs-architect` «consultada»                                                       | No se había abierto                                                                                                                                                 | Corregido en §1                                                     |
| `028_enable_btree_gist` (Q1 de HLD §11)                                                   | Existe en `packages/database/src/migrations/public/028_enable_btree_gist.ts`                                                                                        | Citada en §4                                                        |
| Enlaces de PRD, HLD, ADR-044, ADR-098, informe, spec UX, plan y prompt de definición      | Todos existen en disco                                                                                                                                              | Sin cambio                                                          |
| Enlaces oficiales de MikroTik (§5.1)                                                      | No abiertos en esta revisión                                                                                                                                        | Marcados como supuesto (§5.1)                                       |

### 12.2 Hallazgos de código

Resumidos en §7.1 (H-1 a H-12). Ninguno habilita una doble asignación de servicio, que la unicidad parcial de `ip_assignments` (`161_network_provisioning.ts:93–96`) impide; H-2 y H-3 sí abren ventanas contra el registro de IP locales hasta que se apliquen L0/L2. H-9 a H-12 incorporan los caminos adicionales de reserva repetida, cambio de router, alta de red y asociación.

### 12.3 Contradicciones y extensiones frente a ADR-044, ADR-098 y HLD addendum

- **ADR-044:** sin contradicción. No se añade `NODE` ni FK a `organization_sites`. `commercialNodeId` no sustituye a la sede (`160_network_catalog.ts:21–22`).
- **ADR-098:** sin contradicción. Coherente con D1 (contexto propio), D3 (lock por segmento e índice parcial como garantía final) y D9 (adaptador manual). La protección de IP locales está formalizada por ADR-101 v1.1 (Aprobado). I-1 (§5.4) es una comprobación adicional entre tablas, que el índice parcial no cubre.
- **HLD v1.1:** se mantiene como baseline aprobado e inmutable. El [HLD addendum v1.0](../hlds/HLD-MOD13-INTERFACES-IPV4-ADDENDUM-v1.0.md) existente es el artefacto de re-sync pendiente de gates, conforme a su D-10; no se presupone una HLD v1.2 separada. O0-B debe verificar que su tabla de re-sync cubra:
  1. §3.1 `ipv4_networks`: sin `interface_id` ni los CHECK de §4.
  2. §6.1 IPAM: las tres consultas no consideran IP locales ni el estado de la interfaz.
  3. §6.2 `reserve`, paso 2: añadir interfaz `ACTIVE` y la revalidación bajo lock de §7.
  4. §6.2 `reserve`, paso 6: tomar L2 antes del insert (H-6). Es un cambio de orden; no es un deadlock hoy según §7.
  5. §6.2 `POST`/`PATCH` de `ipv4-networks`: campo `interfaceId` (omisión conserva, `null` desasocia, UUID asigna). `Ipv4NetworkDto` (§4.4) no lo tiene.
  6. §6.2 y §4.4: endpoints de interfaces y direcciones, el campo explícito de conversión de `lan_interface` (D-15) y el código nuevo `IP_PROTECTED_BY_INFRASTRUCTURE` (DC-15) en `NETWORK_ERROR_CODES`.
  7. §6.8: entidades de auditoría nuevas (`NetworkRouterInterface`, `RouterInterfaceIpv4Address`) y la acción de asociación de red.
  8. §9: rutas de UI de interfaces y direcciones (PROD-UX).
  9. §3.1 `network_routers`: `UNIQUE (tenant_id, id)`, y la columna `legacy_lan_interface_id` con su FK (D-15).
  10. FK compuesta tenant-router para `ipv4_networks`, su preflight legacy y los caminos de serialización de reserva/replay, inactivación de router, alta de red y asociación de interfaz (§4, §7 y §8 de este modelo). El orden L1 → L2 para reserva/replay ya está en HLD §5.3; este modelo conserva los hallazgos de implementación H-1–H-12.
- **PRD adenda:** consistente. «Un /32 no permite inferir un pool» y «IP protegidas en todos los pools pertinentes de la empresa» (PRD §5) se cumplen con el alcance «cualquier router del tenant» de §5.2.
- **Seguridad frente a PRD §5:** «referencias ajenas e inexistentes no revelan existencia diferente». La FK compuesta devuelve un error de FK para ambos casos; la aplicación debe responder con el mismo código para ambos (DC-13).

### 12.4 Decisiones cerradas por datos

| ID    | Decisión                                                                                                                                                                                                          | Dueño que confirma                                                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| DC-01 | `host_address` generada (`STORED`) y todos los índices de IP sobre `inet` (§3.2, §4)                                                                                                                              | AI-DATA-ENG en G1 (supuesto de inmutabilidad)                     |
| DC-02 | Nombre de interfaz único case-insensitive; mayúsculas visibles (§4)                                                                                                                                               | PROD-UX (visualización)                                           |
| DC-03 | FK compuestas MATCH SIMPLE, `RESTRICT`/`NO ACTION`; nunca `SET NULL` ni `CASCADE` (§4)                                                                                                                            | Cerrada                                                           |
| DC-04 | Orden de locks L0 < L1 < L2 < L3 con L1 uniforme por OT (§7, §7.1)                                                                                                                                                | SR-FULL (implementa)                                              |
| DC-05 | Revalidación de router, interfaz y red con `FOR SHARE` bajo L2 en reserva y en alta de dirección (§7)                                                                                                             | SR-FULL                                                           |
| DC-06 | CHECK nuevos de máscara, host usable, gateway y cardinalidad, todos `NOT VALID` para legado (§4, §8)                                                                                                              | Cerrada                                                           |
| DC-07 | Migración única, aditiva, sin backfill, sin `CONCURRENTLY`, número «siguiente libre al ejecutar» (§8)                                                                                                             | Cerrada; AI-DATA-ENG en O2-M                                      |
| DC-08 | `down()` con conteo explícito de datos nuevos, orden de drop y `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN` (§9)                                                                                                         | Cerrada                                                           |
| DC-09 | Conciliación I-1 y consulta de §5.4                                                                                                                                                                               | Cerrada; ejecución en QA (A-8)                                    |
| DC-10 | Interfaces y direcciones usan `network.catalog.read` y `network.catalog.manage`; sin permisos nuevos                                                                                                              | SEC-ENG (A-2)                                                     |
| DC-11 | Auditoría con entidades nuevas y `newValue` en lista cerrada; `notes` nunca entra. La conversión audita `legacyLanInterfaceId` y el id de la interfaz creada (D-15). Numeración sin cambio (§6.8 de HLD, en v1.2) | SEC-ENG (A-2)                                                     |
| DC-12 | Sin `updated_by` en interfaces ni direcciones: la autoría de cambios queda en auditoría. Es el mismo criterio que `network_plan_profiles`, que documenta la carencia en `network-catalog.service.ts:561–563`      | Cerrada                                                           |
| DC-13 | Referencias ajenas e inexistentes responden con el mismo error de API (§12.3)                                                                                                                                     | SEC-ENG y SR-FULL (A-2)                                           |
| DC-14 | Operación `correct` con guardas en v1 (§6)                                                                                                                                                                        | Propuesta cerrada en datos; alcance pendiente de AI-EM-ARCH (A-3) |
| DC-15 | Código de IP protegida `IP_PROTECTED_BY_INFRASTRUCTURE`, distinto de `IP_IN_USE` (§5.2)                                                                                                                           | Nombre definitivo: SR-FULL                                        |
| DC-16 | El gateway no se elimina ni se corrige en cascada; es un valor independiente (§3.3, §6)                                                                                                                           | Cerrada                                                           |
| DC-17 | Exclusiones normalizadas a /32 al escribir, deduplicadas y validadas en aplicación (§5.3)                                                                                                                         | Cerrada                                                           |
| DC-18 | `legacy_lan_interface_id` (D-15, AI-EM-ARCH): solo la conversión explícita la escribe; sin backfill; sin CHECK; FK compuesta MATCH SIMPLE (§3.3, §4, §8, §9)                                                      | Cerrada por AI-EM-ARCH; ruta y campo de conversión: SR-FULL (A-1) |

### 12.5 Abiertos con dueño

| ID  | Abierto                                                                                                                                                                                                                                                                                                                                                              | Dueño                                     | Bloquea                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| A-1 | Confirmar la lista de caminos a corregir (§7.1, H-1 a H-12) y su inclusión en el encargo de implementación; ruta y campo de conversión de `lan_interface` (D-15)                                                                                                                                                                                                     | SR-FULL                                   | G4 (encargo)                                                    |
| A-2 | Validar las guardas de `correct` (DC-14), los permisos (DC-10), la auditoría (DC-11) y el error uniforme (DC-13)                                                                                                                                                                                                                                                     | SEC-ENG                                   | G4 (congelación del API)                                        |
| A-3 | Decidir el alcance de `correct` (DC-14) y confirmar que PRD/HLD/API conservan la alineación con el modelo y ADR-101 v1.1 aprobado; no declarar publicación ni congelación del contrato runtime                                                                                                                                                                       | AI-EM-ARCH                                | G1 (cierre formal) y G4 (contrato)                              |
| A-4 | Confirmar la presentación de origen de candidatas y de protecciones separadas de exclusiones                                                                                                                                                                                                                                                                         | PROD-UX                                   | G2                                                              |
| A-5 | Tratar `notes`, nombres e IP como potencialmente personales/sensibles: excluir texto libre de auditoría, logs y URLs; verificar su clasificación y retención con fuente oficial. Si se confirma PII, decisión de CTO + Legal                                                                                                                                         | SEC-ENG; CTO + Legal si aplica            | G4 si afecta el contrato; producción para retención             |
| A-6 | Parcialmente cerrado: consulta RO en `dbiw` dev confirma `pg_proc.provolatile='i'` para `set_masklen(inet, integer)`, `set_masklen(cidr, integer)`, `host(inet)`, `network(inet)` y `broadcast(inet)` con `server_version_num=180003` (PostgreSQL 18.3). Pendiente: `EXPLAIN` con volumen sintético y repetir la comprobación si el entorno destino usa otra versión | AI-DATA-ENG (on-demand, en O2-M)          | G3 y O2-M por medición; revalidar si difiere la versión destino |
| A-7 | Medir en lectura, en la base de un tenant real, las comprobaciones de §8 (filas legadas que incumplen los CHECK). Sin corrección automática                                                                                                                                                                                                                          | PLAT-OPS (acceso) y AI-DATA-ENG (lectura) | VALIDATE en O2-M                                                |
| A-8 | Escribir las pruebas de up/down/up, de carreras de §10 y de la conversión de `lan_interface` (CA-R08), y registrar conteos reales                                                                                                                                                                                                                                    | AI-SR-QA y AI-SR-FULL                     | G6                                                              |

### 12.6 Impacto

- **Multi-tenant.** Aislamiento por schema con `SET LOCAL search_path` vía `runInTenantSchema`. Los locks de catálogo llevan `tenantId`; los de pool, el UUID global de la red. `tenant_id` en las tablas nuevas es defensa redundante, según la convención del repo. No hay FK ni joins a otros módulos. No hay jobs nuevos, así que el contexto de tenant de BullMQ no interviene. Prueba obligatoria con dos tenants y la misma IP host.
- **Seguridad.** Superficie nueva: catálogo de interfaces y direcciones bajo los mismos permisos (DC-10). IDs ajenos e inexistentes con la misma respuesta (DC-13). `notes` fuera de auditoría y logs; no se incluyen secretos ni datos de suscriptor. SEC-ENG considera nombres e IP potencialmente personales/sensibles hasta verificar clasificación y retención por fuente oficial (A-5). Entrada validada en Zod y CHECK. Revisión SEC-ENG antes de G4 (A-2).
- **Escala.** Catálogo pequeño por tenant (supuesto: decenas de routers, interfaces y direcciones como máximo). El pool máximo es /16, 65 534 hosts (ADR-098, Escala). El conjunto protegido es O(IP locales del bloque) y se obtiene con un rango indexado sobre `(tenant_id, host_address)`. La búsqueda de la siguiente IP sigue siendo O(pool) bajo lock, como hoy. Se mide en G1 (A-6).
- **Regulación y PII.** No se propone vincular direcciones locales a suscriptores. SEC-ENG trata `notes`, nombres e IP como potencialmente personales o sensibles y excluye el texto libre de auditoría, logs y URLs; su clasificación legal y retención quedan en A-5 y requieren fuente oficial. No hay tablas CRC, SUI ni DIAN afectadas.

### 12.7 Verificaciones y evidencia

- No se ejecutó ninguna prueba, migración, comando `pnpm` ni dev server.
- Consulta de solo lectura a la instancia de desarrollo `dbiw`, como `iwana_readonly`: `server_version_num=180003` (PostgreSQL 18.3, alineado con el baseline validado). `pg_proc.provolatile='i'` para `pg_catalog.set_masklen(inet, integer)`, `set_masklen(cidr, integer)`, `host(inet)`, `network(inet)` y `broadcast(inet)`. Esta evidencia describe solo la instancia consultada y no se generaliza a otras versiones o entornos.
- El `EXPLAIN` con volumen sintético sigue pendiente. El tipo de retorno de `host()` (`text`) y el comportamiento de MATCH SIMPLE también quedan pendientes de verificación en esquema aislado; no se consultaron en esta evidencia.
- Las citas de código se comprobaron abriendo los archivos indicados en esta revisión. Los enlaces externos no se abrieron (§5.1).

### 12.8 Veredicto O0-D (histórico)

**Dictamen O0-D:** el modelo está apto para handoff a O0-B y para revisión cruzada de G1, sin que este dictamen cierre G1. La v1.2 incorporó D-15; la v1.3 precisa locks/replay y agrega FK tenant-router para redes; la v1.4 registra evidencia parcial de A-6 en PostgreSQL dev 18.3; la v1.5 registra ADR-101 aprobado; la v1.6 alinea la lectura de locks con el HLD addendum. G1 sigue pendiente de revisión cruzada. G4 sigue pendiente de contratos runtime publicados y congelados, además de los ajustes de A-1 a A-3. No se ejecutaron pruebas ni migraciones; A-6 sigue pendiente para EXPLAIN y para cualquier entorno destino con versión distinta. Esta spec no autoriza migraciones ni código.

**Lectura documental de locks:** el modelo y el HLD addendum §5.3 establecen L1 → L2 para reserva y replay; ADR-098 D3 fija el lock por segmento y no define ni contradice L1. El orden L0–L3 y los riesgos documentados en §7.1 siguen vigentes para la implementación; no hay cambio al algoritmo aprobado ni propuesta de modificar ADR-098.

## 13. Baseline sintético de migración E-2/E-5

### 13.1 Propósito y límites

La semilla verifica preservación del estado legacy ante la migración 165 sin tomar una muestra de `dbiw`. El generador [mod13-ca-r12-baseline.cjs](../../scripts/mod13-ca-r12-baseline.cjs) construye exclusivamente el fixture del PostgreSQL E-1; el resultado resumido está en [evidencia E-2/E-5](../quality/evidence-mod13-ca-r12-e1/e2-e5.json). La matriz QA v1.8 §13.7 define los criterios operativos vigentes.

El script aborta si host, puerto, usuario o nombre de DB difieren del destino E-1. El secreto se lee desde `MOD13_CA_R12_CONNECTIONS_FILE` y no se escribe en la evidencia ni en stdout. El generador solo acepta las bases de fixture con nombres incluidos en su allowlist; `--reset` elimina únicamente el schema/base sintética identificada dentro de esa DB desechable. `dbiw` no se leyó ni se modificó.

No se crea pool `/32` ni una red sin gateway: migración 160 impone `/16–/30` y `gateway NOT NULL`. Una dirección local `/32` se agrega solo después del ciclo E-5, en las bases clonadas E-6/E-7. Los routers se asocian a sedes físicas sintéticas; `commercial_node_id` queda `NULL`, y el fixture no crea nodos comerciales ni zonas de cobertura.

### 13.2 Ejecución reproducible

```powershell
$env:MOD13_CA_R12_CONNECTIONS_FILE = 'C:\Users\<usuario>\AppData\Local\Temp\iwana-mod13-ca-r12-e1\connections.json'
node scripts/mod13-ca-r12-baseline.cjs --reset
```

La conexión fijada fue PostgreSQL 18.3 en `127.0.0.1:5434`, DB `iwana_it_mod13_ca_r12_e1`, usuario `mod13_ca_r12`; la base estaba aislada en contenedor sin volúmenes persistentes. El comando `pnpm --filter @iwana/db migration:run` aplicó las 27 migraciones públicas no diferidas. La migración pública 022, `DropPlatformUsersEmailHash`, permaneció diferida por su flag de contract. Para tenant, el generador usa el `TENANT_MIGRATIONS` y `applyTenantMigrationsInOrder` reales hasta 164 (160 clases registradas en el array); activa `IWANA_APPLY_PII_CONTRACT=true` solo en el env pasado al runner tenant para que la 109 no se omita. No sustituye DDL ni habilita `synchronize`.

El array aplicó 160 clases hasta 164; tras cada `up` de 165 el registro quedó con 161. El ciclo del schema E-5 fue: seed anterior a 165 → primera `up` → `down` permitido con `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN` ausente → segunda `up`. Antes del `down`, las dos tablas nuevas tenían cero filas y ambos vínculos aditivos seguían `NULL`. Los cuatro cortes produjeron los mismos conteos, estados y SHA-256 por tabla.

### 13.3 Volumen y distribución reales

| Entidad o clase                                                           |                              Conteo |
| ------------------------------------------------------------------------- | ----------------------------------: |
| Sedes físicas sintéticas                                                  |                                   3 |
| Routers con `lan_interface` nulo                                          |                                   4 |
| Routers con `lan_interface` vacío                                         |                                   4 |
| Routers con una interfaz simple                                           |                                   4 |
| Routers con texto de varias interfaces                                    |                                   4 |
| Routers con texto libre                                                   |                                   4 |
| Pools `/16` / `/24` / `/30`                                               |                          1 / 48 / 1 |
| Pools `/32` o sin gateway                                                 |                               0 / 0 |
| `ip_assignments` RESERVED / ACTIVE / RELEASED                             |             700 / 700 / 600 (2.000) |
| `service_provisionings` RESERVED / CERTIFIED / ACTIVE / FAILED / RELEASED | 700 / 100 / 700 / 100 / 600 (2.200) |
| Filas `audit_logs` sintéticas                                             |                                  50 |

Todos los datos —incluidos identificadores, correos `example.invalid`, timestamps y contenido de auditoría— son sintéticos y deterministas; las direcciones de red usan RFC1918. El gateway de cada pool es obligatorio y está en el CIDR. Los estados permitidos por los CHECK reales se incluyeron sin ampliar el enum. La comprobación referencial devolvió cero routers sin sede, pools sin router, servicios sin router/pool, asignaciones sin servicio/pool y vínculos inversos de asignación divergentes.

### 13.4 Huellas E-5

La huella usa `jsonb_agg(to_jsonb(record) ORDER BY record.id)::text` y SHA-256. La proyección de `network_routers` excluye solo `legacy_lan_interface_id` y la de `ipv4_networks` excluye solo `interface_id`, las dos columnas aditivas de 165. Se incluyen las columnas estables de `organization_sites`, `network_routers`, `ipv4_networks`, `service_provisionings`, `ip_assignments` y `audit_logs`. El artefacto E-5 conserva huellas y conteos en cada corte por separado.

| Tabla legacy            | Filas en cada corte | SHA-256 idéntico en los cuatro cortes                              |
| ----------------------- | ------------------: | ------------------------------------------------------------------ |
| `organization_sites`    |                   3 | `73cd71be30a5aa4b3ed774087dcc3ff7e47fd34637c611e2fd5626455ae0fc26` |
| `network_routers`       |                  20 | `821cf105dd86dabd5fe20080d1d2dd117b094cd6484d5972e9026ec871ae8b90` |
| `ipv4_networks`         |                  50 | `7e3f775c40a8b6cb448a74089c24e2e6b5f20410d09295e8679105e248ea5ed2` |
| `service_provisionings` |               2.200 | `22ee05577302737c9e1650d028cffdbe76b0cdf11f0f80258a6dd4d93e320b49` |
| `ip_assignments`        |               2.000 | `bd2d633e8254a51ca6594b01d0c4075ce11d43af38f908092f50dd60ccff48fb` |
| `audit_logs`            |                  50 | `59a80a32143b55b6ad7e705aa9d26e878d62775ce413128fe7b8d66b2547d9e8` |

Los conteos por estado y de `lan_interface`, además de estas seis huellas por cada uno de los cuatro cortes, están en el JSON de evidencia. Tras finalizar E-5, el DB de origen quedó en 165 y conserva 20 routers, 50 redes y 2.000 asignaciones, con cero interfaces/direcciones locales.

### 13.5 Clones separados y aislamiento de procesos para E-6/E-7

Después del ciclo E-5 se cerraron las conexiones al origen y se clonó la base completa con `CREATE DATABASE ... TEMPLATE` en dos bases desechables: `iwana_it_mod13_ca_r12_e6` y `iwana_it_mod13_ca_r12_e7`. Ambas contienen el mismo UUID de tenant, IDs legacy, hashes y schema `tenant_mod13_ca_r12_e5`; solo difieren en el database name. En cada clon se añadieron dos interfaces sintéticas y dos direcciones locales `/32` después de 165, una ligada a interfaz activa y otra a interfaz inactiva. Los nombres `mod13_ca_r12_e6` y `mod13_ca_r12_e7` son identificadores de aislamiento previstos, no prefijos BullMQ efectivos: la configuración actual de API y worker no expone ni aplica `BullMQ.prefix`.

La verificación de lectura con `psql` dio para cada base: 161 filas en el registro tenant, un tenant canónico, 20 routers, 50 pools, 2.000 asignaciones y 2 interfaces + 2 direcciones locales. La base de origen E-5 sigue sin interfaces/direcciones. Las bases clonadas aíslan los datos PostgreSQL, pero por sí solas no aíslan API, worker ni colas. E-2/E-5 no usaron Redis; las etiquetas `redisIsolationLabel` del JSON identifican los clones, no acreditan aislamiento operativo. Para ejecutar E-6/E-8 y E-7 en paralelo, fijar `DB_NAME` al clon correspondiente y arrancar procesos API/worker separados con entornos independientes. E-6/E-8 reserva API en `PORT=3004` y Portal en `PORT=3005`; E-7 usa el backend anterior verificable y reserva, tras comprobar disponibilidad, `PORT=3006`. Cada rama debe apuntar a un Redis endpoint aislado o, en Redis standalone, a un `REDIS_DB` diferente comprobado con inventario de claves/colas; separar solo variables nominales o nombres de prefix no sirve. API y worker leen `REDIS_HOST`, `REDIS_PORT` y `REDIS_DB` desde entorno, y worker comparte esa configuración con su cliente Redis de telemetría.

El arranque registra repeatables y puede consumirlos: API programa la reconciliación de provisioning, limpieza de inventario y sweep de privacidad; sus procesadores `@Processor` también consumen colas. Worker registra sus propias tareas repeatables —relay/rescan, limpieza de DLQ, tombstones, eventos expirados, huérfanos y purgas— y consume sus colas al registrar procesadores. Los `jobId` fijos hacen identificable el registro, pero no impiden que un bootstrap lo vuelva a registrar. API y worker configuran `migrationsRun: false` y `synchronize: false`, por lo que el bootstrap no ejecuta migraciones ni sincroniza el schema automáticamente.

Para contener E-7, antes del backend anterior se pausa la admisión síncrona (`NETWORK_RESERVATIONS_PAUSED=true`) y se instala además el bloqueo externo de rutas y colas previsto por la matriz; esa variable solo protege las rutas síncronas de reserva/reemisión y no detiene schedulers ni procesadores. Se detienen schedulers/workers, se espera cero operaciones activas, se capturan repeatables y conteos BullMQ, y se mantienen pausadas las colas aisladas durante el bootstrap. Luego se comparan repeatables y conteos; si el arranque re-registra repeatables o altera colas, no se habilitan workers ni se retira el bloqueo hasta restaurar el backend protector. Si no pueden confirmarse procesos y Redis aislados, E-6/E-7 se ejecutan secuencialmente según QA v1.8 §13.7. No se ejecutó E-7.

E-6, E-7, E-8, el dictamen SEC-ENG y G6 permanecen pendientes.

**Verificación de este bloque:** `pnpm --filter @iwana/db exec jest src/migrations/tenant/migration-order.spec.ts --runInBand` → 1 suite, 6 tests PASS, 0 skipped; `pnpm --filter @iwana/db build` PASS; `node --check scripts/mod13-ca-r12-baseline.cjs` PASS; hash del generador `91b78e32bc71dfc25c94c0ec08b7a5d3f00cf05bbebcdebf15fa739361874ed9`. La corrida real y sus cuatro snapshots E-5 se registran en el JSON enlazado arriba. Esto no declara G6 PASS ni cambia `NETWORK_IP_PROTECTION=PENDING`.

### 12.9 Dictamen O0-D y handoff (histórico)

- **Listo para O0-B:** SR-FULL puede consolidar la API con los cardinales existentes, las FK nuevas, H-1–H-12, el orden L0–L3, el replay idempotente, el preflight legacy y el rollback sin pérdida de protección. Los contratos API/HLD deben reflejar estos puntos antes de G4.
- **Revisión cruzada pendiente:** SEC-ENG debe validar las guardas de `correct`, autorización, auditoría y error uniforme; SR-FULL debe confirmar factibilidad/orden de locks. Este documento no atribuye esos dictámenes.
- **ADR-101:** aprobado por el CTO el 2026-10-26; su contenido exige protección tenant-wide en las tres rutas IPAM. La aprobación no acredita implementación, publicación/freeze del runtime ni G4.
- **Evidencia:** no se ejecutaron `pnpm`, pruebas, migraciones ni benchmarking. Se registra la consulta RO de metadatos PostgreSQL descrita en §12.7. No se declara G1, G4 ni otro gate.
