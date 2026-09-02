# Monitoring

Monitor:

- `GET /health` for API liveness;
- document status/progress and `error_message`;
- project `pre_status` values such as `triage_failed` and `specs_failed`;
- storage volume free space;
- PostgreSQL connections and query latency;
- model-call failures after bounded retries.

Container logs go to stdout/stderr and should be collected by the deployment platform.
