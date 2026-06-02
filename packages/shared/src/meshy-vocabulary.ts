/**
 * Kubernetes + DevOps vocabulary for Meshy input normalization and topic detection.
 * Keep canonical forms lowercase single-token where possible for LLM prompts.
 */

/** Terms that indicate a Kubernetes / DevOps question (topic gate). */
export const DEVOPS_TOPIC_TERMS = [
  // Core Kubernetes
  "kubernetes", "k8s", "kube", "kubectl", "kubelet", "kubeconfig", "kubeproxy",
  "cluster", "controlplane", "control plane", "apiserver", "api server", "scheduler", "etcd",
  "node", "nodes", "pod", "pods", "container", "containers", "namespace", "namespaces",
  "deployment", "deployments", "statefulset", "statefulsets", "daemonset", "daemonsets",
  "replicaset", "replicasets", "job", "jobs", "cronjob", "cronjobs",
  "service", "services", "endpoint", "endpoints", "ingress", "ingresses",
  "configmap", "configmaps", "secret", "secrets", "volume", "volumes",
  "persistentvolume", "persistentvolumes", "persistentvolumeclaim", "persistentvolumeclaims",
  "storageclass", "storageclasses", "volumeattachment", "volumeattachments",
  "horizontalpodautoscaler", "horizontalpodautoscalers", "verticalpodautoscaler", "verticalpodautoscalers",
  "poddisruptionbudget", "poddisruptionbudgets", "resourcequota", "resourcequotas",
  "limitrange", "limitranges", "networkpolicy", "networkpolicies",
  "serviceaccount", "serviceaccounts", "role", "roles", "clusterrole", "clusterroles",
  "rolebinding", "rolebindings", "clusterrolebinding", "clusterrolebindings",
  "customresourcedefinition", "customresourcedefinitions", "crd", "crds",
  "mutatingwebhook", "mutatingwebhooks", "validatingwebhook", "validatingwebhooks",
  "priorityclass", "priorityclasses", "runtimeclass", "runtimeclasses",
  "csidriver", "csidrivers", "csinode", "csinodes", "lease", "leases", "event", "events",
  "replica", "replicas", "rollout", "rollouts", "workload", "workloads",
  "taint", "taints", "toleration", "tolerations", "affinity", "antiaffinity",
  "selector", "selectors", "label", "labels", "annotation", "annotations", "finalizer", "finalizers",
  "liveness", "readiness", "startup", "probe", "probes", "initcontainer", "initcontainers", "sidecar", "sidecars",
  "nodeport", "nodeports", "clusterip", "clusterips", "loadbalancer", "loadbalancers",
  "headless", "meshy",
  // Autoscaling & Karpenter
  "autoscaler", "autoscalers", "clusterautoscaler", "clusterautoscalers",
  "karpenter", "nodepool", "nodepools", "nodeclaim", "nodeclaims", "nodeclass", "nodeclasses",
  "ec2nodeclass", "ec2nodeclasses", "machinepool", "machinepools", "machine", "machines", "provisioner", "provisioners",
  "scaledobject", "scaledobjects", "scaledjob", "scaledjobs", "keda",
  // Gateway API & networking
  "gateway", "gateways", "gatewayclass", "gatewayclasses", "httproute", "httproutes",
  "grpcroute", "grpcroutes", "referencegrant", "referencegrants", "backendtrafficpolicy",
  "cni", "cilium", "calico", "flannel", "weave", "istio", "linkerd", "consul", "envoy",
  "virtualservice", "virtualservices", "destinationrule", "destinationrules",
  "serviceentry", "serviceentries", "servicemesh", "service mesh", "mtls", "tls", "ssl",
  "dns", "coredns", "externaldns", "certmanager", "cert-manager", "letsencrypt", "acme",
  // GitOps & packaging
  "helm", "helmchart", "helmrelease", "helmlfile", "chart", "charts", "release", "releases",
  "kustomize", "kustomization", "argocd", "argo", "flux", "fluxcd", "gitops",
  "skaffold", "tilt", "werf",
  // Observability
  "prometheus", "grafana", "alertmanager", "thanos", "loki", "jaeger", "tempo", "zipkin",
  "opentelemetry", "otel", "metrics", "metricsserver", "metrics-server", "monitoring", "logging", "tracing",
  "datadog", "newrelic", "splunk", "elastic", "elasticsearch", "kibana", "fluentd", "fluentbit", "filebeat", "logstash",
  "slo", "sli", "sla", "oncall", "incident", "postmortem", "runbook", "alert", "alerts",
  // Containers & runtime
  "docker", "dockerfile", "containerd", "crio", "cri-o", "podman", "nerdctl", "buildkit", "kaniko", "buildah", "image", "images",
  "registry", "registries", "harbor", "ecr", "gcr", "acr", "dockerhub", "artifactory", "nexus",
  "imagepull", "imagepullbackoff", "errimagepull", "pullsecret", "pull policy",
  // IaC & config
  "terraform", "terragrunt", "pulumi", "crossplane", "ansible", "chef", "puppet", "saltstack", "cloudformation",
  "yaml", "json", "hcl", "manifest", "manifests",
  // CI/CD
  "cicd", "ci", "cd", "devops", "sre", "pipeline", "pipelines", "jenkins", "githubactions", "gitlabci",
  "circleci", "travis", "spinnaker", "tekton", "drone", "azuredevops", "build", "deploy",
  // Cloud & distros
  "aws", "eks", "ec2", "elb", "alb", "nlb", "iam", "s3", "rds", "vpc", "cloudwatch",
  "gcp", "gke", "gcs", "azure", "aks", "arm", "openshift", "oc", "rancher", "minikube", "kind", "k3s", "microk8s",
  "digitalocean", "linode", "vultr", "ibm", "iks", "oracle", "oke",
  // Security & policy
  "rbac", "abac", "oauth", "oidc", "jwt", "pki", "vault", "sealedsecret", "sealedsecrets",
  "externalsecret", "externalsecrets", "policy", "policies", "opa", "gatekeeper", "kyverno", "falco", "trivy",
  "security", "vulnerability", "cve", "scan", "audit",
  // Data & middleware (common in cluster questions)
  "redis", "postgres", "postgresql", "mysql", "mariadb", "mongodb", "kafka", "rabbitmq", "nginx", "apache", "traefik", "haproxy",
  // Troubleshooting
  "diagnose", "troubleshoot", "debug", "heal", "restart", "scale", "rollback", "unhealthy", "failing",
  "crashloop", "crashloopbackoff", "oom", "oomkilled", "evicted", "pending", "terminating", "backoff",
  "error", "errors", "latency", "throughput", "cpu", "memory", "disk", "io", "network",
  // Tools
  "k9s", "stern", "kubectx", "kubens", "lens", "octant", "velero", "backup", "restore",
  // Deployment strategies
  "canary", "bluegreen", "blue-green", "rolling", "recreate", "progressive",
];

