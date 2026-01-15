# Molly Food Scanner

AI-powered food scanner that answers: "Is this food bad for me?"

## Quickstart

```bash
npm install
npm run dev
```

Create a `.env.local` with the AI backend URL:

```bash
MCP_CLI_URL=http://localhost:8080
```

## API

- `POST /api/analyze` → forwards to `${MCP_CLI_URL}/analyze`
- `POST /api/chat` → forwards to `${MCP_CLI_URL}/chat`

## Notes

- UI is wired for image and chat flows.
- Replace placeholder responses with live backend calls as you integrate mcp-cli.
