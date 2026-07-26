import type { Ctx } from "./bot.js";

export type AlertType = "threshold" | "percent";
export interface WatchCoin {
  symbol: string;
  id: string;
  name: string;
  lastPrice?: number;
  lastPriceAt?: number;
  hourPrice?: number;
  hourPriceAt?: number;
  change24h?: number;
}
export interface AlertRule {
  id: number;
  symbol: string;
  type: AlertType;
  value: number;
  enabled: boolean;
  lastAlertAt?: number;
  lastObservedPrice?: number;
}
export interface QueuedAlert { ruleId: number; text: string; queuedAt: number; }
export interface Profile {
  watchlist: WatchCoin[];
  alerts: AlertRule[];
  quietHours?: { start: string; end: string };
  morningSummary?: { enabled: boolean; time: string };
  queuedAlerts: QueuedAlert[];
  nextAlertId: number;
}
export type Flow =
  | { kind: "add" }
  | { kind: "confirmCoin"; candidate: CoinDefinition }
  | { kind: "alertValue"; symbol: string; type: AlertType }
  | { kind: "confirmAlert"; rule: AlertRule }
  | { kind: "quietStart" }
  | { kind: "quietEnd"; start: string }
  | { kind: "morningTime" };

export interface CoinDefinition { symbol: string; id: string; name: string; }

// These are stable CoinGecko ids, not prices or sample data. Additional coins
// are discovered through CoinGecko's search endpoint before being saved.
const KNOWN_COINS: CoinDefinition[] = [
  { symbol: "BTC", id: "bitcoin", name: "Bitcoin" },
  { symbol: "ETH", id: "ethereum", name: "Ethereum" },
  { symbol: "TON", id: "the-open-network", name: "Toncoin" },
  { symbol: "SOL", id: "solana", name: "Solana" },
  { symbol: "DOGE", id: "dogecoin", name: "Dogecoin" },
  { symbol: "USDC", id: "usd-coin", name: "USD Coin" },
];

let clock: () => number = () => Date.now();
/** Injectable clock seam used by alert cooldowns, quiet hours, and summaries. */
export function now(): number { return clock(); }
export function setClockForTests(value?: () => number): void { clock = value ?? (() => Date.now()); }

export function profileFor(ctx: Ctx): Profile {
  if (!ctx.profile) {
    ctx.profile = { watchlist: [], alerts: [], queuedAlerts: [], nextAlertId: 1 };
  }
  return ctx.profile;
}

export function clearFlow(ctx: Ctx): void { delete ctx.session.flow; }
export function coinBySymbol(symbol: string): CoinDefinition | undefined {
  return KNOWN_COINS.find((coin) => coin.symbol === symbol.toUpperCase());
}
export function commonCoins(): CoinDefinition[] { return KNOWN_COINS.slice(0, 3); }
export function normaliseSymbol(value: string): string | undefined {
  const symbol = value.trim().toUpperCase();
  return /^[A-Z0-9]{2,12}$/.test(symbol) ? symbol : undefined;
}
export function addCoin(profile: Profile, coin: CoinDefinition): boolean {
  if (profile.watchlist.some((item) => item.symbol === coin.symbol)) return false;
  profile.watchlist.push({ ...coin });
  return true;
}
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value);
}
export function formatPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "unavailable";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

interface PriceResponse { [id: string]: { usd?: number; usd_24h_change?: number }; }
/** Fetches price data in small batches. A feed outage produces no invented quote. */
export async function fetchQuotes(coins: WatchCoin[]): Promise<Map<string, { price: number; change24h?: number }>> {
  const output = new Map<string, { price: number; change24h?: number }>();
  for (let index = 0; index < coins.length; index += 50) {
    const batch = coins.slice(index, index + 50);
    const ids = batch.map((coin) => coin.id).join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true`;
    let body: PriceResponse | undefined;
    for (let attempt = 0; attempt < 3 && !body; attempt += 1) {
      try {
        const response = await fetch(url);
        if (response.ok) body = (await response.json()) as PriceResponse;
      } catch { /* retry silently: price alerts must not create outage noise */ }
    }
    if (!body) continue;
    for (const coin of batch) {
      const quote = body[coin.id];
      if (typeof quote?.usd === "number") output.set(coin.symbol, { price: quote.usd, change24h: quote.usd_24h_change });
    }
  }
  return output;
}

export function applyQuotes(profile: Profile, quotes: Map<string, { price: number; change24h?: number }>): void {
  const timestamp = now();
  for (const coin of profile.watchlist) {
    const quote = quotes.get(coin.symbol);
    if (!quote) continue;
    if (coin.lastPrice !== undefined && coin.lastPriceAt !== undefined && timestamp - coin.lastPriceAt >= 60 * 60 * 1000) {
      coin.hourPrice = coin.lastPrice;
      coin.hourPriceAt = coin.lastPriceAt;
    }
    if (coin.hourPriceAt !== undefined && timestamp - coin.hourPriceAt > 2 * 60 * 60 * 1000) {
      coin.hourPrice = undefined;
      coin.hourPriceAt = undefined;
    }
    coin.lastPrice = quote.price;
    coin.lastPriceAt = timestamp;
    coin.change24h = quote.change24h;
  }
}

export async function findCoin(symbol: string): Promise<CoinDefinition | undefined> {
  const known = coinBySymbol(symbol);
  if (known) return known;
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`);
    if (!response.ok) return undefined;
    const data = (await response.json()) as { coins?: Array<{ id?: string; symbol?: string; name?: string }> };
    const match = data.coins?.find((coin) => coin.symbol?.toUpperCase() === symbol) ?? data.coins?.[0];
    if (!match?.id || !match.symbol || !match.name) return undefined;
    return { id: match.id, symbol: match.symbol.toUpperCase(), name: match.name };
  } catch { return undefined; }
}

