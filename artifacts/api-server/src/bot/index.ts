import { Bot, InlineKeyboard } from "grammy";
import { logger } from "../lib/logger";
import {
  GREETING_ANSWER,
  isGhostLeaksAiQuestion,
  isGhostLeaksIdentityQuestion,
  isPaymentQuestion,
  searchKnowledge,
  UNSUPPORTED_ANSWER,
} from "./knowledge";
import {
  DOCUMENTED_CONTACT_EMAIL,
  sendSupportRequest,
  type SupportRequest,
} from "./gmail";

type ContactStep = "company" | "workEmail" | "request" | "confirmation";

interface ContactSession extends Partial<SupportRequest> {
  chatId: number;
  userId: number;
  step: ContactStep;
  updatedAt: number;
  sending?: boolean;
}

const MAX_SESSION_AGE_MS = 30 * 60 * 1000;
const MAX_REQUEST_LENGTH = 2000;
const MAX_COMPANY_LENGTH = 100;
const sessions = new Map<number, ContactSession>();
const sentRequestTimes = new Map<number, number[]>();
const globalSentRequestTimes: number[] = [];

const CONTACT_PREVIEW =
  `The PDF lists ${DOCUMENTED_CONTACT_EMAIL} for licensing questions and vulnerability reports; general-support availability is not verified.`;

function isGreeting(text: string): boolean {
  return /^(hi|hii+|hello|hey|namaste|नमस्ते)[!. ]*$/i.test(text);
}

function isStartCommand(text: string): boolean {
  return /^\/start(?:@\w+)?(?:\s|$)/i.test(text);
}

function isForwardRequest(text: string): boolean {
  return (
    /^\/(?:forward|contact)(?:@\w+)?(?:\s|$)/i.test(text) ||
    /\bforward\s+(?:my|this|the)\s+request\b/i.test(text) ||
    /\bemail\s+(?:my|this|the)\s+request\b/i.test(text) ||
    /\bconnect\s+me\s+with\s+(?:a\s+)?team\s+member\b/i.test(text) ||
    /\b(?:meri|is|yeh)\s+request\s+(?:forward|email|bhej)\b/i.test(text) ||
    /\brequest\s+(?:forward|email)\s+(?:kar(?:o|do|dena)|bhej)\b/i.test(text)
  );
}

function isValidEmail(value: string): boolean {
  return (
    value.length <= 320 &&
    /^[^\s<>@,;]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value)
  );
}

function getLiveSession(chatId: number): ContactSession | undefined {
  const session = sessions.get(chatId);
  if (!session) return undefined;
  if (Date.now() - session.updatedAt > MAX_SESSION_AGE_MS) {
    sessions.delete(chatId);
    return undefined;
  }
  return session;
}

function canSendRequest(userId: number): boolean {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const userTimes = (sentRequestTimes.get(userId) ?? []).filter(
    (timestamp) => timestamp > hourAgo,
  );
  const globalTimes = globalSentRequestTimes.filter(
    (timestamp) => timestamp > hourAgo,
  );

  sentRequestTimes.set(userId, userTimes);
  globalSentRequestTimes.splice(
    0,
    globalSentRequestTimes.length,
    ...globalTimes,
  );

  return userTimes.length < 3 && globalTimes.length < 30;
}

function markRequestAttempt(userId: number): void {
  const now = Date.now();
  sentRequestTimes.set(userId, [
    ...(sentRequestTimes.get(userId) ?? []),
    now,
  ]);
  globalSentRequestTimes.push(now);
}

function truncateForTelegram(text: string): string {
  return text.length <= 3800 ? text : `${text.slice(0, 3790)}…`;
}

