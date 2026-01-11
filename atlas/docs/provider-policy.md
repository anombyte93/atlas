# Cloud Provider Policy

## Data Minimization
- Do not send secrets, tokens, or personal data to cloud providers.
- Redact file paths, hostnames, and IPs unless required.
 - Review regulatory and data residency requirements before enabling cloud providers.

## Logging
- Log only model ID, token counts, and latency by default.
- Store prompts/responses only when explicitly enabled.

## Allowed Providers
- DeepSeek (official OpenAI-compatible endpoint)
- Others must be explicitly approved

## Opt-Out
- Set an environment flag to disable all cloud calls.
