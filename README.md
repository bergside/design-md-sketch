# DESIGN.md Generator for Sketch - TypeUI

Sketch plugin that extracts local style signals and generates editable `DESIGN.md` and `SKILL.md` drafts from TypeUI blueprints.

## Features

- Extracts shared text/layer styles, colors, typography, radius, spacing signals from the current Sketch document
- Generates draft `DESIGN.md` and `SKILL.md` content based on bundled blueprints
- Tab switcher between `DESIGN.md` and `SKILL.md`
- Editable markdown textarea
- Top-right actions: `Copy`, `Download`, `Refresh`
- Extraction stats and estimated token counts
- Footer links to TypeUI and GitHub metadata

## Development

```bash
npm install
npm run build
```

This builds `design-md-sketch.sketchplugin` and symlinks it to Sketch via `skpm-link` during `npm install`.

## Publishing with skpm

This repo is configured for `skpm publish` with:

- GitHub repo remote configured in `package.json`
- Explicit appcast URL in `src/manifest.json`:
  - `https://raw.githubusercontent.com/bergside/design-md-sketch/main/.appcast.xml`
- `skpm` pinned in `devDependencies`
- Release scripts in `package.json`

### 1) One-time auth

Use a GitHub Personal Access Token (classic) with `repo` scope.

```bash
npm run skpm:login
```

### 2) Preflight

```bash
npm run build
npm run publish:help
```

### 3) Publish a release

Pick one:

```bash
npm run publish:patch
npm run publish:minor
npm run publish:major
```

`skpm publish` automates:

- ZIP archive generation
- GitHub Release creation
- `.appcast.xml` create/update
- Plugin Directory PR flow (unless skipped)

### 4) Optional flags

Run directly when needed:

```bash
npx skpm publish patch --skip-registry
npx skpm publish patch --skip-release
```

## Notes on Sketch 97+

- `skpm` is no longer actively maintained.
- It generates RSS/XML appcast (`.appcast.xml`).
- Sketch 97 introduced JSON update feeds, but continues to support previous appcast format via conversion for compatibility.
