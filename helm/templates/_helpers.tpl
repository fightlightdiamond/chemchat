{{/*
Expand the name of the chart.
*/}}
{{- define "chemchat.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "chemchat.fullname" -}}
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

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "chemchat.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "chemchat.labels" -}}
helm.sh/chart: {{ include "chemchat.chart" . }}
{{ include "chemchat.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "chemchat.selectorLabels" -}}
app.kubernetes.io/name: {{ include "chemchat.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "chemchat.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "chemchat.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the secret to use
*/}}
{{- define "chemchat.secretName" -}}
{{- if .Values.secrets.create }}
{{- printf "%s-secrets" (include "chemchat.fullname" .) }}
{{- else }}
{{- .Values.secrets.name }}
{{- end }}
{{- end }}

{{/*
Create the Docker image reference
*/}}
{{- define "chemchat.image" -}}
{{- if .Values.global.imageRegistry }}
{{- printf "%s/%s:%s" .Values.global.imageRegistry .Values.image.repository (.Values.image.tag | default .Chart.AppVersion) }}
{{- else }}
{{- printf "%s/%s:%s" .Values.image.registry .Values.image.repository (.Values.image.tag | default .Chart.AppVersion) }}
{{- end }}
{{- end }}

{{/*
PostgreSQL host
*/}}
{{- define "chemchat.postgresql.host" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "%s-postgresql" .Release.Name }}
{{- else }}
{{- .Values.externalServices.postgresql.host }}
{{- end }}
{{- end }}

{{/*
PostgreSQL port
*/}}
{{- define "chemchat.postgresql.port" -}}
{{- if .Values.postgresql.enabled }}
{{- 5432 }}
{{- else }}
{{- .Values.externalServices.postgresql.port }}
{{- end }}
{{- end }}

{{/*
PostgreSQL database
*/}}
{{- define "chemchat.postgresql.database" -}}
{{- if .Values.postgresql.enabled }}
{{- .Values.postgresql.auth.database }}
{{- else }}
{{- .Values.externalServices.postgresql.database }}
{{- end }}
{{- end }}

{{/*
PostgreSQL username
*/}}
{{- define "chemchat.postgresql.username" -}}
{{- if .Values.postgresql.enabled }}
{{- .Values.postgresql.auth.username }}
{{- else }}
{{- .Values.externalServices.postgresql.username }}
{{- end }}
{{- end }}

{{/*
Redis host
*/}}
{{- define "chemchat.redis.host" -}}
{{- if .Values.redis.enabled }}
{{- printf "%s-redis-master" .Release.Name }}
{{- else }}
{{- .Values.externalServices.redis.host }}
{{- end }}
{{- end }}

{{/*
Redis port
*/}}
{{- define "chemchat.redis.port" -}}
{{- if .Values.redis.enabled }}
{{- 6379 }}
{{- else }}
{{- .Values.externalServices.redis.port }}
{{- end }}
{{- end }}

{{/*
Elasticsearch host
*/}}
{{- define "chemchat.elasticsearch.host" -}}
{{- if .Values.elasticsearch.enabled }}
{{- printf "%s-elasticsearch" .Release.Name }}
{{- else }}
{{- .Values.externalServices.elasticsearch.host }}
{{- end }}
{{- end }}

{{/*
Elasticsearch port
*/}}
{{- define "chemchat.elasticsearch.port" -}}
{{- if .Values.elasticsearch.enabled }}
{{- 9200 }}
{{- else }}
{{- .Values.externalServices.elasticsearch.port }}
{{- end }}
{{- end }}

{{/*
Kafka host
*/}}
{{- define "chemchat.kafka.host" -}}
{{- if .Values.kafka.enabled }}
{{- printf "%s-kafka" .Release.Name }}
{{- else }}
{{- index .Values.externalServices.kafka.brokers 0 | splitList ":" | first }}
{{- end }}
{{- end }}

{{/*
Kafka port
*/}}
{{- define "chemchat.kafka.port" -}}
{{- if .Values.kafka.enabled }}
{{- 9092 }}
{{- else }}
{{- index .Values.externalServices.kafka.brokers 0 | splitList ":" | last }}
{{- end }}
{{- end }}

{{/*
Environment variables
*/}}
{{- define "chemchat.env" -}}
- name: DATABASE_URL
  value: "postgresql://{{ include "chemchat.postgresql.username" . }}:$(POSTGRES_PASSWORD)@{{ include "chemchat.postgresql.host" . }}:{{ include "chemchat.postgresql.port" . }}/{{ include "chemchat.postgresql.database" . }}?schema=public"
- name: REDIS_HOST
  value: {{ include "chemchat.redis.host" . | quote }}
- name: REDIS_PORT
  value: {{ include "chemchat.redis.port" . | quote }}
- name: REDIS_DB
  value: {{ .Values.externalServices.redis.database | quote }}
- name: ELASTICSEARCH_NODE
  value: "{{ .Values.externalServices.elasticsearch.protocol }}://{{ include "chemchat.elasticsearch.host" . }}:{{ include "chemchat.elasticsearch.port" . }}"
{{- if .Values.kafka.enabled }}
- name: KAFKA_BROKERS
  value: "{{ include "chemchat.kafka.host" . }}:{{ include "chemchat.kafka.port" . }}"
{{- else }}
- name: KAFKA_BROKERS
  value: {{ join "," .Values.externalServices.kafka.brokers | quote }}
{{- end }}
- name: KAFKA_CLIENT_ID
  value: {{ .Values.externalServices.kafka.clientId | quote }}
- name: KAFKA_GROUP_ID
  value: {{ .Values.externalServices.kafka.groupId | quote }}
{{- end }}
