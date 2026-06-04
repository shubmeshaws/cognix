# Hosting Cognix on Ubuntu (install → Nginx → SSL)

End-to-end guide from a fresh **Ubuntu 24.04+** server to a public HTTPS deployment. The bootstrap script installs dependencies and infrastructure; you start the app with **systemd** or **PM2** and put **Nginx** in front with **Let's Encrypt** SSL.

---

## Architecture

```text
Internet
    │
    ▼
 Nginx :443 (SSL)
    ├── app.yourdomain.com  ──► 127.0.0.1:3000  (Next.js web)
    └── api.yourdomain.com  ──► 127.0.0.1:3001  (Agent API + WebSockets)

Docker (same host):
    postgres :5433, redis :6379, ollama :11434
```

| Component | Port (localhost) | Public URL |
|-----------|------------------|------------|
| Web UI | 3000 | `https://app.yourdomain.com` |
| Agent API | 3001 | `https://api.yourdomain.com` |
| Postgres | 5433 | Not exposed |
| Redis | 6379 | Not exposed |
| Ollama | 11434 | Not exposed (optional) |

---

## Phase 1 — Bootstrap (one script)

On the server as a normal user (e.g. `ubuntu`):

```bash
git clone https://github.com/shubmeshaws/cognix.git cognix
cd cognix
chmod +x scripts/setup-ubuntu.sh

# Production path: infra + deps + DB schema + build + deploy configs (no app auto-start)
./scripts/setup-ubuntu.sh --mode production -y \
  --domain app.yourdomain.com \
  --api-domain api.yourdomain.com

# Optional: create admin at end of setup
#   --create-admin --admin-email you@example.com --admin-name "Your Name"

# Optional: install nginx package only (config still manual)
#   --with-nginx
```

**Dev / lab** (same infra, no production build):

```bash
./scripts/setup-ubuntu.sh -y
```

At the end the script prints **full env file contents** and saves them to `SETUP_COPY_PASTE.txt`. It also writes ready-to-edit files under `.kubehealer/deploy/` (Nginx, systemd, PM2).

---

## Phase 2 — DNS (before SSL)

Create **A records** pointing to your server’s public IP:

| Name | Type | Value |
|------|------|--------|
| `app` | A | `<server-ip>` |
| `api` | A | `<server-ip>` |

Wait for DNS to propagate (`dig app.yourdomain.com`).

**Firewall (UFW example):**

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## Phase 3 — Review and adjust env files

Files (created by the script):

| File | Purpose |
|------|---------|
| `apps/agent/.env` | Database, JWT, Ollama, `AGENT_HOST=127.0.0.1` |
| `apps/web/.env` | `NEXT_PUBLIC_API_URL`, `NEXTAUTH_*`, auth flags |

**Production checklist** (when using a real domain):

| Variable | Suggested value |
|----------|-----------------|
| `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com` |
| `NEXT_PUBLIC_APP_URL` | `https://app.yourdomain.com` |
| `NEXTAUTH_URL` | `https://app.yourdomain.com` |
| `NEXTAUTH_SECRET` | Random 32+ chars (script may generate) |
| `JWT_SECRET` | Same value in **both** agent and web `.env` |
| `NEXT_PUBLIC_AUTH_DISABLED` | `false` or remove line (enable login) |
| `AGENT_HOST` | `127.0.0.1` (only Nginx is public) |

Re-copy from `SETUP_COPY_PASTE.txt` after any edits.

---

## Phase 4 — Build (if you used `dev` mode earlier)

```bash
cd ~/cognix
pnpm build
```

`--mode production` runs this automatically.

---

## Phase 5 — Start the application

Choose **one** of systemd or PM2. Both bind to **localhost**; Nginx handles HTTPS.

### Option A — systemd (recommended on Ubuntu)

Generated units: `.kubehealer/deploy/cognix-agent.service`, `.kubehealer/deploy/cognix-web.service`

