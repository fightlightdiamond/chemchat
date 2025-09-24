#!/usr/bin/env ts-node

import { PrismaClient, SubscriptionTier, ConversationType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting basic database seeding...');

  try {
    // Create or find existing tenant
    let tenant = await prisma.tenant.findFirst({
      where: { name: 'Development Tenant' }
    });
    
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          name: 'Development Tenant',
          subscriptionTier: SubscriptionTier.FREE,
          isActive: true,
        },
      });
      console.log(`✅ Created tenant: ${tenant.name}`);
    } else {
      console.log(`✅ Found existing tenant: ${tenant.name}`);
    }

    // Create test users
    const passwordHash = await bcrypt.hash('password123', 10);
    
    let user1 = await prisma.user.findFirst({
      where: { username: 'alice' }
    });
    
    if (!user1) {
      user1 = await prisma.user.create({
        data: {
          username: 'alice',
          displayName: 'Alice Johnson',
          email: 'alice@example.com',
          passwordHash,
        },
      });
      console.log(`✅ Created user: ${user1.username}`);
    } else {
      console.log(`✅ Found existing user: ${user1.username}`);
    }

    let user2 = await prisma.user.findFirst({
      where: { username: 'bob' }
    });
    
    if (!user2) {
      user2 = await prisma.user.create({
        data: {
          username: 'bob',
          displayName: 'Bob Smith',
          email: 'bob@example.com',
          passwordHash,
        },
      });
      console.log(`✅ Created user: ${user2.username}`);
    } else {
      console.log(`✅ Found existing user: ${user2.username}`);
    }

    // Create or find existing conversation
    let conversation = await prisma.conversation.findFirst({
      where: { 
        name: 'Alice & Bob Chat',
        ownerId: user1.id 
      }
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          type: ConversationType.DM,
          name: 'Alice & Bob Chat',
          ownerId: user1.id,
        },
      });
      console.log(`✅ Created conversation: ${conversation.name}`);
    } else {
      console.log(`✅ Found existing conversation: ${conversation.name}`);
    }

    // Add conversation members if they don't exist
    const existingMembers = await prisma.conversationMember.findMany({
      where: { conversationId: conversation.id }
    });

    if (existingMembers.length === 0) {
      await prisma.conversationMember.createMany({
        data: [
          {
            conversationId: conversation.id,
            userId: user1.id,
            role: 'OWNER',
          },
          {
            conversationId: conversation.id,
            userId: user2.id,
            role: 'MEMBER',
          },
        ],
      });
      console.log('✅ Added conversation members');
    } else {
      console.log('✅ Conversation members already exist');
    }

    // Create test messages if they don't exist
    const existingMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id }
    });

    let messages = existingMessages;
    if (existingMessages.length === 0) {
      messages = await Promise.all([
        prisma.message.create({
          data: {
            content: 'Hello Bob! How are you doing?',
            senderId: user1.id,
            conversationId: conversation.id,
            sequenceNumber: BigInt(1),
          },
        }),
        prisma.message.create({
          data: {
            content: 'Hi Alice! I\'m doing great, thanks for asking!',
            senderId: user2.id,
            conversationId: conversation.id,
            sequenceNumber: BigInt(2),
          },
        }),
        prisma.message.create({
          data: {
            content: 'That\'s wonderful to hear! Ready to test our chat system?',
            senderId: user1.id,
            conversationId: conversation.id,
            sequenceNumber: BigInt(3),
          },
        }),
      ]);
      console.log(`✅ Created ${messages.length} test messages`);
    } else {
      console.log(`✅ Found ${existingMessages.length} existing messages`);
    }

    // Create or update conversation state
    const existingState = await prisma.conversationState.findUnique({
      where: { conversationId: conversation.id }
    });

    if (!existingState) {
      await prisma.conversationState.create({
        data: {
          conversationId: conversation.id,
          lastSeq: BigInt(messages.length),
        },
      });
      console.log('✅ Created conversation state');
    } else {
      console.log('✅ Conversation state already exists');
    }

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\nTest Data Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📋 Tenant: ${tenant.name}`);
    console.log(`👥 Users: ${user1.username} (${user1.email}), ${user2.username} (${user2.email})`);
    console.log(`💬 Conversation: ${conversation.name}`);
    console.log(`📨 Messages: ${messages.length} test messages`);
    console.log('🔑 Password for all users: password123');
    console.log('\nYou can now test the chat system with these accounts!');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
