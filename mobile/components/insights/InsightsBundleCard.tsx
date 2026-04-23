import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Spacing, Typography, Radius, Shadows } from '@/constants/theme';
import { DarkPanel } from '@/components/ui/DarkPanel';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-color';
import { useAiInsight } from '@/hooks/useAiInsight';

interface InsightItem {
  title: string;
  insight: string;
  icon: string;
}

interface InsightsBundleData {
  insights?: unknown;
  insights_bundle?: {
    insights?: unknown;
    insights_bundle?: { insights?: unknown };
  };
}

function stripMarkdownJsonFence(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (m) return m[1].trim();
  return t;
}

function stripJsonFencesLoose(text: string): string {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*\r?\n?/i, '');
  t = t.replace(/\r?\n?```\s*$/i, '');
  return t.trim();
}

/** Models often emit multiple ``` fences or partial wrappers — strip repeatedly. */
function stripAllMarkdownFences(text: string): string {
  let t = text.trim();
  for (let n = 0; n < 8; n++) {
    const next = t.replace(/^```(?:json)?\s*\r?\n?/i, '').replace(/\r?\n```\s*$/i, '').trim();
    if (next === t) break;
    t = next;
  }
  return t;
}

function sanitizeLlMJsonText(s: string): string {
  return s.replace(/^\uFEFF/, '').replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
}

function repairTrailingCommas(json: string): string {
  return json.replace(/,(\s*[\]\}])/g, '$1');
}

function sliceFirstJsonValue(text: string, start: number): string | null {
  const open = text[start];
  if (open !== '{' && open !== '[') return null;
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === '\\') {
        esc = true;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * If the outer object fails to parse, pull just the `"insights": [...]` array (models often break elsewhere).
 */
function tryParseInsightsArrayOnly(blob: string): unknown[] | null {
  const t = sanitizeLlMJsonText(stripAllMarkdownFences(stripMarkdownJsonFence(blob)));
  const key = '"insights"';
  const idx = t.indexOf(key);
  if (idx < 0) return null;
  let i = idx + key.length;
  while (i < t.length && /\s/.test(t[i])) i++;
  if (t[i] !== ':') return null;
  i++;
  while (i < t.length && /\s/.test(t[i])) i++;
  if (t[i] !== '[') return null;
  const slice = sliceFirstJsonValue(t, i);
  if (!slice) return null;
  for (const cand of [slice, repairTrailingCommas(slice)]) {
    try {
      const arr = JSON.parse(cand) as unknown;
      return Array.isArray(arr) ? arr : null;
    } catch {
      /* continue */
    }
  }
  return null;
}

/** Same strategy as chatgpt-sleep-coach, plus sanitizer, fence loop, trailing commas, and insights-array-only fallback. */
function parseJsonLenient(raw: string): unknown | null {
  const base = sanitizeLlMJsonText(stripAllMarkdownFences(stripMarkdownJsonFence(raw)));
  const candidates = [
    base,
    stripJsonFencesLoose(base),
    repairTrailingCommas(base),
    repairTrailingCommas(stripJsonFencesLoose(sanitizeLlMJsonText(raw.trim()))),
  ];
  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(c);
    } catch {
      /* continue */
    }
  }
  let t = stripAllMarkdownFences(sanitizeLlMJsonText(raw.trim()));
  for (const c of [t, repairTrailingCommas(t)]) {
    try {
      return JSON.parse(c);
    } catch {
      /* continue */
    }
  }
  const iObj = t.indexOf('{');
  const iArr = t.indexOf('[');
  let start = -1;
  if (iObj >= 0 && (iArr < 0 || iObj <= iArr)) start = iObj;
  else if (iArr >= 0) start = iArr;
  else {
    const arr = tryParseInsightsArrayOnly(raw);
    return arr ? { insights: arr } : null;
  }
  const slice = sliceFirstJsonValue(t, start);
  if (!slice) {
    const arr = tryParseInsightsArrayOnly(raw);
    return arr ? { insights: arr } : null;
  }
  for (const cand of [slice, repairTrailingCommas(slice)]) {
    try {
      return JSON.parse(cand);
    } catch {
      /* continue */
    }
  }
  const arr = tryParseInsightsArrayOnly(raw);
  return arr ? { insights: arr } : null;
}

function tryParseJson(value: string): unknown | null {
  return parseJsonLenient(value);
}

/**
 * Turn assorted LLM/API shapes into a flat list of row payloads (strings or objects).
 */
