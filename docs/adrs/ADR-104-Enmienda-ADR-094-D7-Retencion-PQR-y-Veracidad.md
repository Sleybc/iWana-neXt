# ADR-104: Retención de PQR y veracidad de los datos anonimizados (enmienda de ADR-094 D7)

**Versión:** 1.0
**Estado:** Aprobado
**Aprobado por:** CTO, 2026-11-07: §6 puntos 1 a 3, con bloqueo total por PQR (A1 descartada por ahora). Quedan abiertos el punto 4 (firma del abogado, ⚠ bloquea producción) y el 5 (spec de H-EXP)
**Fecha:** 2026-11-07
**Autor:** AI-EM-ARCH
**Modo activo:** Architect
**Módulos:** `privacy` (catálogo de retención y deber de conservación), `assurance` (dueño de las PQR), CRM (estrato del suscriptor y del contrato)
**Relacionado:** [ADR-094](ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) D7 (Aprobado; se enmienda) · [ADR-093](ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md) (el estrato funda el IVA) · [spec del barrido v1.2](../specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md) §14
**Origen:** respuesta del abogado del 2026-11-07 a la spec del barrido, §13 punto 10, verificada por AI-EM-ARCH. ⚠ Falta su firma para registrarla como dictamen.

---

## 1. Contexto

ADR-094 D7 ya resuelve el caso general: si hay deber de conservación, la supresión no procede, el titular queda bloqueado (`DATOS_BLOQUEADOS`) y se anonimiza al vencer la retención. El código lo aplica en `requests.service.ts`, `conservationDuty`, con dos relojes: 5 años desde la terminación del último contrato y 10 años desde el último documento fiscal.

Por eso tres de las cuatro respuestas del abogado ya se cumplen: cuando la supresión procede, ya no corre ni el plazo fiscal ni el contractual. Así ocurre con el motivo tributario, con ciudad, departamento y estrato, y con la solicitud de terminación (3 años, dentro de los 5 del contrato).

Quedan dos huecos y una falta de veracidad:

1. **PQR sin reloj propio.** La Circular Única de la SIC, Título III, numeral 1.3.7, obliga a conservar hasta 3 años desde la respuesta el paquete de la PQR: solicitud y anexos, respuesta y sus soportes, recurso y decisión, y prueba de la notificación. Un titular sin contrato (un prospecto) o con el contrato terminado hace más de 5 años puede tener una PQR respondida hace menos de 3 años. Hoy la supresión procede y la anula.
2. **Solicitudes del titular sin plazo.** `data_subject_requests.response_text`, `.transferred_to` y `data_subject_request_tasks.note` se conservan sin término. El abogado pide conservar el paquete íntegro al menos 3 años y después reducirlo a metadatos.
3. **El estrato anonimizado es falso.** La supresión escribe `1` en `subscribers.stratum` y en `contracts.installation_stratum`. El estrato 1 está exento de IVA (ET art. 481, lit. h), así que el registro dice que el titular tuvo un beneficio que quizás no tuvo. Contraviene el principio de veracidad (Ley 1581, art. 4, lit. d).

## 2. Decisión

### E1. Categoría nueva: soportes de PQR

| Categoría | Plazo | Desde | Fundamento |
| --- | --- | --- | --- |
| `PQR_SOPORTES` | 3 años, mínimo legal | Notificación de la respuesta definitiva; si no hay, la respuesta; una PQR sin respuesta no empieza a correr | Circular Única SIC, Título III, num. 1.3.7; CPACA art. 52 (caducidad sancionatoria, 3 años) |

`conservationDuty` suma una tercera condición: una PQR del titular dentro del plazo. Se reutiliza el modelo de D7: supresión no procedente y bloqueo del titular entero, no anonimización parcial (§4, alternativa A1).

La PQR del titular se identifica con el mismo alcance de tickets de la spec del barrido (D-BT-2): solicitante o asunto `SUBSCRIBER`, `CONTRACT` o `EXPEDIENTE` del titular. `privacy` lo lee por un puerto propio que implementa `assurance`.

### E2. Categoría nueva: solicitudes del titular

| Categoría | Plazo | Desde | Fundamento |
| --- | --- | --- | --- |
| `SOLICITUDES_TITULAR` | 5 años, mínimo legal | Resolución de la solicitud | Responsabilidad demostrada (Ley 1581, art. 17); se alinea con `AUTORIZACIONES_EVIDENCIA`, ya en 5 años |

Al vencer, la solicitud se reduce a radicado, tipo, fechas, resultado y canal de notificación. `transferred_to` se conserva si nombra a otro operador o a una entidad. Esta enmienda solo fija el plazo; el job que lo aplica es el hueco H-EXP (§5).

