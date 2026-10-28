# PRD — MOD13: interfaces y registro asistido de IPv4

**Versión:** 1.0  
**Estado:** Superado el 2026-10-26 por [PRD addendum v1.1](PRD-MOD13-INTERFACES-IPV4-ADDENDUM-v1.1.md); conserva el corte histórico previo al freeze G4.  
**Fecha:** 2026-10-26  
**Modo:** Product Architect + EM  
**Autor:** AI-EM-ARCH  
**Base:** [PRD MOD13 Fase 01 v1.1 aprobado](PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md)  
**Análisis:** [seis observaciones y opción B](../informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md)  
**Plan:** [orquestación](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md)

## 1. Contexto y objetivo

El catálogo actual distingue router y red, pero su LAN singular de texto no representa varias interfaces ni direcciones del equipo. El alta de red tampoco conserva el contexto del router y exige capturar datos que podrían reutilizarse. El usuario aprobó el 2026-10-26 la opción B: interfaces y direcciones explícitas, registro contextual y gateway asistido confirmado.

La aprobación humana elige el alcance. Esta adenda formaliza sus reglas sin sustituir las reglas de aprovisionamiento, certificación o activación de Fase 01. Su revisión independiente completa la definición antes de congelar contratos.

## 2. Alcance y boundaries

MOD13 incorpora el catálogo de interfaces y direcciones IPv4 locales del router, su asociación opcional a redes durante la transición, continuidad de registro router→red, referencias válidas y protección de IP de infraestructura en IPAM ([ADR-101 aprobado](../adrs/ADR-101-Enmienda-ADR-098-Proteccion-IP-Infraestructura-MOD13-v1.1.md)).

Organización conserva la sede física. El nodo técnico pertenece al futuro NMS; cobertura conserva su nodo comercial. Se respetan [ADR-044 aprobado](../adrs/ADR-044-Separacion-OrganizationSite-NmsNode.md) y [ADR-098 aprobado](../adrs/ADR-098-IPAM-y-Aprovisionamiento-Certificado-MOD13.md). No se añade tipo o capacidad «Nodo» a Sedes.

Fuera: NMS, descubrimiento/escritura RouterOS, credenciales, configuración de VLAN/bridges, VRF, IPv6, retiro automático de infraestructura y cambios en reglas de certificación/activación. Se conserva la prohibición vigente de solapamientos de pools; esta adenda no la modifica. Registrar el nombre de una interfaz lógica describe un dato existente; no configura el equipo.

## 3. Personas y casos de uso

| Actor                                                      | Tarea                                                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Administración o Aprovisionamiento con gestión de catálogo | Registrar equipo, ubicación, interfaces, direcciones y bloques; revisar capacidad disponible |
| Persona con lectura de catálogo                            | Consultar equipos, interfaces/redes y estado; no mutar                                       |
| Aprovisionamiento con permisos de ejecución                | Reservar IP de servicio desde redes disponibles sin ocupar infraestructura                   |
| Operador que normaliza registros históricos                | Confirmar explícitamente interfaces y direcciones conservando redes y servicios existentes   |

Casos núcleo: registrar router y continuar a su primera red; añadir segunda interfaz/red; reutilizar una dirección explícita; registrar gateway manual diferente; desasociar sede/cobertura; corregir referencias y excluir IP adicionales sin efectos parciales.

## 4. Requisitos funcionales

| ID       | Requisito                                                                                                                                                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RF-IF-01 | Un router admite cero o varias interfaces; una interfaz admite cero o varias direcciones IPv4 y varias redes asociadas                                                                                                  |
| RF-IF-02 | Guardar router y añadir red conserva el ID creado; fallo de la segunda etapa no duplica ni revierte el equipo                                                                                                           |
| RF-IF-03 | El catálogo global de redes conserva filtro/contexto de router y permite entrada sin contexto mediante selección explícita                                                                                              |
| RF-IF-04 | El nombre de red se sugiere de forma determinista, es editable y no exige una segunda captura arbitraria                                                                                                                |
| RF-IF-05 | Una IP/prefijo explícito apto propone bloque/gateway mostrando su origen; varias candidatas requieren elección; siempre existe entrada manual                                                                           |
| RF-IF-06 | El gateway confirmado se persiste en la red y no cambia en cascada al editar interfaz/dirección; CIDR/gateway existentes conservan su inmutabilidad                                                                     |
| RF-IF-07 | Las IP locales registradas de la empresa dentro del bloque no son asignables a servicios, además de las protecciones existentes                                                                                         |
| RF-IF-08 | Reserva manual, automática y ocupación usan la misma disponibilidad deduplicada; no se descuenta dos veces una IP                                                                                                       |
| RF-IF-09 | Alta/cambio de IP local frente a asignación reservada/activa se rechaza de forma atómica y no libera ni reasigna el servicio; cambiar el host por `correct` requiere confirmación explícita `confirmReleasedHost: true` |
| RF-IF-10 | Sede/cobertura se validan por dueño y contexto de empresa; omisión conserva, null desasocia y UUID válido asigna                                                                                                        |
| RF-IF-11 | Exclusiones adicionales válidas pertenecen al bloque y no pueden afectar una IP viva; errores conservan datos del formulario y no producen actualización parcial                                                        |
| RF-IF-12 | El estado del catálogo comunica disponibilidad para reservas, no encendido ni telemetría del equipo; la corrección visual previa se conserva                                                                            |

