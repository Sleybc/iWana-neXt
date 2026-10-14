# ADR-094: Modelo de protección de datos personales (Habeas Data) para iWana neXt

**Versión:** 1.0
**Estado:** Aprobado
**Aprobado por:** CTO — 2026-10-14, sin cambios de contenido. Con la aprobación se adopta la **retención de prospectos sin contrato en 24 meses** (§D7, §7.2). El número de módulo de `privacy` queda pendiente del roadmap. Los puntos ⚠ siguen pendientes de dictamen jurídico y **bloquean producción**, no la construcción
**Fecha:** 2026-10-14
**Modo activo:** Architect + Product Architect
**Autor:** AI-EM-ARCH
**Origen:** escalación **E-2** y hallazgos SUB-A06, SUB-A07 y SUB-B03 de [INFORME-MOD05-SUBSCRIBERS-AUDITORIA-CUMPLIMIENTO-v1.0](../informes/INFORME-MOD05-SUBSCRIBERS-AUDITORIA-CUMPLIMIENTO-v1.0.md)
**Relacionado:** [ADR-030](ADR-030-Modelo-Party-Multi-Rol.md) (Party es el titular), [ADR-058](ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md) (cifrado), [ADR-067](ADR-067-Proyeccion-PII-Listados-Operativos.md) (proyección), [ADR-093](ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md) (el soporte de estrato es PII)
**Regulatorio:** Ley 1581 de 2012; Decreto 1074 de 2015 (compila el Decreto 1377 de 2013 y el 090 de 2018); Ley 1266 de 2008 modificada por la Ley 2157 de 2021; Ley 2573 de 2026; Decreto 1704 de 2012 (compilado en el DUR 1078 de 2015); Ley 962 de 2005; ET art. 632; Ley 2300 de 2023. **Los puntos marcados ⚠ requieren dictamen jurídico antes de operar en producción**

---

## 1. Verificación del insumo

El insumo del CTO se contrastó contra el texto normativo y la doctrina disponibles.

| # | Afirmación del insumo | Veredicto | Fuente |
| --- | --- | --- | --- |
| H1 | Consultas: 10 días hábiles, prorrogables 5 | ✅ | Ley 1581 art. 14 |
| H2 | Reclamos: 15 días hábiles desde el día siguiente al recibo, prorrogables 8 | ✅ | Ley 1581 art. 15 num. 3 |
| H3 | Reclamo incompleto: requerimiento dentro de 5 días; desistimiento a los 2 meses sin subsanar | ✅ Los **5 días** no dicen «hábiles» en el texto ⚠ (el modelo los trata como hábiles, que es la lectura conservadora) | Ley 1581 art. 15 num. 1 |
| H4 | Leyenda «reclamo en trámite» ≤ 2 días hábiles tras el reclamo completo, hasta la decisión | ✅ | Ley 1581 art. 15 num. 2 |
| H5 | Traslado por incompetencia ≤ 2 días hábiles, informando al titular | ✅ | Ley 1581 art. 15 num. 1 |
| H6 | Suplantación (Ley 2573 de 2026): trámite en 10 días hábiles, suspensión inmediata del cobro, marca «Víctima de Falsedad Personal» sin afectar la calificación | ✅ Aplica a operadores de **internet**. Añade: **suspensión inmediata del bien o servicio** adquirido con suplantación; la víctima tiene **20 días hábiles** para denunciar ante la Fiscalía (no está claro desde cuándo corren ⚠); entrega de copia de los documentos usados para aprobar el producto. **Vigencia: 19 de noviembre de 2026** ⚠ (las fuentes secundarias difieren) | Ley 2573 de 2026 (texto oficial no accesible al verificar; resúmenes de Piranirisk, Ámbito Jurídico, CERLATAM) |
| H7 | Derechos: acceso, actualización/rectificación, supresión, revocatoria, prueba de la autorización | ✅ Terminología colombiana: «ARCO» es española o mexicana; aquí son **consultas y reclamos** | Ley 1581 arts. 8, 14 y 15 |
| H8 | La supresión no procede con deber legal o contractual de permanecer | ✅ | Ley 1581 art. 8 lit. e; Decreto 1377 de 2013 art. 9 (deber legal o contractual de permanecer) |
| H9 | Datos de suscriptores: conservación mínima de 5 años | ✅ Además, **mantenerlos actualizados**; se entregan a la Fiscalía por Policía Judicial | Decreto 1704 de 2012 art. 4 = DUR 1078 de 2015 art. 2.2.2.6.4 |
| H10 | Facturas y soportes: 5 años «(ET 632 y **Ley 962 art. 28**)» | ⚠ **Corregido.** ET 632: 5 años como mínimo. **Ley 962 art. 28: 10 años** para libros y papeles del comerciante, desde el último asiento. Regla del modelo: **el mayor, 10 años** | ET art. 632; Ley 962 art. 28 |
| H11 | Reporte negativo en centrales: doble de la mora, máximo 4 años tras el pago; 8 años si no hay pago; comunicación previa de 20 días | ✅ Matiz: la caducidad de **8 años se cuenta desde que la obligación entra en mora**. Las **dos comunicaciones** en días distintos con **20 días calendario** de espera aplican a obligaciones ≤ 15 % de un SMMLV | Ley 1266 art. 13, modificado por la Ley 2157 de 2021 (C-282/21) |
| H12 | Empleados: 20 años | ⚠ No verificado, y **fuera de alcance** (MOD de RR. HH. inexistente) | — |
| H13 | Logs de IP y tráfico: conservación condicionada a requerimiento judicial | ⚠ No verificado | Leyes 1273/2009 y 1453/2011 citadas en el insumo |
| H14 | Autorización digital: casilla no premarcada, con fecha, hora e IP | ✅ Coherente con la «conducta inequívoca» del Decreto 1377 (DUR 1074) | — |
| H15 | RNBD: obligatorio con activos > 100.000 UVT; actualización anual | ✅ Obligado: cada **tenant** (el ISP), no iWana por sus clientes. Actualización anual entre el 2 de enero y el 31 de marzo | Decreto 090 de 2018; Circular 003 de 2018 de la SIC |

