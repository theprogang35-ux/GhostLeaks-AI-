import app from "./app";
import { createGhostLeaksBot } from "./bot";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  const telegramToken = process.env["TELEGRAM_BOT_TOKEN"];
  if (!telegramToken) {
    logger.warn("TELEGRAM_BOT_TOKEN is not configured; Telegram bot is disabled");
    return;
  }

  const bot = createGhostLeaksBot(telegramToken);
  void bot
    .start({
      onStart: (botInfo) => {
        logger.info(
          { username: botInfo.username },
          "GhostLeaks Telegram bot started",
        );
      },
    })
    .catch((error: unknown) => {
      logger.error(
        { errorType: error instanceof Error ? error.name : "unknown" },
        "GhostLeaks Telegram bot failed to start",
      );
    });

  process.once("SIGINT", () => bot.stop());
  process.once("SIGTERM", () => bot.stop());
});
