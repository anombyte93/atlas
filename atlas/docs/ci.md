# CI / Smoke Checks

Run local CI script:
```
./atlas/scripts/ci.sh
```

This builds agent + control plane and runs the smoke test.

## GitHub Actions
CI runs on push and PR via `.github/workflows/ci.yml`.
