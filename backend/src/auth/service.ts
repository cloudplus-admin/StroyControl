import { prisma } from '../db/prisma';
import { createToken, hashToken, verifyPassword } from './crypto';

const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function expiresIn(ms: number): Date {
  return new Date(Date.now() + ms);
}

async function issueSession(userId: string) {
  const accessToken = createToken();
  const refreshToken = createToken();
  await prisma.session.create({
    data: {
      userId,
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
      accessExpiresAt: expiresIn(ACCESS_TTL_MS),
      refreshExpiresAt: expiresIn(REFRESH_TTL_MS),
    },
  });
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_MS / 1000 };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { company: true, roles: { include: { role: true } } },
  });
  if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) return null;
  const tokens = await issueSession(user.id);
  return {
    ...tokens,
    user: {
      id: user.id,
      companyId: user.companyId,
      companyName: user.company.name,
      email: user.email,
      fullName: user.fullName,
      locale: user.locale,
      roles: user.roles.map((assignment) => ({ code: assignment.role.code, objectId: assignment.objectId })),
    },
  };
}

export async function refresh(refreshToken: string) {
  const session = await prisma.session.findUnique({
    where: { refreshTokenHash: hashToken(refreshToken) },
  });
  if (!session || session.revokedAt || session.refreshExpiresAt <= new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { isActive: true } });
  if (!user?.isActive) return null;
  return prisma.$transaction(async (tx) => {
    await tx.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    const accessToken = createToken();
    const nextRefreshToken = createToken();
    await tx.session.create({
      data: {
        userId: session.userId,
        accessTokenHash: hashToken(accessToken),
        refreshTokenHash: hashToken(nextRefreshToken),
        accessExpiresAt: expiresIn(ACCESS_TTL_MS),
        refreshExpiresAt: expiresIn(REFRESH_TTL_MS),
      },
    });
    return { accessToken, refreshToken: nextRefreshToken, expiresIn: ACCESS_TTL_MS / 1000 };
  });
}

export async function revokeAccessToken(accessToken: string) {
  await prisma.session.updateMany({
    where: { accessTokenHash: hashToken(accessToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function authenticateAccessToken(accessToken: string) {
  const session = await prisma.session.findUnique({
    where: { accessTokenHash: hashToken(accessToken) },
    include: { user: { include: { roles: { include: { role: true } } } } },
  });
  if (!session || session.revokedAt || session.accessExpiresAt <= new Date() || !session.user.isActive) return null;
  return {
    userId: session.user.id,
    companyId: session.user.companyId,
    roles: session.user.roles.map((assignment) => ({ code: assignment.role.code, objectId: assignment.objectId })),
  };
}
