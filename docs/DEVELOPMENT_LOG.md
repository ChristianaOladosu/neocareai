# Development Log

## 2026-11-08 — Phase 1 + Phase 2 (+ core of Phase 4)
Built: monorepo, PostgreSQL schema (append-only audit/response/assessment tables), Express API (auth, RBAC, hospital isolation, newborns, observations, device gateway endpoints, devices, alert lifecycle, response log, audit, WebSocket events), intelligence package (plausibility-based data-quality checks, trend slope, configurable illustrative rules).
Tests executed: 27 passing (7 unit, 20 API integration) against local PostgreSQL 16.
Problem found by tests: stored device state "disconnected" made ingestion mark all readings unavailable. Fixed: a message from a device is evidence of connection; lateness is handled by the delayed-message check.
Not yet built: simulator, device-gateway service, React frontend, Azure AI abstraction, Docker files, e2e tests, remaining docs.
All data synthetic; all thresholds illustrative and not clinically approved.
