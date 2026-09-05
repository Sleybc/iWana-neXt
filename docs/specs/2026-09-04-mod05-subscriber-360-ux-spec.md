# Spec UX — Ficha 360° del suscriptor (MOD05 Fase 04)

**Versión:** 1.0
**Estado:** Aprobado — **congelada** el 2026-09-04
**Autor:** AI-PROD-UX · **Solicitante:** AI-EM-ARCH
**Superficie:** `/dashboard/crm/subscribers/[id]`
**PRD:** [PRD-MOD05-CRM-SUBSCRIBERS-FASE-04-v1.0.md](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-04-v1.0.md) §5, §8
**Prompt:** [PROMPT-MOD05-SUBSCRIBERS-FASE-04-v1.0.md](../prompts/PROMPT-MOD05-SUBSCRIBERS-FASE-04-v1.0.md)
**Plan:** [2026-09-04-mod05-subscribers-fase-04-orquestacion.md](../plans/2026-09-04-mod05-subscribers-fase-04-orquestacion.md) bloque A-FE1
**Vinculante:** [INFORME-MOD05-CRM-DETALLE-SUSCRIPTORES-AUDITORIA-UIUX-v1.0.md](../informes/INFORME-MOD05-CRM-DETALLE-SUSCRIPTORES-AUDITORIA-UIUX-v1.0.md) · [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md)

> **Congelación (perfil AI-EM-ARCH §3.5).** Esta spec está congelada: AI-FE-PLATFORM ejecuta contra ella sin gate mientras no cambie alcance, boundary ni tokens de marca. Cualquier cambio se versiona a v1.1 y se notifica vía AI-EM-ARCH; **no se parchea en silencio**.

---

## 1. Arquitectura de información

**Siete tabs, en este orden:**

```
Vista general · Datos · Servicios · Tickets · Financiero · Cumplimiento · Seguimiento
```

Lo que **no** es tab, y dónde vive:

| Candidato | Destino | Razón |
| --- | --- | --- |
| **Mapa** | Card de lectura en Vista general + mapa en Dirección (tab Datos) | Un mapa no es una tarea; es el soporte visual de un dato que ya vive en Dirección |
| **Equipos** | Panel dentro de **Servicios**, debajo de contratos | El equipo existe como consecuencia del servicio. La pregunta nunca es "lista los aparatos", es "qué tiene puesto" |
| **Tributario** | Se funde en **Financiero** | Perfil tributario, datos fiscales y facturación responden lo mismo: cuánto y cómo se le cobra. Convierte Financiero en tab con contenido real desde el primer día |
| **Documentos** | **No se crea** | No existe repositorio documental por suscriptor. Sería un contenedor vacío con nombre bonito |

**Por qué Equipos va al nivel del suscriptor y no anidado por contrato:** el vínculo del comodato con el contrato es **opcional**, mientras que el vínculo con el suscriptor es obligatorio. Anidarlo por contrato orfanaría todo comodato sin contrato.

**Por qué Tickets va justo después de Servicios:** "qué tiene" seguido de "qué le falla" es la secuencia mental del caso de uso más frecuente (mesa de ayuda). Al final de la tira quedaría escondido detrás de dos tabs que soporte no usa.

**Por qué siete y no once:** bajo pantalla estrecha la tira ya hace desplazamiento horizontal. A once pestañas, la última deja de existir para el operador.

## 2. Vista general — siete cards

| # | Card | Contenido | Fuente |
| --- | --- | --- | --- |
| 1 | Identidad del suscriptor | Estado, tipo de persona, segmento | Ya existe |
| 2 | **Ubicación** | Dirección formateada + mapa de solo lectura | Nueva — §4 |
| 3 | **Preparación para activación** | Título, mensaje y **lista de requisitos faltantes** | Nueva — dato ya calculado por el backend |
| 4 | Servicio activo | Plan y estado del contrato vigente; "Sin servicio activo" si no hay | Nueva — dato ya presente |
| 5 | Oportunidad de origen | Estado + enlace, **sin identificador opaco** | Ya existe |
| 6 | Facturación | Bloque editable actual | Ya existe |
| 7 | Atajos operativos | Chips con conteo: "Tickets abiertos · N", "Equipos instalados · N" | Ola B |

**Card 3 es la de mayor valor y la más barata:** el backend ya la calcula y el portal ni la declara. Hoy el operador descubre lo que falta probando.

**Regla del card 7:** sin conteo disponible, el chip **se omite**. Nunca se pinta "0" cuando el dato no cargó.

