#!/bin/sh
# Assemble the GitHub Pages site in _site/: the hub at the root and every
# app under /<name>/. Vite apps are built, static apps are copied as they are.
set -eu
cd "$(dirname "$0")/.."

rm -rf _site
mkdir -p _site
cp -R hub/. _site/

for app in apps/*/; do
  name=$(basename "$app")
  if [ -f "$app/package.json" ] && grep -q '"build"' "$app/package.json"; then
    echo "building $name"
    (cd "$app" && npm ci --no-audit --no-fund && npm run build)
    cp -R "$app/dist" "_site/$name"
  else
    echo "copying $name"
    mkdir -p "_site/$name"
    cp -R "$app/." "_site/$name/"
  fi
done

touch _site/.nojekyll
echo "site ready in _site/"
