# MOD14 — Facturación · Fase 01: Cartera interna y política de facturación · Spec UX

**Versión:** 1.1 (re-sync v1.1) · **Fecha:** 2026-10-31 (actualizada 2026-11-03) · **Responsable:** AI-PROD-UX  
**Estado:** UX congelada para F1 y F2 (Ola 1); incluye reglas de titular bloqueado (RS-6) y motivo `SUPLANTACION` (RS-7)  
**PRD:** [PRD-MOD14-FACTURACION-FASE-01-v1.0.md](../prds/PRD-MOD14-FACTURACION-FASE-01-v1.0.md) · **HLD:** [HLD-MOD14-FACTURACION-v1.1.md](../hlds/HLD-MOD14-FACTURACION-v1.1.md) · **ADR:** [ADR-103](../adrs/ADR-103-Modulo-Facturacion-MOD14.md) · **Plan:** [2026-10-31-mod14-facturacion-fase-01-orquestacion.md](../plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md)

---

## 1. Objetivo y principios de experiencia

### 1.1 Objetivo

Definir los flujos, pantallas, interacciones, estados y vocabulario visual para la cartera interna y la política de facturación en iWana neXt. La experiencia permite al operador configurar los parámetros de cobro y corte, generar y emitir documentos de cobro internos, registrar pagos manuales con sugerencia FIFO, consultar estados de cuenta y monitorear el estado de pago en la agenda de corte de servicios, sin alterar estados de servicio ni emitir facturación electrónica DIAN en esta fase.

### 1.2 Principios de diseño (Firma iWana & Identidad UI)

- **Visualmente sobrio, interactivamente denso:** la interfaz prioriza la legibilidad de cifras y fechas contables en pesos colombianos (COP). Se aplican las primitives y los tokens existentes de Firma iWana, con su sombra dual para niveles de interacción y superficies; no se crean estilos locales ni se usa lima como fondo base.
- **Semántica de estados rigurosa:** el lima se reserva para éxito, completitud o interacción activa; los estados de advertencia, error y neutro usan sus tonos semánticos aprobados. Cada estado incluye una etiqueta o texto legible, no solo color.
- **Transparencia en cálculos:** el portal **no calcula fechas de facturación**; todas las proyecciones y vistas previas provienen del servidor y usan la zona horaria configurada para la empresa (`settings.timezone`).
- **Accesibilidad integral (WCAG 2.2 AA):** foco visible con el patrón compartido del sistema, targets interactivos mínimos de 44 px, navegación por teclado, estados que no dependen solo del color y contraste suficiente para cada par de tokens aprobado.

---

## 2. Vocabulario de producto visible (System Vocabulary Review)

Siguiendo `system-vocabulary-review` y el PRD §8, se prohíbe el uso de enums crudos o jerga interna técnica en la interfaz de usuario:

| Código técnico / enum interno | Texto visible canónico en el Portal                                                     | Contexto / Ubicación                    |
| ----------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------- |
| `billing_document`            | **Documento de cobro** _(provisional, decisión D-BIL-2 pendiente de concepto contable)_ | Encabezados, tablas, PDF y diálogos     |
| Leyenda legal PDF (D-BIL-2)   | _«Documento interno: no es factura electrónica de venta»_                               | Pie de página del PDF descargable       |
| `BORRADOR`                    | **Borrador**                                                                            | Estado de documento de cobro            |
| `EMITIDO`                     | **Emitido**                                                                             | Estado de documento de cobro            |
| `ANULADO`                     | **Anulado**                                                                             | Estado de documento de cobro o pago     |
| `SIN_DOCUMENTO`               | **Sin documento**                                                                       | Píldora de estado de periodo            |
| `PENDIENTE`                   | **Pendiente**                                                                           | Píldora de estado de periodo            |
| `PARCIAL`                     | **Pago parcial**                                                                        | Píldora de estado de periodo            |
| `PAGADO`                      | **Pagado**                                                                              | Píldora de estado de periodo            |
| `VENCIDO`                     | **Vencido**                                                                             | Píldora de estado de periodo            |
| `ANTICIPADO`                  | **Cobro anticipado**                                                                    | Configuración de política               |
| `VENCIDO` (timing)            | **Cobro al final del periodo**                                                          | Configuración de política               |
| `DIA_FIJO_CICLO`              | **Corte en día fijo del ciclo**                                                         | Configuración de política               |
| `VENCIMIENTO_MAS_GRACIA`      | **Corte por plazo de pago más gracia**                                                  | Configuración de política               |
| `DIAS_REALES`                 | **Días calendario reales**                                                              | Método de prorrateo                     |
| `MES_30`                      | **Mes comercial de 30 días**                                                            | Método de prorrateo                     |
| `SEPARADO`                    | **Documento inicial separado**                                                          | Modo de primer periodo                  |
| `JUNTO_AL_SIGUIENTE`          | **Unir al siguiente periodo**                                                           | Modo de primer periodo                  |
| `allocation`                  | **Aplicación de pago**                                                                  | Distribución a documentos               |
| `credit_balance`              | **Saldo a favor**                                                                       | Cuenta del suscriptor                   |
| `SUPLANTACION`                | **Suplantación de identidad**                                                           | Motivo de anulación (Ley 2573, art. 8)  |
| `[DATOS_BLOQUEADOS]`          | **[Dato protegido por custodia legal]**                                                 | Enmascaramiento de adquirente bloqueado |

---

## 3. Flujos de usuario

### Flujo 1: Configurar la política de facturación con vista previa

- **Ubicación:** Portal → Configuración → Facturación (`/dashboard/settings/billing`).
- **Permisos requeridos:** `settings.read` / `billing.invoices.read` para consultar; `billing.policy.manage` para editar.
- **Estructura de pantalla:**
  1. `PageHeader` con título «Facturación», subtítulo explicativo («Define las reglas de emisión de cobro, plazos de vencimiento y cálculo de cortes para la cartera de tus suscriptores») y botón de guardado «Guardar cambios».
  2. Panel principal dividido en 4 secciones funcionales:
     - **Periodo y momento de cobro:**
       - Selector «Momento del cobro»: opciones «Cobro anticipado» (`ANTICIPADO`, por defecto) y «Cobro al final del periodo» (`VENCIDO`).
       - Campo numérico «Días de anticipación para generar»: número de 0 a 15 días (por defecto 0).
       - Selector «Prorrateo de fracción de mes»: opciones «Días calendario reales» (`DIAS_REALES`) y «Mes comercial de 30 días» (`MES_30`).
       - Selector «Primer periodo incompleto»: opciones «Documento inicial separado» (`SEPARADO`) y «Unir al siguiente periodo» (`JUNTO_AL_SIGUIENTE`).
     - **Vencimiento y corte:**
       - Selector «Modo de fecha de corte»:
         - «Corte en día fijo del ciclo» (`DIA_FIJO_CICLO`).
         - «Corte por plazo de pago más gracia» (`VENCIMIENTO_MAS_GRACIA`).
       - **Regla dura de incompatibilidad (CA-FAC-02):** Si el operador selecciona «Cobro al final del periodo», la opción «Corte en día fijo del ciclo» aparece **deshabilitada con explicación visible**:
         > _«El corte en día fijo solo es compatible con cobro anticipado, porque en cobro vencido el corte ocurriría antes de emitir el cobro. Utilice corte por plazo de pago más gracia.»_
       - Campo «Plazo para pagar»: de 0 a 60 días (solo editable en modo plazo más gracia; en día fijo se informa como día anterior al corte).
       - Campo «Días de gracia tras vencimiento»: de 0 a 30 días. Con 0 días, el corte se programa al día siguiente del vencimiento.
       - Casilla «Habilitar corte programado»: activa/desactiva la inclusión de contratos con deuda en la agenda de corte.
       - Campo «Monto mínimo impago para corte»: valor numérico en COP (por defecto $0).
     - **Automatización y emisión:**
       - Casilla «Generación automática diaria»: interruptor sí/no (por defecto apagado en Fase 01, D-BIL-5).
       - Selector «Aprobación de documentos generados»: «En borrador (revisión manual obligatoria)» (`BORRADOR`) o «Aprobación automática (emisión directa)» (`AUTOMATICA`).
       - Selector «Hora de ejecución del proceso diario»: selector de hora 00:00 a 23:00 en hora local de Colombia.
       - Casilla «Aplicación automática de saldo a favor»: aplicar saldo remanente a nuevos documentos al emitir (`autoApplyCredit`).
       - Campo «Prefijo de documentos de cobro»: texto de 1 a 10 caracteres (por defecto `DC`).
     - **Panel de vista previa en tiempo real (RF-FAC-04):**
       - Ubicado en el lateral derecho (desktop) o al pie del formulario (móvil).
       - Consume `POST /billing/policy/preview` (HLD v1.1, RS-10) enviando la configuración actual del formulario.
       - Muestra las próximas 3 fechas calculadas por el servidor para cada ciclo activo del catálogo (hoy, 1 y 15):
         - _Periodo de cobertura_ (`YYYY-MM-DD` a `YYYY-MM-DD`).
         - _Fecha de generación_.
         - _Fecha límite de pago (Vencimiento)_.
         - _Fecha programada de corte_.
       - Nota visible: «Fechas calculadas según la zona horaria configurada para esta empresa».
  3. **Control de concurrencia y guardado:**
     - El formulario envía `expectedUpdatedAt`. Si otro operador modificó la política en paralelo, la API responde 409 `BILLING_POLICY_CHANGED`.
     - El portal muestra un `PortalAlert` ámbar: «La política fue modificada recientemente por otro usuario. Se recargaron los valores más recientes para evitar sobrescrituras».