Fuera de la vista general por revelación progresiva: cotizaciones, historial de consentimientos, kardex del equipo, bitácora completa.

## 3. Tab Seguimiento

### 3.1 Alcance: solo lectura

No se replican las tres acciones rápidas de la ficha de oportunidad. Responsable y originador son conceptos de la oportunidad, y "registrar contacto" **no tiene almacén** para suscriptores: construir el botón obligaría a inventar una tabla, que es alcance funcional.

### 3.2 Layout

Dos columnas. Izquierda: bitácora. Derecha: tres cards de contexto — estado del suscriptor con "Desde {fecha}", oportunidad de origen (**sin código ni identificador opaco**), y contacto principal.

**La card de contacto principal no se renderiza si el dato no llega.** No se pinta un marcador de posición.

### 3.3 Familias de evento y etiquetas visibles

Vocabulario: **"oportunidad"** y **"suscriptor"**. Prohibido "expediente", "lead", "pipeline", "sujeto" y "payload" en texto visible.

| Familia | Chip | Etiqueta del evento | Contenido | Disponible en |
| --- | --- | --- | --- | --- |
| — | **Todos** | — | — | Ola A |
| Estado | **Estados** | Cambio de estado | Estado nuevo + estado anterior + motivo + "por {actor}" | Ola A |
| Sistema | **Auditoría** | Suscriptor creado desde la oportunidad · Suscriptor activado · Actualización de sección | Nombre legible de la sección | Ola A |
| Servicio | **Servicios** | Servicio activado/suspendido/terminado · Equipo instalado/retirado | Plan o equipo + serial abreviado. **Sin dirección física en la bitácora** | Ola B |
| Cumplimiento | **Cumplimiento** | Consentimiento otorgado/revocado · Solicitud de datos personales | Canal, versión de política, fecha | Ola B |
| Contacto | **Contactos** | Intento de contacto | Canal, resultado, notas | **No disponible** — sin almacén |

**Regla de honestidad (RF-S404-22):** un chip cuya familia no tiene fuente **no se pinta**. Un chip que siempre devuelve vacío enseña al operador que el sistema no sabe. **Ola A arranca con tres chips: Todos · Estados · Auditoría.**

### 3.4 Orden, paginación y filtros

- **Orden:** cronológico descendente, **fijo**. Sin control de orden por columna — ADR-065 §19: en un feed cronológico el orden natural ya es el útil.
- **Paginación:** pie con paginador del portal. Tamaños `[5, 10, 20, 50]`, **por defecto 5**, tope de 500 eventos.
- La navegación **no se renderiza** si solo hay una página (ADR-065 §5).
- **Reset:** cambiar filtro o tamaño vuelve a la primera página, actualizando la URL **sin entrada de historial** (ADR-065 §9).
- **Página fuera de rango:** se sirve la última válida y se corrige la URL. **Nunca error ni lista vacía** (ADR-065 §14).
- **La barra de filtros permanece montada aunque el total sea 0.** Si se desmonta con filtro vacío, el operador queda atrapado sin forma de salir del filtro.

### 3.5 Los cinco estados — copy congelado

| Estado | Presentación | Copy |
| --- | --- | --- |
| **Carga inicial** | 2 esqueletos + texto en región de estado anunciada | "Cargando la bitácora…" |
| **Carga de página** | **La lista NO se vacía.** Contenedor marcado como ocupado + anuncio solo para lectores de pantalla | "Actualizando la bitácora…" |
| **Error** | Alerta de error + botón secundario | "No fue posible cargar la bitácora" / "Intenta de nuevo para consultar la actividad de este suscriptor." / **Reintentar** |
| **Vacío primera vez** | Estado vacío, sin acción | "Aún no hay actividad" / "Cuando se registre una actividad, aparecerá aquí." |
| **Vacío por filtro** | Estado vacío + acción | "Sin resultados para este filtro" / "Prueba con otro filtro para revisar la actividad disponible." / **Limpiar filtro** |

Distinguir los dos vacíos es **obligatorio**.

### 3.6 Fechas

Formato local es-CO, fecha y hora cortas. **Ninguna fecha en formato técnico crudo** en toda la ficha.

## 4. Mapa

### 4.1 Dónde vive

| Sitio | Modo | Alto | Por qué |
| --- | --- | --- | --- |
| Vista general → card Ubicación | Solo lectura | ~200 px | "¿Dónde vive?" es pregunta de lectura y alta frecuencia. Obligar a ir a Datos es un paso de más |
| Datos → sección Dirección | Refleja el borrador en vivo | ~224 px | Es donde el dato se corrige; el mapa es el acuse de que quedó bien |

