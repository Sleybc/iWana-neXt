# PRD - MOD05 CRM Módulo Subscriber — Fase 04 (Completitud de la ficha 360° y cierre de módulo)

**Version:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-09-04
**Modo activo:** Product Architect + Architect
**Autor:** AI-EM-ARCH
**Aprobación:** CTO, 2026-09-04 — decisiones D1–D4 registradas en §9.4. Gate **G1** satisfecho con review cruzado previo de **AI-SR-FULL** (factibilidad backend) y **AI-PROD-UX** (viabilidad UX), emitidos en la misma sesión de auditoría (Perfil AI-EM-ARCH §3.4)
**Trazabilidad base:** docs/prds/PRD_Sistema_ISP_Colombia_v2_4.md
**PRD padre:** docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md *(superado por este documento — ver §9.3)*
**PRD Fase 02:** docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-02-v1.0.md *(superado por este documento — ver §9.3)*
**PRD Fase 03:** docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-03-v1.0.md *(vigente salvo RF-S360-11, RF-S360-14, §3.2 y CA-S360-08 — ver §9.3)*
**HLD relacionado:** docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md *(requiere corrección — ver §9.6)*
**ADRs aplicables:** ADR-022 (ejecución modular, enmendado por ADR-080), ADR-024, ADR-025, ADR-026, ADR-027, ADR-038 (boundary Assurance), ADR-048 (boundary Inventario/SCM), ADR-058, ADR-065 (paginación y orden), ADR-066, ADR-067 (proyección PII), ADR-070, ADR-080, ADR-083 (RBAC granular)
**ADR nuevo requerido:** ninguno. Esta fase opera dentro de boundaries ya aprobados
**Identidad corporativa:** docs/identity/Manual_Implementacion_Identidad_Iwana.md — obligatorio

---

## 1. Contexto y motivación

MOD05 quedó con la Fase 03 completada el 2026-05-14 y **sin informe de cierre de módulo**. El informe de regularización (`docs/informes/INFORME-PROGRAMA-REGULARIZACION-MODULOS-v1.0.md:64-73`) lo declara `Suspendido`, con dos condiciones de retorno: resolver dos PRDs atascados en `Propuesto` y emitir el cierre con evidencia de gates. MOD05 es, junto a MOD00, el contenido de la **Ola 2** del roadmap aprobado por el CTO.

La auditoría de la ficha `/dashboard/crm/subscribers/[id]` ejecutada el 2026-09-04 encontró que los tres tabs finales (Financiero, Cumplimiento, Seguimiento) son tarjetas de una sola frase, que el mapa de georreferenciación **está bloqueado por la política CSP del portal** desde su construcción, y que el inventario del cliente y los tickets no tienen ninguna superficie.

El hallazgo determinante es normativo, no técnico: **el PRD Fase 03 ordena expresamente dejar equipos y tickets como stub** (RF-S360-14, §3.2). Esa instrucción fue correcta cuando se emitió — MOD12 y MOD10 no existían. Hoy MOD12 está **cerrado** con comodatos reales por suscriptor (`INFORME-MOD12-CIERRE-MODULO-v1.0.md:80-81`) y MOD10 está construido con tickets referenciados por ID lógico. **El stub dejó de estar justificado por inexistencia y pasó a ser deuda funcional.** Mantenerlo incumple RF-CRM-02 del PRD maestro (`PRD_Sistema_ISP_Colombia_v2_4.md:372`), que exige una ficha 360° con contratos, tickets, dispositivos e historial de contacto.

Esta fase levanta esa exclusión, completa la ficha y deja MOD05 en condición de cierre en construcción (G6 + G6.5, ADR-080).

## 2. Objetivo de la fase

Que la ficha del suscriptor responda, sin salir de ella, las tres preguntas operativas que hoy obligan a abandonarla:

1. **Dónde vive** — georreferenciación funcional y legible.
2. **Qué le ha pasado** — bitácora real de actividad, no dos eventos derivados.
3. **Qué tiene y qué le falla** — equipos instalados en comodato y tickets de mesa de ayuda.

Y como objetivo de programa: cerrar la deriva documental que impide el cierre de MOD05.

## 3. Alcance

### 3.1 En scope — Ola A (sin cruce de boundary)

