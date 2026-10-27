import corpus from "../knowledge/documents.json";

export interface KnowledgePassage {
  source: string;
  sourceFile: string;
  section: string;
  page: number;
  text: string;
}

export interface SearchResult {
  passage: KnowledgePassage;
  score: number;
}

const passages = corpus as KnowledgePassage[];
const STOP_WORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "as",
  "can",
  "do",
  "does",
  "for",
  "from",
  "i",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "please",
  "tell",
  "the",
  "this",
  "to",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "your",
]);

const TOKEN_RE = /[a-z0-9]+/g;

function tokenize(value: string): string[] {
  return (value.toLowerCase().match(TOKEN_RE) ?? []).filter(
    (token) => token.length > 1 && !STOP_WORDS.has(token),
  );
}

function expandQuestion(question: string): string {
  const normalized = question.toLowerCase();
  const additions: string[] = [];

  if (
    /\b(who are you|what is ghost\s*leaks(?:\s*ai)?|tell me about ghost\s*leaks)\b/.test(
      normalized,
    )
  ) {
    additions.push(
      "GhostLeaks Enterprise Edition is a self-hosted SaaS platform that monitors emails passwords company domains for known breach exposure. Built for MSPs cybersecurity agencies internal security teams.",
    );
  }

  if (/\b(app key|api key|x-api-key)\b/.test(normalized)) {
    additions.push(
      "REST API per-user API key X-API-Key generated registration Settings SHA-256 hash",
    );
  }

  if (/\b(gevo|faq|frequently asked questions)\b/.test(normalized)) {
    additions.push("Frequently Asked Questions FAQ");
  }

  if (/\b(deploy|deployment|install|hosting|host)\b/.test(normalized)) {
    additions.push(
      "Deployment Guide Docker Compose manual host environment variables upgrade backups scheduled alerts",
    );
  }

  if (/\b(domain|dns|txt record)\b/.test(normalized)) {
    additions.push(
      "Domain Monitoring DNS TXT ownership verification employee emails scan",
    );
  }

  if (/\b(billing|bill|payment|stripe|razorpay|license|licensing)\b/.test(normalized)) {
    additions.push(
      "Billing Stripe Checkout payment one-time purchase Razorpay",
    );
  }

  if (/\b(license|licensing|commercial license)\b/.test(normalized)) {
    additions.push(
      "Grant of License deploy modify source code white-label commercial purposes clients restrictions proprietary non-transferable",
    );
  }

  if (/\b(security|secure|csrf|ssrf|password|credential)\b/.test(normalized)) {
    additions.push(
      "Security Policy k-Anonymity bcrypt tenant isolation rate limiting webhook SSRF known limitations",
    );
  }

  if (/\b(architecture|architect|pipeline|multi tenancy|multi tenant)\b/.test(normalized)) {
    additions.push(
      "System Architecture request lifecycle data model multi-tenancy breach-checking pipeline",
    );
  }

  if (/\b(rest api|api endpoint|webhook|webhooks)\b/.test(normalized)) {
    additions.push(
      "REST API Reference authentication endpoints request response webhook payload rate limits",
    );
  }

  return [question, ...additions].join(" ");
}

const tokenizedPassages = passages.map((passage) => tokenize(passage.text));
const documentFrequency = new Map<string, number>();
let averageLength = 0;

for (const tokens of tokenizedPassages) {
  averageLength += tokens.length;
  for (const token of new Set(tokens)) {
    documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
  }
}

averageLength = passages.length > 0 ? averageLength / passages.length : 1;

function bm25Score(queryTokens: string[], passageIndex: number): number {
  const terms = new Set(queryTokens);
  const tokens = tokenizedPassages[passageIndex] ?? [];
  if (tokens.length === 0) return 0;

  const termFrequency = new Map<string, number>();
  for (const token of tokens) {
    termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
  }

  const k1 = 1.35;
  const b = 0.72;
  let score = 0;

  for (const term of terms) {
    const tf = termFrequency.get(term) ?? 0;
    if (tf === 0) continue;

    const df = documentFrequency.get(term) ?? 0;
    const idf = Math.log(1 + (passages.length - df + 0.5) / (df + 0.5));
    const lengthFactor =
      tf + k1 * (1 - b + b * (tokens.length / averageLength));
    score += idf * ((tf * (k1 + 1)) / lengthFactor);
  }

  return score;
}

