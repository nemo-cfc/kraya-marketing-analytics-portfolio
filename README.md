# CRM Marketing Analytics Portfolio

A standalone, sanitised extraction of CRM attribution and lead-quality reporting logic developed for a marketing analytics system. It demonstrates how acquisition source information can be connected to CRM funnel stages and channel-level reporting.

## Capabilities

- Parse acquisition URLs for UTM fields and advertising identifiers.
- Classify channels with fallbacks for source labels.
- Enrich CRM leads with qualification, pipeline and conversion-status information.
- Aggregate channel-level lead volume and quality metrics.
- Filter reporting windows using India Standard Time dates.

## Run the synthetic example

Requires Node.js and npm.

```sh
npm install
npm run demo
```

The example uses fictional records and example.com URLs. No credentials, live integrations, customer records, sales-call transcripts, internal documentation or original Git history are included.

## Project structure

- `src/attribution.ts`: source parsing, channel classification and lead enrichment.
- `src/aggregations.ts`: channel matrices, stage summaries and dashboard aggregates.
- `src/dates.ts`: IST date handling.
- `demo.cjs`: synthetic example and basic assertions.

## Attribution scope

This extraction classifies leads using available source and UTM fields. It does not implement fractional credit across an entire customer journey or prove causal advertising lift. The original internal dashboard and its database integrations remain private.

## Professional relevance

Demonstrates marketing measurement, CRM integration design, lead-quality analysis and reporting automation. Business results are described separately in the CV; this source repository does not independently verify revenue or ROAS claims.

## Data handling

Use synthetic data for public demonstrations. Connect real CRM data only in a private deployment with appropriate authentication and permissions. The `private` package setting prevents accidental npm publication; it does not restrict this GitHub portfolio.
