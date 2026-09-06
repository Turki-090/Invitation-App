import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  public async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  public async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  public async isHealthy(timeoutMilliseconds: number): Promise<boolean> {
    let timeout: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        this.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
        new Promise<boolean>((resolve) => {
          timeout = setTimeout(() => resolve(false), timeoutMilliseconds);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
