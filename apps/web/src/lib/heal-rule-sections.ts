/** Upcoming addon heal rules — UI placeholders until agent support lands. */
export interface HealRulePlaceholder {
  id: string;
  label: string;
  description: string;
}

export const ADDON_HEAL_RULE_PLACEHOLDERS: HealRulePlaceholder[] = [
  {
    id: "addon-deployment-unhealthy",
    label: "Addon deployment unhealthy",
    description:
      "Core add-on Deployments not ready (ingress, metrics-server, DNS).",
  },
  {
    id: "cert-manager-not-ready",
    label: "Certificate not ready",
    description: "cert-manager Certificate or Challenge stuck pending.",
  },
  {
    id: "helm-release-failed",
    label: "Helm release failed",
    description: "Helm release in failed or pending-upgrade state.",
  },
  {
    id: "operator-reconcile-error",
    label: "Operator reconcile errors",
    description: "Custom operator pods crash-looping or reporting reconcile failures.",
  },
];
