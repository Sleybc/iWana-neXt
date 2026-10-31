# INFORME — Privacy · Textos legales consumibles por el sistema — cierre de fase

**Versión:** 1.4
**Cambios:** v1.4 (2026-10-30) registra el cierre de B5 en desarrollo (§11.4) y el bloque B8 de historial de versiones ([informe B8](INFORME-PRIVACY-TEXTOS-LEGALES-B8-v1.0.md)); v1.1–v1.3 cubrieron G6, G6.5 y la preparación de B5.
**Ruta estable:** el sufijo `v1.0` del nombre es el del alta; la versión vigente es la de esta cabecera.
**Estado:** **G6 GO** (§9) · **G6.5 GO** sobre `05558a7a`, CI 40969812059 (§10) · **B5 cerrado en desarrollo** (2026-10-30, §11.4); pendiente en producción, en la ventana de G7, con el runbook v1.1
**Fecha:** 2026-10-29
**Autor:** AI-EM-ARCH (modo EM + Orchestrator)
**Plan:** [`docs/plans/2026-10-29-privacy-textos-legales.md`](../plans/2026-10-29-privacy-textos-legales.md) v1.2 · **Spec:** [`docs/specs/2026-10-29-privacy-textos-legales.md`](../specs/2026-10-29-privacy-textos-legales.md) v1.2 · **Anexo:** [`2026-10-29-privacy-textos-legales-anexo-iwana-v1.md`](../specs/2026-10-29-privacy-textos-legales-anexo-iwana-v1.md) v1.0

## 1. Resultado

La superficie «Textos legales» (`/dashboard/privacy?view=legal`) deja de ser un almacén que solo se lee para capturar la autorización:

- **Formato fiel.** La Política, el Aviso y la Autorización se publican en Markdown seguro; las filas existentes conservan el texto plano con el que fueron aceptadas.
- **Captura desbloqueada.** Un usuario comercial lee el texto vigente sin el 403 que antes se mostraba como «no hay texto vigente».
- **Finalidades por empresa.** La captura solo ofrece las finalidades que declara la política de cada empresa.
- **Textos de Iwana listos.** Los tres textos fuente de Iwana S.A.S. quedan en el anexo: la política tal como la aprobó el responsable, y el aviso y la autorización como borradores.
- **Hallazgo de seguridad corregido.** Al revisar la fase se encontró y corrigió un defecto heredado de la Fase 1a: un token de plataforma con `X-Tenant-Slug` alcanzaba todo el módulo `privacy`.

## 2. Bloques

| Bloque | Responsable | Estado | Informe |
| --- | --- | --- | --- |
| B0 | AI-EM-ARCH | Cerrado | spec, anexo, plan, prompts y launchers |
| E1 | CTO | Aprobada: `react-markdown` 10.1.0 + `remark-gfm` 4.0.1, registradas en `Stack_Tecnologico.md` | plan §6 |
| B1 | `sr-backend` | Cerrado (tras el `[BLOQUEO]` resuelto con D-B1-1) | [B1 v1.1](INFORME-PRIVACY-TEXTOS-LEGALES-B1-v1.0.md) |
| B2 | `fe-platform` | Cerrado | [B2 v1.1](INFORME-PRIVACY-TEXTOS-LEGALES-B2-v1.0.md) |
| B3 | `sr-qa` | Cerrado | [B3-QA v1.0](INFORME-PRIVACY-TEXTOS-LEGALES-B3-QA-v1.0.md) |
| B4 | `sec-eng` | Cerrado (P1 → D-B4-1 → re-verificado) | [B4-SEC v1.1](INFORME-PRIVACY-TEXTOS-LEGALES-B4-SEC-v1.0.md) |
| B6 | `sr-backend` | Cerrado | [B6 v1.0](INFORME-PRIVACY-TEXTOS-LEGALES-B6-v1.0.md) |
| MOD13 B3 | `sr-backend` (obra MOD13) | Cerrado: fixture WFM que bloqueaba el typecheck de API | [informe MOD13 §8.9](INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md) |
| B5 | Humano (Oficial / ADMIN del tenant de Iwana) | **Pendiente** | — |

