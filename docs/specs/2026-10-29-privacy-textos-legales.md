# Spec — Privacy · Textos legales consumibles por el sistema

**Versión:** 1.2
**Estado:** Vigente — contrato congelado para la Ola 2 (B1 ∥ B2)
**Cambios:**
- v1.0, 2026-10-29: C4 registra la dependencia aprobada en E1 (precisión, sin bump).
- **v1.0 → v1.1, 2026-10-29:** resuelve el `[BLOQUEO]` de B1 (`INFORME-PRIVACY-TEXTOS-LEGALES-B1-v1.0.md`). C3 fija los roles de `PUT /privacy/purposes` (D-B1-1, §8). Ninguna otra cláusula cambia.
- **v1.1 → v1.2, 2026-10-29:** resuelve el `[BLOQUEO]` P1 de B4 (`INFORME-PRIVACY-TEXTOS-LEGALES-B4-SEC-v1.0.md`) con la decisión D-B4-1 (§8): `RolesGuard` en los controladores de `privacy`. C2 precisa que lo hace un token de tenant. Ninguna otra cláusula cambia.
**Fecha:** 2026-10-29
**Emitido por:** AI-EM-ARCH (modo Product Architect + Architect)
**Superficie:** `/dashboard/privacy?view=legal` («Textos legales») y las tres superficies de captura de autorización
**Plan:** [`docs/plans/2026-10-29-privacy-textos-legales.md`](../plans/2026-10-29-privacy-textos-legales.md) · **Prompt:** [`PROMPT-PRIVACY-TEXTOS-LEGALES-v1.0.md`](../prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-v1.0.md)
**Anexo (textos fuente de Iwana S.A.S.):** [`2026-10-29-privacy-textos-legales-anexo-iwana-v1.md`](2026-10-29-privacy-textos-legales-anexo-iwana-v1.md)

## 1. Base normativa

