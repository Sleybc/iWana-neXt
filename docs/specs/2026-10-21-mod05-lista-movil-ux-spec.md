# MOD05 — Lista móvil de suscriptores · Spec UX (E3)

**Versión:** 1.0  
**Fecha:** 2026-10-21  
**Estado:** Congelada para implementación de Fase 08  
**Responsable:** AI-PROD-UX  
**PRD:** [PRD-MOD05-CRM-SUBSCRIBERS-FASE-08-v1.0.md](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-08-v1.0.md), Aprobado  
**Plan:** [2026-10-21-mod05-lista-movil.md](../plans/2026-10-21-mod05-lista-movil.md)  
**Origen UX:** [Rediseño de Suscriptores](2026-10-18-mod05-suscriptores-ux-rediseno-spec.md) §2.1, decisión E3  
**Fuente de campos:** [Mapa de campos personales del listado por rol](2026-10-11-mod05-subscriber-list-field-role-map.md) §6.2  
**Fuentes visuales:** [Firma iWana](2026-07-12-firma-iwana-diseno-visual-design.md), `docs/identity/Manual_Implementacion_Identidad_Iwana.md`, prototipos CRM de `docs/prototipo/`  
**Contrato de datos:** mapa de campos por rol ratificado; sin cambios de API, proyección, esquema o mapa.

## 1. Objetivo y usuario

En campo, una persona de Soporte o Administración debe reconocer al suscriptor, elegir una acción de contacto y abrir su resumen sin perder el lugar de la lista. La tarjeta prioriza identidad y servicio; las dos acciones de contacto quedan visibles y operables con un toque. La tabla de escritorio, la consulta, los filtros, la búsqueda y el estado persistido en URL siguen siendo los mismos.

La lista se representa con una sola fuente de resultados. El breakpoint solo cambia su presentación: tarjeta bajo 768 px y tabla desde 768 px, inclusive. Al girar el teléfono o cambiar el ancho no se repite la consulta ni se reinicia la página.

## 2. Decisiones de producto congeladas (G0)

| Decisión                      | Contrato UX                                                                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-E3-1 · 768 px               | Menos de 768 px usa tarjetas. A 768 px exactos y más, la tabla existente permanece.                                                                                     |
| D-E3-2 · fuente del teléfono  | Se utilizan exclusivamente `phone`, `altContactPhone` y `whatsapp` entregados por la proyección vigente al rol. No se consulta otra fuente ni se pide el dato al tocar. |
| D-E3-3 · dato no normalizable | No se muestra ni enlaza el teléfono crudo. Se omite la acción que no pueda construirse y se muestra el aviso definido en §4.                                            |
| D-E3-4 · WhatsApp             | El enlace no incluye texto, plantilla ni datos adicionales.                                                                                                             |
| D-E3-5 · registro             | Llamar o abrir WhatsApp no registra un intento de contacto ni muestra una confirmación de registro.                                                                     |
| D-E3-6 · texto libre          | La normalización ocurre solo al mostrar; no se valida ni modifica el valor guardado.                                                                                    |

La visibilidad no se deduce del nombre del rol: depende de los campos que entrega la proyección y de sus valores. ADMIN y SUPPORT reciben los campos de contacto del mapa ratificado; NOC, SALES y ACCOUNTANT no reciben teléfonos. Un valor nulo, restringido o anonimizado nunca genera un control de contacto.

## 3. Estructura y wireframes

### 3.1 Lista a 375 px

```text
Suscriptores                                  [Nuevo suscriptor]
Buscar por
[Texto] [Documento]
[Teléfono] [Correo]
[Buscar suscriptor__________________________]
[Activos 12] [Suspendidos 3] [Contacto pendiente 2] →
[Más filtros                              ▾]

┌────────────────────────────────────────────┐
│ {Nombre del suscriptor}                    │ ← enlace a la ficha
│ ┌────────────────────────────────────────┐ │
│ │ [Activo]                               │ │
│ │ {Documento} · Persona natural · Resid. │ │ ← botón «Abrir resumen de {nombre}»
│ │ {Plan principal} · {Ciudad}            │ │    con todo el resumen y la zona táctil
│ │ +{N} servicios                         │ │
│ └────────────────────────────────────────┘ │
│ [Llamar]              [WhatsApp]            │ ← si cada canal es válido
└────────────────────────────────────────────┘
```

