# astrasync-api
Know Your Agent (KYA) - The missing identity layer for AI agents. Get verifiable identity, ownership tracking, and compliance-ready agent cards in one API call.
# AstraSync Developer Preview

> 🚀 **The first unique, immutable and verifiable identity registry for AI agents. Currently in preview mode.**

## 🟢 API Status: Live Developer Preview

**Base URL**: `https://astrasync-api-production.up.railway.app`  
**Status**: Operational  
**Version**: v1 (Preview)  

Note: This is a preview deployment. Production URLs will be migrated to `api.astrasync.ai` in June 2025.

## Quick Start

Register your AI agent in 30 seconds:

```bash
# Live Developer Preview API
curl -X POST https://astrasync-api-production.up.railway.app/v1/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "developer@example.com",
    "agent": {
      "name": "My AI Assistant",
      "description": "A helpful AI agent",
      "owner": "ACME Corp",
      "capabilities": ["chat", "analysis"]
    }
  }'
```

You'll receive:
```json
{
  "agentId": "TEMP-1706439245-X7K9M2",
  "status": "registered",
  "blockchain": {
    "status": "pending",
    "message": "Blockchain registration queued. You will be notified upon completion."
  },
  "trustScore": "TEMP-95%",
  "message": "Agent registered successfully. Check your email for updates."
}
```

## What is AstraSync?

AstraSync provides verifiable identity for AI agents, solving the critical trust problem in autonomous AI:

- **Unique Identity**: Every agent gets a cryptographically unique identifier
- **Ownership Tracking**: Clear chain of custody for agent ownership
- **Blockchain Verified**: Immutable record of agent registration (currently in security audit)
- **Trust Scoring**: Dynamic trust scores based on agent behavior and verification

## Developer Preview Status

This is an early preview of AstraSync. Here's what's available:

✅ **Working Now**
- Agent registration API
- Unique temporary identifiers (TEMP-XXXXXX)
- Email notifications
- Basic ownership tracking

🔄 **Coming Soon** (June 2025 Alpha)
- Production identifiers (ASTRAS-XXXXXX)
- Live blockchain registration
- Dynamic trust scoring
- Ownership transfers
- Advanced compliance features

## API Documentation

### Register an Agent

**Endpoint**: `POST (https://astrasync-api-production.up.railway.app/v1/register)`

**Request Body**:
```json
{
  "email": "your-email@example.com",
  "agent": {
    "name": "Agent Name",
    "description": "What your agent does",
    "owner": "Your Organization",
    "capabilities": ["capability1", "capability2"],
    "version": "1.0.0"
  }
}
```

**Required Fields**:
- `email`: Valid email for notifications and alpha program enrollment
- `agent.name`: Your agent's name
- `agent.description`: Brief description of functionality
- `agent.owner`: Organization or individual owning the agent

### Verify an Agent

**Endpoint**: `GET https://astrasync-api-production.up.railway.app/v1/verify/{agentId}`

Returns the registration status and details for any registered agent.

## Why Register During Preview?

1. **Reserve Your Place**: First 100 developers get priority access to Alpha
2. **Shape the Product**: Your feedback directly influences our roadmap
3. **Lock in Benefits**: Preview users receive lifetime discounted pricing
4. **Stay Informed**: Get updates on blockchain integration and new features

## Roadmap

- **Now - Feb 2025**: Developer Preview (Temporary IDs)
- **March 2025**: Blockchain security audit completion
- **April 2025**: Private Alpha (First 100 developers)
- **June 2025**: Public Alpha Launch
- **Q4 2025**: Production Release

## Get Involved

- 🌟 Star this repo to follow our progress
- 💬 Join our [Discord](#) for developer discussions
- 📧 Contact: alphapartners@astrasync.ai
- 🔗 Website: [astrasync.ai](https://astrasync.ai)

## About

AstraSync is building the trust infrastructure for the AI agent economy. As AI agents become more autonomous and powerful, establishing verifiable identity and ownership becomes critical for compliance, security, and accountability.

Founded by experts in AI, blockchain, and regulatory compliance, we're creating the foundational layer that enables safe, scalable deployment of AI agents in production environments.

---

*This is a preview release. Production features including blockchain integration and dynamic trust scoring are under active development.*