| Artefacto | Estado | Qué aporta |
| --- | --- | --- |
| [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) | Aprobado | D6: `legal_texts` por tenant, contenido inmutable y autorización ligada a la versión exacta; «iWana provee plantillas, el texto lo aprueba cada ISP». D8: formulario público y centrales de riesgo en fases posteriores. §7 punto 3: los puntos ⚠ van a dictamen y bloquean producción |
| [HLD-PRIVACY-HABEAS-DATA-v1.1](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.1.md) | Vigente | `privacy/legal-texts/` con `current` por tipo; lectura entre módulos solo por puertos |
| [PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.2](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.2.md) A14 | Ejecutado (Fase 1a) | Vigente = `published_at` más reciente, fijado por el servidor |
| [Spec UX privacy Fase 1](2026-10-14-privacy-fase-1-ux-spec.md) §9 | Vigente | Side peek, copiar la huella completa, confirmar antes de publicar, sin editar ni eliminar |
| Política de Tratamiento de Iwana S.A.S. v1 (vigente desde 21-oct-2026, publicada en https://iwana.co/privacidad/) | Insumo del ISP | Fuente de las finalidades declaradas y de los tres textos del anexo |

Esta spec **no** modifica ADR-094: lo implementa. La configuración de finalidades por tenant (C3) concreta el «texto lo aprueba cada ISP» de D6 sobre la parte que el sistema ofrece en la captura.

## 2. Problema verificado en código (2026-10-29)

| # | Hallazgo | Evidencia |
| --- | --- | --- |
| P1 | Solo se consume `AUTORIZACION`; `POLITICA_TRATAMIENTO` y `AVISO_PRIVACIDAD` no tienen lector | `crm/expedientes/expediente.service.ts:1525-1566`, `crm/potentials/potentials.service.ts:120-188`, `crm/subscribers/subscribers.service.ts:615-633` |
| P2 | `GET /privacy/legal-texts/current` exige `ADMIN`/`AUDITOR` + `privacy.read`, pero el alta de suscriptor y el expediente lo llaman para cualquier usuario. Un comercial recibe 403, el `catch` lo muestra como «no hay texto vigente» y la captura queda bloqueada con un diagnóstico falso | `apps/api/src/modules/privacy/legal-texts/legal-texts.controller.ts:48-50`; `apps/portal/src/components/crm/subscribers/SubscriberForm.tsx:217-234`; `apps/portal/src/components/crm/expedientes/ConsentsPanel.tsx:137-153` |
| P3 | La captura ofrece «Datos biométricos (opcional)» a clientes, contra la política de Iwana §7.3 y §8 | `apps/portal/src/components/privacy/CompliancePanel.tsx:19-23`; `SubscriberForm.tsx:319` |
| P4 | El contenido se muestra como texto plano (`<pre>` / `whitespace-pre-wrap`); la política tiene títulos, listas y tablas | `PrivacyWorkspace.tsx:528-557`; `CompliancePanel.tsx:235-237` |
| P5 | Deuda de la spec UX §9: modal en lugar de side peek, sin copiar huella, sin confirmación. Con solo `privacy.read`, `?view=legal` queda en blanco | `PrivacyWorkspace.tsx:528-557`, `:944` |
| P6 | No hay textos fuente versionados del ISP piloto | `RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md:38` (`AUTHORIZATION_JSON` fuera del repo) |

## 3. Contrato congelado

### C1 — Formato del texto

- **Migración tenant nueva** (próximo número libre al ejecutar; hoy la última es `165_…`, y se verifica contra el plan MOD13 de retiro de la columna LAN antes de numerar): `ALTER TABLE legal_texts ADD COLUMN format text NOT NULL DEFAULT 'PLAIN'` con `CHECK (format IN ('PLAIN','MARKDOWN'))`. `down` elimina la columna.
- El trigger `trg_legal_texts_append_only` (migración 146) **no se toca**. Un `ADD COLUMN` con default no es `UPDATE`, así que no lo dispara; la prueba de integración lo demuestra.
- Las filas existentes quedan `PLAIN`. **Motivo:** un texto que un titular ya aceptó se sigue presentando exactamente como lo vio, que es la fidelidad de la evidencia.
- `packages/shared/src/schemas/privacy/legal-texts.ts`:
  - `legalTextFormatSchema = z.enum(['PLAIN','MARKDOWN'])`.
  - `createLegalTextSchema.format`: opcional, `default('PLAIN')`.
  - `legalTextSchema.format`: obligatorio.
- El hash **no cambia**: SHA-256 hexadecimal del `content` UTF-8, sin incluir `format`. La entidad `legal-text.entity.ts` deja de duplicar `LegalTextType` e importa los tipos de `@iwana/shared`.

### C2 — Lectura de la versión vigente

- `GET /privacy/legal-texts/current?type=`: se retiran `@Roles(ADMIN, AUDITOR)` y `@Permissions(PRIVACY_READ)`. Quedan `JwtAuthGuard` y el tenant del JWT. *(v1.2)* El lector previsto es un usuario con token de tenant; la lectura con token de plataforma y `X-Tenant-Slug` es un residual aceptado (D-B4-1). **Motivo:** el texto vigente es contenido que se lee al titular para pedirle la autorización; no es un dato reservado, y quien captura no es necesariamente ADMIN.
- `GET /privacy/legal-texts` y `POST /privacy/legal-texts` conservan sus guardas actuales.
- La respuesta incluye `format` (C1). El 404 sigue siendo `PRIVACY_LEGAL_TEXT_NOT_PUBLISHED`.
- **Portal:** solo el 404 se presenta como «no hay texto vigente». Cualquier otro error muestra «No fue posible cargar el texto vigente» y conserva la acción de reintentar. Ya no se enmascara un 403.

### C3 — Finalidades habilitadas por empresa

- **Tabla tenant** `privacy_purpose_settings`, propiedad de `privacy`:

| Columna | Tipo | Regla |
| --- | --- | --- |
| `purpose` | text PK | `CHECK` sobre los valores de `dataPurposeSchema` |
| `enabled` | boolean NOT NULL | — |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | — |
| `updated_by` | uuid NULL | usuario del último cambio |

- La migración siembra **todas** las finalidades con `enabled = true`, así que no cambia la conducta de ningún tenant existente. Una finalidad que se agregue después a `dataPurposeSchema` exige su propia fila en una migración.
- **Contratos** en `packages/shared/src/schemas/privacy/purposes.ts`:
  - `purposeSettingSchema = { purpose, enabled }`.
  - `updatePurposeSettingsSchema = { items: purposeSettingSchema[] }` (estricto, sin duplicados).
- **Endpoints:**
  - `GET /privacy/purposes`, solo con `JwtAuthGuard`: devuelve todas las finalidades con su `enabled`.
  - `PUT /privacy/purposes`, con `@Roles(UserRole.ADMIN, UserRole.AUDITOR)` + `@Permissions(PRIVACY_MANAGE)`, la misma pareja que declaran todos los handlers `privacy.manage` del módulo: reemplaza los valores enviados y audita el antes y el después en `AuditService`, con la entidad `PrivacyPurposeSetting`. Sin excepción al invariante `access-permission-catalog.invariant.spec.ts` (D-B1-1).
- **Reglas:**
  - `TRATAMIENTO_CONTRACTUAL` no se puede deshabilitar: 422 `PRIVACY_PURPOSE_REQUIRED`.
  - `authorizations.service` rechaza `granted = true` sobre una finalidad deshabilitada: 422 `PRIVACY_PURPOSE_DISABLED`.
  - Siempre se aceptan las revocaciones, `granted = false` y `LEGACY_IMPORT`, porque la historia del titular no se puede bloquear.
  - Deshabilitar una finalidad no modifica autorizaciones existentes. Las vigentes siguen vigentes hasta que se revoquen.
- **Puerto** `IPrivacyPurposeReadPort.enabledPurposes(): Promise<DataPurpose[]>`, exportado por `privacy.module.ts`. CRM lo consume si valida finalidades en sus flujos de captura (expediente, potencial, alta directa). Ningún módulo lee la tabla directamente.

### C4 — Presentación (`LegalTextContent`)

- Es un único componente del portal, en `apps/portal/src/components/privacy/LegalTextContent.tsx`, que recibe `{ content: string; format: 'PLAIN' | 'MARKDOWN' }`.
- Con `PLAIN` conserva el comportamiento actual (`whitespace-pre-wrap`).
- Con `MARKDOWN` renderiza solo títulos `#`–`###`, párrafos, listas, tablas GFM, negrita o cursiva, y enlaces `http`/`https` con `target="_blank" rel="noopener noreferrer"`. Queda **prohibido**: HTML crudo (se omite, no se escapa a la vista), imágenes, esquemas `javascript:`/`data:` y atributos de estilo.
- **Tokens:** tipografía y tablas con los tokens reales de `packages/ui/src/styles/globals.css`. Una tabla se desplaza horizontalmente dentro de su contenedor en móvil; la página no se desborda.
- **Consumidores obligatorios:** `LegalTextsSurface` (peek), `CompliancePanel`, `SubscriberForm` y `ConsentsPanel`.
- **Dependencia (E1 aprobada por el CTO el 2026-10-29):** `react-markdown` 10.1.0 + `remark-gfm` 4.0.1, registradas en [`Stack_Tecnologico.md`](../prds/Stack_Tecnologico.md). Uso obligatorio:
  - `skipHtml`;
  - `allowedElements` limitado a `h1`–`h3`, `p`, `ul`, `ol`, `li`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `strong`, `em` y `a`;
  - `urlTransform`, que devuelve vacío para todo lo que no sea `http`/`https`;
  - `components.a` con `target="_blank" rel="noopener noreferrer"`.

  Nunca `rehype-raw` ni `dangerouslySetInnerHTML`. Se instalan solo en `apps/portal` con `pnpm add --filter @iwana/portal`.

### C5 — Superficie «Textos legales» (UX)

Cierra la deuda de la spec UX §9:

1. El formulario «Crear nueva versión» agrega el campo **Formato** («Texto con formato» = `MARKDOWN`, por defecto para los tipos nuevos, y «Texto simple» = `PLAIN`), junto a una **vista previa** con `LegalTextContent` antes de publicar.
2. **Confirmación** antes de publicar: «Vas a publicar la versión {v} de {tipo}. No se puede editar ni eliminar después. Las nuevas autorizaciones usarán este texto.»
3. El detalle se abre en un **side peek** en lugar del modal. Muestra el tipo, la versión, la fecha, el enlace, la huella completa con un botón **Copiar huella** y el contenido renderizado.
4. **Solo lectura:** con `privacy.read` y sin `privacy.manage`, `?view=legal` muestra el listado y el peek sin la acción de crear. Ya no queda la pantalla en blanco.
5. **Sección «Finalidades que declara tu política»** (solo con `privacy.manage`): un interruptor por finalidad con su etiqueta de `DATA_PURPOSE_LABELS`. «Prestación del servicio, facturación y soporte» aparece fija y deshabilitada, con la nota «Siempre requerida».
6. **Vocabulario:** las etiquetas visibles no exponen `MARKDOWN`, `PLAIN`, `sha256` ni nombres de enum. «Huella» sustituye a «SHA-256».

### C6 — Consumidores de la autorización

En `CompliancePanel`, `SubscriberForm` y `ConsentsPanel`:

- La lista de finalidades ofrecidas = las finalidades de la superficie ∩ `GET /privacy/purposes` habilitadas.
- El texto de autorización se muestra con `LegalTextContent`.
- Debajo del texto aparecen los enlaces «Política de tratamiento» y «Aviso de privacidad». Cada uno abre un peek de solo lectura con la versión vigente de ese tipo. Si no hay versión publicada, el enlace no se muestra (no es un bloqueo).
- C2 resuelve la distinción entre el 404 y el resto de errores.

## 4. Criterios de aceptación

| ID | Criterio | Verifica |
| --- | --- | --- |
| CA-LT-01 | Una fila existente de `legal_texts` queda con `format = 'PLAIN'` tras la migración, y `UPDATE`/`DELETE` siguen rechazados (55000) | integración Postgres (B1) |
| CA-LT-02 | `POST` con `format: 'MARKDOWN'` produce el mismo `sha256` que el mismo `content` con `PLAIN` | unitaria del servicio (B1) |
| CA-LT-03 | Un usuario autenticado sin rol ADMIN/AUDITOR ni `privacy.read` obtiene 200 en `GET current` y 403 en `GET list` y en `POST` | e2e API (B1) |
| CA-LT-04 | `PUT /privacy/purposes` deshabilitando `TRATAMIENTO_CONTRACTUAL` → 422 `PRIVACY_PURPOSE_REQUIRED` | e2e API (B1) |
| CA-LT-05 | Con `DATOS_BIOMETRICOS` deshabilitada, la autorización `granted=true` da 422 `PRIVACY_PURPOSE_DISABLED`; la revocación de una autorización previa da 201 | integración Postgres (B1) |
| CA-LT-06 | El `PUT` de finalidades deja un registro de auditoría con antes y después, sin PII | integración (B1) |
| CA-LT-07 | `LegalTextContent` con `<script>`, `<img onerror>` y `[x](javascript:…)` no ejecuta nada ni produce esos nodos | unitaria portal (B3) |
| CA-LT-08 | El peek de la política renderiza la tabla de la §10 como `<table>` con encabezados | unitaria portal + navegador (B3) |
| CA-LT-09 | Un usuario comercial puede capturar la autorización en el expediente con un texto `MARKDOWN` vigente | E2E Playwright (B3) |
| CA-LT-10 | Con una finalidad deshabilitada, ninguna de las tres superficies de captura la ofrece | unitaria portal + E2E (B3) |
| CA-LT-11 | Publicar exige confirmar; copiar la huella deja los 64 caracteres en el portapapeles | E2E (B3) |
| CA-LT-12 | Con solo `privacy.read`, `?view=legal` muestra el listado sin la acción de crear | unitaria portal (B3) |
| CA-LT-13 | `audit-ui.mjs` sin P0/P1 sobre los archivos tocados | B2 |

## 5. Impacto

- **Multi-tenant:** todo vive en el schema del tenant. La siembra en `true` preserva la conducta de los ISP existentes. Las finalidades de Iwana se ajustan solo en `tenant_iwana` (B5).
- **Seguridad:**
  - Apertura de `current` dentro del tenant autenticado (C2).
  - Superficie XSS nueva por el render (C4), mitigada sin HTML crudo y cubierta por CA-LT-07.
  - `PUT` auditado. Lo revisa `sec-eng` (B4).
- **Escala:** a lo sumo 4 filas de finalidades por tenant. `current` y `purposes` son lecturas pequeñas y cacheables en cliente durante la sesión.
- **Regulación:** cierra la contradicción entre la captura y la política del responsable (Ley 1581 de 2012, art. 4, principio de finalidad). Publicar el Aviso y la Autorización de Iwana depende de la aprobación del ISP y del dictamen de ADR-094 §7 punto 3.

## 6. Divergencias declaradas, sin corrección en esta fase

- **Fecha de vigencia.** La política dice «vigente desde el 21 de octubre de 2026»; `published_at` será la fecha real de publicación en `tenant_iwana`. A14 prohíbe fijar fechas desde el cliente. La vigencia declarada queda en el contenido. Cualquier autorización capturada antes de la publicación sigue ligada a la versión que se publicó entonces, si la hubo.
- **Equivalencia con el PDF del sitio.** El anexo normaliza a Markdown el texto del archivo fuente. La equivalencia con el PDF publicado es de **contenido**, no de bytes: el `sha256` del sistema no coincide con el hash del PDF, y no se pretende que coincida.
- **Domicilio frente a radicación escrita.** El domicilio del responsable está en Bogotá y la radicación escrita se hace en El Colegio. Así lo dice la política (§2 y §13); no es un error de transcripción.

## 7. Fuera de alcance

- Endpoint público y formulario de radicación (ADR-094 D8).
- Uso en `apps/web` y en el PDF del contrato.
- Retiro del legado `crm/habeas-data` (`legalTextVersion` libre, sin hash): se registra como deuda media en el informe de la fase.
- Notificación masiva de cambios de política (política §17).
- Franjas de la Ley 2300 (ADR-094 D8).
- Columna `valid_from`.

## 8. Decisiones durante la ejecución

### D-B1-1 — Roles de `PUT /privacy/purposes` (2026-10-29)

`[DESEMPATE]`
- **Área RACI:** autorización de un endpoint nuevo (B1 `sr-backend`; invariante de access-control).
- **Posiciones:**
  - (a) Documentar una excepción al invariante para que `privacy.manage` gobierne solo.
  - (b) Declarar roles en una versión nueva del contrato.
- **Decisión:** (b), con `@Roles(UserRole.ADMIN, UserRole.AUDITOR)`.
- **Justificación:**
  1. **Precedente uniforme:** los 17 handlers `privacy.manage` del módulo declaran exactamente esa pareja, en `legal-texts`, `authorizations`, `evidence`, `incidents` y `requests`. La spec v1.0 la omitió por descuido, no por diseño.
  2. **No cambia quién administra:** los controladores de `privacy` usan `JwtAuthGuard` + `PermissionsGuard`, `RolesGuard` no es global (`app.module.ts` solo registra `CsrfGuard` y `ThrottlerGuard` como `APP_GUARD`) y `PermissionsGuard` no evalúa roles. La autorización efectiva sigue siendo `privacy.manage`, igual que en el resto del módulo.
  3. **Una excepción** debilitaría un invariante de gobernanza para un caso que el precedente ya resuelve.
- **Registro en:** esta §8 y el plan §6.

**Hallazgo derivado, no se corrige en esta ola:** en `privacy`, `@Roles` es declarativo y no se ejecuta. Aplicar `RolesGuard` cambiaría a quién llega hoy el perfil «Oficial de protección de datos». Lo evalúa `sec-eng` en B4: decide si es un riesgo y, si exige código, abre un bloque con su propia decisión.

### D-B4-1 — `RolesGuard` en los controladores de `privacy` (2026-10-29)

`[DESEMPATE]`
- **Área RACI:** autorización del módulo `privacy` (P1 de B4 `sec-eng`; dueño de la corrección: `sr-backend`).
- **Hallazgo verificado por AI-EM-ARCH en código:**
  - `PermissionsGuard` devuelve `true` a todo token `type === 'platform'` (`permissions.guard.ts:40`).
  - `TenantMiddleware` resuelve el tenant desde `X-Tenant-Slug` cuando el token no es de tenant (`tenant.middleware.ts:90-132`).
  - Los **9** controladores de `privacy` (`authorizations`, `evidence`, `incidents`, `inventory`, `legal-texts`, `marks`, `purposes`, `requests`, `retention`) montan `JwtAuthGuard` + `PermissionsGuard` sin `RolesGuard`.
  - Resultado: un token de plataforma válido, con el slug de una empresa, alcanza todas las rutas de `privacy`, mutaciones incluidas. Ningún otro controlador del API reproduce el patrón: de los 37 con `PermissionsGuard`, los otros 28 montan `RolesGuard`.
- **Posiciones:**
  - (a) Aplicar `RolesGuard` en los 9 controladores.
  - (b) Quitar el bypass de plataforma de `PermissionsGuard`.
- **Decisión:** (a). El orden de guards es `JwtAuthGuard, RolesGuard, PermissionsGuard`, igual que en `ExecutionOrdersController`.
- **Justificación:**
  1. **Cierra la clase de fallo en su origen.** `RolesGuard` ya valida que la procedencia del rol coincida con el tipo de token (H-01, ADR-061 §4): un token de plataforma no satisface `@Roles(ADMIN, AUDITOR)`.
  2. **No quita acceso a nadie de la empresa.** `privacy.read` y `privacy.manage` solo son asignables a ADMIN y AUDITOR (`ROLE_ASSIGNABLE_PERMISSION_MATRIX`; la plantilla «Acceso estándar Auditoría» los excluye explícitamente). El perfil «Oficial de protección de datos» (migración 147) tiene rol base AUDITOR y conserva su acceso.
  3. **(b) es transversal.** Cambiaría la conducta de los 28 controladores restantes y de las consolas de plataforma, fuera del alcance de esta fase. Si se quiere, se propone aparte.
- **Residual aceptado:** las rutas sin `@Roles`, que son `GET /privacy/legal-texts/current` y `GET /privacy/purposes`, siguen siendo legibles con un token de plataforma y slug. **Motivo:** su contenido es el texto vigente publicado y el estado de 4 finalidades, información destinada al titular y sin datos personales. Declararles roles de tenant contradiría C2 sin beneficio de seguridad.
- **Impacto en fases cerradas:** el defecto existe desde la Fase 1a de privacy (G6.5 GO). No llegó a producción porque G7 está diferido hasta la beta. La corrección vale para todo el módulo, no solo para esta fase, y se registra en el informe de cierre de la fase.
- **Registro en:** esta §8, el plan §6 y el bloque B6 del prompt v1.2.

