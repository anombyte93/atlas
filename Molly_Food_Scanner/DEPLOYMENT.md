# Molly Food Scanner - Deployment Guide

## Prerequisites

- **Node.js**: 18+ (LTS recommended)
- **npm**: 9+ or compatible package manager
- **API Key**: Deepseek API key (free tier available)
- **Optional**: OpenAI API key for fallback

---

## Installation

### 1. Clone and Install Dependencies

```bash
cd /path/to/Molly_Food_Scanner
npm install
```

### 2. Configure Environment Variables

Create `.env.local` in the project root:

```bash
# Required: Deepseek API Configuration
DEEPSEEK_API_KEY=sk-your_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# Provider Selection
MFS_AI_PROVIDER=deepseek
MFS_AI_FALLBACK=openai

# Optional: OpenAI Fallback
OPENAI_API_KEY=sk-your_openai_key_here
OPENAI_BASE_URL=https://api.openai.com
OPENAI_MODEL=gpt-4o
```

### 3. Verify Configuration

```bash
# Check environment variables are set
cat .env.local

# Verify Node.js version
node --version  # Should be 18+
```

---

## Running the Application

### Development Mode

```bash
npm run dev
```

Server runs at: **http://localhost:3000** (or port shown in terminal)

### Production Build

```bash
npm run build
npm start
```

---

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DEEPSEEK_API_KEY` | Deepseek API key | `sk-abc123...` |
| `DEEPSEEK_BASE_URL` | Deepseek API endpoint | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | Model name | `deepseek-chat` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MFS_AI_PROVIDER` | Primary AI provider | `deepseek` |
| `MFS_AI_FALLBACK` | Fallback provider | `openai` |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `OPENAI_BASE_URL` | OpenAI endpoint | `https://api.openai.com` |
| `OPENAI_MODEL` | OpenAI model | `gpt-4o` |

---

## API Endpoints

### POST /api/analyze
Analyze food from image or barcode.

**Request:**
```json
{
  "image_url": "/uploads/uuid-filename.jpg",
  "barcode_text": "0123456789012"
}
```

**Response:**
```json
{
  "name": "Organic Apples",
  "rating": 85,
  "summary": "Good choice with minimal additives",
  "chemicals": [
    {
      "name": "Ascorbic Acid",
      "risk": "low",
      "note": "Vitamin C, natural preservative"
    }
  ],
  "sources": ["Deepseek"],
  "needs_confirmation": false
}
```

### POST /api/chat-deepseek
Chat with AI about food analysis.

**Request:**
```json
{
  "messages": [
    {"role": "user", "content": "Why is this rated 85?"}
  ]
}
```

### GET /api/images
Get list of previously analyzed foods.

---

## Troubleshooting

### Issue: "Deepseek authentication failed"

**Cause**: Invalid or missing API key

**Solution**:
1. Verify `DEEPSEEK_API_KEY` in `.env.local`
2. Get a new key at: https://platform.deepseek.com/
3. Restart dev server after changing `.env.local`

---

### Issue: "Rate limit exceeded"

**Cause**: Too many API requests

**Solution**:
1. Wait 15 minutes for rate limit to reset
2. Configure OpenAI fallback for redundancy
3. Consider upgrading API tier for higher limits

---

### Issue: "Tests failing"

**Cause**: Dev server not running or cache issues

**Solution**:
```bash
# Clear Next.js cache
rm -rf .next

# Clear node modules (last resort)
rm -rf node_modules package-lock.json
npm install

# Ensure dev server is running
npm run dev
```

---

### Issue: "AI returns error"

**Cause**: API misconfiguration or network issue

**Solution**:
1. Check API key is valid and has quota remaining
2. Verify `DEEPSEEK_BASE_URL` is correct
3. Test API directly:
   ```bash
   curl https://api.deepseek.com/v1/models \
     -H "Authorization: Bearer $DEEPSEEK_API_KEY"
   ```
4. Check network connectivity and firewall settings

---

## Performance Considerations

### API Response Times

| Provider | Avg | P95 | Success Rate |
|----------|-----|-----|--------------|
| Deepseek | ~3s | ~6s | 99% |
| OpenAI | ~2s | ~4s | 99.8% |
| Local | <0.1s | N/A | 100% (mock) |

### Rate Limits

- **Deepseek**: ~10 req/min on free tier
- **OpenAI**: Depends on plan (3-10 req/min typical)
- **Mitigation**: Fallback chain, exponential backoff

---

## Security Notes

1. **Never commit `.env.local`** to version control
2. **Rotate API keys** periodically
3. **Use environment-specific configs** for staging/production
4. **Enable rate limiting** in production (already implemented)

---

## Production Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, etc.
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t molly-food-scanner .
docker run -p 3000:3000 --env-file .env.local molly-food-scanner
```

---

## Health Checks

### Development

```bash
curl http://localhost:3000/
# Should return HTML page
```

### API Test

```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"image_url": "/uploads/test.jpg"}'
```

---

## Support

- **Documentation**: See `TODO.md` for contract status
- **Session State**: See `SESSION_STATE.md` for progress
- **Issues**: Report via project issue tracker

---

**Last Updated**: 2025-01-20
**Version**: 0.2.0-deepseek
