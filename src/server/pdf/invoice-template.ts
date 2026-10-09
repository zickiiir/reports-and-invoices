export interface InvoicePdfData {
  number: string;
  variableSymbol?: string | null;
  constantSymbol?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  performanceDate?: string | null;
  periodLabel?: string | null;
  note?: string | null;
  supplier: {
    name: string;
    street?: string | null;
    city?: string | null;
    zip?: string | null;
    ico?: string | null;
    dic?: string | null;
    phone?: string | null;
    invoiceEmail?: string | null;
    bankAccount?: string | null;
    bankCode?: string | null;
    signatureImageUrl?: string | null;
  };
  payer: {
    companyName: string;
    street?: string | null;
    city?: string | null;
    zip?: string | null;
    ico?: string | null;
    dic?: string | null;
  };
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    vatRate: number;
    total: number;
  }[];
  totalAmount: number;
  /** Data URI of the QR payment PNG, see `czech-payment.ts#generateQrPaymentDataUrl`. */
  qrDataUrl?: string | null;
}

const money = (n: number) =>
  n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// For values inserted into an HTML attribute (e.g. src="...") — unlike escapeHtml,
// this also escapes quotes, otherwise the attribute could be closed early and arbitrary
// HTML/JS injected into the page Puppeteer renders (and the JS would actually execute).
const escapeAttr = (s: string) => escapeHtml(s).replace(/"/g, "&quot;");

export function renderInvoiceHtml(data: InvoicePdfData): string {
  const { supplier, payer } = data;

  const rows = data.items
    .map(
      (item) => `
        <tr>
          <td class="desc">${escapeHtml(item.name)}</td>
          <td class="num">${item.quantity.toLocaleString("cs-CZ")}</td>
          <td class="num">${money(item.unitPrice)}</td>
          <td class="num">${money(item.discount)}</td>
          <td class="num">${item.vatRate}%</td>
          <td class="num total">${money(item.total)}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Helvetica Neue", Arial, sans-serif;
    color: #1a1a1a;
    font-size: 12px;
    margin: 0;
    padding: 36px 42px;
  }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #666; }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 16px;
    margin-bottom: 20px;
  }
  .top .number { text-align: right; }
  .parties {
    display: flex;
    justify-content: space-between;
    gap: 32px;
    margin-bottom: 20px;
  }
  .party { flex: 1; }
  .party h3 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #666;
    margin: 0 0 6px;
  }
  .party .name { font-weight: 700; font-size: 13px; }
  .meta {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    background: #f5f5f5;
    border-radius: 6px;
    padding: 12px 16px;
    margin-bottom: 20px;
  }
  .meta .label { color: #666; font-size: 10px; text-transform: uppercase; }
  .meta .value { font-weight: 600; }
  /* Fixed layout + explicit column widths (colgroup) so the numeric columns stay
     aligned regardless of item name length or amount size — with auto layout the
     browser re-distributes widths by content and the columns "drift". */
  table.items {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    margin-bottom: 20px;
  }
  table.items col.qty { width: 11%; }
  table.items col.price { width: 13%; }
  table.items col.discount { width: 11%; }
  table.items col.vat { width: 7%; }
  table.items col.total { width: 16%; }
  table.items th {
    text-align: left;
    font-size: 10px;
    text-transform: uppercase;
    color: #666;
    border-bottom: 1px solid #1a1a1a;
    padding: 6px 4px;
    vertical-align: bottom;
  }
  table.items td { padding: 8px 4px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  table.items .num {
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  table.items td.desc { overflow-wrap: anywhere; padding-right: 12px; }
  table.items td.total { font-weight: 600; }
  .sum {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 28px;
  }
  .sum .box { text-align: right; }
  .sum .label { color: #666; font-size: 11px; }
  .sum .amount { font-size: 22px; font-weight: 700; }
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-top: 1px solid #e5e5e5;
    padding-top: 16px;
  }
  .footer .bank div { margin-bottom: 2px; }
  .signature img { height: 96px; }
  .note { margin-top: 16px; font-size: 11px; color: #666; }
  .qr { text-align: center; margin-left: 24px; }
  .qr img { width: 125px; height: 125px; display: block; }
  .qr .label { font-size: 9px; color: #666; margin-top: 2px; }
</style>
</head>
<body>
  <div class="top">
    <div>
      <h1>Faktura – daňový doklad</h1>
      <div class="muted">${data.periodLabel ? `Fakturováno za: ${escapeHtml(data.periodLabel)}` : ""}</div>
    </div>
    <div class="number">
      <div class="muted">Číslo faktury</div>
      <div style="font-size:18px;font-weight:700;">${escapeHtml(data.number)}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Dodavatel</h3>
      <div class="name">${escapeHtml(supplier.name)}</div>
      <div>${escapeHtml(supplier.street ?? "")}</div>
      <div>${escapeHtml(supplier.zip ?? "")} ${escapeHtml(supplier.city ?? "")}</div>
      <div class="muted">IČ: ${escapeHtml(supplier.ico ?? "—")}${supplier.dic ? ` · DIČ: ${escapeHtml(supplier.dic)}` : ""}</div>
      ${supplier.phone ? `<div class="muted">Tel: ${escapeHtml(supplier.phone)}</div>` : ""}
      ${supplier.invoiceEmail ? `<div class="muted">${escapeHtml(supplier.invoiceEmail)}</div>` : ""}
    </div>
    <div class="party">
      <h3>Odběratel</h3>
      <div class="name">${escapeHtml(payer.companyName)}</div>
      <div>${escapeHtml(payer.street ?? "")}</div>
      <div>${escapeHtml(payer.zip ?? "")} ${escapeHtml(payer.city ?? "")}</div>
      <div class="muted">IČ: ${escapeHtml(payer.ico ?? "—")}${payer.dic ? ` · DIČ: ${escapeHtml(payer.dic)}` : ""}</div>
    </div>
  </div>

  <div class="meta">
    <div><div class="label">Datum vystavení</div><div class="value">${formatDate(data.issueDate)}</div></div>
    <div><div class="label">Datum splatnosti</div><div class="value">${formatDate(data.dueDate)}</div></div>
    <div><div class="label">Datum uskut. plnění</div><div class="value">${formatDate(data.performanceDate)}</div></div>
    <div><div class="label">Forma úhrady</div><div class="value">Převodem</div></div>
    ${data.variableSymbol ? `<div><div class="label">Variabilní symbol</div><div class="value">${escapeHtml(data.variableSymbol)}</div></div>` : ""}
    ${data.constantSymbol ? `<div><div class="label">Konstantní symbol</div><div class="value">${escapeHtml(data.constantSymbol)}</div></div>` : ""}
  </div>

  <table class="items">
    <colgroup>
      <col class="desc" />
      <col class="qty" />
      <col class="price" />
      <col class="discount" />
      <col class="vat" />
      <col class="total" />
    </colgroup>
    <thead>
      <tr>
        <th>Popis</th>
        <th class="num">Množství</th>
        <th class="num">Jedn. cena</th>
        <th class="num">Sleva</th>
        <th class="num">DPH</th>
        <th class="num">Celkem</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="sum">
    <div class="box">
      <div class="label">Celkem k úhradě</div>
      <div class="amount">${money(data.totalAmount)} Kč</div>
    </div>
  </div>

  <div class="footer">
    <div class="bank">
      ${supplier.bankAccount ? `<div>Číslo účtu: <strong>${escapeHtml(supplier.bankAccount)}${supplier.bankCode ? `/${escapeHtml(supplier.bankCode)}` : ""}</strong></div>` : ""}
      <div class="muted">Neplátce DPH</div>
    </div>
    ${
      supplier.signatureImageUrl
        ? `<div class="signature"><img src="${escapeAttr(supplier.signatureImageUrl)}" /></div>`
        : ""
    }
    ${
      data.qrDataUrl
        ? `<div class="qr"><img src="${escapeAttr(data.qrDataUrl)}" /><div class="label">QR platba</div></div>`
        : ""
    }
  </div>

  ${data.note ? `<div class="note">${escapeHtml(data.note)}</div>` : ""}
</body>
</html>`;
}