/** Shorter hint list — triggers normalization before full context. */
export const DEVOPS_HINT_TERMS = [
  "sts", "ds", "svc", "svcs", "dep", "deps", "ing", "cj", "cjs", "cm", "cms",
  "pvc", "pvcs", "pv", "hpa", "hpas", "vpa", "vpas", "pdb", "pdbs", "ns", "crd", "crds",
  "sa", "npc", "nc", "np", "rs", "rc", "po", "no pools", "no claims",
  "nodepools", "nodespools", "nodeclaims", "nodeclasses", "machinepools",
  "karpenter", "eks", "gke", "aks", "helm", "argo", "flux", "istio", "k9s",
  "docker", "terraform", "prometheus", "grafana", "gitops", "cicd", "devops", "sre",
];

function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termsToPattern(terms: string[]): RegExp {
  const parts = terms
    .map((t) => t.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);
  return new RegExp(`\\b(${parts.join("|")})\\b`, "i");
}

export const DEVOPS_TOPIC_PATTERN = termsToPattern(DEVOPS_TOPIC_TERMS);
export const DEVOPS_CONTEXT_PATTERN = termsToPattern([
  ...DEVOPS_TOPIC_TERMS.slice(0, 80),
  ...DEVOPS_HINT_TERMS,
]);
export const DEVOPS_HINT_PATTERN = termsToPattern(DEVOPS_HINT_TERMS);

