import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SEARCH_INDEX_QUEUE } from '@iwana/shared';
import { SearchQueueService } from './search-queue.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: SEARCH_INDEX_QUEUE,
    }),
  ],
  providers: [SearchQueueService],
  exports: [SearchQueueService],
})
export class SearchQueueModule {}
