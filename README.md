<p align="center">
  <img src="https://img.shields.io/github/v/release/superwyq/Image-Organizer?style=flat-square" alt="Version">
  <img src="https://img.shields.io/github/downloads/superwyq/Image-Organizer/total?style=flat-square" alt="Downloads">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/Obsidian-%5E1.0.0-purple?style=flat-square" alt="Obsidian">
</p>

<h1 align="center">Image Organizer</h1>

<p align="center"><strong>Organize images in Obsidian with categories, keywords, and metadata — insert images with customizable HTML+CSS formatting.</strong></p>

---

> **Language**: English | [简体中文](README_zh.md)

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Settings](#settings)
- [Commands](#commands)
- [Sidebar Manager](#sidebar-manager)
- [Image Insertion with Formatting](#image-insertion-with-formatting)
- [Metadata Format](#metadata-format)
- [Development](#development)
- [Privacy](#privacy)
- [License](#license)

---

## Features

- **Multi-category management** — Each category has its own image folder and JSON metadata file.
- **Auto-capture new images** — Detects new images dropped into the vault and guides you through category selection and metadata entry.
- **Auto-move images** — Moves images to their category folder on save, with configurable name-conflict handling.
- **JSON database** — Keys metadata by vault-relative path: `fileName`, `description`, `keywords`, `dateAdded`, `lastModified`, and custom fields.
- **Database index** — Maintains a global index (`_images/image_metadata_index.json`) with category lists, image counts, and keyword lists.
- **Sidebar manager view** — Browse by category, search by filename/description/keywords, edit records, delete images, and move between categories.
- **Batch operations** — Select multiple images for batch move or batch delete.
- **Bulk indexing** — Right-click a folder to index existing images in bulk, with batch keyword/description/name editing.
- **HTML image insertion** — Insert images via a formatting dialog with alignment, sizing, borders, margins, and live preview.
- **Edit inserted images** — Modify the format of previously inserted HTML images via command palette.
- **Command palette integration** — Add metadata, process images in current note, move categories, scan consistency, copy metadata, scan unclassified images.
- **Consistency maintenance** — Tracks image rename, move, and delete events to keep metadata in sync.
- **Export** — Copy all or per-category metadata as Markdown tables or JSON.

## Screenshots

### Sidebar Manager

![Sidebar Manager](docs/侧边栏界面示意图.png)

### Image Insert Format Dialog

![Insert Format Dialog](docs/修改图片插入格式截图.png)

## Installation

1. Open Obsidian **Settings → Community plugins**.
2. Disable **Safe mode** if enabled.
3. Click **Browse** and search for **Image Organizer**.
4. Install and enable the plugin.

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [release](https://github.com/superwyq/Image-Organizer/releases).
2. Copy them to `<vault>/.obsidian/plugins/Image-Organizer/`.
3. Reload Obsidian and enable the plugin.

## Quick Start

1. After enabling, open **Settings → Image Organizer**.
2. Review the default category, or add new ones, e.g.:
   - Category name: `Landscape`
   - Image folder: `Photos/Landscape`
   - Metadata JSON: auto-set to `Photos/Landscape/image_metadata.json`
3. Drop or paste images into your vault — a dialog will appear to choose a category and fill in metadata.
4. After saving, the image is moved to the category folder and metadata is written to JSON.

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Watched image extensions** | Comma-separated list | `png, jpg, jpeg, gif, svg, webp, bmp` |
| **Force category selection on add** | Always prompt for category when adding | Off |
| **Name-conflict strategy** | When moving images with duplicate names | Append number suffix |
| **Clean up empty directories** | Delete empty source folders after move | On |
| **Custom metadata fields** | Extra fields per image, comma-separated | — |
| **Categories** | Add / edit / delete sub-categories with custom image folders and metadata paths | Default category is protected |

## Commands

| Command | Description |
|---------|-------------|
| **Open image manager** | Open the sidebar manager view |
| **Add image metadata** | Manually select an image and enter metadata |
| **Add metadata for images in current note** | Extract image links from the current note / selection and process |
| **Edit current image metadata** | Edit metadata when the active file is an image |
| **Move image to other category** | Select an image and migrate to another category |
| **Rescan all categories consistency** | Check category folders and JSON — clean up stale records |
| **Copy metadata as text** | Choose scope and format (Markdown table / JSON) to copy to clipboard |
| **Scan unclassified images** | Find images not yet managed by any category |
| **Format inserted image** | Select or place cursor inside a previously inserted HTML image block and adjust its formatting |

## Sidebar Manager

Click the ribbon icon or run **Open image manager** from the command palette.

- **Category filter** — Select a single category or view all.
- **Search** — Search by filename or description.
- **Keyword search** — Search by keyword with auto-suggest and `Tab` completion.
- **Card view** — Each card shows thumbnail, filename, category, path, description, and colored keyword tags.
- **Per-card actions** — Edit, Insert (with formatting), Move, Delete (with confirmation).
- **Batch operations** — Select all current results, clear selection, batch move, batch delete.
- **Right-click menu** — Quick access to edit, move, and delete.

## Image Insertion with Formatting

Click the **Insert** button on any image card to open the formatting dialog:

- **Alignment** — Left / Center / Right
- **Width / Height** — CSS units (px, %, rem, etc.)
- **Keep aspect ratio** — Toggle on/off
- **Margin / Padding** — CSS margin and padding
- **Border** — Style (solid, dashed, dotted), width, color
- **Alt text** — Custom alternative text
- **Live preview** — See changes in real time
- **HTML output** — Shows the generated `div > img` with inline CSS

The generated HTML is inserted at the last active Markdown cursor position:

```html
<div style="text-align: center;"><img src="app://local/..." alt="sunset" style="max-width: 100%; width: 320px; height: auto; margin: 8px 0; padding: 0;"></div>
```

To modify an already inserted image, place your cursor within the HTML block or select the block, then run **Format inserted image** from the command palette.

## Metadata Format

Each category stores data in a JSON file:

```json
{
  "Photos/Landscape/sunset.jpg": {
    "fileName": "Sunset Over the Ocean",
    "description": "A beautiful sunset captured at the beach.",
    "keywords": ["sunset", "ocean", "photography"],
    "dateAdded": "2026-06-12T10:30:00.000Z",
    "lastModified": "2026-06-12T10:30:00.000Z",
    "customFields": {
      "source": "Camera import"
    }
  }
}
```

Before writing, the plugin creates a `.bak` backup of the JSON file.

## Development

```bash
# Install dependencies
npm install

# Dev mode (watch)
npm run dev

# Production build
npm run build

# Lint
npm run lint
```

Build artifacts are placed at the project root: `main.js`.

### Release artifacts

- `main.js`
- `manifest.json`
- `styles.css`

## Privacy

This plugin operates entirely offline. It does **not** make network requests, collect telemetry, or upload any vault contents.

## License

[MIT](LICENSE)
