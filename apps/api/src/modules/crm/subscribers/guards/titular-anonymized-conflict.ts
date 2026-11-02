import { ConflictException } from '@nestjs/common';

export function titularAnonymizedConflict(): ConflictException {
  return new ConflictException({
    code: 'PRIVACY_TITULAR_ANONYMIZED',
    message: 'Este titular fue anonimizado; sus registros ya no se pueden modificar.',
  });
}