La composición es una lista semántica `<ul>` con una tarjeta por `<li>`. Cada elemento usa un encabezado con el nombre visible; el nombre es el único enlace directo a la ficha completa. El badge, documento, tipo de persona, segmento, plan, ciudad y cantidad de servicios forman un único botón de resumen que abre la vista lateral; su nombre accesible es «Abrir resumen de {nombre}». Toda la zona de la tarjeta fuera del enlace al nombre y de las acciones de contacto activa ese botón. No se envuelven otros enlaces o botones dentro de él.

Orden de lectura y foco: nombre/enlace, resumen/botón, «Llamar», «WhatsApp». Las acciones que no estén disponibles se omiten sin dejar un botón vacío. Si solo queda una acción, conserva su ancho natural y no reserva espacio para la otra.

El contenido secundario usa el mismo formateo y reglas de privacidad que la lista actual. Se muestra el documento solo cuando el campo correspondiente está presente y la proyección lo autoriza; si no hay documento disponible, no se inventa uno ni se revela la diferencia entre campo ausente y restringido. Tipo y segmento conservan sus etiquetas de producto: «Persona natural», «Persona jurídica», «Residencial», «Micronegocio», «PyME», «Corporativo», «Gobierno» y «Mayorista». Los estados conservan las etiquetas vigentes: «Contacto inicial», «Prospecto», «Activo», «Suspendido» y «Cancelado».

El servicio principal muestra el plan y la ciudad cuando estén disponibles, seguidos de «+1 servicio» o «+N servicios» si hay servicios adicionales. Sin servicio principal se muestran «Sin servicio principal» y «Sin servicios vigentes». Si el servicio está en borrador, se conserva «Borrador» y no se presenta como servicio vigente. La privacidad restringida oculta identidad, documento, ubicación y acciones; el nombre seguro «Datos bloqueados» proviene del helper de privacidad. El registro anonimizado muestra «Anonimizado» y mantiene las redacciones actuales.

### 3.2 Lista a 768 px y vista lateral

A 768 px se mantiene la tabla actual sin cambio de columnas ni comportamiento. El orden móvil y el panel de filtros dejan de ocupar la composición móvil; no se monta una segunda consulta.

La vista lateral sigue abriéndose desde la zona de resumen de la tarjeta. En pantallas menores de 768 px ocupa el viewport completo; desde 768 px conserva su ancho lateral actual. El encabezado usa el nombre seguro del suscriptor y la descripción vigente «Detalle del suscriptor seleccionado», junto al botón «Cerrar». El contenido se desplaza dentro del panel; las acciones de contacto aparecen en «Contacto», antes de la información de contacto ya existente. Las acciones usan la misma selección, normalización, visibilidad y nombres accesibles que la tarjeta. No se cambia el contenido personal ya presente en el detalle ni sus reglas de privacidad.

Al abrir, el foco entra en la vista lateral con el mecanismo diferido de `@iwana/ui`; al cerrar con botón, Escape o velo, vuelve al botón «Abrir resumen de {nombre}» que la abrió. La lista permanece montada, en la misma página y posición de scroll. Abrir o cerrar el panel no solicita otra vez la lista.

## 4. Acciones de contacto y estados

La normalización usa la función pura `toDialablePhone` de `@iwana/shared`, el prefijo de país ya disponible y el formato E.164 canónico. No transforma el dato persistido. Los valores normalizados se usan únicamente para construir los destinos de acción; no se pintan en pantalla, no van a la URL del portal, y no se envían a logs ni métricas.

| Acción   | Orden de candidatos                                   | Destino y nombre accesible                                                                                                                                       | Estado sin candidato marcable |
| -------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Llamar   | `phone`; si es nulo o no normaliza, `altContactPhone` | `tel:{E.164}`; texto «Llamar»; nombre «Llamar a {nombre}»                                                                                                        | Omitir el botón.              |
| WhatsApp | `whatsapp`; si es nulo o no normaliza, `phone`        | `https://wa.me/{E.164 sin +}`, `target="_blank"`, `rel="noopener noreferrer"`; sin parámetro `text`; texto «WhatsApp»; nombre «Escribir por WhatsApp a {nombre}» | Omitir el botón.              |

El mensaje «Teléfono sin formato válido» aparece una sola vez bajo el grupo de acciones cuando hay al menos un valor de teléfono entregado por la proyección, pero ninguno de los candidatos aplicables permite generar un enlace seguro. Se presenta como texto secundario de estado, no como alerta bloqueante. Si una acción funciona por su fallback, no se muestra el aviso global. Si los campos no forman parte de la proyección, están vacíos, o el suscriptor está restringido/anonimizado, se omiten las acciones y el aviso: la UI no revela un permiso o una marca de privacidad.