**Lo que el insumo no trae y el modelo necesita:**
- **Reporte de incidentes de seguridad a la SIC:** dentro de los 15 días hábiles siguientes a su detección ⚠ (fuentes secundarias; existe un proyecto de 2026 que modifica el Título V de la Circular Única).
- **Ley 2300 de 2023:** horarios de contacto para cobranza y publicidad (L-V 7:00–19:00; sábados 8:00–15:00; nunca domingos ni festivos) y un solo canal por semana tras un contacto directo. ⚠ Falta confirmar si alcanza la cobranza propia de un ISP (su art. 5 extiende la ley a proveedores de bienes y servicios).
- **Responsable y encargado:** el **tenant (ISP) es el Responsable**; **iWana es Encargado** y requiere un contrato de transmisión (Decreto 1377, hoy DUR 1074) ⚠.

## 2. Contexto en el código

- `crm/habeas-data/`:
  - `arco_requests` no tiene plazos y su estado es texto libre.
  - `habeas_data_consents` admite edición y borrado lógico, y toma la IP del cliente.
- `crm/expedientes/consent_records` es un segundo modelo de consentimiento, con revocatoria, ligado al expediente (SUB-B03).
- El titular aparece como «suscriptor», pero ADR-030 hace de **Party** la identidad: una misma persona puede ser cliente, empleado y proveedor.
- No hay calendario de festivos: `assurance/services/sla.service.ts:85-86` calcula los 15 días hábiles de PQR **sin festivos**. El mismo defecto afecta a cualquier plazo legal.
- El alta del suscriptor no verifica la autorización (SUB-A07).

## 3. Decisión

### D1. Contexto propio: módulo `privacy`

La protección de datos es transversal a todos los roles del Party. Se crea el módulo **`privacy`** (Modulith), dueño de:
- autorizaciones;
- solicitudes del titular;
- textos legales;
- catálogo de retención;
- marcas sobre el titular;
- incidentes.

`crm/habeas-data` se retira tras la migración.

- **El titular es el `Party`** (ADR-030). `subscriberId` y `expedienteId` son contexto, no identidad.
- Los demás módulos consumen `privacy` **solo por puertos**: `IPrivacyAuthorizationReadPort` (¿tiene autorización vigente para la finalidad X?) e `IPrivacyMarksReadPort` (¿tiene leyenda o marca activa?).
- Los efectos sobre otros módulos (suspender un contrato, bloquear datos) se hacen por eventos o por puertos de comando que esos módulos implementan. `privacy` nunca escribe en tablas ajenas.
- **Número de módulo:** lo asigna el CTO en el roadmap.

### D2. Autorizaciones por finalidad, de solo-anexar

Tabla `data_authorizations`, una fila por evento, **nunca UPDATE ni DELETE**: un trigger lo impide y la aplicación no tiene esos permisos.

