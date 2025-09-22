import { faker } from '@faker-js/faker';
import { PrismaClient } from '@prisma/client';

export interface TestDataOptions {
  locale?: string;
  seed?: number;
}

export class TestDataFactory {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient, options: TestDataOptions = {}) {
    this.prisma = prisma;
    
    if (options.locale) {
      faker.setLocale(options.locale);
    }
    
    if (options.seed) {
      faker.seed(options.seed);
    }
  }

  // Tenant Factory
  createTenant(overrides: Partial<any> = {}) {
    return {
      name: faker.company.name(),
      subdomain: faker.internet.domainWord().toLowerCase(),
      subscriptionTier: faker.helpers.arrayElement(['FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE']) as any,
      status: 'ACTIVE' as any,
      createdAt: faker.date.past({ years: 2 }),
      ...overrides,
    };
  }

  // User Factory
  createUser(tenantId: string, overrides: Partial<any> = {}) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    
    return {
      email: faker.internet.email({ firstName, lastName }),
      username: faker.internet.userName({ firstName, lastName }).toLowerCase(),
      displayName: `${firstName} ${lastName}`,
      passwordHash: '$2b$10$YourHashedPasswordHere', // Pre-hashed for testing
      isActive: faker.datatype.boolean({ probability: 0.9 }),
      lastLoginAt: faker.date.recent({ days: 30 }),
      tenantId,
      profile: {
        avatar: faker.image.avatar(),
        bio: faker.lorem.sentence({ min: 5, max: 15 }),
        timezone: faker.location.timeZone(),
        language: faker.helpers.arrayElement(['en', 'es', 'fr', 'de', 'ja', 'zh']),
        theme: faker.helpers.arrayElement(['light', 'dark', 'auto']),
        notifications: {
          email: faker.datatype.boolean(),
          push: faker.datatype.boolean(),
          desktop: faker.datatype.boolean(),
          sound: faker.datatype.boolean(),
        },
      },
      createdAt: faker.date.past({ years: 1 }),
      ...overrides,
    };
  }

  // Conversation Factory
  createConversation(tenantId: string, createdById: string, overrides: Partial<any> = {}) {
    const type = faker.helpers.arrayElement(['DIRECT', 'GROUP', 'CHANNEL']);
    
    return {
      name: type === 'DIRECT' ? null : faker.lorem.words({ min: 2, max: 4 }),
      type,
      isPrivate: faker.datatype.boolean({ probability: 0.3 }),
      tenantId,
      createdById,
      createdAt: faker.date.past({ months: 6 }),
      metadata: {
        description: faker.lorem.sentence(),
        tags: faker.helpers.arrayElements(['work', 'project', 'team', 'social', 'support', 'urgent'], 
          faker.number.int({ min: 0, max: 3 })),
        color: faker.color.rgb(),
        icon: faker.helpers.arrayElement(['💬', '📢', '🔒', '🌟', '🚀', '💼', '🎯']),
        settings: {
          allowFileUploads: faker.datatype.boolean(),
          allowGifs: faker.datatype.boolean(),
          allowReactions: faker.datatype.boolean(),
          muteNotifications: faker.datatype.boolean(),
        },
      },
      ...overrides,
    };
  }

  // Message Factory
  createMessage(conversationId: string, authorId: string, sequenceNumber: bigint, overrides: Partial<any> = {}) {
    const messageType = faker.helpers.weightedArrayElement([
      { weight: 0.75, value: 'TEXT' },
      { weight: 0.1, value: 'IMAGE' },
      { weight: 0.05, value: 'FILE' },
      { weight: 0.05, value: 'SYSTEM' },
      { weight: 0.03, value: 'VOICE' },
      { weight: 0.02, value: 'VIDEO' },
    ]);

    return {
      content: this.generateMessageContent(messageType),
      type: messageType,
      conversationId,
      authorId,
      sequenceNumber,
      createdAt: faker.date.recent({ days: 30 }),
      metadata: {
        edited: faker.datatype.boolean({ probability: 0.1 }),
        editedAt: faker.helpers.maybe(() => faker.date.recent({ days: 1 })),
        reactions: this.generateReactions(),
        mentions: faker.helpers.maybe(() => 
          faker.helpers.arrayElements(['user1', 'user2', 'user3'], 
            faker.number.int({ min: 1, max: 2 })), 
          { probability: 0.15 }
        ),
        replyTo: faker.helpers.maybe(() => faker.string.uuid(), { probability: 0.2 }),
        attachments: messageType !== 'TEXT' ? this.generateAttachments(messageType) : [],
        formatting: {
          bold: faker.helpers.arrayElements([0, 1, 2], faker.number.int({ min: 0, max: 2 })),
          italic: faker.helpers.arrayElements([0, 1, 2], faker.number.int({ min: 0, max: 2 })),
          code: faker.helpers.arrayElements([0, 1], faker.number.int({ min: 0, max: 1 })),
        },
      },
      ...overrides,
    };
  }

  // Conversation Participant Factory
  createConversationParticipant(conversationId: string, userId: string, overrides: Partial<any> = {}) {
    return {
      conversationId,
      userId,
      role: faker.helpers.arrayElement(['MEMBER', 'ADMIN', 'MODERATOR']),
      joinedAt: faker.date.past({ months: 3 }),
      lastReadAt: faker.date.recent({ days: 7 }),
      settings: {
        notifications: faker.datatype.boolean(),
        mentions: faker.datatype.boolean(),
        sounds: faker.datatype.boolean(),
        nickname: faker.helpers.maybe(() => faker.person.firstName()),
      },
      ...overrides,
    };
  }

  // User Session Factory
  createUserSession(userId: string, overrides: Partial<any> = {}) {
    return {
      userId,
      sessionToken: faker.string.uuid(),
      deviceFingerprint: faker.string.alphanumeric(32),
      ipAddress: faker.internet.ip(),
      userAgent: faker.internet.userAgent(),
      isActive: faker.datatype.boolean({ probability: 0.8 }),
      lastActivityAt: faker.date.recent({ days: 1 }),
      expiresAt: faker.date.future({ days: 7 }),
      metadata: {
        device: faker.helpers.arrayElement(['desktop', 'mobile', 'tablet']),
        browser: faker.helpers.arrayElement(['chrome', 'firefox', 'safari', 'edge']),
        os: faker.helpers.arrayElement(['windows', 'macos', 'linux', 'ios', 'android']),
        location: {
          country: faker.location.country(),
          city: faker.location.city(),
          timezone: faker.location.timeZone(),
        },
      },
      ...overrides,
    };
  }

  // Tenant Quota Factory
  createTenantQuota(tenantId: string, quotaType: string, overrides: Partial<any> = {}) {
    const quotaConfigs = {
      USERS: { max: 1000, current: 50 },
      STORAGE: { max: 10000, current: 500 }, // MB
      MESSAGES: { max: 100000, current: 5000 },
      CONVERSATIONS: { max: 500, current: 25 },
      API_REQUESTS: { max: 10000, current: 1000 },
    };

    const config = quotaConfigs[quotaType as keyof typeof quotaConfigs] || { max: 100, current: 10 };

    return {
      tenantId,
      quotaType,
      maxValue: config.max,
      currentValue: faker.number.int({ min: 0, max: config.current }),
      resetAt: faker.date.future({ days: 30 }),
      ...overrides,
    };
  }

  // Helper Methods
  private generateMessageContent(type: string): string {
    switch (type) {
      case 'TEXT':
        return faker.helpers.arrayElement([
          faker.lorem.sentence(),
          `Hey ${faker.person.firstName()}, ${faker.lorem.sentence()}`,
          `@${faker.internet.userName()} ${faker.lorem.sentence()}`,
          `${faker.lorem.words(3)}? 🤔`,
          `Thanks! ${faker.helpers.arrayElement(['👍', '🙏', '✨', '🎉'])}`,
          faker.helpers.arrayElement([
            'Good morning everyone!',
            'Have a great day!',
            'See you tomorrow',
            'Let me know if you need anything',
            'Sounds good to me',
            'I agree with that',
            'Let\'s discuss this further',
            'Can we schedule a meeting?',
            'Perfect, thanks for the update!',
            'I\'ll look into this right away',
          ]),
        ]);
      case 'SYSTEM':
        return faker.helpers.arrayElement([
          `${faker.person.firstName()} joined the conversation`,
          `${faker.person.firstName()} left the conversation`,
          'Conversation settings updated',
          'File uploaded successfully',
          'Message deleted by moderator',
        ]);
      case 'IMAGE':
        return 'Shared an image';
      case 'FILE':
        return `Shared a file: ${faker.system.fileName()}`;
      case 'VOICE':
        return 'Voice message';
      case 'VIDEO':
        return 'Video message';
      default:
        return faker.lorem.sentence();
    }
  }

  private generateReactions(): Record<string, string[]> {
    if (faker.datatype.boolean({ probability: 0.4 })) {
      const reactions: Record<string, string[]> = {};
      const emojis = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥', '💯', '👏'];
      const selectedEmojis = faker.helpers.arrayElements(emojis, 
        faker.number.int({ min: 1, max: 4 }));
      
      for (const emoji of selectedEmojis) {
        reactions[emoji] = faker.helpers.arrayElements(
          Array.from({ length: 10 }, () => faker.string.uuid()),
          faker.number.int({ min: 1, max: 5 })
        );
      }
      
      return reactions;
    }
    return {};
  }

  private generateAttachments(type: string): any[] {
    switch (type) {
      case 'IMAGE':
        return [{
          id: faker.string.uuid(),
          filename: `${faker.lorem.word()}.jpg`,
          mimeType: 'image/jpeg',
          size: faker.number.int({ min: 100000, max: 5000000 }),
          url: faker.image.url(),
          thumbnail: faker.image.url({ width: 150, height: 150 }),
        }];
      case 'FILE':
        return [{
          id: faker.string.uuid(),
          filename: faker.system.fileName(),
          mimeType: faker.system.mimeType(),
          size: faker.number.int({ min: 1000, max: 10000000 }),
          url: faker.internet.url(),
        }];
      case 'VOICE':
        return [{
          id: faker.string.uuid(),
          filename: `voice_${Date.now()}.mp3`,
          mimeType: 'audio/mpeg',
          size: faker.number.int({ min: 50000, max: 1000000 }),
          duration: faker.number.int({ min: 5, max: 300 }), // seconds
          url: faker.internet.url(),
        }];
      case 'VIDEO':
        return [{
          id: faker.string.uuid(),
          filename: `video_${Date.now()}.mp4`,
          mimeType: 'video/mp4',
          size: faker.number.int({ min: 1000000, max: 50000000 }),
          duration: faker.number.int({ min: 10, max: 600 }), // seconds
          url: faker.internet.url(),
          thumbnail: faker.image.url({ width: 320, height: 240 }),
        }];
      default:
        return [];
    }
  }

  // Batch Creation Methods
  async createTenantWithUsers(userCount: number = 10) {
    const tenant = await this.prisma.tenant.create({
      data: this.createTenant(),
    });

    const users = [];
    for (let i = 0; i < userCount; i++) {
      const user = await this.prisma.user.create({
        data: this.createUser(tenant.id),
      });
      users.push(user);
    }

    return { tenant, users };
  }

  async createConversationWithMessages(
    tenantId: string, 
    participants: string[], 
    messageCount: number = 50
  ) {
    const createdBy = participants[0];
    const conversation = await this.prisma.conversation.create({
      data: this.createConversation(tenantId, createdBy),
    });

    // Add participants
    for (const userId of participants) {
      await this.prisma.conversationParticipant.create({
        data: this.createConversationParticipant(conversation.id, userId),
      });
    }

    // Create messages
    const messages = [];
    for (let i = 0; i < messageCount; i++) {
      const author = faker.helpers.arrayElement(participants);
      const message = await this.prisma.message.create({
        data: this.createMessage(conversation.id, author, BigInt(i + 1)),
      });
      messages.push(message);
    }

    return { conversation, messages };
  }

  // Realistic Scenario Generators
  generateWorkplaceScenario() {
    return {
      tenants: [
        this.createTenant({ 
          name: 'Acme Corporation',
          subscriptionTier: 'ENTERPRISE',
          settings: {
            allowFileUploads: true,
            maxFileSize: 100 * 1024 * 1024,
            retentionDays: 365,
            features: {
              realTimeChat: true,
              fileSharing: true,
              videoCall: true,
              screenShare: true,
              customBranding: true,
            },
          },
        }),
      ],
      conversationTypes: ['team-general', 'project-alpha', 'support-tickets', 'announcements'],
      userRoles: ['employee', 'manager', 'admin', 'guest'],
    };
  }

  generateEducationScenario() {
    return {
      tenants: [
        this.createTenant({ 
          name: 'University of Technology',
          subscriptionTier: 'PREMIUM',
          settings: {
            allowFileUploads: true,
            maxFileSize: 50 * 1024 * 1024,
            retentionDays: 180,
          },
        }),
      ],
      conversationTypes: ['class-cs101', 'study-group', 'office-hours', 'announcements'],
      userRoles: ['student', 'teacher', 'ta', 'admin'],
    };
  }
}
