{{/*
Expand the name of the chart.
*/}}
{{- define "kubehealer.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "kubehealer.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "kubehealer.labels" -}}
helm.sh/chart: {{ include "kubehealer.name" . }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "kubehealer.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "kubehealer.selectorLabels" -}}
app.kubernetes.io/name: {{ include "kubehealer.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "kubehealer.agent.fullname" -}}
{{- printf "%s-agent" (include "kubehealer.fullname" .) }}
{{- end }}

{{- define "kubehealer.web.fullname" -}}
{{- printf "%s-web" (include "kubehealer.fullname" .) }}
{{- end }}

{{- define "kubehealer.postgres.fullname" -}}
{{- printf "%s-postgres" (include "kubehealer.fullname" .) }}
{{- end }}

{{- define "kubehealer.databaseUrl" -}}
{{- if .Values.postgresql.enabled -}}
postgresql://{{ .Values.postgresql.auth.username }}:{{ .Values.postgresql.auth.password }}@{{ include "kubehealer.postgres.fullname" . }}:5432/{{ .Values.postgresql.auth.database }}
{{- else -}}
{{ required "Set postgresql.enabled=true or provide external DATABASE_URL via agent.extraEnv" .Values.agent.externalDatabaseUrl }}
{{- end -}}
{{- end }}

{{- define "kubehealer.nextAuthSecret" -}}
{{- .Values.nextAuthSecret | default .Values.jwtSecret }}
{{- end }}

{{- define "kubehealer.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "kubehealer.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
