import { classifierPrompt } from '../prompts/classifierPrompt.ts';
import { critiquePrompt } from '../prompts/critiquePrompt.ts';
import { recommendationSelectorPrompt } from '../prompts/recommendationSelectorPrompt.ts';
import type { AgenticRequestType, ChildProfile, ClassifierResult } from '../types/aiRequest.ts';
import type { RankedCandidate } from '../types/candidateOption.ts';
import type { AgenticScheduleResponse, CritiqueOutput, LlmSelectionOutput } from '../types/recommendation.ts';
import type { SleepFacts } from '../types/sleepFacts.ts';
import type { SleepSession } from '../types/sessions.ts';
import { getChildProfile } from '../services/childProfileService.ts';
import type { ProfileRequestBody } from '../services/childProfileService.ts';
import { evaluateRecommendationCandidates } from '../services/candidateEvaluationService.ts';
import { generateCandidateScheduleOptions } from '../services/candidateGenerationService.ts';
import { buildContextPacket } from '../services/contextPacketService.ts';
import { computeDataQuality } from '../services/dataQualityService.ts';
import { getRecentSleepHistory } from '../services/sleepHistoryService.ts';
import { computeSleepFacts } from '../services/sleepAnalysisService.ts';
import { getTodaySleepTimeline } from '../services/sleepTimelineService.ts';
import { effectiveConfidence, hedgingPrefix } from '../guards/confidenceGuard.ts';
import { scrubMedicalClaims, hasJudgmentShameLanguage } from '../guards/safetyGuard.ts';
import { AiRunLogger, logSummaryLine } from '../logging/aiRunLog.ts';
import { extractJsonFromText } from '../utils/jsonExtract.ts';
import {
  computeNapCapDurations,
  getDaytimeNapBudgetMinutes,
  getNapCountExpectationForAge,
} from '../sleepRules.ts';

export type LlmCaller = (
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options?: { maxTokens?: number; temperature?: number; json?: boolean },
) => Promise<string>;

export interface ScheduleOrchestratorInput {
  body: ProfileRequestBody;
  sleepData: SleepSession[];
  babyName: string;
  babyAgeDays: number;
  callLLM: LlmCaller;
  includeDebug?: boolean;
}

export interface ScheduleOrchestratorResult {
  response: AgenticScheduleResponse;
  rankedCandidates: RankedCandidate[];
  /** Candidate matching LLM selection (for legacy next_sleep mapping). */
  selectedCandidate: RankedCandidate | undefined;
  facts: SleepFacts;
  requestType: AgenticRequestType;
  classifier?: ClassifierResult;
}

