import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UserStatus } from '@iwana/shared';
import { IActiveUserEmailReadPort } from './active-user-email-read.port';

@Injectable()
export class ActiveUserEmailReadAdapter implements IActiveUserEmailReadPort {
  async emailOf(userId: string, manager: EntityManager): Promise<string | null> {
    const rows = (await manager.query(
      `SELECT users.email
         FROM users
        WHERE users.id = $1::uuid
          AND users.status = $2
          AND users.deleted_at IS NULL
          AND users.email IS NOT NULL
          AND BTRIM(users.email) <> ''
        LIMIT 1`,
      [userId, UserStatus.ACTIVE],
    )) as Array<{ email: string }>;
    const email = rows[0]?.email;
    return typeof email === 'string' && email.trim() !== '' ? email : null;
  }
}