---

### Flujo 2: Revisar, emitir y descargar documentos de cobro

- **Ubicación:** Portal → Facturación → Documentos (`/dashboard/billing/documents`).
- **Permisos requeridos:** `billing.invoices.read` para ver; `billing.invoices.manage` para generar, emitir o anular.
- **Estructura de pantalla:**
  1. `PageHeader` con título «Documentos de cobro», contador total y botón «Generar documentos» (abre modal para corrida manual inmediata por fecha o contrato).
  2. Barra de filtros: estado del documento (`Todos`, `Borrador`, `Emitido`, `Anulado`), estado de pago (`Todos`, `Pendiente`, `Pago parcial`, `Pagado`, `Vencido`), selector de ciclo (`Día 1`, `Día 15`), buscador de suscriptor y rango de fechas.
  3. Tabla operativa paginada en servidor; filtros, página, tamaño de página y orden quedan en la URL para conservar el contexto al volver atrás:
     - Checkbox de selección múltiple (para emisión en lote de borradores).
     - Número de documento (ej. `DC-000104`; en borradores se muestra «Sin número» en texto neutral tenue).
     - Suscriptor / Titular (si está bloqueado, se aplican las reglas de custodia legal del apartado 4).
     - Periodo cubierto (`YYYY-MM-DD` al `YYYY-MM-DD`).
     - Fecha de vencimiento.
     - Total en COP.
     - Saldo pendiente.
     - Píldora de estado del documento (`Borrador` [gris neutro], `Emitido` [azul sobrio], `Anulado` [rojo tenue]).
     - Píldora de estado de pago (`Pagado`, `Pendiente`, `Vencido`, `Parcial`).
     - Menú de acciones por fila: «Ver detalle» (abre un panel lateral desde la fila, patrón side peek de Firma iWana), «Emitir» (si es borrador no bloqueado), «Descargar PDF» (si está emitido), «Anular documento» (si está emitido).
  4. **Tratamiento de borradores bloqueados (`blocking_reason`):**
     - Si un documento en borrador tiene `blocking_reason`, la fila muestra una advertencia visible y el checkbox de selección queda deshabilitado:
       - `SIN_PRECIO`: _«Falta tarifa vigente en el catálogo comercial»_.
       - `SIN_TRATAMIENTO_IVA`: _«El punto de servicio no tiene régimen de IVA resoluble»_.
       - `SIN_DATOS_FISCALES`: _«Datos del suscriptor incompletos para facturar»_.
       - Un contrato sin ciclo no genera documento (HLD v1.1, RS-20): aparece solo en el resumen de la generación, como «{n} contratos sin día de ciclo asignado».
     - El botón de emisión masiva ignora los documentos bloqueados y advierte: _«Se emitirán {n} borradores válidos. {m} borradores tienen datos incompletos y deben corregirse»_.
     - **Adicionales sin cobrar (HLD v1.1, RS-12):** si `unbilledAdditionalCount` es mayor que 0, el detalle del documento y la pestaña «Facturación» de la ficha muestran un aviso neutro: _«Este contrato tiene {n} adicionales que todavía no se cobran en este documento»_. No deshabilita la emisión y no aparece en el PDF.
  5. **Emisión en lote:**
     - Al seleccionar hasta 100 borradores, se activa la barra de acción flotante: «Emitir {n} documentos seleccionados».
     - Diálogo de confirmación accesible que resume el monto total y confirma que los documentos adquirirán consecutivos definitivos e inmutables.
  6. **Visualización y descarga PDF:**
     - Acción «Descargar PDF» consume `GET /billing/documents/:id/pdf`.
     - El PDF renderizado contiene encabezado con datos del emisor, datos del adquirente, desglose de líneas del plan y de prorrateo, liquidación de IVA discriminada por línea, y la leyenda visible obligatoria al pie:
       > _«Documento interno: no es factura electrónica de venta»_