export async function runScheduleRecommendationOrchestrator(
  input: ScheduleOrchestratorInput,
): Promise<ScheduleOrchestratorResult> {
  const log = new AiRunLogger(crypto.randomUUID().slice(0, 8));
  const nowIso = input.body.current_time ?? new Date().toISOString();
  const tz = input.body.timezone ?? 'UTC';
  const profile = getChildProfile(input.body, input.babyName, input.babyAgeDays);
  profile.timezone = tz;

  void getTodaySleepTimeline(profile.childId, input.sleepData, nowIso, tz);

  const recentPack = getRecentSleepHistory(profile.childId, input.sleepData, nowIso, tz, 7);
  const facts = computeSleepFacts(profile, input.sleepData, recentPack, nowIso, input.body.last_wake_time ?? null);
  log.log('facts_computed', { napCount: facts.napCountToday, napInProgress: facts.currentNapInProgress });

  const dqBreakdown = computeDataQuality(facts, input.sleepData, nowIso);
  log.log('data_quality', { score: dqBreakdown.score, notes: dqBreakdown.notes });

  let requestType: AgenticRequestType;
  let classifier: ClassifierResult | undefined;

  if (input.body.force_request_type) {
    requestType = input.body.force_request_type;
  } else if (input.body.user_message?.trim()) {
    classifier = await classifyRequest(input, facts, dqBreakdown.score, log);
    requestType = classifier.requestType === 'UNKNOWN'
      ? deterministicRoute(facts, profile, nowIso)
      : classifier.requestType;
  } else {
    requestType = deterministicRoute(facts, profile, nowIso);
  }

  if (facts.ongoingNight) {
    const res = nightSleepBlockedResponse(
      facts,
      requestType,
      dqBreakdown.score,
      input.includeDebug,
      log,
      profile.name,
    );
    return {
      response: res,
      rankedCandidates: [],
      selectedCandidate: undefined,
      facts,
      requestType,
      classifier,
    };
  }

  let candidates = generateCandidateScheduleOptions(facts, profile, requestType, nowIso);
  if (candidates.length === 0) {
    requestType = 'BEDTIME_RECOMMENDATION';
    candidates = generateCandidateScheduleOptions(facts, profile, requestType, nowIso);
  }

  const ranked = evaluateRecommendationCandidates(candidates, facts, profile);
  log.log('candidates', { count: ranked.length, top: ranked[0]?.id });

  const packet = buildContextPacket(requestType, profile, facts, ranked, dqBreakdown, input.body.user_message);
  const tSel = Date.now();
  const selRaw = await input.callLLM(
    [
      { role: 'system', content: recommendationSelectorPrompt(packet) },
      { role: 'user', content: 'Select the best option and write parent-facing guidance.' },
    ],
    { maxTokens: 900, temperature: 0.25, json: true },
  );
  log.log('llm_select', { ms: Date.now() - tSel });

  let selection = safeParseSelection(extractJsonFromText(selRaw), ranked) ?? fallbackSelection(ranked);

  const tCrit = Date.now();
  const critRaw = await input.callLLM(
    [
      { role: 'system', content: critiquePrompt(packet, selection) },
      { role: 'user', content: 'Critique and approve.' },
    ],
    { maxTokens: 500, temperature: 0.1, json: true },
  );
  log.log('llm_critique', { ms: Date.now() - tCrit });
  const critique = safeParseCritique(extractJsonFromText(critRaw));
  if (critique && !critique.approved && critique.revisions.length > 0) {
    selection = {
      ...selection,
      parentFacingResponse: critique.revisions[0] ?? selection.parentFacingResponse,
    };
  }

  const chosen = ranked.find((c) => c.id === selection.recommendedOptionId) ?? ranked[0];
  const fallbackC = selection.fallbackOptionId
    ? ranked.find((c) => c.id === selection.fallbackOptionId)
    : ranked[1];

  const response = assembleStructuredResponse(
    requestType,
    chosen,
    fallbackC,
    selection,
    facts,
    profile,
    dqBreakdown.score,
    ranked,
    input.includeDebug
      ? {
        facts,
        topCandidates: ranked.slice(0, 5),
        classifier: classifier as unknown as Record<string, unknown>,
        critique: critique as unknown as Record<string, unknown>,
        stagesMs: log.stagesMs(),
      }
      : undefined,
  );

  logSummaryLine(requestType, { confidence: response.confidence, dq: response.dataQualityScore, chosen: chosen?.id });

  return {
    response,
    rankedCandidates: ranked,
    selectedCandidate: chosen,
    facts,
    requestType,
    classifier,
  };
}

function nightSleepBlockedResponse(
  facts: SleepFacts,
  requestType: AgenticRequestType,
  dq: number,
  debug: boolean | undefined,
  log: AiRunLogger,
  babyName: string,
): AgenticScheduleResponse {
  log.log('blocked_ongoing_night');
  return {
    requestType,
    recommendedAction: {
      type: 'BEDTIME',
      label: 'Night sleep is already in progress.',
    },
    reasoningSummary: 'Night sleep is in progress, so nap timing recommendations do not apply until the next wake.',
    confidence: 0.95,
    dataQualityScore: dq,
    watchFors: ['Log the next wake for fresher daytime guidance.'],
    parentFacingResponse: hedgingPrefix(dq) +
      `${babyName} seems to be in night sleep already. Rest is the plan for now — we can pick up scheduling after the next wake.`,
    debug: debug
      ? { facts, topCandidates: [], stagesMs: log.stagesMs() }
      : undefined,
  };
}

async function classifyRequest(
  input: ScheduleOrchestratorInput,
  facts: SleepFacts,
  dq: number,
  log: AiRunLogger,
): Promise<ClassifierResult> {
  const t = Date.now();
  const text = await input.callLLM(
    [
      {
        role: 'system',
        content: classifierPrompt({
          message: input.body.user_message!,
          requestSource: input.body.request_source ?? 'chat',
          ageMonths: Math.round(facts.ageMonths),
          toplineFacts: JSON.stringify({
            napInProgress: facts.currentNapInProgress,
            napCountToday: facts.napCountToday,
            daySleepMin: facts.daytimeSleepMinutes,
            dq,
          }),
        }),
      },
      { role: 'user', content: 'Classify.' },
    ],
    { maxTokens: 220, temperature: 0.1, json: true },
  );
  log.log('llm_classify', { ms: Date.now() - t });
  try {
    const j = JSON.parse(extractJsonFromText(text));
    return {
      requestType: (j.requestType as AgenticRequestType) ?? 'UNKNOWN',
      needsMoreData: Boolean(j.needsMoreData),
      missingFields: Array.isArray(j.missingFields) ? j.missingFields : [],
      confidence: typeof j.confidence === 'number' ? j.confidence : 0.5,
    };
  } catch {
    return { requestType: 'UNKNOWN', needsMoreData: true, missingFields: ['classify_json'], confidence: 0 };
  }
}

