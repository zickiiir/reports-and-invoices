import JSZip from "jszip";
import { NextResponse } from "next/server";

import { assertCanReadTimesheet } from "~/server/access/visibility";
import { auth } from "~/server/auth";
import { readTimesheetRaw } from "~/server/timesheet/storage";
import { suggestedFilename } from "~/server/timesheet/filename";

const PERIOD_RE = /^\d{6}$/;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });
  }

  const url = new URL(req.url);
  const userIdParam = url.searchParams.get("userId");
  const userId = userIdParam && userIdParam.length > 0 ? userIdParam : session.user.id;
  const periods = (url.searchParams.get("periods") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (periods.length === 0 || !periods.every((p) => PERIOD_RE.test(p))) {
    return NextResponse.json({ error: "Neplatná období" }, { status: 400 });
  }

  try {
    await assertCanReadTimesheet(session.user, userId);
  } catch {
    return NextResponse.json({ error: "Nemáte oprávnění" }, { status: 403 });
  }

  if (periods.length === 1) {
    const period = periods[0]!;
    const content = await readTimesheetRaw(userId, period);
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${suggestedFilename(period)}"`,
      },
    });
  }

  const zip = new JSZip();
  for (const period of periods) {
    const content = await readTimesheetRaw(userId, period);
    zip.file(suggestedFilename(period), content);
  }
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const sorted = [...periods].sort();
  const zipName = `vykazy_${sorted[0]}-${sorted[sorted.length - 1]}.zip`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
    },
  });
}