## 3. Gates Before Merge (`AGENTS.md`) — evidencia de G6

| Gate | Resultado | Evidencia |
| --- | --- | --- |
| No critical vulnerabilities | **PASS** | Re-ejecutado por AI-EM-ARCH: `pnpm audit --prod --audit-level critical` da 0 críticas. Las 9 existentes (3 altas: `zod`, `body-parser`, `multer`; 5 moderadas; 1 baja) son previas y están en `apps/api` o en `csv-parse` del portal; ninguna viene de las dependencias de E1. B4 v1.1: sin P0/P1 |
| No boundary violations | **PASS** | Re-ejecutado por AI-EM-ARCH: ningún import a `modules/privacy/` desde otro módulo fuera de los puertos, y ningún SQL a `legal_texts` o `privacy_purpose_settings` fuera de `privacy`. CRM consume `IPrivacyLegalTextReadPort` e `IPrivacyPurposeReadPort` |
| Tests ≥ 80 % core modules | **PASS** | B3: API `modules/privacy` 96,26 % líneas / 85,14 % ramas; shared `schemas/privacy` 100 %; portal (privacy y consumidores) 89,94 % / 80,58 %. Sin caché |
| OpenAPI updated | **PASS** | B1: `privacy-openapi.schemas.ts` con `format` y `/privacy/purposes`, cubierto por las pruebas de OpenAPI de la suite de privacy |
| Migrations reversible | **PASS** | B1: migración tenant 166 con `up → down → up` contra PostgreSQL real (11 pruebas) e incluida en el inventario de reversiones destructivas |
| No PII in logs | **PASS** | B4: la auditoría del `PUT` de finalidades guarda solo finalidad y estado; la de `legal_texts` no incluye el contenido. Fixtures sintéticos o del anexo |
| Lint and typecheck passing | **PASS** | Re-ejecutado por AI-EM-ARCH tras MOD13 B3: `typecheck` de `@iwana/api`, `@iwana/shared` y `@iwana/portal`, y `lint` de `@iwana/api`, `@iwana/shared`, `@iwana/portal` y `@iwana/db`, todos con código 0 |

**Pruebas:**

| Suite | Conteo | Quién lo ejecutó |
| --- | --- | --- |
| API `modules/privacy` + invariante de permisos, sin caché | 36 suites, 187 pruebas | AI-EM-ARCH, tras B6 |
| Shared `schemas/privacy` | 4 suites, 22 pruebas | B3 |
| Portal: suite completa | 330 suites, 3326 pruebas, 1 omitida previa y ajena | B2 |
| Portal: specs de privacidad | 8 suites, 77 pruebas | B3 |
| PostgreSQL: integración de la migración 166 | 11 pruebas | B1 |
| PostgreSQL: integración de finalidades | 1 prueba | B1 |
| PostgreSQL: migración DPO 147 | 2 pruebas | B6 |
| E2E B3 | 3/3 | B3; repetido por B6 |
| WFM + `organization` + `network-catalog` | 6 suites, 95 pruebas | MOD13 B3 |

**Criterios de aceptación:** CA-LT-01 a CA-LT-13 en verde (spec §4).

**Dictamen G6: GO** *(revocado en v1.1, §8)*. El aprobador no es el productor: los bloques los produjeron los subagentes y AI-EM-ARCH consolidó y re-ejecutó los gates indicados.

## 4. Decisiones de la fase

| ID | Decisión | Registro |
| --- | --- | --- |
| D1–D3 | El aviso y la autorización los redacta AI-EM-ARCH; finalidades por empresa; Markdown seguro | plan §2 |
| E1 | `react-markdown` + `remark-gfm` con `skipHtml`, `allowedElements` y `urlTransform` limitado a http/https | spec C4, `Stack_Tecnologico.md` |
| D-B1-1 | `PUT /privacy/purposes` con `@Roles(ADMIN, AUDITOR)` + `privacy.manage`; sin excepción al invariante | spec §8 |
| D-B4-1 | `RolesGuard` en los 9 controladores de `privacy`; no se toca `PermissionsGuard`; residual aceptado en `GET current` y `GET purposes` | spec §8 |
| Fixture WFM | Lo corrige la obra MOD13 que cambió el puerto (decisión del usuario) | plan MOD13 v1.1 §6 |

