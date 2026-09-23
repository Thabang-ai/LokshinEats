/**
 * Application smoke tests.
 *
 * Mounts the real app with supertest — no port binding — to confirm the
 * middleware chain assembles and that unauthenticated callers are turned away
 * before any handler runs.
 */

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

const app = createApp();

describe('health', () => {
  it('answers the unversioned liveness probe', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('answers the versioned readiness probe', async () => {
    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', version: 'v1' });
  });
});

describe('error contract', () => {
  it('returns a structured 404 for an unknown route', async () => {
    const response = await request(app).get('/api/v1/nope');
    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: 'not_found' });
  });

  it('echoes a correlation id on every response', async () => {
    const response = await request(app)
      .get('/health')
      .set('X-Request-Id', 'trace-me-123');
    expect(response.headers['x-request-id']).toBe('trace-me-123');
  });

  it('rejects malformed JSON with a 400 rather than a crash', async () => {
    const response = await request(app)
      .post('/api/v1/users/me')
      .set('Content-Type', 'application/json')
      .send('{"displayName": ');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('bad_request');
  });
});

describe('cross-origin callers', () => {
  // The site's own origin is in the code, so it works whatever a hosting
  // dashboard's CORS_ORIGINS happens to say. Getting this wrong takes the
  // whole site down while the API looks perfectly healthy.
  it('serves the web app, which is never left to configuration', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', 'https://lokshin-eats.vercel.app');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://lokshin-eats.vercel.app',
    );
  });

  it('serves the web app\'s own preview builds, per branch and per deploy', async () => {
    for (const origin of [
      'https://lokshin-eats-git-feat-rest-api-thabang-s-projects1.vercel.app',
      'https://lokshin-eats-lm22v7ilq-thabang-s-projects1.vercel.app',
    ]) {
      const response = await request(app).get('/health').set('Origin', origin);
      expect(response.status, origin).toBe(200);
    }
  });

  it('refuses hosts that only look like a preview of ours', async () => {
    for (const origin of [
      // Anyone can register these; none of them are our team's previews.
      'https://lokshin-eats-git-main-someone-else.vercel.app',
      'https://lokshin-eats.attacker.example',
      'https://lokshin-eats-git-x-thabang-s-projects1.vercel.app.evil.example',
      'http://lokshin-eats-git-x-thabang-s-projects1.vercel.app',
    ]) {
      const response = await request(app).get('/health').set('Origin', origin);
      expect(response.status, origin).toBe(403);
    }
  });

  it('serves callers that send no Origin at all: curl, and the phones', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
  });
});

describe('authentication', () => {
  it('refuses an unauthenticated request to a protected route', async () => {
    const response = await request(app).get('/api/v1/users/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('unauthenticated');
  });

  it('refuses a malformed Authorization header', async () => {
    const response = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', 'Basic abc123');
    expect(response.status).toBe(401);
  });

  it('refuses a bearer token that is not a valid Firebase ID token', async () => {
    const response = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('unauthenticated');
  });
});