### E3. Veracidad: ninguna marca sobre un hecho regulado

Ninguna anonimización escribe un valor del dominio real en un campo que funda un tratamiento tributario o regulatorio. El estrato anonimizado pasa a `NULL`. Las restricciones lo admiten solo con la fila marcada como anonimizada, igual que la migración 176 hizo con el documento del suscriptor:

- `subscribers.stratum`: `chk_subscriber_person_fields` acepta `NULL` con `anonymized_at` fijado.
- `contracts.installation_stratum`: `chk_contract_residential_stratum` acepta `NULL` con un `contracts.anonymized_at` nuevo, que fija la supresión.

La regla aplica a todo campo que se añada después: estrato, segmento, régimen o cualquier otro hecho con efecto fiscal.

## 3. Consecuencias

- Una PQR reciente bloquea la supresión hasta 3 años. Para un prospecto con una PQR, eso retiene más de lo estrictamente necesario: también el expediente y sus notas. Es el costo de no anonimizar a medias (A1).
- Se necesita una migración, con número libre al implementar: 2 categorías en `retention_policies`, la columna `contracts.anonymized_at` y los dos CHECK.
- Las filas ya anonimizadas con estrato `1` no existen en producción. En desarrollo, `--verify-only` las delata y `--apply` las corrige (D-BT-12).
- El contrato de vista previa no cambia: el bloqueante sigue siendo `CONSERVATION_DUTY`.

## 4. Alternativas descartadas

- **A1. Anonimización parcial:** suprimir todo salvo el paquete de la PQR, y anonimizarlo al vencer. Es lo que permite el abogado y minimiza mejor. Se descarta hoy porque no existe el job de vencimiento (H-EXP), y sin él el paquete quedaría retenido para siempre. Se reabre cuando H-EXP exista.
- **A2. Enmascarar identificadores dentro del texto:** el abogado lo desaconseja durante el plazo, porque una respuesta editada pierde valor probatorio (Ley 527, arts. 8 y 9). Además, el texto libre no se puede enmascarar de forma fiable.
- **A3. Centinela fuera de dominio (`0`) en lugar de `NULL`:** obliga a ampliar el CHECK de rango, y cualquier lector desprevenido lo trataría como estrato. `NULL` ya significa «no hay dato».
- **A4. Tabla agregada por municipio y estrato al suprimir:** el abogado la propone para conservar los agregados. Hoy nadie la consume, y los reportes a la CRC (formato T.1.3) son trimestrales sobre accesos vigentes, no históricos.

## 5. Fuera de alcance

- **H-EXP. Anonimizar al vencer la retención:** D7 lo exige y no existe. Hoy un titular bloqueado sigue bloqueado hasta que alguien vuelva a tramitar la supresión. Necesita su propia spec.
- Extensión por caso del plazo de una PQR con apelación ante la SIC o litigio: no hay dato que lo registre. Hoy se cubre ampliando `PQR_SOPORTES` en el catálogo, que solo admite alargar.
- Normalizar `subscriber_tax_assignments.reason` como código de fundamento más referencia al soporte, como recomienda el abogado.
- Las columnas de MOD14: las clasifica MOD14 (spec del barrido §12).

## 6. Decisiones del CTO requeridas (1 a 3 aprobadas el 2026-11-07)

1. Aprobar E1, con bloqueo total (A1 descartada por ahora).
2. Aprobar E2, en 5 años.
3. Aprobar E3 y la migración.
4. Pedir al abogado que firme la respuesta del 2026-11-07, para registrarla como dictamen en `docs/legal/`.
5. Abrir la spec de H-EXP.

## 7. Referencias

- Circular Única SIC, Título III, num. 1.3.7 ([SIC 2021](https://www.sic.gov.co/sites/default/files/normatividad/062021/T%C3%ADtulo%20III%20ACT.pdf)); cita vigente en el [concepto CRC 516936 de 2023](https://normograma.com/crc/compilacion/docs/concepto_crc_0516936_2023.htm).
- Decreto 1377 de 2013, art. 9, compilado en el DUR 1074: la supresión no procede con deber legal o contractual ([concepto SIC 15-039288](https://sedeelectronica.sic.gov.co/sites/default/files/normatividad/Concepto_15-039288.pdf)).
- ET arts. 476 num. 7 y 481 lit. h; DIAN [oficio 7447 de 2017](https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_7447_2017.htm).
- Ley 962 de 2005, arts. 28 y 46 ([Accounter](https://accounter.co/normatividad/oficios/conservacion-de-archivos-electronicos-de-empresas-privadas-oficio-220-268967-de-2017-2)).
