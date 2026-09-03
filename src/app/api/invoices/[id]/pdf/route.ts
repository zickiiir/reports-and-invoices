import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { assertOwnerOrSuperUser } from "~/server/access/visibility";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { invoices, users } from "~/server/db/schema";
import { generateQrPaymentDataUrl } from "~/server/pdf/czech-payment";
import { renderInvoiceHtml } from "~/server/pdf/invoice-template";
import { renderHtmlToPdf } from "~/server/pdf/render";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });
  }

  const { id } = await params;
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, id),
    with: { payer: true, items: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Faktura nenalezena" }, { status: 404 });
  }

  try {
    assertOwnerOrSuperUser(session.user, invoice.userId);
  } catch {
    return NextResponse.json({ error: "Nemáte oprávnění" }, { status: 403 });
  }

  const supplier = await db.query.users.findFirst({
    where: eq(users.id, invoice.userId),
  });
  if (!supplier) {
    return NextResponse.json({ error: "Dodavatel nenalezen" }, { status: 404 });
  }

  const totalAmount = Number(invoice.totalAmount);

  const qrDataUrl =
    supplier.bankAccount && supplier.bankCode && totalAmount > 0
      ? await generateQrPaymentDataUrl({
          accountNumber: supplier.bankAccount,
          bankCode: supplier.bankCode,
          amount: totalAmount,
          variableSymbol: invoice.variableSymbol,
          message: `Faktura ${invoice.number}`,
        }).catch(() => null)
      : null;

  const html = renderInvoiceHtml({
    number: invoice.number,
    variableSymbol: invoice.variableSymbol,
    constantSymbol: invoice.constantSymbol,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    performanceDate: invoice.performanceDate,
    periodLabel: invoice.periodLabel,
    note: invoice.note,
    supplier: {
      name: supplier.name,
      street: supplier.street,
      city: supplier.city,
      zip: supplier.zip,
      ico: supplier.ico,
      dic: supplier.dic,
      phone: supplier.phone,
      invoiceEmail: supplier.invoiceEmail,
      bankAccount: supplier.bankAccount,
      bankCode: supplier.bankCode,
      signatureImageUrl: supplier.signatureImageUrl,
    },
    payer: {
      companyName: invoice.payer.companyName,
      street: invoice.payer.street,
      city: invoice.payer.city,
      zip: invoice.payer.zip,
      ico: invoice.payer.ico,
      dic: invoice.payer.dic,
    },
    items: invoice.items
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        name: item.name,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
        vatRate: Number(item.vatRate),
        total: Number(item.total),
      })),
    totalAmount,
    qrDataUrl,
  });

  const pdf = await renderHtmlToPdf(html);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="faktura-${invoice.number}.pdf"`,
    },
  });
}
