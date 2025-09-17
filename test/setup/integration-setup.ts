import 'jest-extended';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  redis: RedisService;
}

let testContext: TestContext;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: '.env.test',
      }),
    ],
    providers: [PrismaService, RedisService],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  const prisma = app.get<PrismaService>(PrismaService);
  const redis = app.get<RedisService>(RedisService);

  testContext = { app, prisma, redis };

  // Clean up database before tests
  await cleanupDatabase(prisma);
  
  // Clean up Redis before tests
  await redis.flushall();
});

afterAll(async () => {
  if (testContext) {
    await cleanupDatabase(testContext.prisma);
    await testContext.redis.flushall();
    await testContext.app.close();
  }
});

beforeEach(async () => {
  if (testContext) {
    // Clean up between tests
    await cleanupDatabase(testContext.prisma);
    await testContext.redis.flushall();
  }
});

async function cleanupDatabase(prisma: PrismaService) {
  // Clean up in reverse dependency order
  await prisma.messageReaction.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversationParticipant.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
}

export function getTestContext(): TestContext {
  if (!testContext) {
    throw new Error('Test context not initialized. Make sure to run tests with proper setup.');
  }
  return testContext;
}