/** Multi-word phrases → canonical tokens. Order: longer phrases first. */
export const DEVOPS_PHRASE_REPLACEMENTS: ReadonlyArray<
  readonly [RegExp, string, string]
> = [
  // K8s resources
  ["state full sets?", "statefulsets", "state full set → statefulset"],
  ["stateful sets?", "statefulsets", "stateful set → statefulset"],
  ["replica sets?", "replicasets", "replica set → replicaset"],
  ["cron jobs?", "cronjobs", "cron job → cronjob"],
  ["config maps?", "configmaps", "config map → configmap"],
  ["name spaces", "namespaces", "name spaces → namespaces"],
  ["name space", "namespace", "name space → namespace"],
  ["api sever", "api server", "api sever → api server"],
  ["control plain", "control plane", "control plain → control plane"],
  ["pod disruption budgets?", "poddisruptionbudgets", "pod disruption budget"],
  ["storage classes?", "storageclasses", "storage class"],
  ["service accounts?", "serviceaccounts", "service account"],
  ["resource quotas?", "resourcequotas", "resource quota"],
  ["limit ranges?", "limitranges", "limit range"],
  ["network polic(y|ies)", "networkpolicies", "network policy"],
  ["horizontal pod autoscalers?", "horizontalpodautoscalers", "HPA"],
  ["vertical pod autoscalers?", "verticalpodautoscalers", "VPA"],
  ["custom resource definitions?", "customresourcedefinitions", "CRD"],
  ["ingress classes?", "ingressclasses", "ingress class"],
  ["gateway classes?", "gatewayclasses", "gateway class"],
  ["cluster roles?", "clusterroles", "cluster role"],
  ["role bindings?", "rolebindings", "role binding"],
  ["cluster role bindings?", "clusterrolebindings", "clusterrolebinding"],
  ["init containers?", "initcontainers", "init container"],
  ["load balancers?", "loadbalancers", "load balancer"],
  ["node ports?", "nodeports", "nodeport"],
  ["cluster ips?", "clusterips", "clusterip"],
  ["mutating webhooks?", "mutatingwebhooks", "mutating webhook"],
  ["validating webhooks?", "validatingwebhooks", "validating webhook"],
  ["cluster autoscalers?", "clusterautoscalers", "cluster autoscaler"],
  ["persistent volume claims?", "persistentvolumeclaims", "PVC"],
  ["persistent volumes?", "persistentvolumes", "PV"],
  ["http routes?", "httproutes", "HTTPRoute"],
  ["grpc routes?", "grpcroutes", "GRPCRoute"],
  ["service mesh", "servicemesh", "service mesh"],
  ["cert manager", "certmanager", "cert-manager"],
  ["sealed secrets?", "sealedsecrets", "sealed secret"],
  ["external secrets?", "externalsecrets", "external secret"],
  ["pull secrets?", "pullsecrets", "pull secret"],
  ["image pull", "imagepull", "image pull"],
  ["crash loop", "crashloop", "crash loop"],
  ["crash loop back off", "crashloopbackoff", "CrashLoopBackOff"],
  ["oom kill(ed)?", "oomkilled", "OOMKilled"],
  ["image pull back off", "imagepullbackoff", "ImagePullBackOff"],
  ["err image pull", "errimagepull", "ErrImagePull"],
  ["metric(s)? server", "metricsserver", "metrics-server"],
  ["blue green", "bluegreen", "blue-green deploy"],
  ["git ops", "gitops", "gitops"],
  ["ci cd", "cicd", "CI/CD"],
  ["open telemetry", "opentelemetry", "OpenTelemetry"],
  ["helm chart(s)?", "helmchart", "helm chart"],
  ["helm release(s)?", "helmrelease", "helm release"],
  ["argo cd", "argocd", "Argo CD"],
  ["flux cd", "fluxcd", "Flux CD"],
  ["ec2 node classes?", "ec2nodeclasses", "EC2NodeClass"],
  ["machine pools?", "machinepools", "machine pool"],
  ["node pools?", "nodepools", "node pool"],
  ["node claims?", "nodeclaims", "node claim"],
  ["node classes?", "nodeclasses", "node class"],
  ["scaled objects?", "scaledobjects", "ScaledObject"],
  ["scaled jobs?", "scaledjobs", "ScaledJob"],
  ["virtual services?", "virtualservices", "VirtualService"],
  ["destination rules?", "destinationrules", "DestinationRule"],
  ["service entries?", "serviceentries", "ServiceEntry"],
  ["docker file", "dockerfile", "Dockerfile"],
  ["kube config", "kubeconfig", "kubeconfig"],
  ["kube ctl", "kubectl", "kubectl"],
  ["log(s)? tail", "logtail", "log tail"],
  ["roll out", "rollout", "rollout"],
  ["roll back", "rollback", "rollback"],
].map(([pattern, replacement, label]) => [
  new RegExp(`\\b${pattern}\\b`, "gi"),
  replacement,
  label,
] as const);

