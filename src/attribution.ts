/**
 * Channel attribution + quality detection for Kraya CRM leads.
 *
 * Kraya leads come from a single CRM (api.kraya-ai.com) — there's no
 * MiM-vs-Kraya brand filter to apply here (unlike the MiM project which has
 * to disambiguate two brands flowing through one endpoint).
 *
 * Channel classification follows the same logic as the amplitude-app:
 *   1. Try to parse the lead's `attributes.Source` URL for UTMs / ad IDs
 *   2. Fall back to the bare `source` slug (website-bac, whatsapp-api, etc.)
 *   3. Quality status is derived from the stage name via a slug→status map
 */

export interface KrayaLead {
  id?: string | number;
  name?: string;
  phone?: string;
  email?: string;
  stage?: { id?: number | string; name?: string; slug?: string } | string;
  stage_id?: number | string;
  stage_updated_at?: string;
  source?: string;
  attributes?: { Source?: string; [k: string]: any };
  created_at?: string;
  updated_at?: string;
  booked_at?: string;
  lead_won_at?: string;
  lead_lost_at?: string;
  pipeline?: { id?: number | string; name?: string } | string;
  pipeline_id?: number | string;
  pipeline_updated_at?: string;
  days_in_pipeline?: number;
  days_in_stage?: number;
  intent_score?: number;
  _pipeline_name?: string;
  _pipeline_id?: number | string;
  [key: string]: any;
}

export interface EnrichedLead {
  id: string | number | undefined;
  name: string;
  phone: string;
  email: string;
  stage: string;
  stage_id: number | string | null;
  stage_updated_at: string;
  channel: string;
  status: string;
  data_source: 'kraya_utm' | 'kraya_source';
  source: string;
  source_url: string;
  created_at: string;
  updated_at: string;
  booked_at: string;
  lead_won_at: string;
  lead_lost_at: string;
  pipeline: string;
  pipeline_id: number | string | null;
  is_qualified: boolean;
  /** Subset of qualified — lead has been handed off to a sales rep pipeline. */
  is_valid: boolean;
  is_good: boolean;
  is_pending: boolean;
  is_won: boolean;
  /** Current stage is a transition stage (Demo Done) AND lead hasn't crossed
   *  into good/won. Drives the "Anticipated CPGL" metric — cost ÷ (good +
   *  transition) — so the efficiency read doesn't lag while reps process demos. */
  is_transition: boolean;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  aid: string;
  caid: string;
  asid: string;
  days_in_pipeline: number;
  days_in_stage: number;
  intent_score: number;
  // Kraya CRM custom fields (`lead.attributes.*`) — populated by ops team
  company_name: string;
  website: string;
  industry: string;
  industry_size: string;
  team_size: string;
  contact_poc: string;
  org_email: string;
  amount_sold: string;
  ad_source: string;
  lead_flow: string;
  using_whatsapp: string;
  valid_till: string;
  notes: string;
  call_book_date: string;
  call_book_time: string;
}

// =====================================================================
// UTM / ad-param parsing
// =====================================================================

interface ParsedUtm {
  utm_source: string;
  utm_medium: string;
  utm_term: string;
  utm_content: string;
  utm_campaign: string;
  placement: string;
  caid: string;
  asid: string;
  aid: string;
  page_location: string;
}

function parseSourceUrl(url: string): ParsedUtm | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    const p = parsed.searchParams;
    const result: ParsedUtm = {
      utm_source: p.get('utm_source') || '',
      utm_medium: p.get('utm_medium') || '',
      utm_term: p.get('utm_term') || '',
      utm_content: p.get('utm_content') || '',
      utm_campaign: p.get('utm_campaign') || '',
      placement: p.get('placement') || '',
      caid: p.get('caid') || '',
      asid: p.get('asid') || '',
      aid: p.get('aid') || '',
      page_location: url.split('?')[0] || '',
    };
    const hasData =
      result.utm_source ||
      result.utm_medium ||
      result.caid ||
      result.asid ||
      result.aid;
    return hasData ? result : null;
  } catch {
    return null;
  }
}

// =====================================================================
// Channel classification
// =====================================================================

