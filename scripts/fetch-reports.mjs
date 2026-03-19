#!/usr/bin/env node
/**
 * Fetch Reports from Convex and generate REPORTS.md
 * 
 * Usage: node scripts/fetch-reports.js
 * 
 * Environment Variables:
 *   CONVEX_URL - Your Convex deployment URL
 *   CONVEX_ADMIN_TOKEN - Admin session token for querying reports
 */

import { writeFileSync } from 'fs';

const CONVEX_URL = process.env.CONVEX_URL || 'https://oceanic-barracuda-40.convex.cloud';
const CONVEX_ADMIN_TOKEN = process.env.CONVEX_ADMIN_TOKEN;

async function convexQuery(queryName, queryArgs = {}) {
  const response = await fetch(`${CONVEX_URL}/api/getReports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(CONVEX_ADMIN_TOKEN && { 'Authorization': `Bearer ${CONVEX_ADMIN_TOKEN}` }),
    },
    body: JSON.stringify({
      queries: { getReports: { name: queryName, args: queryArgs } },
      args: {},
    }),
  });

  if (!response.ok) {
    throw new Error(`Convex API error: ${response.status}`);
  }

  return response.json();
}

async function fetchReports() {
  console.log('Fetching reports from Convex...');
  
  let reports = [];
  
  try {
    // Try to fetch using the REST API
    const response = await fetch(`${CONVEX_URL}/api/getReports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(CONVEX_ADMIN_TOKEN && { 'Authorization': `Bearer ${CONVEX_ADMIN_TOKEN}` }),
      },
      body: JSON.stringify({
        queries: {},
        args: {},
      }),
    });

    if (response.ok) {
      const data = await response.json();
      reports = data.reports || [];
      console.log(`Found ${reports.length} reports from REST API`);
    }
  } catch (err) {
    console.log('REST API not available, trying alternative method...');
  }

  // Generate markdown
  const now = new Date();
  const dateStr = now.toISOString().replace('T', ' ').substring(0, 19);
  
  let markdown = `# Bug Reports\n\n`;
  markdown += `> **Generated:** ${dateStr}\n`;
  markdown += `> **Source:** [Convex Dashboard](https://dashboard.convex.dev)\n\n`;
  markdown += `---\n\n`;

  if (reports.length === 0) {
    markdown += `## No Reports Found\n\n`;
    markdown += `No bug reports have been submitted yet.\n\n`;
    markdown += `### Submit a Report\n\n`;
    markdown += `Users can submit reports using the \`!report [message]\` command in the chat.\n\n`;
  } else {
    // Group by status
    const pending = reports.filter(r => r.status === 'pending');
    const reviewed = reports.filter(r => r.status === 'reviewed');
    const resolved = reports.filter(r => r.status === 'resolved');

    if (pending.length > 0) {
      markdown += `## Pending Reports (${pending.length})\n\n`;
      pending.forEach((report, i) => {
        const date = new Date(report.createdAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        markdown += `### ${i + 1}. ${report.username}\n\n`;
        markdown += `> ${report.message}\n\n`;
        markdown += `- **Date:** ${date}\n`;
        markdown += `- **Status:** ${report.status}\n`;
        markdown += `- **ID:** \`${report._id || report.id}\`\n\n`;
      });
    }

    if (reviewed.length > 0) {
      markdown += `## In Review (${reviewed.length})\n\n`;
      reviewed.forEach((report, i) => {
        markdown += `- [ ] ${report.username}: "${report.message.substring(0, 100)}..."\n`;
      });
      markdown += `\n`;
    }

    if (resolved.length > 0) {
      markdown += `## Resolved (${resolved.length})\n\n`;
      resolved.slice(0, 5).forEach(report => {
        markdown += `- [x] ${report.username}: "${report.message.substring(0, 80)}..."\n`;
      });
      if (resolved.length > 5) {
        markdown += `\n*... and ${resolved.length - 5} more*\n`;
      }
      markdown += `\n`;
    }
  }

  markdown += `---\n\n`;
  markdown += `## How to Use This Report\n\n`;
  markdown += `### For Users\n\n`;
  markdown += `Submit a bug report directly in chat:\n`;
  markdown += `\`\`\`\n`;
  markdown += `!report Describe your issue here...\n`;
  markdown += `\`\`\`\n\n`;
  markdown += `### For Developers\n\n`;
  markdown += `To mark a report as resolved:\n`;
  markdown += `\`\`\`bash\n`;
  markdown += `npx convex run users.resolveReport --arg '{"reportId": "xxx", "status": "resolved"}'\n`;
  markdown += `\`\`\`\n\n`;

  markdown += `### Manual Convex Queries\n\n`;
  markdown += `\`\`\`bash\n`;
  markdown += `# View all reports\n`;
  markdown += `npx convex run users.getReports\n\n`;
  markdown += `# View pending reports only\n`;
  markdown += `npx convex data\n`;
  markdown += `# Then query: db.query("reports").filter(q => q.eq(q.field("status"), "pending"))\n`;
  markdown += `\`\`\`\n`;

  // Write to REPORTS.md
  writeFileSync('REPORTS.md', markdown);
  console.log(`\nReports written to REPORTS.md`);
  console.log(`Total reports: ${reports.length}`);
  console.log(`\nTo update with real data, run with CONVEX_ADMIN_TOKEN set.`);
}

fetchReports().catch(err => {
  console.error('Error:', err.message);
  // Generate empty report on error
  writeFileSync('REPORTS.md', `# Bug Reports\n\n> Generated: ${new Date().toISOString()}\n\nNo reports available.\n`);
  process.exit(1);
});
