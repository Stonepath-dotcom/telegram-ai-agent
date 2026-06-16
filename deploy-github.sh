#!/bin/bash

# ============================================
# Deploy to GitHub - Quick Setup Script
# ============================================

set -e

echo ""
echo "🚀 Telegram AI Agent Bot — Deploy to GitHub"
echo "============================================="
echo ""

# Check git
if ! command -v git &> /dev/null; then
  echo "❌ Git not installed. Install it first."
  exit 1
fi

# Check if already a git repo
if [ ! -d ".git" ]; then
  git init
  git config user.email "gloagent-bot@users.noreply.github.com"
  git config user.name "Gloagent Bot"
fi

echo "📋 Steps to deploy:"
echo ""
echo "1️⃣  Create a new repo on GitHub:"
echo "    → https://github.com/new"
echo "    → Name: telegram-ai-agent"
echo "    → Don't initialize README"
echo ""
echo "2️⃣  Run these commands:"
echo ""
echo "    git remote add origin https://github.com/YOUR_USERNAME/telegram-ai-agent.git"
echo "    git branch -M main"
echo "    git push -u origin main"
echo ""
echo "3️⃣  Done! 🎉"
echo ""

# Auto-detect if gh CLI is available
if command -v gh &> /dev/null; then
  echo "🔧 GitHub CLI detected! Auto-creating repo..."
  read -p "Repo name (default: telegram-ai-agent): " REPO_NAME
  REPO_NAME=${REPO_NAME:-telegram-ai-agent}
  
  gh repo create "$REPO_NAME" --public --source=. --push
  echo ""
  echo "✅ Pushed to GitHub!"
  echo "📌 https://github.com/$(gh api user --jq .login)/$REPO_NAME"
fi
