# Spec UX — IVA por punto de servicio (MOD05)

**Versión:** 1.0  
**Estado:** **Ratificada con ajustes y congelada** por AI-EM-ARCH el 2026-10-12 (ver §8) — referencia de T6 y T8  
**Fecha:** 2026-10-12  
**Responsable:** AI-PROD-UX  
**Alcance:** crear, convertir y editar el punto de servicio fiscal de un contrato; mostrar su IVA en la ficha 360°; retirar la presentación obsoleta a nivel suscriptor; elegir el concepto de cobro en el catálogo.

> Esta spec se redactó contra C-API-3 v1.0. La ratificación de AI-EM-ARCH es el gate para congelarla y habilitar T6. Cualquier cambio posterior de flujo o alcance se versiona y se comunica a FE-PLATFORM y SR-QA; no se corrige en silencio.

## 1. Fuentes y límites

- [ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md), decisiones D1–D6.
- [Plan MOD05/MOD06/MOD07](../plans/2026-10-12-mod05-iva-punto-servicio.md), bloque T5.
- [Prompt de ejecución](../prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.0.md), C-API-3 v1.0 y T5.
- [Ficha 360° del suscriptor](2026-09-04-mod05-subscriber-360-ux-spec.md), especialmente la pestaña Servicios y el panel Financiero.
- [Dirección visual Firma iWana](2026-07-12-firma-iwana-diseno-visual-design.md), tokens reales y recetas existentes en `@iwana/ui` y `portal-ui.tsx`.
- Prototipos propios de expedientes: `docs/prototipo/prototipo_expediente.html` y `docs/prototipo/prototipo_secciones_expedientes.html` (composición operativa y gramática de tres estados). El patrón vigente de fila a detalle es el panel lateral del portal.
- PRD `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-04-v1.0.md`, HLD `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md` y patrones actuales en `apps/portal/src/components/crm/subscribers/` y `apps/portal/src/components/commercial/catalog/`.

**No se añaden datos ni reglas de negocio.** La pantalla usa únicamente:

| Uso | Campos C-API-3 v1.0 |
| --- | --- |
| Punto de servicio del contrato | `serviceUsage`, `installationStratum`, `stratumEvidenceMediaId` |
| Resultado en la ficha del contrato | `vatSnapshot.treatment`, `legalBasis`, `ratePercent`, `requiresAccountantReview`, `resolvedAt` |
| Ítem del catálogo | `vatConcept` |
| Plan | `networkType` (predeterminado `FIXED`) |

La evidencia se sube mediante el endpoint de media existente; el contrato guarda solo el identificador `stratumEvidenceMediaId`. No se muestra ni se registra una URL, identificador opaco, nombre de archivo persistido o dato personal adicional. No se propone un nuevo patrón de carga, endpoint, token ni componente.

## 2. Tarea principal y recorrido

La persona operadora crea o convierte un contrato y deja explícito el uso y el estrato del predio donde se instala el servicio. Si el punto califica para el tratamiento diferencial, puede adjuntar un recibo de servicio público o el certificado municipal de estratificación. Después consulta el cálculo, su fundamento y cualquier aviso de revisión en el detalle de ese contrato.

1. En **Crear contrato**, la persona selecciona el uso. Si es residencial, registra el estrato del predio de instalación y puede cargar el soporte.
2. En **Convertir a contrato**, uso y estrato se precargan desde la oportunidad según la regla conservadora de C-API-3; la persona los revisa y puede corregirlos mientras el contrato es borrador. El soporte se puede adjuntar en el mismo flujo.
3. En un contrato **Borrador**, los tres campos se editan en el formulario normal del contrato.
4. En un contrato **Activo**, esos campos son de solo lectura en la edición general. La acción dedicada **Actualizar punto de servicio** permite corregirlos y recalcula la instantánea fiscal.
5. En **Servicios → detalle del contrato**, se consulta el IVA propio del contrato. La columna y los banners que presentaban IVA como atributo del suscriptor dejan de hacerlo.
6. En los formularios de catálogo, se selecciona qué se está cobrando con etiquetas de negocio. Para planes, el tipo de red se muestra como **Fija** o **Móvil**, inicialmente **Fija**.

El uso mixto (vivienda y actividad comercial en el mismo punto) se registra como **No residencial** mientras el contador no indique otra clasificación, según ADR-093 D2. El tipo de persona jurídica no se pregunta: el sistema ya lo conoce y deshabilita la opción residencial.

## 3. Criterios de aceptación

### 3.1 Crear, convertir y editar el punto de servicio

**CA-UX-IVA-01 — Explicar el uso.** En los formularios de creación, conversión y edición de borrador existe el campo **Uso del servicio**, con opciones **Residencial** y **No residencial**. La ayuda dice: “El uso del predio determina el tratamiento de IVA de este contrato. Si allí también funciona un negocio, selecciona No residencial mientras el contador no indique otra clasificación.” No aparecen valores de enum.

