# PROMPT DE EJECUCIÓN — MOD12 Catálogo · F3 · Diagnóstico de los SKU ya emitidos

**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` v1.2 *(en revisión — la regla de destino la respalda `AGENTS.md` → Documentation Rules)*
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Fecha:** 2026-09-02
**Versión:** 1.0

## Módulo

- **Nombre:** Inventario / SCM — calidad del SKU del catálogo maestro
- **Código:** MOD12 (`inventory_items.sku`)
- **Fase:** F3 — **diagnóstico de solo lectura**. No cambia código, datos ni configuración.
- **Destinatarios:** **AI-DATA-ENG** (o **AI-SR-QA** si DATA-ENG no está disponible)
- **Decisión del CTO (2026-09-02):** medir antes de decidir. Sin este dato, cualquier remediación es especulación.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** saber **cuántos productos** cargan un SKU degradado y **cuántos** llevan
sufijo de colisión, por tenant, para decidir con evidencia si hay algo que remediar.

**Contexto del defecto (F2 lo corrige hacia adelante):** el diálogo de alta esconde marca y modelo
tras un acordeón colapsado con el mensaje falso «puedes completarlos más adelante». Como esos dos
campos son los segmentos 4 y 5 del SKU compuesto y **el SKU solo se genera al crear**, todo producto
dado de alta sin expandir el acordeón quedó con un código de **tres** segmentos
(`{CAT}-{TIPO}-{NOMBRE}`) de forma **permanente**. Rellenar marca y modelo después no lo regenera.

Efecto secundario a medir: al perder dos segmentos discriminantes, aumentan las colisiones, que el
backend resuelve añadiendo `-001`, `-002`… (`appendCollisionSuffix`,
`packages/shared/src/inventory/inventory-item-sku.ts:149-153`).

**Pregunta que esta fase responde, y nada más:** ¿el volumen justifica una remediación?

---

## 2. Artefactos de entrada obligatorios

- **ADR:** `ADR-INV-SKU-COMPUESTO-v1.md` (**Aprobado**) — formato `{CAT}-{TIPO}-{NOMBRE}-{MARCA}-{MODELO}`, marca y modelo opcionales, sufijo de colisión `-001`…`-999`, **`sku` inmutable tras la creación**, «los SKUs existentes no se migran ni se recalculan».
- **Implementación de referencia:** `packages/shared/src/inventory/inventory-item-sku.ts` — `buildCompositeSkuBase` (L137-147), `appendCollisionSuffix` (L149-153), `INVENTORY_ITEM_KIND_SKU_CODES` (L15-20: `STK`/`CON`/`SER`/`SVC`).
- **Entidad:** `packages/database/src/entities/inventory-item.entity.ts` — `sku varchar(60)`, único por `(tenant_id, sku)`.
- **Historia del formato:** `INFORME-INVENTORY-SKU-AUTOGENERADO-v1.md` (formato v1 `{CODE_PREFIX}-{NNNNNN}`) y `-v2.md` (compuesto actual; «no recalcula los SKUs ya emitidos»). **Conviven tres poblaciones**: v1, compuesto completo y compuesto degradado. El diagnóstico debe distinguirlas.
- **Multi-tenancy:** un schema por tenant. La medición recorre todos los schemas de tenant, no una sola tabla.

---

## 3. Qué medir

Por **cada tenant**, y en total:

1. **Total de productos** en `inventory_items`.
2. **Con marca y modelo poblados** (`brand IS NOT NULL AND model IS NOT NULL`), y cada uno por separado.
3. **Distribución por número de segmentos del SKU** (contar separadores `-`, con cuidado: el sufijo de
   colisión añade uno). Distinguir:
   - **v1 heredado**: `{PREFIJO}-{NNNNNN}` — 2 segmentos, el segundo todo numérico de 6 dígitos.
   - **Compuesto degradado**: 3 segmentos (sin marca ni modelo).
   - **Compuesto parcial**: 4 segmentos (marca o modelo, no ambos).
   - **Compuesto completo**: 5 segmentos.
   - Cualquiera de los anteriores **+ sufijo de colisión** `-NNN`.
4. **Cuántos con sufijo de colisión**, y el sufijo más alto alcanzado (indica presión de colisión).
5. **El caso que más importa: productos con SKU degradado que SÍ tienen marca o modelo poblados.**
   Son los que demuestran el defecto en estado puro — alguien rellenó los datos después, creyendo el
   mensaje, y el código ya no lo refleja.
6. **Antigüedad**: distribución por `created_at`, para saber si el problema sigue creciendo o se
   concentra en un periodo.

---

## 4. Restricciones no negociables

1. **Solo lectura.** Ninguna escritura, ningún `UPDATE`, ningún `ALTER`, ninguna migración. Si algo
   requiere escribir, esta fase se ha desbordado: detenerse.
2. **Sin PII y sin datos reales en el informe.** Reportar **conteos y porcentajes**, no listados de
   productos. Si hace falta ilustrar un patrón, usar ejemplos anonimizados o sintéticos.
3. **Sin credenciales en ningún artefacto.**
4. **Respetar la tenancy**: la medición se hace por schema, sin cruzar datos entre tenants en una
   misma tabla de salida más allá de los agregados.
5. **No proponer la remediación en esta fase.** El objetivo es el dato. La decisión la toma el CTO con
   el informe delante; regenerar SKU contradiría el ADR y exigiría uno nuevo.
6. Si el entorno disponible es local o de desarrollo con datos sembrados, **decirlo explícitamente**:
   un diagnóstico sobre semillas no es evidencia sobre producción, y el informe no debe presentarlo
   como tal.

---

## 5. Entregables

- `docs/informes/INFORME-MOD12-CATALOGO-DIAGNOSTICO-SKU-F3-v1.0.md`:
  - Entorno medido y su naturaleza (producción, staging, local con semillas) — **declarado sin ambigüedad**.
  - Tabla de conteos y porcentajes por tenant y total, según §3.
  - Cifra destacada: productos con SKU degradado y marca o modelo poblados (§3.5).
  - Lectura del dato en una línea: ¿hay problema que remediar, sí o no?
  - **Sin recomendación de remediación** — eso es de la sesión de decisión posterior.
- Las consultas usadas, incluidas en el informe para que sean reproducibles y auditables.

**Sin entregables de código.** Sin migraciones. Sin cambios en `apps/` ni `packages/`.

---

## 6. Criterios de aceptación

- **CA-F3-01:** el informe declara con precisión el entorno medido y si sus datos son representativos.
- **CA-F3-02:** los conteos cubren todos los tenants del entorno, con agregado y desglose.
- **CA-F3-03:** la clasificación distingue las tres poblaciones (v1 heredado, compuesto degradado/parcial, compuesto completo) y no confunde el sufijo de colisión con un segmento.
- **CA-F3-04:** se reporta la cifra de §3.5.
- **CA-F3-05:** las consultas son reproducibles y quedan en el informe.
- **CA-F3-06:** cero escrituras — `git diff` vacío en `apps/` y `packages/`; ninguna migración nueva.
- **CA-F3-07:** sin PII ni credenciales en el informe.

## 7. Criterio de stop/go

**Detenerse inmediatamente si:**
- No hay entorno con datos representativos disponible. En ese caso **decirlo y parar**: un diagnóstico sobre datos sembrados no responde la pregunta, y presentarlo como si lo hiciera es peor que no medir.
- La medición exigiera cualquier escritura o cambio de esquema.
- Aparecieran SKU que no encajan en ninguna de las tres poblaciones conocidas — es un hallazgo propio que merece escalarse antes de seguir contando.

**Documentar causa en:** el propio informe, §Bloqueos.
**Escalar a:** AI-EM-ARCH con etiqueta `[BLOQUEO]` antes de cerrar la sesión.

## 8. Criterio de salida

- Informe archivado en `docs/informes/` con los conteos, las consultas y la declaración de entorno.
- `git diff --stat apps/ packages/` vacío.
- El CTO puede responder con el informe delante: **¿hay algo que remediar?**

---

## Impacto declarado (AI-EM-ARCH)

- **Multi-tenant:** lectura por schema; sin cambios.
- **Seguridad:** sin cambios. El informe no debe contener PII ni credenciales; los conteos agregados no son datos personales.
- **Escala:** consultas de conteo sobre `inventory_items`, tabla pequeña frente a las de movimientos. Si algún tenant fuera grande, usar índices existentes y evitar escaneos innecesarios.
- **Regulación:** sin impacto.
