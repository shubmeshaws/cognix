{{/*
Expand the name of the chart.
*/}}
{{- define "cognix.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "cognix.fullname" -}}
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

{{- define "cognix.labels" -}}
helm.sh/chart: {{ include "cognix.name" . }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "cognix.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "cognix.selectorLabels" -}}
app.kubernetes.io/name: {{ include "cognix.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "cognix.agent.fullname" -}}
{{- printf "%s-agent" (include "cognix.fullname" .) }}
{{- end }}

{{- define "cognix.web.fullname" -}}
{{- printf "%s-web" (include "cognix.fullname" .) }}
{{- end }}

{{- define "cognix.postgres.fullname" -}}
{{- printf "%s-postgres" (include "cognix.fullname" .) }}
{{- end }}

{{- define "cognix.databaseUrl" -}}
{{- if .Values.postgresql.enabled -}}
postgresql://{{ .Values.postgresql.auth.username }}:{{ .Values.postgresql.auth.password }}@{{ include "cognix.postgres.fullname" . }}:5432/{{ .Values.postgresql.auth.database }}
{{- else -}}
{{ required "Set postgresql.enabled=true or provide external DATABASE_URL via agent.extraEnv" .Values.agent.externalDatabaseUrl }}
{{- end -}}
{{- end }}

{{- define "cognix.nextAuthSecret" -}}
{{- .Values.nextAuthSecret | default .Values.jwtSecret }}
{{- end }}

{{- define "cognix.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "cognix.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