- Sustitución del mapa embebido por el patrón Leaflet ya vigente en el repo, con sus cuatro estados.
- Corrección del contrato de coordenadas: serialización numérica y capacidad de borrado.
- **Contactos del suscriptor**: creación de la tabla ausente y unificación de la capacidad hoy duplicada (§5.6).
- Relleno del payload 360° con las colecciones que hoy se devuelven vacías por código.
- Tab **Seguimiento** con bitácora paginada y filtrada, por proyección de lectura.
- Cierre de los hallazgos de seguridad bloqueantes H-1, H-2 y H-7 (§6.1).
- Higiene del listado y de la tira de tabs: retiro del anuncio de orden que el servidor ignora (§9.5), deep-linking, patrón APG, gating de escritura.

### 3.2 En scope — Ola B (integración cross-módulo)

- Contratos de lectura tipados en `@iwana/shared` y OpenAPI congelado con spec guardián.
- **Equipos del cliente** por puerto tipado contra MOD12.
- **Tickets del cliente** por puerto tipado contra MOD10.
- Proyección geográfica para el mapa del listado.
- Migración única de índices de apoyo.

### 3.3 Fuera de scope

- Facturación, pagos y consumo reales — Billing sigue **No iniciado**; permanecen como placeholder declarado.
- Provisioning y aprovisionamiento técnico.
- Tab de **Documentos**: no existe repositorio documental por suscriptor. Un contenedor vacío no es una entrega.
- **Registro de intentos de contacto sobre suscriptores**: no hay almacén y crearlo es alcance funcional nuevo. El tab Seguimiento queda de **solo lectura**.
- Cifrado de identidad, domicilio y geolocalización — hallazgo S-3 de ADR-078 (propuesto): excede el módulo y se mantiene como deuda declarada.
- Mutación de activos o de tickets desde CRM. La ficha **lee**; nunca produce el hecho.
- Cambios al stack, al modelo multi-tenant por schema o a los boundaries de ADR-038 y ADR-048.

## 4. Personas y casos de uso

| Persona | Pregunta que trae a la ficha | Recorrido esperado tras esta fase |
| --- | --- | --- |
| **Asesor comercial** (SALES) | ¿Quién es, qué tiene contratado, cuánto paga, qué firmó? | Vista general → Servicios → Financiero → Cumplimiento. Cuatro tabs contiguos; no entra a Tickets |
| **Agente de mesa de ayuda** (SUPPORT) | ¿Está activo, tiene tickets abiertos, qué equipo tiene, dónde vive? | Responde **sin cambiar de tab** desde Vista general; el detalle está en Tickets y Servicios, adyacentes |
| **Técnico de campo** (TECHNICIAN) | ¿Dónde queda y qué serial tiene instalado? | Vista general (dirección y mapa) → Servicios (equipos). Dos tabs |
| **Administrador** (ADMIN) | Auditoría de qué cambió y quién lo cambió | Seguimiento con bitácora filtrable |

La adyacencia **Servicios → Tickets** es deliberada: "qué tiene" seguido de "qué le falla" es la secuencia mental del caso de uso más frecuente.

## 5. Requerimientos funcionales

### 5.1 Ficha 360° — arquitectura de información

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-S404-01 | La ficha presenta **7 tabs** en este orden: Vista general · Datos · Servicios · Tickets · Financiero · Cumplimiento · Seguimiento. **Supera a RF-S360-11** | MVP |
| RF-S404-02 | El contenido del tab Tributario se absorbe íntegro en **Financiero**, sin pérdida funcional. No existe tab Tributario | MVP |
| RF-S404-03 | Los equipos en comodato se presentan como **panel dentro de Servicios**, al nivel del suscriptor, debajo de los contratos. No es tab propio | MVP |
| RF-S404-04 | Ningún tab permanece como tarjeta de una sola frase sin datos | MVP |
| RF-S404-05 | El tab activo vive en la URL como parámetro de consulta con slugs estables; un valor desconocido resuelve al primero corrigiendo la URL sin entrada de historial | MVP |
| RF-S404-06 | La tira de tabs implementa el patrón APG: relación con su panel, índice de tabulación móvil y navegación con flechas, inicio y fin | MVP |
| RF-S404-07 | Los controles de escritura se condicionan al permiso de gestión; un usuario de solo lectura no ve botones de guardar, editar ni cambiar estado | MVP |

