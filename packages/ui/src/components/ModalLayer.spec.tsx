// packages/ui/src/components/ModalLayer.spec.tsx
import { describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModalLayer } from './ModalLayer';

/**
 * El entorno de pruebas de `packages/ui` es `node` (sin DOM), asi que aqui se
 * verifica lo unico que ese entorno puede probar y que ademas es exactamente lo
 * que el servidor ejercita: la guarda de SSR.
 *
 * `createPortal` exige `document`. Sin la guarda, cualquiera de los 46+
 * consumidores de `Dialog` reventaria en el render de servidor de Next.js en
 * lugar de degradar a nada. El comportamiento en el navegador (velo, alineacion,
 * cierre por `mousedown`, portal al `body`) se cubre en jsdom desde
 * `apps/portal/src/components/shared/modal-layer.spec.tsx`.
 */
describe('ModalLayer', () => {
  it('guarda de SSR: sin `document` no renderiza nada en vez de reventar', () => {
    expect(typeof document).toBe('undefined');

    const markup = renderToStaticMarkup(
      <ModalLayer align="center">
        <div>Panel</div>
      </ModalLayer>,
    );

    expect(markup).toBe('');
  });
});
