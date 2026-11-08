# NeocareAI Architecture (Phase 1 foundation)

Status: early-stage prototype. All data is synthetic. Thresholds are illustrative, not clinically approved.

Flow: Monitor/Simulator -> Device Gateway (adapter, normalisation, association, validation) -> Backend API -> PostgreSQL -> Intelligence (signal quality, trends, rules, explainable alerts) -> React Clinical Workspace -> Clinical response (acknowledge, assess, escalate/resolve) -> Audit history.

Monorepo: apps/web, services/{api,device-gateway,simulator,intelligence}, packages/{shared,types,validation}, database/{migrations,seeds}.

Core product works without generative AI; Azure AI is optional and falls back to a local mock.
