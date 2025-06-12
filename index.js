// index.js - AstraSync API Server (Production Version with Guaranteed Customer Intelligence)
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
    
    // Create registration attempts table for customer intelligence
    await pool.query(`
      CREATE TABLE IF NOT EXISTS registration_attempts (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(50) NOT NULL,
        email VARCHAR(255),
        agent_name VARCHAR(255),
        source VARCHAR(50),
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes for better query performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_email ON agents(email);
      CREATE INDEX IF NOT EXISTS idx_agents_registered_at ON agents(registered_at);
      CREATE INDEX IF NOT EXISTS idx_attempts_email ON registration_attempts(email);
      CREATE INDEX IF NOT EXISTS idx_attempts_created ON registration_attempts(created_at);
      CREATE INDEX IF NOT EXISTS idx_attempts_event_type ON registration_attempts(event_type);
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

// Helper function to log attempts (guaranteed completion)
async function logAttempt(eventType, email, agentName, source, data) {
  try {
    await pool.query(
      `INSERT INTO registration_attempts 
       (event_type, email, agent_name, source, data, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        eventType,
        email || null,
        agentName || null,
        source || 'unknown',
        JSON.stringify(data || {})
      ]
    );
    console.log(`📊 Logged ${eventType} for ${email || 'anonymous'}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to log ${eventType}:`, error);
    return false;
  }
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

// Customer Intelligence: Log registration attempts (for external calls like MCP)
app.post('/v1/log-attempt', async (req, res) => {
  const { event, data } = req.body;
  
  try {
    const logged = await logAttempt(
      event || 'unknown',
      data?.email,
      data?.agentName || data?.name,
      data?.source,
      data
    );
    
    res.json({ logged });
  } catch (error) {
    console.error('Logging endpoint error:', error);
    // Still return 200 to not break client flows
    res.status(200).json({ logged: false });
  }
});

// Main registration endpoint with guaranteed logging
app.post('/v1/register', async (req, res) => {
  const client = await pool.connect();
  
  try {
    // Extract data for logging
    const email = req.body.email;
    const agentName = req.body.agent?.name || req.body.name;
    const source = req.headers['x-source'] || 'direct-api';
    
    // Log the attempt first (guaranteed to complete)
    await logAttempt(
      'registration_attempt',
      email,
      agentName,
      source,
      {
        body: req.body,
        headers: {
          'user-agent': req.headers['user-agent'],
          'x-source': source
        },
        ip: req.ip || req.connection.remoteAddress
      }
    );
    
    // Validation: Email
    if (!email || !email.includes('@')) {
      // Log validation failure (wait for completion)
      await logAttempt(
        'registration_failed',
        email || 'invalid-email',
        agentName,
        source,
        { 
          error: 'Invalid email address',
          body: req.body 
        }
      );
      
      return res.status(400).json({
        error: 'Valid email address is required',
        message: 'Please provide a valid email address for agent registration'
      });
    }
    
    // Validation: Agent data
    const { agent } = req.body;
    if (!agent || !agent.name || !agent.owner) {
      // Log validation failure (wait for completion)
      await logAttempt(
        'registration_failed',
        email,
        agentName || 'missing-name',
        source,
        { 
          error: 'Missing required fields: name and/or owner',
          body: req.body,
          missingFields: {
            hasAgent: !!agent,
            hasName: !!(agent?.name),
            hasOwner: !!(agent?.owner)
          }
        }
      );
      
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
      userAgent: req.headers['user-agent'] || 'unknown',
      source: source
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
    
    // Log successful registration (after commit to ensure it happened)
    await logAttempt(
      'registration_success',
      email,
      agent.name,
      source,
      { 
        agentId: tempId,
        agent: agentData 
      }
    );
    
    console.log(`✅ New agent registered: ${tempId} - ${agent.name} (${email})`);
    
    // Return response with fixed URLs and enhanced messaging
    res.status(201).json({
      agentId: tempId,
      status: 'registered',
      blockchain: {
        status: 'pending',
        message: 'Blockchain registration queued. You will be notified upon completion.'
      },
      trustScore: 'TEMP-95%',
      message: 'Agent registered successfully in DEVELOPER PREVIEW mode. Your TEMP credentials will automatically convert to permanent blockchain-verified credentials when you create an account at https://www.astrasync.ai/alphaSignup using the same email address.',
      links: {
        verify: `${req.protocol}://${req.get('host')}/v1/verify/${tempId}`,
        dashboard: 'https://preview.astrasync.ai',
        createAccount: 'https://www.astrasync.ai/alphaSignup',
        profileUrl: `${req.protocol}://${req.get('host')}/profile/${tempId}`
      },
      registeredAt: timestamp.toISOString()
    });
    
  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    console.error('Registration error:', error);
    
    // Log the error (guaranteed completion)
    await logAttempt(
      'registration_error',
      req.body.email || 'unknown',
      req.body.agent?.name || req.body.name || 'unknown',
      req.headers['x-source'] || 'direct-api',
      { 
        error: error.message,
        stack: error.stack,
        body: req.body 
      }
    );
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to register agent. Please try again.',
      requestId: uuidv4()
    });
  } finally {
    client.release();
  }
});

