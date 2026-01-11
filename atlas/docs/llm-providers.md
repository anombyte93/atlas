# LLM Providers

## DeepSeek (Cloud)
- Use the official OpenAI-compatible API endpoint.
- Base URL: `https://api.deepseek.com` (or `https://api.deepseek.com/v1` for compatibility).
- Models: `deepseek-chat` (non-thinking) and `deepseek-reasoner` (thinking).
- For production: avoid sending sensitive data; use data minimization and redact logs.

## Usage (conceptual)
- Configure provider base URL + API key via environment variables.
- Prefer deepseek-reasoner for long-form reasoning; use deepseek-chat for tool-calling or general chat.
