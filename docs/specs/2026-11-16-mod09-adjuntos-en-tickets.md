# Spec — MOD09 Soporte · Adjuntos en tickets

**Versión:** 1.1 (2026-11-16: D1 y D4, decisiones del usuario)
**Estado:** G0 aprobado por el usuario el 2026-11-16 («Apruebo el G0»)
**Fecha:** 2026-11-16
**Emisor:** Claude Code
**Módulos:** MOD09 Soporte (assurance) · media · plataforma (migración UISP) · privacy
**Relacionado:** [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md) (importación UISP) · [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) (supresión) · evidencia de órdenes de trabajo (`MediaUsage.EXECUTION_EVIDENCE`, cuarentena)

---

## 0. Problema

Los tickets de iWana no admiten archivos: ni al atender un caso ni al importarlo desde UISP. En UISP cada comentario puede llevar adjuntos (actas de visita en PDF, fotos del trabajo).

Caso real: el ZIP del cliente 22 trae **10 adjuntos** en `tickets/<ticket>/`, y cada comentario los referencia en `activity[].comment.attachments[]` con `id`, `filename`, `mimeType` y `size`. El parser los identifica (`attachmentPaths`), pero la promoción los descarta porque no hay dónde guardarlos.

## 1. Decisiones del usuario (2026-11-16)

| # | Decisión |
|---|---|
| A1 | **En cada comentario**, como en UISP. El adjunto hereda la visibilidad del comentario (visible para el cliente o interno). El detalle del ticket también los reúne. |
| A2 | **Fotos, PDF y videos cortos:** JPG, PNG, WebP y GIF y PDF hasta 25 MB; MP4 hasta 100 MB. |
| A3 | **Tickets importados ya promovidos:** el lote del cliente 22 se revierte y se reimporta; no hay botón para traer adjuntos a lotes viejos. |

## 2. Diseño

### 2.1 Modelo

- Tabla tenant nueva `ticket_comment_attachments`:
  - `id`, `tenant_id`, `ticket_id`, `comment_id` (FK a `ticket_comments`);
  - `media_asset_id` (el archivo vive en el módulo de medios);
  - `filename`, `content_type` y `size_bytes`;
  - `uploaded_by_user_id` y `created_at`;
  - `external_id` (`uisp:ticket_attachment:<id>`, índice único parcial por tenant) e `import_batch_id`.
- El archivo usa un uso nuevo del módulo de medios, **`TICKET_ATTACHMENT`**:
  - fotos (`image/jpeg`, `image/png`, `image/webp`, `image/gif`) y `application/pdf` hasta 25 MB;
  - `video/mp4` hasta 100 MB;
  - máximo **10 archivos por comentario**.
- La validación es por firma real del archivo (`magic-bytes`), nunca solo por extensión ni por el tipo que declara el navegador. Para MP4 se valida la caja `ftyp`.
- El nombre del archivo se sanea: sin rutas, sin caracteres de control y con un máximo de 200 caracteres.

### 2.2 Subir y ver

- **Subir:** el formulario de nuevo comentario acepta archivos. El comentario y sus adjuntos se crean en una sola operación (`multipart`): si un archivo es rechazado, no se guarda nada y el mensaje dice cuál y por qué.
- **Cuarentena:** igual que la evidencia de órdenes de trabajo, el archivo entra `QUARANTINED` y solo se puede abrir cuando queda `AVAILABLE`. Mientras tanto, el comentario muestra «En revisión». Si queda `REJECTED`, muestra «Archivo bloqueado» y no se descarga.
- **Ver:** bajo cada comentario, la lista de adjuntos con icono por tipo, nombre, tamaño y botón de abrir o descargar.
  - Las fotos se previsualizan en miniatura.
  - Los videos se reproducen en el navegador con el enlace firmado.
  - Los PDF se abren en una pestaña nueva.
- **Resumen:** el detalle del ticket tiene la sección **«Adjuntos (N)»** con todos los del caso. La lista de tickets de la ficha marca con un clip los que tienen adjuntos (requiere el conteo en la respuesta del listado).
- **Descarga:** por enlace firmado de corta duración (como el resto de medios), con `Content-Disposition` con el nombre saneado. Nunca una URL pública.
- **Visibilidad:** los adjuntos de comentarios internos nunca se exponen fuera del personal autorizado, con los mismos permisos que el comentario.
- **Borrado:** no hay borrado de adjuntos en esta fase, porque los comentarios tampoco se borran. Solo los retira la supresión de datos (§2.4) o la reversión de un lote importado.

### 2.3 Importación desde UISP