function coerceToInsightRowList(raw: unknown): unknown[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = tryParseJson(raw);
    if (parsed == null) return null;
    return coerceToInsightRowList(parsed);
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (typeof o.insights === 'string') {
      const inner = coerceToInsightRowList(o.insights);
      if (inner) return inner;
    }
    if (Array.isArray(o.insights)) return o.insights;
    if (o.insights_bundle != null && typeof o.insights_bundle === 'object') {
      const inner = coerceToInsightRowList((o.insights_bundle as Record<string, unknown>).insights);
      if (inner) return inner;
    }
    const vals = Object.values(o);
    if (
      vals.length >= 1 &&
      vals.length <= 12 &&
      vals.every((v) => v != null && typeof v === 'object' && !Array.isArray(v))
    ) {
      const first = vals[0] as Record<string, unknown>;
      if (
        typeof first.title === 'string' ||
        typeof first.insight === 'string' ||
        typeof first.body === 'string' ||
        typeof first.summary === 'string' ||
        typeof first.text === 'string' ||
        typeof first.content === 'string'
      ) {
        return vals;
      }
    }
  }
  return null;
}

/** Plain string fields only — used when expanding a bundle so we do not re-parse nested JSON as prose. */
function simpleInsightTextFromObject(o: Record<string, unknown>): string {
  const pick = (v: unknown) => (typeof v === 'string' ? v : '');
  return (
    pick(o.insight) ||
    pick(o.body) ||
    pick(o.summary) ||
    pick(o.text) ||
    pick(o.description) ||
    pick(o.content) ||
    pick(o.message) ||
    pick(o.recommendation)
  ).trim();
}

/** Recursively collect all string values from an object/array (up to a depth limit). */
function collectStringValues(val: unknown, depth = 0): string[] {
  if (depth > 4) return [];
  if (typeof val === 'string') {
    const t = val.trim();
    return t ? [t] : [];
  }
  if (Array.isArray(val)) return val.flatMap((v) => collectStringValues(v, depth + 1));
  if (val && typeof val === 'object') {
    return Object.values(val as Record<string, unknown>).flatMap((v) => collectStringValues(v, depth + 1));
  }
  return [];
}

function insightTextFromObject(o: Record<string, unknown>): string {
  const pick = (v: unknown) => (typeof v === 'string' ? v : '');
  let insight =
    pick(o.insight) ||
    pick(o.body) ||
    pick(o.summary) ||
    pick(o.text) ||
    pick(o.description) ||
    pick(o.content) ||
    pick(o.message) ||
    pick(o.recommendation);
  insight = insight.trim();
  if (!insight) return '';
  const nested = tryParseJson(insight);
  if (nested == null) return insight;
  if (typeof nested === 'string') return nested.trim();
  if (Array.isArray(nested)) {
    const texts = nested.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
    if (texts.length > 0) return texts.join(' ');
    const deepTexts = nested.flatMap((x) => (x && typeof x === 'object' ? collectStringValues(x) : []));
    return deepTexts.length > 0 ? deepTexts.join(' ') : '';
  }
  if (typeof nested === 'object' && nested) {
    const no = nested as Record<string, unknown>;
    if (Array.isArray(no.insights)) {
      return '';
    }
    const inner =
      pick(no.insight) ||
      pick(no.body) ||
      pick(no.summary) ||
      pick(no.text) ||
      pick(no.description) ||
      pick(no.content);
    if (inner.trim()) return inner.trim();
    const deepTexts = collectStringValues(no);
    return deepTexts.length > 0 ? deepTexts.join(' ') : '';
  }
  return insight;
}

function mapRowToInsightItemFlat(item: unknown, i: number): InsightItem[] {
  if (typeof item === 'string') {
    const t = item.trim();
    return t ? [{ title: `Insight ${i + 1}`, insight: t, icon: '💡' }] : [];
  }
  if (!item || typeof item !== 'object') {
    const s = String(item ?? '').trim();
    return s ? [{ title: 'Insight', insight: s, icon: '💡' }] : [];
  }
  const o = item as Record<string, unknown>;
  const title =
    typeof o.title === 'string' && o.title.trim() ? o.title.trim() : `Insight ${i + 1}`;
  const body = simpleInsightTextFromObject(o);
  const icon = typeof o.icon === 'string' ? o.icon : '💡';
  const text = body || title;
  return text ? [{ title, insight: text, icon }] : [];
}

