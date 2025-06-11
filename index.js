const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/', (req, res) => {
  res.json({
    message: 'AstraSync API - Know Your Agent (KYA)',
    status: 'operational',
    version: 'v1',
    endpoints: {
      register: 'POST /v1/register',
      verify: 'GET /v1/verify/:agentId',
      details: 'GET /v1/agent/:agentId',
      profile: 'GET /profile/:agentId',
      recent: 'GET /v1/agents/recent',
      stats: 'GET /v1/stats',
      docs: 'GET /v1/docs'
    }
  });
});

// Generate agent ID
function generateAgentId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TEMP-${timestamp}-${random}`;
}

// Register agent
app.post('/v1/register', async (req, res) => {
  try {
    const { email, agent } = req.body;
    
    // Validation
    if (!email || !agent) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Request must include email and agent object'
      });
    }
    
    if (!agent.name || !agent.owner) {
      return res.status(400).json({
        error: 'Invalid agent data',
        message: 'Agent must have name and owner fields'
      });
    }
    
    // Generate IDs
    const agentId = generateAgentId();
    const internalId = uuidv4();
    
    // Prepare agent data
    const agentData = {
      name: agent.name,
      description: agent.description || '',
      owner: agent.owner,
      ownerUrl: agent.ownerUrl || '',
      capabilities: agent.capabilities || [],
      version: agent.version || '1.0.0',
      agentType: agent.agentType || 'unknown',
      ...agent // Include any additional fields
    };
    
    // Insert into database
    const query = `
      INSERT INTO agents (id, internal_id, email, status, blockchain_status, trust_score, registered_at, agent_data, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
      {
        source: req.headers['x-source'] || 'api',
        ip: req.ip,
        userAgent: req.headers['user-agent']
      }
    ];
    
    await pool.query(query, values);
    
    // Log to email queue
    const emailQuery = `
      INSERT INTO email_queue (recipient, subject, template, data)
      VALUES ($1, $2, $3, $4)
    `;
    
    await pool.query(emailQuery, [
      email,
      'Welcome to AstraSync - Agent Registered',
      'agent_registered',
      { agentId, agentName: agent.name }
    ]);
    
    // Return success
    res.json({
      agentId,
      status: 'registered',
      blockchain: {
        status: 'pending',
        message: 'Blockchain registration queued. You will be notified upon completion.'
      },
      trustScore: 'TEMP-95%',
      message: 'Agent registered successfully. Check your email for updates.',
      profileUrl: `https://astrasync-api-production.up.railway.app/profile/${agentId}`
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: 'An error occurred during registration'
    });
  }
});

// Verify agent
app.get('/v1/verify/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    const query = 'SELECT id, status, trust_score, blockchain_status FROM agents WHERE id = $1';
    const result = await pool.query(query, [agentId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Agent not found',
        message: `No agent found with ID: ${agentId}`
      });
    }
    
    const agent = result.rows[0];
    res.json({
      agentId: agent.id,
      status: agent.status,
      trustScore: agent.trust_score,
      blockchainStatus: agent.blockchain_status,
      profileUrl: `https://astrasync-api-production.up.railway.app/profile/${agentId}`
    });
    
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({
      error: 'Verification failed',
      message: 'An error occurred during verification'
    });
  }
});

// Get agent details (requires email match)
app.get('/v1/agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        error: 'Email required',
        message: 'Email parameter is required to access agent details'
      });
    }
    
    const query = 'SELECT * FROM agents WHERE id = $1 AND email = $2';
    const result = await pool.query(query, [agentId, email]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Agent not found',
        message: 'No agent found with this ID and email combination'
      });
    }
    
    const agent = result.rows[0];
    res.json({
      agentId: agent.id,
      status: agent.status,
      trustScore: agent.trust_score,
      blockchainStatus: agent.blockchain_status,
      registeredAt: agent.registered_at,
      agentData: agent.agent_data,
      profileUrl: `https://astrasync-api-production.up.railway.app/profile/${agentId}`
    });
    
  } catch (error) {
    console.error('Agent details error:', error);
    res.status(500).json({
      error: 'Failed to retrieve agent details',
      message: 'An error occurred while fetching agent details'
    });
  }
});

