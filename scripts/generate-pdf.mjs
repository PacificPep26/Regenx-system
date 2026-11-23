import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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
  <title>RegenX Partner Hub - Order to Notification Guide</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

    @page {
      size: A4;
      margin: 14mm 14mm 14mm 14mm;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1e293b;
      background: #ffffff;
      line-height: 1.5;
      font-size: 13px;
    }

    .header-banner {
      border-bottom: 3px solid #c8102e;
      padding-bottom: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }

    .brand-title {
      font-size: 24px;
      font-weight: 800;
      color: #1b2a41;
      letter-spacing: -0.5px;
    }

    .brand-subtitle {
      font-size: 13px;
      color: #64748b;
      font-weight: 500;
      margin-top: 2px;
    }

    .doc-meta {
      text-align: right;
      font-size: 11px;
      color: #64748b;
    }

    .badge-user-guide {
      display: inline-block;
      background: #eff6ff;
      color: #1d4ed8;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      margin-bottom: 4px;
      text-transform: uppercase;
    }

    .intro-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #1b2a41;
      border-radius: 6px;
      padding: 14px 16px;
      margin-bottom: 24px;
    }

    .intro-title {
      font-size: 14px;
      font-weight: 700;
      color: #1b2a41;
      margin-bottom: 6px;
    }

    .roles-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-top: 10px;
    }

    .role-box {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px;
    }

    .role-name {
      font-size: 12px;
      font-weight: 700;
      color: #c8102e;
      margin-bottom: 2px;
    }

    .role-desc {
      font-size: 11px;
      color: #64748b;
    }

    .step-section {
      margin-bottom: 26px;
      page-break-inside: avoid;
    }

    .step-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }

    .step-num {
      background: #1b2a41;
      color: #ffffff;
      font-size: 12px;
      font-weight: 800;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .step-title {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
    }

    .step-desc {
      font-size: 12.5px;
      color: #334155;
      margin-bottom: 10px;
      margin-left: 34px;
    }

    .step-points {
      margin-left: 50px;
      margin-bottom: 12px;
      font-size: 12px;
      color: #475569;
    }

    .step-points li {
      margin-bottom: 4px;
    }

    .img-container {
      margin-left: 34px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      overflow: hidden;
      background: #f1f5f9;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }

    .img-container img {
      width: 100%;
      display: block;
    }

    .img-caption {
      padding: 6px 12px;
      font-size: 11px;
      color: #64748b;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      font-style: italic;
    }

    .page-break {
      page-break-after: always;
    }

    .faq-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 12px;
    }

    .faq-table th {
      background: #1b2a41;
      color: #ffffff;
      text-align: left;
      padding: 8px 12px;
      font-weight: 600;
    }

    .faq-table td {
      border: 1px solid #e2e8f0;
      padding: 8px 12px;
      vertical-align: top;
    }

    .faq-table tr:nth-child(even) td {
      background: #f8fafc;
    }

    .footer {
      border-top: 1px solid #e2e8f0;
      margin-top: 24px;
      padding-top: 10px;
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #94a3b8;
    }
  </style>
</head>
<body>

  <!-- PAGE 1: COVER & OVERVIEW -->
  <div class="header-banner">
    <div>
      <div class="brand-title">REGENX PARTNER HUB</div>
      <div class="brand-subtitle">Standard Operating Guide: Order Placement to Notification Delivery</div>
    </div>
    <div class="doc-meta">
      <div class="badge-user-guide">Business & Operations Guide</div>
      <div>Target: Store Owners, Ops & Fulfillment</div>
    </div>
  </div>

  <div class="intro-card">
    <div class="intro-title">How the System Works in 30 Seconds</div>
    <p style="color: #475569; font-size: 12px; line-height: 1.6;">
      RegenX operates a wholesale drop-ship network with Global Pharmaceutical (GP). When your retail customer purchases peptides on your store website, you enter their delivery details here. Wholesale costs are automatically deducted from your prepaid credit deposit with tier discounts. The moment you submit, both HQ Admin and the warehouse are notified immediately.
    </p>

    <div class="roles-grid">
      <div class="role-box">
        <div class="role-name">1. Partner Store</div>
        <div class="role-desc">Enters customer orders, selects products, tracks available prepaid credit balance.</div>
      </div>
      <div class="role-box">
        <div class="role-name">2. RegenX Admin</div>
        <div class="role-desc">HQ monitors system-wide volume, tracks payments, approves over-credit holds.</div>
      </div>
      <div class="role-box">
        <div class="role-name">3. GP Warehouse</div>
        <div class="role-desc">Receives approved orders instantly in their packing queue to pick, pack & ship.</div>
      </div>
    </div>
  </div>

  <!-- STEP 1 -->
  <div class="step-section">
    <div class="step-header">
      <div class="step-num">1</div>
      <div class="step-title">Enter Customer & Shipping Information</div>
    </div>
    <div class="step-desc">
      On your store portal (<code>/s/[store]/orders/new</code>), choose whether to ship to an <strong>Existing Customer</strong> or register a <strong>New Customer</strong>.
    </div>
    <ul class="step-points">
      <li><strong>Delivery Address:</strong> Enter full name, email, phone, street address, city, state, and ZIP code.</li>
      <li><strong>Automatic State Rules:</strong> Selecting United States provides a standard state dropdown, while international destinations provide flexible address fields.</li>
      <li><strong>Order Notes:</strong> Add optional patient references or delivery instructions.</li>
    </ul>
    <div class="img-container">
      <img src="${img1}" alt="Step 1: Partner Order Form" />
      <div class="img-caption">Figure 1.1: Clean, mobile-friendly order creation screen for store partners.</div>
    </div>
  </div>

  <div class="page-break"></div>

  <!-- PAGE 2: PRODUCT SELECTION & PRICING -->
  <div class="header-banner">
    <div>
      <div class="brand-title">REGENX PARTNER HUB</div>
      <div class="brand-subtitle">Product Selection & Wholesale Pricing</div>
    </div>
    <div class="doc-meta">
      <div>Step 2 & Step 3</div>
    </div>
  </div>

  <!-- STEP 2 -->
  <div class="step-section">
    <div class="step-header">
      <div class="step-num">2</div>
      <div class="step-title">Search & Select Wholesale Products</div>
    </div>
    <div class="step-desc">
      Click <strong>"Add products"</strong> to launch the interactive catalog browser containing all ~313 peptide SKUs.
    </div>
    <ul class="step-points">
      <li><strong>Instant Search:</strong> Search by peptide name (e.g. "BPC", "Semaglutide", "TB-500") or strength.</li>
      <li><strong>Automatic Tier Discounts:</strong> Wholesale pricing automatically applies your store's tier savings (<strong>5% off for Starter</strong>, <strong>10% off for Premium</strong>).</li>
      <li><strong>Quantity Controls:</strong> Adjust vial counts with single-click plus/minus steppers.</li>
    </ul>
    <div class="img-container">
      <img src="${img2}" alt="Step 2: Product Picker Modal" />
      <div class="img-caption">Figure 2.1: Catalog modal with instant product search, vial strength, and tier discounted pricing.</div>
    </div>
  </div>

  <!-- STEP 3 -->
  <div class="step-section">
    <div class="step-header">
      <div class="step-num">3</div>
      <div class="step-title">Review Line Items & Net Pricing Summary</div>
    </div>
    <div class="step-desc">
      Review your selected products, discounted unit prices, and final order total before submitting.
    </div>
    <ul class="step-points">
      <li><strong>Transparent Math:</strong> Line items clearly show catalog price, partner discount, and total.</li>
      <li><strong>Save Draft Option:</strong> Save as draft anytime if you need customer confirmation before spending credit.</li>
    </ul>
    <div class="img-container">
      <img src="${img3}" alt="Step 3: Order Form Calculated" />
      <div class="img-caption">Figure 3.1: Final review showing customer destination, line items, and net total.</div>
    </div>
  </div>

  <div class="page-break"></div>

  <!-- PAGE 3: SUBMISSION, APPROVAL & PARTNER NOTIFICATION -->
  <div class="header-banner">
    <div>
      <div class="brand-title">REGENX PARTNER HUB</div>
      <div class="brand-subtitle">Order Submission & Instant Approval</div>
    </div>
    <div class="doc-meta">
      <div>Step 4 & Step 5</div>
    </div>
  </div>

  <!-- STEP 4 -->
  <div class="step-section">
    <div class="step-header">
      <div class="step-num">4</div>
      <div class="step-title">One-Click Submission & Instant Approval</div>
    </div>
    <div class="step-desc">
      Clicking <strong>"Submit order"</strong> executes automatic safety and balance checks in less than a second:
    </div>
    <ul class="step-points">
      <li><strong>Credit Check:</strong> If your prepaid credit deposit covers the order, the system instantly marks it <strong>APPROVED</strong>.</li>
      <li><strong>Overage Protection:</strong> If the order exceeds available credit, credit is applied and the remainder is held (<strong>ON HOLD</strong>) until HQ approves the overage.</li>
      <li><strong>Regulatory Compliance:</strong> Destination is verified against your authorized geographic regions.</li>
    </ul>
    <div class="img-container">
      <img src="${img4}" alt="Step 4: Order Approved" />
      <div class="img-caption">Figure 4.1: Order detail page immediately confirming APPROVED status and credit deduction.</div>
    </div>
  </div>

  <!-- STEP 5 -->
  <div class="step-section">
    <div class="step-header">
      <div class="step-num">5</div>
      <div class="step-title">Store Partner Notification History</div>
    </div>
    <div class="step-desc">
      Your store's notification inbox logs all major order events with timestamps and one-click links.
    </div>
    <div class="img-container">
      <img src="${img5}" alt="Step 5: Partner Notifications" />
      <div class="img-caption">Figure 5.1: Notifications page keeping store operators updated on order approvals and shipments.</div>
    </div>
  </div>

  <div class="page-break"></div>

  <!-- PAGE 4: ADMIN & WAREHOUSE NOTIFICATIONS -->
  <div class="header-banner">
    <div>
      <div class="brand-title">REGENX PARTNER HUB</div>
      <div class="brand-subtitle">HQ Alerts & Warehouse Ingestion</div>
    </div>
    <div class="doc-meta">
      <div>Step 6 to Step 8</div>
    </div>
  </div>

  <!-- STEP 6 & 7 -->
  <div class="step-section">
    <div class="step-header">
      <div class="step-num">6</div>
      <div class="step-title">Admin Dashboard & Notification Bell Alerts</div>
    </div>
    <div class="step-desc">
      The moment an order is approved, RegenX HQ is notified across three distinct channels:
    </div>
    <ul class="step-points">
      <li><strong>Sidebar Badge:</strong> A bright red badge appears beside the store name showing the exact number of new orders.</li>
      <li><strong>Top Notification Bell:</strong> Clicking the bell opens a slide-out panel with live updates.</li>
      <li><strong>Central Inbox:</strong> Displays store name, order number, and wholesale value ($150.10).</li>
    </ul>
    <div class="img-container" style="margin-bottom: 12px;">
      <img src="${img7}" alt="Step 7: Admin Bell Panel" />
      <div class="img-caption">Figure 6.1: Slide-out notification panel showing live order arrival with store name and amount.</div>
    </div>
    <div class="img-container">
      <img src="${img8}" alt="Step 8: Admin Central Inbox" />
      <div class="img-caption">Figure 6.2: HQ Central Notifications list tracking order volume across all partner stores.</div>
    </div>
  </div>

  <!-- STEP 8: WAREHOUSE -->
  <div class="step-section">
    <div class="step-header">
      <div class="step-num">7</div>
      <div class="step-title">Global Pharmaceutical (GP) Warehouse Queue</div>
    </div>
    <div class="step-desc">
      Global Pharmaceutical warehouse operators see newly approved orders immediately in their packing queue:
    </div>
    <ul class="step-points">
      <li><strong>Privacy Protection:</strong> Warehouse workers only see packing lines and patient addresses; financial balances remain hidden.</li>
      <li><strong>Status Progression:</strong> Warehouse marks <em>Packing -> Shipped</em> and inputs carrier tracking numbers.</li>
      <li><strong>Shipping Notice:</strong> When shipped, the partner store is instantly notified with tracking details!</li>
    </ul>
    <div class="img-container">
      <img src="${img9}" alt="Step 9: Warehouse Fulfillment" />
      <div class="img-caption">Figure 7.1: Warehouse fulfillment queue ready for pick, pack, and label generation.</div>
    </div>
  </div>

  <div class="page-break"></div>

  <!-- PAGE 5: FAQ & BUSINESS RULES FOR REGULAR USERS -->
  <div class="header-banner">
    <div>
      <div class="brand-title">REGENX PARTNER HUB</div>
      <div class="brand-subtitle">Frequently Asked Questions for Store Managers</div>
    </div>
    <div class="doc-meta">
      <div>Reference & Support</div>
    </div>
  </div>

  <div style="margin-bottom: 20px;">
    <h3 style="font-size: 15px; color: #1b2a41; margin-bottom: 8px;">Common Questions About the Order Process</h3>
    <table class="faq-table">
      <thead>
        <tr>
          <th style="width: 30%;">Question</th>
          <th style="width: 70%;">Plain English Answer</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>What happens if my order exceeds my credit deposit?</strong></td>
          <td>The order is not lost. Available credit is applied, and the order is placed on <strong>ON HOLD</strong>. RegenX HQ reviews and approves the excess, which is billed on your following weekly statement.</td>
        </tr>
        <tr>
          <td><strong>Can I ship to any address?</strong></td>
          <td>Only to legally authorized destinations configured for your store (e.g. US 50 States). If a customer provides an unauthorized address, the system alerts you immediately.</td>
        </tr>
        <tr>
          <td><strong>Does shipping cost reduce my credit?</strong></td>
          <td><strong>No.</strong> Your purchasing deposit is strictly reserved for peptide vials. Shipping fees are billed separately on your weekly statement.</td>
        </tr>
        <tr>
          <td><strong>How fast does the warehouse receive my order?</strong></td>
          <td><strong>Instantly.</strong> The moment your order is Approved, it enters the GP fulfillment queue and appears on their pick list for packaging.</td>
        </tr>
        <tr>
          <td><strong>When does credit get replenished?</strong></td>
          <td>Every Monday, the system generates your weekly statement showing deposit replenishment back to your baseline ($10,000 for Starter, $50,000 for Premium) plus shipping.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="intro-card" style="margin-top: 30px; border-left-color: #c8102e;">
    <div class="intro-title" style="color: #c8102e;">Summary of Order Status Badges</div>
    <div style="font-size: 12px; color: #475569; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
      <div><strong>• DRAFT:</strong> Saved in your portal, not yet submitted.</div>
      <div><strong>• APPROVED:</strong> Paid from credit, in warehouse queue.</div>
      <div><strong>• ON HOLD:</strong> Exceeds credit balance, awaiting HQ approval.</div>
      <div><strong>• PACKING:</strong> Warehouse is assembling vials in cold packs.</div>
      <div><strong>• SHIPPED:</strong> Carrier tracking number assigned.</div>
      <div><strong>• DELIVERED:</strong> Successfully received by customer.</div>
    </div>
  </div>

  <div class="footer">
    <div>RegenX Labs Partner Hub &copy; 2026. All rights reserved.</div>
    <div>Confidential & Proprietary Operating Manual</div>
  </div>

</body>
</html>`;

const tempHtmlPath = resolve(".audit/guide.html");
writeFileSync(tempHtmlPath, html, "utf-8");

console.log("Rendering PDF via headless Chrome...");
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});

const page = await browser.newPage();
await page.goto(`file://${tempHtmlPath}`, { waitUntil: "networkidle" });

mkdirSync(resolve("C:/Users/HP/.gemini/antigravity/brain/e692306b-939b-428c-ab7c-529e546abaf5"), { recursive: true });

await page.pdf({
  path: OUT_PDF,
  format: "A4",
  printBackground: true,
  margin: {
    top: "12mm",
    bottom: "12mm",
    left: "12mm",
    right: "12mm",
  },
});

await page.pdf({
  path: ARTIFACT_PDF,
  format: "A4",
  printBackground: true,
  margin: {
    top: "12mm",
    bottom: "12mm",
    left: "12mm",
    right: "12mm",
  },
});

await browser.close();
console.log(`PDF successfully generated at: ${OUT_PDF}`);
console.log(`PDF artifact copy at: ${ARTIFACT_PDF}`);
