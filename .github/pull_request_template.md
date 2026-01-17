# PR Title

## Summary
- Describe what this PR changes and why.

## Scope
- [ ] API (NestJS)
- [ ] Admin (Next.js)
- [ ] Cashier (Next.js)
- [ ] Miniapp (Next.js)
- [ ] Infra / CI
- [ ] Docs

## Definition of Done (DoD)
- [ ] TypeScript strict mode respected (no implicit any, noUncheckedIndexedAccess honored)
- [ ] ENV schema validated (Ajv) and secure defaults kept (Helmet, CORS, throttling, centralized error handling)
- [ ] Idempotency for monetary operations (commit/refund) covered by tests
- [ ] Transactions are atomic and invariants (Wallet/Transaction/Hold) are preserved
- [ ] Observability updated (structured logs, metrics, optional 5xx alert sampling)
- [ ] Local env only; no production secrets/URLs committed
- [ ] All tests green: `pnpm -C api test && pnpm -C api test:e2e`
- [ ] README/docs updated where relevant (feature flags, alerts/metrics, endpoints)

## Testing
- [ ] Unit tests added/updated
- [ ] E2E tests added/updated
- [ ] Manual smoke checklist
  - [ ] `docker compose -f infra/docker-compose.yml up -d`
  - [ ] `pnpm -C api test && pnpm -C api test:e2e`

## Feature Flags
- [ ] WORKERS_ENABLED
- [ ] EARN_LOTS_FEATURE
- [ ] POINTS_TTL_FEATURE / POINTS_TTL_BURN / TTL_BURN_ENABLED

## Screenshots / Logs (if applicable)

## Breaking Changes
- [ ] None
- [ ] Documented migration path

## Rollback Plan
- [ ] Safe to rollback
- [ ] Notes:
