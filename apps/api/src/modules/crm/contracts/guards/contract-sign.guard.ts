import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class ContractSignGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return false;
  }
}
