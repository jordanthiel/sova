import type { AgenticRequestType } from '../types/aiRequest.ts';

export interface AiRunLogEntry {
  stage: string;
  ms?: number;
  payload?: Record<string, unknown>;
}

export class AiRunLogger {
  entries: AiRunLogEntry[] = [];
  t0: number;

  constructor(public readonly requestId: string) {
    this.t0 = Date.now();
  }

  log(stage: string, payload?: Record<string, unknown>) {
    const ms = Date.now() - this.t0;
    this.entries.push({ stage, ms, payload });
    const summary = payload
      ? `${stage} (+${ms}ms) ${JSON.stringify(payload).slice(0, 280)}`
      : `${stage} (+${ms}ms)`;
    console.log(`[ai-run ${this.requestId}] ${summary}`);
  }

  stagesMs(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.entries) {
      if (e.ms != null) out[e.stage] = e.ms;
    }
    return out;
  }
}

export function logSummaryLine(requestType: AgenticRequestType, extra: Record<string, unknown>) {
  console.log('[ai-summary]', JSON.stringify({ requestType, ...extra }));
}