## 5. Deuda por severidad

| Severidad | Deuda | Origen |
| --- | --- | --- |
| Crítica | Ninguna | — |
| Alta | Ninguna nueva. Hay 3 vulnerabilidades altas previas en dependencias de `apps/api` (`zod`, `body-parser`, `multer`), ajenas a esta fase; se registran para el próximo `codebase-cleanup-deps-audit` | `pnpm audit` |
| Media | Legado `crm/habeas-data` con `legalTextVersion` libre y sin hash, todavía montado | spec §7 |
| Media | `PermissionsGuard` deja pasar cualquier token `platform`. En esta fase lo neutraliza `RolesGuard` en los 9 controladores de `privacy`, pero sigue siendo una conducta transversal y queda como propuesta aparte | D-B4-1 (b) |
| Baja | Sin columna `valid_from`; la vigencia declarada vive en el contenido | spec §6 |
| Baja | La Política aún no se consume en `apps/web` ni en el PDF del contrato | spec §7 |

**Hallazgo sobre una fase cerrada:** el defecto de D-B4-1 existía desde la Fase 1a de privacy, que ya tenía G6.5 GO. No hubo exposición en producción, porque G7 está diferido hasta la beta. La corrección cubre el módulo completo.

## 6. Pendientes para G6.5 y B5

1. **Commit separado por obra.** El árbol de `main` mezcla esta fase con trabajo sin commitear de MOD13 (catálogo de routers y organización, §8.8 y §8.9) y otras rutas. El commit de esta fase debe incluir **solo** sus archivos: los de privacy, los contratos `schemas/privacy`, la migración 166, los consumidores CRM y del portal, el `pnpm-lock.yaml` con las dos dependencias de E1 y los documentos de la fase. El fixture WFM viaja con la obra MOD13. **Riesgo:** si se commitea privacy sin MOD13, el árbol del commit **no** contiene el cambio de puerto de §8.8 y el mock WFM sigue compilando; si se commitea MOD13 sin su fixture, el CI vuelve a rojo. Hay que mantener juntos el puerto y el fixture.
2. **G6.5:** CI de `main` en verde sobre el SHA del commit (ADR-069), registrado aquí.
3. **B5:**
   - aprobación del Aviso y la Autorización por Iwana S.A.S. y dictamen jurídico (ADR-094 §7 punto 3);
   - en el tenant de Iwana, desactivar `DATOS_BIOMETRICOS` y `REPORTE_CENTRALES_RIESGO`;
   - publicar los tres textos del anexo en orden Política → Aviso → Autorización, con `format: MARKDOWN` (runbook de release por tenant, Paso 7).

## 7. Métricas de la fase

- **Reescrituras de la spec:** 2 versiones (v1.1 por D-B1-1 y v1.2 por D-B4-1); ninguna reabrió alcance.
- **Bloqueos:** 2, los dos resueltos en la sesión siguiente.
- **Desempates:** 2.
- **Escalaciones al CTO:** 1 (E1), resuelta.
- **Hallazgos post-merge:** sin instrumentar (aún no hay merge).

## 8. v1.1 — G6 revocado por la corrida de CI (2026-10-29)

**Commit y push:** `4d54799e` en `origin/main`, solo con las 78 rutas de la fase.

**CI 40961614745 sobre `4d54799e`: falla.**
- Job «Lint + Typecheck + Build + Unit tests», paso «Unit tests + gate de cobertura».
- `@iwana/api#test` sale con `1 failed, 4 skipped, 434 passed` (439 suites; 5833 pruebas aprobadas y 15 omitidas).
- Suite rota: `src/modules/crm/subscribers/tests/subscribers.module.spec.ts`, con `SyntaxError: Unexpected token 'export'`. AI-EM-ARCH la reprodujo en local.
- **En verde en esa misma corrida:** db (77/423), worker (21/173), portal (331 suites, 3347 pruebas, 1 omitida), web (38/233), E2E portal, E2E R4.1, integridad de citas ADR e imágenes production. «E2E Web Admin Smoke» (40961615073) también pasó.

