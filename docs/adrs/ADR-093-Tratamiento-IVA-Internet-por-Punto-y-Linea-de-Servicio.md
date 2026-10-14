# ADR-093: Tratamiento de IVA del internet por punto de servicio y concepto facturable

**Versión:** 1.0
**Estado:** Aprobado
**Aprobado por:** CTO — 2026-10-12, sin cambios de contenido. Los puntos ⚠ de §6 siguen pendientes de dictamen del contador y bloquean solo la facturación de esos conceptos
**Fecha:** 2026-10-12
**Modo activo:** Architect + Product Architect
**Autor:** AI-EM-ARCH
**Sucede parcialmente a:** [ADR-025](ADR-025-Subscriber-Modelo-Dos-Dimensiones.md). Se conserva su separación `personType` / `customerSegment` y se sustituye su §"Regla clave" (tabla IVA por `personType + stratum` sobre el suscriptor)
**Relacionado:** [ADR-029](ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md), [ADR-031](ADR-031-Rediseno-Tributario-Comercial-Impuestos-Reglas-Simulador.md), ADR-082 `(propuesto)` · Escalación E-1 de [INFORME-MOD05-SUBSCRIBERS-AUDITORIA-CUMPLIMIENTO-v1.0](../informes/INFORME-MOD05-SUBSCRIBERS-AUDITORIA-CUMPLIMIENTO-v1.0.md) §7 y §11
**Regulatorio:** Estatuto Tributario arts. 420, 468, 476 num. 7, 481 lit. h, 490 y 512-2; doctrina DIAN citada en §1. **La DIAN y la Ley 2010/2019 art. 131 hacen vinculante la doctrina para sus funcionarios; los puntos marcados ⚠ siguen requiriendo dictamen del contador o revisor fiscal**

---

## 1. Verificación de la regla (E-1)

| # | Afirmación | Veredicto | Fuente |
| --- | --- | --- | --- |
| V1 | Internet **fijo** de suscriptores **residenciales** de estratos 1 y 2: **exento** (tarifa 0, con derecho a devolución) | ✅ Confirmado | ET art. 481 lit. h) (*"desde redes fijas de los suscriptores residenciales de los estratos 1 y 2"*), dentro de *"exentos con derecho a devolución bimestral"*; DIAN Concepto 11602 de 2026 y Concepto 15495 de 2025 |
| V2 | Internet de usuarios **residenciales** de estrato 3: **excluido** | ✅ Confirmado | ET art. 476 num. 7 (*"usuarios residenciales del estrato 3"*); DIAN Concepto 11602 de 2026 |
| V3 | Estratos 4–6 y todo usuario no residencial (empresas, comercio, Estado, ESAL): **gravado al 19 %** | ✅ Confirmado como regla general | ET art. 468; ninguna exención aplicable a esos sujetos para este servicio |
| V4 | El beneficio exige **uso residencial**: contratado para conectarse en la vivienda del suscriptor | ✅ Confirmado | Texto de ambas normas (*"residenciales"*); DIAN Oficio 66561 de 2011: procede *"únicamente cuando éstos se contratan para ser conectados a una residencia"*, con interpretación restrictiva y sin analogía |
| V5 | Solo internet **fijo** | ✅ para estratos 1–2 (la norma dice *"redes fijas"*); ✅ por doctrina para estrato 3 (Oficio 66561 de 2011 lo niega al móvil) | ídem |
| V6 | Venta de módem, ONT o router: **gravada** aunque el servicio sea exento o excluido | ✅ Confirmado | DIAN Concepto 11602 de 2026 (art. 420 ET) |
| V7 | **Instalación, conexión, reconexión y puesta en marcha** cobradas aparte: **gravadas** | ❌ **Incorrecto en el insumo.** Esas actividades forman parte del servicio principal y **heredan** su tratamiento exento o excluido. Solo las prestaciones **independientes** (mantenimiento posterior, soporte no necesario para el acceso) quedan gravadas | DIAN Concepto 11602 de 2026 (excluido) y Concepto 15495 de 2025 (exento) |
| V8 | Arriendo o comodato de equipos | ⚠ No resuelto por la doctrina: *"debe analizarse caso a caso"* (Concepto 11602 de 2026) | Requiere dictamen |
| V9 | IP pública fija, IPTV | ⚠ Gravados por regla general si son prestaciones independientes; sin doctrina específica encontrada | Requiere dictamen |
| V10 | Telefonía adicional gravada al 19 % | ⚠ **Inexacto como regla absoluta**: el art. 476 num. 8 excluye los primeros 325 minutos de telefonía local de los estratos 1, 2 y 3 | ET art. 476 num. 8 |
| V11 | Datos móviles: IVA 19 % más impuesto al consumo del 4 % sobre lo que exceda 1,5 UVT | ✅ El INC del 4 % aplica sobre lo que exceda 1,5 UVT mensual **solo** en datos, internet y navegación móvil | ET art. 512-2; DIAN Concepto 828 de 2024. Fuera del alcance de un ISP fijo |
| V12 | Prorrateo del IVA descontable entre operaciones gravadas, exentas y excluidas | ✅ Confirmado | ET art. 490 |
| V13 | En paquetes, evitar subsidios cruzados | ✅ La norma lo encarga a los reguladores; para el ISP implica **discriminar el valor** de cada concepto en la factura | ET art. 481 lit. h) inciso final |
| V14 | Códigos de exención/exclusión en la factura electrónica | ⚠ No verificado | Anexo Técnico 1.9 (Res. DIAN 165 de 2023) y proveedor tecnológico |