**Un solo componente** para ambos (contrato C-1 del prompt, spec de AI-DS-OWNER). El marco embebido se retira.

### 4.2 Los cuatro estados

| Estado | Condición | Presentación | Copy |
| --- | --- | --- | --- |
| **Sin coordenadas** | Latitud o longitud vacías | **El mapa no se monta.** Bloque de texto | Vista general: "Sin ubicación registrada" / "Este suscriptor no tiene coordenadas. Agrégalas en Datos → Dirección." · Datos: "Ingresa latitud y longitud para ver la ubicación en el mapa." |
| **Coordenadas inválidas** | No interpretable, o fuera de rango | **El mapa no se monta.** En Datos, el mensaje va **en el campo**, no sobre el lienzo | Campo: "Usa grados decimales separados por coma. Ej.: 4.581430, -74.447581" · Vista general: "La ubicación registrada no es válida. Corrígela en Datos → Dirección." |
| **Cargando** | Teselas en vuelo | Esqueleto sobre el lienzo, región marcada como ocupada | "Cargando el mapa…" |
| **No disponible** | Fallo de teselas, de carga o sin red | Alerta de error sobre el lienzo + botón | "No pudimos cargar el mapa" / "Intenta nuevamente para consultar la ubicación." / **Reintentar** |

**Regla que gobierna los cuatro:** la dirección formateada y las coordenadas en texto **viven fuera del lienzo y siempre son visibles**. Un mapa caído no puede dejar al operador sin el dato. El mapa es realce, no portador.

**Prohibido** centrar en el origen de coordenadas o en una capital por defecto cuando faltan coordenadas: un mapa apuntando al Golfo de Guinea es peor que ningún mapa, porque parece un dato.

Atribución de OpenStreetMap visible y enlazada en ambos sitios.

### 4.3 Marcador no arrastrable

**Solo lectura en los dos sitios.** El punto se fija por el campo de coordenadas.

1. **WCAG 2.2 SC 2.5.7** exige alternativa de un solo puntero para toda operación de arrastre, y SC 2.1.1 exige teclado. El paquete completo (interacción, foco, anuncio del cambio, deshacer) es mayor que la fase.
2. La ficha de oportunidad, de donde nacen estas coordenadas, usa marcador no arrastrable. Permitir arrastre solo aquí crearía dos verdades sobre el mismo punto.
3. El camino accesible ya existe y funciona: el campo con validación de rango.

Cuando se apruebe la fijación por mapa, el patrón correcto es **clic para colocar** (no arrastre) + campos sincronizados + anuncio de las nuevas coordenadas + deshacer, con sus propios criterios.

## 5. Contactos del suscriptor (tab Datos)

Sección dentro de la tab Datos. **Hasta 3 contactos.**

- Cada contacto: nombre completo, correo, teléfono, rol y marca de principal.
- Acción **Añadir contacto** que **se deshabilita con explicación visible** al llegar al tope: "Máximo 3 contactos por suscriptor". **Nunca desaparece sin decir por qué** — un control que se esfuma se lee como un fallo.
- El contacto migrado desde el contacto alterno anterior aparece como **primer registro**, sin marca especial ni tratamiento distinto.
- Eliminar un contacto pide confirmación e indica a quién elimina por nombre.
- Estado vacío: "Sin contactos registrados" / "Agrega un contacto para saber con quién hablar sobre este suscriptor."

## 6. Equipos del cliente (panel en Servicios) — Ola B

Título: **"Equipos en comodato"**. La palabra "comodato" aparece **una sola vez** en toda la superficie: aquí. En las filas, el estado se etiqueta **Instalado / Retirado**, que es como piensa el operador ("¿lo tiene o se lo quitamos?").

### 6.1 Columnas

| # | Encabezado | Contenido |
| --- | --- | --- |
| 1 | **Equipo** | Nombre del producto; categoría como subetiqueta. Absorbe "modelo" y "tipo": el catálogo ya los codifica |
| 2 | **Serial** | Monoespaciado + acción copiar |
| 3 | **Dirección física** | Monoespaciado + acción copiar. Visible solo para los roles autorizados |
| 4 | **Instalado** | Fecha es-CO |
| 5 | **Retirado** | Fecha o guion. El guion significa "sigue instalado", y el estado lo confirma |
| 6 | **Servicio asociado** | Número o nombre del contrato; sin contrato → "Sin servicio asociado". **Nunca el identificador opaco** |
| 7 | **Estado** | Instalado / Retirado |

