# Release

1. Bump `version` in `package.json`.
2. Add a `CHANGELOG.md` section for that version.
3. Commit, then publish locally if the `NPM_TOKEN` secret is not set:

```sh
npm publish --access public
git tag v0.2.0
git push origin main --tags
gh release create v0.2.0 --title v0.2.0 --notes-file - <<'EOF'
See CHANGELOG.md
EOF
```

The `Release` workflow also publishes on `v*` tags when `NPM_TOKEN` exists in the `npm` environment. If the version is already on npm, that job may fail; the GitHub Release step is idempotent.

Required repository secret:

- `NPM_TOKEN` — npm granular access token with read/write for `dsh-lens`
