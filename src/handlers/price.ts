import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { addCoin, applyQuotes, coinBySymbol, evaluateAlerts, fetchQuotes, formatPercent, formatUsd, profileFor, watchlistText } from "../crypto.js";

const composer = new Composer<Ctx>();
composer.command("price", async (ctx) => {
  const argument = ctx.match?.trim().toUpperCase();
  const profile = profileFor(ctx);
  if (!argument) { await ctx.reply("Send /price BTC or /price all to check prices."); return; }
  if (argument === "ALL") {
    if (!profile.watchlist.length) { await ctx.reply("Your watchlist is empty — add a coin first."); return; }
    const quotes = await fetchQuotes(profile.watchlist); applyQuotes(profile, quotes);
    if (!quotes.size) { await ctx.reply("Couldn't reach price data. Try again in a moment."); return; }
    await ctx.reply(watchlistText(profile)); for (const alert of evaluateAlerts(profile)) await ctx.reply(alert); return;
  }
  const coin = profile.watchlist.find((item) => item.symbol === argument);
  if (!coin) {
    const known = coinBySymbol(argument);
    if (!known) { await ctx.reply("Couldn't find that ticker. Check the spelling and try again."); return; }
    // A one-off quote uses the same real price feed without silently changing a watchlist.
    const temporary = { ...known }; const quotes = await fetchQuotes([temporary]); const quote = quotes.get(known.symbol);
    if (!quote) { await ctx.reply("Couldn't reach price data. Try again in a moment."); return; }
    await ctx.reply(`${known.symbol} is ${formatUsd(quote.price)}.\n1h unavailable · 24h ${formatPercent(quote.change24h)}`); return;
  }
  const quotes = await fetchQuotes([coin]); applyQuotes(profile, quotes); const updated = profile.watchlist.find((item) => item.symbol === argument)!;
  if (updated.lastPrice === undefined) { await ctx.reply("Couldn't reach price data. Try again in a moment."); return; }
  const hour = updated.hourPrice ? ((updated.lastPrice - updated.hourPrice) / updated.hourPrice) * 100 : undefined;
  await ctx.reply(`${updated.symbol} is ${formatUsd(updated.lastPrice)}.\n1h ${formatPercent(hour)} · 24h ${formatPercent(updated.change24h)}`);
  for (const alert of evaluateAlerts(profile)) await ctx.reply(alert);
});
export default composer;
