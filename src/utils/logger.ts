const IS_PROD = process.env.NODE_ENV === 'production';
const LEVEL   = (process.env.LOG_LEVEL || (IS_PROD ? 'error' : 'debug')).toLowerCase();

const LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const current = LEVELS[LEVEL] ?? (IS_PROD ? 3 : 0);

const ts = () => new Date().toISOString();

export const logger = {
  debug: (...a: any[]) => current <= 0 && console.log( `[${ts()}] DEBUG`, ...a),
  info:  (...a: any[]) => current <= 1 && console.log( `[${ts()}] INFO `, ...a),
  warn:  (...a: any[]) => current <= 2 && console.warn(`[${ts()}] WARN `, ...a),
  error: (...a: any[]) => current <= 3 && console.error(`[${ts()}] ERROR`, ...a),
};