Valores ausentes: **guion**. Nunca "N/A", "sin dato" ni cadena vacía.

Bajo pantalla estrecha colapsa a filas-tarjeta con Equipo + Serial + Estado.

### 6.2 Filtros

Tres chips: **Instalados** (por defecto) · Retirados · Todos. Por defecto "Instalados" porque la pregunta operativa es "qué tiene puesto hoy"; el histórico está a un clic.

### 6.3 Acciones prohibidas

El panel es **lectura pura**. No debe existir: asignar, retirar, cerrar comodato, cambiar ubicación o responsable, dar de baja, marcar dañado, editar serial o dirección física, crear comodato.

Toda mutación ocurre en Inventario o se deriva de una orden de ejecución. **Duplicar aquí una sola de esas acciones abre dos caminos para el mismo hecho y garantiza divergencia.**

Permitidas: "Ver equipo en Inventario" (navegación) y copiar serial o dirección física.

### 6.4 Estados vacíos — tres, no uno

| Situación | Título | Descripción | Acción |
| --- | --- | --- | --- |
| Sin equipos y **sin servicio activo** | "Sin equipos instalados" | "Cuando se instale un equipo en una visita técnica, aparecerá aquí." | Ninguna. No hay nada que el operador pueda hacer desde aquí, y un botón falso es peor que ninguno |
| Sin equipos y **con servicio activo** | "Servicio activo sin equipos registrados" | "Este suscriptor tiene un servicio activo y no registra equipos instalados. Revisa la orden de ejecución de la instalación." | Enlace a la orden cuando exista |
| Filtro sin resultados | "Sin equipos retirados" | "Este suscriptor no tiene equipos retirados." | "Ver todos" |

La segunda variante es la que hace honesto el vacío: **señala una inconsistencia operativa real en lugar de fingir normalidad.**

## 7. Tab Tickets — Ola B

Encabezado del panel: **"Mesa de ayuda"** — nombra el módulo que el operador ya conoce y hace explícita la frontera.

### 7.1 Columnas

Número (identificador que se dicta por teléfono, enlazado) · Asunto (una línea, truncado) · Estado (con prioridad adyacente) · SLA (**derivado del servidor; el frontend no lo calcula**) · Creado · Asignado a.

El tipo queda fuera de la grilla y solo actúa como filtro: el asunto casi siempre lo revela.

### 7.2 Filtros

Solo tres chips: **Abiertos** (por defecto) · Cerrados · Todos. Deliberadamente mínimo: aquí el universo son los tickets de una persona, no una bandeja de cientos. Replicar la barra de mesa de ayuda sería mantener dos barras en sincronía.

### 7.3 Frontera con mesa de ayuda

**Solo lectura.** Sin transiciones, asignación, comentarios, adjuntos ni escalamiento. Tres puentes, y solo tres:

1. **Fila → ficha del ticket**, navegación de página completa. No un panel lateral con acciones: eso invitaría a operar desde aquí.
2. **"Crear ticket para este suscriptor"** → navega a mesa de ayuda con el suscriptor precargado. No clona el formulario.
3. **Pie: "Ver todos en Mesa de ayuda"**, con el filtro ya aplicado.

### 7.4 El encabezado declara el eje

El panel debe decir qué está mostrando: tickets **sobre** el suscriptor, o **reportados por** él, según el contrato disponible. **Mentir por omisión sobre el criterio de un listado es peor que la limitación.**

### 7.5 Falta de permiso

Alerta informativa: "No tienes acceso a la mesa de ayuda" / "Pide acceso al administrador de la empresa para ver los tickets de este suscriptor."

**Nunca una tabla vacía por falta de permiso**: se lee como "no tiene tickets".

## 8. Enlace profundo por tab

**Parámetro de consulta `?tab=`**, no subruta. Precedente vivo en el portal, coherencia con ADR-065 §9 (el resto del estado de tabla ya vive en la consulta), y los siete tabs no son siete documentos: comparten encabezado y la misma llamada al 360°.

**Slugs estables** (minúscula, sin acentos, **no se traducen ni se renombran**):

```
general · datos · servicios · tickets · financiero · cumplimiento · seguimiento
```

