# @spec-ade/open-design

Local-first design product: detects your installed code-agent CLI, runs design skills + design systems, streams artifacts into a sandboxed preview.

## Quick start

```bash
npx -y @spec-ade/open-design
```

The daemon starts and prints the URL. Open it in your browser.

## Usage

```bash
# Start daemon (no browser auto-open)
open-design

# Start and open browser
open-design --open

# Custom port
open-design --port 8080

# Custom host binding
open-design --host 0.0.0.0 --port 8080
```

## Requirements

- Node.js >= 20
- A code-agent CLI on your PATH (claude, codex, gemini, etc.)

## Data location

Runtime data (SQLite database, projects, artifacts) is stored at:

| Platform | Location |
|----------|----------|
| Windows | `%LOCALAPPDATA%\open-design` |
| macOS | `~/.open-design` |
| Linux | `$XDG_DATA_HOME/open-design` or `~/.local/share/open-design` |

Override with `OD_DATA_DIR` environment variable.

## Environment variables

| Variable | Description |
|----------|-------------|
| `OD_PORT` | Port to listen on (default: 7456) |
| `OD_BIND_HOST` | Interface to bind (default: 127.0.0.1) |
| `OD_DATA_DIR` | Override data directory location |
| `OD_API_TOKEN` | Enable bearer token auth for non-loopback access |

## License

Apache-2.0
