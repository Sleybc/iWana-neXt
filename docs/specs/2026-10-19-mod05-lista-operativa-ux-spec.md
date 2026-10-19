# MOD05 — Lista operativa de suscriptores · Spec UX

**Fecha:** 2026-10-19 · **Versión:** 1.0 · **Estado:** Aprobado
**Autor:** AI-PROD-UX · **Superficie:** `/dashboard/crm/subscribers` y vista lateral
**PRD aprobado:** [MOD05 Fase 06](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-06-v1.0.md)
**Plan:** [Lista operativa](../plans/2026-10-19-mod05-lista-operativa.md) · **Encargo:** [Prompt P0](../prompts/PROMPT-MOD05-LISTA-OPERATIVA-v1.0.md)
**Patrones:** [Firma iWana](2026-07-12-firma-iwana-diseno-visual-design.md) · [PortalSidePeek a11y](SPEC-PORTAL-SIDEPEEK-A11Y-v1.0.md) · [recetas de UI](../../.agents/skills/iwana-identity-ui-review/references/component-recipes.md) · [vocabulario](../../.agents/skills/system-vocabulary-review/SKILL.md) · [WCAG](../../.agents/skills/wcag-audit-patterns/SKILL.md)

> Esta spec congela comportamiento, estructura y copy de RF-LO-10 a RF-LO-19. La dirección visual y los componentes existentes mandan sobre cualquier detalle de implementación. Un cambio posterior se versiona y se notifica a AI-EM-ARCH; no se corrige en silencio.

## 1. Objetivo y límites

La persona operadora debe identificar el servicio principal, entrar a una cola de trabajo y resolver una suspensión o reactivación sin abandonar la lista. La pantalla prioriza nombre, estado y servicio; los filtros menos frecuentes quedan bajo divulgación progresiva.

Se consume el contrato de `@iwana/shared` publicado por B0. Esta spec no agrega datos, permisos, estados de suscriptor, acciones de ciclo de vida, tokens ni componentes. No presenta zona de cobertura, vistas guardadas ni tarjetas móviles: quedan fuera de esta fase según el PRD aprobado.

La búsqueda conserva sus cuatro modos existentes. El texto libre y los criterios exactos permanecen en estado local y nunca en la URL; tampoco se serializan identificadores personales en mensajes de error. La dirección del navegador solo contiene estado no personal aprobado: filtros, paginación/orden, `queue` y `peek=<id>`.

## 2. Estructura de la lista

Orden de lectura:

1. Encabezado existente «Suscriptores» y acción existente «Nuevo suscriptor».
2. Búsqueda existente; en modo Texto, el valor puede combinarse con una cola y los filtros.
3. Cinco chips de cola y el control «Más filtros».
4. Resumen de filtros activos, solo cuando haya alguno.
5. Tabla operativa dentro del shell existente, con su pie de paginación vigente.

Los chips y filtros quedan fuera del borde del shell de tabla. Los conteos de cola son globales y no sustituyen el conteo de resultados de la tabla: responden preguntas distintas. La tabla conserva la paginación del servidor, un solo conteo de resultados y el orden declarado por el servidor, según la receta §2. Los chips pueden ajustarse en varias líneas; la tabla conserva su desplazamiento dentro del shell existente. No se introduce un layout de tarjetas para móvil.

El filtro «Estado» se conserva dentro de «Más filtros», junto a Tipo de persona, Segmento y Estrato. Así se mantienen las búsquedas por estados distintos de Activo y Suspendido, aunque sus colas frecuentes tengan chips propios. El panel inicia cerrado; el resumen de filtros activos queda visible fuera del panel para que el operador pueda retirarlos sin abrirlo.

## 3. Columnas y filas · RF-LO-10

La tabla tiene exactamente estas cuatro columnas, en este orden:

| Encabezado             | Contenido                                                                                                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Suscriptor**         | Nombre o razón social en la primera línea. En la segunda: documento si está incluido en la proyección autorizada, luego tipo de persona y segmento, separados por `·`. Si el rol no recibe el documento, se omite ese fragmento, sin marcador de ausencia. |
| **Servicio principal** | Nombre del plan. Si el catálogo no lo devuelve, «Plan no disponible». Debajo: ciudad permitida por privacidad y «+N servicios» cuando haya otros servicios vigentes; con uno, «+1 servicio». No se muestra una zona.                                       |
| **Estado**             | Estado del suscriptor como badge con texto visible: «Contacto inicial», «Prospecto», «Activo», «Suspendido» o «Cancelado». El color nunca es la única señal.                                                                                               |
| **Creado**             | Fecha en formato local `es-CO`, con alineación y cifras tabulares según la receta vigente.                                                                                                                                                                 |

La fila abre la vista lateral al hacer clic fuera del enlace del nombre. El nombre conserva el enlace a la ficha. No se añade una columna de acciones ni se ocultan acciones frecuentes detrás del hover.

El segmento se presenta con la etiqueta de producto existente; para micro-negocios se muestra «Micronegocio».

### 3.1 Sin servicios vigentes y privacidad

La regla de selección de RF-LO-02 puede devolver un borrador cuando no hay contratos vigentes. En ese caso se muestra el plan si existe, la ciudad permitida por privacidad, la etiqueta «Borrador» y «Sin servicios vigentes»; no se presenta el borrador como activo ni se muestra «+0 servicios». Si `primaryService` es `null`, se muestra «Sin servicio principal» y «Sin servicios vigentes».

Para un servicio `ACTIVE` o `SUSPENDED`, la segunda línea combina la ciudad disponible y el conteo adicional. Si el conteo es cero, se omite «+0 servicios». Si falta ciudad en una proyección no restringida, se usa «Sin ubicación» según el helper existente. Para una proyección restringida o anonimizada nunca se reemplaza una ciudad suprimida por un texto que la describa como dato faltante: se omite la ciudad. La proyección de RF-LO-04 conserva plan y estado del servicio, y no muestra alias ni ciudad cuando privacidad lo impide.

El documento solo aparece cuando el campo está presente y autorizado para el rol. La identidad, tipo y segmento respetan las etiquetas de privacidad vigentes («Datos bloqueados» o «Anonimizado»); no se reconstruyen campos ausentes ni se muestran centinelas técnicos.

## 4. Chips y conteos · RF-LO-11, RF-LO-12 y RF-LO-14

Los chips aparecen siempre en modo Texto, en este orden:

| Copy visible                   | Valor canónico de `queue` | Filtro de la lista         |
| ------------------------------ | ------------------------- | -------------------------- |
| **Activos**                    | `active`                  | Estado Activo              |
| **Suspendidos**                | `suspended`               | Estado Suspendido          |
| **Contacto pendiente**         | `contactPending`          | `contactPending=true`      |
| **Datos fiscales incompletos** | `fiscalIncomplete`        | `fiscalIncomplete=true`    |
| **Sin servicios vigentes**     | `withoutLiveServices`     | `withoutLiveServices=true` |

Los valores de `queue` son los slugs canónicos aprobados por AI-EM-ARCH, iguales a las claves del contrato de conteos. Un valor desconocido se ignora y no selecciona ningún chip. Esos slugs nunca se presentan como copy de producto.

Cada chip muestra el conteo global del tenant, incluso si hay búsqueda de texto o filtros activos. Los conteos excluyen suscriptores anonimizados e incluyen las partes con datos bloqueados, igual que la lista operativa; la cifra agregada no expone datos personales. Un conteo `0` es un resultado válido y se muestra como tal; mientras carga o si falla la consulta no se sustituye por cero.

Solo un chip puede estar seleccionado (`aria-pressed="true"`). Elegir otro lo reemplaza; volver a activar el seleccionado lo desmarca. La búsqueda de texto, el estado y los filtros de Tipo de persona, Segmento y Estrato se combinan por intersección con la cola seleccionada. Los conteos no cambian al escribir ni al aplicar filtros.

