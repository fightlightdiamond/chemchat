#!/usr/bin/env ts-node

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function simpleSeed() {
  console.log('🌱 Starting simple database seeding...');

  try {
    // Clean existing data in development
    if (process.env.NODE_ENV === 'development') {
      console.log('🧹 Cleaning existing data...');
      await prisma.message.deleteMany();
      await prisma.conversationParticipant.deleteMany();
      await prisma.conversation.deleteMany();
      await prisma.user.deleteMany();
      await prisma.tenant.deleteMany();
    }

    // Create a test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Development Tenant',
        subdomain: 'dev',
        subscriptionTier: 'ENTERPRISE',
        status: 'ACTIVE',
      },
    });

    console.log(`✅ Created tenant: ${tenant.name}`);

    // Create test users
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    const users = await Promise.all([
      prisma.user.create({
        data: {
          email: 'admin@chemchat.dev',
          username: 'admin',
          displayName: 'Admin User',
          passwordHash: hashedPassword,
          isActive: true,
          tenantId: tenant.id,
        },
      }),
      prisma.user.create({
        data: {
          email: 'alice@chemchat.dev',
          username: 'alice',
          displayName: 'Alice Johnson',
          passwordHash: hashedPassword,
          isActive: true,
          tenantId: tenant.id,
        },
      }),
      prisma.user.create({
        data: {
          email: 'bob@chemchat.dev',
          username: 'bob',
          displayName: 'Bob Smith',
          passwordHash: hashedPassword,
          isActive: true,
          tenantId: tenant.id,
        },
      }),
    ]);

    console.log(`✅ Created ${users.length} users`);

    // Create a test conversation
    const conversation = await prisma.conversation.create({
      data: {
        name: 'General Discussion',
        type: 'GROUP',
        isPrivate: false,
        tenantId: tenant.id,
        createdById: users[0].id,
      },
    });

    console.log(`✅ Created conversation: ${conversation.name}`);

    // Add participants to conversation
    await Promise.all(
      users.map((user) =>
        prisma.conversationParticipant.create({
          data: {
            conversationId: conversation.id,
            userId: user.id,
            role: user.username === 'admin' ? 'ADMIN' : 'MEMBER',
            joinedAt: new Date(),
          },
        })
      )
    );

    console.log(`✅ Added ${users.length} participants to conversation`);

    // Create some test messages
    const messages = [
      'Welcome to ChemChat! 🎉',
      'This is a test message from Alice',
      'Hello everyone! Great to be here.',
      'How is everyone doing today?',
      'The development environment is working perfectly!',
    ];

    for (let i = 0; i < messages.length; i++) {
      await prisma.message.create({
        data: {
          content: messages[i],
          type: 'TEXT',
          conversationId: conversation.id,
          authorId: users[i % users.length].id,
          sequenceNumber: BigInt(i + 1),
        },
      });
    }

    console.log(`✅ Created ${messages.length} test messages`);

    // Create conversation state
    await prisma.conversationState.create({
      data: {
        conversationId: conversation.id,
        lastSequenceNumber: BigInt(messages.length),
        lastActivityAt: new Date(),
        participantCount: users.length,
        messageCount: messages.length,
      },
    });

    console.log('✅ Database seeding completed successfully!');
    console.log(`
📊 Summary:
- Tenant: ${tenant.name} (${tenant.subdomain})
- Users: ${users.length} (admin@chemchat.dev, alice@chemchat.dev, bob@chemchat.dev)
- Conversation: ${conversation.name}
- Messages: ${messages.length}
- Password for all users: password123
    `);

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  simpleSeed().catch((error) => {
    console.error('Failed to seed database:', error);
    process.exit(1);
  });
}

export { simpleSeed };