**Causa:** B6 añadió `imports: [AuthModule]` a `PrivacyModule` para resolver `RolesGuard`. Eso carga `auth.service` → `otplib`, que es ESM, en toda prueba que componga `SubscribersModule` → `PrivacyModule`. El import era innecesario: `tasks` y `crm` usan `RolesGuard` sin importar `AuthModule`.

**Por qué no se detectó:** B6 corrió `modules/privacy` y el invariante; AI-EM-ARCH re-ejecutó esas mismas suites, el typecheck y el lint. **Ninguno corrió la suite completa de `@iwana/api`** después de cambiar el cableado de un módulo que otros importan. El dictamen G6 se apoyó en suites focales para un cambio con efecto transversal: es un error de este consolidador.

**Corrección:** bloque B7 ([`PROMPT-PRIVACY-TEXTOS-LEGALES-B7-v1.0.md`](../prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-B7-v1.0.md), launcher `-B7-LAUNCH-v1.0.md`). Retira `AuthModule` de `PrivacyModule` y exige la suite completa de API con 0 fallidas. Luego se vuelve a dictaminar G6 y G6.5 sobre el nuevo SHA.

**Regla para esta y próximas fases:** si un cambio toca el `@Module` de un módulo que otros importan, G6 exige la suite completa de los paquetes afectados, no solo la del módulo.

## 9. v1.2 — B7 cerrado y G6 re-dictaminado (2026-10-29)

**B7** ([informe](INFORME-PRIVACY-TEXTOS-LEGALES-B7-v1.0.md)):
- Retiró `AuthModule` de `PrivacyModule` y el mock de `otplib` de su prueba de composición.
- Añadió una prueba que compone `PurposesController` sin `AuthModule`: un token de plataforma recibe 403 y no se ejecuta la actualización.
- Los 9 `@UseGuards` no cambian.
- Typecheck y lint de `@iwana/api` con código 0. Lint reporta 7 warnings, todos en archivos ajenos al cambio.

**Re-ejecución de AI-EM-ARCH**, suite **completa** de `@iwana/api` sin caché (`jest --runInBand --no-cache`): 435 suites aprobadas, 4 omitidas, 0 fallidas (439 en total); 5841 pruebas aprobadas y 15 omitidas. Las 4 suites y 15 pruebas omitidas son las mismas que en el CI 40961614745.

**Dictamen G6: GO.** El resto de gates de §3 no cambia: B7 solo quita un import y ajusta una prueba de composición.

**G6.5:** se registra cuando el CI de `main` termine sobre el SHA de B7.

## 10. v1.3 — G6.5 (2026-10-29)

**Commits de la fase en `origin/main`:**
- `4d54799e`: la fase, con 78 rutas.
- `05558a7a`: B7, con 7 rutas.

Las 30 rutas de MOD13 y organización siguen sin commitear y quedan fuera de este gate.

