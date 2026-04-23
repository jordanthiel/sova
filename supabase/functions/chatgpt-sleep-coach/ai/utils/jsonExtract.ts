export function extractJsonFromText(raw: string): string {
  let s = raw.trim();
  const open = s.match(/^```(?:json)?\s*\n?/i);
  if (open) s = s.slice(open[0].length);
  const close = s.match(/\n?```\s*$/);
  if (close) s = s.slice(0, -close[0].length);
  s = s.trim();
  if (s && s[0] !== '{') {
    const start = s.indexOf('{');
    if (start !== -1) {
      let depth = 0;
      let end = -1;
      for (let i = start; i < s.length; i++) {
        if (s[i] === '{') depth++;
        else if (s[i] === '}') {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end !== -1) s = s.slice(start, end + 1);
    }
  }
  return s;
}
