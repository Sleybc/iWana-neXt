import { HabeasDataController } from '../habeas-data.controller';
import { GoneException } from '@nestjs/common';

describe('HabeasDataController', () => {
  let controller: HabeasDataController;

  beforeEach(() => {
    controller = new HabeasDataController();
  });

  it('retira las rutas heredadas con 410 y referencia el módulo de privacidad', () => {
    try {
      controller.listConsents();
      fail('Se esperaba GoneException');
    } catch (error) {
      expect(error).toBeInstanceOf(GoneException);
      expect((error as GoneException).getResponse()).toMatchObject({
        code: 'PRIVACY_ROUTE_RETIRED',
        redirectTo: '/privacy',
      });
    }
  });
});
