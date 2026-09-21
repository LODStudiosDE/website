import { sendGmail } from "./gmail.server";

const RECIPIENT = "lodstudio.business@gmail.com";

export type ApplicationPayload = {
  firstName: string;
  lastName: string;
  email: string;
  origin: string;
  birthdate: string;
  hobbies: string;
  experience?: string;
  references?: string;
  position: string;
};

const RED = "#FF3B3B";

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nl2br(value: string) {
  return esc(value).replace(/\n/g, "<br />");
}

function formatBerlin(date: Date) {
  const dateStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
  const timeStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
  return { dateStr, timeStr };
}

function row(label: string, value: string) {
  return `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #ececec;font:600 12px/1.4 Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:#8a8a8a;width:190px;vertical-align:top;">${esc(label)}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #ececec;font:400 15px/1.6 Arial,sans-serif;color:#1a1a1a;">${value}</td>
    </tr>`;
}

function block(title: string, value: string) {
  return `
    <tr><td colspan="2" style="padding:22px 16px 6px;font:700 12px/1.4 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:${RED};">${esc(title)}</td></tr>
    <tr><td colspan="2" style="padding:0 16px 16px;font:400 15px/1.7 Arial,sans-serif;color:#1a1a1a;border-bottom:1px solid #ececec;">${nl2br(value)}</td></tr>`;
}

export function buildApplicationHtml(data: ApplicationPayload, receivedAt: Date) {
  const { dateStr, timeStr } = formatBerlin(receivedAt);
  const fullName = `${data.firstName} ${data.lastName}`;

  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;">
    <tr>
      <td style="padding:26px 24px;background:#0C0C0D;">
        <div style="font:700 11px/1.4 Arial,sans-serif;letter-spacing:4px;text-transform:uppercase;color:${RED};">LODStudios Careers</div>
        <div style="margin-top:8px;font:700 24px/1.3 Arial,sans-serif;color:#ffffff;">New job application received</div>
        <div style="margin-top:6px;font:400 13px/1.6 Arial,sans-serif;color:#b6b6b8;">${esc(dateStr)} &middot; ${esc(timeStr)} (Europe/Berlin)</div>
      </td>
    </tr>
    <tr><td style="padding:8px 8px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${row("Position", `<strong>${esc(data.position)}</strong>`)}
        ${row("Applicant", esc(fullName))}
        ${row("Email", `<a href="mailto:${esc(data.email)}" style="color:${RED};text-decoration:none;">${esc(data.email)}</a>`)}
        ${row("Date of birth", esc(data.birthdate))}
        ${row("Origin", esc(data.origin))}
        ${row("Received (Berlin)", `${esc(dateStr)}, ${esc(timeStr)}`)}
        ${row("Received (UTC)", esc(receivedAt.toISOString()))}
        ${block("Hobbies", data.hobbies)}
        ${data.experience ? block("Experience / previous stations", data.experience) : ""}
        ${data.references ? block("References & Portfolio", data.references) : ""}
      </table>
      <div style="padding:22px 16px 4px;font:400 12px/1.7 Arial,sans-serif;color:#8a8a8a;">
        This application was submitted through the LODStudios careers page. Reply directly to this email to contact ${esc(fullName)}.
      </div>
    </td></tr>
  </table>
  </body></html>`;
}

function encodeHeader(value: string) {
  // RFC 2047 so umlauts in names/subjects stay intact.
  return /[^\x20-\x7E]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
    : value;
}

export async function sendApplicationEmail(data: ApplicationPayload) {
  const receivedAt = new Date();
  const { dateStr, timeStr } = formatBerlin(receivedAt);
  const subject = `Application ${data.position} ${data.firstName} ${data.lastName} (${dateStr}, ${timeStr})`;

  return sendGmail({
    to: RECIPIENT,
    subject,
    html: buildApplicationHtml(data, receivedAt),
    replyTo: `${encodeHeader(`${data.firstName} ${data.lastName}`)} <${data.email}>`,
    fromName: "LODStudios Careers",
  });
}
