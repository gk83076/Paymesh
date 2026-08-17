"use strict";
require("express-async-errors");
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const swaggerUi = require("swagger-ui-express");

const config = require("./config");
const logger = require("./config/logger");
const swaggerSpec = require("./docs/swagger");
const routes = require("./routes");
const errorHandler = require("./middlewares/errorHandler");
const requestLogger = require("./middlewares/requestLogger");

const app = express();

// ─── Security & Compression ──────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: config.cors.origin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Idempotency-Key"],
  })
);

// ─── Body Parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Request Logging ─────────────────────────────────────────────────────────
app.use(requestLogger);

// ─── API Documentation ───────────────────────────────────────────────────────
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: "PayMesh API Docs",
    customCss: `
      .swagger-ui .topbar { background-color: #0f172a; }
      .swagger-ui .topbar-wrapper .link { display: none; }
    `,
    swaggerOptions: { persistAuthorization: true },
  })
);

// Serve raw OpenAPI spec
app.get("/api/docs.json", (req, res) => {
  res.json(swaggerSpec);
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use("/api", routes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: { message: `Route ${req.method} ${req.path} not found` },
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