### 5.2 Georreferenciación

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-S404-10 | El mapa usa **Leaflet con teselas OpenStreetMap**, mediante un primitive compartido con carga diferida. Se retira el marco embebido | MVP |
| RF-S404-11 | El mapa se presenta en dos lugares: card **Ubicación** de Vista general (lectura) y sección Dirección de Datos (refleja el borrador en vivo) | MVP |
| RF-S404-12 | El mapa implementa cuatro estados: sin coordenadas · coordenadas inválidas · cargando · no disponible con reintento. En los dos primeros **el mapa no se monta** | MVP |
| RF-S404-13 | La dirección formateada y las coordenadas en texto permanecen visibles **fuera del lienzo** en los cuatro estados | MVP |
| RF-S404-14 | Prohibido centrar el mapa en el origen de coordenadas o en una ubicación por defecto ante ausencia de dato | MVP |
| RF-S404-15 | El marcador **no es arrastrable** en esta fase. El único camino de edición es el campo de coordenadas | MVP |
| RF-S404-16 | Latitud y longitud se serializan como **número**, no como cadena | MVP |
| RF-S404-17 | Las coordenadas se pueden **borrar**: el contrato acepta nulo explícito y distingue "no tocar" de "escribir nulo" | MVP |
| RF-S404-18 | Se valida que ambas coordenadas estén presentes o ambas ausentes; media coordenada es inválida | MVP |
| RF-S404-19 | Existe una proyección geográfica de suscriptores para el mapa del listado, con lista blanca de campos y filtro espacial obligatorio | Fase 2 |

### 5.3 Seguimiento

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-S404-20 | Existe un endpoint de bitácora del suscriptor como **proyección de lectura**, sin entidad nueva ni backfill | MVP |
| RF-S404-21 | La bitácora se presenta con filtros por familia, orden cronológico descendente fijo y paginación numerada conforme a ADR-065 | MVP |
| RF-S404-22 | Un chip de filtro cuya familia **no tiene fuente de datos no se renderiza**. Un filtro que siempre devuelve vacío es peor que su ausencia | MVP |
| RF-S404-23 | La bitácora distingue "aún no hay actividad" de "sin resultados para este filtro", con acción de limpiar filtro en el segundo | MVP |
| RF-S404-24 | El tab es de **solo lectura**: no replica las acciones de responsable, originador ni registro de contacto de la oportunidad | MVP |
| RF-S404-25 | El payload 360° deja de devolver contactos, cotizaciones, consentimientos y solicitudes codificados como vacíos | MVP |
| RF-S404-26 | Vista general presenta la **preparación para activación** con los requisitos faltantes, a partir del dato que el backend ya calcula | MVP |

### 5.4 Equipos del cliente

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-S404-30 | CRM consulta los comodatos del suscriptor **por puerto tipado**; no lee tablas de MOD12 (ADR-048) | MVP |
| RF-S404-31 | El agregado se gobierna con el permiso de lectura de suscriptores, no con el de inventario: la lectura es del cliente, no del almacén | MVP |
| RF-S404-32 | El identificador del suscriptor se resuelve **del path, en servidor**; nunca se acepta del cliente | MVP |
| RF-S404-33 | El panel muestra equipo, serial, dirección física, fecha de instalación, fecha de retiro, servicio asociado y estado | MVP |
| RF-S404-34 | El servicio asociado se presenta por número o nombre; **nunca por identificador opaco** | MVP |
| RF-S404-35 | El panel **no expone ninguna acción de mutación**: ni asignar, retirar, cerrar comodato, cambiar ubicación, dar de baja ni editar identificadores | MVP |
| RF-S404-36 | El estado vacío distingue tres casos, incluido "servicio activo sin equipos registrados", que señala una inconsistencia operativa real | MVP |
| RF-S404-37 | Si el puerto no responde, el endpoint degrada declarando la degradación; la disponibilidad de CRM no depende de MOD12 | MVP |

### 5.5 Tickets del cliente

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-S404-40 | CRM consulta los tickets del suscriptor **por puerto tipado**; sin clave foránea cruzada (ADR-038) | MVP |
| RF-S404-41 | El filtro de mesa de ayuda admite el suscriptor como **sujeto** del ticket, no solo como solicitante | MVP |
| RF-S404-42 | El adaptador exige el **tipo de solicitante** junto a la referencia: la columna es compartida entre tipos y el filtro sin tipo es ambiguo | MVP |
| RF-S404-43 | El puerto **propaga el actor**, de modo que la restricción de propiedad de mesa de ayuda se mantiene y el agregado de CRM no la elude | MVP |
| RF-S404-44 | El panel es de **solo lectura**: sin transición de estado, asignación, comentarios, adjuntos ni escalamiento | MVP |
| RF-S404-45 | El encabezado del panel **declara el eje de la consulta** que está aplicando | MVP |
| RF-S404-46 | Crear ticket para el suscriptor **navega** a mesa de ayuda con el suscriptor precargado; no renderiza un formulario en la ficha | MVP |
| RF-S404-47 | La falta de permiso se presenta como aviso informativo, **nunca** como tabla vacía: "no puedes ver" no puede confundirse con "no tiene" | MVP |
| RF-S404-48 | La creación de ticket desde el contexto del suscriptor fija solicitante **y** sujeto, para que ambas vistas coincidan | MVP |
| RF-S404-49 | Se retira la captura de la referencia del suscriptor por texto libre en el formulario de mesa de ayuda | MVP |

