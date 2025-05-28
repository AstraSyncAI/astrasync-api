// index.js - AstraSync MVP API Server
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage (will be replaced with database later)
const agents = new Map();
const emailQueue = [];

// Helper function to generate temp ID
function generateTempId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TEMP-${timestamp}-${random}`;
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'AstraSync API',
    version: '0.1.0',
    status: 'preview',
    message: 'Welcome to AstraSync Developer Preview. See /v1/docs for API documentation.',
    stats: {
      totalAgents: agents.size,
      blockchainStatus: 'pending_audit'
    }
  });
});

// Main registration endpoint
app.post('/v1/register', async (req, res) => {
  try {
    const { email, agent } = req.body;
    
    // Basic validation
    if (!email || !email.includes('@')) {
      return res.status(400).json({
        error: 'Valid email address is required'
      });
    }
    
    if (!agent || !agent.name || !agent.owner) {
      return res.status(400).json({
        error: 'Agent must have name and owner fields'
      });
    }
    
    // Generate IDs and metadata
    const tempId = generateTempId();
    const internalId = uuidv4();
    const timestamp = new Date().toISOString();
    
    // Create agent record
    const agentRecord = {
      id: tempId,
      internalId,
      email,
      status: 'registered',
      blockchainStatus: 'pending',
      trustScore: 'TEMP-95%',
      registeredAt: timestamp,
      agent: {
        name: agent.name,
        description: agent.description || '',
        owner: agent.owner,
        ownerUrl: agent.ownerUrl || '',
        capabilities: agent.capabilities || [],
        version: agent.version || '1.0.0'
      },
      metadata: {
        registrationMethod: 'api',
        apiVersion: 'v1',
        ip: req.ip
      }
    };
    
    // Store agent
    agents.set(tempId, agentRecord);
    
    // Queue email notification (in production, this would use a real email service)
    emailQueue.push({
      to: email,
      subject: 'AstraSync Agent Registration Confirmed',
      template: 'registration_confirmed',
      data: {
        agentId: tempId,
        agentName: agent.name,
        timestamp
      }
    });
    
    // Log registration for dashboard
    console.log(`✅ New agent registered: ${tempId} - ${agent.name} (${email})`);
    
    // Return response
    res.status(201).json({
      agentId: tempId,
      status: 'registered',
      blockchain: {
        status: 'pending',
        message: 'Blockchain registration queued. You will be notified upon completion.'
      },
      trustScore: 'TEMP-95%',
      message: 'Agent registered successfully. Check your email for updates.',
      links: {
        verify: `https://api.astrasync.dev/v1/verify/${tempId}`,
        dashboard: 'https://preview.astrasync.ai'
      },
      registeredAt: timestamp
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to register agent. Please try again.'
    });
  }
});

// Verify agent endpoint
app.get('/v1/verify/:agentId', (req, res) => {
  const { agentId } = req.params;
  const agent = agents.get(agentId);
  
  if (!agent) {
    return res.status(404).json({
      error: 'Agent not found',
      message: `No agent found with ID: ${agentId}`
    });
  }
  
  // Return public information only
  res.json({
    agentId: agent.id,
    status: agent.status,
    blockchain: {
      status: agent.blockchainStatus,
      message: agent.blockchainStatus === 'pending' 
        ? 'Blockchain registration pending security audit completion'
        : 'Registered on blockchain'
    },
    trustScore: agent.trustScore,
    agent: {
      name: agent.agent.name,
      owner: agent.agent.owner,
      version: agent.agent.version
    },
    registeredAt: agent.registeredAt,
    verified: true
  });
});

// Get agent details (requires email for now, will require auth later)
app.get('/v1/agent/:agentId', (req, res) => {
  const { agentId } = req.params;
  const { email } = req.query;
  
  const agent = agents.get(agentId);
  
  if (!agent) {
    return res.status(404).json({
      error: 'Agent not found'
    });
  }
  
  // Basic ownership check
  if (email !== agent.email) {
    return res.status(403).json({
      error: 'Unauthorized',
      message: 'Email does not match agent registration'
    });
  }
  
  // Return full agent details
  res.json(agent);
});

// List all agents (public endpoint for dashboard)
app.get('/v1/agents/recent', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  
  // Get recent agents (without sensitive data)
  const recentAgents = Array.from(agents.values())
    .sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt))
    .slice(0, limit)
    .map(agent => ({
      agentId: agent.id,
      name: agent.agent.name,
      owner: agent.agent.owner,
      registeredAt: agent.registeredAt,
      trustScore: agent.trustScore
    }));
  
  res.json({
    agents: recentAgents,
    total: agents.size
  });
});

// Stats endpoint for dashboard
app.get('/v1/stats', (req, res) => {
  const now = new Date();
  const last24h = new Date(now - 24 * 60 * 60 * 1000);
  
  const recentCount = Array.from(agents.values())
    .filter(agent => new Date(agent.registeredAt) > last24h)
    .length;
  
  res.json({
    totalAgents: agents.size,
    last24Hours: recentCount,
    blockchainStatus: 'pending_audit',
    emailQueueSize: emailQueue.length,
    serverTime: now.toISOString()
  });
});

// Basic docs endpoint
app.get('/v1/docs', (req, res) => {
  res.json({
    version: 'v1',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/register',
        description: 'Register a new AI agent',
        required: ['email', 'agent.name', 'agent.owner']
      },
      {
        method: 'GET',
        path: '/v1/verify/:agentId',
        description: 'Verify an agent exists and get basic info'
      },
      {
        method: 'GET',
        path: '/v1/agent/:agentId?email=xxx',
        description: 'Get full agent details (requires matching email)'
      },
      {
        method: 'GET',
        path: '/v1/agents/recent',
        description: 'Get recently registered agents'
      },
      {
        method: 'GET',
        path: '/v1/stats',
        description: 'Get registration statistics'
      }
    ],
    documentation: 'https://github.com/astrasyncai/astrasync-api'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Endpoint ${req.method} ${req.path} not found`,
    documentation: 'https://api.astrasync.dev/v1/docs'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
🚀 AstraSync API Server Started
================================
Port: ${PORT}
Environment: ${process.env.NODE_ENV || 'development'}
Time: ${new Date().toISOString()}

Endpoints:
- POST   /v1/register     - Register new agent
- GET    /v1/verify/:id   - Verify agent
- GET    /v1/stats        - Get statistics
- GET    /v1/docs         - API documentation

Ready for connections!
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});