function formatKnowledgeAnswer(question: string): string {
  const results = searchKnowledge(question, 2);
  if (results.length === 0) return UNSUPPORTED_ANSWER;

  if (isPaymentQuestion(question)) {
    const olderPaymentPassage = searchKnowledge(
      "Razorpay Payment Integration",
      1,
      "GhostLeaks Documentation v2",
    )[0];
    if (
      olderPaymentPassage &&
      !results.some(
        (result) =>
          result.passage.source === olderPaymentPassage.passage.source &&
          result.passage.page === olderPaymentPassage.passage.page,
      )
    ) {
      results.push(olderPaymentPassage);
    }
  }

  const sections = results.map(({ passage }) => {
    const textLimit = isPaymentQuestion(question) ? 900 : 1150;
    const text =
      passage.text.length <= textLimit
        ? passage.text
        : `${passage.text.slice(0, textLimit - 1)}…`;
    return `${text}\n\nSource: ${passage.source}, page ${passage.page}`;
  });
  let answer = sections.join("\n\n---\n\n");

  if (isPaymentQuestion(question)) {
    answer =
      "Note: PDFs payment provider par ek jaise nahi hain. Documentation v2 Razorpay batata hai; Complete Documentation aur Architecture Stripe batate hain. Neeche source passages diye hain.\n\n" +
      answer;
  }

  if (isGhostLeaksIdentityQuestion(question)) {
    if (isGhostLeaksAiQuestion(question)) {
      answer =
        "PDFs GhostLeaks Enterprise Edition ka overview dete hain; “GhostLeaks AI” naam ke alag AI product ka description nahi dete.\n\n" +
        answer;
    }
  }

  if (/\bapp key\b/i.test(question)) {
    answer =
      "PDFs isse “per-user API key” kehte hain; “App Key” label use nahi karte.\n\n" +
      answer;
  }

  return truncateForTelegram(answer);
}

