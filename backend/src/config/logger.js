const winston = require("winston");
const config = require("./index");

const { combine, timestamp, printf, colorize, json } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? ` ${JSON.stringify(meta)}`
      : "";
    return `${timestamp} [${level}] ${message}${metaStr}`;
  })
);

const prodFormat = combine(timestamp(), json());

const logger = winston.createLogger({
  level: config.logging.level,
  format: config.env === "production" ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
  ],
});

module.exports = logger;
