import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

export * from "./generated/prisma/client.ts";

export function prismaAdapter(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL manquant");
  return new PrismaPg({ connectionString });
}

export function createPrismaClient(connectionString?: string) {
  return new PrismaClient({ adapter: prismaAdapter(connectionString) });
}