---

### Flujo 3: Anulación de documentos y pagos

- **Modal de anulación de documento:**
  - Invoca `POST /billing/documents/:id/void`.
  - Título: «Anular documento de cobro {número}».
  - Mensaje de advertencia: «Al anular este documento, su consecutivo no podrá reutilizarse y quedará registrado en el historial contable. Cualquier pago aplicado volverá al saldo a favor del suscriptor».
  - Selector obligatorio «Motivo de anulación»:
    - «Error en el valor facturado» (`ERROR_DE_VALOR`)
    - «Error en los datos del adquirente» (`ERROR_DE_ADQUIRENTE`)
    - «Documento duplicado» (`DUPLICADO`)
    - «Servicio no prestado» (`SERVICIO_NO_PRESTADO`)
    - **«Suplantación de identidad (falsedad personal - Ley 2573)»** (`SUPLANTACION`)
  - Campo «Observación o nota adicional»: texto libre de hasta 500 caracteres.
  - Botón de confirmación destructivo: «Confirmar anulación».
- **Modal de anulación de pago:**
  - Invoca `POST /billing/payments/:id/void`.
  - Selector obligatorio «Motivo de anulación»:
    - «Error de captura en el registro» (`ERROR_DE_REGISTRO`)
    - «Pago rechazado por entidad bancaria» (`PAGO_RECHAZADO`)
    - «Registro de pago duplicado» (`DUPLICADO`)
  - Advertencia visible: «Las aplicaciones sobre documentos se revertirán de forma inmediata y el saldo de las facturas volverá a estar pendiente o vencido».

---

### Flujo 4: Registro y aplicación de pago con sugerencia FIFO