/** UTM-driven classifier (same logic as amplitude-app/shared.js). */
function classifyFromUtm(utm: ParsedUtm): string {
  const src = utm.utm_source.toLowerCase().trim();
  const med = utm.utm_medium.toLowerCase().trim();
  const hasAdParams = !!(utm.asid || utm.aid || utm.caid);

  const isMetaSource = ['facebook', 'instagram', 'fb', 'ig', 'meta'].some((s) => src.includes(s));
  const isGoogleSource = ['google', 'adwords'].some((s) => src.includes(s));
  const isPaidMedium = ['cpc', 'paid', 'ppc', 'cpm', 'cpv', 'display', 'social_paid'].some((m) =>
    med.includes(m),
  );

  if (isMetaSource && (isPaidMedium || hasAdParams)) return 'Meta Ads';
  if (isGoogleSource && isPaidMedium) return 'Google Ads';
  if (isGoogleSource) return 'Google Organic';
  if (isMetaSource) return 'Organic Social';
  if (src === 'manychat' || med.includes('manychat')) return 'ManyChat';
  if (src) return 'Other';
  return 'Direct';
}

/** Slug-driven classifier for leads without a UTM-rich source URL. */
function classifyFromSourceSlug(slug: string): string {
  const s = (slug || '').toLowerCase().trim();
  if (!s) return 'Unknown';
  if (s === 'website-bac' || s === 'website-signup') return 'Direct';
  if (s === 'whatsapp-api' || s === 'whatsapp') return 'WhatsApp';
  if (s === 'manychat') return 'ManyChat';
  if (s === 'crm') return 'CRM';
  if (s === 'extension') return 'Extension';
  if (s === 'external-api') return 'External API';
  return 'Other';
}

export function classifyChannel(lead: KrayaLead): {
  channel: string;
  data_source: 'kraya_utm' | 'kraya_source';
  parsed: ParsedUtm | null;
} {
  const sourceUrl = lead.attributes?.Source || lead.source || '';
  const parsed = parseSourceUrl(sourceUrl);
  if (parsed) {
    return { channel: classifyFromUtm(parsed), data_source: 'kraya_utm', parsed };
  }
  const slug = lead.source || '';
  return { channel: classifyFromSourceSlug(slug), data_source: 'kraya_source', parsed: null };
}

// =====================================================================
// Stage / pipeline → quality status (Kraya-specific)
// =====================================================================
//
// Kraya's lead model has TWO kinds of pipelines:
//   - Intake pipelines (Rachna runs these). Stages here are the SDR funnel —
//     leads aren't "valid" until they're handed off to a sales rep.
//   - Sales-rep pipelines. Once a lead is in one of these, it's been claimed
//     by a closer and counts as Valid (and therefore Qualified).
//
// Definitions (per the brand owner):
//   - VALID    = lead currently lives in a sales-rep pipeline.
//   - QUALIFIED = VALID, OR (in an intake pipeline AND stage in
//                  {Rescheduled, Calls Scheduled} → call has been set up but
//                  the rep handover hasn't completed).
//   - GOOD     = current stage is one of: Pressure Sell, Ultra Hot,
//                  Focus Leads, DFY in Progress, Token, Lead Won.
//                  (Spec also says "any lead that ever entered these stages"
//                   — see HISTORY GAP note below.)
//   - WON      = current stage is one of: DFY in Progress, Token, Lead Won.
//                  (Won is a subset of Good.)
//
// HISTORY GAP: Kraya's leads endpoint returns CURRENT stage only. We don't
// fetch per-lead stage history, so a lead that bounced "Pressure Sell →
// Lead Lost" will currently NOT count as good. To capture true history we'd
// need to call Kraya's stage-history endpoint (TBD) and merge. Acceptable
// for now because (a) won/DFY/Token are terminal, never bounced backwards,
// and (b) "good but later lost" is rare in practice.
//
// Pipeline names treated as INTAKE (case-insensitive). Override via env var
// KRAYA_INTAKE_PIPELINES="Leads,Leads Pipeline,Leads Rachna" if the names
// in the live CRM ever change.
const DEFAULT_INTAKE_PIPELINE_NAMES = [
  'leads',
  'leads pipeline',
  'leads rachna',
];

function intakePipelineNames(): Set<string> {
  const env = process.env.KRAYA_INTAKE_PIPELINES;
  const list = env
    ? env.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_INTAKE_PIPELINE_NAMES;
  return new Set(list);
}

const GOOD_STAGES = new Set([
  'pressure sell',
  'ultra hot',
  'ultra-hot',
  'ultra hot lead',
  'focus leads',
  'focus lead',
  'dfy in progress',
  'token',
  'lead won',
  'leads won',
]);

