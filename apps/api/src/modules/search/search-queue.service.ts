import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  SEARCH_INDEX_JOB_NAVIGATION_REBUILD,
  SEARCH_INDEX_JOB_REBUILD,
  SEARCH_INDEX_JOB_TENANT_UPSERT,
  SEARCH_INDEX_JOB_USER_DELETE,
  SEARCH_INDEX_JOB_USER_UPSERT,
  SEARCH_INDEX_QUEUE,
} from '@iwana/shared';

@Injectable()
export class SearchQueueService {
  constructor(
    @InjectQueue(SEARCH_INDEX_QUEUE)
    private readonly searchIndexQueue: Queue,
  ) {}

  async enqueueFullRebuild(force = true): Promise<void> {
    await this.searchIndexQueue.add(
      SEARCH_INDEX_JOB_REBUILD,
      { force },
      {
        // BullMQ no permite ':' en custom jobId.
        jobId: `${SEARCH_INDEX_JOB_REBUILD}-${force ? 'force' : 'soft'}`,
        removeOnComplete: true,
      },
    );
  }

  async enqueueTenantUpsert(tenantId: string): Promise<void> {
    await this.searchIndexQueue.add(
      SEARCH_INDEX_JOB_TENANT_UPSERT,
      { tenantId },
      {
        jobId: `${SEARCH_INDEX_JOB_TENANT_UPSERT}-${tenantId}`,
        removeOnComplete: true,
      },
    );
  }

  async enqueueUserUpsert(tenantId: string, userId: string): Promise<void> {
    await this.searchIndexQueue.add(
      SEARCH_INDEX_JOB_USER_UPSERT,
      { tenantId, userId },
      {
        jobId: `${SEARCH_INDEX_JOB_USER_UPSERT}-${tenantId}-${userId}`,
        removeOnComplete: true,
      },
    );
  }

  async enqueueUserDelete(userId: string): Promise<void> {
    await this.searchIndexQueue.add(
      SEARCH_INDEX_JOB_USER_DELETE,
      { userId },
      {
        jobId: `${SEARCH_INDEX_JOB_USER_DELETE}-${userId}`,
        removeOnComplete: true,
      },
    );
  }

  async enqueueNavigationRebuild(): Promise<void> {
    await this.searchIndexQueue.add(
      SEARCH_INDEX_JOB_NAVIGATION_REBUILD,
      {},
      {
        jobId: SEARCH_INDEX_JOB_NAVIGATION_REBUILD,
        removeOnComplete: true,
      },
    );
  }
}
