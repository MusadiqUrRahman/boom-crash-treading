const winston = require('winston');
const path = require('path');
const fs = require('fs');

require('winston-daily-rotate-file');

function createLogger(options) {
  const logDir = options.logDir || path.join(__dirname, 'logs');
  const level = options.level || 'info';

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const jsonFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  );

  const humanFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, component, ...meta }) => {
      const comp = component || 'Main';
      const metaStr = Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta) : '';
      return `[${timestamp}] [${level.toUpperCase()}] [${comp}] ${message}${metaStr}`;
    })
  );

  const transports = [
    new winston.transports.Console({
      level,
      format: humanFormat,
    }),

    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '10',
      format: jsonFormat,
      level,
    }),

    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '10',
      format: jsonFormat,
      level: 'error',
    }),
  ];

  if (level === 'debug') {
    transports.push(
      new winston.transports.DailyRotateFile({
        filename: path.join(logDir, 'debug-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: '10m',
        maxFiles: '5',
        format: jsonFormat,
        level: 'debug',
      })
    );
  }

  const logger = winston.createLogger({
    level,
    transports,
    exitOnError: false,
  });

  return {
    error: (component, message, meta) => logger.error(message, { component, ...(meta || {}) }),
    warn: (component, message, meta) => logger.warn(message, { component, ...(meta || {}) }),
    info: (component, message, meta) => logger.info(message, { component, ...(meta || {}) }),
    debug: (component, message, meta) => logger.debug(message, { component, ...(meta || {}) }),
  };
}

module.exports = { createLogger };
