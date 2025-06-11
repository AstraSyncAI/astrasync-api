const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Health check
app.get('/', (req, res) => {
  res.json({
    message: "Welcome to AstraSync API - The Identity Registry for AI Agents",
    status: "operational",
    version: "1.0.0",
    endpoints: {
      register: "POST /v1/register",
      verify: "GET /v1/verify/:agentId",
      agent: "GET /v1/agent/:agentId",
      stats: "GET /v1/stats",
      recent: "GET /v1/agents/recent",
      docs: "GET /v1/docs"
    }
  });
});

// Register a new agent
app.post('/v1/register', async (req, res) => {
  try {
    const { email, agent } = req.body;
    
    // Validation
    if (!email || !agent?.name || !agent?.owner) {
      return res.status(400).json({
        error: "Missing required fields",
        required: {
          email: "Developer email",
          agent: {
            name: "Agent name",
            owner: "Owner name"
          }
        }
      });
    }

    // Generate IDs
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(3).toString('hex').toUpperCase();
    const agentId = `TEMP-${timestamp}-${randomId}`;
    const internalId = crypto.randomUUID();

    // Prepare agent data
    const agentData = {
      name: agent.name,
      description: agent.description || '',
      owner: agent.owner,
      ownerUrl: agent.ownerUrl || '',
      capabilities: agent.capabilities || [],
      version: agent.version || '1.0.0'
    };

    // Insert into database
    const insertQuery = `
      INSERT INTO agents (
        id, internal_id, email, status, blockchain_status, 
        trust_score, registered_at, agent_data, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      agentId,
      internalId,
      email,
      'registered',
      'pending',
      'TEMP-95%',
      new Date(),
      agentData,
      { source: req.headers['x-source'] || 'api' }
    ];

    const result = await pool.query(insertQuery, values);
    
    // Queue email notification
    const emailQuery = `
      INSERT INTO email_queue (recipient, subject, template, data)
      VALUES ($1, $2, $3, $4)
    `;
    
    await pool.query(emailQuery, [
      email,
      'Welcome to AstraSync - Agent Registered Successfully',
      'agent_registration',
      { agentId, agentName: agent.name }
    ]);

    // Return response
    res.json({
      agentId: agentId,
      status: "registered",
      blockchain: {
        status: "pending",
        message: "Blockchain registration queued. You will be notified upon completion."
      },
      trustScore: "TEMP-95%",
      message: "Agent registered successfully. Check your email for updates.",
      profileUrl: `https://astrasync-api-production.up.railway.app/profile/${agentId}`
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: "Registration failed",
      message: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
});

// Verify agent exists - FIXED: Using 'id' instead of 'agent_id'
app.get('/v1/verify/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    // FIX: Changed from 'agent_id' to 'id'
    const query = 'SELECT id, status, blockchain_status FROM agents WHERE id = $1';
    const result = await pool.query(query, [agentId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Agent not found",
        agentId: agentId,
        message: `Agent ${agentId} not found in the registry.`
      });
    }
    
    const agent = result.rows[0];
    res.json({
      exists: true,
      agentId: agent.id,
      status: agent.status,
      blockchainStatus: agent.blockchain_status
    });
    
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({
      error: "Verification failed",
      message: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
});

// Get agent details
app.get('/v1/agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { email } = req.query;
    
    // FIX: Using 'id' column
    let query = 'SELECT * FROM agents WHERE id = $1';
    const params = [agentId];
    
    // Optional email verification for additional security
    if (email) {
      query += ' AND email = $2';
      params.push(email);
    }
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Agent not found",
        message: email ? "Agent not found or email mismatch" : "Agent not found"
      });
    }
    
    const agent = result.rows[0];
    res.json({
      agentId: agent.id,
      internalId: agent.internal_id,
      status: agent.status,
      blockchainStatus: agent.blockchain_status,
      trustScore: agent.trust_score,
      registeredAt: agent.registered_at,
      agent: agent.agent_data,
      metadata: agent.metadata
    });
    
  } catch (error) {
    console.error('Agent details error:', error);
    res.status(500).json({
      error: "Failed to retrieve agent details",
      message: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
});

// Get recent agents
app.get('/v1/agents/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    
    const query = `
      SELECT id, agent_data, registered_at, trust_score
      FROM agents
      ORDER BY registered_at DESC
      LIMIT $1 OFFSET $2
    `;
    
    const result = await pool.query(query, [limit, offset]);
    
    res.json({
      agents: result.rows.map(row => ({
        agentId: row.id,
        name: row.agent_data.name,
        owner: row.agent_data.owner,
        registeredAt: row.registered_at,
        trustScore: row.trust_score
      })),
      total: result.rows.length
    });
    
  } catch (error) {
    console.error('Recent agents error:', error);
    res.status(500).json({
      error: "Failed to retrieve recent agents",
      message: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
});

// Statistics endpoint
app.get('/v1/stats', async (req, res) => {
  try {
    // Total agents
    const totalQuery = 'SELECT COUNT(*) as count FROM agents';
    const totalResult = await pool.query(totalQuery);
    const totalAgents = parseInt(totalResult.rows[0].count);
    
    // Registered today
    const todayQuery = `
      SELECT COUNT(*) as count 
      FROM agents 
      WHERE registered_at >= CURRENT_DATE
    `;
    const todayResult = await pool.query(todayQuery);
    const registeredToday = parseInt(todayResult.rows[0].count);
    
    // Blockchain pending
    const pendingQuery = `
      SELECT COUNT(*) as count 
      FROM agents 
      WHERE blockchain_status = 'pending'
    `;
    const pendingResult = await pool.query(pendingQuery);
    const blockchainPending = parseInt(pendingResult.rows[0].count);
    
    // Additional stats
    const last24HoursQuery = `
      SELECT COUNT(*) as count 
      FROM agents 
      WHERE registered_at >= NOW() - INTERVAL '24 hours'
    `;
    const last24Result = await pool.query(last24HoursQuery);
    const last24Hours = parseInt(last24Result.rows[0].count);
    
    // Unique developers
    const developersQuery = 'SELECT COUNT(DISTINCT email) as count FROM agents';
    const developersResult = await pool.query(developersQuery);
    const uniqueDevelopers = parseInt(developersResult.rows[0].count);
    
    res.json({
      totalAgents,
      registeredToday,
      last24Hours,
      blockchainPending,
      uniqueDevelopers,
      averageTrustScore: "95%", // Currently static
      status: "operational"
    });
    
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      error: "Failed to retrieve statistics",
      message: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
});

// Log attempt endpoint (for customer intelligence)
app.post('/v1/log-attempt', async (req, res) => {
  try {
    const { event, data } = req.body;
    
    console.log(`[ATTEMPT LOG] ${event}:`, data);
    
    // In production, this would write to a separate analytics table
    res.json({ logged: true });
    
  } catch (error) {
    console.error('Logging error:', error);
    res.status(500).json({ logged: false });
  }
});

// Simple docs endpoint
app.get('/v1/docs', (req, res) => {
  res.json({
    title: "AstraSync API Documentation",
    version: "1.0.0",
    baseUrl: "https://astrasync-api-production.up.railway.app",
    endpoints: [
      {
        method: "POST",
        path: "/v1/register",
        description: "Register a new AI agent",
        body: {
          email: "required - developer email",
          agent: {
            name: "required - agent name",
            description: "optional - agent description",
            owner: "required - owner name",
            ownerUrl: "optional - owner website",
            capabilities: "optional - array of capabilities",
            version: "optional - agent version"
          }
        }
      },
      {
        method: "GET",
        path: "/v1/verify/:agentId",
        description: "Verify if an agent exists"
      },
      {
        method: "GET",
        path: "/v1/agent/:agentId",
        description: "Get detailed agent information",
        query: {
          email: "optional - for additional security"
        }
      },
      {
        method: "GET",
        path: "/v1/agents/recent",
        description: "Get recently registered agents",
        query: {
          limit: "optional - number of results (default 10)",
          offset: "optional - pagination offset"
        }
      },
      {
        method: "GET",
        path: "/v1/stats",
        description: "Get system statistics"
      }
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === 'development' ? err.message : "Something went wrong"
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    message: `Endpoint ${req.method} ${req.path} not found`
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`AstraSync API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});