export function createGhostLeaksBot(token: string): Bot {
  const bot = new Bot(token);

  bot.command("start", async (ctx) => {
    sessions.delete(ctx.chat.id);
    await ctx.reply(GREETING_ANSWER);
  });

  bot.command("cancel", async (ctx) => {
    sessions.delete(ctx.chat.id);
    await ctx.reply("Request forward karna cancel kar diya gaya.");
  });

  bot.command("forward", async (ctx) => {
    if (ctx.chat.type !== "private") {
      await ctx.reply("Privacy ke liye mujhe private chat mein message karein.");
      return;
    }
    const userId = ctx.from?.id;
    if (userId === undefined) {
      await ctx.reply("Telegram user details nahi mil sake. Dobara try karein.");
      return;
    }
    sessions.set(ctx.chat.id, {
      chatId: ctx.chat.id,
      userId,
      step: "company",
      updatedAt: Date.now(),
    });
    await ctx.reply("Aapki company ka naam kya hai?");
  });

  bot.on("message:text", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    const text = ctx.message.text.trim();
    if (isStartCommand(text)) {
      sessions.delete(ctx.chat.id);
      await ctx.reply(GREETING_ANSWER);
      return;
    }

    if (isGreeting(text)) {
      await ctx.reply(GREETING_ANSWER);
      return;
    }

    if (/^\/cancel(?:@\w+)?(?:\s|$)/i.test(text)) {
      sessions.delete(ctx.chat.id);
      await ctx.reply("Request forward karna cancel kar diya gaya.");
      return;
    }

    const session = getLiveSession(ctx.chat.id);
    if (session && session.userId !== userId) {
      await ctx.reply("Yeh request kisi aur user ki hai. /forward se apni request shuru karein.");
      return;
    }

    if (session?.step === "company") {
      if (text.length < 2 || text.length > MAX_COMPANY_LENGTH) {
        await ctx.reply("Company name 2–100 characters ka hona chahiye.");
        return;
      }
      session.company = text;
      session.step = "workEmail";
      session.updatedAt = Date.now();
      await ctx.reply("Aapka work email address kya hai?");
      return;
    }

    if (session?.step === "workEmail") {
      if (!isValidEmail(text)) {
        await ctx.reply("Valid work email bhejein, jaise name@company.com.");
        return;
      }
      session.workEmail = text;
      session.step = "request";
      session.updatedAt = Date.now();
      await ctx.reply("Kya request team ko bhejni hai? Apna message likhein.");
      return;
    }

    if (session?.step === "request") {
      if (text.length < 5 || text.length > MAX_REQUEST_LENGTH) {
        await ctx.reply(`Request 5–${MAX_REQUEST_LENGTH} characters ki honi chahiye.`);
        return;
      }
      session.request = text;
      session.step = "confirmation";
      session.updatedAt = Date.now();

      const preview = [
        CONTACT_PREVIEW,
        "",
        `Company: ${session.company}`,
        `Work email: ${session.workEmail}`,
        "",
        "Request:",
        session.request,
        "",
        "Kya aap is message ko bhejna chahte hain?",
      ].join("\n");
      const keyboard = new InlineKeyboard()
        .text("Send email", "request:confirm")
        .text("Cancel", "request:cancel");
      await ctx.reply(truncateForTelegram(preview), { reply_markup: keyboard });
      return;
    }

    if (session?.step === "confirmation") {
      await ctx.reply("Neeche Send email ya Cancel button choose karein.");
      return;
    }

    if (isForwardRequest(text)) {
      if (ctx.chat.type !== "private") {
        await ctx.reply("Privacy ke liye mujhe private chat mein message karein.");
        return;
      }
      sessions.set(ctx.chat.id, {
        chatId: ctx.chat.id,
        userId,
        step: "company",
        updatedAt: Date.now(),
      });
      await ctx.reply("Aapki company ka naam kya hai?");
      return;
    }

    await ctx.reply(formatKnowledgeAnswer(text));
  });

  bot.callbackQuery("request:cancel", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) {
      await ctx.answerCallbackQuery({ text: "Yeh request expire ho gayi hai." });
      return;
    }
    const session = getLiveSession(chatId);
    if (!session || session.userId !== ctx.from.id) {
      await ctx.answerCallbackQuery({ text: "Yeh request expire ho gayi hai." });
      return;
    }
    sessions.delete(chatId);
    await ctx.answerCallbackQuery({ text: "Request cancel ho gayi." });
    await ctx.reply("Request forward karna cancel kar diya gaya.");
  });

  bot.callbackQuery("request:confirm", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) {
      await ctx.answerCallbackQuery({ text: "Yeh request expire ho gayi hai." });
      return;
    }
    const session = getLiveSession(chatId);
    if (
      !session ||
      session.userId !== ctx.from.id ||
      session.step !== "confirmation" ||
      session.sending
    ) {
      await ctx.answerCallbackQuery({ text: "Yeh request expire ho gayi hai." });
      return;
    }

    if (!session.company || !session.workEmail || !session.request) {
      sessions.delete(chatId);
      await ctx.answerCallbackQuery({ text: "Request details missing hain." });
      await ctx.reply("Details dobara dene ke liye /forward bhejein.");
      return;
    }

    if (!canSendRequest(session.userId)) {
      sessions.delete(chatId);
      await ctx.answerCallbackQuery({ text: "Request limit reached." });
      await ctx.reply("Is account se ek ghante mein zyada requests forward nahi ki ja sakti.");
      return;
    }

    session.sending = true;
    await ctx.answerCallbackQuery({ text: "Email bhej raha hoon…" });
    try {
      markRequestAttempt(session.userId);
      await sendSupportRequest({
        company: session.company,
        workEmail: session.workEmail,
        request: session.request,
      });
      sessions.delete(chatId);
      logger.info(
        { telegramUserId: session.userId },
        "Telegram support request sent",
      );
      await ctx.reply("Request email kar di gayi hai.");
    } catch (error) {
      sessions.delete(chatId);
      logger.error(
        { err: error, telegramUserId: session.userId },
        "Failed to send Telegram support request",
      );
      await ctx.reply(
        "Email ka status confirm nahi ho paya. Dobara bhejne se pehle apne Gmail Sent folder check karein.",
      );
    }
  });

  bot.catch((error) => {
    logger.error(
      {
        errorType:
          error.error instanceof Error ? error.error.name : "unknown",
        updateId: error.ctx.update.update_id,
      },
      "Telegram bot update failed",
    );
  });

  return bot;
}
