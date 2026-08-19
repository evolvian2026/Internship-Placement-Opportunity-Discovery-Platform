import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app, prisma, request, registerUser, resetDatabase } from './helpers';

describe('authentication', () => {
  beforeAll(resetDatabase);
  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it('registers a user and returns a usable session', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Rahul Sharma', email: 'rahul@example.com', password: 'Password1' })
      .expect(201);

    expect(res.body.user.email).toBe('rahul@example.com');
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    // A password hash must never leave the server.
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('creates a profile and notification preferences alongside the account', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'rahul@example.com' },
      include: { profile: true, notificationPreferences: true },
    });
    expect(user.profile).not.toBeNull();
    expect(user.notificationPreferences).not.toBeNull();
  });

  it('rejects a duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Someone Else', email: 'rahul@example.com', password: 'Password1' })
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects a weak password with a useful message', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Weak Password', email: 'weak@example.com', password: 'short' })
      .expect(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(JSON.stringify(res.body.error.details)).toMatch(/8 characters/);
  });

  it('signs in with the right password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'rahul@example.com', password: 'Password1' })
      .expect(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('gives the same error for a wrong password and an unknown account', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'rahul@example.com', password: 'WrongPassword1' })
      .expect(401);
    const unknownUser = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Password1' })
      .expect(401);

    // Identical wording, so the endpoint cannot be used to enumerate accounts.
    expect(wrongPassword.body.error.message).toBe(unknownUser.body.error.message);
  });

  it('returns the current user for a valid token', async () => {
    const user = await registerUser();
    const res = await request(app)
      .get('/api/auth/me')
      .set('authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(res.body.email).toBe(user.email);
  });

  it('refuses a request with no token', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });

  it('refuses a tampered token', async () => {
    const user = await registerUser();
    await request(app)
      .get('/api/auth/me')
      .set('authorization', `Bearer ${user.token.slice(0, -4)}xxxx`)
      .expect(401);
  });

  it('rotates the refresh token, invalidating the presented one', async () => {
    const user = await registerUser();

    const first = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(200);
    expect(first.body.refreshToken).not.toBe(user.refreshToken);

    // Replaying the old token must fail.
    await request(app).post('/api/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
  });

  it('revokes the session on logout', async () => {
    const user = await registerUser();
    await request(app).post('/api/auth/logout').send({ refreshToken: user.refreshToken }).expect(204);
    await request(app).post('/api/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
  });

  it('blocks a student from the admin surface', async () => {
    const user = await registerUser();
    await request(app)
      .get('/api/admin/analytics')
      .set('authorization', `Bearer ${user.token}`)
      .expect(403);
  });
});