// Agent profile page (NEW)
app.get('/profile/:agentId', async (req, res) => {
  const { agentId } = req.params;
  
  try {
    const query = 'SELECT * FROM agents WHERE id = $1';
    const result = await pool.query(query, [agentId]);
    
    if (result.rows.length === 0) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Agent Not Found - AstraSync</title>
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
              }
              .container {
                background: white;
                border-radius: 16px;
                padding: 40px;
                max-width: 500px;
                width: 100%;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                text-align: center;
              }
              h1 { color: #e53e3e; margin-bottom: 16px; }
              .error-code { 
                font-family: monospace; 
                background: #fed7d7; 
                color: #c53030;
                padding: 8px 16px; 
                border-radius: 8px;
                display: inline-block;
                margin: 16px 0;
              }
              a { 
                color: #667eea; 
                text-decoration: none;
                font-weight: 600;
              }
              a:hover { text-decoration: underline; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Agent Not Found</h1>
              <p>No agent found with ID:</p>
              <div class="error-code">${agentId}</div>
              <p style="margin-top: 24px;">
                <a href="https://astrasync.ai">Learn more about AstraSync</a>
              </p>
            </div>
          </body>
        </html>
      `);
    }
    
    const agent = result.rows[0];
    const agentData = agent.agent_data;
    
    // Generate a nice profile page
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${agentData.name} - AstraSync Agent</title>
          <meta property="og:title" content="${agentData.name} - AstraSync Agent">
          <meta property="og:description" content="${agentData.description || 'Verified AI Agent on AstraSync'}">
          <meta property="og:image" content="https://astrasync.ai/og-image.png">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              padding: 40px 20px;
            }
            .container {
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              color: white;
              margin-bottom: 32px;
            }
            .header h1 {
              font-size: 24px;
              font-weight: 300;
              letter-spacing: 2px;
            }
            .card {
              background: white;
              border-radius: 16px;
              padding: 40px;
              box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            }
            .agent-header {
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 24px;
              margin-bottom: 24px;
            }
            .agent-name {
              font-size: 32px;
              font-weight: 700;
              color: #1a202c;
              margin-bottom: 8px;
            }
            .agent-id { 
              font-family: 'SF Mono', Monaco, monospace; 
              background: #edf2f7; 
              padding: 6px 12px; 
              border-radius: 6px;
              color: #4a5568;
              font-size: 14px;
              display: inline-block;
            }
            .trust-badge {
              display: inline-flex;
              align-items: center;
              background: #48bb78;
              color: white;
              padding: 6px 16px;
              border-radius: 24px;
              font-size: 14px;
              font-weight: 600;
              margin-left: 12px;
            }
            .section {
              margin-bottom: 32px;
            }
            .section-title {
              font-size: 12px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 1px;
              color: #718096;
              margin-bottom: 8px;
            }
            .section-content {
              color: #2d3748;
              line-height: 1.6;
            }
            .capabilities {
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
              margin-top: 12px;
            }
            .capability {
              background: #667eea;
              color: white;
              padding: 6px 16px;
              border-radius: 24px;
              font-size: 14px;
              font-weight: 500;
            }
            .metadata {
              background: #f7fafc;
              border-radius: 8px;
              padding: 24px;
              margin-top: 32px;
            }
            .metadata-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              border-bottom: 1px solid #e2e8f0;
            }
            .metadata-row:last-child {
              border-bottom: none;
            }
            .metadata-label {
              font-weight: 600;
              color: #4a5568;
            }
            .metadata-value {
              color: #2d3748;
            }
            .footer {
              text-align: center;
              margin-top: 40px;
              padding-top: 32px;
              border-top: 1px solid #e2e8f0;
              color: #718096;
              font-size: 14px;
            }
            .footer a {
              color: #667eea;
              text-decoration: none;
              font-weight: 600;
            }
            .footer a:hover {
              text-decoration: underline;
            }
            .status-pending {
              background: #ed8936;
            }
            .verified-icon {
              width: 20px;
              height: 20px;
              margin-right: 6px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>ASTRASYNC AGENT REGISTRY</h1>
            </div>
            
            <div class="card">
              <div class="agent-header">
                <h2 class="agent-name">${agentData.name}</h2>
                <span class="agent-id">${agent.id}</span>
                <span class="trust-badge">
                  <svg class="verified-icon" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                  </svg>
                  ${agent.trust_score}
                </span>
              </div>
              
              ${agentData.description ? `
                <div class="section">
                  <div class="section-title">Description</div>
                  <div class="section-content">${agentData.description}</div>
                </div>
              ` : ''}
              
              <div class="section">
                <div class="section-title">Owner</div>
                <div class="section-content">
                  ${agentData.owner}
                  ${agentData.ownerUrl ? ` • <a href="${agentData.ownerUrl}" target="_blank" style="color: #667eea;">Website</a>` : ''}
                </div>
              </div>
              
              ${agentData.capabilities && agentData.capabilities.length > 0 ? `
                <div class="section">
                  <div class="section-title">Capabilities</div>
                  <div class="capabilities">
                    ${agentData.capabilities.map(cap => `<span class="capability">${cap}</span>`).join('')}
                  </div>
                </div>
              ` : ''}
              
              <div class="metadata">
                <div class="metadata-row">
                  <span class="metadata-label">Type</span>
                  <span class="metadata-value">${agentData.agentType || 'Generic'}</span>
                </div>
                <div class="metadata-row">
                  <span class="metadata-label">Version</span>
                  <span class="metadata-value">${agentData.version}</span>
                </div>
                <div class="metadata-row">
                  <span class="metadata-label">Registered</span>
                  <span class="metadata-value">${new Date(agent.registered_at).toLocaleString()}</span>
                </div>
                <div class="metadata-row">
                  <span class="metadata-label">Blockchain Status</span>
                  <span class="metadata-value">
                    <span class="capability status-pending">${agent.blockchain_status}</span>
                  </span>
                </div>
              </div>
              
              <div class="footer">
                <p>
                  This agent is registered with the AstraSync AI Agent Registry.<br>
                  <a href="https://astrasync.ai">Learn more</a> • 
                  <a href="https://astrasync.ai/verify">Verify agents</a> • 
                  <a href="https://github.com/AstraSyncAI">Developer docs</a>
                </p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Profile page error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>Error - AstraSync</title>
          <style>
            body { font-family: sans-serif; padding: 40px; text-align: center; }
            .error { color: #e53e3e; }
          </style>
        </head>
        <body>
          <h1 class="error">Error Loading Profile</h1>
          <p>An error occurred while loading the agent profile.</p>
          <p><a href="https://astrasync.ai">Return to AstraSync</a></p>
        </body>
      </html>
    `);
  }
});