Al cambiar el chip se actualiza `queue`, se vuelve a la primera página y se conserva el resto del contexto no personal. Al recargar, la cola y `peek` se restauran desde la URL. El chip seleccionado se identifica por forma/contraste además de su estado accesible; no depende solo del color.

En los modos exactos Documento, Teléfono y Correo, se ocultan los chips, «Más filtros», orden y paginación, como exige RF-LO-14 y el contrato previo de QW1. Los valores exactos no se guardan en URL. Los filtros existentes permanecen en el estado de la lista y no se aplican a la coincidencia exacta; al volver a Texto, la cola visible sigue correspondiendo a `queue`.

### 4.1 Estados de conteos

| Estado           | Presentación y texto                                                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cargando         | Skeletons con la forma de los cinco chips, región con `aria-busy` y texto de estado «Cargando conteos de las colas…». No se anuncian conteos como cero.                                                   |
| Listo            | Cada chip incluye su conteo como texto visible y accesible, por ejemplo «Activos, 12 suscriptores»; el número real proviene de la respuesta, no de un valor de ejemplo.                                   |
| Error de conteos | «No pudimos cargar los conteos de las colas» · «Intenta de nuevo en unos minutos.» Acción «Reintentar conteos». La lista y los chips siguen disponibles; mientras no haya conteo no se muestra un número. |

## 5. Filtros y URL · RF-LO-13

«Más filtros» es un botón de divulgación progresiva con `aria-expanded` y `aria-controls`. Al expandir, muestra controles con label asociado para Estado, Tipo de persona, Segmento y Estrato. No agrega filtros distintos a los que ya admite la lista.

El resumen muestra cada filtro activo como `Etiqueta: valor legible` y ofrece una acción para retirarlo por separado, con nombre accesible «Quitar filtro: {etiqueta}: {valor}». Retirar uno mantiene los demás, vuelve a la primera página y actualiza la URL. Si hay más de un filtro, se ofrece «Limpiar filtros»; esta acción también desmarca la cola y borra el texto local. Los valores se presentan con etiquetas existentes, nunca con enums.

### 5.1 Estado persistido