- **Ubicación:** Botón «Registrar pago» en `/dashboard/billing/payments` o dentro de la pestaña «Facturación» de la ficha del suscriptor.
- **Permisos requeridos:** `billing.payments.register` (exclusivo para perfiles `ADMIN` y `ACCOUNTANT` en Fase 01, según D-BIL-11).
- **Formulario de captura:**
  1. Suscriptor: preseleccionado si se abre desde la ficha; o buscador de suscriptores si se abre desde la lista general de pagos.
  2. Método de pago: selector de catálogo cerrado:
     - `EFECTIVO` («Efectivo»)
     - `TRANSFERENCIA` («Transferencia bancaria»)
     - `CONSIGNACION` («Consignación bancaria»)
     - `DATAFONO` («Datáfono / Tarjeta»)
     - `OTRO` («Otro medio»)
  3. Monto del pago: campo numérico en COP con formateo dinámico de miles (ej. `$ 85.000`).
  4. Fecha del pago: selector de fecha civil (por defecto hoy en hora local del ISP).
  5. Referencia y Notas: campos de texto opcionales (código de comprobante, observaciones).
  6. **Sección de Aplicación a Documentos (Sugerencia FIFO):**
     - Lista los documentos emitidos del suscriptor con saldo impago, ordenados por fecha de vencimiento ascendente (los más antiguos primero).
     - Casilla «Distribuir automáticamente (los más antiguos primero)»: habilitada por defecto. Al ingresar el monto, reparte de arriba a abajo cubriendo totales.
     - El operador puede desactivar la casilla automática y ajustar manualmente el monto aplicado a cada documento mediante inputs dedicados.
     - Indicador dinámico de distribución:
       - _Total pago:_ `$ 120.000 COP`
       - _Total aplicado:_ `$ 95.000 COP`
       - _Remanente a saldo a favor:_ `$ 25.000 COP` (se explica: «Este monto quedará como saldo a favor en la cuenta del suscriptor y podrá aplicarse a futuros cobros»).
  7. **Cabecera de idempotencia:** La mutación genera un identificador único de operación (`Idempotency-Key`). El botón de envío muestra estado de carga y se bloquea contra doble clic para evitar cobros dobles en conexiones lentas.
  8. **Manejo de reglas de privacidad (RS-6):**
     - Si el suscriptor está **anonimizado**: la API retorna 409 `PRIVACY_TITULAR_ANONYMIZED`. El diálogo muestra un `PortalAlert` rojo: _«No es posible registrar pagos para una cuenta anonimizada»_.
     - Si el suscriptor está **bloqueado (`DATOS_BLOQUEADOS`)**: la operación **procede normalmente** (el pago no modifica datos personales y permite el saneamiento de cartera). Si el formulario se abre desde la ficha, registra el pago con el suscriptor ya seleccionado, sin pedir ni revelar el adquirente.

---

### Flujo 5: Ficha 360 del suscriptor — Pestaña «Facturación»

- **Ubicación:** Portal → Suscriptores → Detalle del suscriptor (`/dashboard/crm/subscribers/:id`) → Pestaña «Facturación».
- **Estructura visual:**
  1. **Tarjetas métricas superiores:**
     - _Total facturado histórico_
     - _Total pagado histórico_
     - _Deuda pendiente actual_ (destacada en par tonal neutral/ámbar si hay vencimiento)
     - _Saldo a favor disponible_ (destacado en verde lima si es > 0)
  2. **Acciones de cabecera:**
     - Botón primario «Registrar pago» (condicionado a permiso `billing.payments.register`).
     - Botón secundario «Aplicar saldo a favor» (solo activo si hay saldo a favor > 0 y documentos con saldo pendiente).
  3. **Listado de documentos del suscriptor:** tabla paginada con fecha, número, periodo cubierto, valor total, saldo pendiente, estado y acciones («Descargar PDF», «Ver detalle», «Anular»).
  4. **Listado de pagos recibidos:** tabla con fecha, método, referencia, monto recibido, monto aplicado, remanente y acción de «Anular pago».
  5. **Resumen por contrato:** si el suscriptor tiene múltiples contratos o sedes, desglose de deuda por servicio activo con su ciclo de facturación correspondiente.

---

## 4. Reglas especiales de custodia y privacidad

### 4.1 Titular bloqueado (`DATOS_BLOQUEADOS` / RS-6)

- **Ocultamiento sin permiso:** Cuando un suscriptor tiene sus datos bloqueados por ejercicio de derechos de privacidad, las vistas de facturación (listas de documentos, detalle, estados de cuenta y descargas de PDF) **ocultan el adquirente completo** a quien no tenga permiso: el nombre y todos los campos personales guardados en `buyer_snapshot`, incluidos tipo y número de documento y dirección.
- **Enmascaramiento visual:** El campo del adquirente muestra `[Dato protegido por custodia legal]`; los campos personales del snapshot no se muestran ni quedan disponibles en el PDF descargado.
- **Banner explicativo:** Se expone un aviso institucional discreto:
  > _«Los datos personales del titular se encuentran bajo custodia restringida por solicitud de privacidad. Los movimientos contables y saldos permanecen auditables.»_
