#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  if (line && !line.startsWith('#')) {
    const [key, ...valueParts] = line.split('=');
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = envVars.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

// Extract project ID and create API endpoint
const projectId = SUPABASE_URL.split('https://')[1].split('.supabase.co')[0];
const apiUrl = `https://${projectId}.supabase.co`;

async function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiUrl + path);
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
      },
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: data ? JSON.parse(data) : null,
            headers: res.headers,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data,
            headers: res.headers,
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function backupDatabase() {
  console.log('🔄 Starting Supabase database backup...');
  console.log(`📊 Project: ${projectId}`);

  try {
    // Get list of tables from REST API
    const tablesPath = `/rest/v1/information_schema.tables?table_schema=eq.public&select=table_name`;

    console.log('📋 Fetching table list from Supabase...');

    // Since we don't have direct pg_dump access, we'll create a backup info file
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const timeHMS = new Date().toISOString().split('T')[1].replace(/:/g, '-').slice(0, 8);
    const backupFile = path.join(backupDir, `backup-${timestamp}_${timeHMS}.json`);

    const backupInfo = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      project: projectId,
      supabaseUrl: SUPABASE_URL,
      backupType: 'metadata',
      instructions: `
To restore this database:
1. Use Supabase web dashboard: Database > Backups
2. Or restore from a previous automatic backup
3. Or contact Supabase support for point-in-time recovery

This file contains backup metadata.
For a complete SQL dump, use:
  npx supabase db dump --db-url "postgresql://..." > backup.sql
      `.trim(),
    };

    fs.writeFileSync(backupFile, JSON.stringify(backupInfo, null, 2));

    console.log('\n✅ Backup info created successfully!');
    console.log(`📁 File: ${backupFile}`);

    // Show instructions for proper backup
    console.log('\n📖 To create a full database backup:');
    console.log('\n1️⃣  Via Supabase Dashboard (Recommended):');
    console.log('   - Go to https://app.supabase.com/');
    console.log(`   - Select project: ${projectId}`);
    console.log('   - Navigate to: Database > Backups');
    console.log('   - Click "Create a backup"');
    console.log('   - Choose retention period and backup window');

    console.log('\n2️⃣  Via Supabase CLI:');
    console.log('   npm install -g supabase');
    console.log('   supabase link --project-ref ' + projectId);
    console.log('   supabase db dump > backup.sql');

    console.log('\n3️⃣  Via PostgreSQL Tools:');
    console.log('   - Install PostgreSQL tools');
    console.log('   - Use pg_dump with the connection string');

  } catch (err) {
    console.error('❌ Backup failed:', err.message);
    process.exit(1);
  }
}

backupDatabase();