/** Common misspellings and STT errors. */
export const DEVOPS_SPELLING_REPLACEMENTS: ReadonlyArray<
  readonly [RegExp, string, string]
> = [
  [/\bkubereets\b/gi, "kubernetes", "kubereets → kubernetes"],
  [/\bkuberenets\b/gi, "kubernetes", "kuberenets → kubernetes"],
  [/\bkubernetis\b/gi, "kubernetes", "kubernetis → kubernetes"],
  [/\bkubernets\b/gi, "kubernetes", "kubernets → kubernetes"],
  [/\bkubenetes\b/gi, "kubernetes", "kubenetes → kubernetes"],
  [/\bcubernetes\b/gi, "kubernetes", "cubernetes → kubernetes"],
  [/\bcubectl\b/gi, "kubectl", "cubectl → kubectl"],
  [/\bkubectrl\b/gi, "kubectl", "kubectrl → kubectl"],
  [/\bkubectal\b/gi, "kubectl", "kubectal → kubectl"],
  [/\bhealht\b/gi, "health", "healht → health"],
  [/\bcluser\b/gi, "cluster", "cluser → cluster"],
  [/\bclustre\b/gi, "cluster", "clustre → cluster"],
  [/\bclustor\b/gi, "cluster", "clustor → cluster"],
  [/\bclustar\b/gi, "cluster", "clustar → cluster"],
  [/\bclust\b/gi, "cluster", "clust → cluster"],
  [/\bnodess\b/gi, "nodes", "nodess → nodes"],
  [/\bnods\b/gi, "nodes", "nods → nodes"],
  [/\bpodes\b/gi, "pods", "podes → pods"],
  [/\bpodd\b/gi, "pod", "podd → pod"],
  [/\bemployments\b/gi, "deployments", "employments → deployments"],
  [/\bdeploymets\b/gi, "deployments", "deploymets → deployments"],
  [/\bservises\b/gi, "services", "servises → services"],
  [/\bcarpenter\b/gi, "karpenter", "carpenter → karpenter"],
  [/\bcarpenders?\b/gi, "karpenter", "carpenter → karpenter"],
  [/\bprometheis\b/gi, "prometheus", "prometheis → prometheus"],
  [/\bpromethius\b/gi, "prometheus", "promethius → prometheus"],
  [/\bgrafanna\b/gi, "grafana", "grafanna → grafana"],
  [/\bdockerfile\b/gi, "dockerfile", "dockerfile"],
  [/\bterform\b/gi, "terraform", "terform → terraform"],
  [/\bterrafrom\b/gi, "terraform", "terrafrom → terraform"],
  [/\bingres\b/gi, "ingress", "ingres → ingress"],
  [/\bdeploymnet\b/gi, "deployment", "deploymnet → deployment"],
  [/\bdeployement\b/gi, "deployment", "deployement → deployment"],
  [/\bnamespase\b/gi, "namespace", "namespase → namespace"],
  [/\bnamesapce\b/gi, "namespace", "namesapce → namespace"],
  [/\bconfigmap\b/gi, "configmap", "configmap"],
  [/\bargocd\b/gi, "argocd", "argocd"],
  [/\bgithub actions\b/gi, "githubactions", "GitHub Actions"],
  [/\bgitlab ci\b/gi, "gitlabci", "GitLab CI"],
  [/\bazure devops\b/gi, "azuredevops", "Azure DevOps"],
];