const WON_STAGES = new Set([
  'dfy in progress',
  'token',
  'lead won',
  'leads won',
]);

const INVALID_STAGES = new Set([
  'dnp',
  'deleted',
  'not eligible',
  'not interested',
  'lead lost',
  'leads lost',
]);

/**
 * Within an intake pipeline, only these stages are considered "qualified
 * but not yet validated" — the call has been booked / rescheduled, the
 * lead is real, but a rep hasn't picked them up yet.
 */
const INTAKE_QUALIFIED_STAGES = new Set([
  'rescheduled',
  'calls scheduled',
  'call scheduled',
]);

/**
 * "Transition" stages — the lead is in the funnel mid-step and will resolve
 * to either Good (Pressure Sell / Ultra Hot / Focus Lead / Won / Token) or
 * Invalid (Lead Lost / Nurturing-as-terminal / DNP). Three flavors:
 *   - Pre-demo:     Call Assigned (rep has the lead, demo not yet scheduled)
 *   - Demo pending: Demo Scheduled (demo on the calendar but hasn't happened)
 *   - Post-demo:    Demo Done (demo happened, awaiting next-step classification)
 *
 * Used to compute "Anticipated CPGL": cost ÷ (good + transition) — gives a
 * forward-looking efficiency read that doesn't lag while the sales team
 * processes the queue.
 *
 * Only `is_transition = true` when the CURRENT stage is one of these AND
 * the lead hasn't already been resolved to good/won. Since the check is
 * current-stage-only, a lead currently in "Demo Scheduled" by definition
 * hasn't been marked Demo Done yet — the question of "scheduled but not
 * done" reduces to "current stage == Demo Scheduled".
 *
 * Both spellings ('demo scheduled' / 'demo schedule') are included because
 * the Kraya CRM has both variants in production.
 */
const TRANSITION_STAGES = new Set([
  'demo done',
  'call assigned',
  'demo scheduled',
  'demo schedule',
]);

export type LeadStatus =
  | 'pending'
  | 'qualified'
  | 'valid'
  | 'good'
  | 'won'
  | 'invalid';

interface ClassificationFlags {
  status: LeadStatus;
  is_qualified: boolean;
  is_valid: boolean;
  is_good: boolean;
  is_won: boolean;
  is_pending: boolean;
  is_invalid: boolean;
  /** Lead's current stage is a transition stage (e.g. Demo Done) AND it
   *  hasn't already crossed into good/won. Used for Anticipated CPGL. */
  is_transition: boolean;
}

/**
 * Classify a lead's quality from its current pipeline + stage.
 *
 * Resolution order:
 *   1. Stage-based "won" (terminal, overrides everything).
 *   2. Stage-based "good".
 *   3. Stage-based "invalid".
 *   4. Pipeline-based — sales rep ⇒ valid+qualified;
 *                        intake ⇒ depends on stage.
 */
export function classifyLeadStatus(
  pipelineName: string,
  stageName: string,
): ClassificationFlags {
  const stage = (stageName || '').toLowerCase().trim();
  const pipeline = (pipelineName || '').toLowerCase().trim();
  const intake = intakePipelineNames();
  const isIntake = intake.has(pipeline);
  // Transition flag — set only when current stage is a transition stage
  // (e.g. Demo Done) AND the lead hasn't already resolved to good/won/invalid.
  // Branches that set is_good=true or is_invalid=true emit is_transition=false.
  const isTransitionStage = TRANSITION_STAGES.has(stage);

  // Stage-based: WON
  if (WON_STAGES.has(stage)) {
    return {
      status: 'won',
      is_won: true,
      is_good: true,
      is_qualified: true,
      // A "Lead Won" sitting in the intake pipeline is unusual but real —
      // we treat it as valid (rep must have closed it before the move
      // happened, or the row is mid-migration). Trust the stage.
      is_valid: true,
      is_pending: false,
      is_invalid: false,
      is_transition: false,
    };
  }

  // Stage-based: GOOD
  if (GOOD_STAGES.has(stage)) {
    return {
      status: 'good',
      is_won: false,
      is_good: true,
      is_qualified: true,
      is_valid: true,
      is_pending: false,
      is_invalid: false,
      is_transition: false,
    };
  }

  // Stage-based: INVALID
  if (INVALID_STAGES.has(stage)) {
    return {
      status: 'invalid',
      is_won: false,
      is_good: false,
      is_qualified: false,
      is_valid: false,
      is_pending: false,
      is_invalid: true,
      is_transition: false,
    };
  }

  // Pipeline-based: sales rep pipeline ⇒ qualified+valid (regardless of stage)
  if (!isIntake) {
    return {
      status: 'valid',
      is_won: false,
      is_good: false,
      is_qualified: true,
      is_valid: true,
      is_pending: false,
      is_invalid: false,
      is_transition: isTransitionStage,
    };
  }

  // Intake pipeline + Rescheduled / Calls Scheduled ⇒ qualified, not valid
  if (INTAKE_QUALIFIED_STAGES.has(stage)) {
    return {
      status: 'qualified',
      is_won: false,
      is_good: false,
      is_qualified: true,
      is_valid: false,
      is_pending: false,
      is_invalid: false,
      is_transition: isTransitionStage,
    };
  }

  // Everything else in intake (DNP-but-not-yet-marked, Call Assigned, etc.)
  return {
    status: 'pending',
    is_won: false,
    is_good: false,
    is_qualified: false,
    is_valid: false,
    is_pending: true,
    is_invalid: false,
    is_transition: isTransitionStage,
  };
}

