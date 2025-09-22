#!/usr/bin/env ts-node

import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

interface SeedOptions {
  users?: number;
  conversations?: number;
  messagesPerConversation?: number;
  tenants?: number;
}

const defaultOptions: SeedOptions = {
  users: 50,
  conversations: 20,
  messagesPerConversation: 100,
  tenants: 5,
};

async function seedDatabase(options: SeedOptions = defaultOptions) {
  console.log('🌱 Starting database seeding...');

  try {
    // Clean existing data in development
    if (process.env.NODE_ENV === 'development') {
      console.log('🧹 Cleaning existing data...');
      await cleanDatabase();
    }

    // Seed tenants
    console.log('🏢 Creating tenants...');
    const tenants = await seedTenants(options.tenants || 5);

    // Seed users
    console.log('👥 Creating users...');
    const users = await seedUsers(options.users || 50, tenants);

    // Seed conversations
    console.log('💬 Creating conversations...');
    const conversations = await seedConversations(options.conversations || 20, users, tenants);

    // Seed messages
    console.log('📝 Creating messages...');
    await seedMessages(conversations, users, options.messagesPerConversation || 100);

    // Seed additional data
    console.log('🔧 Creating additional data...');
    await seedAdditionalData(users, conversations, tenants);

    console.log('✅ Database seeding completed successfully!');
    console.log(`Created:
    - ${tenants.length} tenants
    - ${users.length} users  
    - ${conversations.length} conversations
    - ~${conversations.length * (options.messagesPerConversation || 100)} messages`);

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanDatabase() {
  // Delete in correct order to avoid foreign key constraints
  await prisma.message.deleteMany();
  await prisma.conversationParticipant.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
}

async function seedTenants(count: number) {
  const tenants = [];
  
  for (let i = 0; i < count; i++) {
    const tenant = await prisma.tenant.create({
      data: {
        name: faker.company.name(),
        subdomain: faker.internet.domainWord(),
        subscriptionTier: faker.helpers.arrayElement(['FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE']),
        status: 'ACTIVE',
        settings: {
          allowFileUploads: faker.datatype.boolean(),
          maxFileSize: faker.number.int({ min: 1, max: 100 }) * 1024 * 1024, // MB
          retentionDays: faker.number.int({ min: 30, max: 365 }),
        },
        createdAt: faker.date.past({ years: 2 }),
      },
    });
    tenants.push(tenant);
  }

  return tenants;
}

async function seedUsers(count: number, tenants: any[]) {
  const users = [];
  const hashedPassword = await bcrypt.hash('password123', 10);

  for (let i = 0; i < count; i++) {
    const tenant = faker.helpers.arrayElement(tenants);
    const user = await prisma.user.create({
      data: {
        email: faker.internet.email(),
        username: faker.internet.userName(),
        displayName: faker.person.fullName(),
        passwordHash: hashedPassword,
        isActive: faker.datatype.boolean({ probability: 0.9 }),
        lastLoginAt: faker.date.recent({ days: 30 }),
        tenantId: tenant.id,
        profile: {
          avatar: faker.image.avatar(),
          bio: faker.lorem.sentence(),
          timezone: faker.location.timeZone(),
          language: faker.helpers.arrayElement(['en', 'es', 'fr', 'de', 'ja']),
        },
        createdAt: faker.date.past({ years: 1 }),
      },
    });
    users.push(user);
  }

  return users;
}

async function seedConversations(count: number, users: any[], tenants: any[]) {
  const conversations = [];

  for (let i = 0; i < count; i++) {
    const tenant = faker.helpers.arrayElement(tenants);
    const tenantUsers = users.filter(u => u.tenantId === tenant.id);
    
    if (tenantUsers.length < 2) continue;

    const conversation = await prisma.conversation.create({
      data: {
        name: faker.helpers.maybe(() => faker.lorem.words(3), { probability: 0.7 }),
        type: faker.helpers.arrayElement(['DIRECT', 'GROUP', 'CHANNEL']),
        isPrivate: faker.datatype.boolean({ probability: 0.3 }),
        tenantId: tenant.id,
        createdById: faker.helpers.arrayElement(tenantUsers).id,
        createdAt: faker.date.past({ months: 6 }),
        metadata: {
          description: faker.lorem.sentence(),
          tags: faker.helpers.arrayElements(['work', 'project', 'team', 'social', 'support'], 2),
        },
      },
    });

    // Add participants
    const participantCount = faker.number.int({ min: 2, max: Math.min(8, tenantUsers.length) });
    const participants = faker.helpers.arrayElements(tenantUsers, participantCount);

    for (const participant of participants) {
      await prisma.conversationParticipant.create({
        data: {
          conversationId: conversation.id,
          userId: participant.id,
          role: faker.helpers.arrayElement(['MEMBER', 'ADMIN', 'MODERATOR']),
          joinedAt: faker.date.between({ 
            from: conversation.createdAt, 
            to: new Date() 
          }),
        },
      });
    }

    conversations.push({ ...conversation, participants });
  }

  return conversations;
}

async function seedMessages(conversations: any[], users: any[], messagesPerConversation: number) {
  for (const conversation of conversations) {
    const messageCount = faker.number.int({ 
      min: Math.floor(messagesPerConversation * 0.5), 
      max: messagesPerConversation 
    });

    for (let i = 0; i < messageCount; i++) {
      const author = faker.helpers.arrayElement(conversation.participants);
      
      await prisma.message.create({
        data: {
          content: generateRealisticMessage(),
          type: faker.helpers.weightedArrayElement([
            { weight: 0.8, value: 'TEXT' },
            { weight: 0.1, value: 'IMAGE' },
            { weight: 0.05, value: 'FILE' },
            { weight: 0.03, value: 'SYSTEM' },
            { weight: 0.02, value: 'VOICE' },
          ]),
          conversationId: conversation.id,
          authorId: author.userId,
          sequenceNumber: BigInt(i + 1),
          createdAt: faker.date.between({
            from: conversation.createdAt,
            to: new Date(),
          }),
          metadata: {
            edited: faker.datatype.boolean({ probability: 0.1 }),
            reactions: generateReactions(),
            mentions: faker.helpers.maybe(() => 
              faker.helpers.arrayElements(
                conversation.participants.map((p: any) => p.userId), 
                faker.number.int({ min: 1, max: 3 })
              ), 
              { probability: 0.2 }
            ),
          },
        },
      });
    }
  }
}

async function seedAdditionalData(users: any[], conversations: any[], tenants: any[]) {
  // Seed conversation states
  for (const conversation of conversations) {
    await prisma.conversationState.create({
      data: {
        conversationId: conversation.id,
        lastSequenceNumber: BigInt(faker.number.int({ min: 50, max: 200 })),
        lastActivityAt: faker.date.recent({ days: 7 }),
        participantCount: conversation.participants.length,
        messageCount: faker.number.int({ min: 10, max: 500 }),
      },
    });
  }

  // Seed user sessions
  for (const user of users.slice(0, 20)) { // Only active users
    await prisma.userSession.create({
      data: {
        userId: user.id,
        sessionToken: faker.string.uuid(),
        deviceFingerprint: faker.string.alphanumeric(32),
        ipAddress: faker.internet.ip(),
        userAgent: faker.internet.userAgent(),
        isActive: faker.datatype.boolean({ probability: 0.7 }),
        lastActivityAt: faker.date.recent({ days: 1 }),
        expiresAt: faker.date.future({ days: 7 }),
      },
    });
  }

  // Seed tenant quotas
  for (const tenant of tenants) {
    await prisma.tenantQuota.create({
      data: {
        tenantId: tenant.id,
        quotaType: 'USERS',
        maxValue: faker.number.int({ min: 100, max: 10000 }),
        currentValue: faker.number.int({ min: 10, max: 100 }),
      },
    });

    await prisma.tenantQuota.create({
      data: {
        tenantId: tenant.id,
        quotaType: 'STORAGE',
        maxValue: faker.number.int({ min: 1000, max: 100000 }), // MB
        currentValue: faker.number.int({ min: 100, max: 1000 }),
      },
    });
  }
}

function generateRealisticMessage(): string {
  const messageTypes = [
    () => faker.lorem.sentence(),
    () => `Hey ${faker.person.firstName()}, ${faker.lorem.sentence()}`,
    () => `@${faker.internet.userName()} ${faker.lorem.sentence()}`,
    () => `${faker.lorem.words(3)}? 🤔`,
    () => `Thanks! ${faker.helpers.arrayElement(['👍', '🙏', '✨', '🎉'])}`,
    () => faker.helpers.arrayElement([
      'Good morning everyone!',
      'Have a great day!',
      'See you tomorrow',
      'Let me know if you need anything',
      'Sounds good to me',
      'I agree with that',
      'Let\'s discuss this further',
      'Can we schedule a meeting?',
    ]),
  ];

  return faker.helpers.arrayElement(messageTypes)();
}

function generateReactions() {
  if (faker.datatype.boolean({ probability: 0.3 })) {
    const reactions: Record<string, string[]> = {};
    const emojis = ['👍', '❤️', '😂', '😮', '😢', '😡'];
    const selectedEmojis = faker.helpers.arrayElements(emojis, faker.number.int({ min: 1, max: 3 }));
    
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

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: SeedOptions = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace('--', '') as keyof SeedOptions;
    const value = parseInt(args[i + 1]);
    if (key && !isNaN(value)) {
      options[key] = value;
    }
  }

  seedDatabase(options).catch((error) => {
    console.error('Failed to seed database:', error);
    process.exit(1);
  });
}

export { seedDatabase };
