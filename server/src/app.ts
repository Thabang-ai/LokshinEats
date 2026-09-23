/**
 * Express application assembly.
 *
 * Kept separate from index.ts so tests can mount the app with supertest
 * without binding a port.
 *
 * Middleware order is deliberate: security headers and CORS run before any
 * body is parsed, request correlation is established before logging, and the
 * error boundary is mounted last so it can catch everything above it.
 */

import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cors, { type CorsOptions } from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env, isProduction } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { globalRateLimit } from './middleware/rateLimit';
import { ApiError } from './lib/ApiError';
import { apiRouter } from './modules/router';

/**
 * The web app's own address. It is part of this system, not a deployment
 * choice, so it lives here rather than in CORS_ORIGINS: a typo in a hosting
 * dashboard should not be able to cut the site off from its own API, which is
 * a failure that looks like the site being broken and says nothing useful in
 * any log. CORS_ORIGINS still adds origins - preview builds, a custom domain -
 * and is the right place for them.
 */
const OWN_WEB_ORIGINS = ['https://lokshin-eats.vercel.app'];

/**
 * CORS applies to browsers only — the admin dashboard and the existing web
 * app. The Flutter clients are not subject to it. An empty allow-list in
 * development means "reflect the caller"; in production an unlisted origin is
 * rejected outright.
 */
function corsOptions(): CorsOptions {
  const allowed = [...new Set([...env.CORS_ORIGINS, ...OWN_WEB_ORIGINS])];

  return {
    origin(origin, callback) {
      // Same-origin, curl, and mobile clients send no Origin header.
      if (!origin) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      if (!isProduction && allowed.length === 0) return callback(null, true);
      return callback(ApiError.forbidden(`Origin ${origin} is not allowed.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86_400,
  };
}

export function createApp(): Application {
  const app = express();

  // Behind Cloud Run / a load balancer, req.ip must come from
  // X-Forwarded-For or every caller looks like the proxy to the rate limiter.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // This is a JSON API with no server-rendered HTML, so the CSP and
  // cross-origin resource policies that helmet applies to documents only get
  // in the way of legitimate clients.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,
    }),
  );
  app.use(cors(corsOptions()));
  app.use(compression());

  // A 100kb ceiling comfortably fits the largest order payload and stops a
  // client from tying up memory with a huge body.
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  // Correlation id: reuse the caller's if it supplied one, so a trace can be
  // followed from the Flutter app through to a log line.
  app.use((req, res, next) => {
    const incoming = req.header('x-request-id');
    const requestId =
      incoming && incoming.length <= 200 ? incoming : randomUUID();
    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  });

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as { id?: string }).id ?? randomUUID(),
      // Health checks would otherwise dominate the logs.
      autoLogging: {
        ignore: (req) => req.url === '/health' || req.url === '/api/v1/health',
      },
      customLogLevel(_req, res, err) {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      // Explicitly whitelist what is logged. The default serialiser would
      // include the Authorization header on every request.
      serializers: {
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use(globalRateLimit);

  // Unversioned liveness probe for the platform's health checker.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