## 5. Reglas de negocio y requisitos no funcionales

- Tenant desde contexto autenticado y aislamiento por schema con `SET LOCAL` por transacción. Nuevos IDs validan empresa/router/interfaz; IDs inexistentes, con padre incorrecto o fuera del conjunto de sedes autorizado responden igual (`404 RESOURCE_NOT_FOUND`). Dentro del scope autorizado, falta de permiso de acción responde 403. Comunicación entre módulos por puertos tipados.
- Direcciones de interfaz y pools son dominios distintos: las primeras conservan IP/prefijo y admiten `/32`; los pools mantienen `/16–/30`, unicidad de IP viva y prohibición vigente de solapamientos. Un `/32` no permite inferir un pool mayor.
- Las IP locales se protegen por su host en todos los pools del tenant que contengan esa dirección, incluso desde otro router o una interfaz inactiva. Reserva manual, automática y ocupación usan el mismo conjunto deduplicado. Las exclusiones sistémicas no se copian silenciosamente a las manuales.
- La autorización de una ruta sobre un router o una red se deriva de la sede persistida del recurso resuelto dentro del tenant. `siteId` u `organizationSiteId` del body/query nunca conceden alcance final. Para crear con sede destino, el servidor valida por el puerto de Organización y autoriza el destino real por el puerto de Access Control; sin sede destino exige permiso tenant-wide. Los listados de perfiles limitados filtran resultados antes de contar o paginar; el filtro enviado por el cliente no sustituye ese control.
- Inactivar interfaz impide nuevas asociaciones y reservas en redes vinculadas, preservando servicios y protección de direcciones. Redes históricas sin interfaz conservan reglas actuales de router/red.
- No permitir borrado físico de interfaces/direcciones referenciadas en este corte. Cambios de dirección son explícitos y sujetos a conflictos/referencias; editar identificación no altera direcciones ni gateways.
- Referencias históricas inactivas permanecen legibles y no requieren sustitución para editar otro dato; una asociación nueva exige destino activo.
- Sugerencias no confirmadas pueden recalcularse; valores editados o confirmados se conservan y se solicita revisión ante incoherencia.
- Concurrencia, auditoría, permisos, versionado y validación runtime se aplican a las operaciones nuevas. Cero PII real o secretos. Accesibilidad WCAG 2.2 AA y controles de al menos 44 px en superficies afectadas.
- No se inventan objetivos numéricos de rendimiento: conserva los RNF del módulo vigente y mide el impacto del cálculo de disponibilidad con sus pruebas.

## 6. Modelo de datos borrador

`NetworkRouter` conserva identidad y referencias. `RouterInterface` pertenece a router y empresa. `RouterInterfaceIpv4Address` pertenece a una interfaz, conserva IP/prefijo y representa una dirección declarada. `Ipv4Network` mantiene router, CIDR, rango, gateway y exclusiones; incorpora asociación nullable a interfaz.

No se infieren entidades desde `lanInterface` libre. El texto legacy y todos los datos de redes/servicios permanecen intactos durante la migración aditiva. La confirmación de normalización es una operación explícita del operador.

La definición física e invariantes se detallan en el HLD/adenda y en la spec de modelo producida por DATA-ENG. La propiedad de estos datos permanece en MOD13.

## 7. Contratos API borrador

Operaciones previstas: consultar/crear/editar/inactivar interfaces; consultar/registrar/editar direcciones declaradas; asociar red a interfaz; crear red desde contexto y modos de entrada inequívocos; validar y desasociar referencias. Todas requieren permisos y validación coherentes con el catálogo vigente.

