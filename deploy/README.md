# Deploy templates

Static templates live under `templates/`. After running `scripts/setup-ubuntu.sh`, generated files with your paths and domains are written to **`.kubehealer/deploy/`** (gitignored).

| Generated file | Purpose |
|----------------|---------|
| `nginx/cognix.conf` | Reverse proxy for web + API |
| `systemd/cognix-*.service` | systemd units |
| `ecosystem.config.cjs` | PM2 process file |

Full steps (DNS, SSL, env): **[docs/HOSTING.md](../docs/HOSTING.md)**
