#!/bin/bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'  # FIXED: Was undefined
BLUE='\033[0;34m'
NC='\033[0m'

ATLAS_DIR="$HOME/Atlas"
ENV_FILE="$ATLAS_DIR/.env"
ENV_EXAMPLE="$ATLAS_DIR/.env.example"
SECRETS_DIR="$HOME/.secrets"

echo -e "${CYAN}Atlas Environment Setup${NC}"

# Create secrets directory
mkdir -p "$SECRETS_DIR"

# Check if .env.example exists
if [ ! -f "$ENV_EXAMPLE" ]; then
    echo -e "${RED}Error: .env.example not found at $ENV_EXAMPLE${NC}"
    exit 1
fi

# Check if .env exists
if [ -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}.env already exists. Backup? (y/n)${NC}"
    read -r backup
    if [[ "$backup" == "y" ]]; then
        cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%s)"
        echo -e "${GREEN}✓ Backup created${NC}"
    fi
fi

# Copy example
cp "$ENV_EXAMPLE" "$ENV_FILE"

# Prompt for required values
echo -e "\n${GREEN}Required Configuration${NC}"

# API Token - store in file (NOT env var for security)
echo -n "Atlas API Token (or press ENTER to generate): "
read -r api_token
if [[ -z "$api_token" ]]; then
    api_token=$(openssl rand -hex 32)
fi
echo "$api_token" > "$SECRETS_DIR/atlas-token"
chmod 600 "$SECRETS_DIR/atlas-token"

# Update .env to reference secrets file
sed -i 's|ATLAS_API_TOKEN_FILE=.*|ATLAS_API_TOKEN_FILE='"$SECRETS_DIR"'/atlas-token|' "$ENV_FILE"

# Control Plane URL
echo -n "Control Plane URL [http://localhost:8892]: "
read -r cp_url
cp_url=${cp_url:-http://localhost:8892}
sed -i "s|ATLAS_CONTROL_PLANE_URL=.*|ATLAS_CONTROL_PLANE_URL=$cp_url|" "$ENV_FILE"

# Validate
echo -e "\n${GREEN}Validating configuration...${NC}"

source "$ENV_FILE"

# Read token from file
if [[ -f "$ATLAS_API_TOKEN_FILE" ]]; then
    ATLAS_API_TOKEN=$(cat "$ATLAS_API_TOKEN_FILE")
else
    echo -e "${RED}Error: ATLAS_API_TOKEN_FILE not found${NC}"
    exit 1
fi

if [[ -z "$ATLAS_API_TOKEN" ]]; then
    echo -e "${RED}Error: ATLAS_API_TOKEN is required${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Environment configured successfully${NC}"
echo -e "${GREEN}✓ .env created at $ENV_FILE${NC}"
echo -e "${GREEN}✓ API token stored securely in $SECRETS_DIR/atlas-token${NC}"
echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Review .env and add optional values (API keys, webhooks)"
echo "2. Source environment: source $ENV_FILE"
echo "3. Start services: ./scripts/dev_up.sh"
