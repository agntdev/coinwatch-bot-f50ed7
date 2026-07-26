import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { clearFlow, formatUsd, profileFor } from "../crypto.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { syncCryptoSchedule } from "../toolkit/session/durable.js";

registerMainMenuItem({ label: "Create alert", data: "create_alert:start", order: 30 });
const composer = new Composer<Ctx>();
composer.callbackQuery("create_alert:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = profileFor(ctx);
  if (!profile.watchlist.length) { await ctx.reply("Add a coin before creating an alert."); return; }
  await ctx.reply("Choose a coin for this alert.", { reply_markup: inlineKeyboard([...profile.watchlist.map((coin) => [inlineButton(coin.symbol, `alert:coin:${coin.symbol}`)]), [inlineButton("Back to menu", "menu:main")]]) });
});
composer.callbackQuery(/^alert:coin:([A-Z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const symbol = ctx.match[1];
  if (!profileFor(ctx).watchlist.some((coin) => coin.symbol === symbol)) return;
  await ctx.reply(`Choose the alert type for ${symbol}.`, { reply_markup: inlineKeyboard([[inlineButton("Price threshold", `alert:type:${symbol}:threshold`), inlineButton("1h move", `alert:type:${symbol}:percent`)], [inlineButton("Cancel", "alert:cancel")]]) });
});
composer.callbackQuery(/^alert:type:([A-Z0-9]+):(threshold|percent)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const [, symbol, type] = ctx.match;
  ctx.session.flow = { kind: "alertValue", symbol, type: type as "threshold" | "percent" };
  const prompt = type === "threshold" ? "Send the USD price that should trigger this alert." : "Send the 1-hour percentage move that should trigger this alert.";
  await ctx.reply(prompt, { reply_markup: { force_reply: true, input_field_placeholder: type === "threshold" ? "For example: 70000" : "For example: 5" } });
});
composer.callbackQuery("alert:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const flow = ctx.session.flow;
  if (flow?.kind !== "confirmAlert") return;
  const profile = profileFor(ctx); profile.alerts.push(flow.rule); clearFlow(ctx);
  if (ctx.chat) await syncCryptoSchedule((ctx as Ctx & { env?: Parameters<typeof syncCryptoSchedule>[0] }).env, ctx.chat.id, profile.morningSummary?.enabled ? profile.morningSummary.time : undefined);
  await ctx.reply(`${flow.rule.symbol} alert is active.`);
});
composer.callbackQuery("alert:cancel", async (ctx) => { await ctx.answerCallbackQuery(); clearFlow(ctx); await ctx.reply("No alert was created."); });
composer.on("message:text", async (ctx, next) => {
  const flow = ctx.session.flow;
  if (flow?.kind !== "alertValue") return next();
  const value = Number(ctx.message.text.trim().replace(/[$,%\s,]/g, ""));
  if (!Number.isFinite(value) || value <= 0) { await ctx.reply("Send a positive number to continue."); return; }
  const profile = profileFor(ctx);
  const rule = { id: profile.nextAlertId++, symbol: flow.symbol, type: flow.type, value, enabled: true } as const;
  ctx.session.flow = { kind: "confirmAlert", rule };
  const description = rule.type === "threshold" ? `when it reaches ${formatUsd(rule.value)}` : `when it moves ${rule.value}% in an hour`;
  await ctx.reply(`Create an alert for ${rule.symbol} ${description}?`, { reply_markup: inlineKeyboard([[inlineButton("Create alert", "alert:confirm"), inlineButton("Cancel", "alert:cancel")]]) });
});
export default composer;
