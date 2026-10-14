/**
 * Aggregation helpers used by the MCP tools.
 * Channel matrix, marketing dashboard, lead filtering by date.
 *
 * Differences from the MiM project:
 *   - No brand filter (Kraya CRM is single-brand by definition).
 *   - No `meta_sub_channel` split (Kraya hasn't been segmented into Cold CBO
 *     vs Sandbox the way MiM-Essay's Meta Ads were).
 *   - `quality_method_breakdown` is dropped — Kraya quality flags come straight
 *     from a stage→status map, not from `update_history` parsing.
 */
import { enrichLead, isKrayaLead, type KrayaLead, type EnrichedLead } from './attribution';
import { toIstDate } from './dates';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export type DateField = 'created_at' | 'booked_at';

function inRange(dateStr: string, range: DateRange): boolean {
  if (!dateStr) return false;
  const d = toIstDate(dateStr);
  return d >= range.from && d <= range.to;
}

export function filterLeads(
  leads: KrayaLead[],
  range: DateRange,
  dateField: DateField = 'created_at',
): EnrichedLead[] {
  return leads
    .filter(isKrayaLead)
    .map(enrichLead)
    .filter((l) => {
      const dateVal = dateField === 'booked_at' ? l.booked_at : l.created_at;
      return inRange(dateVal, range);
    });
}

export interface ChannelStats {
  channel: string;
  total: number;
  qualified: number;
  valid: number;
  good: number;
  pending: number;
  won: number;
  qualified_rate: number;
  valid_rate: number;
  good_rate: number;
  won_rate: number;
}

function emptyStats(channel: string): ChannelStats {
  return {
    channel,
    total: 0,
    qualified: 0,
    valid: 0,
    good: 0,
    pending: 0,
    won: 0,
    qualified_rate: 0,
    valid_rate: 0,
    good_rate: 0,
    won_rate: 0,
  };
}

function finaliseRates(row: ChannelStats) {
  if (row.total > 0) {
    row.qualified_rate = +((row.qualified / row.total) * 100).toFixed(2);
    row.valid_rate = +((row.valid / row.total) * 100).toFixed(2);
    row.good_rate = +((row.good / row.total) * 100).toFixed(2);
    row.won_rate = +((row.won / row.total) * 100).toFixed(2);
  }
}

export function buildChannelMatrix(leads: EnrichedLead[]): {
  channels: ChannelStats[];
  totals: ChannelStats;
} {
  const byChannel = new Map<string, ChannelStats>();

  for (const lead of leads) {
    const key = lead.channel || 'Others';
    if (!byChannel.has(key)) byChannel.set(key, emptyStats(key));
    const row = byChannel.get(key)!;
    row.total++;
    if (lead.is_qualified) row.qualified++;
    if (lead.is_valid) row.valid++;
    if (lead.is_good) row.good++;
    if (lead.is_pending) row.pending++;
    if (lead.is_won) row.won++;
  }

  const channels = Array.from(byChannel.values()).sort((a, b) => b.total - a.total);
  for (const row of channels) finaliseRates(row);

  const totals: ChannelStats = emptyStats('TOTAL');
  totals.total = leads.length;
  totals.qualified = leads.filter((l) => l.is_qualified).length;
  totals.valid = leads.filter((l) => l.is_valid).length;
  totals.good = leads.filter((l) => l.is_good).length;
  totals.pending = leads.filter((l) => l.is_pending).length;
  totals.won = leads.filter((l) => l.is_won).length;
  finaliseRates(totals);

  return { channels, totals };
}

export interface StageStats {
  stage: string;
  total: number;
}

export function buildStageBreakdown(leads: EnrichedLead[]): StageStats[] {
  const m = new Map<string, number>();
  for (const l of leads) {
    const k = l.stage || 'Unknown';
    m.set(k, (m.get(k) || 0) + 1);
  }
  return Array.from(m.entries())
    .map(([stage, total]) => ({ stage, total }))
    .sort((a, b) => b.total - a.total);
}

export interface DashboardSummary {
  date_range: DateRange;
  date_field: DateField;
  total_leads: number;
  qualified_leads: number;
  good_leads: number;
  pending_leads: number;
  won_leads: number;
  qualified_rate: number;
  good_rate: number;
  won_rate: number;
  channels: ChannelStats[];
  stages: StageStats[];
}

export function buildDashboard(
  allLeads: KrayaLead[],
  range: DateRange,
  dateField: DateField = 'created_at',
): DashboardSummary {
  const enriched = allLeads.map(enrichLead).filter((l) => {
    const dateVal = dateField === 'booked_at' ? l.booked_at : l.created_at;
    return inRange(dateVal, range);
  });

  const matrix = buildChannelMatrix(enriched);
  const stages = buildStageBreakdown(enriched);

  return {
    date_range: range,
    date_field: dateField,
    total_leads: matrix.totals.total,
    qualified_leads: matrix.totals.qualified,
    good_leads: matrix.totals.good,
    pending_leads: matrix.totals.pending,
    won_leads: matrix.totals.won,
    qualified_rate: matrix.totals.qualified_rate,
    good_rate: matrix.totals.good_rate,
    won_rate: matrix.totals.won_rate,
    channels: matrix.channels,
    stages,
  };
}
