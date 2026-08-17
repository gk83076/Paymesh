/**
 * Custom error classes
 */

class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 422, "VALIDATION_ERROR");
    this.details = details;
  }
}

module.exports = { AppError, ValidationError };