export function closestCoin(symbol: string): CoinDefinition | undefined {
  const sorted = KNOWN_COINS.map((coin) => ({ coin, score: editDistance(symbol, coin.symbol) }))
    .sort((a, b) => a.score - b.score);
  return sorted[0]?.score <= 3 ? sorted[0].coin : undefined;
}
function editDistance(a: string, b: string): number {
  const table = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j += 1) table[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) table[i][j] = Math.min(table[i - 1][j] + 1, table[i][j - 1] + 1, table[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return table[a.length][b.length];
}

export function validTime(value: string): string | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const hour = Number(match[1]); const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` : undefined;
}
function inQuietHours(quiet: Profile["quietHours"], at = now()): boolean {
  if (!quiet || quiet.start === quiet.end) return false;
  const date = new Date(at);
  const current = date.getUTCHours() * 60 + date.getUTCMinutes();
  const [sh, sm] = quiet.start.split(":").map(Number); const [eh, em] = quiet.end.split(":").map(Number);
  const start = sh * 60 + sm; const end = eh * 60 + em;
  return start < end ? current >= start && current < end : current >= start || current < end;
}
export function evaluateAlerts(profile: Profile): string[] {
  const messages: string[] = [];
  const timestamp = now();
  for (const rule of profile.alerts) {
    if (!rule.enabled) continue;
    const coin = profile.watchlist.find((item) => item.symbol === rule.symbol);
    if (!coin?.lastPrice) continue;
    const previousPrice = rule.lastObservedPrice;
    rule.lastObservedPrice = coin.lastPrice;
    if (rule.lastAlertAt && timestamp - rule.lastAlertAt < 24 * 60 * 60 * 1000) continue;
    const move = coin.hourPrice ? ((coin.lastPrice - coin.hourPrice) / coin.hourPrice) * 100 : undefined;
    const hit = rule.type === "threshold"
      ? coin.lastPrice >= rule.value && (previousPrice === undefined || previousPrice < rule.value)
      : move !== undefined && Math.abs(move) >= rule.value;
    if (!hit) continue;
    const text = rule.type === "threshold"
      ? `${coin.symbol} reached ${formatUsd(coin.lastPrice)}.`
      : `${coin.symbol} moved ${formatPercent(move)} in the last hour.`;
    rule.lastAlertAt = timestamp;
    if (inQuietHours(profile.quietHours, timestamp)) profile.queuedAlerts.push({ ruleId: rule.id, text, queuedAt: timestamp });
    else messages.push(text);
  }
  if (!inQuietHours(profile.quietHours, timestamp) && profile.queuedAlerts.length) {
    messages.push(...profile.queuedAlerts.map((alert) => alert.text));
    profile.queuedAlerts = [];
  }
  return messages;
}
export function watchlistText(profile: Profile): string {
  if (!profile.watchlist.length) return "No coins in your watchlist yet — tap Add coin to add one.";
  return profile.watchlist.map((coin) => {
    const lastPrice = coin.lastPrice;
    const price = lastPrice === undefined ? "Price unavailable" : formatUsd(lastPrice);
    const hour = coin.hourPrice && lastPrice !== undefined ? formatPercent(((lastPrice - coin.hourPrice) / coin.hourPrice) * 100) : "unavailable";
    return `${coin.symbol} · ${price}\n1h ${hour} · 24h ${formatPercent(coin.change24h)}`;
  }).join("\n\n");
}
export function morningSummaryText(profile: Profile): string {
  if (!profile.watchlist.length) return "Your morning summary has no coins yet — add a coin first.";
  return `Morning summary\n\n${watchlistText(profile)}`;
}