### 5.6 Contactos del suscriptor

Resuelve **BL-1**. La auditoría encontró que `subscriber_contacts` **nunca tuvo migración** —la entidad, el servicio y el controlador existen, el módulo está registrado y sus cuatro rutas responden error de servidor— mientras la capacidad de contacto alternativo **sí funciona** por unos campos en la propia tabla de suscriptores. Eran dos mecanismos para lo mismo, uno de ellos muerto. Decisión del CTO del 2026-09-04: **no se retira, se construye con tope.**

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-S404-60 | Se crea la tabla de contactos del suscriptor, ausente desde el origen del módulo | MVP |
| RF-S404-61 | La tabla es la **única fuente** de contactos del suscriptor. No conviven dos mecanismos para la misma capacidad | MVP |
| RF-S404-62 | **Tope de 3 contactos por suscriptor**, validado en servicio con mensaje explícito al alcanzarlo. Sustituye al único contacto alternativo de hoy y añade dos | MVP |
| RF-S404-63 | La migración hace **backfill** del contacto alternativo existente como primer registro | MVP |
| RF-S404-64 | Los campos de contacto alternativo de la tabla de suscriptores quedan **deprecados en su sitio, no eliminados**. Su retiro es fase posterior, tras confirmar que ningún consumidor los lee | MVP |
| RF-S404-65 | La respuesta **nunca devuelve texto cifrado**: descifra o no emite el campo (hallazgo H-5) | MVP |
| RF-S404-66 | Las rutas de actualización y borrado **verifican pertenencia** al suscriptor de la ruta (hallazgo H-6) | MVP |
| RF-S404-67 | Las columnas cifradas se dimensionan al formato real; el ancho actual desborda con cualquier correo de más de 31 caracteres (hallazgo H-9) | MVP |
| RF-S404-68 | Las rutas se gobiernan con los permisos de **suscriptores**, no con los de oportunidades | MVP |
| RF-S404-69 | La ficha presenta los contactos en la tab Datos, con acción de añadir que se **deshabilita al alcanzar el tope** y no se oculta sin explicación | MVP |
| RF-S404-70 | Las pruebas del módulo dejan de simular el acceso a datos al punto de pasar sobre una tabla inexistente. Al menos una prueba se ejecuta contra el esquema real | MVP |

### 5.7 Contrato y listado

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-S404-50 | Los tipos de lectura del suscriptor viven en `@iwana/shared`; el portal deja de duplicarlos a mano | MVP |
| RF-S404-51 | Existe OpenAPI versionado del módulo **con spec guardián** que compara el documento publicado contra el generado en ejecución | MVP |
| RF-S404-52 | Se **retiran** del contrato los parámetros de orden que el servidor ignora: del handler, del tipo del portal y del OpenAPI. `sortableFields` permanece vacío, que es **estado conforme** (ADR-065 §Decisión 1) | MVP |
| RF-S404-53 | El primitive de cabecera ordenable **no se retira ni se marca como muerto** (ADR-065 §Decisión 4): está construido, es correcto y es fail-closed. Espera contrato que lo habilite | MVP |
| RF-S404-54 | Cuando llegue el tramo de columnas ordenables, queda prohibido ordenar por nombre, razón social o estrato — ver §6.4 | Fase 2 |

## 6. Requerimientos no funcionales

### 6.1 Seguridad y privacidad

