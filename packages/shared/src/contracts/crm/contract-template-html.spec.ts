import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkContractTemplateHtml } from './contract-template-html';

const SEED = join(
  __dirname,
  '../../../../../apps/worker/src/templates/contracts/contrato-servicio.base.html',
);

const ok = (html: string) => checkContractTemplateHtml(html).ok;

describe('checkContractTemplateHtml (lista blanca, SEC-2/SEC-4)', () => {
  it('acepta la semilla sin los meta de prueba', () => {
    const seed = readFileSync(SEED, 'utf8').replace(/<meta[^>]*>\s*/giu, '');
    expect(checkContractTemplateHtml(seed)).toEqual({ ok: true });
  });

  it('acepta la semilla tal como está versionada (sin meta)', () => {
    expect(ok(readFileSync(SEED, 'utf8'))).toBe(true);
  });

  it('rechaza un meta añadido a la semilla', () => {
    const withMeta = readFileSync(SEED, 'utf8').replace(
      /<head>/iu,
      '<head><meta http-equiv="refresh" content="0">',
    );
    expect(ok(withMeta)).toBe(false);
  });

  it('acepta marcado de texto, tablas, estilos en línea, secciones y placeholders', () => {
    expect(
      ok(
        '<!DOCTYPE html><html><head><title>C</title><style>.a>b{color:#111}@media print{.a{margin:0}}</style></head>' +
          '<body><!--IF:permanence--><table><tr><td colspan="2" style="padding:2px">{{ holder.fullName }}</td></tr></table>' +
          '<!--ENDIF:permanence--><a href="#clausula-1">ver</a><div data-signature-slot="subscriber"></div>' +
          '<img src="data:image/png;base64,iVBORw0KGgo=" alt="x"></body></html>',
      ),
    ).toBe(true);
  });

  it.each([
    ['script', '<script>alert(1)</script>'],
    ['link', '<link rel="stylesheet" href="http://evil.test/a.css">'],
    ['style @import', '<style>@import url("http://evil.test/a.css");</style>'],
    ['style @import con escape', '<style>@\\69mport "http://evil.test/a.css";</style>'],
    ['style url remota', '<style>body{background:url(http://evil.test/x.png)}</style>'],
    [
      'atributo style con url remota',
      '<div style="background:url(\'https://evil.test/x\')"></div>',
    ],
    ['img http', '<img src="http://evil.test/pixel.png">'],
    ['img con srcset', '<img src="data:image/png;base64,AAAA" srcset="http://evil.test/x 1x">'],
    ['a href data:', '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>'],
    ['a href javascript:', '<a href="javascript:alert(1)">x</a>'],
    ['a href remoto', '<a href="https://evil.test">x</a>'],
    ['svg xlink', '<svg><use xlink:href="http://evil.test/s.svg#a"></use></svg>'],
    ['meta', '<meta http-equiv="refresh" content="0;url=http://evil.test">'],
    ['meta con espacios', '< meta http-equiv="refresh" content="0">'],
    ['cierre con espacios', '</ script>'],
    ['iframe srcdoc', '<iframe srcdoc="<b>x</b>"></iframe>'],
    ['object', '<object data="http://evil.test/x"></object>'],
    ['manejador on*', '<div onclick="x()">x</div>'],
    ['srcdoc en etiqueta admitida', '<div srcdoc="x"></div>'],
    ['base', '<base href="http://evil.test/">'],
    ['entidad en estilo', '<div style="background:&#117;rl(http://evil.test)"></div>'],
    ['comentario condicional sin cerrar', '<!-- abierto <script>'],
    ['declaración', '<!ENTITY x "y">'],
  ])('rechaza %s', (_name, html) => {
    expect(ok(`<div>${html}</div>`)).toBe(false);
  });
});