/** Heuristic: this string is probably a full insights JSON payload, not a normal sentence. */
function looksLikeInsightBundleField(s: string): boolean {
  const t = s.trim();
  if (t.length < 24) return false;
  return (
    t.startsWith('```') ||
    /"insights"\s*:\s*\[/i.test(t) ||
    (/^\s*[\[{]/.test(t) && t.includes('"insights"')) ||
    (t.includes('"title"') && t.includes('"insight"') && /^\s*[\[{]/.test(t))
  );
}

function expandInsightsFromPossibleBundleString(s: string): InsightItem[] {
  const t = s.trim();
  if (t.length < 12) return [];
  if (!looksLikeInsightBundleField(t)) return [];

  let parsed: unknown | null = parseJsonLenient(t);
  if (parsed == null) {
    const arr = tryParseInsightsArrayOnly(t);
    if (arr) parsed = { insights: arr };
  }
  if (parsed == null) return [];

  const rows = coerceToInsightRowList(parsed);
  if (!rows?.length) return [];
  return rows.flatMap((row, j) => mapRowToInsightItemFlat(row, j));
}

function asInsightItems(raw: unknown): InsightItem[] {
  const rows = coerceToInsightRowList(raw);
  if (!rows) return [];

  return rows
    .flatMap((item, i) => {
      if (typeof item === 'string') {
        const parsed = tryParseJson(item);
        if (parsed != null) {
          const inner = coerceToInsightRowList(parsed);
          if (inner?.length) return asInsightItems(inner);
        }
        const t = item.trim();
        if (!t) return [];
        return [{ title: `Insight ${i + 1}`, insight: t, icon: '💡' }];
      }
      if (!item || typeof item !== 'object') {
        const s = String(item ?? '').trim();
        return s ? [{ title: 'Insight', insight: s, icon: '💡' }] : [];
      }
      const o = item as Record<string, unknown>;
      if (typeof o.insight === 'string' && looksLikeInsightBundleField(o.insight)) {
        const expanded = expandInsightsFromPossibleBundleString(o.insight);
        if (expanded.length >= 2) return expanded;
        if (expanded.length === 1 && expanded[0].title !== 'Analysis') return expanded;
      }
      const title =
        typeof o.title === 'string' && o.title.trim() ? o.title.trim() : `Insight ${i + 1}`;
      const insight = insightTextFromObject(o);
      const icon = typeof o.icon === 'string' ? o.icon : '💡';
      const text = insight || title;
      return text ? [{ title, insight: text, icon }] : [];
    })
    .filter((x) => x.insight.length > 0);
}

/**
 * Some clients/proxies wrap the body; occasionally `insights` is double-encoded as a string.
 */
function unwrapInsightsBundlePayload(raw: InsightsBundleData | null | undefined): InsightsBundleData | null | undefined {
  if (raw == null || typeof raw !== 'object') return raw;
  let o = raw as Record<string, unknown>;
  if (o.data != null && typeof o.data === 'object') {
    o = o.data as Record<string, unknown>;
  }
  if (o.result != null && typeof o.result === 'object') {
    o = o.result as Record<string, unknown>;
  }
  return o as InsightsBundleData;
}

/** Split any row whose `insight` body is still an embedded bundle (multi-card JSON). */
function flattenEmbeddedInsightBundles(items: InsightItem[]): InsightItem[] {
  return items.flatMap((item) => {
    const blob = item.insight.trim();
    if (!looksLikeInsightBundleField(blob)) return [item];
    const expanded = expandInsightsFromPossibleBundleString(blob);
    return expanded.length > 1 ? expanded : [item];
  });
}

/** Handles API/cache shapes: `{ insights }`, double-wrapped `insights_bundle`, or misparsed blobs. */
function extractInsights(data: InsightsBundleData | null | undefined): InsightItem[] {
  const root = unwrapInsightsBundlePayload(data);
  if (!root) return [];

  const top = coerceToInsightRowList((root as Record<string, unknown>).insights);
  if (top?.length) {
    return flattenEmbeddedInsightBundles(maybeExpandBundledInsightsText(asInsightItems(top)));
  }

  const bundle = root.insights_bundle;
  if (bundle == null) return [];
  if (typeof bundle === 'string') {
    const parsed = tryParseJson(bundle);
    const rows = coerceToInsightRowList(parsed ?? bundle);
    return rows?.length
      ? flattenEmbeddedInsightBundles(maybeExpandBundledInsightsText(asInsightItems(rows)))
      : [];
  }
  if (typeof bundle !== 'object') return [];

  const b = bundle as Record<string, unknown>;
  let rows = coerceToInsightRowList(b.insights);
  if (!rows?.length && b.insights_bundle != null && typeof b.insights_bundle === 'object') {
    rows = coerceToInsightRowList((b.insights_bundle as Record<string, unknown>).insights);
  }
  if (!rows?.length) rows = coerceToInsightRowList(bundle);
  const items = rows?.length ? asInsightItems(rows) : [];
  return flattenEmbeddedInsightBundles(maybeExpandBundledInsightsText(items));
}

/**
 * When the API fallback returns one "Analysis" row whose body is ```json { "insights": [...] },
 * expand into separate cards (matches server after lenient parse).
 */
function maybeExpandBundledInsightsText(items: InsightItem[]): InsightItem[] {
  if (items.length !== 1) return items;
  const { title, insight } = items[0];
  const blob = insight.trim();
  if (blob.length < 12) return items;
  const looksBundled =
    title.toLowerCase() === 'analysis' ||
    looksLikeInsightBundleField(blob);
  if (!looksBundled) return items;
  const expanded = expandInsightsFromPossibleBundleString(blob);
  return expanded.length > 0 ? expanded : items;
}

export function InsightsBundleCard({ babyId }: { babyId: string | null }) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(true);
  const didFetch = useRef(false);
  const prevBabyId = useRef<string | null>(null);

  const { data, loading, error, fetch: fetchInsights, clearCache } = useAiInsight<InsightsBundleData>(
    'insights_bundle',
    babyId,
    { cacheTtlMs: 60 * 60 * 1000, cacheKeySuffix: 'shape_v7' }
  );

  useEffect(() => {
    if (!babyId) return;
    if (prevBabyId.current !== babyId) {
      prevBabyId.current = babyId;
      didFetch.current = false;
    }
    if (!didFetch.current) {
      didFetch.current = true;
      fetchInsights({});
    }
  }, [babyId]);

  const insights = extractInsights(data);

  const handleRefresh = () => {
    clearCache().then(() => fetchInsights({}));
  };

  if (!loading && !data && !error) return null;

  return (
    <DarkPanel style={[styles.wrapper, Shadows.sm]} padding="none" shadow="none">
      <TouchableOpacity onPress={() => setExpanded(!expanded)} activeOpacity={0.85}>
        <View
          style={[
            styles.headerGradient,
            {
              backgroundColor: colors.surfaceElevated,
              borderBottomWidth: expanded ? 1 : 0,
              borderBottomColor: colors.borderLight,
            },
          ]}
        >
          <View style={styles.headerRow}>
            <IconSymbol name="lightbulb.fill" size={20} color={colors.text} />
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>AI Discoveries</Text>
              <Text style={styles.headerSub}>
                {insights.length > 0
                  ? `${insights.length} personalized insights from your sleep data`
                  : 'Novel patterns & actionable tips'}
              </Text>
            </View>
            <IconSymbol
              name={expanded ? 'chevron.up' : 'chevron.down'}
              size={14}
              color="rgba(255,255,255,0.7)"
            />
          </View>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[Typography.caption, { color: colors.textSecondary, marginLeft: Spacing.sm }]}>
                Analyzing sleep patterns...
              </Text>
            </View>
          ) : error ? (
            <TouchableOpacity onPress={handleRefresh}>
              <Text style={[Typography.caption, { color: colors.error }]}>
                Could not load insights. Tap to retry.
              </Text>
            </TouchableOpacity>
          ) : insights.length > 0 ? (
            <>
              {insights.map((item, i) => (
                <View
                  key={i}
                  style={[
                    styles.insightRow,
                    i < insights.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
                  ]}
                >
                  <View style={styles.insightRowTouchable}>
                    <IconSymbol name="lightbulb.fill" size={20} color={colors.text} style={styles.insightIcon} />
                    <View style={styles.insightContent}>
                      <Text style={[Typography.bodySemiBold, { color: colors.text }]}>{item.title}</Text>
                      <Text style={[Typography.caption, { color: colors.textSecondary, marginTop: 2, lineHeight: 20 }]}>
                        {item.insight}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
              <TouchableOpacity onPress={handleRefresh} style={styles.refreshRow}>
                <Text style={[Typography.small, { color: colors.textTertiary }]}>Tap to refresh insights</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={[Typography.caption, { color: colors.textSecondary }]}>
              Log more sleep sessions to unlock personalized insights.
            </Text>
          )}
        </View>
      )}
    </DarkPanel>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 0,
    marginVertical: Spacing.sm,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    alignSelf: 'stretch',
    width: '100%',
  },
  headerGradient: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    ...Typography.bodySemiBold,
    color: '#FFFFFF',
    fontSize: 16,
  },
  headerSub: {
    ...Typography.small,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  body: {
    padding: Spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  insightRow: {
    paddingVertical: Spacing.sm,
  },
  insightRowTouchable: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  insightIcon: { marginTop: 2 },
  insightContent: {
    flex: 1,
  },
  refreshRow: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
});
