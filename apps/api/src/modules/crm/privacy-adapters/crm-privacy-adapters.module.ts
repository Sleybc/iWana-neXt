import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from '../contracts/entities/contract.entity';
import { Subscriber } from '../subscribers/entities/subscriber.entity';
import { CrmContractImpersonationAdapter } from './crm-contract-impersonation.adapter';
import { CrmContractStandingReadAdapter } from './crm-contract-standing-read.adapter';
import { IContractImpersonationPort } from '../../privacy/ports/contract-impersonation.port';
import { IContractStandingReadPort } from '../../privacy/requests/ports/contract-standing-read.port';

@Module({
  imports: [TypeOrmModule.forFeature([Contract, Subscriber])],
  providers: [
    CrmContractImpersonationAdapter,
    CrmContractStandingReadAdapter,
    { provide: IContractImpersonationPort, useExisting: CrmContractImpersonationAdapter },
    { provide: IContractStandingReadPort, useExisting: CrmContractStandingReadAdapter },
  ],
  exports: [IContractImpersonationPort, IContractStandingReadPort],
})
export class CrmPrivacyAdaptersModule {}