function passageSimilarity(a: string, b: string): number {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function sectionHint(question: string): string | undefined {
  const normalized = question.toLowerCase();
  if (
    /\b(who are you|what is ghost\s*leaks(?:\s*ai)?|tell me about ghost\s*leaks)\b/.test(
      normalized,
    )
  ) {
    return "Overview";
  }
  if (/\b(gevo|faq|frequently asked questions)\b/.test(normalized)) {
    return "FAQ";
  }
  if (/\b(app key|api key|x-api-key|rest api|api endpoint)\b/.test(normalized)) {
    return "REST API";
  }
  if (/\b(webhook|webhooks)\b/.test(normalized)) return "Webhooks";
  if (/\b(billing|bill|payment|stripe|razorpay|checkout)\b/.test(normalized)) {
    return "Billing";
  }
  if (/\b(license|licensing|commercial license)\b/.test(normalized)) {
    return "License";
  }
  if (/\b(domain|dns|txt record)\b/.test(normalized)) {
    return "Domain Monitoring";
  }
  if (/\b(deploy|deployment|install|hosting|host)\b/.test(normalized)) {
    return "Deployment";
  }
  if (/\b(architecture|architect|pipeline|multi tenancy|multi tenant)\b/.test(normalized)) {
    return "Architecture";
  }
  if (/\b(security|secure|csrf|ssrf|password|credential)\b/.test(normalized)) {
    return "Security";
  }
  return undefined;
}

export function searchKnowledge(
  question: string,
  limit = 3,
  sourceFilter?: string,
): SearchResult[] {
  const queryTokens = tokenize(expandQuestion(question));
  if (queryTokens.length === 0) return [];

  const baseTokens = tokenize(question);
  const targetSection = sectionHint(question);
  const relevantBaseMatches = baseTokens.filter((token) =>
    documentFrequency.has(token),
  ).length;
  if (
    !targetSection &&
    baseTokens.length >= 2 &&
    relevantBaseMatches < Math.min(2, baseTokens.length)
  ) {
    return [];
  }

  const ranked = passages
    .map((passage, index) => ({
      passage,
      score:
        bm25Score(queryTokens, index) +
        (targetSection === passage.section ? 9 : 0),
    }))
    .filter(
      (result) => !sourceFilter || result.passage.source === sourceFilter,
    )
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score);

  const bestScore = ranked[0]?.score ?? 0;
  if (bestScore < 1.15) return [];

  const minimumScore = Math.max(0.95, bestScore * 0.36);
  const selected: SearchResult[] = [];

  for (const result of ranked) {
    if (result.score < minimumScore) break;
    if (
      selected.some(
        (existing) =>
          passageSimilarity(existing.passage.text, result.passage.text) > 0.72,
      )
    ) {
      continue;
    }
    selected.push(result);
    if (selected.length >= limit) break;
  }

  return selected;
}

export function isGhostLeaksIdentityQuestion(question: string): boolean {
  return /\b(who are you|what is ghost\s*leaks\s*ai)\b/i.test(question);
}

export function isGhostLeaksAiQuestion(question: string): boolean {
  return /\bwhat is ghost\s*leaks\s*ai\b/i.test(question);
}

export function isPaymentQuestion(question: string): boolean {
  return /\b(billing|bill|payment|stripe|razorpay|checkout)\b/i.test(question);
}

export const UNSUPPORTED_ANSWER =
  "I’m not sure from the reference material I have. I can connect you with a team member who can help with that.";

export const GREETING_ANSWER = "I am GhostLEAKS AI";
