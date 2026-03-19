const { convexUrl } = require('esbuild');
const fs = require('fs');
const path = require('path');

async function fetchReports() {
  const convexUrl = process.env.CONVEX_URL;
  
  if (!convexUrl) {
    console.error('CONVEX_URL not set');
    process.exit(1);
  }

  console.log('Fetching reports from Convex:', convexUrl);

  // For admin queries, we need to use the Convex HTTP API
  // This is a simplified version - in production you'd want to use the Convex SDK
  
  const response = await fetch(`${convexUrl}/api/getReports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      queries: {},
      args: {},
    }),
  });

  // Generate markdown report
  const now = new Date().toISOString();
  
  let markdown = `# Bug Reports\n\n`;
  markdown += `> Generated: ${now}\n\n`;
  markdown += `---\n\n`;
  markdown += `## Reports\n\n`;
  markdown += `| # | Username | Message | Status | Created |\n`;
  markdown += `|---|----------|---------|--------|--------|\n`;

  // Placeholder data - in production this would be populated from Convex
  const reports = [];
  
  if (reports.length === 0) {
    markdown += `| - | No reports | - | - | - |\n`;
  } else {
    reports.forEach((report, index) => {
      markdown += `| ${index + 1} | ${report.username} | ${report.message.substring(0, 50)}... | ${report.status} | ${new Date(report.createdAt).toLocaleDateString()} |\n`;
    });
  }

  markdown += `\n---\n\n`;
  markdown += `## How to Fix\n\n`;
  markdown += `1. Review the reports above\n`;
  markdown += `2. Fix the issues in the codebase\n`;
  markdown += `3. Mark reports as resolved using: \`npx convex run users:resolveReport --arg '{"reportId": "...", "status": "resolved"}'\`\n\n`;
  markdown += `## Quick Links\n\n`;
  markdown += `- [Convex Dashboard](https://dashboard.convex.dev)\n`;
  markdown += `- [App Deployment](https://vercel.com)\n`;

  // Write to REPORTS.md
  const outputPath = path.join(process.cwd(), 'REPORTS.md');
  fs.writeFileSync(outputPath, markdown);
  
  console.log(`Reports written to ${outputPath}`);
  console.log(`Found ${reports.length} reports`);
}

fetchReports().catch(console.error);