/** Abbreviations → expanded canonical form (applied in k8s/devops context). */
export const DEVOPS_ABBREVIATIONS: ReadonlyArray<
  readonly [RegExp, string, string]
> = [
  [/\bsts\b/gi, "statefulset", "sts → statefulset"],
  [/\bds\b/gi, "daemonset", "ds → daemonset"],
  [/\bsvcs\b/gi, "services", "svcs → services"],
  [/\bsvc\b/gi, "service", "svc → service"],
  [/\bdeps\b/gi, "deployments", "deps → deployments"],
  [/\bdep\b/gi, "deployment", "dep → deployment"],
  [/\bing\b/gi, "ingress", "ing → ingress"],
  [/\bcjs\b/gi, "cronjobs", "cjs → cronjobs"],
  [/\bcj\b/gi, "cronjob", "cj → cronjob"],
  [/\bcms\b/gi, "configmaps", "cms → configmaps"],
  [/\bcm\b/gi, "configmap", "cm → configmap"],
  [/\bpvc\b/gi, "persistentvolumeclaim", "pvc → PVC"],
  [/\bpvcs\b/gi, "persistentvolumeclaims", "pvcs → PVCs"],
  [/\bpv\b/gi, "persistentvolume", "pv → PV"],
  [/\bpvs\b/gi, "persistentvolumes", "pvs → PVs"],
  [/\bhpa\b/gi, "horizontalpodautoscaler", "hpa → HPA"],
  [/\bhpas\b/gi, "horizontalpodautoscalers", "hpas → HPAs"],
  [/\bvpa\b/gi, "verticalpodautoscaler", "vpa → VPA"],
  [/\bvpas\b/gi, "verticalpodautoscalers", "vpas → VPAs"],
  [/\bpdb\b/gi, "poddisruptionbudget", "pdb → PDB"],
  [/\bpdbs\b/gi, "poddisruptionbudgets", "pdbs → PDBs"],
  [/\bns\b/gi, "namespace", "ns → namespace"],
  [/\bk8s\b/gi, "kubernetes", "k8s → kubernetes"],
  [/\bcrd\b/gi, "customresourcedefinition", "crd → CRD"],
  [/\bcrds\b/gi, "customresourcedefinitions", "crds → CRDs"],
  [/\bnpc\b/gi, "networkpolicy", "npc → networkpolicy"],
  [/\bsa\b/gi, "serviceaccount", "sa → serviceaccount"],
  [/\bnc\b/gi, "nodeclaim", "nc → nodeclaim"],
  [/\bnp\b/gi, "nodepool", "np → nodepool"],
  [/\brc\b/gi, "replicationcontroller", "rc → replicationcontroller"],
  [/\bpo\b/gi, "pod", "po → pod"],
  [/\bsc\b/gi, "storageclass", "sc → storageclass"],
  [/\brq\b/gi, "resourcequota", "rq → resourcequota"],
  [/\blr\b/gi, "limitrange", "lr → limitrange"],
  [/\bcrb\b/gi, "clusterrolebinding", "crb → clusterrolebinding"],
  [/\brb\b/gi, "rolebinding", "rb → rolebinding"],
  [/\bmwc\b/gi, "mutatingwebhook", "mwc → mutatingwebhook"],
  [/\bvwc\b/gi, "validatingwebhook", "vwc → validatingwebhook"],
  [/\biac\b/gi, "infrastructureascode", "iac → IaC"],
  [/\bsre\b/gi, "sre", "sre"],
  [/\botel\b/gi, "opentelemetry", "otel → OpenTelemetry"],
  [/\bacm\b/gi, "certmanager", "acm → cert-manager context"],
  [/\blb\b/gi, "loadbalancer", "lb → loadbalancer"],
  [/\bnlb\b/gi, "networkloadbalancer", "nlb → NLB"],
  [/\balb\b/gi, "applicationloadbalancer", "alb → ALB"],
  [/\basg\b/gi, "autoscalinggroup", "asg → ASG"],
  [/\beks\b/gi, "eks", "EKS"],
  [/\bgke\b/gi, "gke", "GKE"],
  [/\baks\b/gi, "aks", "AKS"],
  [/\becr\b/gi, "ecr", "ECR"],
  [/\bacr\b/gi, "acr", "ACR"],
  [/\bgcr\b/gi, "gcr", "GCR"],
];

