#!/bin/sh
# Fixed-command updater sidecar. Only this service receives docker.sock.
set -eu

PROJECT_DIR="${APP_UPDATE_PROJECT_DIR:?APP_UPDATE_PROJECT_DIR must be an absolute host path}"
UPDATE_DIR="${APP_UPDATE_UPDATE_DIR:-/var/lib/xungen-update}"
POLL_SECONDS="${APP_UPDATE_POLL_SECONDS:-15}"
REQUEST="$UPDATE_DIR/docker-restart.requested"
PROCESSING="$UPDATE_DIR/docker-restart.processing"
FAILED="$UPDATE_DIR/docker-restart.failed"

case "$PROJECT_DIR" in
  /*) ;;
  *) echo "[updater] APP_UPDATE_PROJECT_DIR must be an absolute Linux path" >&2; exit 2 ;;
esac
case "$UPDATE_DIR" in
  /*) ;;
  *) echo "[updater] APP_UPDATE_UPDATE_DIR must be an absolute Linux path" >&2; exit 2 ;;
esac
case "$POLL_SECONDS" in
  ''|*[!0-9]*) echo "[updater] APP_UPDATE_POLL_SECONDS must be an integer" >&2; exit 2 ;;
esac

mkdir -p "$UPDATE_DIR"
if [ ! -f "$PROJECT_DIR/.env" ] || [ ! -f "$PROJECT_DIR/docker-compose.yml" ]; then
  echo "[updater] .env or docker-compose.yml not found under $PROJECT_DIR" >&2
  exit 2
fi

log() {
  echo "[updater] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
}

write_result() {
  status="$1"
  reason="$2"
  job_id="${3:-}"
  staging_name="${4:-}"
  tmp="$UPDATE_DIR/.docker-restart.last.$$"
  printf '{"jobId":"%s","status":"%s","reason":"%s","staging":"%s","at":"%s"}\n' "$job_id" "$status" "$reason" "$staging_name" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$tmp"
  chmod 0644 "$tmp"
  mv -f "$tmp" "$UPDATE_DIR/docker-restart.last"
}

preserve_previous_failure() {
  if [ -e "$FAILED" ] || [ -L "$FAILED" ]; then
    index=1
    while [ -e "$FAILED.$index" ] || [ -L "$FAILED.$index" ]; do
      index=$((index + 1))
    done
    mv "$FAILED" "$FAILED.$index" || return 1
  fi
}

fail_processing() {
  reason="$1"
  job_id="${2:-}"
  staging_name="${3:-}"
  preserve_previous_failure || log "无法轮转之前的失败请求"
  if [ -e "$PROCESSING" ] || [ -L "$PROCESSING" ]; then
    mv -f "$PROCESSING" "$FAILED" || log "无法将失败请求移到 $FAILED"
  fi
  write_result "FAILED" "$reason" "$job_id" "$staging_name" || log "无法写入失败状态"
  log "更新失败：$reason；请求已保留供人工检查，不会自动重试"
}

yaml_quote() {
  escaped="$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  printf '"%s"' "$escaped"
}

run_update() {
  if [ -L "$REQUEST" ] || [ ! -f "$REQUEST" ]; then
    log "拒绝非普通更新请求文件"
    if [ -L "$REQUEST" ]; then rm -f "$REQUEST"; fi
    return 0
  fi

  size="$(wc -c < "$REQUEST" | tr -d ' ')"
  case "$size" in
    ''|*[!0-9]*) log "无法读取更新请求大小"; return 0 ;;
  esac
  if [ "$size" -gt 16384 ]; then
    log "更新请求过大，已拒绝"
    if mv -f "$REQUEST" "$PROCESSING"; then fail_processing request-too-large; fi
    return 0
  fi

  # Atomic rename keeps the app from modifying a request while it is read.
  if ! mv "$REQUEST" "$PROCESSING"; then return 0; fi

  staging_count="$(sed -n 's/^[[:space:]]*"staging":[[:space:]]*"\(staging-[A-Za-z0-9._-]\{1,100\}\)",[[:space:]]*$/\1/p' "$PROCESSING" | wc -l | tr -d ' ')"
  job_count="$(sed -n 's/^[[:space:]]*"jobId":[[:space:]]*"\([0-9a-fA-F]\{8\}-[0-9a-fA-F]\{4\}-[0-9a-fA-F]\{4\}-[0-9a-fA-F]\{4\}-[0-9a-fA-F]\{12\}\)",[[:space:]]*$/\1/p' "$PROCESSING" | wc -l | tr -d ' ')"
  version_count="$(sed -n 's/^[[:space:]]*"targetVersion":[[:space:]]*"\([vV]*[0-9A-Za-z.+-]\{1,80\}\)"[,[:space:]]*$/\1/p' "$PROCESSING" | wc -l | tr -d ' ')"
  commit_count="$(sed -n 's/^[[:space:]]*"commit":[[:space:]]*"\([0-9a-fA-F]\{0,40\}\)"[,[:space:]]*$/\1/p' "$PROCESSING" | wc -l | tr -d ' ')"
  job_id_count="$(sed -n 's/^[[:space:]]*"jobId":[[:space:]]*"[^"]*",[[:space:]]*$/jobId/p' "$PROCESSING" | wc -l | tr -d ' ')"
  staging_field_count="$(sed -n 's/^[[:space:]]*"staging":[[:space:]]*"[^"]*",[[:space:]]*$/staging/p' "$PROCESSING" | wc -l | tr -d ' ')"
  version_field_count="$(sed -n 's/^[[:space:]]*"targetVersion":[[:space:]]*"[^"]*"[,[:space:]]*$/targetVersion/p' "$PROCESSING" | wc -l | tr -d ' ')"
  commit_field_count="$(sed -n 's/^[[:space:]]*"commit":[[:space:]]*"[^"]*"[,[:space:]]*$/commit/p' "$PROCESSING" | wc -l | tr -d ' ')"
  if [ "$staging_count" != "1" ] || [ "$job_count" != "1" ] || [ "$version_count" != "1" ] || [ "$commit_count" != "1" ] \
    || [ "$job_id_count" != "1" ] || [ "$staging_field_count" != "1" ] || [ "$version_field_count" != "1" ] || [ "$commit_field_count" != "1" ]; then
    fail_processing invalid-staging-marker unknown unknown
    return 0
  fi
  staging_name="$(sed -n 's/^[[:space:]]*"staging":[[:space:]]*"\(staging-[A-Za-z0-9._-]\{1,100\}\)",[[:space:]]*$/\1/p' "$PROCESSING")"
  job_id="$(sed -n 's/^[[:space:]]*"jobId":[[:space:]]*"\([0-9a-fA-F]\{8\}-[0-9a-fA-F]\{4\}-[0-9a-fA-F]\{4\}-[0-9a-fA-F]\{4\}-[0-9a-fA-F]\{12\}\)",[[:space:]]*$/\1/p' "$PROCESSING")"
  target_version="$(sed -n 's/^[[:space:]]*"targetVersion":[[:space:]]*"\([vV]*[0-9A-Za-z.+-]\{1,80\}\)",[[:space:]]*$/\1/p' "$PROCESSING")"
  build_sha="$(sed -n 's/^[[:space:]]*"commit":[[:space:]]*"\([0-9a-fA-F]\{0,40\}\)"[,[:space:]]*$/\1/p' "$PROCESSING")"
  staging="$UPDATE_DIR/$staging_name"
  if [ -L "$staging" ] || [ ! -d "$staging" ] || [ -L "$staging/Dockerfile" ] || [ ! -f "$staging/Dockerfile" ] || [ -L "$staging/package.json" ] || [ ! -f "$staging/package.json" ]; then
    fail_processing staging-not-found-or-invalid "$job_id" "$staging_name"
    return 0
  fi

  override="$UPDATE_DIR/.docker-compose.$staging_name.yml"
  {
    printf 'services:\n  app:\n    build:\n      context: '
    yaml_quote "$staging"
    printf '\n      args:\n        APP_VERSION: '
    yaml_quote "$target_version"
    printf '\n        APP_BUILD_SHA: '
    yaml_quote "$build_sha"
    printf '\n        APP_BUILD_TIME: '
    yaml_quote "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '\n'
  } > "$override"

  compose() {
    docker compose \
      --project-directory "$PROJECT_DIR" \
      --file "$PROJECT_DIR/docker-compose.yml" \
      --file "$override" \
      --env-file "$PROJECT_DIR/.env" \
      "$@"
  }

  log "检测到更新请求，使用部署 Compose 配置与 $staging_name 中的新版本源码构建 $target_version"
  if ! compose build app; then
    rm -f "$override"
    fail_processing compose-build "$job_id" "$staging_name"
    return 0
  fi
  if ! compose up -d --no-build app nginx; then
    rm -f "$override"
    fail_processing compose-up "$job_id" "$staging_name"
    return 0
  fi

  rm -f "$override" "$PROCESSING"
  if ! write_result "SUCCEEDED" "" "$job_id" "$staging_name"; then
    log "镜像已更新，但无法写入完成状态文件"
  fi
  log "更新完成：$staging_name"
}

if [ -e "$PROCESSING" ] || [ -L "$PROCESSING" ]; then
  interrupted_job_id="$(sed -n 's/^[[:space:]]*"jobId":[[:space:]]*"\([0-9a-fA-F]\{8\}-[0-9a-fA-F]\{4\}-[0-9a-fA-F]\{4\}-[0-9a-fA-F]\{4\}-[0-9a-fA-F]\{12\}\)",[[:space:]]*$/\1/p' "$PROCESSING" 2>/dev/null | head -n 1)"
  if ! printf '%s' "$interrupted_job_id" | grep -Eq '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'; then
    interrupted_job_id=unknown
  fi
  fail_processing sidecar-interrupted "$interrupted_job_id" unknown
fi
rm -f "$UPDATE_DIR"/.docker-compose.staging-*.yml

log "sidecar started; polling $REQUEST every ${POLL_SECONDS}s"
while :; do
  if [ -f "$REQUEST" ] && [ ! -L "$REQUEST" ]; then
    run_update
  fi
  sleep "$POLL_SECONDS"
done
