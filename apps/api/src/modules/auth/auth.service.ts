import type { AuthResponse, AuthUser } from '@odp/shared';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import {
  BadRequestError,
  ConflictError,
  ServiceUnavailableError,
  UnauthorizedError,
} from '../../lib/errors';
import {
  generateRefreshToken,
  hashPassword,
  hashRefreshToken,
  signAccessToken,
  verifyPassword,
} from '../../lib/tokens';
import type { LoginInput, RegisterInput } from './auth.schemas';

/** Default notification preferences created alongside every account. */
async function createDefaults(userId: string): Promise<void> {
  await prisma.notificationPreference.create({ data: { userId } });
}

function toAuthUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
  profile?: { id: string } | null;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as AuthUser['role'],
    emailVerified: user.emailVerified,
    hasProfile: Boolean(user.profile),
  };
}

async function issueSession(
  user: { id: string; email: string; name: string; role: string; emailVerified: boolean; profile?: { id: string } | null },
  userAgent?: string,
): Promise<AuthResponse> {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role as AuthUser['role'],
  });
  const refresh = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt,
      userAgent: userAgent?.slice(0, 255),
    },
  });

  return {
    user: toAuthUser(user),
    accessToken,
    refreshToken: refresh.token,
    expiresIn: env.JWT_ACCESS_TTL,
  };
}

export async function register(input: RegisterInput, userAgent?: string): Promise<AuthResponse> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError('An account with this email already exists. Try signing in instead.');
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      // Email verification is a separate flow; the account is usable meanwhile.
      emailVerified: false,
      profile: {
        create: {
          country: 'India',
          preferences: { create: {} },
        },
      },
    },
    include: { profile: { select: { id: true } } },
  });

  await createDefaults(user.id);
  return issueSession(user, userAgent);
}

export async function login(input: LoginInput, userAgent?: string): Promise<AuthResponse> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { profile: { select: { id: true } } },
  });

  // Same error and comparable timing whether the account exists or not.
  const invalid = new UnauthorizedError('Incorrect email or password.');
  if (!user || !user.passwordHash || user.deletedAt) {
    await verifyPassword(input.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    throw invalid;
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw invalid;

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return issueSession(user, userAgent);
}

/**
 * Refresh-token rotation: the presented token is revoked and a new one issued,
 * so a stolen token is usable at most once.
 */
export async function refresh(token: string, userAgent?: string): Promise<AuthResponse> {
  const tokenHash = hashRefreshToken(token);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      user: { include: { profile: { select: { id: true } } } },
    },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.user.deletedAt) {
    throw new UnauthorizedError('Session expired. Please sign in again.');
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return issueSession(stored.user, userAgent);
}

export async function logout(token: string): Promise<void> {
  const tokenHash = hashRefreshToken(token);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function logoutAll(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.passwordHash) {
    throw new BadRequestError('This account signs in with Google and has no password set.');
  }
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) throw new UnauthorizedError('Current password is incorrect.');

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  // Every other session is invalidated after a password change.
  await logoutAll(userId);
}

export async function getCurrentUser(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: { profile: { select: { id: true } } },
  });
  if (!user) throw new UnauthorizedError('Account no longer exists.');
  return toAuthUser(user);
}

/**
 * Google sign-in. Verifies the ID token against Google's tokeninfo endpoint
 * and links or creates the account.
 */
export async function loginWithGoogle(idToken: string, userAgent?: string): Promise<AuthResponse> {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new ServiceUnavailableError('Google sign-in is not configured on this deployment.');
  }

  let payload: { sub: string; email: string; email_verified?: string | boolean; name?: string; aud: string };
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
    if (!res.ok) throw new Error(`tokeninfo returned ${res.status}`);
    payload = (await res.json()) as typeof payload;
  } catch (err) {
    logger.warn({ err }, 'google token verification failed');
    throw new UnauthorizedError('Could not verify the Google sign-in.');
  }

  if (payload.aud !== env.GOOGLE_CLIENT_ID) {
    throw new UnauthorizedError('This Google token was not issued for this application.');
  }
  const email = payload.email?.toLowerCase();
  if (!email) throw new UnauthorizedError('Google account has no email address.');

  const existing = await prisma.user.findFirst({
    where: { OR: [{ googleId: payload.sub }, { email }] },
    include: { profile: { select: { id: true } } },
  });

  if (existing) {
    if (!existing.googleId) {
      await prisma.user.update({ where: { id: existing.id }, data: { googleId: payload.sub } });
    }
    await prisma.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date() } });
    return issueSession(existing, userAgent);
  }

  const user = await prisma.user.create({
    data: {
      email,
      googleId: payload.sub,
      name: payload.name ?? email.split('@')[0],
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
      profile: { create: { country: 'India', preferences: { create: {} } } },
    },
    include: { profile: { select: { id: true } } },
  });
  await createDefaults(user.id);
  return issueSession(user, userAgent);
}
