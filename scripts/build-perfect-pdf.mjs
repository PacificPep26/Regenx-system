import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const AUDIT_DIR = resolve(".audit/flow");
const OUT_PDF = resolve("RegenX_Order_Flow_User_Guide.pdf");
const ARTIFACT_PDF = "C:/Users/HP/.gemini/antigravity/brain/e692306b-939b-428c-ab7c-529e546abaf5/RegenX_Order_Flow_User_Guide.pdf";

function getBase64(filename) {
  const p = join(AUDIT_DIR, filename);
  const data = readFileSync(p);
  return `data:image/png;base64,${data.toString("base64")}`;
}

const steps = [
  {
    num: 1,
    title: "Step 1: Enter Customer & Delivery Details",
    desc: "The partner navigates to /s/[store]/orders/new, selects an existing customer or inputs a new recipient address with automatic US state validation.",
    img: getBase64("step1_partner_order_form.png"),
  },
  {
    num: 2,
    title: "Step 2: Add Products & Select Quantities",
    desc: "Click 'Add products' to search the peptide catalog. Tier wholesale pricing is applied automatically (5% Starter, 10% Premium).",
    img: getBase64("step2_product_picker_modal.png"),
  },
  {
    num: 3,
    title: "Step 3: Review Order & Calculated Net Pricing",
    desc: "Review selected items, vial quantities, catalog wholesale rates, tier discount deductions, and final net total before committing.",
    img: getBase64("step3_order_form_calculated.png"),
  },
  {
    num: 4,
    title: "Step 4: Submit Order & Automatic Credit Approval",
    desc: "Click 'Submit order'. The system verifies available credit deposit, deducts purchasing funds, and marks the order APPROVED immediately.",
    img: getBase64("step4_order_submitted_approved.png"),
  },
  {
    num: 5,
    title: "Step 5: Store Partner Notification Log",
    desc: "The partner notifications page updates with real-time status confirmations, timestamps, and direct clickable links to the order record.",
    img: getBase64("step5_partner_notifications.png"),
  },
  {
    num: 6,
    title: "Step 6: HQ Admin Dashboard Alerts",
    desc: "The HQ Admin dashboard instantly displays updated order volume and an unread notification badge next to the store name in the navigation sidebar.",
    img: getBase64("step6_admin_overview_badge.png"),
  },
  {
    num: 7,
    title: "Step 7: Admin In-App Bell Alert & Central Inbox",
    desc: "HQ Admin receives real-time order alerts via the top bell panel and central inbox, showing store name, order number, and wholesale amount.",
    img: getBase64("step7_admin_notification_bell.png"),
  },
  {
    num: 8,
    title: "Step 8: Global Pharmaceutical (GP) Warehouse Queue",
    desc: "The warehouse fulfillment queue ingests the approved order in real-time, displaying patient delivery lines for packing and shipping label generation.",
    img: getBase64("step9_gp_fulfillment_queue.png"),
  },
];

const totalSteps = steps.length;

const pagesHtml = steps
  .map(
    (s) => `
  <div class="page">
    <div class="header">
      <div>
        <div class="title">REGENX PARTNER HUB</div>
        <div class="subtitle">Order Placement to Notification Workflow</div>
      </div>
      <div class="step-badge">${s.num} / ${totalSteps}</div>
    </div>

    <div class="main-content">
      <h1 class="step-title">${s.title}</h1>
      <p class="step-desc">${s.desc}</p>
      <div class="img-frame">
        <img src="${s.img}" alt="${s.title}" />
      </div>
    </div>

    <div class="footer">
      <span>RegenX Labs &bull; Standard Operating Procedure</span>
      <span>Page ${s.num} of ${totalSteps}</span>
    </div>
  </div>
`
  )
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>RegenX Labs - Order to Notification Workflow</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #000000;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      width: 210mm;
      height: 297mm;
      padding: 14mm 16mm 12mm 16mm;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }

    .page:last-child {
      page-break-after: avoid;
    }

    .header {
      border-bottom: 2px solid #000000;
      padding-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }

    .title {
      font-size: 15pt;
      font-weight: 800;
      letter-spacing: -0.5px;
      text-transform: uppercase;
      color: #000000;
    }

    .subtitle {
      font-size: 9pt;
      color: #444444;
      font-weight: 500;
      margin-top: 1px;
    }

    .step-badge {
      font-size: 10pt;
      font-weight: 800;
      color: #000000;
      letter-spacing: 0.5px;
    }

    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      margin-top: 12px;
      margin-bottom: 12px;
      min-height: 0;
    }

    .step-title {
      font-size: 13pt;
      font-weight: 700;
      margin-bottom: 4px;
      color: #000000;
    }

    .step-desc {
      font-size: 9.5pt;
      color: #333333;
      margin-bottom: 10px;
      line-height: 1.35;
    }

    .img-frame {
      flex: 1;
      border: 1px solid #000000;
      background: #ffffff;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 0;
    }

    .img-frame img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: block;
    }

    .footer {
      border-top: 1px solid #cccccc;
      padding-top: 6px;
      display: flex;
      justify-content: space-between;
      font-size: 8pt;
      color: #666666;
    }
  </style>
</head>
<body>
${pagesHtml}
</body>
</html>`;

const tempHtml = resolve(".audit/perfect_guide.html");
writeFileSync(tempHtml, html, "utf-8");

console.log("Generating 8-page perfect B&W PDF...");
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});

const page = await browser.newPage();
await page.goto(`file:///${tempHtml.replace(/\\\\/g, "/")}`, { waitUntil: "networkidle" });

const pdfBuf = await page.pdf({
  format: "A4",
  printBackground: true,
  margin: {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
});

writeFileSync(OUT_PDF, pdfBuf);
writeFileSync(ARTIFACT_PDF, pdfBuf);

await browser.close();
console.log(`Successfully generated perfect PDF: ${OUT_PDF} (${pdfBuf.length} bytes)`);
