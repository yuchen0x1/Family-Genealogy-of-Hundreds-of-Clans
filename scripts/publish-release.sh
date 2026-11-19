#!/usr/bin/env bash
set -euo pipefail

tag="$1"
bundle="$2"
name="xungen-${tag#v}.tar.gz"
files=("$bundle"/assets/*)

# Keep failed uploads private and refuse to replace an existing published asset.
if ! gh release view "$tag" --json isDraft > "$bundle/release.json"; then
  gh release create "$tag" --verify-tag --draft --title "中华寻根 ${tag}" --notes-file "$bundle/notes.md"
fi

draft="$(gh release view "$tag" --json isDraft --jq .isDraft)"
if [[ "$draft" == true ]]; then
  remote="$(gh release view "$tag" --json assets --jq '.assets[].name')"
  for file in "${files[@]}"; do
    if ! grep -Fxq -- "$(basename "$file")" <<< "$remote"; then
      gh release upload "$tag" "$file"
    fi
  done
fi

download="$(mktemp -d)"
gh release download "$tag" --pattern '*' --dir "$download"
for file in "${files[@]}"; do
  cmp "$file" "$download/$(basename "$file")"
done
test "$(find "$download" -maxdepth 1 -type f | wc -l)" -eq "${#files[@]}"
node scripts/release-assets.mjs verify "$tag" "$download"
gh attestation verify "$download/$name" --repo "$GITHUB_REPOSITORY" --signer-workflow "$GITHUB_REPOSITORY/.github/workflows/ci.yml"

if [[ "$draft" == true ]]; then
  gh release edit "$tag" --title "中华寻根 ${tag}" --notes-file "$bundle/notes.md" --draft=false
fi
public="$(mktemp -d)"
for file in "${files[@]}"; do
  asset="$(basename "$file")"
  curl --fail --silent --show-error --location --retry 4 --max-time 60 \
    "https://github.com/$GITHUB_REPOSITORY/releases/download/$tag/$asset" --output "$public/$asset"
  cmp "$file" "$public/$asset"
done
node scripts/release-assets.mjs verify "$tag" "$public"