| Campo | Regla |
| --- | --- |
| `party_id`, `purpose`, `granted` | — |
| `purpose` | `TRATAMIENTO_CONTRACTUAL` (prestación, facturación, soporte y contacto operativo) · `CONTACTO_COMERCIAL` · `REPORTE_CENTRALES_RIESGO` (Ley 1266: exige autorización previa expresa) · `DATOS_BIOMETRICOS` (sensible; siempre facultativa) |
| `kind` | `GRANT`, `REVOCATION` o `LEGACY_IMPORT` |
| `channel` y `evidence_ref` | Firma escaneada, grabación de voz o casilla web; la evidencia es un adjunto de Media de uso propio |
| `legal_text_id` | Versión del aviso o autorización aceptada, con el **SHA-256 del texto** (D6) |
| `ip`, `user_agent` | Capturados **por el servidor**; nunca enviados por el cliente |
| `captured_by`, `captured_at` | — |

Reglas:
1. **Vigencia** = el último evento por `(party, purpose)`.
2. **Revocar `TRATAMIENTO_CONTRACTUAL`** con un contrato activo o un deber de conservación vigente → la solicitud se resuelve como **no procedente**, con el fundamento legal (H8). La revocatoria de `CONTACTO_COMERCIAL` es siempre procedente e inmediata.
3. **Alta** de suscriptor o contrato **exige** `TRATAMIENTO_CONTRACTUAL` vigente (cierra SUB-A07). La conversión desde el expediente hereda la autorización migrada.
4. **Migración:**
   - `consent_records` y `habeas_data_consents` → `data_authorizations`, por la cadena expediente → suscriptor → party.
   - `TRATAMIENTO_DATOS` → `TRATAMIENTO_CONTRACTUAL`; `CONTACTO_COMERCIAL` sin cambio.
   - `CONTACTO_OPERATIVO` → se absorbe en `TRATAMIENTO_CONTRACTUAL` y la preferencia de canal se conserva aparte.
   - Lo que no tenga evidencia queda `LEGACY_IMPORT` con `evidence_ref = null`, y un **reporte** para que el ISP recolecte la prueba.
   - Nada se descarta.

### D3. Solicitudes del titular con reloj legal

Tabla `data_subject_requests`:
- **`kind`:** `CONSULTA`, `RECLAMO` o `SUPLANTACION`.
- **`right`:** `CONOCER`, `ACTUALIZAR`, `RECTIFICAR`, `SUPRIMIR`, `REVOCAR`, `PRUEBA_AUTORIZACION` o `INCUMPLIMIENTO`.
- **Solicitante:** `TITULAR`, `CAUSAHABIENTE`, `REPRESENTANTE` o `APODERADO`, con la evidencia de su identidad.

**Plazos.** Se calculan con el **calendario colombiano de días hábiles** (D5) y se guardan como columnas; nunca se recalculan al leer.

| Tipo | Plazo | Prórroga | Fundamento |
| --- | --- | --- | --- |
| `CONSULTA` | 10 días hábiles desde el recibo | +5, informando motivo y fecha | H1 |
| `RECLAMO` | 15 días hábiles desde el día siguiente al recibo completo | +8, informando | H2 |
| `RECLAMO` incompleto | Requerir ≤ 5 días hábiles; `DESISTIDA` a los 2 meses calendario sin subsanar | — | H3 |
| Leyenda «reclamo en trámite» | ≤ 2 días hábiles desde el reclamo completo | Se mantiene hasta decidir | H4 |
| `TRASLADADA` | ≤ 2 días hábiles | — | H5 |
| `SUPLANTACION` | 10 días hábiles; suspensión **inmediata** del servicio y del cobro | Denuncia del titular: 20 días hábiles ⚠ | H6 |

**Estados:** `RADICADA` → (`INCOMPLETA` → `DESISTIDA`) → `EN_TRAMITE` → (`PRORROGADA`) → `RESUELTA`, `NO_PROCEDENTE` o `TRASLADADA`.

Cada transición:
- registra actor, fecha y fundamento;
- **exige** la respuesta y su canal de entrega para cerrar;
- emite eventos, sin PII, hacia la auditoría.

**Alertas.** Un job diario de BullMQ (`worker`) avisa al rol de privacidad de las solicitudes que vencen en 2 días hábiles o menos y de las vencidas. Hay un tablero de vencimientos.

### D4. Marcas sobre el titular

Tabla `party_privacy_marks` (de solo-anexar, con apertura y cierre como eventos):
- `RECLAMO_EN_TRAMITE`;
- `VICTIMA_FALSEDAD_PERSONAL`;
- `DATOS_BLOQUEADOS`.

