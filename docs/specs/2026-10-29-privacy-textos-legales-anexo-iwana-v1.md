# Anexo — Textos legales fuente de Iwana S.A.S. (tenant piloto)

**Versión:** 1.0
**Estado:** Política: texto del responsable, listo para publicar · Aviso y Autorización: **⚠ borrador pendiente de aprobación del ISP y de dictamen jurídico (ADR-094 §7 punto 3)**
**Fecha:** 2026-10-29
**Emitido por:** AI-EM-ARCH, a partir de la Política de Tratamiento v1 entregada por el CTO (vigente desde el 21-oct-2026, publicada en https://iwana.co/privacidad/)
**Spec madre:** [`2026-10-29-privacy-textos-legales.md`](2026-10-29-privacy-textos-legales.md) v1.0

## Cómo se usa este anexo

1. Cada bloque `TEXTO PUBLICABLE` contiene **exactamente** el `content` que se publica: todo lo que está entre las cercas de cuatro acentos graves, sin ellas. Un solo carácter de diferencia cambia la huella.
2. Se publica con `POST /privacy/legal-texts` en el tenant de Iwana, con los valores de `type`, `version`, `format` y `url` de la ficha de cada bloque (runbook de release por tenant, Paso 7 ampliado).
3. **Orden obligatorio:** primero la Política, después el Aviso y por último la Autorización. La Autorización remite a las otras dos.
4. Antes de publicar, en el mismo tenant se desactivan `DATOS_BIOMETRICOS` y `REPORTE_CENTRALES_RIESGO` en «Finalidades que declara tu política» (spec C3). La política no las declara (§7.3 y §8).
5. Ningún bloque contiene datos de titulares. Los datos del responsable son públicos (razón social, NIT, domicilio y canales de atención).

**Normalización aplicada a la Política** (equivalencia de contenido, no de bytes, con el PDF del sitio):
- Se unieron las dos partes de la tabla 7.1, que el salto de página había separado.
- Se quitaron las líneas en blanco dobles y los cortes de párrafo partidos («La solicitud debe / indicar…»).
- Los títulos pasaron a `#`, `##` y `###`.

No se cambió ninguna palabra.

---

## A. POLITICA_TRATAMIENTO

| Campo | Valor |
| --- | --- |
| `type` | `POLITICA_TRATAMIENTO` |
| `version` | `1 (2026-10-21)` |
| `format` | `MARKDOWN` |
| `url` | `https://iwana.co/privacidad/` |
| Estado | Texto aprobado por el responsable y publicado en su sitio |

### TEXTO PUBLICABLE

````markdown
# Política de tratamiento de datos personales

**IWANA S.A.S. · NIT 901.870.583-2**

Versión 1 · Vigente desde el 21 de octubre de 2026

## 1. Presentación y objeto

Iwana S.A.S. presta el servicio de acceso a internet por fibra óptica y radioenlace en la provincia del Tequendama, Cundinamarca. Para hacerlo necesita conocer y usar algunos datos personales de sus clientes, de las personas que se interesan en el servicio, de su equipo de trabajo y de sus proveedores.

Esta política explica qué datos personales trata Iwana S.A.S., para qué los usa, con quién los comparte, cómo los protege y cómo pueden los titulares ejercer sus derechos. Desarrolla el derecho de todas las personas a conocer, actualizar y rectificar la información que se haya recogido sobre ellas, consagrado en el artículo 15 de la Constitución Política.

## 2. Responsable del tratamiento

| Dato | Información |
| --- | --- |
| Razón social | Iwana S.A.S. |
| NIT | 901.870.583-2 |
| Domicilio | Calle 86 C Bis # 110 C 18, Bogotá D.C. |
| Correo electrónico | info@iwana.co |
| Teléfono (PBX) | (601) 495 4488 |
| WhatsApp oficial | 311 284 0141 |
| Sitio web | https://iwana.co |

Puntos de atención al público (Cundinamarca): El Colegio, Carrera 7 # 8-55; San Antonio del Tequendama, Carrera 5 # 4A-01, piso 2; y Tena, IPM, Calle 2, vía Tena / La Gran Vía # 5-76.

## 3. Marco normativo

Esta política se adopta en cumplimiento de las siguientes normas y de las que las modifiquen, adicionen o sustituyan:

- Artículo 15 de la Constitución Política de Colombia.
- Ley 1581 de 2012, por la cual se dictan disposiciones generales para la protección de datos personales.
- Decreto 1377 de 2013, compilado en el Decreto 1074 de 2015, Decreto Único Reglamentario del Sector Comercio, Industria y Turismo.
- Título V de la Circular Única de la Superintendencia de Industria y Comercio, sobre protección de datos personales.
- Ley 2300 de 2023, que protege a los consumidores frente a los contactos para fines comerciales y de cobranza.
- Ley 1266 de 2008, modificada por la Ley 2157 de 2021, en lo que resulte aplicable.
- Régimen de protección de los derechos de los usuarios de servicios de comunicaciones de la Comisión de Regulación de Comunicaciones (Resolución CRC 5050 de 2016 y sus modificaciones).

## 4. Ámbito de aplicación

Esta política se aplica a todos los datos personales registrados en las bases de datos de Iwana S.A.S., cualquiera que sea su forma: física, digital o sonora. Es de obligatorio cumplimiento para Iwana S.A.S. como responsable del tratamiento, para sus empleados y contratistas, y para los encargados que traten datos personales por cuenta de Iwana S.A.S.

## 5. Definiciones

Los términos de esta política tienen el sentido que les dan la Ley 1581 de 2012 y el Decreto 1377 de 2013:

- Titular: persona natural cuyos datos personales se tratan.
- Dato personal: información vinculada o que puede asociarse a una persona natural determinada o determinable.
- Dato público: el que no es semiprivado, privado ni sensible, como los relativos al estado civil de las personas o a su profesión u oficio.
- Dato semiprivado: el que no es íntimo ni público y cuyo conocimiento puede interesar a cierto sector o a la sociedad, como el dato financiero y crediticio.
- Dato privado: el que por su naturaleza íntima o reservada solo es relevante para el titular.
- Dato sensible: el que afecta la intimidad del titular o cuyo uso indebido puede generar discriminación, como los que revelan el origen racial o étnico, la orientación política, las convicciones religiosas, la pertenencia a sindicatos, la salud, la vida sexual o los datos biométricos.
- Autorización: consentimiento previo, expreso e informado del titular para el tratamiento de sus datos.
- Base de datos: conjunto organizado de datos personales que es objeto de tratamiento.
- Tratamiento: cualquier operación sobre datos personales, como la recolección, el almacenamiento, el uso, la circulación o la supresión.
- Responsable del tratamiento: quien decide sobre la base de datos y el tratamiento; en esta política, Iwana S.A.S.
- Encargado del tratamiento: quien trata datos personales por cuenta del responsable.
- Transmisión: comunicación de datos a un encargado, dentro o fuera de Colombia, para que los trate por cuenta del responsable.
- Transferencia: envío de datos a otro responsable, dentro o fuera de Colombia.
- Consulta: solicitud del titular para conocer la información que reposa sobre él en una base de datos.
- Reclamo: solicitud del titular para corregir, actualizar o suprimir sus datos, o para denunciar un presunto incumplimiento de la ley.
- Aviso de privacidad: comunicación que informa al titular que existe esta política, cómo consultarla y para qué se usarán sus datos.

## 6. Principios del tratamiento

Iwana S.A.S. aplica en todo tratamiento los principios del artículo 4 de la Ley 1581 de 2012:

- Legalidad: el tratamiento es una actividad reglada que se sujeta a la ley.
- Finalidad: solo tratamos datos para las finalidades de la sección 7, que son legítimas y se informan al titular.
- Libertad: tratamos datos con autorización previa, expresa e informada, salvo las excepciones de la ley.
- Veracidad y calidad: procuramos que los datos sean completos, exactos, actualizados y comprensibles.
- Transparencia: el titular puede saber en cualquier momento qué datos suyos tenemos.
- Acceso y circulación restringida: solo acceden a los datos las personas que los necesitan para cumplir su función. No vendemos ni cedemos datos personales.
- Seguridad: aplicamos las medidas de la sección 14.
- Confidencialidad: quienes tratan datos personales guardan reserva sobre ellos, incluso después de terminar su relación con Iwana S.A.S.

Además, solo recogemos los datos mínimos necesarios para cada finalidad y los suprimimos de forma segura cuando dejan de ser necesarios, salvo que la ley obligue a conservarlos.

## 7. Datos que tratamos y finalidades

### 7.1. Bases de datos

| Base de datos | Datos que tratamos | Finalidades |
| --- | --- | --- |
| Clientes (suscriptores del servicio) | Nombre, documento de identidad, teléfono, correo, dirección y ubicación del predio, municipio o vereda, plan contratado, tecnología instalada, historial de facturación y pagos, solicitudes de soporte y sus conversaciones, y los datos técnicos del servicio de la sección 7.2. | Celebrar y ejecutar el contrato; hacer la visita de viabilidad y la instalación; facturar y aplicar los pagos; dar soporte técnico y atender peticiones, quejas y recursos; informar sobre el servicio, los mantenimientos y los cambios del contrato; cumplir las obligaciones legales, contables, tributarias y regulatorias del sector de telecomunicaciones. |
| Interesados (personas que piden información o el servicio) | Nombre, teléfono, municipio o vereda, dirección del predio y el motivo de su mensaje. | Responder la solicitud; revisar la cobertura y agendar la visita de viabilidad; con una autorización aparte, enviar información comercial de Iwana S.A.S. |
| Empleados, contratistas y aspirantes | Datos de identificación y contacto, hoja de vida, formación, experiencia, referencias, afiliaciones a seguridad social, datos bancarios para el pago, contacto en caso de emergencia y los datos sensibles de la sección 8. | Seleccionar personal; administrar la relación laboral o contractual; pagar salarios y honorarios; afiliar a la seguridad social; cumplir la ley laboral y de seguridad y salud en el trabajo. |
| Proveedores | Razón social o nombre, documento o NIT, datos de la persona de contacto, datos bancarios y tributarios. | Contratar bienes y servicios; pagar; cumplir las obligaciones contables y tributarias. |

### 7.2. Datos técnicos del servicio

Para prestar el servicio de internet, Iwana S.A.S. trata datos técnicos de la conexión de cada cliente, como la dirección IP asignada, los identificadores y el estado del equipo instalado, y los registros de disponibilidad y consumo de la conexión. Los usa solo para operar, mantener y proteger la red, atender fallas, medir la calidad del servicio y cumplir las obligaciones regulatorias y las órdenes de autoridad competente.

Iwana S.A.S. respeta la inviolabilidad de las comunicaciones: no conoce, intercepta ni revela el contenido de las comunicaciones de sus clientes, salvo orden escrita de autoridad judicial competente en los casos que prevé la ley.

### 7.3. Datos que no tratamos

Iwana S.A.S. no recoge datos de origen racial o étnico, orientación política, convicciones religiosas, salud ni vida sexual de sus clientes, ni consultas antecedentes de sus clientes en bases de datos internacionales o en redes sociales.

Centrales de riesgo: Iwana S.A.S. no consulta ni reporta información de sus clientes a centrales de riesgo. Si en el futuro decide hacerlo, pedirá una autorización previa y separada, y hará la comunicación previa al reporte que exige la Ley 1266 de 2008.

### 7.4. Mensajes comerciales y de cobranza

Iwana S.A.S. solo envía información comercial a quien lo haya autorizado. Los contactos con fines comerciales o de cobranza se hacen por los canales que el titular haya autorizado y respetando los horarios y la frecuencia que fija la Ley 2300 de 2023.

## 8. Datos sensibles y datos de niños, niñas y adolescentes

Iwana S.A.S. solo trata datos sensibles de sus empleados y contratistas, nunca de sus clientes. Ningún titular está obligado a entregar datos sensibles ni datos de menores de edad, ni a autorizar su tratamiento.

- Salud: de empleados y contratistas, solo para la seguridad social, las incapacidades y el sistema de gestión de seguridad y salud en el trabajo.
- Niños, niñas y adolescentes: solo datos de hijos de empleados, para afiliarlos a la seguridad social y a beneficios, con autorización de su representante, respetando su interés superior y sus derechos fundamentales.

Para tratar datos sensibles se pide una autorización explícita, que informa al titular para qué se usarán y que puede negarse a darla.

## 9. Autorización del titular

Iwana S.A.S. pide la autorización antes de tratar los datos y conserva prueba de que la obtuvo. Navegar por el sitio web no constituye autorización.

- Cómo se obtiene: por escrito, en el contrato de servicio o en el formato de la visita de viabilidad, o por medios electrónicos o verbales que permitan conservar la prueba, como un mensaje del titular por WhatsApp o correo electrónico.
- Qué se informa al pedirla: el tratamiento y su finalidad; el carácter facultativo de las respuestas sobre datos sensibles o de menores; los derechos del titular; y los datos de contacto del responsable.
- Mensajes comerciales: se piden con una autorización aparte, que el titular puede retirar en cualquier momento.
- Cuándo no se necesita: en los casos del artículo 10 de la Ley 1581 de 2012, como los datos de naturaleza pública, la información requerida por una autoridad en ejercicio de sus funciones o los casos de urgencia médica o sanitaria.

## 10. Transmisión y transferencia de datos

Iwana S.A.S. solo comparte datos personales con los siguientes terceros, para la finalidad indicada, y nunca los vende ni los cede para fines comerciales de otros:

| Tercero | Qué recibe | Para qué | Calidad |
| --- | --- | --- | --- |
| Banco Davivienda (portal de pagos PSE y tarjeta de crédito) | Número de identificación del titular, factura, valor y los datos que el cliente escribe en el portal. | Recaudar el pago del servicio. | Responsable de sus propios datos. Iwana S.A.S. no ve ni guarda datos bancarios. |
| WhatsApp (Meta Platforms) | Número de teléfono y mensajes que el titular escribe. | Atender solicitudes y dar soporte. | Proveedor de la plataforma de mensajería; sus servidores están fuera de Colombia. |
| Hostinger (alojamiento del sitio iwana.co) | Dirección IP, fecha y hora, página visitada y navegador. | Servir el sitio web y protegerlo. | Encargado; servidores en Estados Unidos. |
| Ookla (medidor de velocidad) | Dirección IP y datos de la medición, solo si el visitante inicia el test. | Medir la velocidad de la conexión. | Responsable de sus propios datos. |
| Google Maps (enlaces «Cómo llegar») | Dirección IP, solo si el visitante abre el enlace. | Mostrar la ruta a la sede. | Responsable de sus propios datos. |
| Proveedores de servicios contables, de facturación electrónica y de nómina | Los datos de la base de datos que corresponda. | Llevar la contabilidad, facturar y pagar la nómina. | Encargados. |
| Autoridades | Lo que pidan en ejercicio de sus funciones. | Cumplir la ley y las órdenes judiciales. | Según la ley. |

Antes de transmitir datos a un encargado, Iwana S.A.S. verifica que ofrezca condiciones adecuadas de seguridad y suscribe con él un contrato de transmisión que lo obliga a cumplir esta política, en los términos del artículo 25 del Decreto 1377 de 2013. Las transferencias y transmisiones internacionales solo se hacen a países que ofrecen un nivel adecuado de protección según la Superintendencia de Industria y Comercio, o en los casos que permite el artículo 26 de la Ley 1581 de 2012.

## 11. Derechos de los titulares

El titular tiene los derechos del artículo 8 de la Ley 1581 de 2012, y su ejercicio es gratuito:

- Conocer, actualizar y rectificar sus datos personales.
- Pedir prueba de la autorización que dio.
- Ser informado, si lo pide, del uso que se ha dado a sus datos.
- Revocar la autorización y pedir la supresión de sus datos, salvo que exista un deber legal o contractual de conservarlos.
- Acceder gratis a sus datos, al menos una vez al mes y cada vez que esta política cambie de forma sustancial.
- Abstenerse de responder preguntas sobre datos sensibles o sobre datos de niños, niñas y adolescentes.
- Presentar quejas ante la Superintendencia de Industria y Comercio, después de haber agotado el trámite de consulta o reclamo ante Iwana S.A.S.

Pueden ejercer estos derechos el titular, acreditando su identidad; sus causahabientes; su representante o apoderado; o quien haya estipulado a favor de otro o para otro.

## 12. Deberes de Iwana S.A.S. y de los encargados

Como responsable del tratamiento, Iwana S.A.S. cumple los deberes del artículo 17 de la Ley 1581 de 2012. Entre ellos:

- Garantizar al titular, en todo tiempo, el pleno y efectivo ejercicio del derecho de hábeas data.
- Pedir y conservar copia de la autorización otorgada por el titular.
- Informar al titular la finalidad de la recolección y los derechos que le asisten.
- Conservar la información con las condiciones de seguridad necesarias para impedir su adulteración, pérdida, consulta, uso o acceso no autorizado o fraudulento.
- Actualizar y rectificar la información, y comunicar las novedades a los encargados.
- Entregar a los encargados solo datos cuyo tratamiento esté autorizado, y exigirles el respeto de las condiciones de seguridad y privacidad.
- Tramitar las consultas y los reclamos en los términos de la ley, e informar al encargado cuando un dato esté en discusión.
- Informar a la Superintendencia de Industria y Comercio cuando se presenten violaciones a los códigos de seguridad y existan riesgos en la administración de la información de los titulares.
- Cumplir las instrucciones y requerimientos de la Superintendencia de Industria y Comercio.

Los encargados cumplen los deberes del artículo 18 de la misma ley: tratan los datos solo por cuenta de Iwana S.A.S. y para la finalidad contratada; los protegen y guardan reserva sobre ellos; actualizan, rectifican o suprimen la información dentro de los 5 días hábiles siguientes a la solicitud de Iwana S.A.S.; registran las leyendas «reclamo en trámite» e «información en discusión judicial» cuando corresponda; y permiten el acceso solo a las personas autorizadas.

## 13. Procedimiento de consultas y reclamos

El área de servicio al cliente de Iwana S.A.S. atiende las consultas y los reclamos sobre datos personales.

Canales: el correo info@iwana.co; la línea (601) 495 4488; los tres puntos de atención al público; o por escrito, en la oficina de El Colegio, Carrera 7 # 8-55, El Colegio (Cundinamarca). La solicitud debe indicar el nombre y el documento del titular, lo que pide, una dirección o un correo para la respuesta y los documentos que quiera hacer valer.

| Trámite | Para qué | Plazo de respuesta | Prórroga |
| --- | --- | --- | --- |
| Consulta | Conocer qué datos tenemos y cómo los usamos. | 10 días hábiles desde que se recibe. | Hasta 5 días hábiles más, informando el motivo. |
| Reclamo | Corregir, actualizar o suprimir datos, revocar la autorización o denunciar un incumplimiento. | 15 días hábiles desde el día siguiente a su recibo. | Hasta 8 días hábiles más, informando el motivo. |

### Reglas del reclamo (artículo 15 de la Ley 1581 de 2012)

- Si el reclamo está incompleto, pedimos completarlo dentro de los 5 días siguientes a su recibo. Si pasan 2 meses sin que se complete, se entiende que el titular desistió.
- Si Iwana S.A.S. no es competente para resolverlo, lo traslada a quien corresponda en un máximo de 2 días hábiles e informa al titular.
- En un máximo de 2 días hábiles se marca el dato con la leyenda «reclamo en trámite» y el motivo, hasta que se decida.
- La supresión de los datos o la revocatoria de la autorización no proceden cuando el titular tiene un deber legal o contractual de permanecer en la base de datos, por ejemplo mientras el contrato de servicio esté vigente.

Para proteger al titular, antes de entregar o modificar información Iwana S.A.S. verifica la identidad de quien hace la solicitud. Iwana S.A.S. nunca pide contraseñas, claves ni códigos bancarios.

## 14. Seguridad de la información

Iwana S.A.S. aplica medidas humanas, técnicas y administrativas para procurar la confidencialidad, integridad y disponibilidad de los datos y evitar que se adulteren, pierdan, consulten o usen sin autorización, entre ellas:

- Acceso a las bases de datos solo para el personal que lo necesita, con usuario propio.
- Compromiso de confidencialidad en los contratos de empleados, contratistas y encargados.
- Copias de respaldo y equipos protegidos con contraseña.
- Sitio web servido por conexión segura (HTTPS), sin formularios propios y sin cookies propias.
- Atención de los incidentes de seguridad y reporte a la Superintendencia de Industria y Comercio, a través del Registro Nacional de Bases de Datos, cuando la ley lo exija.

### 14.1. Sitio web iwana.co

El sitio web es informativo: no tiene cuentas de usuario, formularios ni cookies propias, y no usa herramientas de analítica ni de publicidad.

- Preferencia de tema: si el visitante elige el modo claro u oscuro, esa preferencia se guarda solo en su navegador y no sale de su equipo.
- Datos técnicos: Hostinger recibe la dirección IP, la fecha y hora, la página visitada y el navegador, en sus registros técnicos de seguridad.
- Test de velocidad: el medidor de Ookla solo se carga cuando el visitante toca «Iniciar medición»; desde ese momento Ookla recibe su dirección IP y los datos de la medición.
- Enlaces externos: WhatsApp, Google Maps, el portal de pagos de Davivienda y los sitios de interés del pie de página se abren fuera del sitio y se rigen por sus propias políticas. El mensaje de WhatsApp va prellenado con un texto fijo, sin datos personales.

## 15. Conservación y supresión de los datos

Los datos personales se conservan mientras dure la finalidad que justificó su recolección y, después, durante el tiempo que exija la ley. En particular:

- Clientes: mientras esté vigente el contrato y, después, durante el término que fijen las normas de telecomunicaciones para la conservación de los datos de suscriptores (Decreto 1704 de 2012, compilado en el Decreto 1078 de 2015) y los plazos para atender reclamaciones.
- Libros y soportes contables: 10 años, según el artículo 28 de la Ley 962 de 2005.
- Empleados y contratistas: durante la relación y, después, el tiempo que exija la ley laboral y de seguridad social.
- Interesados que no contrataron el servicio: hasta atender su solicitud, salvo que hayan autorizado recibir información comercial.

Vencidos esos plazos, los datos se suprimen o se anonimizan de forma segura.

## 16. Cumplimiento interno

- Capacitación: Iwana S.A.S. da a conocer esta política a sus empleados y contratistas, y los capacita en el manejo de los datos personales según su función.
- Supervisión: el área de servicio al cliente coordina la atención de los titulares, y la gerencia verifica periódicamente que esta política se cumpla.
- Reporte de incidentes: cualquier persona del equipo que conozca un evento que comprometa la seguridad de los datos debe informarlo de inmediato.
- Sanciones: el incumplimiento de esta política se sanciona según el reglamento interno de trabajo, el contrato suscrito o la ley, sin perjuicio de las acciones administrativas, civiles o penales que correspondan.

## 17. Modificaciones y vigencia

Esta política rige desde el 21 de octubre de 2026 y está publicada en https://iwana.co/privacidad/.

Iwana S.A.S. puede modificarla. Los cambios sustanciales, en especial los que se refieran a la identificación del responsable o a las finalidades del tratamiento, se publican en el sitio web y se informan a los clientes por correo electrónico o WhatsApp a más tardar al momento de aplicarlos. Si cambian las finalidades del tratamiento, se pide una nueva autorización.

## 18. Historial de versiones

| Versión | Vigente desde | Cambios |
| --- | --- | --- |
| 1 | 21 de octubre de 2026 | Primera versión. |
````

---

## B. AVISO_PRIVACIDAD

| Campo | Valor |
| --- | --- |
| `type` | `AVISO_PRIVACIDAD` |
| `version` | `1` (la fecha real la fija `published_at` al publicar) |
| `format` | `MARKDOWN` |
| `url` | `https://iwana.co/privacidad/` |
| Estado | **⚠ Borrador de AI-EM-ARCH.** Requiere aprobación de Iwana S.A.S. como responsable y dictamen jurídico (ADR-094 §7 punto 3) |

**Trazabilidad** (Decreto 1377 de 2013, compilado en el Decreto 1074 de 2015, contenido mínimo del aviso; requiere verificación con fuente oficial del artículo exacto): responsable y contacto → política §2; tratamiento y finalidades → §7.1–7.4; derechos → §11; mecanismos para conocer la política → §17; canales y plazos → §13.

### TEXTO PUBLICABLE

````markdown
# Aviso de privacidad

**IWANA S.A.S. · NIT 901.870.583-2**

## Quién trata tus datos

Iwana S.A.S., con domicilio en la Calle 86 C Bis # 110 C 18, Bogotá D.C., es la responsable del tratamiento de tus datos personales. Puedes contactarnos en info@iwana.co, en la línea (601) 495 4488 o por WhatsApp al 311 284 0141.

## Para qué usamos tus datos

- **Si eres cliente:** para celebrar y ejecutar el contrato de internet, hacer la visita de viabilidad y la instalación, facturar y aplicar tus pagos, darte soporte técnico, atender tus peticiones, quejas y recursos, informarte sobre el servicio y los mantenimientos, y cumplir las obligaciones legales y regulatorias del sector de telecomunicaciones.
- **Si pediste información o el servicio:** para responder tu solicitud, revisar la cobertura y agendar la visita de viabilidad.
- **Información comercial:** solo si nos das una autorización aparte, que puedes retirar cuando quieras.

No tratamos datos sensibles de nuestros clientes, no consultamos ni reportamos a centrales de riesgo y no vendemos ni cedemos tus datos.

## Tus derechos

Puedes conocer, actualizar y rectificar tus datos; pedir prueba de la autorización que diste; saber cómo los hemos usado; revocar la autorización o pedir que los suprimamos cuando no exista un deber legal o contractual de conservarlos; y presentar quejas ante la Superintendencia de Industria y Comercio después de agotar el trámite con nosotros. No estás obligado a responder preguntas sobre datos sensibles ni sobre datos de niños, niñas y adolescentes.

## Cómo ejercerlos

Escríbenos a info@iwana.co, llama al (601) 495 4488, acércate a nuestros puntos de atención o radica tu solicitud por escrito en la Carrera 7 # 8-55, El Colegio (Cundinamarca). Respondemos las consultas en 10 días hábiles y los reclamos en 15 días hábiles.

## Dónde consultar la política

Nuestra Política de tratamiento de datos personales está publicada en https://iwana.co/privacidad/. Si cambia de forma sustancial, te lo informaremos por correo electrónico o WhatsApp.
````

---

## C. AUTORIZACION

| Campo | Valor |
| --- | --- |
| `type` | `AUTORIZACION` |
| `version` | `1` (la fecha real la fija `published_at` al publicar) |
| `format` | `MARKDOWN` |
| `url` | `https://iwana.co/privacidad/` |
| Estado | **⚠ Borrador de AI-EM-ARCH.** Requiere aprobación de Iwana S.A.S. como responsable y dictamen jurídico (ADR-094 §7 punto 3) |

**Alineación con el sistema:**
- Un único texto cubre las dos finalidades habilitadas para Iwana (`TRATAMIENTO_CONTRACTUAL` y `CONTACTO_COMERCIAL`).
- El sistema registra una autorización por finalidad marcada, ligada a esta versión y su huella (ADR-094 D2 y D6).
- `DATOS_BIOMETRICOS` y `REPORTE_CENTRALES_RIESGO` no aparecen porque la política no las declara (§7.3 y §8) y quedan desactivadas en el tenant (spec C3).
- Si Iwana activa alguna después, se publica una versión nueva de este texto **antes** de activarla: la política §17 exige pedir nueva autorización cuando cambian las finalidades.

**Trazabilidad:**
- Política §9: qué se informa al pedir la autorización y autorización comercial aparte.
- §7.1 y §7.4: finalidades.
- §8: carácter facultativo de las respuestas sobre datos sensibles y de menores.
- §11: derechos.
- §2 y §13: contacto y canales.

### TEXTO PUBLICABLE

````markdown
# Autorización para el tratamiento de datos personales

**IWANA S.A.S. · NIT 901.870.583-2**

Al aceptar, autorizo de manera previa, expresa e informada a Iwana S.A.S., con domicilio en la Calle 86 C Bis # 110 C 18, Bogotá D.C., para tratar mis datos personales de acuerdo con su Política de tratamiento de datos personales, publicada en https://iwana.co/privacidad/, y para las finalidades que marco a continuación.

## 1. Prestación del servicio, facturación y soporte

Necesaria para contratar y recibir el servicio. Autorizo el tratamiento de mi nombre, documento de identidad, teléfono, correo, dirección y ubicación del predio, municipio o vereda, plan contratado, tecnología instalada, historial de facturación y pagos, solicitudes de soporte y sus conversaciones, y los datos técnicos de mi conexión, para:

- hacer la visita de viabilidad y la instalación;
- celebrar y ejecutar el contrato de servicio;
- facturar y aplicar mis pagos;
- darme soporte técnico y atender mis peticiones, quejas y recursos;
- informarme sobre el servicio, los mantenimientos y los cambios del contrato;
- cumplir las obligaciones legales, contables, tributarias y regulatorias del sector de telecomunicaciones.

## 2. Información comercial (opcional)

Autorizo, de forma separada, que Iwana S.A.S. me envíe información comercial sobre sus servicios por los canales que yo indique, respetando los horarios y la frecuencia que fija la Ley 2300 de 2023. Puedo retirar esta autorización en cualquier momento sin que ello afecte mi servicio.

## Lo que debo saber

- No estoy obligado a responder preguntas sobre datos sensibles ni sobre datos de niños, niñas y adolescentes. Iwana S.A.S. no trata datos sensibles de sus clientes.
- Iwana S.A.S. no consulta ni reporta mi información a centrales de riesgo y no vende ni cede mis datos.
- Tengo derecho a conocer, actualizar y rectificar mis datos; a pedir prueba de esta autorización; a saber cómo se han usado; a revocarla o pedir la supresión de mis datos cuando no exista un deber legal o contractual de conservarlos; y a presentar quejas ante la Superintendencia de Industria y Comercio después de agotar el trámite con Iwana S.A.S.
- Puedo ejercer esos derechos en info@iwana.co, en la línea (601) 495 4488, en los puntos de atención o por escrito en la Carrera 7 # 8-55, El Colegio (Cundinamarca).
- Iwana S.A.S. conserva la prueba de esta autorización, con la versión exacta de este texto que acepté.
````