No se antepone `+57` en la interfaz ni se expone el número como texto. El enlace `tel:` solo contiene el E.164 normalizado. El enlace de WhatsApp abre un destino externo sin texto prellenado; no aparece confirmación posterior porque el toque no pasa por el servidor.

## 5. Búsqueda, colas y filtros

### 5.1 Modos de búsqueda

Se conserva el grupo accesible «Buscar por» con «Texto», «Documento», «Teléfono» y «Correo», con los placeholders vigentes: «Nombre, razón social o NIT», «Cédula, NIT o pasaporte», «Teléfono» y «Correo». A 375 px los cuatro controles pueden distribuirse en dos columnas y dos filas, cada uno con altura mínima de 44 px. El grupo no crea desbordamiento horizontal. Se conservan `radiogroup`, el modo seleccionado y su navegación con flechas, Inicio y Fin; cambiar el modo no cambia el nombre del campo ni expone el valor buscado en la URL.

En búsqueda exacta, «Buscar» conserva la consulta por envío. La búsqueda de texto conserva la actualización actual. El valor de Documento, Teléfono o Correo no se añade a query string, historial de navegación, enlace de contacto, logs ni métricas.

### 5.2 Chips de cola

Los chips ocupan una sola fila horizontal bajo 768 px, con scroll horizontal solo dentro de su propio contenedor. El ancho del documento nunca se amplía para acomodarlos. El chip activo se desplaza a la vista al cargar/restaurar la URL, sin robar el foco ni mover verticalmente la página. Cada botón conserva `aria-pressed`, su etiqueta y conteo accesible. Los contadores mantienen sus estados existentes de carga y error. Cuando falla el conteo, el mensaje es «No pudimos cargar los conteos de las colas» con «Reintentar conteos»; los chips siguen operables.

### 5.3 «Más filtros» y orden

En menos de 768 px, «Más filtros» abre una superficie modal de pantalla completa que entra desde abajo y ocupa el viewport; usa el escalón y velo de ADR-075, sin z-index local. Título visible «Más filtros» y botón «Cerrar filtros». El contenido desplazable agrupa, en este orden, «Estado», «Tipo de persona», «Segmento», «Estrato» y «Ordenar por». El orden móvil existente queda integrado aquí, con «Orden por defecto» y las opciones declaradas por el servidor.

El panel copia los filtros y el orden aplicados al abrirse. Los cambios permanecen como borrador: «Aplicar» los guarda en la URL y en la lista, devuelve la página al inicio y cierra el panel. «Limpiar» restablece los cuatro filtros y el orden del borrador, sin borrar búsqueda, modo ni chip de cola; el usuario confirma esa limpieza con «Aplicar». Cerrar con «Cerrar filtros», Escape o el velo descarta los cambios no aplicados. No se ejecuta una consulta por cada cambio dentro del borrador.

El encabezado de cierre queda visible y el pie de acciones permanece fijo sobre el área segura del dispositivo. «Limpiar» es secundaria y «Aplicar» primaria; ambas alcanzan 44 × 44 px. El foco inicial va al título o al primer control según el patrón existente; Tab queda contenido en el panel, Escape lo cierra, y el cierre devuelve el foco al botón «Más filtros». DS-OWNER confirma la composición visual con las capas existentes en su review, sin que P0 añada tokens o API de componentes.

## 6. Estados y textos definitivos

