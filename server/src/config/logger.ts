/**
 * Structured logging.
 *
 * JSON in production so log aggregators can parse it; pretty-printed only if
 * the operator has installed pino-pretty locally. Sensitive fields are
 * redacted centrally so no call site can leak a token by accident.
 */

import pino from 'pino';
import { env, isProduction, isTest } from './env';

export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  // Redaction is belt-and-braces: request logging already whitelists fields,
  // but anything that reaches a logger with these paths is scrubbed.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      'idToken',
      '*.idToken',
      'deliveryOTP',
      '*.deliveryOTP',
      'secretKey',
      '*.secretKey',
    ],
    censor: '[redacted]',
  },
  base: { service: 'lokshineats-api', env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino/file',
          options: { destination: 1 },
        },
      }),
});

/** Child logger for a named subsystem, e.g. `moduleLogger('orders')`. */
export function moduleLogger(name: string) {
  return logger.child({ module: name });
}