```bash
cd ~/cognix

# Install units (paths already substituted)
sudo cp .kubehealer/deploy/cognix-agent.service /etc/systemd/system/
sudo cp .kubehealer/deploy/cognix-web.service /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable cognix-agent cognix-web
sudo systemctl start cognix-agent cognix-web

sudo systemctl status cognix-agent cognix-web
journalctl -u cognix-agent -f
journalctl -u cognix-web -f
```

### Option B — PM2

```bash
cd ~/cognix
sudo npm install -g pm2   # if not installed

pm2 start .kubehealer/deploy/ecosystem.config.cjs
pm2 status
pm2 logs

pm2 save
pm2 startup   # run the command it prints, then pm2 save again
```

### Verify locally (before Nginx)

```bash
curl -s http://127.0.0.1:3001/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

---

## Phase 6 — Nginx

Install (if not done with `--with-nginx`):

```bash
sudo apt install -y nginx
```

Generated config: `.kubehealer/deploy/nginx/cognix.conf`

```bash
cd ~/cognix
sudo cp .kubehealer/deploy/nginx/cognix.conf /etc/nginx/sites-available/cognix
sudo ln -sf /etc/nginx/sites-available/cognix /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # optional

# WebSocket map — add inside http { } in /etc/nginx/nginx.conf if missing:
#   map $http_upgrade $connection_upgrade {
#       default upgrade;
#       ''      close;
#   }

sudo nginx -t
sudo systemctl reload nginx
```

Test HTTP:

- `http://app.yourdomain.com`
- `http://api.yourdomain.com/health`

---

## Phase 7 — SSL (Let's Encrypt)

**Suggestions:**

- Use **Certbot** with the Nginx plugin after HTTP works.
- One certificate can cover both hostnames.
- Renewals are automatic via `certbot.timer`.
- For production, set **HSTS** only after you confirm HTTPS works everywhere.

```bash
sudo apt install -y certbot python3-certbot-nginx

sudo certbot --nginx \
  -d app.yourdomain.com \
  -d api.yourdomain.com \
  --email you@example.com \
  --agree-tos \
  --redirect

sudo certbot renew --dry-run
```

Certbot updates Nginx for `listen 443 ssl` and HTTP→HTTPS redirect.

**OAuth / SSO:** In Google/GitHub/LinkedIn consoles, set redirect URLs to `https://app.yourdomain.com/...` (see provider docs).

---

## Phase 8 — Create admin (if not done in setup)

```bash
cd ~/cognix
pnpm --filter @kubehealer/agent create-admin -- \
  --email admin@example.com \
  --name "Admin User"
```

Open `https://app.yourdomain.com` and sign in.

---

## Optional — Docker-only stack

If you prefer everything in containers (no PM2/systemd for app code):

```bash
./scripts/setup-ubuntu.sh --mode docker -y
```

Tune `.env` and `.env.web` from `SETUP_COPY_PASTE.txt`. Put Nginx in front of published ports `3000` / `3001` the same way.

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| 502 Bad Gateway | `systemctl status cognix-web cognix-agent`; local curls on 3000/3001 |
| WebSocket fails | Nginx `Upgrade` / `Connection` headers; `proxy_read_timeout` |
| Login redirect loop | `NEXTAUTH_URL` matches public URL; `JWT_SECRET` matches agent |
| API CORS / wrong host | `NEXT_PUBLIC_API_URL` = `https://api.yourdomain.com` |
| DB connection | `docker compose ps postgres`; `DATABASE_URL` port `5433` |
| SSL fails | DNS A records; port 80 open; `sudo nginx -t` |

---

## File reference

| Path | Description |
|------|-------------|
| `scripts/setup-ubuntu.sh` | Bootstrap script |
| `docs/HOSTING.md` | This guide |
| `deploy/templates/` | Source templates (placeholders) |
| `.kubehealer/deploy/` | Generated configs (after setup) |
| `SETUP_COPY_PASTE.txt` | Env dump at end of setup (gitignored) |