| Situación                         | Presentación y texto                                                                                                                                 | Acción disponible                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Carga inicial superior a 300 ms   | Skeletons con forma de tarjetas (`aria-busy="true"`); anuncio «Cargando suscriptores…». Sin spinner bloqueante.                                      | Ninguna durante la carga.                                                                                               |
| Actualización de resultados       | Se mantienen las tarjetas actuales mientras se actualizan; región `aria-busy`; controles que inician otra consulta quedan deshabilitados.            | No se duplica ni reinicia el árbol de datos.                                                                            |
| Error al cargar                   | `PortalAlert` de error con título «No fue posible cargar los suscriptores» y descripción «No fue posible cargar los suscriptores. Intenta de nuevo.» | «Reintentar» donde ya está habilitado por el modo de lista. La búsqueda exacta conserva el contrato existente de error. |
| Primera visita sin suscriptores   | `PortalEmptyState`: «Aún no hay suscriptores» / «Crea el primero para iniciar el ciclo comercial y postventa.»                                       | «Crear suscriptor», a la ruta de alta existente.                                                                        |
| Filtros sin coincidencias         | «No se encontraron resultados» / «Ajusta la búsqueda o limpia los filtros para ver otros suscriptores.»                                              | «Limpiar filtros».                                                                                                      |
| Búsqueda exacta sin coincidencias | «No hay suscriptores con ese {documento/teléfono/correo}» / «Escribe el dato y selecciona Buscar para consultar una coincidencia exacta.»            | «Buscar como texto». El texto consultado queda en el campo, no en la URL.                                               |
| Búsqueda exacta sin enviar        | «Busca un suscriptor» / «Escribe el dato y selecciona Buscar para consultar una coincidencia exacta.»                                                | «Buscar» en el formulario.                                                                                              |
| Conteos de cola cargando          | Skeletons de chips y anuncio «Cargando conteos de las colas…».                                                                                       | Sin bloquear el resto de la lista.                                                                                      |
| Conteos de cola con error         | «No pudimos cargar los conteos de las colas» / «Intenta de nuevo en unos minutos.»                                                                   | «Reintentar conteos»; los chips conservan su operación.                                                                 |
| Contacto no marcable              | «Teléfono sin formato válido» según §4, solo si la proyección entregó un valor que no permite acción.                                                | Corregir el dato desde el flujo autorizado fuera de esta fase. No se ofrece el texto crudo.                             |
| Vista lateral cargando            | Skeleton con forma del contenido, tras 300 ms; el título accesible indica «Cargando información del suscriptor…».                                    | Cerrar mantiene el lugar de lista.                                                                                      |
| Error de vista lateral            | Título «No pudimos cargar la información del suscriptor» / «Intenta de nuevo en unos minutos.»                                                       | «Reintentar».                                                                                                           |
| Privacidad restringida            | Identidad segura «Datos bloqueados» y mensaje existente «La información personal está bloqueada y no se puede editar desde este perfil.»             | Sin acciones de contacto.                                                                                               |
| Registro anonimizado              | Identidad segura «Anonimizado»; se mantienen las redacciones actuales.                                                                               | Sin acciones de contacto.                                                                                               |

Los estados vacíos, de carga y error usan los componentes existentes del portal (`PortalEmptyState`, `PortalSkeletonBlock`, `PortalAlert`). Los mensajes anunciados no desplazan el foco. Los errores no dependen solo de color y siempre conservan la posibilidad de reintento cuando el flujo actual la ofrece.

## 7. Accesibilidad y adaptación

- WCAG 2.2 AA es criterio de salida. Todo control táctil mide al menos 44 × 44 px; ningún dato o acción depende de hover o color solamente.
- Mantener foco visible con `interactiveFocusClassName` o el foco accesible de la primitive existente. No quitar outline sin reemplazo.
- En tarjetas, lista y encabezados semánticos; enlaces y botones tienen nombres distintos y descriptivos. No anidar interacciones ni reutilizar un elemento no interactivo como botón.
- Al abrir el resumen, el foco se mueve de forma diferida dentro de la vista lateral; al cerrarla vuelve al disparador. La vista lateral contiene Tab, permite cerrar con Escape y conserva el scroll del fondo.
- Chips seleccionados usan `aria-pressed`; búsqueda usa grupo de radios etiquetado «Buscar por» y anuncia el control seleccionado; resultados de búsqueda y cambios de lista se comunican con estado polite sin trasladar el foco.
- Las etiquetas de estado visibles se conservan junto a sus colores. Para claro y oscuro se usan primitives y tokens existentes; el lima solo indica interacción/avance y el texto lima, si aparece, usa el escalón AA existente.
- A 375 px los controles, el formulario, las acciones y el panel se ajustan al viewport. Texto largo (nombre, segmento, plan o ciudad) puede partir línea; no se trunca un dato necesario para reconocer la tarjeta. No hay scroll horizontal del documento.
- A 768 px se muestra la tabla existente y se mantiene la misma lógica de filtros, búsqueda, acciones de la vista lateral, paginación y URL.

## 8. Criterios visuales verificables

La dirección es sobria y operativa: superficie de tarjeta existente, badges de estado existentes, jerarquía tipográfica de Firma iWana y acciones visibles. No se crea un patrón de colores, escala tipográfica, sombra, token ni API de componente. La tarjeta no anida una superficie decorativa dentro de otra. La prueba visual revisa 375 y 768 px en claro y oscuro, además de texto ampliado y foco de teclado.

La entrega no cumple si ocurre cualquiera de estos casos:

