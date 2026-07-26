import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { clearFlow, profileFor, validTime } from "../crypto.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { syncCryptoSchedule } from "../toolkit/session/durable.js";

registerMainMenuItem({ label: "Morning summary", data: "morning_summary:start", order: 50 });
const composer = new Composer<Ctx>();
function timeMenu() { return inlineKeyboard([[inlineButton("08:00 UTC", "morning:time:08:00"), inlineButton("09:00 UTC", "morning:time:09:00")], [inlineButton("Set another time", "morning:custom")], [inlineButton("Turn off", "morning:off")]]); }
composer.callbackQuery("morning_summary:start", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply("Choose when to receive your morning summary.", { reply_markup: timeMenu() }); });
composer.callbackQuery(/^morning:time:(\d\d:\d\d)$/, async (ctx) => { await ctx.answerCallbackQuery(); const time = ctx.match[1]; profileFor(ctx).morningSummary = { enabled: true, time }; clearFlow(ctx); if (ctx.chat) await syncCryptoSchedule((ctx as Ctx & { env?: Parameters<typeof syncCryptoSchedule>[0] }).env, ctx.chat.id, time); await ctx.reply(`Your morning summary is set for ${time} UTC.`); });
composer.callbackQuery("morning:custom", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "morningTime" }; await ctx.reply("Send a summary time in UTC, like 08:30.", { reply_markup: { force_reply: true, input_field_placeholder: "08:30" } }); });
composer.callbackQuery("morning:off", async (ctx) => { await ctx.answerCallbackQuery(); profileFor(ctx).morningSummary = { enabled: false, time: "08:00" }; clearFlow(ctx); if (ctx.chat) await syncCryptoSchedule((ctx as Ctx & { env?: Parameters<typeof syncCryptoSchedule>[0] }).env, ctx.chat.id); await ctx.reply("Morning summaries are off."); });
composer.on("message:text", async (ctx, next) => { if (ctx.session.flow?.kind !== "morningTime") return next(); const time = validTime(ctx.message.text); if (!time) { await ctx.reply("Use a 24-hour time such as 08:30."); return; } profileFor(ctx).morningSummary = { enabled: true, time }; clearFlow(ctx); if (ctx.chat) await syncCryptoSchedule((ctx as Ctx & { env?: Parameters<typeof syncCryptoSchedule>[0] }).env, ctx.chat.id, time); await ctx.reply(`Your morning summary is set for ${time} UTC.`); });
export default composer;
