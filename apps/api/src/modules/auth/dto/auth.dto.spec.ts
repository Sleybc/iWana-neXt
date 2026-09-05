/**
 * Tests de ChangePasswordDto / ResetPasswordDto — Ola 2, Paso 7.
 *
 * Fija los invariantes:
 * - `newPassword`: min 10, max 128 + complejidad (mayuscula, minuscula,
 *   digito, caracter especial). Sin respaldo del servidor la politica del
 *   cliente seria cosmetica.
 * - `currentPassword`: sin politica de longitud — solo se verifica contra el
 *   hash; una credencial legada corta debe poder cambiarse.
 *
 * SEGURIDAD: Sin credenciales reales — todos los valores son ficticios.
 */

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto, ResetPasswordDto } from './auth.dto';

describe('Auth DTO password policy (Ola 2, Paso 7)', () => {
  describe('ChangePasswordDto.newPassword', () => {
    it('acepta contrasena con min 10 + complejidad', async () => {
      const dto = plainToInstance(ChangePasswordDto, {
        currentPassword: 'Anterior1!xY',
        newPassword: 'NuevaClave1!xY',
      });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rechaza contrasena corta aunque tenga complejidad', async () => {
      const dto = plainToInstance(ChangePasswordDto, {
        currentPassword: 'Anterior1!xY',
        newPassword: 'Corta1!x',
      });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'newPassword')).toBe(true);
    });

    it('rechaza contrasena sin cada clase de caracter', async () => {
      for (const newPassword of [
        'minusculas1!xx',
        'MAYUSCULAS1!XX',
        'SinDigito!xxYY',
        'SinEspecial1xxYY',
      ]) {
        const dto = plainToInstance(ChangePasswordDto, {
          currentPassword: 'Anterior1!xY',
          newPassword,
        });
        const errors = await validate(dto);
        expect(errors.some((error) => error.property === 'newPassword')).toBe(true);
      }
    });

    it('rechaza contrasena mayor a 128 caracteres', async () => {
      const dto = plainToInstance(ChangePasswordDto, {
        currentPassword: 'Anterior1!xY',
        newPassword: `Segura1!${'x'.repeat(125)}`,
      });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'newPassword')).toBe(true);
    });
  });

  describe('ChangePasswordDto.currentPassword', () => {
    it('acepta contrasena actual corta o sin complejidad (legada)', async () => {
      const dto = plainToInstance(ChangePasswordDto, {
        currentPassword: 'corta',
        newPassword: 'NuevaClave1!xY',
      });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rechaza contrasena actual vacia', async () => {
      const dto = plainToInstance(ChangePasswordDto, {
        currentPassword: '',
        newPassword: 'NuevaClave1!xY',
      });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'currentPassword')).toBe(true);
    });
  });

  describe('ResetPasswordDto.newPassword', () => {
    it('exige la misma politica al restablecer con token', async () => {
      const weak = plainToInstance(ResetPasswordDto, {
        token: 'token-de-prueba',
        newPassword: 'debil1234',
      });
      const weakErrors = await validate(weak);
      expect(weakErrors.some((error) => error.property === 'newPassword')).toBe(true);

      const strong = plainToInstance(ResetPasswordDto, {
        token: 'token-de-prueba',
        newPassword: 'Fuerte1!xYz9',
      });
      expect(await validate(strong)).toHaveLength(0);
    });
  });
});