**Conclusión:** la tabla de ADR-025 acertaba en exento (1–2) frente a excluido (3), pero falla en tres ejes que ninguna versión del modelo cubría:

1. Exige **uso residencial**.
2. El estrato es del **inmueble de instalación**, no de la persona.
3. El tratamiento es por **concepto facturable**: el servicio y sus actividades inherentes heredan el beneficio; los equipos y los servicios independientes, no.

## 2. Contexto en el código

- `VatTreatmentService.resolve(personType, stratum)` (`crm/subscribers/vat-treatment.service.ts`) persiste un único `subscribers.vat_treatment` por persona.
- `contracts` (`crm/contracts/entities/contract.entity.ts`) ya es el punto de servicio: tiene `installation_address`, `plan_id`, `additional_product_ids` y `additional_service_ids`. No tiene estrato ni uso.
- Billing no existe aún: es el momento más barato de corregir el contrato fiscal.

## 3. Decisión

### D1. El sujeto del tratamiento es la línea facturable de un punto de servicio

`vatTreatment = f(concept, networkType, usage, stratum)`. Las entradas son:
- `concept`: el concepto facturable, según D3.
- `networkType`: `FIXED | MOBILE`, derivado del plan.
- `usage` y `stratum`: atributos del **contrato**, que es el punto de servicio.

`personType` y `customerSegment` **no** son entradas. Se conserva una sola regla derivada de ellos: un `personType = JURIDICA` no puede declarar `usage = RESIDENTIAL`, porque una persona jurídica no tiene vivienda (V4). Se valida al guardar el contrato.

### D2. Tabla canónica para el concepto `INTERNET_ACCESS` y `ACTIVATION_INHERENT`

| networkType | usage | stratum | Tratamiento | Fundamento |
| --- | --- | --- | --- | --- |
| FIXED | RESIDENTIAL | 1, 2 | `EXEMPT` | ET 481 h |
| FIXED | RESIDENTIAL | 3 | `EXCLUDED` | ET 476 num. 7 |
| FIXED | RESIDENTIAL | 4, 5, 6 | `STANDARD` 19 % | ET 468 |
| FIXED | NON_RESIDENTIAL | — | `STANDARD` 19 % | ET 468; V4 |
| MOBILE | cualquiera | cualquiera | `STANDARD` 19 % (+ INC según ET 512-2, fuera de alcance) | V5, V11 |

**Uso mixto** (vivienda con negocio): se trata como `NON_RESIDENTIAL` mientras el contador no dictamine otra cosa. La interpretación restrictiva del beneficio (V4) hace que el error conservador sea cobrar IVA, no omitirlo.

### D3. Concepto facturable en el catálogo

Cada plan, producto y servicio del catálogo de Commercial (MOD06) declara un `vatConcept`:

| `vatConcept` | Tratamiento |
| --- | --- |
| `INTERNET_ACCESS` | Tabla D2 |
| `ACTIVATION_INHERENT` (instalación, conexión, reconexión, puesta en marcha) | Hereda la tabla D2 de su contrato (V7) |
| `EQUIPMENT_SALE` | `STANDARD` (V6) |
| `EQUIPMENT_LEASE` | `STANDARD` ⚠ hasta dictamen (V8) |
| `INDEPENDENT_SERVICE` (mantenimiento, soporte, IP fija, visitas no inherentes) | `STANDARD` ⚠ para IP fija (V9) |
| `TELEVISION` | `STANDARD` ⚠ (V9) |
| `TELEPHONY` | Fuera del motor canónico; se resuelve por reglas de Taxation (ADR-031) por la exclusión parcial del art. 476 num. 8 (V10) |

Un ítem sin `vatConcept` **no se puede facturar**: fallo cerrado.

### D4. Propiedad

