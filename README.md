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