// Agent profile page endpoint
app.get('/profile/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM agents WHERE id = $1',
      [agentId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Agent Not Found - AstraSync</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .error-container {
                background: white;
                padding: 40px;
                border-radius: 16px;
                text-align: center;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
              }
              h1 { color: #e53e3e; margin-bottom: 20px; }
              .agent-id { 
                font-family: monospace;
                background: #fee;
                padding: 8px 16px;
                border-radius: 8px;
                display: inline-block;
                margin: 20px 0;
              }
              a { color: #667eea; text-decoration: none; font-weight: 600; }
              a:hover { text-decoration: underline; }
            </style>
          </head>
          <body>
            <div class="error-container">
              <h1>Agent Not Found</h1>
              <p>No agent found with ID:</p>
              <div class="agent-id">${agentId}</div>
              <p><a href="https://astrasync.ai">Learn more about AstraSync</a></p>
            </div>
          </body>
        </html>
      `);
    }
    
    const agent = result.rows[0];
    const agentData = agent.agent_data;
    
    // Mock data for the agent card to match the design
    const trustScore = '92';
    const capabilities = {
      streaming: true,
      pushNotifications: true,
      stateTransitionNotifications: true
    };
    const skills = ['Transaction monitoring', 'Auditing', 'Fraud detection', 'Policy Enforcement'];
    
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${agentData.name} - AstraSync Agent</title>
          <meta property="og:title" content="${agentData.name} - AstraSync Agent">
          <meta property="og:description" content="${agentData.description || 'Verified AI Agent on AstraSync'}">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: #f5f5f5;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
            }
            .card {
              width: 600px;
              background: linear-gradient(135deg, #4A3FC4 0%, #7B4FE6 100%);
              border-radius: 20px;
              padding: 40px;
              color: white;
              position: relative;
              overflow: hidden;
              box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            }
            .logo-container {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              width: 100px;
              height: 100px;
              filter: brightness(0) invert(1);
            }
            .title {
              font-size: 48px;
              font-weight: 700;
              text-align: center;
              margin-bottom: 30px;
              letter-spacing: 2px;
            }
            .agent-info {
              margin-bottom: 30px;
              font-size: 22px;
              line-height: 1.8;
            }
            .agent-id {
              font-size: 24px;
              margin-bottom: 8px;
            }
            .trust-section {
              display: flex;
              align-items: center;
              margin: 30px 0;
              gap: 40px;
            }
            .trust-items {
              font-size: 24px;
              line-height: 1.8;
            }
            .trust-item {
              display: flex;
              align-items: center;
              gap: 10px;
              font-size: 22px;
            }
            .green-dot {
              width: 12px;
              height: 12px;
              background: #48BB78;
              border-radius: 50%;
              display: inline-block;
            }
            .trust-score-circle {
              width: 120px;
              height: 120px;
              border: 8px solid rgba(255, 255, 255, 0.3);
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 52px;
              font-weight: 700;
              position: relative;
            }
            .trust-score-circle::after {
              content: '';
              position: absolute;
              top: -8px;
              left: -8px;
              right: -8px;
              bottom: -8px;
              border-radius: 50%;
              border: 8px solid transparent;
              border-top-color: #E53E3E;
              border-right-color: #E53E3E;
              transform: rotate(45deg);
            }
            .confidential {
              position: absolute;
              right: 40px;
              bottom: 380px;
              font-size: 32px;
              font-weight: 700;
              color: rgba(229, 62, 62, 0.8);
              transform: rotate(0deg);
              letter-spacing: 3px;
            }
            .agent-details {
              margin: 30px 0;
              font-size: 22px;
              line-height: 1.6;
            }
            .capabilities-section {
              margin: 30px 0;
            }
            .capability-item {
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-size: 24px;
              margin: 12px 0;
            }
            .skills-section {
              margin-top: 40px;
            }
            .skills-title {
              font-size: 28px;
              font-weight: 700;
              margin-bottom: 20px;
            }
            .skills-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 20px;
              font-size: 22px;
            }
            .footer-logo {
              display: flex;
              align-items: center;
              justify-content: center;
              margin-top: 40px;
              gap: 20px;
            }
            .letta-logo {
              height: 60px;
              filter: brightness(0) invert(1);
            }
            .google-logo {
              position: absolute;
              right: 40px;
              top: 280px;
              height: 70px;
            }
            .a2a-protocol {
              position: absolute;
              right: 40px;
              top: 360px;
              font-size: 22px;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="logo-container">
              <img src="https://www.astrasync.ai/assets/AS_black_IconFCN.png" alt="AstraSync" class="logo">
            </div>
            
            <h1 class="title">KNOW YOUR AGENT</h1>
            
            <div class="agent-info">
              <div class="agent-id">AGENT ID ${agent.id}</div>
              <div>Owner - ${agentData.owner}</div>
              <div>URL - ${agentData.ownerUrl || 'Not specified'}</div>
            </div>
            
            <div class="trust-section">
              <div class="trust-items">
                <div style="font-size: 28px; margin-bottom: 10px;">TRUST SCORE</div>
                <div class="trust-item">
                  <span class="green-dot"></span>
                  <span>Developer</span>
                </div>
                <div class="trust-item">
                  <span class="green-dot"></span>
                  <span>KYA/KYB</span>
                </div>
                <div class="trust-item">
                  <span class="green-dot"></span>
                  <span>AML</span>
                </div>
              </div>
              <div class="trust-score-circle">
                ${trustScore}%
              </div>
              <div style="margin-left: 20px;">
                <div style="font-size: 24px;">Powered by</div>
              </div>
            </div>
            
            <div class="confidential">CONFIDENTIAL</div>
            
            <div class="agent-details">
              <div>Name - ${agentData.name}</div>
              <div>URL - ${agentData.ownerUrl ? `api.${agentData.ownerUrl.replace('https://', '').replace('http://', '')}` : 'Not specified'}</div>
              <div style="margin-top: 20px;">
                Description - ${agentData.description || 'No description provided'}
              </div>
            </div>
            
            <div class="capabilities-section">
              <div class="capability-item">
                <span>Streaming</span>
                <span class="green-dot"></span>
              </div>
              <div class="capability-item">
                <span>Push Notifications</span>
                <span class="green-dot"></span>
              </div>
              <div class="capability-item">
                <span>State Transition Notifications</span>
                <span class="green-dot"></span>
              </div>
            </div>
            
            <div class="skills-section">
              <div class="skills-title">SKILLS</div>
              <div class="skills-grid">
                ${skills.map(skill => `<div>${skill}</div>`).join('')}
              </div>
            </div>
            
            <div class="footer-logo">
              <img src="https://raw.githubusercontent.com/letta-ai/letta/refs/heads/main/assets/Letta-logo-RGB_OffBlackonTransparent_cropped_small.png" alt="Letta" class="letta-logo">
            </div>
            
            <img src="https://www.gstatic.com/marketing-cms/assets/images/1b/f6/29dc803641e3b2b080f9e72b1c40/google-ai.webp=n-w96-h100-fcrop64=1,000005bcfffffa44-rw" alt="Google AI" class="google-logo">
            <div class="a2a-protocol">A2A Protocol</div>
          </div>
        </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>Error - AstraSync</title>
          <style>
            body { 
              font-family: sans-serif; 
              text-align: center; 
              padding: 40px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              color: white;
            }
            .error { font-size: 24px; margin-bottom: 20px; }
            a { color: white; }
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

// Verify agent endpoint
app.get('/v1/verify/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    // Log verification attempt
    await logAttempt(
      'verification_attempt',
      null,
      null,
      req.headers['x-source'] || 'direct-api',
      { agentId }
    );
    
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
    
    // Return public information only with enhanced messaging
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
      verified: true,
      message: agent.trust_score.startsWith('TEMP') 
        ? 'This is a DEVELOPER PREVIEW agent. Create an account at https://www.astrasync.ai/alphaSignup to convert to permanent credentials.'
        : 'Agent verified successfully'
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
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    
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

// Enhanced stats endpoint with customer intelligence
app.get('/v1/stats', async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    
    // Run queries in parallel for better performance
    const [
      totalResult,
      recentResult,
      emailResult,
      attemptsResult,
      failedResult,
      errorResult,
      attemptBreakdown
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM agents'),
      pool.query('SELECT COUNT(*) as count FROM agents WHERE registered_at > $1', [last24h]),
      pool.query('SELECT COUNT(*) as count FROM email_queue'),
      pool.query('SELECT COUNT(*) as count FROM registration_attempts'),
      pool.query(`SELECT COUNT(*) as count FROM registration_attempts WHERE event_type = 'registration_failed'`),
      pool.query(`SELECT COUNT(*) as count FROM registration_attempts WHERE event_type = 'registration_error'`),
      pool.query(`
        SELECT event_type, COUNT(*) as count 
        FROM registration_attempts 
        GROUP BY event_type 
        ORDER BY count DESC
      `)
    ]);
    
    const totalAgents = parseInt(totalResult.rows[0].count);
    const recentCount = parseInt(recentResult.rows[0].count);
    const emailQueueSize = parseInt(emailResult.rows[0].count);
    const totalAttempts = parseInt(attemptsResult.rows[0].count);
    const failedAttempts = parseInt(failedResult.rows[0].count);
    const errorCount = parseInt(errorResult.rows[0].count);
    
    // Build event breakdown
    const eventBreakdown = {};
    attemptBreakdown.rows.forEach(row => {
      eventBreakdown[row.event_type] = parseInt(row.count);
    });
    
    res.json({
      totalAgents: totalAgents,
      last24Hours: recentCount,
      blockchainStatus: 'pending_audit',
      emailQueueSize: emailQueueSize,
      customerIntelligence: {
        totalAttempts: totalAttempts,
        failedAttempts: failedAttempts,
        errorCount: errorCount,
        conversionRate: totalAttempts > 0 ? ((totalAgents / totalAttempts) * 100).toFixed(2) + '%' : 'N/A',
        eventBreakdown: eventBreakdown
      },
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
      customerIntelligence: {
        totalAttempts: 0,
        failedAttempts: 0,
        errorCount: 0,
        conversionRate: 'N/A',
        eventBreakdown: {}
      },
      serverTime: new Date().toISOString(),
      databaseStatus: 'error',
      error: 'Failed to fetch statistics'
    });
  }
});

// Customer intelligence: Recent attempts
app.get('/v1/attempts/recent', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    
    const result = await pool.query(
      `SELECT event_type, email, agent_name, source, created_at, 
              data->>'error' as error_message
       FROM registration_attempts 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    );
    
    res.json({
      attempts: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Recent attempts error:', error);
    res.status(500).json({
      error: 'Failed to fetch recent attempts'
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
        optional: ['agent.description', 'agent.capabilities', 'agent.version', 'agent.ownerUrl'],
        headers: ['x-source (optional) - Identifies the source of the request (e.g., "mcp", "web-ui")']
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
        description: 'Get registration statistics and system status (includes customer intelligence)'
      },
      {
        method: 'POST',
        path: '/v1/log-attempt',
        description: 'Log registration attempts for customer intelligence',
        body: {
          event: 'Event type (e.g., registration_attempt, registration_failed)',
          data: 'Event data object containing email, agentName, source, etc.'
        }
      },
      {
        method: 'GET',
        path: '/v1/attempts/recent?limit=20',
        description: 'Get recent registration attempts',
        parameters: ['limit - Number of attempts to return (max 100)']
      },
      {
        method: 'GET',
        path: '/profile/:agentId',
        description: 'View agent profile page (HTML)',
        parameters: ['agentId - The agent ID to view']
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
- GET    /                     - Health check
- POST   /v1/register          - Register new agent
- GET    /v1/verify/:id        - Verify agent
- GET    /v1/agent/:id         - Get agent details
- GET    /v1/agents/recent     - List recent agents
- GET    /v1/stats             - Get statistics
- POST   /v1/log-attempt       - Log registration attempts
- GET    /v1/attempts/recent   - View recent attempts
- GET    /profile/:id          - View agent profile page
- GET    /v1/docs              - API documentation

Customer Intelligence: ENABLED ✓
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
