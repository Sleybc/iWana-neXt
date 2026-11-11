import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const CONTRACT_PDF_CHROMIUM_PATH_ENV = 'CONTRACT_PDF_CHROMIUM_PATH';
const RENDER_TIMEOUT_MS = 30_000;

/**
 * HTML → PDF con `playwright-core` + Chromium sin interfaz (ADR-109 D5). Aislado: JavaScript
 * desactivado y toda petición de red abortada salvo `data:`; el HTML ya viene escapado.
 * Un navegador por render: sin estado compartido entre tenants.
 */
@Injectable()
export class ContractPdfRenderer {
  constructor(private readonly config: ConfigService) {}

  async render(html: string): Promise<Buffer> {
    const { chromium } = await import('playwright-core');
    const executablePath = this.config.get<string>(CONTRACT_PDF_CHROMIUM_PATH_ENV)?.trim();
    const browser = await chromium.launch({
      headless: true,
      timeout: RENDER_TIMEOUT_MS,
      ...(executablePath ? { executablePath } : {}),
    });
    try {
      const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
      const page = await context.newPage();
      page.setDefaultTimeout(RENDER_TIMEOUT_MS);
      await page.route('**/*', (route) =>
        route.request().url().startsWith('data:') ? route.continue() : route.abort(),
      );
      await page.setContent(html, { waitUntil: 'load' });
      await page.emulateMedia({ media: 'print' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
