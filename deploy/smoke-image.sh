#!/usr/bin/env bash
set -euo pipefail
service=${1:?Supply api, sme, or warehouse}
image=${2:?Supply an image tag}
case "$service" in api|sme|warehouse) ;; *) exit 2 ;; esac
container="sokoni-smoke-$service-$$"
trap 'docker logs "$container" 2>&1 || true; docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
port=3000
path=/
if [ "$service" = api ]; then
  port=4000
  path=/health
  docker run --platform linux/arm64 -d --name "$container" \
    -e NODE_ENV=production -e APP_MODE=wholesale -e PAYMENTS_ENV=disabled \
    -e SUPABASE_URL=https://example.supabase.co \
    -e SUPABASE_PUBLISHABLE_KEY=public-build-test-key \
    -e SUPABASE_SECRET_KEY=server-build-test-key "$image"
else
  docker run --platform linux/arm64 -d --name "$container" "$image"
fi
healthy=false
for attempt in $(seq 1 30); do
  if docker exec "$container" node -e "fetch('http://127.0.0.1:$port$path').then(r=>process.exit(r.status<400?0:1)).catch(()=>process.exit(1))"; then
    healthy=true
    break
  fi
  sleep 2
done
[ "$healthy" = true ]
if [ "$service" = api ]; then
  docker exec "$container" node -e "fetch('http://127.0.0.1:4000/v1/checkouts',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>process.exit(r.status===404?0:1)).catch(()=>process.exit(1))"
fi