function deterministicRoute(facts: SleepFacts, profile: ChildProfile, nowIso: string): AgenticRequestType {
  if (facts.ongoingNight) return 'CHAT_COACHING';
  if (facts.currentNapInProgress) return 'MAX_NAP_DURATION_RECOMMENDATION';

  const ageExpect = getNapCountExpectationForAge(facts.ageDays);
  const napTarget =
    profile.preferences.target_nap_count && profile.preferences.target_nap_count > 0
      ? profile.preferences.target_nap_count
      : ageExpect.typical;

  const budget = getDaytimeNapBudgetMinutes(facts.ageDays);
  if (facts.napCountToday >= napTarget && facts.daytimeSleepMinutes >= budget * 0.85) {
    return 'BEDTIME_RECOMMENDATION';
  }

  const nowMs = new Date(nowIso).getTime();
  const bedEnd = new Date(facts.bedtimeWindow.endIso).getTime();
  const lastWw =
    profile.preferences.last_wake_window_minutes && profile.preferences.last_wake_window_minutes > 0
      ? profile.preferences.last_wake_window_minutes
      : 60;
  if (bedEnd - nowMs < lastWw * 60000 + 35 * 60000) {
    return 'BEDTIME_RECOMMENDATION';
  }

  return 'NEXT_NAP_RECOMMENDATION';
}

function safeParseSelection(raw: string, ranked: RankedCandidate[]): LlmSelectionOutput | null {
  try {
    const j = JSON.parse(raw);
    const id = String(j.recommendedOptionId || '');
    if (!ranked.some((c) => c.id === id)) return null;
    return {
      recommendedOptionId: id,
      reasoningSummary: String(j.reasoningSummary || ''),
      confidence: typeof j.confidence === 'number' ? j.confidence : 0.6,
      fallbackOptionId: typeof j.fallbackOptionId === 'string' ? j.fallbackOptionId : undefined,
      watchFors: Array.isArray(j.watchFors) ? j.watchFors.filter((x: unknown) => typeof x === 'string') : [],
      parentFacingResponse: String(j.parentFacingResponse || ''),
    };
  } catch {
    return null;
  }
}

function fallbackSelection(ranked: RankedCandidate[]): LlmSelectionOutput {
  const top = ranked[0];
  const second = ranked[1];
  return {
    recommendedOptionId: top?.id ?? 'none',
    reasoningSummary: 'Chosen the strongest deterministic match for today’s signals.',
    confidence: 0.55,
    fallbackOptionId: second?.id,
    watchFors: ['Baby cues beat the clock \u2014 adjust if tears or hyper-fatigue show up.'],
    parentFacingResponse: top?.label ?? 'Here is a practical next step based on what is logged.',
  };
}

function safeParseCritique(raw: string): CritiqueOutput | null {
  try {
    const j = JSON.parse(raw);
    return {
      approved: Boolean(j.approved),
      issues: Array.isArray(j.issues) ? j.issues.map(String) : [],
      revisions: Array.isArray(j.revisions) ? j.revisions.map(String) : [],
    };
  } catch {
    return null;
  }
}

function assembleStructuredResponse(
  requestType: AgenticRequestType,
  chosen: RankedCandidate | undefined,
  fallback: RankedCandidate | undefined,
  selection: LlmSelectionOutput,
  facts: SleepFacts,
  profile: ChildProfile,
  dq: number,
  ranked: RankedCandidate[],
  debug?: AgenticScheduleResponse['debug'],
): AgenticScheduleResponse {
  let parentText = hedgingPrefix(dq) + selection.parentFacingResponse;
  parentText = scrubMedicalClaims(parentText);
  if (hasJudgmentShameLanguage(parentText)) {
    parentText = 'You’re doing fine — sleep is messy for everyone. ' + parentText;
  }

  const conf = effectiveConfidence(selection.confidence, dq);

  const rec = candidateToAction(requestType, chosen);
  const fall = candidateToAction(requestType, fallback);

  const maxNapExtras = maxNapFields(requestType, chosen, facts, profile);

  return {
    requestType,
    recommendedAction: rec,
    fallbackAction: fall,
    reasoningSummary: selection.reasoningSummary,
    confidence: conf,
    dataQualityScore: dq,
    watchFors: selection.watchFors,
    parentFacingResponse: parentText,
    ...maxNapsExtrasSpread(maxNapExtras),
    debug,
  };
}

