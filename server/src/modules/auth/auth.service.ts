import jwt from "jsonwebtoken";
import { prisma } from "../../config/postgres";
import { env } from "../../config/env";

export class InvalidCredentialsError extends Error {}

export interface LoginResult {
  token: string;
  userId: string;
  username: string;
  role: "USER" | "ADMIN";
}

// No registration flow exists (out of scope for this case): a username
// either already exists in Postgres (seeded) or login is rejected outright.
export async function login(username: string): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    throw new InvalidCredentialsError(`Unknown username: ${username}`);
  }

  const token = jwt.sign({ userId: user.id, username: user.username, role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRY as jwt.SignOptions["expiresIn"],
  });

  return { token, userId: user.id, username: user.username, role: user.role };
}
