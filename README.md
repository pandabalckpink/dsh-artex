# dsh-artex

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that puts an
[ARTEX](https://github.com/RuoJi6/ARTEX) console in the Web GUI sidebar.

- **Sidebar entry + panel** — one click opens the ARTEX console inside DSH (iframe on the
  ARTEX origin, so its own login/session stay intact).
- **Host half** — probes the ARTEX server, optionally starts and supervises it
  (`managed: true`), and publishes the address the panel embeds at `GET /artex/info`.
- **MCP wiring is not part of this package** — pair it with `@deepseek-ai/dsh-mcp-client`
  pointed at `<baseUrl>/mcp` and the agent gets ARTEX's tools as `mcp__artex__*`.

## Install

Copy the package into a profile and add two Loader entries to the profile's
`cordis.patch.yml`:

```bash
PROFILE="${DSH_HOME:-$HOME/.dsh}/profiles/web"
mkdir -p "$PROFILE/node_modules"
cp -r . "$PROFILE/node_modules/dsh-artex"
```

```yaml
- insert:
    - id: artex
      name: dsh-artex
      config:
        baseUrl: http://127.0.0.1:8787
        managed: false
    - id: mcp-artex
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: artex
        transport: streamable-http
        url: http://127.0.0.1:8787/mcp
        headers:
          Authorization: 'Bearer artex_mcp_...'
```

Restart DSH (or let HMR recompose) and the entry appears in the sidebar.

## Config

| Field | Default | Meaning |
|---|---|---|
| `baseUrl` | `http://127.0.0.1:8787` | ARTEX server the panel embeds |
| `managed` | `false` | start/supervise ARTEX from this plugin |
| `binaryPath` | `/opt/artex/artex` | executable used when `managed` is true |
| `args` | `['-addr', ':8787']` | arguments for the managed executable |
| `cwd` | `/opt/artex` | working directory for the managed executable |
| `logFile` | `''` | append child stdout/stderr here; empty discards |
| `healthPath` | `/api/health` | readiness probe |
| `startupTimeoutMs` | `30000` | how long a managed start may take |

No schema is exported, so the values above are merged over the defaults at apply time —
a profile entry may override any of them.

## How it works

```
sidebar.panellist "ARTEX"  ──►  main panel (iframe)  ──►  http://<artex>/login
GET /artex/info (host route) ──► { url, ok, managed, mcpUrl }
```

- The browser half registers `sidebar.panellist` and the `main` keyed slot through
  `ctx.slots.inject`, so both follow late slot declaration and teardown.
- The panel reads its target from `/artex/info` at mount time; the route is served by the
  host half through `ctx.webServer.register`.
- Embedding is cross-origin but *same-site* when both run on `127.0.0.1`, so ARTEX's
  `SameSite=Lax` session cookie keeps working. Serving DSH and ARTEX from **different
  sites** would break that cookie and loop on `/login`.

## Notes

- ARTEX sets no `X-Frame-Options`, so the iframe is allowed. Do not point this at a server
  that forbids framing.
- The MCP bearer token is a long-lived credential that can create tasks; keep the profile
  file private.
- Requires a DSH build with the client module system (`dsh.client` in `package.json`).

## License

MIT