function candidateToAction(
  _requestType: AgenticRequestType,
  c: RankedCandidate | undefined,
): AgenticScheduleResponse['recommendedAction'] {
  if (!c) {
    return { type: 'NAP_WINDOW', label: 'No candidate \u2014 check logs and try again.' };
  }
  if (c.actionType === 'WAKE_FROM_NAP' && c.wakeAtIso) {
    return { type: 'WAKE_FROM_NAP', wakeAt: c.wakeAtIso, label: c.label };
  }
  if (c.actionType === 'BEDTIME' && c.primaryTimeIso) {
    return { type: 'BEDTIME', startAt: c.primaryTimeIso, label: c.label };
  }
  if (c.actionType === 'CATNAP' && c.primaryTimeIso) {
    return {
      type: 'CATNAP_THEN_BEDTIME',
      startAt: c.primaryTimeIso,
      endAt: c.secondaryTimeIso,
      label: c.label,
    };
  }
  if (c.primaryTimeIso) {
    return {
      type: 'NAP_WINDOW',
      startAt: c.primaryTimeIso,
      endAt: new Date(new Date(c.primaryTimeIso).getTime() + 15 * 60000).toISOString(),
      label: c.label,
    };
  }
  return { type: 'NAP_WINDOW', label: c.label };
}

interface MaxNapExtra {
  idealWakeRange?: { startAt: string; endAt: string };
  preferredWakeAt?: string;
  stillOkayUntil?: string;
  softCapAt?: string;
  hardCapAt?: string;
}

function maxNapFields(
  requestType: AgenticRequestType,
  chosen: RankedCandidate | undefined,
  facts: SleepFacts,
  profile: ChildProfile,
): MaxNapExtra | undefined {
  if (
    requestType !== 'MAX_NAP_DURATION_RECOMMENDATION' &&
    requestType !== 'NAP_CAP_RECOMMENDATION'
  ) {
    return undefined;
  }
  if (!facts.currentNapInProgress || !facts.ongoingNapStartIso || !chosen?.wakeAtIso) {
    return undefined;
  }
  const napStart = new Date(facts.ongoingNapStartIso).getTime();
  const before = facts.totalDaytimeSleepBeforeCurrentNapMinutes ?? 0;
  const ordinal = facts.currentNapOrdinalToday ?? 1;
  const targetNaps =
    profile.preferences.target_nap_count && profile.preferences.target_nap_count > 0
      ? profile.preferences.target_nap_count
      : getNapCountExpectationForAge(facts.ageDays).typical;
  const caps = computeNapCapDurations({
    ageDays: facts.ageDays,
    napOrdinal: ordinal,
    napsPlannedToday: targetNaps,
    totalDaytimeSleepBeforeThisNapMinutes: before,
    currentNapElapsedMinutes: facts.currentNapDurationMinutes ?? 0,
    daytimeBudgetMinutes: getDaytimeNapBudgetMinutes(facts.ageDays),
    recoveryPressure: facts.napRecoveryPressure,
    bedtimeProtectionPressure: facts.bedtimeProtectionPressure,
    preferLongerNaps: profile.preferences.prefer_longer_naps === true,
    preferEarlierBedtime: profile.preferences.prefer_earlier_bedtime === true,
  });
  const preferredMs = napStart + caps.preferredCapMinutes * 60000;
  const softMs = napStart + caps.softCapMinutes * 60000;
  const hardMs = napStart + caps.hardCapMinutes * 60000;
  const idealStart = preferredMs - 3 * 60000;
  const idealEnd = preferredMs + 3 * 60000;
  void chosen.wakeAtIso;
  return {
    idealWakeRange: {
      startAt: new Date(idealStart).toISOString(),
      endAt: new Date(idealEnd).toISOString(),
    },
    preferredWakeAt: new Date(preferredMs).toISOString(),
    stillOkayUntil: new Date(softMs).toISOString(),
    softCapAt: new Date(softMs).toISOString(),
    hardCapAt: new Date(hardMs).toISOString(),
  };
}

function maxNapsExtrasSpread(extra: MaxNapExtra | undefined): Partial<AgenticScheduleResponse> {
  if (!extra) return {};
  return {
    idealWakeRange: extra.idealWakeRange,
    preferredWakeAt: extra.preferredWakeAt,
    stillOkayUntil: extra.stillOkayUntil,
    softCapAt: extra.softCapAt,
    hardCapAt: extra.hardCapAt,
  };
}