/** Legacy export — preserved for callers that still want a single string. */
export function statusForStage(stageName: string, pipelineName: string = ''): string {
  return classifyLeadStatus(pipelineName, stageName).status;
}

/**
 * "Best-ever" classification — walks the lead's full stage_history (and
 * pipeline_history, when available) and OR-merges the qualification flags
 * across every stage the lead ever touched. So a lead that briefly hit
 * "Pressure Sell" and then bounced to "DNP" is STILL counted as good +
 * qualified + valid, because they DID get there at some point.
 *
 * Why this exists: the daily breakdown on /dashboard groups by booked_at
 * or created_at and answers "of leads in this bucket, how many became
 * qualified / good / won?". The honest answer is anyone who ever reached
 * those tiers, not just those who are currently sitting in them. The
 * current-state classification (classifyLeadStatus) understates quality
 * by losing every lead that subsequently bounced to DNP / Lead Lost.
 *
 * Implementation:
 *   1. Start from the current-state flags as the floor.
 *   2. For every entry in stage_history, look up the pipeline that was
 *      active at that timestamp (via pipeline_history), then re-run
 *      classifyLeadStatus on that (pipeline, stage) pair.
 *   3. OR-merge the booleans.
 *   4. is_invalid stays current-only (DNP is the current state, not a
 *      historical anomaly to be overridden by an earlier qualified phase).
 */
export function classifyLeadStatusFromHistory(
  lead: any,
  currentPipelineName: string,
  currentStageName: string,
): ClassificationFlags {
  const current = classifyLeadStatus(currentPipelineName, currentStageName);
  let is_won = current.is_won;
  let is_good = current.is_good;
  let is_qualified = current.is_qualified;
  let is_valid = current.is_valid;

  const stageHist: any[] | undefined = lead?.history?.stage_history;
  if (Array.isArray(stageHist) && stageHist.length > 0) {
    // Build a chronologically sorted pipeline timeline so we can answer
    // "what pipeline was the lead in at time T?" for each stage transition.
    const pipelineHist: any[] = Array.isArray(lead?.history?.pipeline_history)
      ? [...lead.history.pipeline_history].sort((a, b) =>
          String(a.updated_at || '').localeCompare(String(b.updated_at || '')),
        )
      : [];

    function pipelineAt(ts: string): string {
      let active = currentPipelineName; // safe fallback
      for (const p of pipelineHist) {
        if (String(p.updated_at || '') <= ts) {
          active = String(p.updated || '') || active;
        } else {
          break;
        }
      }
      return active;
    }

    for (const entry of stageHist) {
      const stage = String(entry.updated || '');
      if (!stage) continue;
      const ts = String(entry.updated_at || '');
      const pipeline = pipelineAt(ts);
      const c = classifyLeadStatus(pipeline, stage);
      if (c.is_won) is_won = true;
      if (c.is_good) is_good = true;
      if (c.is_qualified) is_qualified = true;
      if (c.is_valid) is_valid = true;
    }
  }

  // Status hierarchy — pick the highest tier reached. is_invalid only
  // applies if the lead never crossed into a qualified tier (otherwise
  // their "ever-qualified" status wins over their current-DNP status).
  let status: LeadStatus;
  if (is_won) status = 'won';
  else if (is_good) status = 'good';
  else if (is_valid) status = 'valid';
  else if (is_qualified) status = 'qualified';
  else if (current.is_invalid) status = 'invalid';
  else status = 'pending';

  // is_transition is current-state only — anticipated CPGL needs to know
  // who's IN-FLIGHT right now (e.g. Demo Done waiting for sales-rep next-
  // step). If the lead already crossed into is_good/is_won via history,
  // they're not "transitioning" anymore.
  const is_transition = current.is_transition && !is_good && !is_won;

  return {
    status,
    is_won,
    is_good,
    is_qualified,
    is_valid,
    is_pending: !is_qualified && !current.is_invalid,
    is_invalid: current.is_invalid && !is_qualified,
    is_transition,
  };
}