**CI [40969812059](https://github.com/Sleybc/iWana-neXt/actions/runs/40969812059) sobre `05558a7a`: success** (22:58–23:12 UTC). Los 5 jobs terminaron en success: «Lint + Typecheck + Build + Unit tests», «E2E portal», «E2E operativo R4.1 — API + storage + BullMQ reales», «Integridad de citas ADR» y «Build y validación de imágenes production». «E2E Web Admin Smoke» (40969812090) también pasó.

**Conteos del job de unit tests** (`Cached: 0`):

| Paquete | Suites | Pruebas |
| --- | --- | --- |
| api | 435 aprobadas, 4 omitidas (439) | 5836 aprobadas, 15 omitidas |
| portal | 331 | 3347, 1 omitida |
| db | 77 | 423 |
| shared | 26 | 243 |
| web | 38 | 233 |
| worker | 21 | 173 |
| ui | 8 | 55 |

En local, AI-EM-ARCH obtuvo 5841 pruebas de API. La diferencia de 5 son pruebas que dependen del entorno; las suites omitidas son las mismas 4 en local y en CI.

**Dictamen G6.5: GO.** Autoriza el merge, que ya está hecho, porque el proyecto trabaja en `main`. **No** autoriza despliegue: G7 sigue diferido hasta la beta.

## 11. B5 — ruta de cierre (2026-10-30)

**Decisión del usuario:** B5 se ensaya en el tenant `iwana` de desarrollo cuando exista el acta jurídica, y se repite en producción en la ventana de G7. El 2026-10-30 AI-EM-ARCH verificó en solo lectura que `tenant_iwana` ya tiene `legal_texts.format` y `privacy_purpose_settings`.

**Preparado:**
- Runbook de release por tenant v1.1, con el Paso 7 ampliado:
  - 7a: finalidades antes que los textos;
  - 7b: los tres textos en `MARKDOWN`, con contraste de huella;
  - 7c: Oficial y retención;
  - paradas por falta de acta, 409, 422/403, huella distinta o finalidades no declaradas.
- Sección «Revisión jurídica» del anexo, con cinco preguntas concretas para el abogado.

**Pendiente:**
- el acta;
- la publicación en desarrollo;
- la verificación de la UI y la huella;
- este registro con tipo, versión y sha256 de los tres textos.

B5 se dará por **cerrado en desarrollo y pendiente en producción (G7)**. La parte de producción no reabre la fase.

### 11.1 Acta jurídica recibida (2026-10-30)

[`docs/legal/ACTA-PRIVACY-TEXTOS-LEGALES-IWANA-2026-10-30.md`](../legal/ACTA-PRIVACY-TEXTOS-LEGALES-IWANA-2026-10-30.md):
- Aviso aprobado sin cambios.
- Autorización aprobada con un ajuste: la cláusula 1 enumera los datos técnicos.
- Política sin objeciones.

AI-EM-ARCH verificó el contenido del acta contra el anexo. El Aviso es idéntico, la Autorización solo cambia en ese ajuste, y la Política difiere del original únicamente en el encabezado de tabla repetido.

**Aplicado:**
- Anexo v1.1 con el bloque C ajustado y las huellas esperadas (A `005625c5…`, B `cc97f53c…`, C `4f94eb90…`).
- Runbook, Paso 7: el contrato de transmisión y la Política v2 del proveedor de alojamiento son precondición de producción (acta §II.3).
- Carpeta `docs/legal/` registrada en `AGENTS.md`, con los archivos renombrados a la convención.

**Recomendación II.2 del acta (guardar versión, `published_at` y SHA-256):** ya se cumple, porque cada autorización apunta por FK a una fila inmutable de `legal_texts`. Mejora P3, no bloqueante: el comprobante (`authorizationProofSchema`) devuelve versión y huella, pero no `publishedAt`.

**Aprobación del Responsable:** el usuario confirmó el 2026-10-30 que el representante legal de Iwana S.A.S. aprobó los textos (ADR-094 D6). El original firmado se custodia fuera del repositorio. **B5 queda desbloqueado para publicar en desarrollo.** Las citas de artículos del acta quedan como «requiere verificación con fuente oficial».

### 11.2 Publicación en desarrollo (2026-10-30)

**El usuario informó que publicó** en el tenant `iwana` de desarrollo:
- las finalidades desactivadas;
- la Política `1 (2026-10-21)`, el Aviso `1` y la Autorización `1`, en `MARKDOWN`.

**Textos publicados, guardados byte a byte en `docs/legal/`** (huella SHA-256 local):

| Archivo | Tipo | SHA-256 |
| --- | --- | --- |
| [`POLITICA-TRATAMIENTO-IWANA-v1.md`](../legal/POLITICA-TRATAMIENTO-IWANA-v1.md) | `POLITICA_TRATAMIENTO` | `005625c5ed19b3f79d130f8fa5164fc6ba7dfe69fc400f7753a6958993657ffe` |
| [`AVISO-PRIVACIDAD-IWANA-v1.md`](../legal/AVISO-PRIVACIDAD-IWANA-v1.md) | `AVISO_PRIVACIDAD` | `cc97f53cf5d168f895c1c5cdfaa75bbf3869cc7676ca2fab095d25de235d4d75` |
| [`AUTORIZACION-IWANA-v1.md`](../legal/AUTORIZACION-IWANA-v1.md) | `AUTORIZACION` | `4f94eb90c2172023baed761b5c0143560e54fd79cef7e339112bd2ad88370306` |

`POLITICA-TRATAMIENTO-IWANA-v1.md` reemplaza la copia original del documento del responsable. Contienen las mismas palabras; solo cambia el encabezado de tabla repetido por el salto de página del PDF.

**Pendiente para cerrar B5 en desarrollo:** contrastar las huellas que devolvió el sistema con esta tabla, y comprobar en solo lectura las tres versiones «Vigente» y la captura con dos finalidades. AI-EM-ARCH no puede leer `tenant_iwana` con el rol MCP de solo lectura, que no tiene permiso sobre `legal_texts`, `privacy_purpose_settings` ni `audit_logs`.

### 11.3 Verificación de la publicación en desarrollo (2026-10-30) — NO conforme

AI-EM-ARCH la verificó en solo lectura, en el navegador integrado con la sesión del usuario, mediante `GET /api/v1/privacy/legal-texts` y `GET /api/v1/privacy/purposes`. La huella se recalculó en el navegador sobre el `content` devuelto.

| Tipo | Versión publicada | Formato | `url` | SHA-256 publicado | SHA-256 aprobado | Palabras |
| --- | --- | --- | --- | --- | --- | --- |
| `POLITICA_TRATAMIENTO` | `v1` (esperada `1 (2026-10-21)`) | `MARKDOWN` | `null` | `67ca16d2…eb907d68` | `005625c5…657ffe` | Idénticas (3409) |
| `AVISO_PRIVACIDAD` | `v1` (esperada `1`) | **`PLAIN`** | `null` | `75314d46…ad15201f` | `cc97f53c…235d4d75` | Idénticas (324) |
| `AUTORIZACION` | `v1` (esperada `1`) | **`PLAIN`** | `null` | `fef0b643…eee5fc8d` | `4f94eb90…88370306` | Idénticas (415), incluido el ajuste de la cláusula 1 |

**Diagnóstico:**
- El **texto jurídico es el aprobado**: las secuencias de palabras son idénticas, comparadas por huella sobre las palabras normalizadas.
- Lo que se pegó perdió la **sintaxis Markdown**: no tiene `#` ni `**`, y las tablas quedaron separadas por tabuladores. Todo indica que se copió desde una vista renderizada y no desde el archivo fuente.
- Los otros defectos son de operación, no del producto: Aviso y Autorización se publicaron en `PLAIN`, falta el enlace y las versiones no siguen el anexo. El formulario conserva el formato elegido entre publicaciones y su valor inicial es `MARKDOWN`.
- La integridad del sistema es correcta: cada `sha256` corresponde exactamente a su `content`.

**Finalidades: NO desactivadas.** Las cuatro siguen con `enabled: true`, y la UI muestra las cuatro casillas marcadas. Se incumplió la parada del runbook (Paso 7a antes que 7b): mientras tanto, la captura en desarrollo ofrece biométricos y centrales de riesgo.

**Impacto:** ninguno sobre titulares reales, porque es el entorno de desarrollo. Las filas `v1` son inmutables y quedan como historial del ensayo.

**Corrección:**
1. Desactivar las dos finalidades y comprobar con `GET purposes`.
2. Publicar de nuevo los tres textos con las versiones del anexo (`1 (2026-10-21)`, `1` y `1`), que no chocan con `v1`; formato `MARKDOWN`; `url` igual a `https://iwana.co/privacidad/`; y el contenido copiado del **archivo fuente** de `docs/legal/` abierto como texto plano.
3. Volver a verificar las huellas contra el anexo §«Huellas esperadas».

**Lección para el runbook de producción:** en producción el Paso 7b se hace por API, con los JSON construidos desde el archivo fuente y con el contraste de huella. Se desaconseja publicar pegando en la UI.

### 11.4 Corrección y cierre de B5 en desarrollo (2026-10-30) — conforme

Con autorización expresa del usuario («Hazlo tú aquí»), AI-EM-ARCH ejecutó la corrección en el tenant `iwana` de desarrollo. Usó la sesión del usuario en el navegador integrado, contra el API del portal (`/api/v1`).

1. **Finalidades** (`PUT /privacy/purposes`, 200): `DATOS_BIOMETRICOS=false` y `REPORTE_CENTRALES_RIESGO=false`. `CONTACTO_COMERCIAL` y `TRATAMIENTO_CONTRACTUAL` quedan en `true`.
2. **Textos** (`POST /privacy/legal-texts` ×3, todos 201): el contenido es el byte exacto de `docs/legal/`, en orden Política → Aviso → Autorización. El script se detenía si una huella no coincidía, y no hizo falta.

| Tipo | Versión | Formato | `url` | SHA-256 devuelto = aprobado |
| --- | --- | --- | --- | --- |
| `POLITICA_TRATAMIENTO` | `1 (2026-10-21)` | `MARKDOWN` | `https://iwana.co/privacidad/` | `005625c5ed19b3f79d130f8fa5164fc6ba7dfe69fc400f7753a6958993657ffe` ✓ |
| `AVISO_PRIVACIDAD` | `1` | `MARKDOWN` | `https://iwana.co/privacidad/` | `cc97f53cf5d168f895c1c5cdfaa75bbf3869cc7676ca2fab095d25de235d4d75` ✓ |
| `AUTORIZACION` | `1` | `MARKDOWN` | `https://iwana.co/privacidad/` | `4f94eb90c2172023baed761b5c0143560e54fd79cef7e339112bd2ad88370306` ✓ |

**Verificación independiente:**
- `GET current` ×3 devuelve las tres filas anteriores con `isCurrent: true`.
- `GET purposes` confirma el estado del paso 1.
- **UI, Textos legales:** el detalle de la Política se renderiza con 5 tablas, incluida la de terceros de la §10 («Tercero | Qué recibe | Para qué | Calidad»), 19 títulos `h2` y la huella visible, sin `script`, `img` ni `iframe`.
- **UI, alta de suscriptor:** solo ofrece «Autorizo el uso de mis datos para prestar, facturar y dar soporte…» y «Autorizo recibir ofertas y novedades (opcional)». El texto de la Autorización se renderiza con formato, incluye el ajuste de la cláusula 1 y enlaza la Política y el Aviso. Ya no aparece el aviso de «no hay texto vigente».

**Historial del ensayo:** las tres filas `v1` del intento anterior (§11.3) se eliminaron el 2026-10-30, con autorización expresa del usuario; detalle en §11.5.

**Dictamen B5:** **cerrado en desarrollo.** La parte de producción se ejecuta en la ventana de G7 con el runbook v1.1, Paso 7, por API y con contraste de huella. Su precondición es el contrato de transmisión y la Política v2 del proveedor de alojamiento.

### 11.5 Limpieza de las filas `v1` del ensayo (2026-10-30, solo desarrollo)

**Por qué no se podían borrar.** Es un control intencional de la migración 146, que aplica ADR-094 D6, y tiene dos capas:
- el trigger `trg_legal_texts_append_only` (`BEFORE UPDATE OR DELETE`) rechaza cualquier mutación con el error `55000`;
- `data_authorizations.legal_text_id` tiene `ON DELETE RESTRICT`.

La tabla pertenece a `iwana_migrator`. El rol de la aplicación (`iwana_app`) no es superusuario y no puede saltarse el trigger. Ni la UI ni el API ofrecen borrar. **En producción no se toca.**

**Precondición verificada en solo lectura:** las tres filas `v1` (`67ca16d2`, `75314d46`, `fef0b643`) tenían **0** autorizaciones ligadas.

**Ejecución** (usuario «Sí, bórralas»; AI-EM-ARCH con `iwana_migrator`, en una sola transacción sobre `tenant_iwana`):
1. `DISABLE TRIGGER trg_legal_texts_append_only`.
2. `DELETE` acotado a `version = 'v1'`, a las tres huellas y a `NOT EXISTS` en `data_authorizations`. La transacción exigía exactamente 3 filas borradas y abortaba si no.
3. `ENABLE TRIGGER`.
4. `COMMIT`.

Resultado: se borraron 3 filas.

**Verificación posterior:**
- Quedan solo las tres filas vigentes: `POLITICA_TRATAMIENTO 1 (2026-10-21)` (`005625c5`), `AVISO_PRIVACIDAD 1` (`cc97f53c`) y `AUTORIZACION 1` (`4f94eb90`), todas en `MARKDOWN`.
- El trigger está habilitado (`tgenabled = O`).
- Un `DELETE` de prueba dentro de `ROLLBACK` vuelve a fallar con «La evidencia de privacidad es de solo anexar».

`audit_logs` conserva el registro de creación de las filas eliminadas.

**Regla:** este procedimiento es una excepción de desarrollo para datos de ensayo sin autorizaciones ligadas. No forma parte del runbook ni se aplica en producción, donde una versión equivocada se corrige publicando otra.

## 12. B8 — Historial de versiones (C7, spec v1.3) — 2026-10-30

**Origen:** pedido del usuario. Una versión se corrige publicando otra, pero las reemplazadas no deben quedar mezcladas con las vigentes.

**B8, `fe-platform`** ([informe](INFORME-PRIVACY-TEXTOS-LEGALES-B8-v1.0.md)):
- `LegalTextsSurface` separa «Versiones vigentes» de «Historial de versiones (N)». El historial va contraído, con `SectionAccordion` de `@iwana/ui`, agrupado por tipo e incluye «Reemplazada el».
- El detalle de una versión reemplazada lleva aviso y conserva la huella completa.
- La agrupación la calcula la función pura `buildLegalTextVersionSections`.
- Solo cambian `PrivacyWorkspace.tsx` y `PrivacyWorkspace.spec.tsx`.
- Evidencia reportada: suite completa del portal sin caché con 331 suites, 3355 pruebas aprobadas, 1 omitida y 0 fallidas; typecheck, lint, `audit-ui.mjs` y Prettier con código 0.

**Re-ejecución de AI-EM-ARCH:**
- `src/components/privacy` sin caché: 7 suites, 45 pruebas.
- `pnpm --filter @iwana/portal typecheck`: código 0.
- `audit-ui.mjs` sobre `PrivacyWorkspace.tsx`: sin hallazgos.
- Diff revisado: no toca el API, `packages/shared`, `@iwana/ui` ni los consumidores.

**Verificación en el navegador (2026-10-30, tenant `iwana` de desarrollo, sesión del usuario, solo lectura):**
- «Versiones vigentes» muestra exactamente 3 filas, en orden Política `1 (2026-10-21)` → Aviso `1` → Autorización `1`, con huellas `005625c5…`, `cc97f53c…` y `4f94eb90…`.
- «Historial de versiones» no se renderiza, porque no hay versiones reemplazadas (CA-LT-16).
- Finalidades: «Datos biométricos» y «Reporte a centrales de riesgo» desmarcadas; «Ofertas y novedades» marcada; «Prestación del servicio…» marcada y deshabilitada.

El caso con historial lo cubren las pruebas unitarias CA-LT-14 y 15.

**Observaciones visuales P3** (no bloquean; previas a B8):
1. En tema oscuro, la casilla deshabilitada de «Prestación del servicio…» se ve tenue y no se distingue fácilmente como marcada.
2. Con títulos largos, la insignia «Vigente» y la huella bajan de línea en unas filas y en otras no, por el `flex-wrap`, y la lista pierde alineación.

**Fuera de B8:** apareció en el árbol `.claude/launch.json`, sin commitear, que no forma parte de esta obra y no se incluye en su commit.