- **Taxation (MOD07)** es dueño de la función canónica `resolveInternetVat` y la expone por puerto (`ITaxApplicationReadPort` o un puerto hermano). Sale de CRM. Esto es coherente con ADR-029: el catálogo y la lógica tributaria son de Taxation. El IVA canónico de internet **no es configurable por tenant**: es ley, no política comercial. ADR-031 sigue gobernando los demás tributos (ReteICA, estampillas, telefonía).
- **CRM (MOD05)** es dueño de `usage`, `stratum` y su soporte en el contrato, y guarda un **snapshot** del tratamiento resuelto al activar el contrato, con fecha y fundamento.
- **Commercial (MOD06)** es dueño de `vatConcept` en el catálogo.
- **Billing** (futuro) resuelve por línea al facturar: consume el puerto de Taxation y los atributos del contrato, y **discrimina el valor de cada concepto** (V13).

### D5. Soporte del estrato

El contrato con `usage = RESIDENTIAL` y estrato 1–3 exige `stratumEvidenceRef`: el recibo de un servicio público o el certificado municipal de estratificación de la **dirección de instalación**. Sin soporte, el contrato no se activa con beneficio y se trata como `STANDARD`. El soporte es un documento con datos personales: aplica la política de Habeas Data (E-2) y se guarda como adjunto mediante `MediaModule` (almacenamiento S3, configurado en MOD03), no en una columna.

### D6. Destino de `subscribers.vat_treatment` y `tax_regime`

- `subscribers.vat_treatment` queda **deprecado**. Se conserva solo como lectura de compatibilidad hasta que Billing exista, y se eliminará en una migración posterior. La UI del listado deja de presentarlo como el tratamiento del suscriptor; la presentación correcta es por contrato, y es una tarea de UI aparte.
- `subscribers.tax_regime` (`SIMPLIFIED`/`COMMON`) se sustituye por `vatResponsibility` (`RESPONSABLE | NO_RESPONSABLE`) y `rutResponsibilities[]` (hallazgo SUB-M03). Ninguno de los dos interviene en la tabla D2: son datos del adquirente para la factura electrónica.

## 4. Consecuencias

**Positivas**
- La facturación de un ISP con clientes residenciales y comerciales en los mismos estratos deja de omitir IVA debido. Ese es el riesgo de reclasificación por la DIAN con sanciones.
- La instalación de clientes de estratos 1–3 deja de gravarse por error.
- Un suscriptor con varios servicios en predios distintos recibe el tratamiento correcto en cada uno.
- Billing nace con el contrato fiscal correcto.

**Negativas / costo**
- Migración de datos: los contratos existentes no tienen `usage` ni `stratum`. Backfill propuesto: copiar `subscribers.stratum` y fijar `usage = RESIDENTIAL` solo si el segmento es `RESIDENTIAL` y la persona es `NATURAL`; en cualquier otro caso, `NON_RESIDENTIAL`. Es conservador y revisable por el operador.
- El catálogo de MOD06 requiere `vatConcept` en todos sus ítems antes de facturar.
- Tres módulos tocados (CRM, Commercial, Taxation) más uno futuro (Billing).

**Impacto**
- **Multi-tenant:** sin cambio; todo dentro del schema del tenant.
- **Seguridad:** el soporte de estrato es PII (D5).
- **Escala:** función pura, sin consultas por línea más allá del contrato.
- **Regulación:** es el objeto mismo de la decisión.

## 5. Alternativas descartadas

1. **Mantener ADR-025 con advertencia.** Omite IVA a usuarios comerciales de estratos 1–3. Es un riesgo fiscal directo.
2. **IVA de internet como regla configurable por tenant (ADR-031).** Traslada a cada ISP la interpretación de una norma nacional y permite configuraciones ilegales. La ley no es política comercial.
3. **Atributo `usage` en el suscriptor.** Falla con un mismo cliente que tiene su casa y su negocio.

## 6. Pendiente de dictamen (no bloquea la aprobación del ADR; bloquea facturar esos conceptos)

V8 (arriendo/comodato de equipos), V9 (IP fija, IPTV), V10 (telefonía), V14 (códigos de la factura electrónica) y el tratamiento del uso mixto (D2). Destinatario: contador o revisor fiscal del primer tenant productivo.

## 7. Referencias

- Estatuto Tributario: arts. 420, 468, 476 (num. 7 y 8), 481 (lit. h), 490, 512-2.
- DIAN: [Concepto 11602 de 2026](https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_11602_2026.htm) · [Concepto 15495 de 2025](https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_15495_2025.htm) · [Oficio 66561 de 2011](https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_66561_2011.htm) · [Concepto 828 de 2024](https://incp.org.co/wp-content/uploads/2024/10/Concepto-No.-828-de-2024-–-DIAN.pdf).
- Insumo de origen, no verificado: `docs/ideas/regla-iva-internet-fijo-isp.md`.
