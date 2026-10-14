import { Injectable } from '@nestjs/common';
import { InternetVatInput, InternetVatResult } from '@iwana/shared';
import { resolveInternetVat } from '../services/internet-vat-resolver';
import { IInternetVatResolverPort } from './internet-vat-resolver.port';

@Injectable()
export class InternetVatResolverAdapter extends IInternetVatResolverPort {
  resolve(input: InternetVatInput): InternetVatResult {
    return resolveInternetVat(input);
  }
}
