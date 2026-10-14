import { Injectable } from '@nestjs/common';
import { InternetVatInput, InternetVatResult } from '@iwana/shared';

/** Puerto público de Taxation para resolver el IVA canónico de internet. */
@Injectable()
export abstract class IInternetVatResolverPort {
  abstract resolve(input: InternetVatInput): InternetVatResult;
}
