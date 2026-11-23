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

const img1 = getBase64("step1_partner_order_form.png");
const img2 = getBase64("step2_product_picker_modal.png");
const img3 = getBase64("step3_order_form_calculated.png");
const img4 = getBase64("step4_order_submitted_approved.png");
const img5 = getBase64("step5_partner_notifications.png");
const img6 = getBase64("step6_admin_overview_badge.png");
const img7 = getBase64("step7_admin_notification_bell.png");
const img8 = getBase64("step8_admin_notifications_list.png");
const img9 = getBase64("step9_gp_fulfillment_queue.png");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>RegenX Labs - Order to Notification Workflow</title>
  <style>
    @page {
      size: A4;
      margin: 12mm 15mm 12mm 15mm;
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
      line-height: 1.4;
      font-size: 11pt;
    }

    .doc-header {
      border-bottom: 2px solid #000000;
      padding-bottom: 8px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }

    .doc-title {
      font-size: 16pt;
      font-weight: 800;
      letter-spacing: -0.5px;
      text-transform: uppercase;
    }

    .doc-sub {
      font-size: 9.5pt;
      color: #444444;
      font-weight: 500;
    }

    .step-block {
      page-break-inside: avoid;
      margin-bottom: 22px;
    }

    .step-heading {
      font-size: 12pt;
      font-weight: 700;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .step-text {
      font-size: 9.5pt;
      color: #333333;
      margin-bottom: 8px;
    }

    .step-img-box {
      border: 1px solid #000000;
      background: #ffffff;
      overflow: hidden;
    }

    .step-img-box img {
      width: 100%;
      max-height: 100mm;
      object-fit: contain;
      object-position: top;
      display: block;
    }

    .page-break {
      page-break-after: always;
    }

    .footer {
      border-top: 1px solid #cccccc;
      padding-top: 6px;
      margin-top: 14px;
      display: flex;
      justify-content: space-between;
      font-size: 8pt;
      color: #666666;
    }
  </style>
</head>
<body>

  <!-- PAGE 1 -->
  <div class="doc-header">
    <div>
      <div class="doc-title">RegenX Partner Hub</div>
      <div class="doc-sub">Order Placement to Notification Workflow</div>
    </div>
    <div style="font-size: 8.5pt; color: #444444; text-align: right;">
      Standard Operating Procedure
    </div>
  </div>

  <!-- STEP 1 -->
  <div class="step-block">
    <div class="step-heading">Step 1: Enter Customer & Delivery Details</div>
    <div class="step-text">
      The partner navigates to <code>/orders/new</code>, selects an existing customer or inputs a new recipient address with country and state validation.
    </div>
    <div class="step-img-box">
      <img src="${img1}" alt="Step 1: Partner Order Form" />
    </div>
  </div>

  <!-- STEP 2 -->
  <div class="step-block">
    <div class="step-heading">Step 2: Add Products & Select Quantities</div>
    <div class="step-text">
      Click "Add products" to search the peptide catalog. Tier wholesale pricing is applied automatically (5% Starter, 10% Premium).
    </div>
    <div class="step-img-box">
      <img src="${img2}" alt="Step 2: Product Picker" />
    </div>
  </div>

  <div class="footer">
    <div>RegenX Labs &bull; Order Flow Guide</div>
    <div>Page 1 of 4</div>
  </div>

  <div class="page-break"></div>

  <!-- PAGE 2 -->
  <div class="doc-header">
    <div class="doc-title">RegenX Partner Hub</div>
    <div class="doc-sub">Order Review &amp; Instant Submission</div>
  </div>

  <!-- STEP 3 -->
  <div class="step-block">
    <div class="step-heading">Step 3: Review Order & Calculated Net Pricing</div>
    <div class="step-text">
      Review items, quantities, catalog wholesale rates, tier discount deductions, and final net total before committing.
    </div>
    <div class="step-img-box">
      <img src="${img3}" alt="Step 3: Review Calculations" />
    </div>
  </div>

  <!-- STEP 4 -->
  <div class="step-block">
    <div class="step-heading">Step 4: Submit Order &amp; Automated Credit Deduction</div>
    <div class="step-text">
      Click "Submit order". The system checks store credit balance, deducts purchasing funds, and marks the order APPROVED immediately.
    </div>
    <div class="step-img-box">
      <img src="${img4}" alt="Step 4: Order Approved" />
    </div>
  </div>

  <div class="footer">
    <div>RegenX Labs &bull; Order Flow Guide</div>
    <div>Page 2 of 4</div>
  </div>

  <div class="page-break"></div>

  <!-- PAGE 3 -->
  <div class="doc-header">
    <div class="doc-title">RegenX Partner Hub</div>
    <div class="doc-sub">Notifications &amp; Real-Time Alerts</div>
  </div>

  <!-- STEP 5 -->
  <div class="step-block">
    <div class="step-heading">Step 5: Store Partner Notification Log</div>
    <div class="step-text">
      The partner portal notifications panel updates with real-time status confirmations and direct order links.
    </div>
    <div class="step-img-box">
      <img src="${img5}" alt="Step 5: Store Notifications" />
    </div>
  </div>

  <!-- STEP 6 -->
  <div class="step-block">
    <div class="step-heading">Step 6: HQ Admin Dashboard Alerts</div>
    <div class="step-text">
      The Admin dashboard instantly displays updated order counts and an unread notification badge next to the store name in the navigation sidebar.
    </div>
    <div class="step-img-box">
      <img src="${img6}" alt="Step 6: Admin Dashboard Badge" />
    </div>
  </div>

  <div class="footer">
    <div>RegenX Labs &bull; Order Flow Guide</div>
    <div>Page 3 of 4</div>
  </div>

  <div class="page-break"></div>

  <!-- PAGE 4 -->
  <div class="doc-header">
    <div class="doc-title">RegenX Partner Hub</div>
    <div class="doc-sub">HQ Notification Inbox &amp; Warehouse Fulfillment</div>
  </div>

  <!-- STEP 7 -->
  <div class="step-block">
    <div class="step-heading">Step 7: Admin In-App Notifications &amp; Central Inbox</div>
    <div class="step-text">
      HQ Admin receives real-time order alerts via the notification bell dropdown and central inbox, showing store name and wholesale order volume.
    </div>
    <div class="step-img-box" style="margin-bottom: 8px;">
      <img src="${img7}" alt="Step 7: Admin Bell Panel" style="max-height: 52mm;" />
    </div>
    <div class="step-img-box">
      <img src="${img8}" alt="Step 7b: Admin Inbox" style="max-height: 52mm;" />
    </div>
  </div>

  <!-- STEP 8 -->
  <div class="step-block">
    <div class="step-heading">Step 8: Global Pharmaceutical (GP) Warehouse Queue</div>
    <div class="step-text">
      The warehouse fulfillment queue ingests the approved order in real-time, displaying patient delivery lines for packing and shipping label generation.
    </div>
    <div class="step-img-box">
      <img src="${img9}" alt="Step 8: Warehouse Fulfillment" style="max-height: 56mm;" />
    </div>
  </div>

  <div class="footer">
    <div>RegenX Labs &bull; Order Flow Guide</div>
    <div>Page 4 of 4</div>
  </div>

</body>
</html>`;

const tempHtml = resolve(".audit/guide_bw.html");
writeFileSync(tempHtml, html, "utf-8");

console.log("Generating B&W minimalist PDF...");
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});

const page = await browser.newPage();
await page.goto(`file://${tempHtml}`, { waitUntil: "networkidle" });

await page.pdf({
  path: OUT_PDF,
  format: "A4",
  printBackground: true,
  margin: {
    top: "12mm",
    bottom: "12mm",
    left: "14mm",
    right: "14mm",
  },
});

await page.pdf({
  path: ARTIFACT_PDF,
  format: "A4",
  printBackground: true,
  margin: {
    top: "12mm",
    bottom: "12mm",
    left: "14mm",
    right: "14mm",
  },
});

await browser.close();
console.log(`Minimalist B&W PDF generated at: ${OUT_PDF}`);
