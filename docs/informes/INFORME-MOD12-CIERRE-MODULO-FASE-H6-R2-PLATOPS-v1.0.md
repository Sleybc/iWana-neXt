# INFORME — MOD12 · H6-R2 · PlatOps Chromium REAL (Paso 1)

| Campo | Valor |
| --- | --- |
| Versión | 1.0 |
| Fecha | 2026-07-21 |
| Agente | AI-PLAT-OPS |
| Prompt | `docs/prompts/PROMPT-MOD12-CIERRE-MODULO-FASE-H6-R2-v1.0.md` Paso 1 |
| Estado | ✅ **REMEDIADO** — launch real + suite inventario 41/41 |

---

## 1. Verificación previa (caché corrupto)

```powershell
Get-ChildItem -Force "$env:USERPROFILE\AppData\Local\ms-playwright"
```

| Hallazgo | Evidencia |
| --- | --- |
| Único contenido | Directorio `b` (basura de redirect) |
| Contenido de `b` | Archivo lock `browser@9d6103fd6608b7b68c6844990323f644` |
| Carpetas `chromium-*` | **Ninguna** |
| Ejecutable | **Inexistente** |

Nota de entorno: en esta sesión Cursor inyectaba `PLAYWRIGHT_BROWSERS_PATH` hacia un sandbox (`...\cursor-sandbox-cache\...\playwright`). El primer `pnpm exec playwright install chromium` con ese redirect terminó en ~1.4 s **sin descargar** al path canónico. Se forzó la ruta canónica para la remediación:

```text
PLAYWRIGHT_BROWSERS_PATH=%USERPROFILE%\AppData\Local\ms-playwright
```

---

## 2. Acciones ejecutadas

### 2.1 Borrado de basura

```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\AppData\Local\ms-playwright\b"
```

Post-borrado: directorio `ms-playwright` vacío. `b_exists=False`.

### 2.2 Install real (sin redirect roto)

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$env:USERPROFILE\AppData\Local\ms-playwright"
cd c:\appiw
pnpm exec playwright install chromium
```

| Resultado | Valor |
| --- | --- |
| Exit code install | `0` |
| Descarga | Chrome for Testing 145.0.7632.6 (playwright chromium v1208) — 172.8 MiB |
| Destino | `C:\Users\SLEYB\AppData\Local\ms-playwright\chromium-1208` |
| Duración aproximada | ~42 s (descarga real, no no-op) |

También instalados: `ffmpeg-1011`, `chromium_headless_shell-1208`, `winldd-1007`.

### 2.3 Launch real (NO `--list`)

```powershell
# require desde pnpm: node_modules/.pnpm/playwright@1.58.2/node_modules/playwright
node -e "const {chromium}=require(...); const fs=require('fs'); (async()=>{const p=chromium.executablePath(); console.log('PATH', p); console.log('exists', fs.existsSync(p)); const b=await chromium.launch({headless:true}); console.log('LAUNCH_OK', await b.version()); await b.close();})()..."
```

| Campo | Valor |
| --- | --- |
| `PATH` | `C:\Users\SLEYB\AppData\Local\ms-playwright\chromium-1208\chrome-win64\chrome.exe` |
| `exists` | **true** |
| `LAUNCH_OK` | **145.0.7632.6** |
| Exit code | `0` |

---

## 3. Listing post-install (`ms-playwright`)

```text
.links
chromium_headless_shell-1208
chromium-1208
ffmpeg-1011
winldd-1007
```

Carpetas `chromium-*` / equivalentes:

- `chromium-1208`
- `chromium_headless_shell-1208`

Ejecutable verificado: `chromium-1208\chrome-win64\chrome.exe` → `exists=True`. Sin directorio `b`.

---

## 4. Suite Playwright — ejecución completa

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$env:USERPROFILE\AppData\Local\ms-playwright"
npx playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-inventory-scm.spec.ts
```

| Métrica | Valor |
| --- | --- |
| Workers | 1 |
| Passed | **41** |
| Failed | **0** |
| Skipped | **0** |
| Duración reporter | **56.3s** |
| Exit code | **0** |
| Ventana wall-clock | 2026-07-21T16:10:37 → 16:11:34 (-05:00) |

### Últimas líneas del reporter list

```text
  ok 38 [chromium] › e2e\tests\portal-inventory-scm.spec.ts:4583:3 › Portal Inventario / Reservas (Fase 03B) › muestra disponible restando reservado y compromete al crear salida (1.3s)
  ok 39 [chromium] › e2e\tests\portal-inventory-scm.spec.ts:4617:3 › Portal Inventario / Reservas (Fase 03B) › rechaza transferencia sobre stock comprometido (1.3s)
  ok 40 [chromium] › e2e\tests\portal-inventory-scm.spec.ts:4667:3 › Portal Inventario / Reservas (Fase 03B) › libera reserva al cancelar salida abierta (1.5s)
  ok 41 [chromium] › e2e\tests\portal-inventory-scm.spec.ts:4700:3 › Portal Inventario / Reservas (Fase 03B) › libera reserva y descuenta existencia al despachar (1.6s)

  41 passed (56.3s)
EXIT_CODE=0
```

---

## 5. Veredicto

| Criterio Paso 1 | Resultado |
| --- | --- |
| Basura `b` eliminada | ✅ |
| Install con binarios reales en path canónico | ✅ |
| `executablePath` + `exists=true` | ✅ |
| `chromium.launch` headless OK | ✅ |
| Resumen Playwright de **ejecución** (no `--list`) | ✅ 41 passed / 0 failed / exit 0 / 56.3s |

**Bloqueo browsers (B2 / CA-H6-08) remediado en este entorno local**, con evidencia reproducible de launch + suite.

### Observaciones de plataforma (no bloquean este Paso 1)

1. **`PLAYWRIGHT_BROWSERS_PATH` de sandbox Cursor** puede enmascarar installs: exit 0 sin poblar `%LOCALAPPDATA%\ms-playwright`. Para corridas locales/CI de agente, fijar explícitamente la ruta canónica o un path de CI conocido.
2. `require('playwright')` desde la raíz del monorepo falla (paquete bajo `.pnpm`); usar resolución pnpm o `npx`/`pnpm exec` al invocar Playwright.
3. Sigue sin existir workflow CI de portal E2E (observación R1 vigente) — fuera del alcance de este Paso 1.

**No G7.** No features de inventario. Handoff: AI-SR-QA puede retomar Paso 3 (deuda E2E) sobre corridas reales; AI-EM-ARCH alinea informes.
