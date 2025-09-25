import { faker } from '@faker-js/faker';
import {
  User,
  Tenant,
  Conversation,
  Message,
  ConversationType,
  MessageType,
} from '@prisma/client';

export interface TestUser extends Partial<User> {
  id: string;
  email: string;
  username: string;
  displayName: string;
  tenantId: string;
}

export interface TestTenant extends Partial<Tenant> {
  id: string;
  name: string;
  subdomain: string;
}

export interface TestConversation extends Partial<Conversation> {
  id: string;
  title: string;
  type: ConversationType;
  tenantId: string;
}

export interface TestMessage extends Partial<Message> {
  id: string;
  content: string;
  type: MessageType;
  conversationId: string;
  authorId: string;
  tenantId: string;
}

export class TestDataFactory {
  static createTenant(overrides: Partial<TestTenant> = {}): TestTenant {
    return {
      id: faker.string.uuid(),
      name: faker.company.name(),
      subdomain: faker.internet.domainWord(),
      subscriptionTier: 'FREE',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createUser(
    tenantId: string,
    overrides: Partial<TestUser> = {},
  ): TestUser {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();

    return {
      id: faker.string.uuid(),
      email: faker.internet.email({ firstName, lastName }),
      username: faker.internet.userName({ firstName, lastName }),
      displayName: `${firstName} ${lastName}`,
      tenantId,
      passwordHash: '$2b$10$example.hash.for.testing',
      isActive: true,
      isEmailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createConversation(
    tenantId: string,
    overrides: Partial<TestConversation> = {},
  ): TestConversation {
    return {
      id: faker.string.uuid(),
      title: faker.lorem.words(3),
      type: 'DIRECT',
      tenantId,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createMessage(
    conversationId: string,
    authorId: string,
    tenantId: string,
    overrides: Partial<TestMessage> = {},
  ): TestMessage {
    return {
      id: faker.string.uuid(),
      content: faker.lorem.sentence(),
      type: 'TEXT',
      conversationId,
      authorId,
      tenantId,
      sequenceNumber: BigInt(faker.number.int({ min: 1, max: 1000 })),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createBulkUsers(tenantId: string, count: number): TestUser[] {
    return Array.from({ length: count }, () => this.createUser(tenantId));
  }

  static createBulkMessages(
    conversationId: string,
    authorId: string,
    tenantId: string,
    count: number,
  ): TestMessage[] {
    return Array.from({ length: count }, (_, index) =>
      this.createMessage(conversationId, authorId, tenantId, {
        sequenceNumber: BigInt(index + 1),
      }),
    );
  }

  static createConversationWithMessages(
    tenantId: string,
    authorId: string,
    messageCount: number = 5,
  ): { conversation: TestConversation; messages: TestMessage[] } {
    const conversation = this.createConversation(tenantId);
    const messages = this.createBulkMessages(
      conversation.id,
      authorId,
      tenantId,
      messageCount,
    );

    return { conversation, messages };
  }
}