1. A 375 px aparece scroll horizontal del documento, una tarjeta no se reconoce sin abrirla, o una acción frecuente queda oculta.
2. A 768 px se ven tarjetas en lugar de la tabla actual, o el cambio de ancho solicita dos veces la lista.
3. Se muestra un teléfono crudo en una tarjeta, se intenta abrir un destino no normalizado, se añade texto al WhatsApp o se registra el toque como gestión.
4. Un rol o registro restringido/anonimizado ve un botón, dato o aviso que la proyección no autoriza.
5. El resumen o los filtros dejan el foco detrás del modal, no lo devuelven al disparador, o el scroll de la lista se reinicia.

## 9. Trazabilidad RF, CA y G0

| Requisito / criterio          | Especificación                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| RF-MV-01 / CA-MV-01           | §2, §3.2 y §7: `<768` tarjetas; `>=768` tabla; consulta única.                                                                             |
| RF-MV-02 / CA-MV-05           | §3.1: contenido, etiquetas, nombre como enlace, sin teléfono visible, documento condicionado a la proyección.                              |
| RF-MV-03 / CA-MV-06           | §3.1, §3.2 y §7: zona de resumen abre vista a pantalla completa; retorno a trigger y misma posición.                                       |
| RF-MV-04                      | §3.1 y §7: targets de 44 px, no depender de hover; controles textuales.                                                                    |
| RF-MV-05                      | §3.1 y §6: lista semántica y estados adaptados de carga, vacío y error.                                                                    |
| RF-MV-06 / CA-MV-02           | §4: orden `phone → altContactPhone`; `tel:` con E.164; etiqueta y nombre accesible.                                                        |
| RF-MV-07 / CA-MV-02           | §4: orden `whatsapp → phone`; enlace `wa.me`, sin texto, con `noopener noreferrer`.                                                        |
| RF-MV-08 / CA-MV-05           | §3.1 y §4: número nunca visible; nombres accesibles con nombre seguro del suscriptor.                                                      |
| RF-MV-09 / CA-MV-03           | §3.1 y §4: ausencia de campos por rol/privacidad oculta botones; dato no normalizable da aviso sin valor crudo.                            |
| RF-MV-10 / CA-MV-04           | §4: normalizar al render con `toDialablePhone`, prefijo de país y patrón canónico; casos de prueba se enumeran en el PRD.                  |
| RF-MV-11                      | §3.2 y §4: mismas reglas de contacto en la vista lateral móvil y escritorio.                                                               |
| RF-MV-12 / CA-MV-07           | §5.2: una fila horizontal con chip activo visible y teclado operable.                                                                      |
| RF-MV-13 / CA-MV-07           | §5.3: panel inferior completo, orden integrado, aplicar/limpiar, foco y cierre.                                                            |
| RF-MV-14 / CA-MV-07           | §5.1: modos accesibles en 2×2 a 375 px, sin desbordamiento.                                                                                |
| RF-MV-15 / CA-MV-01, CA-MV-07 | §3, §5 y §7: ancho del documento dentro del viewport; solo los chips tienen scroll horizontal local.                                       |
| CA-MV-08                      | La estructura de pantalla y los estados de §3–§6 son el contrato del E2E móvil sintético a 375 px, dentro del job bloqueante «E2E portal». |
| D-E3-1                        | §2: breakpoint inclusivo/exclusivo definido.                                                                                               |
| D-E3-2                        | §2 y §4: la proyección vigente es la única fuente y define visibilidad por rol.                                                            |
| D-E3-3                        | §4: ocultar destino inseguro y mostrar aviso sin teléfono crudo.                                                                           |
| D-E3-4                        | §4: WhatsApp sin texto.                                                                                                                    |
| D-E3-5                        | §2 y §4: no registrar el intento.                                                                                                          |
| D-E3-6                        | §2 y §4: no validar ni cambiar texto guardado.                                                                                             |

## 10. Deuda nueva y dependencias

| Severidad | Hallazgo                                                                                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0        | Ninguna conocida en el diseño.                                                                                                                                                                                                                     |
| P1        | Confirmación de DS-OWNER: la composición full-screen inferior de «Más filtros» debe usar las capas existentes de `@iwana/ui` y respetar ADR-075. La spec fija comportamiento y accesibilidad; DS-OWNER valida la solución visual antes del cierre. |
| P2        | La calidad del número en texto libre puede hacer que un canal no aparezca. V1 mide únicamente porcentaje y total normalizables, nunca números individuales.                                                                                        |
| P3        | Ninguna nueva.                                                                                                                                                                                                                                     |

No se solicita ampliar la proyección ni el mapa por rol. Si la proyección entrega un campo vacío, restringido o anonimizado, la pantalla mantiene las reglas de §2 y §4. Cualquier necesidad de ampliar esos datos queda fuera de esta fase y debe volver a AI-EM-ARCH.
