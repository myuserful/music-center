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

const projectId = SUPABASE_URL.split('https://')[1].split('.supabase.co')[0];

// Tables to export (based on migrations)
const TABLES = [
  'students', 'teachers', 'lessons', 'payments', 'tasks', 'parent_calls',
  'finance_entries', 'receipts', 'room_hours', 'waiting_list', 'choirs',
  'instruments', 'branches', 'families', 'lesson_billing', 'teacher_payments'
];

async function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + path);
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
      },
      rejectUnauthorized: false,
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: data ? JSON.parse(data) : null,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data,
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function exportDatabase() {
  console.log('🔄 Starting database export...');
  console.log(`📊 Project: ${projectId}`);
  console.log(`📋 Tables to export: ${TABLES.length}`);

  try {
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const timeHMS = new Date().toISOString().split('T')[1].replace(/:/g, '-').slice(0, 8);
    const exportFile = path.join(backupDir, `export-${timestamp}_${timeHMS}.json`);

    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      project: projectId,
      tables: {},
      summary: {
        totalTables: 0,
        totalRecords: 0,
      },
    };

    let totalRecords = 0;
    let successCount = 0;

    for (const table of TABLES) {
      try {
        process.stdout.write(`  📤 Exporting ${table}... `);

        // Try to fetch data from the table
        const response = await makeRequest('GET', `/rest/v1/${table}?limit=10000`);

        if (response.status === 200 && Array.isArray(response.data)) {
          const recordCount = response.data.length;
          exportData.tables[table] = response.data;
          totalRecords += recordCount;
          successCount++;
          console.log(`✅ ${recordCount} records`);
        } else {
          console.log(`⚠️  skipped (status: ${response.status})`);
        }
      } catch (err) {
        console.log(`❌ error: ${err.message}`);
      }
    }

    exportData.summary.totalTables = successCount;
    exportData.summary.totalRecords = totalRecords;

    // Write export file
    fs.writeFileSync(exportFile, JSON.stringify(exportData, null, 2));
    const sizeKb = fs.statSync(exportFile).size / 1024;

    console.log(`\n✅ Database export completed!`);
    console.log(`📁 File: ${exportFile}`);
    console.log(`💾 Size: ${sizeKb.toFixed(2)} KB`);
    console.log(`📊 Tables exported: ${successCount}/${TABLES.length}`);
    console.log(`📈 Total records: ${totalRecords}`);

  } catch (err) {
    console.error('❌ Export failed:', err.message);
    process.exit(1);
  }
}

exportDatabase();
