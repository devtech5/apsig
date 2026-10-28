import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaClient, prismaAdapter } from "@apsig/db";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: prismaAdapter() });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

// Client transactionnel reçu par les callbacks de $transaction.
export type Tx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];
