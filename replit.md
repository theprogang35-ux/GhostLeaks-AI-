# GhostLeaks Telegram Knowledge Bot

Telegram bot that answers GhostLeaks questions only from the supplied PDFs and forwards user-approved requests to the contact listed in those documents.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secret: `TELEGRAM_BOT_TOKEN` — Telegram bot token from BotFather.
- Gmail request forwarding uses the connected Gmail integration; no Gmail password is stored in the app.
- The bot does not require `DATABASE_URL`; chat-flow state and rate limits are currently in memory.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/bot/knowledge.ts` — extractive passage retrieval and exact unsupported-answer fallback.
- `artifacts/api-server/src/bot/index.ts` — Telegram commands, Q&A routing, and the confirmed request-forwarding flow.
- `artifacts/api-server/src/bot/gmail.ts` — Gmail API send adapter for user-confirmed support requests.
- `artifacts/api-server/src/knowledge/documents.json` — page-cited text corpus generated from the three supplied PDFs.
- `artifacts/api-server/knowledge/sources/` — original PDFs used by the bot.

## Architecture decisions

- Answers are extractive passages from the source PDFs, not free-form model generations, to avoid unsupported claims.
- Every answer includes the PDF title and page number; low-confidence searches use the user's exact fallback message.
- Conflicting payment-provider statements are shown as a documentation mismatch (Razorpay in v2 vs. Stripe in the Enterprise docs).
- Forwarded messages require an explicit Telegram confirmation and use the fixed recipient printed in the PDFs.

## Product

- Replies to `/start` and greetings with `I am GhostLEAKS AI`.
- Retrieves passages for overview, features, deployment, API, security, domain monitoring, architecture, billing, licensing, and FAQ questions.
- Collects company, work email, and request text for forwarding; previews the recipient and message before sending via the connected Gmail account.

## User preferences

- Do not answer beyond the supplied PDFs; when no supporting passage is found, use the exact fallback configured in the bot.

## Gotchas

- The contact email is documented for licensing questions and vulnerability reports; the PDFs do not verify that it is a general-support address or that it is currently active.
- Rebuild the source corpus after replacing or updating PDFs by running `python3 artifacts/api-server/scripts/build-knowledge-base.py`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