- **Acceso auditado (HLD v1.1, RS-21):** Con el permiso `crm.blocked_data.read` o `privacy.read`, los datos se muestran directamente, igual que en la ficha de CRM, sin botón adicional, y el backend registra la auditoría antes de responder. Si el servicio de auditoría no está disponible, la respuesta es 503 y la interfaz muestra: _«No fue posible auditar la consulta de datos protegidos. Por seguridad, la información permanece oculta»_.

### 4.2 Suplantación de identidad (Ley 2573 de 2022 / RS-7)

- **Suspensión inmediata de cobro:** Si el titular tiene registrada la marca activa `VICTIMA_FALSEDAD_PERSONAL` o el contrato se encuentra suspendido con motivo `SUPLANTACION`:
  - El generador diario de Billing omite automáticamente la emisión de nuevos documentos para ese contrato.
  - En la ficha del suscriptor, la pestaña Facturación exhibe una alerta informativa:
    > _«Cobro suspendido preventivamente por investigación de suplantación de identidad (Ley 2573 de 2022). No se generarán nuevos cobros hasta resolución.»_
  - Los documentos emitidos antes de la denuncia pueden anularse manualmente seleccionando el motivo **«Suplantación de identidad»** (`SUPLANTACION`).

---

## 5. Agenda de corte (`CutoffAgendaClient.tsx`)

La agenda de corte existente en `/dashboard/crm/subscribers/agenda-corte` se enriquece incorporando la columna **«Estado de pago»**:

- Consume el campo `paymentState` de la respuesta de la agenda (`CutoffAgendaResponse`).
- Píldoras de estado visualmente estandarizadas:
  - `PAGADO`: Píldora tonal de éxito según los tokens aprobados. Indica que el periodo está cubierto al 100%; la señal informa el pago y no ejecuta ni cambia el estado del servicio.
  - `PARCIAL`: Píldora informativa con etiqueta «Pago parcial» y un nombre accesible que comunica el saldo: «Pagado $X de $Y».
  - `PENDIENTE`: Píldora neutra con etiqueta «Pendiente». El cobro sigue dentro del plazo de pago.
  - `VENCIDO`: Píldora de advertencia con etiqueta «Vencido». La fecha local de la empresa superó el vencimiento y no se cubrió el saldo; este dato no automatiza una suspensión.
  - `SIN_DOCUMENTO`: Píldora neutra de menor énfasis con etiqueta «Sin documento».

---

## 6. Estados de interfaz transversales

| Estado                            | Patrón de diseño       | Copy visible y comportamiento                                                                                                                                                                                                                                 |
| --------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Carga inicial**                 | `PortalSkeletonBlock`  | Skeleton con la forma del contenido que conserva el espacio de las tarjetas métricas y las filas de la tabla; respeta `prefers-reduced-motion`.                                                                                                               |
| **Primera visita sin documentos** | `PortalEmptyState`     | Título: «Aún no hay documentos de cobro». Mensaje: «Los documentos aparecerán aquí cuando generes el primero o se ejecute el proceso diario». Acción «Generar documentos» solo si el perfil tiene permiso; ilustración ligera de primera vez, sin fondo lima. |
| **Sin resultados**                | `PortalEmptyState`     | Título: «No encontramos documentos con estos filtros». Acción «Limpiar filtros» restaura los filtros de la URL sin perder el acceso a la tabla.                                                                                                               |
| **Error de carga**                | `PortalAlert`          | Alerta de error con texto y acción. «No pudimos cargar la información de facturación». Incluye botón «Reintentar».                                                                                                                                            |
| **Borrador bloqueado**            | Píldora ámbar en tabla | Muestra el motivo exacto (`blocking_reason`) en lenguaje entendible. Deshabilita el botón «Emitir» y explica el campo faltante en el tooltip.                                                                                                                 |
| **Sin permisos**                  | `PagePermissionGate`   | Icono y texto, sin depender solo del color. «No tienes acceso para consultar o gestionar esta información. Solicita acceso a una persona administradora». Las acciones que el perfil no puede realizar no se muestran como disponibles.                       |

