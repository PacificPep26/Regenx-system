// Creates (or resets) the first real admin. Usage:
//   ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='a long passphrase' pnpm tsx prisma/create-admin.ts
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD");
  if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters");
  const passwordHash = await bcrypt.hash(password, 12);
  const u = await db.user.upsert({
    where: { email },
    create: { email, name: process.env.ADMIN_NAME ?? "Admin", role: "ADMIN", passwordHash },
    update: { passwordHash, role: "ADMIN", active: true, sessionVersion: { increment: 1 } },
  });
  console.log(`admin ready: ${u.email}`);
}
main().finally(() => db.$disconnect());