| Situación | Comportamiento |
| --- | --- |
| Ausente o desconocido | Resuelve a `general` y **corrige la URL sin entrada de historial**. Nunca error |
| Cambio de tab | **Con entrada de historial.** El botón atrás devuelve al tab anterior |
| Filtro, orden o página dentro de un tab | **Sin entrada de historial** + vuelta a la primera página |
| Salida de un tab | **Se limpian sus parámetros** de sub-estado. No quedan parámetros huérfanos |
| Recarga o enlace compartido | Restaura tab, filtros y página exactos |

**Carga perezosa:** solo el tab activo dispara su petición. Volver a un tab ya visitado **no** re-dispara la carga completa del 360°.

**Foco:** al cambiar de tab el foco permanece en la pestaña pulsada. El panel no roba el foco.

## 9. Accesibilidad de la tira de tabs

Al contenedor actual le faltan **tres** piezas que el de oportunidades sí tiene: navegación con flechas, índice de tabulación móvil y relación con el panel. Con siete tabs, la ausencia de flechas obliga a siete tabulaciones para llegar a la última. **Se cierra en esta fase**, en el componente que la fase ya toca.

## 10. Criterios de aceptación

### Arquitectura de información

1. **CA-UX-S360-01** — La ficha presenta exactamente 7 tabs en el orden especificado. No existe tab Tributario, Mapa, Equipos ni Documentos.
2. **CA-UX-S360-02** — Ningún tab permanece como tarjeta de una sola frase. Todo tab presenta datos reales o un estado vacío/de error conforme a esta spec.
3. **CA-UX-S360-03** — El contenido del antiguo tab Tributario aparece íntegro dentro de Financiero, sin pérdida de funcionalidad.
4. **CA-UX-S360-04** — Vista general muestra entre 5 y 7 cards; ninguna contiene una tabla paginada ni una barra de filtros.
5. **CA-UX-S360-05** — Vista general muestra la preparación para activación con su estado y la lista de requisitos faltantes.
6. **CA-UX-S360-06** — Ningún identificador opaco de oportunidad, contrato, ticket o activo es visible en texto, en ningún tab, en ningún estado.
7. **CA-UX-S360-07** — No hay botones en el encabezado de página ni en el encabezado de panel en ninguna superficie de la ficha.
8. **CA-UX-S360-08** — El indicador de tab activo es navy con subrayado. No hay lima como indicador de pestaña activa.

### Seguimiento

9. **CA-UX-S360-09** — Bitácora paginada con filtros por familia, orden cronológico descendente fijo y sin control de orden por columna.
10. **CA-UX-S360-10** — Los cinco estados están implementados y son distinguibles, con el copy de §3.5.
11. **CA-UX-S360-11** — Cambiar filtro o tamaño de página vuelve a la primera página y actualiza la URL sin entrada de historial.
12. **CA-UX-S360-12** — Una página fuera de rango sirve la última válida y corrige la URL; nunca produce error ni bitácora vacía con paginación pintada.
13. **CA-UX-S360-13** — La barra de filtros permanece montada cuando el total es 0, de modo que siempre es posible salir del filtro activo.
14. **CA-UX-S360-14** — Ningún chip de filtro se renderiza si su familia no tiene fuente de datos en la ola en curso.
15. **CA-UX-S360-15** — Una búsqueda de texto sobre la superficie renderizada no encuentra "expediente", "lead", "pipeline" ni "originador".
16. **CA-UX-S360-16** — Todas las fechas usan formato local es-CO corto; no hay fechas en formato técnico crudo.

### Mapa

17. **CA-UX-S360-17** — Existe un único componente de mapa, usado en Vista general (lectura) y en Datos → Dirección. No queda ningún marco embebido a un tercero.
18. **CA-UX-S360-18** — Sin coordenadas, el mapa **no se monta** y se muestra el mensaje correspondiente al sitio.
19. **CA-UX-S360-19** — Con coordenadas inválidas o fuera de rango el mapa **no se monta**; en Datos el mensaje aparece en el campo. En ningún caso se renderiza un mapa centrado en una ubicación por defecto.
20. **CA-UX-S360-20** — Ante fallo de teselas o de carga se muestra alerta de error con botón de reintento **funcional**, y el reintento vuelve a montar el mapa.
21. **CA-UX-S360-21** — La dirección formateada y las coordenadas en texto permanecen visibles fuera del lienzo en los cuatro estados.
22. **CA-UX-S360-22** — El marcador **no es arrastrable** en ninguno de los dos sitios.
23. **CA-UX-S360-23** — La región del mapa tiene rol de región, nombre accesible en español y marca de ocupado durante la carga. La atribución de OpenStreetMap es visible y enlazada.

### Equipos