/** Run-together speech tokens (no spaces). */
export const DEVOPS_RUN_TOGETHER_REPLACEMENTS: ReadonlyArray<
  readonly [RegExp, string, string]
> = [
  [/\bnodespools?\b/gi, "nodepools", "nodespool → nodepool"],
  [/\bnodesclaims?\b/gi, "nodeclaims", "nodesclaim → nodeclaim"],
  [/\bnodeclaims?\b/gi, "nodeclaims", "nodeclaim"],
  [/\bnodeclasses?\b/gi, "nodeclasses", "nodeclass"],
  [/\bmachinepools?\b/gi, "machinepools", "machinepool"],
  [/\bservicemesh\b/gi, "servicemesh", "servicemesh"],
  [/\bhelmcharts?\b/gi, "helmchart", "helmchart"],
  [/\bconfigmaps?\b/gi, "configmaps", "configmap"],
  [/\bstatefulsets?\b/gi, "statefulsets", "statefulset"],
  [/\bdaemonsets?\b/gi, "daemonsets", "daemonset"],
  [/\breplicasets?\b/gi, "replicasets", "replicaset"],
  [/\bcronjobs?\b/gi, "cronjobs", "cronjob"],
  [/\bexternalsecrets?\b/gi, "externalsecrets", "externalsecret"],
  [/\bsealedsecrets?\b/gi, "sealedsecrets", "sealedsecret"],
  [/\bscaledobjects?\b/gi, "scaledobjects", "scaledobject"],
  [/\bscaledjobs?\b/gi, "scaledjobs", "scaledjob"],
  [/\bvirtualservices?\b/gi, "virtualservices", "virtualservice"],
  [/\bdestinationrules?\b/gi, "destinationrules", "destinationrule"],
  [/\bec2nodeclasses?\b/gi, "ec2nodeclasses", "ec2nodeclass"],
  [/\bhttproutes?\b/gi, "httproutes", "httproute"],
  [/\bgrpcroutes?\b/gi, "grpcroutes", "grpcroute"],
  [/\bgithubactions\b/gi, "githubactions", "GitHub Actions"],
  [/\bgitlabci\b/gi, "gitlabci", "GitLab CI"],
  [/\bazuredevops\b/gi, "azuredevops", "Azure DevOps"],
  [/\bmetricsserver\b/gi, "metricsserver", "metrics-server"],
  [/\bcrashloopbackoff\b/gi, "crashloopbackoff", "CrashLoopBackOff"],
  [/\bimagepullbackoff\b/gi, "imagepullbackoff", "ImagePullBackOff"],
];
