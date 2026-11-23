#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
kubectl --context=minikube apply -f 30-api.yaml -f strategies/baseline.yaml
kubectl --context=minikube rollout status -n raincheck deployment/api --timeout=180s