Toda pantalla y respuesta que muestre datos del titular **muestra la marca vigente**, consultando `IPrivacyMarksReadPort`. La leyenda debe verse donde se ve el dato.

**Suplantación:** al radicar, `privacy` emite `privacy.impersonation.reported`.
- **CRM suspende** los contratos del producto cuestionado, con el estado `SUSPENDED` ya existente y el motivo `SUPLANTACION`.
- Cuando exista Billing, suspenderá el cobro.
- **Hasta entonces**, el cobro lo suspende el ISP en su sistema externo, y la tarea manual queda registrada y con fecha en la solicitud.

### D5. Calendario colombiano de días hábiles (compartido)

`@iwana/shared` incorpora `colombiaBusinessCalendar`: festivos de la Ley 51 de 1983 (traslado al lunes), festivos móviles por Pascua y festivos fijos.
- **Fuente única** para los plazos de `privacy`.
- **Debe** reemplazar el cálculo sin festivos de `assurance/sla.service.ts`. Ese reemplazo es **deuda de `assurance`**: se registra y se ejecuta en el turno de ese módulo.
- También sirve para las franjas de la Ley 2300 (D8).

### D6. Textos legales versionados por tenant

Tabla `legal_texts`:
- `type`: `POLITICA_TRATAMIENTO` (PTDP), `AVISO_PRIVACIDAD` o `AUTORIZACION`;
- `version`, `sha256`, `published_at`, `url`;
- el contenido es **inmutable**: una versión nueva crea una fila nueva.

Cada autorización apunta a la versión exacta aceptada. Así se puede probar *qué* aceptó el titular. iWana provee plantillas; **el texto lo aprueba cada ISP**, porque es el Responsable.

### D7. Retención, bloqueo y supresión

Catálogo `retention_policies`, sembrado y editable solo para **alargar** los plazos legales, nunca para acortarlos.

| Categoría | Plazo | Desde | Fundamento |
| --- | --- | --- | --- |
| Identificación, dirección y contrato del suscriptor | 5 años | Terminación del último contrato | H9 |
| Facturación y soportes contables | 10 años | Último asiento o documento | H10 |
| Prospecto sin contrato (expediente descartado) | **⚠ decisión del CTO** (propuesta: 24 meses) | Descarte | Finalidad cumplida: limitación temporal del tratamiento (Decreto 1377 de 2013 art. 11, compilado en el DUR 1074) ⚠ |
| Soporte de estrato (ADR-093) | El de la facturación a la que dio beneficio | Último documento facturado | H10 |
| Autorizaciones y su evidencia | Mientras exista cualquier dato del titular, + 5 años | — | Prueba de la autorización |
| Logs de IP y conexión | ⚠ dictamen | — | H13 |

**Supresión procedente** (o retención vencida) → **anonimización**:
- se sobrescriben las columnas personales;
- se borran los HMAC y la evidencia en Media;
- se conservan los agregados sin identificación;
- `audit_logs` no contiene PII por diseño (S-T7-01/T11), así que no se toca.

**Supresión improcedente por deber de conservación** → **bloqueo** (`DATOS_BLOQUEADOS`):
- el dato sale de toda proyección operativa;
- solo es accesible para fines legales, con un permiso propio y acceso auditado;
- al vencer la retención, se anonimiza.

Copias de seguridad: anonimizar no reescribe backups. Su rotación debe ser menor o igual que el plazo más corto ⚠ (`plat-ops`).

### D8. Gobierno y fuera de alcance de la Fase 1

**En la Fase 1:**
- permiso `privacy.manage` y rol plantilla «Oficial de protección de datos»;
- reporte de **inventario de bases** por tenant, para que el ISP registre en el RNBD (H15);
- **registro de incidentes** con su fecha límite de reporte a la SIC (⚠ plazo).

**Fases posteriores:**
- Reporte a centrales de riesgo (H11), con Billing.
- Franjas de contacto de la Ley 2300, con el módulo de comunicaciones.
- Formulario público de radicación.
- Transferencias internacionales (WhatsApp/Meta, nube) ⚠.
- Datos de empleados (H12).

## 4. Fases