// =====================================================================
// Full enrichment
// =====================================================================

export function enrichLead(lead: KrayaLead): EnrichedLead {
  const { channel, data_source, parsed } = classifyChannel(lead);

  const stageName =
    (lead.stage && typeof lead.stage === 'object' ? lead.stage.name : (lead.stage as string)) ||
    'Unknown';
  const stageId =
    (lead.stage && typeof lead.stage === 'object' ? lead.stage.id : null) ?? lead.stage_id ?? null;
  const pipelineName =
    lead._pipeline_name ||
    (typeof lead.pipeline === 'object' ? lead.pipeline?.name : (lead.pipeline as string)) ||
    '';
  // History-based ("best ever") classification — a lead that ever touched
  // a qualified / good / won stage stays counted at that tier even if they
  // subsequently bounced to DNP / Lead Lost. See classifyLeadStatusFromHistory
  // for the full reasoning.
  const flags = classifyLeadStatusFromHistory(lead, pipelineName, stageName);

  const sourceUrl = lead.attributes?.Source || '';
  const attrs = lead.attributes || {};
  // Kraya stores custom fields with display-cased keys ("Company Name", "Org Email").
  // Read tolerant of either casing or spacing.
  const attr = (k: string): string => {
    const candidates = [k, k.replace(/ /g, ''), k.toLowerCase(), k.toLowerCase().replace(/ /g, '_')];
    for (const c of candidates) if (attrs[c] != null && attrs[c] !== '') return String(attrs[c]);
    return '';
  };

  return {
    id: lead.id,
    name: lead.name || '',
    phone: lead.phone || '',
    email: lead.email || '',
    stage: stageName,
    stage_id: stageId,
    stage_updated_at: lead.stage_updated_at || '',
    channel,
    status: flags.status,
    data_source,
    source: lead.source || '',
    source_url: sourceUrl,
    created_at: lead.created_at || '',
    updated_at: lead.updated_at || '',
    booked_at: lead.booked_at || '',
    lead_won_at: lead.lead_won_at || '',
    lead_lost_at: lead.lead_lost_at || '',
    pipeline: pipelineName,
    pipeline_id: lead._pipeline_id ?? lead.pipeline_id ?? null,
    is_qualified: flags.is_qualified,
    is_valid: flags.is_valid,
    is_good: flags.is_good,
    is_pending: flags.is_pending,
    is_won: flags.is_won,
    is_transition: flags.is_transition,
    utm_source: parsed?.utm_source || '',
    utm_medium: parsed?.utm_medium || '',
    utm_campaign: parsed?.utm_campaign || '',
    utm_content: parsed?.utm_content || '',
    aid: parsed?.aid || '',
    caid: parsed?.caid || '',
    asid: parsed?.asid || '',
    days_in_pipeline: lead.days_in_pipeline || 0,
    days_in_stage: lead.days_in_stage || 0,
    intent_score: lead.intent_score || 0,
    // Kraya custom fields (`attributes.*`)
    company_name: attr('Company Name'),
    website: attr('Website'),
    industry: attr('Industry'),
    industry_size: attr('Industry Size'),
    team_size: attr('Team Size'),
    contact_poc: attr('Contact POC'),
    org_email: attr('Org Email'),
    amount_sold: attr('Amount Sold'),
    ad_source: attr('Ad Source'),
    lead_flow: attr('Lead Flow'),
    using_whatsapp: attr('Using Whatsapp'),
    valid_till: attr('Valid till'),
    notes: attr('Notes'),
    call_book_date: attr('Call Book Date'),
    call_book_time: attr('Call Book Time'),
  };
}

