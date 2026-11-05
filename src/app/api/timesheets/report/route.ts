import JSZip from "jszip";
import { NextResponse } from "next/server";

import { assertCanReadTimesheet } from "~/server/access/visibility";
import { auth } from "~/server/auth";
import { renderHtmlToPdf } from "~/server/pdf/render";
import {
  parseTimesheet,
  renderTimesheetBody,
  renderTimesheetHtml,
  type PersonTimesheet,
} from "~/server/timesheet/parse";
import { readTimesheetRaw } from "~/server/timesheet/storage";

const PERIOD_RE = /^\d{6}$/;

/** HTML/PDF timesheet for one or more customers (alias, comma-separated) for a period —
 * for sending to a manager (HTML) or attaching to a customer's invoice (PDF). Multiple
 * aliases are assembled into a single multi-page document in the PDF (each customer
 * starts on a new page); `format=zip` packs one standalone .htm per customer instead.
 * Generated from the current content on disk, not from a previously saved .htm file. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });
  }

  const url = new URL(req.url);
  const userIdParam = url.searchParams.get("userId");
  const userId = userIdParam && userIdParam.length > 0 ? userIdParam : session.user.id;
  const period = url.searchParams.get("period") ?? "";
  const aliases = [
    ...new Set(
      (url.searchParams.get("alias") ?? "")
        .split(",")
        .map((a) => a.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  const formatParam = url.searchParams.get("format");
  const format = formatParam === "pdf" || formatParam === "zip" ? formatParam : "html";

  if (!PERIOD_RE.test(period) || aliases.length === 0) {
    return NextResponse.json({ error: "Neplatné parametry" }, { status: 400 });
  }

  try {
    await assertCanReadTimesheet(session.user, userId);
  } catch {
    return NextResponse.json({ error: "Nemáte oprávnění" }, { status: 403 });
  }

  const raw = await readTimesheetRaw(userId, period);
  const parsed = parseTimesheet(raw, period);

  const people = aliases
    .map((alias) => parsed.perPerson.find((p) => p.alias === alias))
    .filter((p): p is PersonTimesheet => p !== undefined);

  if (people.length === 0) {
    return NextResponse.json(
      { error: "Žádný z odběratelů nemá ve výkazu záznamy" },
      { status: 404 },
    );
  }

  if (format === "zip") {
    const zip = new JSZip();
    for (const person of people) {
      // An alias is any non-whitespace token from the timesheet, which may belong to a
      // subordinate — it must not be able to turn into a path inside the archive.
      const safeAlias = person.alias.replace(/[^\p{L}\p{N}_-]/gu, "_");
      zip.file(`Vykaz_${safeAlias}_${period}.htm`, renderTimesheetHtml(person, period));
    }
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="Vykazy_HTML_${period}.zip"`,
      },
    });
  }

  // The timesheet table is floated (`align="left"`), so the wrapper has to contain it
  // (flow-root) — otherwise the next customer flows beside the table and a page break
  // placed after it lands in the wrong spot.
  const combinedBody = people
    .map(
      (person, i) =>
        `<div style="display: flow-root;${i > 0 ? " break-before: page;" : ""}">${renderTimesheetBody(person, period)}</div>`,
    )
    .join("");
  const html = `<html><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><body>${combinedBody}</body></html>`;
  const filenameBase =
    people.length === 1 ? `Vykaz_${people[0]!.alias}_${period}` : `Vykazy_${period}`;

  if (format === "pdf") {
    const pdf = await renderHtmlToPdf(html);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filenameBase}.pdf"`,
      },
    });
  }

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="${filenameBase}.htm"`,
    },
  });
}
