const { enrichLead } = require('./dist/attribution.js');
const { buildChannelMatrix } = require('./dist/aggregations.js');
const assert = require('node:assert/strict');
// Fictional records only. No names, phone numbers, emails, or customer values.
const leads = [
  { id: 'demo-1', created_at: '2026-01-01T10:00:00Z', stage: {name: 'Lead won'}, attributes: { Source: 'https://example.com/?utm_source=google&utm_medium=cpc&utm_campaign=demo-search' } },
  { id: 'demo-2', created_at: '2026-01-01T11:00:00Z', stage: {name: 'Request Received'}, attributes: { Source: 'https://example.com/?utm_source=meta&utm_medium=paid&utm_campaign=demo-social' } },
];
const enriched = leads.map(enrichLead);
assert.equal(enriched.length, 2);
assert.equal(enriched[0].utm_campaign, 'demo-search');
assert.equal(enriched[1].utm_campaign, 'demo-social');
console.log(JSON.stringify(buildChannelMatrix(enriched), null, 2));