**CA-UX-IVA-02 — Precargar datos conocidos.** Al convertir una oportunidad, el formulario muestra los valores de uso y estrato que devuelve la conversión conforme a la regla conservadora de C-API-3. La persona revisa o corrige esos campos; no los vuelve a digitar sin motivo. En una creación manual, el tipo de persona conocido restringe las opciones. No se copia automáticamente el estrato del suscriptor como si fuera el estrato del nuevo punto de instalación cuando no se sabe que corresponde a esa dirección.

**CA-UX-IVA-03 — Pedir uso cuando haga falta.** Si el contrato nuevo no trae un uso conocido, el campo queda sin selección y la persona debe elegirlo antes de guardar. No se infiere uso residencial a partir del tipo de persona o segmento del cliente.

**CA-UX-IVA-04 — Mostrar estrato solo para uso residencial.** Al seleccionar **Residencial**, aparece **Estrato del predio de instalación**, con valores del 1 al 6 y validación junto al campo. Para **No residencial**, el campo se oculta y se envía nulo; el formulario no solicita un estrato innecesario.

**CA-UX-IVA-05 — Bloquear residencial para persona jurídica con motivo.** Si el suscriptor es persona jurídica, **Residencial** aparece deshabilitado y se informa: “Las personas jurídicas no pueden registrar un servicio como residencial. Selecciona No residencial.” El sistema no pide que el operador resuelva manualmente una combinación inválida.

**CA-UX-IVA-06 — Soporte pertinente.** El control de soporte aparece cuando el uso es residencial y el estrato es 1, 2 o 3. La instrucción indica qué documentos se aceptan en términos de negocio: recibo de un servicio público o certificado municipal de estratificación de la dirección de instalación. Para otros usos o estratos, no se pide ese soporte.

**CA-UX-IVA-07 — Sin soporte, mostrar el efecto y permitir continuar.** Para uso residencial de estrato 1–3 sin soporte, se muestra un aviso visible junto al campo: “Sin soporte del estrato, a este servicio se le aplicará IVA del 19 %.” Guardar y activar siguen disponibles; el operador no pierde el contrato ni queda bloqueado. El aviso no se comunica solo con color.

**CA-UX-IVA-08 — Cargar y reemplazar sin exponer el documento.** El control permite adjuntar un solo soporte con el endpoint de media existente. Tras la carga, se asocia únicamente el id devuelto en `stratumEvidenceMediaId` y la UI muestra **Soporte cargado**; no expone el id ni crea enlaces permanentes. Si ya existe soporte, ofrece reemplazarlo o quitarlo. La carga en curso bloquea el guardado hasta que el id quede asociado; si falla, conserva los demás campos y ofrece reintentar.

**CA-UX-IVA-09 — Editar el borrador en un solo lugar.** En estado **Borrador**, uso, estrato y soporte se editan junto a los datos del servicio. No se crea un formulario tributario separado ni se duplica la captura de esos campos.

**CA-UX-IVA-10 — Acción dedicada en contratos activos.** En estado **Activo**, los tres campos fiscales no se pueden cambiar desde la edición general. La sección del punto de servicio ofrece la acción **Actualizar punto de servicio**, que abre un formulario dedicado, aplica la misma validación y envía los cambios mediante la acción C-API-3. Al guardar, se vuelve a cargar y se muestra la instantánea recalculada. El contrato y la dirección no se convierten en campos de esa acción.

**CA-UX-IVA-11 — Errores recuperables.** Los errores 422 de uso o estrato aparecen junto al campo relacionado, conservando los valores válidos. Si falla la carga, el mensaje indica que no se guardó el soporte y ofrece reintentar. Si activar falla porque el plan no tiene concepto de cobro, el mensaje identifica el ítem nombrado por el servidor y orienta a corregir su ficha en el catálogo; nunca se asigna un IVA predeterminado.

### 3.2 IVA en Servicios y detalle del contrato

**CA-UX-IVA-12 — IVA pertenece al contrato.** En el detalle que se abre desde **Servicios** (`ContractDetailDrawer`) existe una sección **IVA del contrato**. Se muestra junto a los datos del contrato y no como una propiedad global del suscriptor. El acceso conserva el patrón actual de detalle lateral desde la fila.

**CA-UX-IVA-13 — Presentar el resultado con palabras claras.** Cuando `vatSnapshot` existe, la sección traduce los valores a una etiqueta y tarifa comprensibles: **Exento · 0 %**, **Excluido · 0 %** o **Gravado · 19 %**. No se muestran `STANDARD`, `EXEMPT`, `EXCLUDED` ni otros códigos.