- La promoción, al crear cada comentario importado, crea sus adjuntos: busca cada `attachments[]` del comentario en `tickets/<ticket>/<filename>` del ZIP, valida con las mismas reglas de §2.1 y lo guarda en el bucket privado, en claro como los adjuntos subidos (v1.1, D1 aceptado: el enlace firmado no puede descifrar) (`external_id` = `uisp:ticket_attachment:<id>`, idempotente).
- Un comentario de UISP sin texto pero con adjuntos se importa con el texto vacío (v1.1, D4).
- Un adjunto ausente o rechazado no impide importar el comentario: se cuenta en el informe del lote como **«Adjuntos de tickets no importados: N»**, por motivo (archivo ausente, tipo no permitido, tamaño excedido).
- Los adjuntos importados entran como `AVAILABLE` tras la validación de firma, igual que los PDF de facturas importados. Si la cuarentena exige análisis asíncrono, se usa ese mismo flujo.
- La reversión del lote retira los adjuntos importados y sus archivos, junto con los comentarios.
- **Alexander (A3):** revertir el lote y reimportarlo. Las equivalencias (titular, plan, método de pago, usuarios) se conservan, así que vuelve a quedar complementado, con autores y con sus 10 adjuntos.

### 2.4 Privacidad y retención

- Los adjuntos son datos del titular: entran en el participante de supresión de Soporte (archivo y fila) y en el manifiesto de supresión.
- El nombre del archivo puede contener datos personales: se trata como texto libre del titular en el barrido de supresión.
- Si el almacenamiento cifra con la clave PII, se registra en el inventario K2.

### 2.5 Límites de subida

- **API:** la ruta de comentario con adjuntos admite hasta 110 MB por petición (video máximo más margen) y valida el `Content-Length` antes de leer el cuerpo, como la subida de lotes.
- **nginx de producción:** `client_max_body_size` de 110M solo en esa ruta. El resto sigue en 10M.
- **Proxy del portal:** ya admite 210 MB.

## 3. Cambios por capa

| Capa | Cambio |
|---|---|
| Contrato (`packages/shared`) | `MediaUsage.TICKET_ATTACHMENT`; esquema del adjunto (id, nombre, tipo, tamaño, estado: en revisión, disponible o bloqueado) en el comentario; conteo de adjuntos en el ticket del listado; motivos de importación |
| Base de datos (tenant) | Migración nueva: `ticket_comment_attachments` con FK, índice único parcial de `external_id` e índice por ticket; manifiesto de supresión e inventario K2 |
| Media | Uso `TICKET_ATTACHMENT` con límites por tipo; validación MP4; cuarentena reutilizada |
| Assurance | Crear comentario con adjuntos (multipart); listar adjuntos del comentario y del ticket; enlace firmado de descarga respetando la visibilidad; participante de supresión |
| Migración | Promoción y reversión de adjuntos importados; conteo en el informe |
| Portal | Selector de archivos en el comentario con validación previa (tipo, tamaño, 10 máx.); lista y vista previa por comentario; sección «Adjuntos (N)»; clip en la lista de la ficha; estados en revisión y bloqueado |
| Infra | Ruta de nginx a 110M |

## 4. Seguridad

- Validación por firma del archivo; nada de ejecutables ni documentos con macros.
- Cuarentena antes de servir el archivo.
- Descarga solo por enlace firmado y con los permisos del ticket.
- Los adjuntos internos nunca salen fuera del personal autorizado.
- Nombres saneados para evitar rutas e inyección en cabeceras.
- `Content-Length` validado antes de leer el cuerpo.

## 5. Criterios de aceptación

1. Un comentario con una foto, un PDF y un MP4 válidos se crea con sus tres adjuntos. Un archivo de tipo no permitido o que excede su tamaño se rechaza con mensaje claro y no se guarda nada.
2. Un adjunto en cuarentena se ve como «En revisión» y no se descarga; disponible, se abre (miniatura, video o PDF); rechazado, se ve «Archivo bloqueado».
3. Los adjuntos de un comentario interno no son accesibles por quien no puede ver comentarios internos.
4. El detalle del ticket lista todos sus adjuntos y la lista de la ficha marca los tickets con adjuntos.
5. Reimportar el cliente 22 trae sus 10 adjuntos, cada uno en su comentario. Repetir la importación no los duplica.
6. Un adjunto del ZIP ausente o inválido se cuenta en el informe y su comentario se importa igual.
7. Revertir el lote retira los adjuntos importados y sus archivos.
8. La supresión del titular elimina sus adjuntos.

## 6. Pruebas

- Unitarias: validación por firma (incluido MP4), límites por tipo, saneado de nombres y mapeo de adjuntos del ZIP.
- Integración contra Postgres: comentario con adjuntos; visibilidad interna; importación idempotente con adjuntos; reversión; supresión.
- Portal: selector con validación previa, estados de cuarentena, vista previa y sección de adjuntos.
- E2E: crear un comentario con adjuntos y abrirlos; importación sintética con adjuntos en comentarios.

## 7. Fuera de alcance

- Borrar o editar adjuntos.
- Documentos de oficina (Word, Excel) y otros formatos de video.
- Adjuntos al crear el ticket, fuera de un comentario.
- Botón para traer adjuntos a lotes ya promovidos (A3).
- Transcodificar videos o generar miniaturas en el servidor.