---

## 7. Criterios de aceptación de experiencia (CA-UX-FAC-nn)

- **CA-UX-FAC-01:** La pantalla de configuración de política muestra la opción «Corte en día fijo del ciclo» deshabilitada con texto explicativo cuando se selecciona «Cobro al final del periodo».
- **CA-UX-FAC-02:** La vista previa de fechas de la política actualiza las próximas 3 fechas consumiendo la API del servidor; no realiza cálculos de calendario en el navegador.
- **CA-UX-FAC-03:** Ante un conflicto de guardado 409 (`BILLING_POLICY_CHANGED`), el formulario no pierde los datos del operador, muestra un `PortalAlert` explicativo y ofrece refrescar los valores vigentes.
- **CA-UX-FAC-04:** La tabla de documentos permite filtrar por estado del documento, estado de pago, ciclo y suscriptor, conservando los parámetros en la URL.
- **CA-UX-FAC-05:** Los borradores con `blocking_reason` impiden su emisión individual o en lote, desplegando el motivo en lenguaje amigable para el operador.
- **CA-UX-FAC-06:** La emisión en lote soporta seleccionar hasta 100 documentos válidos y presenta un modal de confirmación con el valor total a emitir.
- **CA-UX-FAC-07:** Todo documento emitido permite la descarga de su representación PDF con la leyenda legal obligatoria de D-BIL-2 visible en el pie de página.
- **CA-UX-FAC-08:** El modal de anulación de documentos incluye obligatoriamente el motivo `SUPLANTACION` con la etiqueta «Suplantación de identidad (falsedad personal - Ley 2573)».
- **CA-UX-FAC-09:** El formulario de registro de pago distribuye el valor recibido aplicando sugerencia FIFO sobre los documentos vencidos más antiguos primero, permitiendo ajuste manual.
- **CA-UX-FAC-10:** Si el monto del pago supera la deuda pendiente, el remanente se clasifica y etiqueta claramente como «Saldo a favor».
- **CA-UX-FAC-11:** Toda mutación de pago y emisión envía una cabecera de idempotencia y deshabilita su disparador ante el primer clic para prevenir registros duplicados.
- **CA-UX-FAC-12:** La pestaña de facturación en la ficha del suscriptor presenta tarjetas consolidadas de total facturado, total pagado, deuda pendiente y saldo a favor.
- **CA-UX-FAC-13:** En listas, detalle, estado de cuenta y PDF de un titular con datos bloqueados (`DATOS_BLOQUEADOS`), el nombre y el `buyer_snapshot` completo (tipo y número de documento, dirección y demás datos personales del adquirente) aparecen ocultos sin permiso. Con `crm.blocked_data.read` o `privacy.read` se muestran directamente; cada lectura queda auditada antes de mostrarse y, si la auditoría no está disponible, los datos siguen ocultos.
- **CA-UX-FAC-14:** La agenda de corte exhibe la columna «Estado de pago» con las píldoras semánticas `PAGADO`, `PARCIAL`, `PENDIENTE`, `VENCIDO` y `SIN_DOCUMENTO`.
- **CA-UX-FAC-15:** Todo control de cada flujo es operable por teclado, tiene foco visible y target de al menos 44 px; texto y estado se entienden sin depender solo del color, respeta `prefers-reduced-motion` y cumple WCAG 2.2 AA.
- **CA-UX-FAC-16:** Ningún elemento visual expone nombres de enums crudos, tablas de base de datos ni términos de arquitectura interna.
- **CA-UX-FAC-17:** Con cero documentos y sin filtros, se muestra el estado de primera visita con «Generar documentos» solo si hay permiso; con filtros sin coincidencias, se ofrece «Limpiar filtros» y la URL vuelve al listado sin filtros.
