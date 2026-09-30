// Structured JSON Logger with secret redaction and log levels

const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'jwt',
  'apikey',
  'judge0_api_key',
  'mongo_uri',
  'source',
  'code'
];

function redact(obj, seen = new WeakSet()) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (seen.has(obj)) {
    return '[Circular]';
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map(item => redact(item, seen));
  }

  const redacted = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some(sk => lowerKey.includes(sk))) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = redact(value, seen);
    }
  }
  return redacted;
}

const LOG_LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getLogLevelThreshold() {
  const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LOG_LEVELS[envLevel] !== undefined ? LOG_LEVELS[envLevel] : LOG_LEVELS.info;
}

function writeLog(level, message, meta = {}) {
  const threshold = getLogLevelThreshold();
  if ((LOG_LEVELS[level] || 20) < threshold) {
    return;
  }

  const logEntry = {
    level,
    time: new Date().toISOString(),
    service: 'btech-coding-platform-api',
    environment: process.env.NODE_ENV || 'development',
    msg: message,
    ...redact(meta),
  };

  const output = JSON.stringify(logEntry);
  if (level === 'error') {
    process.stderr.write(output + '\n');
  } else {
    process.stdout.write(output + '\n');
  }
}

const logger = {
  debug: (msg, meta) => writeLog('debug', msg, meta),
  info: (msg, meta) => writeLog('info', msg, meta),
  warn: (msg, meta) => writeLog('warn', msg, meta),
  error: (msg, meta) => writeLog('error', msg, meta),
  redact,
};

module.exports = logger;