**CA-UX-IVA-14 — Explicar el fundamento.** La sección traduce el fundamento recibido, sin exponer el enum: `ET_481_H` → “Estatuto Tributario, artículo 481, literal h”; `ET_476_7` → “Estatuto Tributario, artículo 476, numeral 7”; `ET_468` → “Estatuto Tributario, artículo 468”. El fundamento y la tarifa quedan como texto, no dependen del color ni de un tooltip.

**CA-UX-IVA-15 — Aviso contable.** Si `requiresAccountantReview` es verdadero, la sección muestra “Este concepto requiere revisión del contador.” El aviso no afirma que la revisión ya ocurrió y no oculta la tarifa ni su fundamento.

**CA-UX-IVA-16 — Estado sin instantánea.** Si `vatSnapshot` es nulo en un borrador, se explica “El cálculo de IVA estará disponible cuando se active el contrato.” Si es nulo en un contrato activo, no se sustituye por el IVA legado del suscriptor ni se inventa una tarifa; se muestra que el cálculo no está disponible y un error recuperable si la carga de la ficha falló.

**CA-UX-IVA-17 — Fecha de cálculo.** Cuando existe `resolvedAt`, se muestra en formato local es-CO como dato secundario (**Calculado el …**). No se muestra timestamp técnico crudo.

### 3.3 Columna, banner y perfil tributario del suscriptor

**CA-UX-IVA-18 — Retirar el IVA del listado.** Se elimina la columna **IVA** del listado de suscriptores. No se reemplaza por **IVA por contrato (varía)** ni por un resumen: el contrato actual no entrega una agregación por suscriptor y varios contratos pueden tener tratamientos distintos.

**CA-UX-IVA-19 — Retirar el banner de tratamiento.** `VatTreatmentBanner` deja de presentar el `vatTreatment` legado como tratamiento vigente del suscriptor. No se migra ese banner a un estado calculado desde el primer contrato.

**CA-UX-IVA-20 — Retirar solo la parte de IVA del perfil tributario.** `TaxProfileBlock` deja de sugerir, recalcular o mostrar un tratamiento de IVA por estrato del suscriptor; tampoco presenta el estrato del suscriptor como estrato de todos sus contratos. Se ocultan las asignaciones de categoría IVA como resultado del suscriptor y se conservan las demás asignaciones existentes. La categoría se resuelve con el contrato vigente del catálogo de tributos (`taxDefinitionId` → `category`); no se agrega un campo al contrato C-API-3. Donde el panel siga visible, un texto breve indica: “El IVA se consulta en cada contrato, en Servicios”, con enlace a esa pestaña existente.

### 3.4 Selector de concepto en catálogo

**CA-UX-IVA-21 — Nombre del campo y opciones.** En el formulario de ítem nuevo se presenta **Concepto de cobro** con ayuda “Selecciona qué estás cobrando; esta opción define cómo se calcula el IVA.” Las opciones visibles son:

| Valor del contrato (no visible en la UI) | Etiqueta de negocio |
| --- | --- |
| `INTERNET_ACCESS` | Acceso a internet |
| `ACTIVATION_INHERENT` | Instalación, conexión o activación del servicio |
| `EQUIPMENT_SALE` | Venta de equipo |
| `EQUIPMENT_LEASE` | Alquiler de equipo |
| `INDEPENDENT_SERVICE` | Servicio independiente (mantenimiento, soporte o IP fija) |
| `TELEVISION` | Televisión |
| `TELEPHONY` | Telefonía |

El campo es obligatorio en un ítem nuevo. En un ítem legado sin concepto, se puede guardar una edición no relacionada sin imponer un valor inventado; el formulario permite asignar uno y el backend sigue fallando cerrado al activar un plan sin concepto.

**CA-UX-IVA-22 — Advertir revisión cuando aplique.** Al elegir alquiler de equipo, servicio independiente o televisión, se muestra junto al selector “Este concepto requiere revisión del contador.” Para telefonía se informa “El IVA de telefonía se determina con sus reglas propias.” Ningún aviso presenta un código o afirma que el cálculo canónico resolvió telefonía.

**CA-UX-IVA-23 — Tipo de red del plan.** El formulario de plan presenta **Tipo de red** con opciones **Fija** y **Móvil**; los planes nuevos parten de **Fija**, como define C-API-3. Se conserva el valor conocido al editar. No se deduce este dato del nombre de tecnología ni se muestra `FIXED`/`MOBILE`.

## 4. Estados, accesibilidad y presentación

