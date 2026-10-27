import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();
export const DOCUMENTED_CONTACT_EMAIL = "ritdmdkkd@gmail.com";

export interface SupportRequest {
  company: string;
  workEmail: string;
  request: string;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export async function sendSupportRequest(
  supportRequest: SupportRequest,
): Promise<void> {
  const body = [
    "A GhostLeaks request was submitted through the Telegram bot.",
    "",
    `Company: ${supportRequest.company}`,
    `Work email: ${supportRequest.workEmail}`,
    "",
    "Request:",
    supportRequest.request,
  ].join("\r\n");

  const rawMessage = [
    `To: ${DOCUMENTED_CONTACT_EMAIL}`,
    "Subject: GhostLeaks Telegram request",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\r\n");

  const response = await connectors.proxy(
    "google-mail",
    "/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      body: { raw: encodeBase64Url(rawMessage) },
    },
  );

  if (!response.ok) {
    throw new Error(`Gmail send failed with status ${response.status}`);
  }
}