| ID | Requerimiento |
| --- | --- |
| RNF-S404-01 | **Ningún dato personal viaja en la cadena de consulta.** La búsqueda determinista por documento, correo o teléfono deja de exponerlos en la URL, y el registro de acceso del proxy deja de capturarlos (hallazgo H-1) |
| RNF-S404-02 | El listado de suscriptores se restringe a los **cinco roles** que autorizó ADR-067 §9 (hallazgo H-2) |
| RNF-S404-03 | Todo acceso masivo a proyección con datos personales emite registro de acceso con actor, rol, filtros y dimensiones |
| RNF-S404-04 | La bitácora **nunca** expone valores crudos de auditoría: solo campos en lista blanca. Prohibido proyectar filas de diferencia libre |
| RNF-S404-05 | El registro de diferencias de auditoría se construye **antes** de mutar la entidad; el rastro debe permitir reconstruir el estado anterior (hallazgo H-7) |
| RNF-S404-06 | La proyección geográfica se limita a lista blanca cerrada, exige filtro espacial y **conserva la cota de paginación de ADR-067 §6**. Relajar la cota exige decisión del CTO |
| RNF-S404-07 | Campos que **no cruzan** desde MOD12: ubicación y responsable actual, orden y fecha de compra, coste, proveedor, vida útil, garantía e identificadores de libro mayor. La dirección física del equipo se condiciona por rol |
| RNF-S404-08 | Campos que **no cruzan** desde MOD10: descripción, comentarios —con énfasis en los internos—, notas de transición e identidad del asignado |
| RNF-S404-09 | El portal emite su propia política de referente; no depende de que el proxy esté delante |
| RNF-S404-10 | Cero datos personales reales en documentación, ejemplos, fixtures y pruebas: ni nombres, ni documentos, ni direcciones, ni coordenadas de domicilios reales, ni seriales de producción |

### 6.2 Arquitectura y rendimiento

| ID | Requerimiento |
| --- | --- |
| RNF-S404-20 | Comunicación entre módulos **solo por interfaces tipadas**. Prohibida la llamada HTTP interna entre módulos y la unión de tablas cross-módulo |
| RNF-S404-21 | El puerto de un módulo se declara en el **consumidor** y se implementa en el **proveedor** |
| RNF-S404-22 | Prohibido el patrón de consulta por fila al resolver equipos: el enriquecimiento se hace en origen, con una consulta por página |
| RNF-S404-23 | Todo predicado nuevo de filtrado cuenta con índice de apoyo antes de publicarse |
| RNF-S404-24 | Toda migración es reversible. Esta fase no contempla relleno retroactivo ni transformación de datos |
| RNF-S404-25 | Solo el tab activo dispara su carga; volver a un tab visitado no re-dispara la carga completa del 360° |

### 6.3 Experiencia e identidad

| ID | Requerimiento |
| --- | --- |
| RNF-S404-30 | Se respetan las disposiciones vinculantes de `INFORME-MOD05-CRM-DETALLE-SUSCRIPTORES-AUDITORIA-UIUX-v1.0.md`: sin botones en el encabezado de página ni de panel, indicador de tab navy, sin identificadores opacos visibles, primitivas del portal para búsqueda, esqueletos, vacíos y alertas |
| RNF-S404-31 | Vocabulario visible: "oportunidad" y "suscriptor". Prohibido "expediente", "lead" y "pipeline" en texto renderizado |
| RNF-S404-32 | Toda fecha visible en formato local es-CO; ninguna fecha en formato técnico crudo |
| RNF-S404-33 | Valores ausentes se representan con un guion; nunca "N/A", "sin dato" ni cadena vacía |
| RNF-S404-34 | Contraste AA verificado en navegador sobre tokens reales, en tema claro y oscuro |
| RNF-S404-35 | Área táctil mínima de 44×44 px y foco visible en todo control interactivo |

### 6.4 Restricción de orden sobre datos personales

Aplica **cuando se publique el tramo de columnas ordenables**, que es entregable de programa y no de esta fase (§9.5).

Queda **prohibido** publicar orden por nombre, apellido o razón social: el orden alfabético convierte un listado paginado en un directorio extraíble por barrido secuencial, que es exactamente lo que la cota de paginación de ADR-067 existe para impedir. Queda **prohibido** publicar orden por estrato: construye un ranking socioeconómico de la base de clientes que ningún requisito pide. Los campos cifrados son inordenables por construcción.

## 7. Modelo de datos y contratos (borrador)

### 7.1 Cambios de modelo

**Ninguna entidad nueva, salvo la que faltaba desde el origen.** La tabla de contactos del suscriptor (§5.6) no se diseña aquí: su entidad, servicio, controlador y DTOs ya existen desde la Fase 01. Lo que falta es su migración, que nunca se escribió.

| Cambio | Naturaleza | Reversibilidad | Migración |
| --- | --- | --- | --- |
| Coordenadas como número | Mapeo ORM sobre columna existente | Total, sin DDL | — |
| Coordenadas anulables | Ensanchamiento del input aceptado | Aditivo, no rompe | — |
| **Tabla de contactos del suscriptor** | DDL de tabla ausente + backfill del contacto alterno | **Total**: tabla nueva sin datos previos; el origen del backfill se conserva | `126` |
| Contacto alterno en la tabla de suscriptores | **Deprecado en su sitio, no eliminado** | Total: no se toca el dato | — |
| Índice de comodatos por suscriptor | DDL de índice concurrente | Eliminación del índice | `127` |
| Índice geográfico parcial | DDL de índice concurrente | Eliminación del índice | `127` |