| Fase | Contenido | Por qué en este orden |
| --- | --- | --- |
| **1** (cierra E-2 y SUB-A06/A07/B03) | D1 a D7, la suplantación incluida (D4) y el gobierno de D8 | La **Ley 2573 rige desde el 19-nov-2026**; la suplantación no puede esperar a Billing |
| 2 | Jobs automáticos de retención y anonimización; formulario público; incidentes con flujo completo | Requiere la Fase 1 en producción y los dictámenes ⚠ |
| 3 | Centrales de riesgo y Ley 2300 | Dependen de Billing y de comunicaciones |

## 5. Consecuencias

**Positivas:**
- Plazos legales calculados y vigilados.
- Prueba de autorización reproducible.
- Una sola identidad de titular para todos sus roles.
- Cumplimiento de la Ley 2573 antes de su vigencia.
- Corrige el cálculo de días hábiles para todo el sistema.

**Negativas / costo:**
- Un módulo nuevo.
- Migración de dos modelos de consentimiento.
- Las pantallas que muestran datos del titular deben mostrar las marcas.
- El ISP debe recolectar la evidencia de las autorizaciones heredadas.

**Impacto:**
- **Multi-tenant:** todo en el schema del tenant; el tenant es el Responsable.
- **Seguridad:** la evidencia y el bloqueo son PII de alto impacto.
- **Escala:** un job diario por tenant; consultas indexadas por `due_at`.
- **Regulación:** es el objeto de la decisión.

## 6. Alternativas descartadas

1. **Mantener `crm/habeas-data`.** Ata el titular al suscriptor y deja fuera a empleados y proveedores (ADR-030).
2. **Plazos en días calendario o sin festivos.** Es incumplimiento directo: los plazos legales son en días hábiles.
3. **Borrado físico como supresión.** Choca con los deberes de conservación (H9, H10) y rompe la integridad referencial. Bloqueo + anonimización cumplen las dos cosas.
4. **Autorización como columna del suscriptor.** Pierde el historial, la prueba y la revocatoria por finalidad.

## 7. Decisiones del CTO requeridas

1. **Aprobar este ADR** y el módulo `privacy`, con su número en el roadmap.
2. **Retención de prospectos sin contrato:** se propone 24 meses.
3. **Llevar a dictamen jurídico** los puntos ⚠:
   - H3: días hábiles en el requerimiento;
   - H6: cómputo de los 20 días de la denuncia y fecha de vigencia;
   - H13: logs de IP;
   - el plazo de reporte de incidentes;
   - la aplicabilidad de la Ley 2300 a la cobranza de un ISP;
   - el contrato de transmisión iWana–ISP;
   - la rotación de backups.

   **Ninguno bloquea la aprobación; sí bloquean producción.**

## 8. Referencias

- Ley 1581 de 2012, arts. 4, 8, 14 y 15 ([encolombia](https://encolombia.com/derecho/leyes/ley-habeas-data/procedimientos-data/)).
- Ley 2157 de 2021, que modifica el art. 13 de la Ley 1266 ([SIDN](https://sidn.ramajudicial.gov.co/SIDN/NORMATIVA/TEXTOS_COMPLETOS/7_LEYES/LEYES%202021/LEY%202157%20DE%202021%20(INFORMACI%C3%93N%20FINANCIERA).PDF)).
- Ley 2573 de 2026 ([Piranirisk](https://www.piranirisk.com/es/hub-regulatorio/ley-2573-2026-suplantacion-identidad-bancos-telcos-colombia), [Ámbito Jurídico](https://www.ambitojuridico.com/noticias/comercial/analisis-la-ley-2573-de-2026-y-los-retos-en-la-gestion-de-casos-de-suplantacion)).
- Decreto 1704 de 2012, art. 4 ([MinTIC](https://normograma.mintic.gov.co/mintic/compilacion/docs/decreto_1704_2012.htm)).
- Ley 962 de 2005, art. 28, y ET art. 632 ([Forvis Mazars](https://www.forvismazars.com/co/es/acerca-de-nosotros/noticias-publicaciones-y-media/nuestras-noticias-y-publicaciones/actualidad-juridica-y-tributaria/2023/libros-contables-y-conservacion-de-documentos)).
- Ley 2300 de 2023 ([MinTIC](https://normograma.mintic.gov.co/docs/pdf/ley_2300_2023.pdf)).
- Decreto 090 de 2018 y RNBD ([Deloitte 2025](https://www2.deloitte.com/content/dam/Deloitte/co/Documents/legal/Registro-Nacional-de-Bases-de-Datos-2025.pdf)).
- Reporte de incidentes ([Holland & Knight 2018](https://www.hklaw.com/en/insights/publications/2018/08/nuevos-requisitos-para-el-registro-nacional-de-bas)).