// List recent agents
app.get('/v1/agents/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const query = `
      SELECT id, status, trust_score, registered_at, agent_data
      FROM agents
      ORDER BY registered_at DESC
      LIMIT $1
    `;
    
    const result = await pool.query(query, [limit]);
    
    res.json({
      agents: result.rows.map(agent => ({
        agentId: agent.id,
        name: agent.agent_data.name,
        owner: agent.agent_data.owner,
        status: agent.status,
        trustScore: agent.trust_score,
        registeredAt: agent.registered_at,
        profileUrl: `https://astrasync-api-production.up.railway.app/profile/${agent.id}`
      })),
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('Recent agents error:', error);
    res.status(500).json({
      error: 'Failed to retrieve recent agents',
      message: 'An error occurred while fetching recent agents'
    });
  }
});

// Stats endpoint
app.get('/v1/stats', async (req, res) => {
  try {
    const totalQuery = 'SELECT COUNT(*) as total FROM agents';
    const todayQuery = 'SELECT COUNT(*) as today FROM agents WHERE registered_at >= CURRENT_DATE';
    
    const [totalResult, todayResult] = await Promise.all([
      pool.query(totalQuery),
      pool.query(todayQuery)
    ]);
    
    res.json({
      totalAgents: parseInt(totalResult.rows[0].total),
      registeredToday: parseInt(todayResult.rows[0].today),
      blockchainPending: parseInt(totalResult.rows[0].total), // All are pending in preview
      averageTrustScore: '95%'
    });
    
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      error: 'Failed to retrieve statistics',
      message: 'An error occurred while fetching statistics'
    });
  }
});

// Basic API documentation
app.get('/v1/docs', (req, res) => {
  res.json({
    version: 'v1',
    baseUrl: 'https://astrasync-api-production.up.railway.app',
    endpoints: {
      register: {
        method: 'POST',
        path: '/v1/register',
        description: 'Register a new AI agent',
        body: {
          email: 'string (required)',
          agent: {
            name: 'string (required)',
            description: 'string',
            owner: 'string (required)',
            capabilities: 'array of strings',
            version: 'string'
          }
        }
      },
      verify: {
        method: 'GET',
        path: '/v1/verify/:agentId',
        description: 'Verify an agent exists'
      },
      details: {
        method: 'GET',
        path: '/v1/agent/:agentId?email=xxx',
        description: 'Get full agent details (requires email)'
      },
      profile: {
        method: 'GET',
        path: '/profile/:agentId',
        description: 'View agent profile page (HTML)'
      },
      recent: {
        method: 'GET',
        path: '/v1/agents/recent?limit=10',
        description: 'List recently registered agents'
      },
      stats: {
        method: 'GET',
        path: '/v1/stats',
        description: 'Get system statistics'
      }
    }
  });
});

// Log attempt endpoint (for customer intelligence)
app.post('/v1/log-attempt', async (req, res) => {
  try {
    const { event, data } = req.body;
    console.log(`[ATTEMPT] ${event}:`, data);
    
    // In production, this would log to a separate analytics table
    res.json({ logged: true });
  } catch (error) {
    console.error('Logging error:', error);
    res.status(500).json({ logged: false });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Endpoint ${req.method} ${req.path} not found`
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing pool');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing pool');
  await pool.end();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`AstraSync API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