/**
 * No-op for Kraya — kept as a named export so the route handlers that mirror
 * the MiM project's structure still compile. Every lead from api.kraya-ai.com
 * is, by definition, a Kraya lead.
 */
export function isKrayaLead(_lead: KrayaLead): boolean {
  return true;
}

// =====================================================================
// Quality-path classification for the Anticipated CPQL projection model
// =====================================================================

/** Stages we treat as "substantive quality" (the lead has been actively
 *  worked by sales): includes Demo Scheduled / Demo Done and all good /
 *  won / qualifying intake states. */
const QUALITY_STAGES = new Set([
  'demo done',
  'demo scheduled',
  'demo schedule',
  'pressure sell',
  'ultra hot',
  'ultra-hot',
  'ultra hot lead',
  'focus leads',
  'focus lead',
  'dfy in progress',
  'token',
  'lead won',
  'leads won',
  'qualifying',
  'rescheduled',
  'calls scheduled',
  'call scheduled',
  'call assigned',
]);

/** Stages we treat as "off-path" — leads here are either lost or in a
 *  recovery state (DNP / Callback). Used to classify direct vs indirect. */
const OFFPATH_STAGES = new Set([
  'dnp',
  'callback request',
  'call back request',
  'callback requested',
  'call back requested',
  'callback',
  'call back',
  'back burner',
  'nurturing',
  'lead lost',
  'leads lost',
]);

/** Result of classifying a lead's path to substantive quality:
 *  - 'direct'   : currently in a quality stage AND never touched an off-path stage
 *  - 'indirect' : currently in a quality stage AFTER passing through an off-path stage
 *  - 'pending'  : not yet in a quality stage AND not on an off-path
 *  - 'recoverable_dnp' / 'recoverable_callback' : currently off-path, eligible for recovery projection
 *  - 'lost'     : terminal off-path (Lead Lost / Back burner / Nurturing) — won't recover
 */
export type QualityPath =
  | 'direct'
  | 'indirect'
  | 'pending'
  | 'recoverable_dnp'
  | 'recoverable_callback'
  | 'lost';

/**
 * Walks the lead's stage_history (chronological) and classifies which path
 * the lead is on RIGHT NOW relative to "substantive quality."
 *
 * Used by the Anticipated CPQL v2 projection — same-day per-ad direct
 * quality × account-level 7d (aggregate/direct) multiplier.
 */
export function classifyQualityPath(
  lead: KrayaLead,
  pipelineName?: string,
  stageName?: string,
): QualityPath {
  const stage = (stageName || (typeof lead.stage === 'object' ? lead.stage?.name : lead.stage) || '').toLowerCase().trim();
  const pipeline = (pipelineName || (typeof lead.pipeline === 'object' ? lead.pipeline?.name : lead.pipeline) || '').toLowerCase().trim();
  const intake = intakePipelineNames();
  const isIntake = intake.has(pipeline);

  // 1. Is the lead CURRENTLY in a quality stage (or in a sales-rep pipeline
  //    where every stage counts as quality)?
  const inQualityStage = QUALITY_STAGES.has(stage) || (!isIntake && !!stage);

  // 2. Did the lead EVER pass through an off-path (DNP / Callback) stage
  //    in its history?
  const history: any[] = (lead as any)?.history?.stage_history || [];
  const everOffpath = Array.isArray(history)
    ? history.some((h) => {
        const updated = String(h?.updated || '').toLowerCase().trim();
        return OFFPATH_STAGES.has(updated);
      })
    : false;

  if (inQualityStage) {
    return everOffpath ? 'indirect' : 'direct';
  }

  // Currently off-path — classify by which type.
  if (DNP_STAGE_VALUES.has(stage)) return 'recoverable_dnp';
  if (CALLBACK_STAGE_VALUES.has(stage)) return 'recoverable_callback';
  if (TERMINAL_LOST_STAGES.has(stage)) return 'lost';

  // Default: pre-rep-touch / pending.
  return 'pending';
}

const DNP_STAGE_VALUES = new Set(['dnp']);
const CALLBACK_STAGE_VALUES = new Set([
  'callback request',
  'call back request',
  'callback requested',
  'call back requested',
  'callback',
  'call back',
]);
const TERMINAL_LOST_STAGES = new Set([
  'lead lost',
  'leads lost',
  'back burner',
  'nurturing',
  'deleted',
  'not eligible',
  'not interested',
  'no show',
]);
