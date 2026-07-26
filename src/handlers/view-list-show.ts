import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { applyQuotes, evaluateAlerts, fetchQuotes, profileFor, watchlistText } from "../crypto.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "View list", data: "view_list:show", order: 20 });
const composer = new Composer<Ctx>();
composer.callbackQuery("view_list:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = profileFor(ctx);
  if (profile.watchlist.length) { applyQuotes(profile, await fetchQuotes(profile.watchlist)); }
  await ctx.reply(watchlistText(profile), { reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) });
  for (const alert of evaluateAlerts(profile)) await ctx.reply(alert);
});
export default composer;
