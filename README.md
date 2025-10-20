# AstraSync API

<div align="center">
  <img src="https://www.astrasync.ai/assets/AS_black_IconFCN.png" alt="AstraSync Logo" width="200"/>
  
  # Know Your Agent (KYA) Registry
  
  [![API Status](https://img.shields.io/badge/API-Operational-green)](https://astrasync.ai/api)
  [![Version](https://img.shields.io/badge/version-v1-blue)](https://astrasync.ai/api)
  [![Discord](https://img.shields.io/discord/X78ctNp7?label=Discord&logo=discord)](https://discord.com/invite/X78ctNp7)
  [![License](https://img.shields.io/badge/license-Proprietary-red.svg)](LICENSE)
  
  **The missing identity layer for AI agents. Get verifiable identity, ownership tracking, and compliance-ready agent cards in one API call.**
</div>

## 🚀 Quick Start

Register your AI agent in 30 seconds:

```bash
curl -X POST https://astrasync.ai/api/v1/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "developer@example.com",
    "agent": {
      "name": "My AI Assistant",
      "description": "A helpful AI agent for customer support",
      "owner": "ACME Corp",
      "capabilities": ["chat", "analysis", "automation"]
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
  "message": "Agent registered successfully with temporary credentials. Create an account at https://www.astrasync.ai/alphaSignup to convert to permanent credentials.",
  "verifyUrl": "https://astrasync.ai/api/v1/verify/TEMP-1706439245-X7K9M2"
}
```

## 🌟 Why AstraSync?

As AI agents become more autonomous and widespread, organizations face a growing crisis:

- ❌ **No Universal Identity**: AI agents lack standardized identification
- ❌ **Ownership Ambiguity**: Who's responsible when an agent acts?
- ❌ **Compliance Gaps**: No audit trail for agent actions
- ❌ **Trust Deficit**: No way to verify agent legitimacy

AstraSync solves these problems with:

- ✅ **Unique Identity**: Every agent gets a cryptographically unique identifier
- ✅ **Ownership Tracking**: Clear chain of custody for agent ownership
- ✅ **Blockchain Verified**: Immutable record of agent registration
- ✅ **Trust Scoring**: Dynamic trust scores based on agent behavior
- ✅ **Compliance Ready**: Built for regulatory requirements

## 📋 API Endpoints

### Base URL
```
https://astrasync.ai/api
```

### 1. Register Agent
**`POST /v1/register`**

Register a new AI agent and receive a unique identifier.

#### Request Body
```json
{
  "email": "your-email@example.com",
  "agent": {
    "name": "Agent Name",
    "description": "What your agent does",
    "owner": "Your Organization",
    "capabilities": ["capability1", "capability2"],
    "version": "1.0.0",
    "metadata": {
      "custom_field": "custom_value"
    }
  }
}
```

#### Required Fields
- `email`: Valid email for notifications and alpha enrollment
- `agent.name`: Your agent's name
- `agent.description`: Brief description of functionality
- `agent.owner`: Organization or individual owning the agent

#### Response
```json
{
  "agentId": "TEMP-1706439245-X7K9M2",
  "status": "registered",
  "blockchain": {
    "status": "pending",
    "message": "Blockchain registration queued"
  },
  "trustScore": "TEMP-95%",
  "message": "Registration successful",
  "verifyUrl": "https://astrasync.ai/api/v1/verify/TEMP-..."
}
```

### 2. Verify Agent
**`GET /v1/verify/{agentId}`**

Verify if an agent is registered and retrieve its status.

#### Example
```bash
curl https://astrasync.ai/api/v1/verify/TEMP-1706439245-X7K9M2
```

#### Response
```json
{
  "verified": true,
  "agentId": "TEMP-1706439245-X7K9M2",
  "owner": "ACME Corp",
  "registeredAt": "2025-01-28T12:34:56Z",
  "trustScore": "TEMP-95%",
  "message": "This is a temporary developer preview credential..."
}
```

### 3. Get Agent Details
**`GET /v1/agent/{agentId}?email={email}`**

Retrieve full agent details (requires matching email).

#### Example
```bash
curl "https://astrasync.ai/api/v1/agent/TEMP-1706439245-X7K9M2?email=developer@example.com"
```

## 📱 Platform Support

| Platform | MCP Support | Integration Method | Setup Guide |
|----------|-------------|-------------------|-------------|
| Claude Desktop | ✅ Native | HTTP MCP | [Instructions](https://github.com/AstraSyncAI/astrasync-mcp-bridge/tree/main/docs/PLATFORMS.md#claude-desktop) |
| ChatGPT Desktop | ✅ Native | HTTP MCP | [Instructions](https://github.com/AstraSyncAI/astrasync-mcp-bridge/tree/main/docs/PLATFORMS.md#chatgpt-desktop) |
| Cursor | ✅ Native | HTTP MCP | [Instructions](https://github.com/AstraSyncAI/astrasync-mcp-bridge/tree/main/docs/PLATFORMS.md#cursor) |
| Windsurf | ✅ Native | HTTP MCP | [Instructions](https://github.com/AstraSyncAI/astrasync-mcp-bridge/tree/main/docs/PLATFORMS.md#windsurf) |
| Cline | ✅ Native | HTTP MCP | [Instructions](https://github.com/AstraSyncAI/astrasync-mcp-bridge/tree/main/docs/PLATFORMS.md#cline) |
| Claude Web | ❌ Not supported | Copy/paste workflow | [Workaround](https://github.com/AstraSyncAI/astrasync-mcp-bridge/tree/main/docs/PLATFORMS.md#claude-web) |
| ChatGPT Web | ❌ Not supported | Custom GPT Actions | [Alternative](https://github.com/AstraSyncAI/astrasync-mcp-bridge/tree/main/docs/PLATFORMS.md#chatgpt-web) |
| Perplexity | ❌ Not yet | Direct API | Use REST endpoint directly |

## 🔐 Authentication & Security

### Production
- Email verification for agent ownership
- Rate limiting: 100 requests per hour
- API key authentication for verified accounts
- HTTPS encryption for all communications

## 📊 Production Features

### ✅ Available Now
- Agent registration with production IDs (ASTRAS-XXXXXX)
- Email notifications for registration
- Ownership tracking and verification
- Dynamic trust scoring (0-100 scale)
- Customer intelligence logging
- Blockchain registration queuing

### 🔄 Coming Soon
- Live blockchain verification
- Ownership transfers
- Webhook notifications
- Advanced compliance features
- Multi-signature agent management

## 🎯 Use Cases

### For AI Developers
- Register agents before deployment
- Track agent versions and updates
- Prove ownership for liability protection

### For Enterprises
- Maintain inventory of AI agents
- Compliance with AI regulations
- Audit trail for agent actions

### For Platforms
- Verify agent legitimacy
- Filter trusted vs untrusted agents
- Enable agent marketplaces

## 🤝 Becoming an Alpha Partner

We're building the future of AI agent trust infrastructure and looking for early partners to shape the product.

### Benefits of Joining
- Direct input on product features
- Priority access to new capabilities
- Lifetime discounted pricing
- Technical support from founders

To become an alpha partner or contribute to the project, contact us at [alphapartners@astrasync.ai](mailto:alphapartners@astrasync.ai).

## 📞 Support & Community

- 💬 **Discord**: [Join our community](https://discord.com/invite/X78ctNp7)
- 📧 **Email**: [alphapartners@astrasync.ai](mailto:alphapartners@astrasync.ai)
- 🌐 **Website**: [astrasync.ai](https://astrasync.ai)
- 📖 **Documentation**: [GitHub Docs](https://github.com/AstraSyncAI/astrasync-mcp-bridge/tree/main/docs)
- 🐛 **Support**: Contact [alphapartners@astrasync.ai](mailto:alphapartners@astrasync.ai)

## 🔒 Security

- All API communications use HTTPS
- Database encryption at rest
- Regular security audits
- Report security issues to: [alphapartners@astrasync.ai](mailto:alphapartners@astrasync.ai)

## 📄 License

Proprietary - All rights reserved. Contact [alphapartners@astrasync.ai](mailto:alphapartners@astrasync.ai) for licensing inquiries.

---

<div align="center">
  <b>Building the trust infrastructure for the AI agent economy.</b>
  <br><br>
  🌟 Join the Alpha Program: <a href="https://www.astrasync.ai/alphaSignup">Sign up now</a>
  <br>
  📧 For partnership opportunities: <a href="mailto:alphapartners@astrasync.ai">alphapartners@astrasync.ai</a>
</div>
