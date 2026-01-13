#!/usr/bin/env node
/**
 * Mock Atlas Coin API Server
 *
 * This is a minimal mock implementation of the Atlas Coin bounty API
 * that accepts agent submissions and returns success responses.
 *
 * Port: 4000 (default)
 *
 * Endpoints:
 * - GET /api/bounties?status=open - List available bounties
 * - GET /api/bounties/:id - Get bounty details (for polling verification)
 * - POST /api/bounties/:id/submit - Submit evidence for a bounty
 * - POST /api/bounties/:id/verify - Verify bounty evidence
 */

import http from 'http';

const PORT = 4000;
const AUTH_TOKEN = process.env.ATLAS_COIN_AUTH_TOKEN || 'test-token';

// In-memory bounty storage
const bounties = new Map();

// Sample bounties that match the control-plane tasks
const sampleBounties = [
  {
    id: 'test-real',
    type: 'code_fix',
    description: 'Test bounty for real competition',
    status: 'open',
    reward: 100,
    poster: 'test-user',
    created_at: new Date().toISOString()
  },
  {
    id: 'test-final',
    type: 'code_fix',
    description: 'Test final bounty',
    status: 'open',
    reward: 100,
    poster: 'test-user',
    created_at: new Date().toISOString()
  },
  {
    id: 'test-debug',
    type: 'code_fix',
    description: 'Test debug bounty',
    status: 'open',
    reward: 100,
    poster: 'test-user',
    created_at: new Date().toISOString()
  }
];

// Initialize bounties
sampleBounties.forEach(b => bounties.set(b.id, { ...b, submissions: [] }));

function checkAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return false;
  const token = authHeader.replace('Bearer ', '');
  return token === AUTH_TOKEN;
}

function sendJSON(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data, null, 2));
}

const server = http.createServer((req, res) => {
  // CORS handling
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  // Parse URL
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  console.log(`${req.method} ${path}`);

  // GET /api/bounties - List bounties
  if (path === '/api/bounties' && req.method === 'GET') {
    const status = url.searchParams.get('status') || 'all';
    const filtered = Array.from(bounties.values())
      .filter(b => status === 'all' || b.status === status);

    sendJSON(res, filtered);
    return;
  }

  // GET /api/bounties/:id - Get bounty details (for polling verification status)
  const getBountyMatch = path.match(/^\/api\/bounties\/([^/]+)$/);
  if (getBountyMatch && req.method === 'GET') {
    const bountyId = decodeURIComponent(getBountyMatch[1]);
    const bounty = bounties.get(bountyId);

    if (!bounty) {
      sendJSON(res, { error: 'Bounty not found' }, 404);
      return;
    }

    // Return bounty with current status
    sendJSON(res, bounty);
    return;
  }

  // POST /api/bounties/:id/submit - Submit evidence
  const submitMatch = path.match(/^\/api\/bounties\/([^/]+)\/submit$/);
  if (submitMatch && req.method === 'POST') {
    if (!checkAuth(req)) {
      sendJSON(res, { error: 'Unauthorized' }, 401);
      return;
    }

    const bountyId = decodeURIComponent(submitMatch[1]);
    const bounty = bounties.get(bountyId);

    if (!bounty) {
      sendJSON(res, { error: 'Bounty not found' }, 404);
      return;
    }

    // Read request body
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const submission = JSON.parse(body);

        // Store submission
        bounty.submissions.push({
          claimant: submission.claimant || 'unknown',
          stake: submission.stakeAmount || '0',
          evidence: submission.evidence || {},
          timestamp: new Date().toISOString()
        });

        // Mark bounty as verified (for immediate polling success)
        bounty.verified = true;
        bounty.status = 'verified';

        console.log(`Submission received for bounty ${bountyId} from ${submission.claimant || 'unknown'}`);

        // Return success response
        sendJSON(res, {
          id: bountyId,
          status: 'verified',
          verified: true,
          claimant: submission.claimant || 'unknown',
          stakeAmount: submission.stakeAmount || '0',
          settled: false,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        console.error('Error parsing submission:', e);
        sendJSON(res, { error: 'Invalid JSON' }, 400);
      }
    });
    return;
  }

  // POST /api/bounties/:id/verify - Verify evidence
  const verifyMatch = path.match(/^\/api\/bounties\/([^/]+)\/verify$/);
  if (verifyMatch && req.method === 'POST') {
    if (!checkAuth(req)) {
      sendJSON(res, { error: 'Unauthorized' }, 401);
      return;
    }

    const bountyId = decodeURIComponent(verifyMatch[1]);
    const bounty = bounties.get(bountyId);

    if (!bounty) {
      sendJSON(res, { error: 'Bounty not found' }, 404);
      return;
    }

    // Mock verification - always passes
    sendJSON(res, {
      passed: true,
      details: ['Evidence verified successfully']
    });
    return;
  }

  // 404 for unknown routes
  sendJSON(res, { error: 'Not found' }, 404);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock Atlas Coin API listening on http://127.0.0.1:${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  GET  /api/bounties`);
  console.log(`  GET  /api/bounties/:id`);
  console.log(`  POST /api/bounties/:id/submit`);
  console.log(`  POST /api/bounties/:id/verify`);
  console.log(``);
  console.log(`Started at: ${new Date().toISOString()}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\nShutting down mock API...');
  server.close(() => {
    console.log('Mock API stopped');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nShutting down mock API...');
  server.close(() => {
    console.log('Mock API stopped');
    process.exit(0);
  });
});
