// index.js - AstraSync API Server (Production Version)
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection with comprehensive error handling
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to database:', err.stack);
  } else {
    console.log('✅ Successfully connected to PostgreSQL');
    release();
  }
});

// Initialize database tables
async function initDatabase() {
  try {
    // Create agents table
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
    
    // Create email queue table
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
    
    // Create indexes for better query performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_email ON agents(email);
      CREATE INDEX IF NOT EXISTS idx_agents_registered_at ON agents(registered_at);
    `);
    
    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    console.error('The API will continue to run, but some features may not work properly');
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
  let databaseStatus = 'unknown';
  let totalAgents = 0;
  
  try {
    const result = await pool.query('SELECT COUNT(*) as count FROM agents');
    totalAgents = parseInt(result.rows[0].count);
    databaseStatus = 'connected';
  } catch (error) {
    databaseStatus = 'error';
    console.error('Health check database error:', error);
  }
  
  res.json({
    service: 'AstraSync API',
    version: '0.1.0',
    status: 'preview',
    message: 'Welcome to AstraSync Developer Preview. See /v1/docs for API documentation.',
    stats: {
      totalAgents: totalAgents,
      blockchainStatus: 'pending_audit',
      databaseStatus: databaseStatus
    }
  });
});

// Main registration endpoint
app.post('/v1/register', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { email, agent } = req.body;
    
    // Input validation
    if (!email || !email.includes('@')) {
      return res.status(400).json({
        error: 'Valid email address is required',
        message: 'Please provide a valid email address for agent registration'
      });
    }
    
    if (!agent || !agent.name || !agent.owner) {
      return res.status(400).json({
        error: 'Incomplete agent data',
        message: 'Agent must have at least name and owner fields'
      });
    }
    
    // Generate IDs and metadata
    const tempId = generateTempId();
    const internalId = uuidv4();
    const timestamp = new Date();
    
    // Prepare agent data
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
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'] || 'unknown'
    };
    
    // Start transaction
    await client.query('BEGIN');
    
    // Insert agent
    await client.query(
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
    await client.query(
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
    
    // Commit transaction
    await client.query('COMMIT');
    
    // Log successful registration
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
    // Rollback transaction on error
    await client.query('ROLLBACK');
    console.error('Registration error:', error);
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to register agent. Please try again.',
      requestId: uuidv4() // For debugging purposes
    });
  } finally {
    client.release();
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
    
    if (!email) {
      return res.status(400).json({
        error: 'Email required',
        message: 'Please provide email parameter for verification'
      });
    }
    
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
    if (email.toLowerCase() !== agent.email.toLowerCase()) {
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

// List recent agents (public endpoint for dashboard)
app.get('/v1/agents/recent', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100); // Cap at 100
    
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
    
    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) as count FROM agents');
    const totalCount = parseInt(countResult.rows[0].count);
    
    res.json({
      agents: recentAgents,
      total: totalCount,
      returned: recentAgents.length
    });
  } catch (error) {
    console.error('Recent agents error:', error);
    res.json({
      agents: [],
      total: 0,
      returned: 0,
      error: 'Failed to fetch recent agents'
    });
  }
});

// Stats endpoint for dashboard
app.get('/v1/stats', async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    
    // Run queries in parallel for better performance
    const [totalResult, recentResult, emailResult] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM agents'),
      pool.query('SELECT COUNT(*) as count FROM agents WHERE registered_at > $1', [last24h]),
      pool.query('SELECT COUNT(*) as count FROM email_queue')
    ]);
    
    const totalAgents = parseInt(totalResult.rows[0].count);
    const recentCount = parseInt(recentResult.rows[0].count);
    const emailQueueSize = parseInt(emailResult.rows[0].count);
    
    res.json({
      totalAgents: totalAgents,
      last24Hours: recentCount,
      blockchainStatus: 'pending_audit',
      emailQueueSize: emailQueueSize,
      serverTime: now.toISOString(),
      databaseStatus: 'connected',
      uptime: process.uptime(),
      apiVersion: '0.1.0'
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      totalAgents: 0,
      last24Hours: 0,
      blockchainStatus: 'pending_audit',
      emailQueueSize: 0,
      serverTime: new Date().toISOString(),
      databaseStatus: 'error',
      error: 'Failed to fetch statistics'
    });
  }
});

// Basic docs endpoint
app.get('/v1/docs', (req, res) => {
  res.json({
    version: 'v1',
    baseUrl: req.protocol + '://' + req.get('host'),
    endpoints: [
      {
        method: 'POST',
        path: '/v1/register',
        description: 'Register a new AI agent',
        required: ['email', 'agent.name', 'agent.owner'],
        optional: ['agent.description', 'agent.capabilities', 'agent.version', 'agent.ownerUrl']
      },
      {
        method: 'GET',
        path: '/v1/verify/:agentId',
        description: 'Verify an agent exists and get basic info',
        parameters: ['agentId - The temporary agent ID']
      },
      {
        method: 'GET',
        path: '/v1/agent/:agentId?email=xxx',
        description: 'Get full agent details (requires matching email)',
        parameters: ['agentId - The temporary agent ID', 'email - Registration email (query param)']
      },
      {
        method: 'GET',
        path: '/v1/agents/recent?limit=10',
        description: 'Get recently registered agents',
        parameters: ['limit - Number of agents to return (max 100)']
      },
      {
        method: 'GET',
        path: '/v1/stats',
        description: 'Get registration statistics and system status'
      }
    ],
    documentation: 'https://github.com/astrasyncai/astrasync-api',
    support: 'developers@astrasync.ai'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
    requestId: uuidv4()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Endpoint ${req.method} ${req.path} not found`,
    documentation: `${req.protocol}://${req.get('host')}/v1/docs`
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
🚀 AstraSync API Server Started
================================
Port: ${PORT}
Environment: ${process.env.NODE_ENV || 'development'}
Database: ${process.env.DATABASE_URL ? 'PostgreSQL Connected' : 'No Database Configured'}
Time: ${new Date().toISOString()}

Endpoints:
- GET    /                - Health check
- POST   /v1/register     - Register new agent
- GET    /v1/verify/:id   - Verify agent
- GET    /v1/agent/:id    - Get agent details
- GET    /v1/agents/recent - List recent agents
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

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});
