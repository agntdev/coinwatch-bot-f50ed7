import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { addCoin, clearFlow, closestCoin, commonCoins, findCoin, normaliseSymbol, profileFor } from "../crypto.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "Add coin", data: "add_coin:start", order: 10 });
const composer = new Composer<Ctx>();
const choices = inlineKeyboard([
  commonCoins().map((coin) => inlineButton(coin.symbol, `add_coin:pick:${coin.symbol}`)),
  [inlineButton("Back to menu", "menu:main")],
]);

composer.callbackQuery("add_coin:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.flow = { kind: "add" };
  await ctx.reply("Choose a coin or type its ticker.", { reply_markup: choices });
});
composer.callbackQuery(/^add_coin:pick:([A-Z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const candidate = commonCoins().find((coin) => coin.symbol === ctx.match[1]);
  if (!candidate) return;
  const added = addCoin(profileFor(ctx), candidate);
  clearFlow(ctx);
  await ctx.reply(added ? `${candidate.symbol} is now on your watchlist.` : `${candidate.symbol} is already on your watchlist.`);
});
composer.callbackQuery(/^add_coin:confirm:([A-Z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const flow = ctx.session.flow;
  if (flow?.kind !== "confirmCoin" || flow.candidate.symbol !== ctx.match[1]) return;
  const added = addCoin(profileFor(ctx), flow.candidate);
  clearFlow(ctx);
  await ctx.reply(added ? `${flow.candidate.symbol} is now on your watchlist.` : `${flow.candidate.symbol} is already on your watchlist.`);
});
composer.callbackQuery("add_coin:cancel", async (ctx) => {
  await ctx.answerCallbackQuery(); clearFlow(ctx);
  await ctx.reply("No coin was added.");
});
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.flow?.kind !== "add") return next();
  const symbol = normaliseSymbol(ctx.message.text);
  if (!symbol) { await ctx.reply("Send a ticker such as BTC or ETH."); return; }
  // Resolve an obvious typo locally first. This avoids accepting a different
  // similarly-named search result when the intended common ticker is clear.
  const suggestion = closestCoin(symbol);
  if (suggestion && suggestion.symbol !== symbol) {
    ctx.session.flow = { kind: "confirmCoin", candidate: suggestion };
    await ctx.reply(`Couldn't find ${symbol}. Did you mean ${suggestion.symbol}?`, { reply_markup: inlineKeyboard([[inlineButton(`Add ${suggestion.symbol}`, `add_coin:confirm:${suggestion.symbol}`), inlineButton("Cancel", "add_coin:cancel")]]) });
    return;
  }
  const coin = await findCoin(symbol);
  if (coin) {
    const added = addCoin(profileFor(ctx), coin); clearFlow(ctx);
    await ctx.reply(added ? `${coin.symbol} is now on your watchlist.` : `${coin.symbol} is already on your watchlist.`);
    return;
  }
  await ctx.reply("Couldn't find that ticker. Check the spelling and try again.");
});
export default composer;