24. **CA-UX-S360-24** — El panel aparece dentro de Servicios, con "comodato" exactamente una vez en toda la superficie.
25. **CA-UX-S360-25** — La tabla muestra las siete columnas. Serial y dirección física son copiables. Los ausentes se muestran con guion, nunca "N/A" ni cadena vacía.
26. **CA-UX-S360-26** — El panel **no expone ninguna acción de mutación**: los únicos controles son navegación y copia.
27. **CA-UX-S360-27** — Los tres estados vacíos son distinguibles, y "servicio activo sin equipos registrados" muestra su copy propio.
28. **CA-UX-S360-28** — El filtro por defecto es "Instalados"; cambiar de chip actualiza la URL sin entrada de historial y vuelve a la primera página.
29. **CA-UX-S360-29** — Con un solo resultado o ninguno, la navegación del pie no se renderiza.

### Tickets

30. **CA-UX-S360-30** — El panel es de solo lectura: sin transición de estado, asignación, comentarios, adjuntos ni escalamiento.
31. **CA-UX-S360-31** — El encabezado declara explícitamente el eje de la consulta aplicada.
32. **CA-UX-S360-32** — Cada fila enlaza a la ficha del ticket con navegación de página completa; el retorno devuelve a la ficha con `?tab=tickets` y los filtros intactos.
33. **CA-UX-S360-33** — "Crear ticket para este suscriptor" navega a mesa de ayuda con el suscriptor precargado; **no** renderiza un formulario dentro de la ficha.
34. **CA-UX-S360-34** — El SLA se muestra a partir del valor del servidor; el frontend no lo calcula ni lo deriva.
35. **CA-UX-S360-35** — La falta de permiso muestra alerta informativa, distinguible del estado vacío. Una tabla vacía nunca representa falta de acceso.

### Enlace profundo y accesibilidad

36. **CA-UX-S360-36** — El tab activo vive en `?tab=` con los siete slugs. Un valor ausente o desconocido resuelve a `general` corrigiendo la URL sin entrada de historial.
37. **CA-UX-S360-37** — Cambiar de tab añade entrada de historial; el botón atrás devuelve al tab anterior sin recargar la ficha.
38. **CA-UX-S360-38** — Recargar o abrir un enlace compartido restaura tab, filtros y página exactos.
39. **CA-UX-S360-39** — Al cambiar de tab se limpian los parámetros del tab saliente; no quedan parámetros huérfanos en la URL.
40. **CA-UX-S360-40** — Solo el tab activo dispara su carga. Volver a un tab ya visitado no re-dispara la carga completa del 360°.
41. **CA-UX-S360-41** — La tira de tabs implementa el patrón APG completo: roles, estado seleccionado, relación con el panel, índice de tabulación móvil y navegación con flechas, inicio y fin.
42. **CA-UX-S360-42** — Todos los controles interactivos tienen área táctil mínima de 44×44 px y foco visible.
43. **CA-UX-S360-43** — Contraste AA verificado en navegador sobre tokens reales, en tema claro y oscuro, para badges de estado de equipo, chip de SLA, chips de filtro y texto secundario de las tablas nuevas.
44. **CA-UX-S360-44** — Ningún ejemplo, copy, fixture ni prueba contiene datos personales reales: ni nombres, ni documentos, ni direcciones, ni coordenadas de domicilios reales, ni seriales de producción.

### Contactos *(añadidos en v1.0 tras la decisión del CTO del 2026-09-04)*

45. **CA-UX-S360-45** — La sección de contactos aparece en la tab Datos y admite hasta 3 contactos.
46. **CA-UX-S360-46** — Al alcanzar el tercero, la acción de añadir queda **deshabilitada con explicación visible**; no desaparece.
47. **CA-UX-S360-47** — El contacto migrado desde el contacto alterno anterior aparece como primer registro, sin marca ni tratamiento especial.
48. **CA-UX-S360-48** — Eliminar un contacto pide confirmación e identifica por nombre a quién elimina.

## 11. Fuera del alcance de esta spec

Tokens y API de componentes (AI-DS-OWNER) · código y estilos (AI-FE-PLATFORM) · contratos de datos y endpoints (AI-SR-FULL) · cambios de alcance funcional (AI-EM-ARCH).

**Deuda reportada a AI-DS-OWNER, no de esta superficie:** el contenedor de tabs de la ficha de oportunidad usa lima como indicador activo, contra la disposición vinculante del informe de auditoría UI/UX. O se retira el uso, o se enmienda el informe; hoy conviven dos verdades.
