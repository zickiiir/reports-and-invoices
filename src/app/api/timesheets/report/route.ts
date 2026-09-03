import { NextResponse } from "next/server";

import { assertCanReadTimesheet } from "~/server/access/visibility";
import { auth } from "~/server/auth";
import { renderHtmlToPdf } from "~/server/pdf/render";
import { parseTimesheet, renderTimesheetBody } from "~/server/timesheet/parse";
import { readTimesheetRaw } from "~/server/timesheet/storage";

const PERIOD_RE = /^\d{6}$/;

/** HTML/PDF timesheet for one or more customers (alias, comma-separated) for a period —
 * for sending to a manager (HTML) or attaching to a customer's invoice (PDF). Multiple
 * aliases are assembled into a single multi-page document in the PDF (a page break
 * between customers). Generated from the current content on disk, not from a
 * previously saved .htm file. */
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
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "html";

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

  const bodies = aliases
    .map((alias) => {
      const person = parsed.perPerson.find((p) => p.alias === alias);
      return person ? { alias, body: renderTimesheetBody(person, period) } : null;
    })
    .filter((x): x is { alias: string; body: string } => x !== null);

  if (bodies.length === 0) {
    return NextResponse.json(
      { error: "Žádný z odběratelů nemá ve výkazu záznamy" },
      { status: 404 },
    );
  }

  const combinedBody = bodies
    .map((b) => b.body)
    .join('<div style="page-break-after: always;"></div>');
  const html = `<html><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><body>${combinedBody}</body></html>`;
  const filenameBase =
    bodies.length === 1 ? `Vykaz_${bodies[0]!.alias}_${period}` : `Vykazy_${period}`;

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
