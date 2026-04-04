import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DocumentType, UserRole } from '@iwana/shared';
import { CreateUserDto, ResetPasswordDto, UpdateProfileDto } from './user.dto';

describe('Users DTO validation', () => {
  describe('CreateUserDto', () => {
    it('valida email requerido', async () => {
      const dto = plainToInstance(CreateUserDto, { role: UserRole.NOC });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'email')).toBe(true);
    });

    it('rechaza password menor a 10 caracteres', async () => {
      const dto = plainToInstance(CreateUserDto, {
        email: 'usuario@empresa.com',
        role: UserRole.NOC,
        password: 'short',
      });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'password')).toBe(true);
    });

    it('acepta phone en formato E.164', async () => {
      const dto = plainToInstance(CreateUserDto, {
        email: 'usuario@empresa.com',
        role: UserRole.NOC,
        phone: '+573001234567',
        documentType: DocumentType.CC,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rechaza phone sin formato E.164', async () => {
      const dto = plainToInstance(CreateUserDto, {
        email: 'usuario@empresa.com',
        role: UserRole.NOC,
        phone: '3001234567',
      });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'phone')).toBe(true);
    });
  });

  describe('ResetPasswordDto', () => {
    it('acepta body vacio', async () => {
      const dto = plainToInstance(ResetPasswordDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rechaza password menor a 10 caracteres', async () => {
      const dto = plainToInstance(ResetPasswordDto, { password: 'short' });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'password')).toBe(true);
    });
  });

  describe('UpdateProfileDto', () => {
    it('acepta body vacio', async () => {
      const dto = plainToInstance(UpdateProfileDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rechaza documentNumber mayor a 30 caracteres', async () => {
      const dto = plainToInstance(UpdateProfileDto, { documentNumber: '1'.repeat(31) });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'documentNumber')).toBe(true);
    });

    it('rechaza avatarUrl invalida', async () => {
      const dto = plainToInstance(UpdateProfileDto, { avatarUrl: 'no-es-url' });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'avatarUrl')).toBe(true);
    });
  });
});