PATCH distingue omisión/null/valor. La creación de redes acepta nombre omitido con fallback; la edición preserva nombres existentes salvo cambio explícito. Un código específico identifica IP protegida de infraestructura y se diferencia de IP ocupada por un servicio. No se cambia la semántica de los contratos existentes sin compatibilidad publicada y pruebas de consumidores.

Las formas request/response/errores serán documentadas por SR-FULL antes de publicar Zod/DTO/OpenAPI. Esta adenda no declara contratos runtime congelados.

## 8. Criterios de aceptación

Se adoptan **CA-R01–CA-R12** del [análisis, §7](../informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md#7-criterios-de-aceptación-de-la-evolución): cardinalidades, continuidad de contexto, derivación correcta, estabilidad de gateway, protecciones IPAM, concurrencia, tenancy/PATCH, compatibilidad, exclusiones, estado, a11y y rollback.

Además, la regresión mantiene los criterios vigentes de Fase 01, incluidas 20 reservas concurrentes distintas, desactivar sin liberar IP vivas y aprovisionamiento/certificación/activación existentes.

## 9. Dependencias, riesgos y transición

Dependencias: puertos de lectura de Organización y del dueño actual de cobertura; publicación compatible de contratos; migración tenant manual numerada al ejecutar; backend protector antes de captura UI; estrategia QA con esquemas creados por migraciones reales. Tras la primera captura de direcciones, un rollback no puede volver a un backend que ignore su protección; debe conservar el backend protector o detener externamente todas las reservas, replay y regularizaciones hasta reconciliarla.

Riesgos: referencias inválidas, normalización inferida del legacy, duplicación de registros al fallar una etapa, protección incompleta en alguna ruta IPAM y carreras entre infraestructura/reservas/alta de pool. La vuelta al API antiguo puede ignorar IP locales; rollback debe mantener backend compatible o detener reservas nuevas hasta reconciliar protección, sin liberar servicios.

La reversibilidad se ensaya con `up/down/up` en esquema aislado y datos poblados; nunca se ejecuta un revert destructivo de datos reales por esta definición. Los pendientes de G7 de Fase 01 no se declaran cerrados por esta evolución.

## 10. Definition of done y gobierno

Ola 0 termina con modelo, flujo, API preliminar y PRD/HLD coherentes, referencias verificadas y revisión cruzada registrada. La opción B y ADR-101 v1.1 están aprobados y no se vuelven a pedir. **G1: PASS**, revisiones independientes de AI-SR-FULL (factibilidad backend) y AI-PROD-UX (alcance/producto) sobre PRD/HLD vigentes, revalidadas después de D-23–D-25. AI-EM-ARCH registra el cierre el 2026-10-26 en el [informe vivo de análisis](../informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md).

**G2: PASS y cerrado por AI-EM-ARCH el 2026-10-26.** DS-OWNER entregó el contrato v1.2, PROD-UX sincronizó UX v2.1 y SR-QA emitió PASS independiente de testabilidad sobre UX/DS y SEC v1.2. La suite enfocada renderizó los estados reales de `Badge`/`PortalAlert`: 1 suite, 53 tests, 0 skips; los textos pasan contraste AA en los contextos revisados. La matriz QA v1.0 registra ratios y el caveat del icono de advertencia decorativo.

**G3: PASS y cerrado por AI-EM-ARCH el 2026-10-26.** El contenido funcional de API v1.5, mantenido en API v1.7, concreta la autorización por permiso efectivo y sede persistida, D3 manage-only y las etiquetas de D10 después de `ALLOWED`. FE v1.2 y SEC v1.4 emitieron PASS; QA v1.2 recomendó PASS independiente, dictamen preservado por la matriz v1.3. DS v1.3 y UX v2.2 están sincronizados (el contenido funcional de UX revisado para G3 es v2.1). Se conserva `PermissionsGuard` genérico para los demás módulos. **G4 no emitido:** O2-C publicó componentes y snapshot de rutas existentes, pero faltan handlers/proyecciones requeridos y el snapshot conserva contratos legacy en rutas tocadas. El DoR de G4 depende de trabajo runtime previsto para O2-H/O2-M; la dependencia pendiente está en el plan y el informe vivo. No iniciar implementación ni congelar por Markdown. La implementación requiere pruebas core ≥80 %, PostgreSQL real, migración reversible, E2E, accesibilidad y revisión de seguridad. G6, G6.5 por SHA y G7 productivo permanecen separados según el protocolo.
