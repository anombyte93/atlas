# LLM Providers

## DeepSeek (Cloud)
- Use the official OpenAI-compatible API endpoint.
- Models: deepseek-chat, deepseek-reasoner.
- For production: avoid sending sensitive data; use data minimization and redact logs.

## Usage (conceptual)
- Configure provider base URL + API key via environment variables.
- Prefer deepseek-reasoner for long-form reasoning; use deepseek-chat for tool-calling or general chat.