| Estado                                                             | Persistencia                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queue`                                                            | URL, con uno de los cinco slugs canónicos de §4.                                                                                                                                                     |
| `peek`                                                             | URL como `?peek=<id>`; contiene solo el id del suscriptor, nunca nombre, documento, teléfono, correo ni otro dato personal.                                                                          |
| Estado, Tipo de persona, Segmento, Estrato, página, tamaño y orden | Se conservan en la URL con las claves no personales ya requeridas por la tabla. Los cambios de filtros reinician página a 1; el cambio de página conserva el comportamiento de historial de ADR-065. |
| Texto libre, documento, teléfono y correo                          | Estado local; no se escriben en el query string. Al recargar, el valor de búsqueda queda vacío. La búsqueda exacta sigue ejecutándose al enviar.                                                     |

Al actualizar o cerrar la vista lateral, se agrega o quita únicamente `peek` y se conservan los demás parámetros. Cambiar filtros conserva el id abierto mientras siga vigente, aunque ya no aparezca entre las filas filtradas. Los estados no personales permanecen compatibles con Atrás/Adelante según el comportamiento existente de la tabla.

## 6. Estados de lista

| Estado                                   | Presentación y copy definitivo                                                                                                                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Carga inicial (>~300 ms)                 | Skeleton con forma de filas/celdas, que reserva el espacio y marca la región de datos como ocupada. Sin spinner bloqueante.                                                                                                   |
| Primera vez, sin registros ni criterios  | `PortalEmptyState`: título «Aún no hay suscriptores»; descripción «Registra el primero para iniciar el ciclo comercial y postventa.»; acción «Nuevo suscriptor».                                                              |
| Sin resultados por búsqueda/filtros/cola | Título «No se encontraron resultados»; descripción «Ajusta la búsqueda o limpia los filtros para ver otros suscriptores.»; acción «Limpiar filtros». No reutiliza el estado de primera vez.                                   |
| Coincidencia exacta sin resultado        | Se conserva el copy de QW1 según el modo: «No hay suscriptores con ese documento», «No hay suscriptores con ese teléfono» o «No hay suscriptores con ese correo»; acción «Buscar como texto». No se incluye el valor buscado. |
| Error al cargar la lista                 | `PortalAlert` con título «No fue posible cargar los suscriptores», descripción «Intenta de nuevo en unos minutos.» y acción «Reintentar». No se exponen ids ni valores de búsqueda en el mensaje.                             |
| Actualización en curso                   | Se conserva el contenido útil y se marca la región de datos como ocupada; no se reemplaza la tabla completa por un spinner.                                                                                                   |

## 7. Vista lateral · RF-LO-15 a RF-LO-18

Se usa `PortalSidePeek` existente; no se crea un drawer nuevo. Abre desde la fila y usa el anclaje, ancho, header, scroll, overlay, cierre, foco, teclado y capa de apilamiento de [SPEC-PORTAL-SIDEPEEK-A11Y](SPEC-PORTAL-SIDEPEEK-A11Y-v1.0.md). El id del suscriptor queda en `peek`; abrir o cerrar no elimina filtros ni paginación.

Cuando los datos cargan, el panel presenta:

1. Identidad permitida y badge del estado del suscriptor.
2. Sección «Contacto» con solo los campos ya disponibles y autorizados. Si no hay ninguno, «Sin datos de contacto disponibles.»
3. Sección «Servicios vigentes»: solo contratos `ACTIVE` y `SUSPENDED`; cada uno muestra nombre legible, estado y último motivo legible. Un motivo ausente o heredado se muestra como «—», conforme a Fase 05. No se muestran ids, enums ni borradores como servicios vigentes.
4. Sección «Avisos» solo si aplica: «Contacto pendiente» y/o «Datos fiscales incompletos».
5. Enlace «Abrir ficha» al registro existente.

La acción de ciclo de vida reutiliza `SubscriberLifecycleDialog` y sus dos pasos, motivos, vista previa, errores y confirmación aprobados en [la spec de suspensión de servicios](2026-10-19-mod05-suspension-servicios-ux-spec.md). Solo se ofrece la acción correspondiente al estado: «Suspender servicios» para Activo y «Reactivar servicios» para Suspendido. Si el estado requiere una acción pero no hay servicio elegible, se muestra deshabilitada con «No hay servicios activos para suspender.» o «No hay servicios suspendidos para reactivar.», según corresponda. Para «Contacto inicial», «Prospecto» y «Cancelado» no se añade una acción de suspensión/reactivación. No se ofrece cancelar ni terminar desde esta vista.

Al completar una acción, el diálogo se cierra, el detalle y la fila se actualizan sin recargar la página y se vuelven a solicitar los conteos. El `peek` se mantiene abierto con el detalle actualizado. Si la fila deja de coincidir con la cola activa, se retira de la tabla; al cerrar el panel aplica la restauración de foco definida en §8.

### 7.1 Privacidad

Con `privacyRestricted`, el panel muestra únicamente la identidad/estado ya autorizados y la alerta existente: título «Datos bloqueados» y descripción «La información personal está bloqueada y no se puede editar desde este perfil.» No muestra contacto, servicios, avisos operativos, «Abrir ficha» ni acciones de ciclo de vida.

Para un registro anonimizado se usa «Anonimizado» como identidad, no se muestran contacto, alias ni ciudad y no se ofrecen acciones de cambio. Se conservan únicamente los datos de servicio que la proyección autoriza —plan y estado— y se respeta la regla de privacidad vigente. Nunca se representa un dato suprimido como si solo faltara por registrar.

### 7.2 Estados de la vista lateral

| Estado                 | Presentación y copy definitivo                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cerrada                | No hay panel ni parámetro `peek`.                                                                                                                                                                                 |
| Cargando (>~300 ms)    | Skeleton con forma de identidad, contacto y servicios; `aria-busy`; título «Cargando información del suscriptor…». Se espera a que estén listos el detalle y los contratos; no se muestran secciones parciales.   |
| Error de carga         | «No pudimos cargar la información del suscriptor» · «Intenta de nuevo en unos minutos.» Acciones «Reintentar» y cierre. Se conserva `peek` mientras se reintenta; el texto no contiene el id ni datos personales. |
| Restringida            | Estado de §7.1. La sección limitada no se completa con campos del objeto que el servidor haya excluido de la proyección.                                                                                          |
| Sin servicios vigentes | En «Servicios vigentes»: «Sin servicios vigentes». No se muestran borradores como activos. Las acciones se habilitan o deshabilitan según §7 y Fase 05.                                                           |
| Lista disponible       | Secciones de §7; avisos solo si corresponden; enlaces y acciones según elegibilidad y privacidad.                                                                                                                 |

Un dato individual ausente no convierte el panel completo en error: se usa «—» para el último motivo ausente y se omite información que la proyección no autoriza. Si falla la carga del detalle o de los contratos, se presenta el estado de error completo y no una lista incompleta.

## 8. Teclado y foco · RF-LO-19

Los atajos existen solo cuando el foco está en una fila de la tabla; no se registran listeners globales de un carácter.

| Tecla                                         | Resultado                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Flecha abajo / arriba                         | Mueve la fila activa en la dirección indicada con roving `tabindex`; el foco visible acompaña la fila.                                                                                                                                                                                                       |
| `Enter` sobre la fila                         | Abre la vista lateral de esa fila y escribe su id en `peek`.                                                                                                                                                                                                                                                 |
| `Esc` con la vista lateral como capa superior | Cierra la vista lateral, quita solo `peek` y devuelve foco a la fila que la abrió, si sigue en la tabla. Si una acción la retiró de la cola, enfoca la fila visible más cercana a su posición anterior (primero la siguiente; si no existe, la anterior); si no quedan filas, enfoca el contenedor de tabla. |
| `Enter` sobre el enlace del nombre            | Sigue el enlace a la ficha; no abre la vista lateral. Los modificadores del enlace conservan el comportamiento nativo del navegador.                                                                                                                                                                         |
| `Ctrl/Cmd+K`                                  | Mantiene la búsqueda global existente.                                                                                                                                                                                                                                                                       |

El foco dentro de un control interactivo de celda conserva su comportamiento nativo; las flechas no interceptan los controles. Al abrir el panel, se enfoca su primer elemento operable o el contenedor enfocable según SPEC-PORTAL-SIDEPEEK-A11Y, se confina Tab/Shift+Tab, y el cierre devuelve foco según la regla anterior. Si hay un diálogo de ciclo de vida abierto, Escape actúa únicamente sobre la capa superior; no cierra también el panel subyacente.

No existen atajos globales `/`, `j` o `k`. No se reasigna `Ctrl/Cmd+K`.

## 9. Accesibilidad, identidad y vocabulario

- Tabla semántica, encabezados asociados y nombre «Listado de suscriptores». La fila enfocada tiene foco visible y un target de interacción de al menos 44 px de alto.
- Chips con nombre comprensible, conteo como texto, `aria-pressed` y foco visible. Los cambios de carga/error se anuncian como estado; el número no se usa como único indicador.
- «Más filtros» anuncia expandido/contraído y se asocia a su panel. Labels de controles visibles o asociados; los botones para quitar filtros identifican qué valor retiran.
- `PortalSidePeek` conserva foco inicial, trampa de foco, Escape, cierre por overlay y retorno al disparador del contrato congelado. El diálogo interno permanece arriba en el apilamiento.
- Contraste WCAG 2.2 AA, teclado, no depender solo del color y targets ≥44×44 px según el sistema existente. Usar primitives y tokens reales de `@iwana/ui`/`portal-ui.tsx`; no introducir colores, sombras o radios nuevos. Estados y acciones usan etiquetas legibles, nunca enums crudos.
- La firma es sobria y operativa: color con función, badges semánticos con texto, cifras tabulares y skeletons con forma. No se añade decoración orgánica a la tabla.
- Copy en español, sentence case y vocabulario de producto: «suscriptor», «servicios vigentes», «datos fiscales», «contacto», «estado». Los slugs camelCase existen solo en la URL/contrato; nunca se muestran.

## 10. Mapa de trazabilidad RF/CA

| RF       | Resolución en esta spec                                                                                           | Criterio de aceptación relacionado                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| RF-LO-10 | §3 columnas, orden, texto secundario, ausencia de zona y estados de servicio principal; privacidad del documento. | CA-LO-01 y CA-LO-03 (presentación de servicio y plan); CA-LO-05 (contexto de lista). |
| RF-LO-11 | §4 chips, conteo global, selección única, `aria-pressed`, combinación con búsqueda y URL.                         | CA-LO-04 (conteos/listado); CA-LO-05 (URL y recarga).                                |
| RF-LO-12 | §4 mapeo de los tres filtros booleanos y estados de conteo.                                                       | CA-LO-04.                                                                            |
| RF-LO-13 | §2 y §5 panel progresivo, Estado conservado, resumen y eliminación individual.                                    | CA-LO-05.                                                                            |
| RF-LO-14 | §4 modo exacto oculta filtros/chips y no combina criterios.                                                       | CA-LO-05; el modo QW1 conserva su criterio exacto vigente.                           |
| RF-LO-15 | §7 estructura, contacto, servicios vivos, último motivo, avisos y enlace a ficha; §8 apertura por fila/Enter.     | CA-LO-07 y CA-LO-08.                                                                 |
| RF-LO-16 | §7 acciones por estado, restricciones, diálogo reutilizado y refresco de fila/conteos.                            | CA-LO-06.                                                                            |
| RF-LO-17 | §5 y §7 `peek` solo con id, carga bajo demanda, skeleton y persistencia al recargar.                              | CA-LO-05.                                                                            |
| RF-LO-18 | §7.1/§7.2 contenido restringido; no mostrar contacto ni servicios.                                                | CA-LO-08.                                                                            |
| RF-LO-19 | §8 navegación acotada, `Enter`/`Esc`, retorno y fallback de foco.                                                 | CA-LO-07.                                                                            |

### 10.1 Mapa de criterios de aceptación

| CA       | Resolución o dueño de verificación                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-LO-01 | §3 y §3.1: servicio activo prioritario y «+1 servicio»; si no hay contratos vigentes, se aplican los estados de borrador/sin servicio.                     |
| CA-LO-02 | Fuera de UX: máximo de consultas por página (RNF-LO-01), verificación del track backend. No agrega copy ni interacción.                                    |
| CA-LO-03 | §3 y §11: plan no disponible muestra «Plan no disponible» sin romper la fila.                                                                              |
| CA-LO-04 | §4 y §4.1: conteos globales, estados y selección de cola. La equivalencia SQL y el test de paridad son del track backend.                                  |
| CA-LO-05 | §5 y §7: cola, filtros no personales y `peek` se restauran desde la URL; la búsqueda nunca persiste sus valores.                                           |
| CA-LO-06 | §7: al suspender, fila y conteos se actualizan sin recargar; el panel conserva el detalle actualizado.                                                     |
| CA-LO-07 | §8: recorrido por flechas, apertura por `Enter`, cierre por `Esc` y foco restaurado; no hay atajos de un carácter fuera de la tabla.                       |
| CA-LO-08 | §7.1: en estado restringido no se muestran contacto ni servicios.                                                                                          |
| CA-LO-09 | Fuera de UX: contrato HTTP 403 (RF-LO-20), verificación del track API. No agrega copy ni interacción.                                                      |
| CA-LO-10 | Fuera de UX: hook de foco inicial y pruebas de seis sitios (RF-LO-21/RF-LO-22), track de `@iwana/ui`; el comportamiento observable de este panel sigue §8. |

Esta spec cubre el contrato de experiencia RF-LO-10 a RF-LO-19. Las referencias a CA-LO-02, 09 y 10 delimitan su dueño de verificación; no sustituyen pruebas técnicas ni alteran los contratos de B0/D0.

## 11. Copy definitivo

Esta tabla concentra los textos que implementa F2. Los estados de búsqueda exacta existentes mantienen el modo/copy correspondiente; no muestran el valor digitado.

| Contexto                          | Texto                                                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Título                            | «Suscriptores»                                                                                                                                |
| Acción existente                  | «Nuevo suscriptor»                                                                                                                            |
| Chips                             | «Activos» · «Suspendidos» · «Contacto pendiente» · «Datos fiscales incompletos» · «Sin servicios vigentes»                                    |
| Filtros                           | «Más filtros» · «Estado» · «Tipo de persona» · «Segmento» · «Estrato» · «Limpiar filtros»                                                     |
| Vacío inicial                     | «Aún no hay suscriptores» · «Registra el primero para iniciar el ciclo comercial y postventa.»                                                |
| Sin resultados                    | «No se encontraron resultados» · «Ajusta la búsqueda o limpia los filtros para ver otros suscriptores.»                                       |
| Conteos cargando                  | «Cargando conteos de las colas…»                                                                                                              |
| Conteos fallidos                  | «No pudimos cargar los conteos de las colas» · «Intenta de nuevo en unos minutos.» · «Reintentar conteos»                                     |
| Lista fallida                     | «No fue posible cargar los suscriptores» · «Intenta de nuevo en unos minutos.» · «Reintentar»                                                 |
| Principal ausente                 | «Sin servicio principal» · «Sin servicios vigentes»                                                                                           |
| Plan ausente del catálogo         | «Plan no disponible»                                                                                                                          |
| Ubicación realmente ausente       | «Sin ubicación»                                                                                                                               |
| Nombre no disponible              | «Sin nombre» o «Sin razón social», según tipo, con helpers existentes                                                                         |
| Vista lateral                     | «Contacto» · «Servicios vigentes» · «Avisos» · «Abrir ficha»                                                                                  |
| Contacto vacío                    | «Sin datos de contacto disponibles.»                                                                                                          |
| Avisos                            | «Contacto pendiente» · «Datos fiscales incompletos»                                                                                           |
| Sin servicios en la vista lateral | «Sin servicios vigentes»                                                                                                                      |
| Vista lateral cargando            | «Cargando información del suscriptor…»                                                                                                        |
| Vista lateral fallida             | «No pudimos cargar la información del suscriptor» · «Intenta de nuevo en unos minutos.» · «Reintentar»                                        |
| Datos restringidos                | «Datos bloqueados» · «La información personal está bloqueada y no se puede editar desde este perfil.»                                         |
| Búsqueda exacta sin resultados    | «No hay suscriptores con ese documento» · «No hay suscriptores con ese teléfono» · «No hay suscriptores con ese correo» · «Buscar como texto» |
| Acciones                          | «Suspender servicios» · «Reactivar servicios» · «No hay servicios activos para suspender.» · «No hay servicios suspendidos para reactivar.»   |
| Estado ausente                    | «—»                                                                                                                                           |
| Estados de suscriptor             | «Contacto inicial» · «Prospecto» · «Activo» · «Suspendido» · «Cancelado»                                                                      |
| Segmento de micro-negocios        | «Micronegocio»                                                                                                                                |

Mapeo de producto aprobado: `LEAD` → «Contacto inicial» (primer contacto sin contrato); `SOHO` → «Micronegocio» (micro-negocios). El resto de etiquetas de estado y segmento procede de los helpers de producto existentes. No se muestran enums crudos.

No se incluyen nombres, documentos, teléfonos, correos, direcciones, ids concretos ni ejemplos de PII.
