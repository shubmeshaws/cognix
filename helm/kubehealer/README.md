# KubeHealer Helm chart

Install KubeHealer on Kubernetes.

Full guide: [docs/SETUP.md](../../docs/SETUP.md#3-setup-on-kubernetes-helm)

## Quick install

```bash
# 1. Build & push images (from repo root)
docker build -t YOUR_REGISTRY/kubehealer-agent:latest -f apps/agent/Dockerfile .
docker build -t YOUR_REGISTRY/kubehealer-web:latest -f apps/web/Dockerfile .
docker push YOUR_REGISTRY/kubehealer-agent:latest
docker push YOUR_REGISTRY/kubehealer-web:latest

# 2. Customize values
cp values.yaml my-values.yaml
# Edit jwtSecret, image repos, ingress hosts, web.env.nextPublicApiUrl

# 3. Install
helm upgrade --install kubehealer . \
  -f my-values.yaml \
  -n kubehealer --create-namespace
```

## Required values

| Value | Description |
|-------|-------------|
| `jwtSecret` | Min 32 chars; shared by agent and web |
| `agent.image.repository` | Agent container image |
| `web.image.repository` | Web container image |
| `web.env.nextPublicApiUrl` | Public URL of agent API (browser-facing) |
| `web.env.nextAuthUrl` | Public URL of web UI |

## After install

1. Open the web ingress URL.
2. **Settings → Agent** — configure LLM → **Apply**.
3. **Clusters** — connect your Kubernetes cluster.
4. **Setup** — verify health checks.

## Values reference

See [values.yaml](./values.yaml) for all options including PostgreSQL, ingress, persistence, and RBAC.
