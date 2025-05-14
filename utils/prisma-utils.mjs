import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Optional: Gracefully handle shutdown
const disconnectPrisma = async () => {
  try {
    await prisma.$disconnect();
    console.log("Prisma disconnected successfully.");
  } catch (error) {
    console.error("Error disconnecting Prisma:", error);
  }
};

export { prisma, disconnectPrisma };