**Patrón de expansión y contracción para los contactos.** La migración `126` crea la tabla y copia el contacto alterno existente; la aplicación pasa a leer y escribir **solo** la tabla; las columnas viejas quedan en su sitio, deprecadas. Su eliminación es una fase posterior, cuando se confirme que ningún consumidor las lee. Así el paso es reversible en todo momento y no hay ventana en la que el dato viva en un solo lugar aún no probado.

La bitácora, en cambio, se resuelve por **proyección de lectura sobre eventos ya persistidos**. Crear una entidad de timeline habría exigido migración, relleno retroactivo desde auditoría, doble escritura y pruebas de consistencia entre dos fuentes — para reproducir un dato que ya está en disco.

> **Nota de numeración.** `124` y `125` están tomadas por MOD12 (impuestos y envío de cotización de compra). Esta fase usa `126` y `127`.

### 7.2 Superficie de API

| Endpoint | Naturaleza | Ola |
| --- | --- | --- |
| Bitácora del suscriptor | Nuevo — proyección de lectura | A |
| Vista 360° del suscriptor | Modificado — deja de emitir colecciones vacías | A |
| Búsqueda determinista de suscriptores | Modificado — deja de aceptar datos personales en la URL | A |
| Listado de suscriptores | Modificado — restricción de roles y contrato de orden | A |
| Guardado de la sección de ubicación | Modificado — acepta borrado de coordenadas | A |
| Equipos del suscriptor | Nuevo — agregado sobre puerto MOD12 | B |
| Tickets del suscriptor | Nuevo — agregado sobre puerto MOD10 | B |
| Proyección geográfica de suscriptores | Nuevo | B |
| Listado de comodatos de inventario | Modificado — enriquecimiento opcional, respuesta por defecto intacta | B |
| Listado de tickets de mesa de ayuda | Modificado — admite sujeto y tipo de solicitante | B |

Los contratos exactos, congelados con ruta y versión, viven en `docs/prompts/PROMPT-MOD05-SUBSCRIBERS-FASE-04-v1.0.md`.

### 7.3 Puertos nuevos

Dos puertos de **lectura**, declarados en CRM e implementados en el módulo proveedor: equipos del suscriptor (MOD12) y tickets del suscriptor (MOD10). Sustituyen la lectura a los adaptadores stub vigentes, que quedan retirados o reducidos a su función de escritura.

## 8. Criterios de aceptación

Los criterios de experiencia son los **48 criterios `CA-UX-S360-01` a `CA-UX-S360-48`** de la spec congelada [docs/specs/2026-09-04-mod05-subscriber-360-ux-spec.md](../specs/2026-09-04-mod05-subscriber-360-ux-spec.md) (AI-PROD-UX, v1.0, Aprobado), incorporados aquí por referencia. A ellos se suman los criterios de módulo:

| ID | Criterio |
| --- | --- |
| CA-S404-01 | El mapa renderiza con teselas y la consola no reporta **ninguna** violación de política de contenido |
| CA-S404-02 | Borrar las coordenadas, guardar y recargar deja los campos vacíos y el mapa sin montar |
| CA-S404-03 | Introducir coordenadas fuera de rango produce mensaje en el campo y no monta el mapa |
| CA-S404-04 | La bitácora lista eventos reales; los filtros operan y la paginación vuelve a la primera página al cambiar de filtro |
| CA-S404-05 | Una página fuera de rango sirve la última página válida corrigiendo la URL; nunca produce error ni lista vacía con paginación pintada |
| CA-S404-06 | El payload 360° devuelve contactos, consentimientos y solicitudes reales cuando existen |
| CA-S404-06a | Las cuatro rutas de contactos responden correctamente contra la tabla real; el contacto alterno preexistente aparece como primer registro tras la migración |
| CA-S404-06b | Al alcanzar el tercer contacto, la acción de añadir queda **deshabilitada con explicación visible**, y el servidor rechaza un cuarto con mensaje explícito |
| CA-S404-06c | Ninguna respuesta de contactos contiene texto cifrado |
| CA-S404-06d | Actualizar o borrar un contacto pasando el identificador de **otro** suscriptor en la ruta responde denegación, no éxito |
| CA-S404-07 | Un usuario **comercial** ve equipos y tickets del suscriptor sin recibir denegación de acceso |
| CA-S404-08 | Ninguna acción de mutación de activos o de tickets es alcanzable desde la ficha |
| CA-S404-09 | Un usuario **de solo lectura** no ve ningún control de escritura en ningún tab |
| CA-S404-10 | El listado de suscriptores responde denegación a los dos roles retirados por RNF-S404-02 |
| CA-S404-11 | Ninguna petición registrada contiene datos personales en la URL |
| CA-S404-12 | La bitácora no expone ningún valor fuera de la lista blanca, verificado sobre un registro con diferencia libre |
| CA-S404-13 | El enlace profundo a un tab restaura tab, filtros y página; el botón atrás devuelve al tab anterior sin recargar |
| CA-S404-14 | Toda la tira de tabs es operable solo con teclado |
| CA-S404-15 | El documento OpenAPI publicado coincide con el generado en ejecución, verificado por el spec guardián |
| CA-S404-16 | La migración de índices aplica y revierte limpiamente sobre un schema de tenant |
| CA-S404-17 | El módulo alcanza cobertura ≥80% en los servicios tocados, con **conteo real de pruebas ejecutadas** |

