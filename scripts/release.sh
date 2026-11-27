#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: scripts/release.sh <patch|minor|major|X.Y.Z> [--push]" >&2
  exit 1
fi

BUMP="$1"
PUSH=false
if [[ "${2:-}" == "--push" ]]; then
  PUSH=true
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree is not clean. Commit or stash changes first." >&2
  exit 1
fi

NEW_SEMVER="$(node -e '
const fs = require("node:fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const meta = JSON.parse(fs.readFileSync("metadata.json", "utf8"));
const bump = process.argv[1];
const parts = pkg.version.split(".").map((n) => Number.parseInt(n, 10));
let nextSemver = bump;
if (bump === "patch") nextSemver = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
else if (bump === "minor") nextSemver = `${parts[0]}.${parts[1] + 1}.0`;
else if (bump === "major") nextSemver = `${parts[0] + 1}.0.0`;
else if (!/^\d+\.\d+\.\d+$/.test(bump)) {
  console.error("Invalid version/bump:", bump);
  process.exit(1);
}
pkg.version = nextSemver;
meta.version = (Number.isInteger(meta.version) ? meta.version : 0) + 1;
meta["version-name"] = nextSemver;
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
fs.writeFileSync("metadata.json", JSON.stringify(meta, null, 2) + "\n");
console.log(nextSemver);
' "$BUMP")"

TAG="v${NEW_SEMVER}"
npm run typecheck
npm run build

git add package.json metadata.json
git commit -m "chore(release): ${TAG}"
git tag -a "$TAG" -m "Release ${TAG}"

echo "Created commit and tag ${TAG}."
if [[ "$PUSH" == true ]]; then
  git push origin main --follow-tags
  echo "Pushed main and ${TAG} -> GitHub Actions will publish the release."
else
  echo "Run: git push origin main --follow-tags"
fi
