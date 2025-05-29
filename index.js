// index.js - AstraSync MVP API Server with PostgreSQL
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database tables
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id VARCHAR(50) PRIMARY KEY,
        internal_id UUID NOT NULL,
        email VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        blockchain_status VARCHAR(50) NOT NULL,
        trust_score VARCHAR(20) NOT NULL,
        registered_at TIMESTAMP NOT NULL,
        agent_data JSONB NOT NULL,
        metadata JSONB NOT NULL
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_queue (
        id SERIAL PRIMARY KEY,
        recipient VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        template VARCHAR(50) NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    // Don't crash - the API can still work for read operations
  }
}

// Initialize database on startup
initDatabase();

// Helper function to generate temp ID
function generateTempId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TEMP-${timestamp}-${random}`;
}

// Health check endpoint
app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) as count FROM agents');
    const totalAgents = parseInt(result.rows[0].count);
    
    res.json({
      service: 'AstraSync API',
      version: '0.1.0',
      status: 'preview',
      message: 'Welcome to AstraSync Developer Preview. See /v1/docs for API documentation.',
      stats: {
        totalAgents: totalAgents,
        blockchainStatus: 'pending_audit',
        databaseStatus: 'connected'
      }
    });
  } catch (error) {
    // If database fails, still return basic response
    res.json({
      service: 'AstraSync API',
      version: '0.1.0',
      status: 'preview',
      message: 'Welcome to AstraSync Developer Preview. See /v1/docs for API documentation.',
      stats: {
        totalAgents: 'unavailable',
        blockchainStatus: 'pending_audit',
        databaseStatus: 'error'
      }
    });
  }
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
    const timestamp = new Date();
    
    // Create agent record
    const agentData = {
      name: agent.name,
      description: agent.description || '',
      owner: agent.owner,
      ownerUrl: agent.ownerUrl || '',
      capabilities: agent.capabilities || [],
      version: agent.version || '1.0.0'
    };
    
    const metadata = {
      registrationMethod: 'api',
      apiVersion: 'v1',
      ip: req.ip
    };
    
    // Insert into database
    await pool.query(
      `INSERT INTO agents (id, internal_id, email, status, blockchain_status, trust_score, registered_at, agent_data, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        tempId,
        internalId,
        email,
        'registered',
        'pending',
        'TEMP-95%',
        timestamp,
        JSON.stringify(agentData),
        JSON.stringify(metadata)
      ]
    );
    
    // Queue email notification
    await pool.query(
      `INSERT INTO email_queue (recipient, subject, template, data)
       VALUES ($1, $2, $3, $4)`,
      [
        email,
        'AstraSync Agent Registration Confirmed',
        'registration_confirmed',
        JSON.stringify({
          agentId: tempId,
          agentName: agent.name,
          timestamp: timestamp.toISOString()
        })
      ]
    );
    
    // Log registration
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
      registeredAt: timestamp.toISOString()
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to register agent. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Verify agent endpoint
app.get('/v1/verify/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM agents WHERE id = $1',
      [agentId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Agent not found',
        message: `No agent found with ID: ${agentId}`
      });
    }
    
    const agent = result.rows[0];
    
    // Return public information only
    res.json({
      agentId: agent.id,
      status: agent.status,
      blockchain: {
        status: agent.blockchain_status,
        message: agent.blockchain_status === 'pending' 
          ? 'Blockchain registration pending security audit completion'
          : 'Registered on blockchain'
      },
      trustScore: agent.trust_score,
      agent: {
        name: agent.agent_data.name,
        owner: agent.agent_data.owner,
        version: agent.agent_data.version
      },
      registeredAt: agent.registered_at,
      verified: true
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to verify agent'
    });
  }
});

// Get agent details (requires email for now, will require auth later)
app.get('/v1/agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { email } = req.query;
    
    const result = await pool.query(
      'SELECT * FROM agents WHERE id = $1',
      [agentId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Agent not found'
      });
    }
    
    const agent = result.rows[0];
    
    // Basic ownership check
    if (email !== agent.email) {
      return res.status(403).json({
        error: 'Unauthorized',
        message: 'Email does not match agent registration'
      });
    }
    
    // Return full agent details
    res.json({
      id: agent.id,
      internalId: agent.internal_id,
      email: agent.email,
      status: agent.status,
      blockchainStatus: agent.blockchain_status,
      trustScore: agent.trust_score,
      registeredAt: agent.registered_at,
      agent: agent.agent_data,
      metadata: agent.metadata
    });
  } catch (error) {
    console.error('Get agent error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// List all agents (public endpoint for dashboard)
app.get('/v1/agents/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const result = await pool.query(
      `SELECT id, agent_data, registered_at, trust_score 
       FROM agents 
       ORDER BY registered_at DESC 
       LIMIT $1`,
      [limit]
    );
    
    const recentAgents = result.rows.map(row => ({
      agentId: row.id,
      name: row.agent_data.name,
      owner: row.agent_data.owner,
      registeredAt: row.registered_at,
      trustScore: row.trust_score
    }));
    
    res.json({
      agents: recentAgents,
      total: recentAgents.length
    });
  } catch (error) {
    console.error('Recent agents error:', error);
    res.json({
      agents: [],
      total: 0
    });
  }
});

// Stats endpoint for dashboard
app.get('/v1/stats', async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    
    // Get total count
    const totalResult = await pool.query('SELECT COUNT(*) as count FROM agents');
    const totalAgents = parseInt(totalResult.rows[0].count);
    
    // Get last 24 hours count
    const recentResult = await pool.query(
      'SELECT COUNT(*) as count FROM agents WHERE registered_at > $1',
      [last24h]
    );
    const recentCount = parseInt(recentResult.rows[0].count);
    
    // Get email queue size
    const emailResult = await pool.query('SELECT COUNT(*) as count FROM email_queue');
    const emailQueueSize = parseInt(emailResult.rows[0].count);
    
    res.json({
      totalAgents: totalAgents,
      last24Hours: recentCount,
      blockchainStatus: 'pending_audit',
      emailQueueSize: emailQueueSize,
      serverTime: now.toISOString(),
      databaseStatus: 'connected'
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.json({
      totalAgents: 0,
      last24Hours: 0,
      blockchainStatus: 'pending_audit',
      emailQueueSize: 0,
      serverTime: new Date().toISOString(),
      databaseStatus: 'error'
    });
  }
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
Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}
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
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});