## 9. Dependencias, riesgos y decisiones

### 9.1 Dependencias

- **MOD12 cerrado** — provee comodatos por suscriptor. Requiere enriquecimiento opcional del listado de préstamos.
- **MOD10 construido** — provee tickets. Requiere ampliación de su filtro de consulta.
- **AI-SEC-ENG** — veredicto emitido el 2026-09-04 sobre mapa, bitácora, proyección geográfica y exposición de la dirección física del equipo.
- **AI-PLAT-OPS** — desactivación del registro de acceso sobre la ruta de API en el proxy.

### 9.2 Riesgos

| Riesgo | Severidad | Mitigación |
| --- | --- | --- |
| El agregado de tickets elude la restricción de propiedad de mesa de ayuda | **Alta** | RF-S404-43: el puerto propaga el actor. Es la verificación más importante de la Ola B |
| La bitácora expone a roles comerciales datos que el endpoint de auditoría les niega | **Alta** | RNF-S404-04, lista blanca cerrada. Precedente ya vivo en la bitácora de oportunidades |
| La proyección geográfica tienta a relajar la cota de paginación | **Alta** | RNF-S404-06. Si se requiere densidad completa, la salida es un endpoint **agregado** sin fila por suscriptor |
| El agregado se convierte en enumerador entre suscriptores | **Alta** | RF-S404-32: identificador resuelto en servidor desde el path |
| La serialización numérica altera comparaciones de verdad en oportunidades | Media | No se toca oportunidades en esta fase. Tarea separada, corrigiendo antes la comparación |
| El módulo de contactos apunta a una tabla sin migración | Media | Decisión previa obligatoria: crearla con los defectos corregidos, o retirar el módulo |
| Sobrestimar el relleno del 360° como trabajo de modelo | Baja | Es cableado: los servicios ya existen e indexan por suscriptor |

### 9.3 Artefactos superados por este documento

Conforme al checklist §10 del perfil AI-EM-ARCH, ningún artefacto contradictorio queda vigente:

| Artefacto | Disposición |
| --- | --- |
| `PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md` (`Propuesto`) | **Superado.** Su contenido normativo vigente se consolida aquí y en Fase 03 |
| `PRD-MOD05-CRM-SUBSCRIBERS-FASE-02-v1.0.md` (`Propuesto`) | **Superado.** Su definición de listado y detalle queda absorbida por Fase 03 y por este documento |
| `PRD-...-FASE-03` **RF-S360-11** (6 tabs) | **Superado** por RF-S404-01 |
| `PRD-...-FASE-03` **RF-S360-14** (equipos como stub) | **Superado** por RF-S404-03 y §5.4 |
| `PRD-...-FASE-03` **§3.2** (tickets y dispositivos fuera de scope) | **Superado** por §5.4 y §5.5 |
| `PRD-...-FASE-03` **CA-S360-08** (placeholders explícitos) | **Reformulado**: la exigencia de honestidad se conserva en RF-S404-22 y RF-S404-36; deja de aplicarse a equipos y tickets, que ahora llevan datos reales |

El resto del PRD Fase 03 **permanece vigente**.

### 9.4 Decisiones del CTO — 2026-09-04

| # | Decisión |
| --- | --- |
| **D1** | Emitir este PRD Fase 04, levantando la exclusión y resolviendo los dos PRDs en `Propuesto` |
| **D2** | Adoptar la arquitectura de información de AI-PROD-UX: 7 tabs, equipos dentro de Servicios, Tributario absorbido en Financiero |
| **D3** | Estrechar el listado a los cinco roles de ADR-067 §9, **sin** enmienda del ADR |
| **D4** | Ejecutar en dos olas: A visible sin migración, B integración cross-módulo |

