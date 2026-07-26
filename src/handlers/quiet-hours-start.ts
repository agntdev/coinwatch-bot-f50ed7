import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { clearFlow, profileFor, validTime } from "../crypto.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { syncCryptoSchedule } from "../toolkit/session/durable.js";

registerMainMenuItem({ label: "Quiet hours", data: "quiet_hours:start", order: 40 });
const composer = new Composer<Ctx>();
const cancel = inlineKeyboard([[inlineButton("Cancel", "quiet:cancel")]]);
composer.callbackQuery("quiet_hours:start", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "quietStart" }; await ctx.reply("Send the quiet-hours start time in UTC, like 22:00.", { reply_markup: { force_reply: true, input_field_placeholder: "22:00" } }); });
composer.callbackQuery("quiet:cancel", async (ctx) => { await ctx.answerCallbackQuery(); clearFlow(ctx); await ctx.reply("Quiet hours were not changed."); });
composer.on("message:text", async (ctx, next) => {
  const flow = ctx.session.flow;
  if (flow?.kind !== "quietStart" && flow?.kind !== "quietEnd") return next();
  const time = validTime(ctx.message.text);
  if (!time) { await ctx.reply("Use a 24-hour time such as 22:00.", { reply_markup: cancel }); return; }
  if (flow.kind === "quietStart") { ctx.session.flow = { kind: "quietEnd", start: time }; await ctx.reply("Now send the end time in UTC, like 07:00.", { reply_markup: { force_reply: true, input_field_placeholder: "07:00" } }); return; }
  const profile = profileFor(ctx); profile.quietHours = { start: flow.start, end: time }; clearFlow(ctx);
  if (ctx.chat) await syncCryptoSchedule((ctx as Ctx & { env?: Parameters<typeof syncCryptoSchedule>[0] }).env, ctx.chat.id, profile.morningSummary?.enabled ? profile.morningSummary.time : undefined);
  await ctx.reply(`Alerts will stay quiet from ${flow.start} to ${time} UTC. Queued alerts arrive afterwards.`);
});
export default composer;
