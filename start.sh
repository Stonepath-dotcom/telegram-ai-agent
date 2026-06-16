#!/bin/bash

# ============================================
# Telegram AI Agent Bot - Startup Script
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}🤖 Telegram AI Agent Bot - Startup${NC}"
echo "================================"
echo ""

# Check if BOT_TOKEN is set
if [ -z "$BOT_TOKEN" ]; then
  # Try loading from .env file
  if [ -f .env ]; then
    echo -e "${YELLOW}📋 Loading .env file...${NC}"
    export $(grep -v '^#' .env | xargs)
  fi

  if [ -z "$BOT_TOKEN" ]; then
    echo -e "${RED}❌ BOT_TOKEN not set!${NC}"
    echo ""
    echo "Set it with:"
    echo "  export BOT_TOKEN=your_token_here"
    echo ""
    echo "Or create .env file:"
    echo "  cp .env.example .env"
    echo "  # Edit .env and add your token"
    echo ""
    exit 1
  fi
fi

echo -e "${GREEN}✅ BOT_TOKEN found${NC}"

# Check if node is installed
if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js not found! Install it first.${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Node.js $(node -v)${NC}"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}📦 Installing dependencies...${NC}"
  npm install
fi

echo -e "${GREEN}✅ Dependencies ready${NC}"
echo ""

# Check for PM2
if command -v pm2 &> /dev/null; then
  echo -e "${CYAN}🚀 Starting with PM2 (production mode)...${NC}"
  pm2 start ecosystem.config.cjs
  pm2 logs telegram-ai-agent
elif [ "$1" == "docker" ]; then
  echo -e "${CYAN}🚀 Starting with Docker...${NC}"
  docker-compose up -d
  docker-compose logs -f
else
  echo -e "${CYAN}🚀 Starting bot directly...${NC}"
  echo -e "${YELLOW}💡 Tip: Install PM2 for production (npm i -g pm2)${NC}"
  echo ""
  node src/index.js
fi
