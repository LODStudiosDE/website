// Direct Google Gmail REST API integration (OAuth2 refresh-token flow).
// The Gmail send endpoint requires an OAuth2 access token with the
// https://www.googleapis.com/auth/gmail.send scope — a plain API key is not
// sufficient. We exchange a long-lived refresh token for short-lived access
// tokens and cache them until shortly before they expire.
import "./load-env.server";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export function gmailConfigured() {
  return (
    !!process.env["GOOGLE_CLIENT_ID"] &&
    !!process.env["GOOGLE_CLIENT_SECRET"] &&
    !!process.env["GOOGLE_REFRESH_TOKEN"]
  );
}

export function gmailSender() {
  return process.env["GMAIL_SENDER"] ?? "";
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const clientId = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  const refreshToken = process.env["GOOGLE_REFRESH_TOKEN"];
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Gmail OAuth2 credentials are not configured");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail token refresh failed [${res.status}]: ${text}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

function encodeHeader(value: string) {
  // RFC 2047 so umlauts in names/subjects stay intact.
  return /[^\x20-\x7E]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
    : value;
}

function encodeMime(raw: string) {
  return Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type MailAttachment = {
  filename: string;
  contentType: string;
  // Raw base64 (no data: prefix) of the file contents.
  contentBase64: string;
  // When set, the image can be referenced inline via `cid:<cid>` in the HTML.
  cid?: string;
};

export type GmailMessage = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  fromName?: string;
  attachments?: MailAttachment[];
};

// RFC 2045 requires base64 bodies to be wrapped at 76 characters per line.
function wrap76(b64: string): string {
  return b64.replace(/[\r\n]/g, "").replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

export async function sendGmail(msg: GmailMessage) {
  const token = await accessToken();
  const sender = gmailSender();
  const fromHeader = msg.fromName ? `${encodeHeader(msg.fromName)} <${sender}>` : sender;

  const headers = [
    `To: ${msg.to}`,
    sender ? `From: ${fromHeader}` : null,
    msg.replyTo ? `Reply-To: ${msg.replyTo}` : null,
    `Subject: ${encodeHeader(msg.subject)}`,
    "MIME-Version: 1.0",
  ].filter((line): line is string => line !== null);

  const attachments = msg.attachments ?? [];

  let mime: string;
  if (attachments.length === 0) {
    mime = [
      ...headers,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      msg.html,
    ].join("\r\n");
  } else {
    // multipart/related keeps inline (cid) images bundled with the HTML so
    // email clients render them instead of hiding "external" content.
    const boundary = `lod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const parts: string[] = [
      `Content-Type: multipart/related; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      msg.html,
    ];
    for (const att of attachments) {
      const disposition = att.cid ? "inline" : "attachment";
      parts.push(
        `--${boundary}`,
        `Content-Type: ${att.contentType}; name="${att.filename}"`,
        "Content-Transfer-Encoding: base64",
        ...(att.cid ? [`Content-ID: <${att.cid}>`] : []),
        `Content-Disposition: ${disposition}; filename="${att.filename}"`,
        "",
        wrap76(att.contentBase64),
      );
    }
    parts.push(`--${boundary}--`);
    mime = [...headers, ...parts].join("\r\n");
  }

  const res = await fetch(SEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ raw: encodeMime(mime) }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Gmail send failed [${res.status}]: ${text}`);
    throw new Error(`Could not send email [${res.status}]`);
  }

  return { ok: true as const };
}
