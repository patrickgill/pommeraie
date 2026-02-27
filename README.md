# Pommeraie

A web-based Apple product database browser. Serves data from Mactracker plist files through a Go backend with a vanilla HTML/CSS/JS frontend.

## Requirements

- Go 1.25+
- A `CoreCollection.plist` or `CoreCollection.data` file (from Mactracker)

## Quick Start

```sh
go build -o pommeraie
./pommeraie
```

Open http://localhost:8080. If no data file is found, you'll be redirected to the upload page.

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-plist` | auto-detect | Path to plist file |
| `-key` | `data/key` | Path to AES-128 decryption key file |
| `-port` | `8080` | Listen port |

### Data Files

Place files in the `data/` directory:

- `data/CoreCollection.plist` — plaintext XML plist (tried first)
- `data/CoreCollection.data` — encrypted plist (tried second)
- `data/key` — hex-encoded AES-128 key (required only for encrypted files)

Files can also be uploaded via the web UI at `/upload`.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/categories` | List all product categories with item counts |
| `GET` | `/api/categories/{name}` | List items in a category |
| `GET` | `/api/items/{uuid}` | Full detail for a single item |
| `GET` | `/api/search?q=...` | Search products by name or model number |
| `GET` | `/api/lookup?q=...` | Look up by order number, family number, or machine ID |
| `GET` | `/api/filter?field=...&op=...&value=...` | Filter items by field value |
| `GET` | `/api/multicategory?names=...` | Merge items from multiple categories |
| `GET` | `/api/sideboard` | Sidebar navigation config |
| `GET` | `/api/status` | Server status (data loaded, file presence) |
| `POST` | `/api/upload` | Upload a plist/data file |
| `POST` | `/api/reload` | Reload data from disk |
| `POST` | `/api/validate-key` | Test if a key decrypts the data file |
| `GET` | `/key` | Read the current key file |
| `POST` | `/key` | Write a new key file |

### Filter Operators

The `/api/filter` endpoint supports: `eq`, `contains`, `prefix`, `regex`, `gt`, `lt`.

## Sidebar Config

`sideboard.json` defines the sidebar navigation. Entry types:

- `group` — section header
- `category` — single plist category
- `category` with `categories` array — merged multi-category view
- `filter` — dynamic filter with `field`, `op`, `value`

Changes to `sideboard.json` take effect immediately (read on each request).

## Frontend

- Vanilla JS single-page app with hash-based routing
- Dark/light theme (persists in localStorage, defaults to system preference)
- Favourites via localStorage (star icon on cards and detail view)
- Keyboard shortcuts: `/` to focus search, `Escape` to clear
- Print styling

## Project Structure

```
main.go          Server, routing, plist loading
sideboard.go     Sidebar config, filter/lookup handlers
decrypt.go       AES-128-CBC decryption
sideboard.json   Sidebar navigation config
static/
  index.html     Main app shell
  app.js         Frontend SPA logic
  style.css      Styles
  upload.html    Data file upload page
  upload.js      Upload page logic
```

## Disclaimer

This project is an independent tool for personal use only. It is not affiliated with, endorsed by, or associated with Apple Inc. or Mactracker. All Apple product names, logos, and trademarks are property of Apple Inc. "Mactracker" is a trademark of Ian Page.

This software does not distribute or include any proprietary data. Users are responsible for ensuring their use of any data files complies with applicable licenses and terms of use.

This software is provided "as is", without warranty of any kind, express or implied. In no event shall the authors be liable for any claim, damages, or other liability arising from the use of this software.