- **Carga:** usar el skeleton con forma de los campos o del bloque IVA, siguiendo la receta existente; reservar el espacio si la carga supera el umbral del sistema. No introducir spinner como estado primario.
- **Error:** error en el campo para validación, y alerta recuperable para fallos de carga/cálculo. Conservar los datos del formulario y ofrecer un siguiente paso cuando la persona pueda actuar.
- **Sin soporte:** aviso semántico de advertencia junto al control; el 19 % debe leerse en texto y no depender del tono visual.
- **Persona jurídica:** opción residencial deshabilitada con motivo visible; no basta con ocultarla.
- **Activo:** campos del punto de servicio en solo lectura en el formulario general y disponibles desde la acción dedicada.
- **Responsive:** en ancho reducido, los campos se apilan; el selector, la evidencia y los botones conservan nombre accesible y área de interacción de al menos 44 px. El panel lateral mantiene desplazamiento interno y cierre/foco de teclado según el patrón existente.
- **Teclado y lector de pantalla:** orden de foco coincide con el orden visual; selector y control de archivo operables por teclado; foco visible con `interactiveFocusClassName`/primitivas existentes; errores enlazados al campo; estado de carga, éxito y fallo de archivo anunciado sin incluir PII.
- **Contraste:** cumplir WCAG 2.2 AA en claro y oscuro con tokens y pares reales del repositorio. No definir colores ni tokens nuevos; el texto nunca se apoya únicamente en lima ni en color de estado.
- **Composición:** reutilizar `FormField`/`Select`/`Input`, `PortalAlert`, `PortalSkeletonBlock` y el panel de detalle actuales. Mantener visualmente sobrio e interactivo, con jerarquía clara y sin tarjetas anidadas decorativas.

## 5. Decisión UX sobre el IVA legado

Se retira toda presentación que sugiera un único IVA del suscriptor: columna del listado y `VatTreatmentBanner`. En `TaxProfileBlock` se elimina exclusivamente la sugerencia y representación de IVA basada en estrato de suscriptor; el resto de impuestos vigentes se conserva, sin adelantar SUB-M03 (`tax_regime` → responsabilidades RUT). La vista de referencia para el IVA pasa a ser el detalle de cada contrato.

## 6. Dependencia para revisión de seguridad

El flujo usa Media para adjuntar soporte y solo guarda el id en el contrato. En la revisión de T7 debe confirmarse que el permiso vigente para subir y consultar este documento privado cubre a los operadores habilitados para crear/actualizar contratos. Esta spec no crea permisos, rutas ni metadatos y no bloquea la definición UX.

## 7. Ratificación

**Ratificada con ajustes el 2026-10-12** — ver §8.

## 8. Ratificación de AI-EM-ARCH (2026-10-12)

**Ratificada con dos ajustes. Queda congelada como v1.0** y es la referencia de T6 y T8. Los 23 criterios se mantienen. Los dos ajustes cambian el respaldo en el backend, no el comportamiento visible.

| Criterio | Ajuste | Respaldo |
| --- | --- | --- |
| **CA-UX-IVA-03** (uso obligatorio) | El backend lo exige al **activar**: un contrato sin `serviceUsage` no se activa (422 con el campo nombrado). El borrador puede guardarse sin uso, igual que hoy | C-API-3 v1.1 (a) |
| **CA-UX-IVA-20** (ocultar las asignaciones de IVA del perfil tributario) | La categoría **no** se resuelve en el portal consultando el catálogo de tributos: los roles de CRM pueden no tener lectura de Taxation. `TaxAssignmentSnapshot` incluye `taxCategory`. Además, el perfil deja de **crear** sugerencias de IVA por estrato; las existentes no se borran y se ocultan | C-API-3 v1.1 (b) y (c) |

Decisiones que la ratificación confirma:
- **CA-UX-IVA-18 retira la columna IVA del listado.** Esto supera la restauración hecha en B10 de la remediación: aquella devolvía el dato que el contrato servía; esta decisión, posterior y amparada por ADR-093 D6, retira el concepto. `vatTreatment` sigue en `SubscriberListItem` como campo deprecado hasta la fase de Billing.
- **El uso mixto se registra como No residencial** (CA-UX-IVA-01), alineado con ADR-093 D2.
- **El soporte no se enlaza de forma permanente** (CA-UX-IVA-08). La visualización bajo demanda por URL firmada queda condicionada al veredicto de T7 (§6).

### 8.1 Ajuste de implementación de CA-UX-IVA-08 (2026-10-12, C-API-3 v1.2)

El soporte deja de subirse a `/media/upload` (solo ADMIN) y se sube a `POST /crm/contracts/:id/stratum-evidence`, que requiere un contrato existente. Por eso, **en la creación**, el archivo se elige en el formulario y se sube inmediatamente después de crear el borrador. Si la carga falla, el borrador queda guardado y el error ofrece reintentar. **El criterio no cambia**: carga bloqueante, una sola evidencia, reemplazar o quitar, sin exponer ids ni enlaces permanentes.
