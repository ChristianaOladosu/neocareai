# Development Log

## 2026-11-08 — Phase 1 + Phase 2 (+ core of Phase 4)
Built: monorepo, PostgreSQL schema (append-only audit/response/assessment tables), Express API (auth, RBAC, hospital isolation, newborns, observations, device gateway endpoints, devices, alert lifecycle, response log, audit, WebSocket events), intelligence package (plausibility-based data-quality checks, trend slope, configurable illustrative rules).
Tests executed: 27 passing (7 unit, 20 API integration) against local PostgreSQL 16.
Problem found by tests: stored device state "disconnected" made ingestion mark all readings unavailable. Fixed: a message from a device is evidence of connection; lateness is handled by the delayed-message check.
Not yet built: simulator, device-gateway service, React frontend, Azure AI abstraction, Docker files, e2e tests, remaining docs.
All data synthetic; all thresholds illustrative and not clinically approved.

## 2026-11-08 (later) — Phase 3: simulator and device gateway
Built: device-gateway service (simulator adapter -> standard observation format -> validation -> forwarder with in-memory buffering and ordered resync), synthetic simulator with scenarios A-F (all labelled synthetic), API endpoint for gateway hospital discovery.
Tests executed: 39 passing (8 unit, 20 API integration, 11 pipeline/gateway). Live smoke test with real API, gateway and simulator processes: scenario B stored 64 observations and raised 1 high-priority illustrative alert.
Defect found by tests and fixed: the "unreliable data" rule examined the last 3 readings across all sensors, so healthy sensors masked a failing one. It is now evaluated per measurement type (regression test added).
Known limitations: gateway buffer is in-memory (lost on restart); the simulator is the only adapter; no physical device has been connected.