### 9.5 Orden por columna — no es deuda de este módulo

Cierre de **BL-2**. La auditoría lo encuadró primero como "deuda de ADR-065 a cerrar, midiendo o retirando". **Ese encuadre era incorrecto y se corrige aquí.**

ADR-065 §Decisión 1 es literal: *"`sortableFields: []` es un estado conforme, no deuda. Un recurso puede permanecer así indefinidamente sin incumplir esta decisión."* Y §Decisión 3 fija la corrección exacta: *"Anunciar un parámetro que el servidor ignora y devolver siempre `meta.sort: null` es un contrato falso: se corrige **retirando el anuncio, no poblando la lista**."*

Por tanto esta fase **retira el anuncio** y nada más. Tres razones cierran también la puerta a medir aquí:

1. **No es un problema de MOD05.** Los cuatro recursos que declaran la constante la tienen vacía: tickets de mesa de ayuda, tareas operativas, partes y suscriptores. ADR-065 §Decisión 5 asigna la medición a **AI-PLAT-OPS** y el tramo de hasta 3 columnas se autoriza recurso por recurso. Resolverlo dentro de un módulo sería resolver un problema de programa en el sitio equivocado.
2. **No hay dataset con el que medir.** `packages/database/src/seeds/` contiene un único archivo, ajeno a suscriptores. Sin volumen realista no hay p95 creíble, y ADR-065 §Decisión 2 prohíbe publicar sin medir.
3. **El frontend ya está listo.** `canSort` deriva de `sortableFields.length > 0`, así que cuando llegue el tramo **no hará falta tocar el portal**.

**Dependencia de programa registrada:** medición de p95 de página profunda ordenada por AI-PLAT-OPS, que habilitará el primer tramo en los cuatro recursos. **No bloquea el cierre de MOD05.**

### 9.6 Corrección normativa pendiente

`HLD-MOD05-ARQUITECTURA-v2.0.md:42` afirma que el suscriptor se crea al alcanzar cliente activo, lo que **contradice a ADR-027 (Aprobado)** y a la implementación real. El HLD era entregable obligatorio de la Fase 03 y no se actualizó. Se corrige dentro de esta fase.

## 10. Definición de terminado (DoD)

**Ola A**

- [ ] Mapa Leaflet operativo con sus cuatro estados; marco embebido retirado; cero violaciones de política de contenido
- [ ] Coordenadas numéricas, anulables y validadas por pares
- [ ] Tabla de contactos creada con backfill, tope de 3 aplicado, y H-5, H-6 y H-9 corregidos en el mismo acto
- [ ] Payload 360° sin colecciones codificadas como vacías
- [ ] Tab Seguimiento con bitácora real, filtros con fuente y cinco estados
- [ ] Hallazgos H-1, H-2 y H-7 cerrados
- [ ] Parámetros de orden retirados del handler, del tipo del portal y del OpenAPI; `sortableFields` permanece vacío como estado conforme
- [ ] Enlace profundo por tab y patrón APG completo
- [ ] Gating de escritura por permiso de gestión
- [ ] `INFORME-MOD05-SUBSCRIBERS-FASE-04-OLA-A-v1.0.md` con conteo real de pruebas

**Ola B**

- [ ] Contratos de lectura en `@iwana/shared`; portal sin tipos duplicados
- [ ] OpenAPI del módulo congelado con spec guardián verde
- [ ] Equipos y tickets por puerto tipado, con actor propagado y campos excluidos verificados
- [ ] Proyección geográfica con lista blanca, filtro espacial y registro de acceso
- [ ] Migración de índices aplicada y revertida en prueba
- [ ] `INFORME-MOD05-SUBSCRIBERS-FASE-04-OLA-B-v1.0.md`

**Cierre de módulo**

- [ ] `CHECKLIST-MOD05-SUBSCRIBERS-FASE-02-v1.0.md` ejecutado — hoy 0 de 50 ítems
- [ ] Checklist de salida de esta fase en `docs/quality/`
- [ ] Los cuatro criterios abiertos de ADR-067 cerrados, en particular el registro de acceso masivo
- [ ] `pnpm audit:adr-citations` en `BLOQUEANTE: 0`
- [ ] `INFORME-MOD05-CIERRE-MODULO-v1.0.md` con **G6 y G6.5 registrados por separado**; G7 diferido por ADR-070
- [ ] Deuda residual declarada por severidad, con el hallazgo S-3 de ADR-078 (propuesto) explícitamente registrado
