import { jsPDF } from 'jspdf';

export function downloadQuotationPdf(params: {
  enquiryNumber: string;
  projectTitle: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerCategory?: string;
  quotation: {
    id: number;
    quotationNumber?: string;
    revisionNumber: number;
    items: Array<{ name: string; description: string; qty: number; unitPriceInr: number }>;
    hardwareCostInr: number;
    softwareCostInr: number;
    designDevChargesInr: number;
    testingChargesInr: number;
    documentationChargesInr: number;
    deliveryChargesInr: number;
    costCategories?: Record<string, number>;
    technicalScope?: string;
    validityDays?: number;
    estimatedDuration?: string;
    estimatedDeliveryDate?: string;
    paymentTerms?: string;
    termsAndConditions?: string;
    discountInr: number;
    gstInr: number;
    totalAmountInr: number;
    advancePercent: number;
    advanceAmountInr: number;
    balanceAmountInr: number;
    status: string;
    createdAt: string;
  };
  gstin?: string;
}) {
  const doc = new jsPDF();
  const q = params.quotation;

  doc.setFontSize(16);
  doc.text('NEXUSTEKFUSION PRIVATE LIMITED', 14, 18);
  doc.setFontSize(9);
  doc.text('CIN: U30305ME2026PTC474052 | Email: info@nexustekfusion.in | https://nexustekfusion.in', 14, 24);
  doc.text('H NO. 565/19 NIT, SANKUL NEW COTTON MARK, Ganjipeth, Nagpur 440018', 14, 29);
  if (params.gstin) {
    doc.text(`GSTIN: ${params.gstin}`, 14, 34);
  }

  doc.setDrawColor(200);
  doc.line(14, 38, 196, 38);

  doc.setFontSize(13);
  doc.text(`PROJECT QUOTATION ${q.quotationNumber ? `(${q.quotationNumber}) ` : ''}— REV #${q.revisionNumber}`, 14, 46);
  doc.setFontSize(10);
  doc.text(`Registration ID: ${params.enquiryNumber}`, 14, 53);
  doc.text(`Project: ${params.projectTitle}`, 14, 59);
  doc.text(
    `Prepared For: ${params.customerName} (${params.customerEmail})${params.customerPhone ? ` | ${params.customerPhone}` : ''}`,
    14,
    65
  );
  doc.text(`Status: ${q.status} | Validity: ${q.validityDays || 15} Days`, 14, 71);
  let y = 77;
  if (q.estimatedDuration || q.estimatedDeliveryDate) {
    doc.text(
      `Timeline: ${q.estimatedDuration || 'Custom'}${q.estimatedDeliveryDate ? ` | Est. Delivery Date: ${q.estimatedDeliveryDate}` : ''}`,
      14,
      y
    );
    y += 6;
  }
  if (q.technicalScope) {
    doc.setFontSize(9);
    const scopeLines = doc.splitTextToSize(`Scope: ${q.technicalScope}`, 180);
    doc.text(scopeLines, 14, y);
    y += scopeLines.length * 4.5 + 3;
    doc.setFontSize(10);
  }
  y += 2;
  doc.setFontSize(10);
  doc.text('Itemized Cost Breakdown', 14, y);
  y += 5;
  doc.line(14, y, 196, y);
  y += 6;

  const cc = q.costCategories;
  const categoryRows: Array<[string, number]> = cc
    ? [
        ['Engineering & Development Charges', cc.development || 0],
        ['Hardware Cost', cc.hardware || 0],
        ['Components / Sensors Cost', cc.sensors || 0],
        ['PCB / Manufacturing Cost', cc.pcb || 0],
        ['3D Printing / Mechanical Fabrication Cost', (cc.mechanical || 0) + (cc.printing3d || 0)],
        ['Software / App / Web Development Cost', cc.software || 0],
        ['AI / ML Model Development', cc.aiMl || 0],
        ['IoT / Cloud Setup', cc.iot || 0],
        ['Drone / Robotics Engineering', cc.droneRobotics || 0],
        ['Testing & Quality Assurance Charges', cc.testing || 0],
        ['Documentation / Report Charges', cc.documentation || 0],
        ['Delivery & Packaging Charges', cc.delivery || 0],
        ['Other Charges', cc.other || 0],
      ]
    : [
        ['Hardware & Components', q.hardwareCostInr],
        ['Software & Firmware Development', q.softwareCostInr],
        ['Engineering & Development Charges', q.designDevChargesInr],
        ['Testing & Quality Assurance Charges', q.testingChargesInr],
        ['Documentation Charges', q.documentationChargesInr],
        ['Packaging & Delivery Charges', q.deliveryChargesInr],
      ];

  const rows: Array<[string, number]> = [
    ...q.items.map((it): [string, number] => [
      `${it.name} (x${it.qty})`,
      it.qty * it.unitPriceInr,
    ]),
    ...categoryRows,
    ['Applicable Taxes / GST', q.gstInr],
  ];

  for (const [label, amount] of rows) {
    if (amount > 0) {
      if (y > 265) {
        doc.addPage();
        y = 20;
      }
      doc.text(label, 14, y);
      doc.text(`INR ${amount.toLocaleString('en-IN')}`, 160, y);
      y += 6;
    }
  }
  if (q.discountInr > 0) {
    doc.text('Discount', 14, y);
    doc.text(`- INR ${q.discountInr.toLocaleString('en-IN')}`, 160, y);
    y += 6;
  }

  y += 2;
  doc.line(14, y, 196, y);
  y += 7;
  doc.setFontSize(11);
  doc.text('Total Project Cost', 14, y);
  doc.text(`INR ${q.totalAmountInr.toLocaleString('en-IN')}`, 160, y);
  y += 7;
  doc.setFontSize(10);
  doc.text(`Advance Payable (${q.advancePercent}%)`, 14, y);
  doc.text(`INR ${q.advanceAmountInr.toLocaleString('en-IN')}`, 160, y);
  y += 6;
  doc.text('Remaining Balance on Completion', 14, y);
  doc.text(`INR ${q.balanceAmountInr.toLocaleString('en-IN')}`, 160, y);

  if (q.paymentTerms || q.termsAndConditions) {
    y += 10;
    doc.setFontSize(9);
    if (q.paymentTerms) {
      doc.text(`Payment Terms: ${q.paymentTerms}`, 14, y);
      y += 6;
    }
    if (q.termsAndConditions) {
      const splitTerms = doc.splitTextToSize(`Terms & Notes: ${q.termsAndConditions}`, 180);
      doc.text(splitTerms, 14, y);
    }
  }

  doc.save(`${params.enquiryNumber}_Quotation_Rev${q.revisionNumber}.pdf`);
}

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    if (typeof window === 'undefined') return null;
    const res = await fetch('/assets/aistudio/image_1a5ac752.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function formatAddressObj(addr: any): string[] {
  if (!addr) return [];
  if (typeof addr === 'string') return [addr];
  const lines = [
    [addr.fullName, addr.mobile].filter(Boolean).join(' · '),
    [addr.houseFlat, addr.streetArea, addr.landmark].filter(Boolean).join(', '),
    [addr.city, addr.district, addr.state, addr.pinCode ? `- ${addr.pinCode}` : ''].filter(Boolean).join(', '),
    addr.country || 'India',
  ];
  return lines.filter((l) => l.trim().length > 0);
}

export async function downloadInvoicePdf(params: {
  invoiceNumber: string;
  docType: string;
  entityType: string;
  amountInr: number;
  gstInr: number;
  issuedAt: string;
  customerEmail: string;
  gstin?: string;
  payload: Record<string, unknown>;
}) {
  const doc = new jsPDF();
  const p = params.payload || {};
  const logoData = await loadLogoDataUrl();

  let headerX = 14;
  if (logoData && logoData.startsWith('data:image')) {
    try {
      doc.addImage(logoData, 'PNG', 14, 12, 18, 18);
      headerX = 36;
    } catch {
      headerX = 14;
    }
  }

  doc.setFontSize(15);
  doc.text('NEXUSTEKFUSION PRIVATE LIMITED', headerX, 18);
  doc.setFontSize(8.5);
  doc.text('CIN: U30305ME2026PTC474052 | info@nexustekfusion.in | https://nexustekfusion.in', headerX, 23.5);
  doc.text('H NO. 565/19 NIT, SANKUL NEW COTTON MARK, Ganjipeth, Nagpur 440018, Maharashtra, India', headerX, 28.5);
  if (params.gstin) {
    doc.text(`Company GSTIN: ${params.gstin}`, headerX, 33.5);
  }
  doc.setDrawColor(180);
  doc.line(14, 38, 196, 38);

  doc.setFontSize(13);
  doc.text((params.docType || 'TAX INVOICE').toUpperCase(), 14, 46);
  doc.setFontSize(9.5);
  doc.text(`Invoice Number: ${params.invoiceNumber}`, 14, 53);
  doc.text(`Invoice Date: ${new Date(params.issuedAt).toLocaleDateString('en-IN')}`, 14, 58.5);
  const orderNo = p.orderNumber || p.projectCode || p.enquiryNumber;
  if (orderNo) {
    doc.text(`Order / Reference ID: ${String(orderNo)}`, 14, 64);
  } else {
    doc.text(`Category: ${params.entityType.replace('_', ' ').toUpperCase()}`, 14, 64);
  }

  const payMethod = String(p.paymentMethod || 'Razorpay');
  const payTxnId = String(p.razorpayPaymentId || p.paymentRef || 'Verified');
  doc.text(`Payment Method: ${payMethod} · Transaction ID: ${payTxnId}`, 14, 69.5);

  let y = 76;
  const billingLines = formatAddressObj(p.billingAddress);
  const shippingLines = formatAddressObj(p.shippingAddress);
  if (billingLines.length > 0 || shippingLines.length > 0 || p.customerName || params.customerEmail) {
    doc.line(14, y, 196, y);
    y += 6;
    doc.setFontSize(9);
    doc.text('BILLED TO:', 14, y);
    if (shippingLines.length > 0) doc.text('SHIPPED TO:', 108, y);
    y += 5;

    const leftLines =
      billingLines.length > 0
        ? billingLines
        : [String(p.customerName || params.customerEmail), params.customerEmail, p.customerPhone ? String(p.customerPhone) : ''].filter(Boolean);
    const rightLines = shippingLines.length > 0 ? shippingLines : [];
    const maxLen = Math.max(leftLines.length, rightLines.length);
    doc.setFontSize(8.5);
    for (let i = 0; i < maxLen; i++) {
      if (leftLines[i]) doc.text(leftLines[i].slice(0, 48), 14, y);
      if (rightLines[i]) doc.text(rightLines[i].slice(0, 48), 108, y);
      y += 4.5;
    }
    if (params.customerEmail && !leftLines.includes(params.customerEmail)) {
      doc.text(`Email: ${params.customerEmail}`, 14, y);
      y += 4.5;
    }
    y += 3;
  }

  const items = Array.isArray(p.items) ? (p.items as Array<any>) : [];
  doc.line(14, y, 196, y);
  y += 6;

  if (items.length > 0) {
    doc.setFontSize(8.5);
    doc.text('Description & SKU', 14, y);
    doc.text('HSN', 96, y);
    doc.text('Qty', 116, y);
    doc.text('Rate', 132, y);
    doc.text('GST%', 156, y);
    doc.text('Amount', 174, y);
    y += 3.5;
    doc.line(14, y, 196, y);
    y += 5.5;

    for (const it of items) {
      if (y > 255) {
        doc.addPage();
        y = 20;
      }
      const title = `${it.name || 'Hardware Item'}${it.variant ? ` (${it.variant})` : ''}`;
      doc.text(title.slice(0, 44), 14, y);
      doc.text(String(it.hsnCode || '8807'), 96, y);
      doc.text(String(it.qty || 1), 116, y);
      doc.text(`INR ${Number(it.unitPriceInr || 0).toLocaleString('en-IN')}`, 132, y);
      doc.text(`${Number(it.gstPercent ?? 18)}%`, 156, y);
      doc.text(`INR ${Number(it.lineTotalInr || 0).toLocaleString('en-IN')}`, 174, y);
      y += 6;
    }
    y += 2;
    doc.line(14, y, 196, y);
    y += 6;
  }

  const subtotalVal = typeof p.subtotalInr === 'number' ? Number(p.subtotalInr) : Math.max(0, params.amountInr - params.gstInr);
  const discountVal = Number(p.discountInr || 0);
  const shippingVal = Number(p.shippingInr || 0);
  const taxable = Math.max(0, subtotalVal - discountVal);

  const shipState = String((p.shippingAddress as any)?.state || (p.billingAddress as any)?.state || '').trim();
  const isIntraState = typeof p.isIntraState === 'boolean' ? p.isIntraState : /maharashtra/i.test(shipState);
  const cgstVal = typeof p.cgstInr === 'number' ? Number(p.cgstInr) : isIntraState ? Math.floor(params.gstInr / 2) : 0;
  const sgstVal = typeof p.sgstInr === 'number' ? Number(p.sgstInr) : isIntraState ? params.gstInr - cgstVal : 0;
  const igstVal = typeof p.igstInr === 'number' ? Number(p.igstInr) : isIntraState ? 0 : params.gstInr;

  doc.setFontSize(9.5);
  doc.text('Taxable Value:', 120, y);
  doc.text(`INR ${taxable.toLocaleString('en-IN')}`, 165, y);
  y += 5.5;

  if (discountVal > 0) {
    doc.text('Coupon / Discount:', 120, y);
    doc.text(`- INR ${discountVal.toLocaleString('en-IN')}`, 165, y);
    y += 5.5;
  }
  if (shippingVal > 0) {
    doc.text('Shipping & Handling:', 120, y);
    doc.text(`INR ${shippingVal.toLocaleString('en-IN')}`, 165, y);
    y += 5.5;
  }

  if (isIntraState && params.gstInr > 0) {
    doc.text('CGST (Intra-State MH):', 120, y);
    doc.text(`INR ${cgstVal.toLocaleString('en-IN')}`, 165, y);
    y += 5.5;
    doc.text('SGST (Intra-State MH):', 120, y);
    doc.text(`INR ${sgstVal.toLocaleString('en-IN')}`, 165, y);
    y += 5.5;
  } else {
    doc.text('IGST (Inter-State):', 120, y);
    doc.text(`INR ${igstVal.toLocaleString('en-IN')}`, 165, y);
    y += 5.5;
  }

  doc.line(120, y, 196, y);
  y += 6.5;
  doc.setFontSize(11.5);
  doc.text('Total Invoice Value:', 120, y);
  doc.text(`INR ${params.amountInr.toLocaleString('en-IN')}`, 165, y);
  y += 10;

  if (typeof p.totalProjectAmountInr === 'number' || typeof p.balanceRemainingInr === 'number') {
    doc.setFontSize(9);
    doc.text(
      `Total Contract Value: INR ${Number(p.totalProjectAmountInr || params.amountInr).toLocaleString('en-IN')} | Remaining Balance: INR ${Number(p.balanceRemainingInr || 0).toLocaleString('en-IN')}`,
      14,
      y
    );
    y += 8;
  }

  if (y > 250) {
    doc.addPage();
    y = 30;
  }
  doc.line(14, y, 196, y);
  y += 8;
  doc.setFontSize(8.5);
  doc.text('This is a computer-generated Tax Invoice issued against verified payment.', 14, y);
  doc.text('For NEXUSTEKFUSION PRIVATE LIMITED', 135, y);
  y += 10;
  doc.text('Authorized Signatory (Accounts & Compliance)', 135, y);

  doc.save(`${params.invoiceNumber}.pdf`);
}

export async function downloadDroneBrochurePdf(product: {
  name: string;
  sku?: string;
  hsnCode?: string;
  priceInr: number;
  shortDescription?: string;
  description?: string;
  technicalSpecs?: Record<string, string>;
  features?: string[];
  applications?: string;
  packageContents?: string[];
  warrantyInfo?: string;
  deliveryInfo?: string;
}) {
  const doc = new jsPDF();
  const logoData = await loadLogoDataUrl();
  let headerX = 14;
  if (logoData && logoData.startsWith('data:image')) {
    try {
      doc.addImage(logoData, 'PNG', 14, 12, 18, 18);
      headerX = 36;
    } catch {
      headerX = 14;
    }
  }

  doc.setFontSize(15);
  doc.text('NEXUSTEKFUSION PRIVATE LIMITED', headerX, 18);
  doc.setFontSize(8.5);
  doc.text('KRASHIVANTRI Agricultural UAV Division · Nagpur, Maharashtra, India', headerX, 23.5);
  doc.text('CIN: U30305ME2026PTC474052 | info@nexustekfusion.in | https://nexustekfusion.in', headerX, 28.5);
  doc.line(14, 35, 196, 35);

  doc.setFontSize(18);
  doc.text(product.name, 14, 46);
  doc.setFontSize(10.5);
  if (product.shortDescription) {
    doc.text(product.shortDescription, 14, 53);
  }
  doc.setFontSize(11);
  doc.text(
    `Official Selling Price: INR ${Number(product.priceInr || 0).toLocaleString('en-IN')} | SKU: ${product.sku || '-'} | HSN: ${product.hsnCode || '8806'}`,
    14,
    61
  );
  doc.line(14, 66, 196, 66);

  let y = 74;
  if (product.description) {
    doc.setFontSize(11);
    doc.text('System Overview', 14, y);
    y += 6;
    doc.setFontSize(9.5);
    const descLines = doc.splitTextToSize(product.description, 180);
    doc.text(descLines, 14, y);
    y += descLines.length * 4.8 + 6;
  }

  doc.setFontSize(11);
  doc.text('Key System Specifications', 14, y);
  y += 6;
  const specKeys = [
    'Payload Capacity',
    'Flight Time',
    'Tank Capacity',
    'Spraying Width',
    'Battery Specifications',
    'Navigation Capabilities',
  ];
  doc.setFontSize(9.5);
  for (const k of specKeys) {
    const val = (product.technicalSpecs && product.technicalSpecs[k]) || 'Official Specification on Briefing';
    doc.text(`${k}:`, 14, y);
    doc.text(val, 78, y);
    y += 6;
  }

  if (product.applications) {
    y += 4;
    doc.setFontSize(11);
    doc.text('Target Applications', 14, y);
    y += 6;
    doc.setFontSize(9.5);
    const appLines = doc.splitTextToSize(product.applications, 180);
    doc.text(appLines, 14, y);
    y += appLines.length * 4.8 + 5;
  }

  if (Array.isArray(product.packageContents) && product.packageContents.length > 0) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(11);
    doc.text("What's Included in the Package", 14, y);
    y += 6;
    doc.setFontSize(9.5);
    for (const item of product.packageContents) {
      doc.text(`• ${item}`, 16, y);
      y += 5.5;
    }
  }

  if (product.warrantyInfo || product.deliveryInfo) {
    y += 5;
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(9);
    if (product.warrantyInfo) {
      doc.text(`Warranty & Service: ${product.warrantyInfo}`, 14, y);
      y += 5.5;
    }
    if (product.deliveryInfo) {
      doc.text(`Delivery & Installation: ${product.deliveryInfo}`, 14, y);
    }
  }

  doc.save(`${product.name.replace(/[^a-z0-9]+/gi, '_')}_Brochure.pdf`);
}

export function downloadCompleteProjectInvoicePdf(params: {
  projectCode: string;
  enquiryNumber: string;
  projectTitle: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  totalAmountInr: number;
  gstInr: number;
  paidAmountInr: number;
  balanceAmountInr: number;
  advancePaidInr?: number;
  finalPaidInr?: number;
  costCategories?: Record<string, number>;
  receipts?: Array<{ receiptNumber: string; paymentStage: string; amountInr: number; razorpayPaymentId?: string; issuedAt: string }>;
  gstin?: string;
}) {
  const doc = new jsPDF();
  addCompanyHeader(doc, params.gstin);
  doc.setFontSize(14);
  doc.text('COMPLETE PROJECT CONSOLIDATED INVOICE', 14, 48);
  doc.setFontSize(10);
  doc.text(`Project Code: ${params.projectCode} | Registration ID: ${params.enquiryNumber}`, 14, 56);
  doc.text(`Project Title: ${params.projectTitle}`, 14, 62);
  doc.text(
    `Customer: ${params.customerName} (${params.customerEmail})${params.customerPhone ? ` | ${params.customerPhone}` : ''}`,
    14,
    68
  );
  doc.text(`Generated Date: ${new Date().toLocaleDateString('en-IN')}`, 14, 74);
  doc.line(14, 79, 196, 79);

  let y = 86;
  const cc = params.costCategories || {};
  const entries: Array<[string, number]> = [
    ['Engineering & Development Charges', cc.development || 0],
    ['Hardware Cost', cc.hardware || 0],
    ['Components / Sensors Cost', cc.sensors || 0],
    ['PCB / Manufacturing Cost', cc.pcb || 0],
    ['3D Printing / Fabrication Cost', (cc.mechanical || 0) + (cc.printing3d || 0)],
    ['Software / App / Web Development', cc.software || 0],
    ['AI / ML & IoT / Cloud Setup', (cc.aiMl || 0) + (cc.iot || 0)],
    ['Drone / Robotics Engineering', cc.droneRobotics || 0],
    ['Testing & Quality Assurance Charges', cc.testing || 0],
    ['Documentation Charges', cc.documentation || 0],
    ['Delivery & Other Charges', (cc.delivery || 0) + (cc.other || 0)],
  ];
  for (const [label, amt] of entries) {
    if (amt > 0) {
      doc.text(label, 14, y);
      doc.text(`INR ${amt.toLocaleString('en-IN')}`, 160, y);
      y += 6;
    }
  }
  if (params.gstInr > 0) {
    doc.text('Applicable Taxes / GST', 14, y);
    doc.text(`INR ${params.gstInr.toLocaleString('en-IN')}`, 160, y);
    y += 6;
  }

  y += 2;
  doc.line(14, y, 196, y);
  y += 7;
  doc.setFontSize(11);
  doc.text('Total Project Amount', 14, y);
  doc.text(`INR ${params.totalAmountInr.toLocaleString('en-IN')}`, 160, y);
  y += 6;
  doc.setFontSize(10);
  doc.text('Total Verified Paid Amount', 14, y);
  doc.text(`INR ${params.paidAmountInr.toLocaleString('en-IN')}`, 160, y);
  y += 6;
  doc.text('Remaining Balance Due', 14, y);
  doc.text(`INR ${params.balanceAmountInr.toLocaleString('en-IN')}`, 160, y);
  y += 10;

  if ((params.receipts || []).length > 0) {
    doc.setFontSize(10);
    doc.text('Payment Transactions Applied:', 14, y);
    y += 6;
    doc.setFontSize(9);
    for (const r of params.receipts!) {
      doc.text(
        `${r.receiptNumber} | ${r.paymentStage.toUpperCase()} | ${new Date(r.issuedAt).toLocaleDateString('en-IN')} | Ref: ${r.razorpayPaymentId || '-'}`,
        14,
        y
      );
      doc.text(`INR ${r.amountInr.toLocaleString('en-IN')}`, 160, y);
      y += 5.5;
    }
  }

  doc.save(`${params.projectCode}_Complete_Invoice.pdf`);
}

export function downloadPaymentHistoryStatementPdf(params: {
  projectCode: string;
  enquiryNumber: string;
  projectTitle: string;
  customerName: string;
  customerEmail: string;
  totalAmountInr: number;
  paidAmountInr: number;
  balanceAmountInr: number;
  receipts: Array<{
    receiptNumber: string;
    paymentRef: string;
    paymentStage: string;
    amountInr: number;
    razorpayPaymentId?: string;
    issuedAt: string;
  }>;
  gstin?: string;
}) {
  const doc = new jsPDF();
  addCompanyHeader(doc, params.gstin);
  doc.setFontSize(14);
  doc.text('PROJECT PAYMENT HISTORY STATEMENT', 14, 48);
  doc.setFontSize(10);
  doc.text(`Project: ${params.projectCode} (${params.enquiryNumber}) — ${params.projectTitle}`, 14, 56);
  doc.text(`Customer: ${params.customerName} (${params.customerEmail})`, 14, 62);
  doc.text(`Statement Date: ${new Date().toLocaleString('en-IN')}`, 14, 68);
  doc.line(14, 73, 196, 73);

  let y = 82;
  doc.text(`Contract Value: INR ${params.totalAmountInr.toLocaleString('en-IN')}`, 14, y);
  y += 6;
  doc.text(`Cumulative Paid: INR ${params.paidAmountInr.toLocaleString('en-IN')}`, 14, y);
  y += 6;
  doc.text(`Outstanding Balance: INR ${params.balanceAmountInr.toLocaleString('en-IN')}`, 14, y);
  y += 10;

  doc.line(14, y, 196, y);
  y += 7;
  doc.setFontSize(9);
  doc.text('Date', 14, y);
  doc.text('Receipt / Stage', 45, y);
  doc.text('Gateway Payment ID', 108, y);
  doc.text('Amount', 165, y);
  y += 4;
  doc.line(14, y, 196, y);
  y += 6;

  if (params.receipts.length === 0) {
    doc.text('No verified payment transactions recorded yet.', 14, y);
  } else {
    for (const r of params.receipts) {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(new Date(r.issuedAt).toLocaleDateString('en-IN'), 14, y);
      doc.text(`${r.receiptNumber} (${r.paymentStage.toUpperCase()})`, 45, y);
      doc.text(String(r.razorpayPaymentId || r.paymentRef || '-').slice(0, 26), 108, y);
      doc.text(`INR ${r.amountInr.toLocaleString('en-IN')}`, 165, y);
      y += 6.5;
    }
  }

  doc.save(`${params.projectCode}_Payment_History_Statement.pdf`);
}

export function downloadPackingSlipPdf(order: {
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  createdAt: string;
  trackingCourier?: string;
  trackingId?: string;
  shippingAddress: any;
  items: Array<{
    sku: string;
    name: string;
    variant?: string;
    color?: string;
    qty: number;
  }>;
}) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('NEXUSTEKFUSION PRIVATE LIMITED — PACKING SLIP', 14, 18);
  doc.setFontSize(9);
  doc.text('Dispatch Hub: H NO. 565/19 NIT, SANKUL NEW COTTON MARK, Ganjipeth, Nagpur 440018', 14, 24);
  doc.text('CIN: U30305ME2026PTC474052 | Email: info@nexustekfusion.in', 14, 29);
  doc.line(14, 34, 196, 34);

  doc.setFontSize(11);
  doc.text(`Order Number: ${order.orderNumber}`, 14, 42);
  doc.setFontSize(10);
  doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`, 14, 48);
  doc.text(`Order Status: ${order.orderStatus} | Payment: ${order.paymentStatus.toUpperCase()}`, 14, 54);
  if (order.trackingCourier || order.trackingId) {
    doc.text(`Courier: ${order.trackingCourier || '-'} | AWB / Tracking: ${order.trackingId || '-'}`, 14, 60);
  }

  const addr = order.shippingAddress || {};
  let y = 70;
  doc.setFontSize(10);
  doc.text('SHIP TO:', 14, y);
  y += 6;
  doc.setFontSize(9);
  doc.text(`${addr.fullName || 'Customer'} (${addr.mobile || '-'})`, 14, y);
  y += 5;
  doc.text(`${addr.houseFlat || ''}, ${addr.streetArea || ''}`, 14, y);
  y += 5;
  if (addr.landmark) {
    doc.text(`Landmark: ${addr.landmark}`, 14, y);
    y += 5;
  }
  doc.text(`${addr.city || ''}, ${addr.district || ''}, ${addr.state || ''} - ${addr.pinCode || ''}`, 14, y);
  y += 8;

  doc.line(14, y, 196, y);
  y += 7;
  doc.setFontSize(10);
  doc.text('SKU', 14, y);
  doc.text('Product Description', 52, y);
  doc.text('Qty', 178, y);
  y += 4;
  doc.line(14, y, 196, y);
  y += 6;

  doc.setFontSize(9);
  for (const item of order.items) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text(String(item.sku || '-').slice(0, 18), 14, y);
    const label = `${item.name}${item.variant ? ` (${item.variant})` : ''}${item.color ? ` [${item.color}]` : ''}`;
    doc.text(label.slice(0, 62), 52, y);
    doc.text(String(item.qty), 180, y);
    y += 7;
  }

  y += 10;
  doc.line(14, y, 196, y);
  y += 7;
  doc.text('Packed & QC Verified By: NexusTekFusion Dispatch Team (Nagpur)', 14, y);

  doc.save(`${order.orderNumber}_PackingSlip.pdf`);
}

function addCompanyHeader(doc: jsPDF, gstin?: string) {
  doc.setFontSize(16);
  doc.text('NEXUSTEKFUSION PRIVATE LIMITED', 14, 18);
  doc.setFontSize(9);
  doc.text('CIN: U30305ME2026PTC474052 | info@nexustekfusion.in | https://nexustekfusion.in', 14, 24);
  doc.text('H NO. 565/19 NIT, SANKUL NEW COTTON MARK, Ganjipeth, Nagpur 440018, India', 14, 29);
  if (gstin) doc.text(`GSTIN: ${gstin}`, 14, 34);
  doc.setDrawColor(190);
  doc.line(14, 38, 196, 38);
}

export function downloadPaymentReceiptPdf(params: {
  receiptNumber: string;
  paymentRef: string;
  razorpayPaymentId?: string;
  paymentStage: string;
  amountInr: number;
  issuedAt: string;
  customerEmail: string;
  referenceCode?: string;
  gstin?: string;
}) {
  const doc = new jsPDF();
  addCompanyHeader(doc, params.gstin);
  doc.setFontSize(14);
  doc.text('OFFICIAL PAYMENT RECEIPT', 14, 48);
  doc.setFontSize(10);
  doc.text(`Receipt No: ${params.receiptNumber}`, 14, 57);
  doc.text(`Payment Ref: ${params.paymentRef}`, 14, 63);
  if (params.razorpayPaymentId) doc.text(`Gateway Transaction ID: ${params.razorpayPaymentId}`, 14, 69);
  doc.text(`Issued Date: ${new Date(params.issuedAt).toLocaleDateString('en-IN')}`, 14, 75);
  doc.text(`Customer: ${params.customerEmail}`, 14, 81);
  if (params.referenceCode) doc.text(`Project / Booking Ref: ${params.referenceCode}`, 14, 87);
  doc.text(`Payment Stage: ${params.paymentStage.toUpperCase()}`, 14, 93);
  doc.line(14, 100, 196, 100);
  doc.setFontSize(12);
  doc.text(`Verified Amount Received: INR ${params.amountInr.toLocaleString('en-IN')}`, 14, 110);
  doc.setFontSize(9);
  doc.text('Digitally verified by NEXUSTEKFUSION PRIVATE LIMITED Accounts System.', 14, 126);
  doc.save(`${params.receiptNumber}.pdf`);
}

export function downloadWorkOrderPdf(params: {
  workOrderNumber: string;
  projectCode: string;
  projectTitle: string;
  assignedEngineer: string;
  estimatedCompletionDate?: string;
  scopeSummary?: string;
  issuedAt: string;
  customerEmail: string;
}) {
  const doc = new jsPDF();
  addCompanyHeader(doc);
  doc.setFontSize(14);
  doc.text('ENGINEERING WORK ORDER', 14, 48);
  doc.setFontSize(10);
  doc.text(`Work Order No: ${params.workOrderNumber}`, 14, 57);
  doc.text(`Project Code: ${params.projectCode}`, 14, 63);
  doc.text(`Project Title: ${params.projectTitle}`, 14, 69);
  doc.text(`Client: ${params.customerEmail}`, 14, 75);
  doc.text(`Assigned Engineer: ${params.assignedEngineer}`, 14, 81);
  if (params.estimatedCompletionDate) doc.text(`Target Completion: ${params.estimatedCompletionDate}`, 14, 87);
  doc.text(`Issued Date: ${new Date(params.issuedAt).toLocaleDateString('en-IN')}`, 14, 93);
  doc.line(14, 99, 196, 99);
  doc.text('Authorized Technical Scope:', 14, 108);
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(params.scopeSummary || 'As per approved project quotation.', 180);
  doc.text(lines, 14, 115);
  doc.save(`${params.workOrderNumber}.pdf`);
}

export function downloadClearanceCertificatePdf(params: {
  certificateNumber: string;
  projectCode: string;
  projectTitle: string;
  totalAmountInr: number;
  advancePaidInr: number;
  finalPaidInr: number;
  balanceInr: number;
  paymentRefs: string[];
  issuedAt: string;
  issuedBy: string;
  customerEmail: string;
}) {
  const doc = new jsPDF();
  addCompanyHeader(doc);
  doc.setFillColor(11, 27, 59);
  doc.rect(14, 44, 182, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text('PAYMENT CLEARED — PROJECT READY FOR HANDOVER', 20, 52);
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(10);
  doc.text(`Certificate Number: ${params.certificateNumber}`, 14, 66);
  doc.text(`Project Code: ${params.projectCode} — ${params.projectTitle}`, 14, 72);
  doc.text(`Customer Account: ${params.customerEmail}`, 14, 78);
  doc.text(`Issued At: ${new Date(params.issuedAt).toLocaleString('en-IN')}`, 14, 84);
  doc.text(`Authorized By: ${params.issuedBy}`, 14, 90);
  doc.line(14, 96, 196, 96);

  doc.text(`Total Contract Value: INR ${params.totalAmountInr.toLocaleString('en-IN')}`, 14, 106);
  doc.text(`Advance Verified: INR ${params.advancePaidInr.toLocaleString('en-IN')}`, 14, 113);
  doc.text(`Final Balance Verified: INR ${params.finalPaidInr.toLocaleString('en-IN')}`, 14, 120);
  doc.setFontSize(12);
  doc.text(`Outstanding Balance Due: INR ${params.balanceInr.toLocaleString('en-IN')}`, 14, 129);
  doc.setFontSize(9);
  doc.text(`Verified Payment References: ${params.paymentRefs.join(', ') || 'Recorded'}`, 14, 140);
  doc.save(`${params.certificateNumber}.pdf`);
}

export function downloadCompletionCertificatePdf(params: {
  certificateNumber: string;
  projectCode: string;
  projectTitle: string;
  acknowledgedBy: string;
  acknowledgedAt: string;
  assignedEngineer: string;
}) {
  const doc = new jsPDF();
  addCompanyHeader(doc);
  doc.setFontSize(15);
  doc.text('PROJECT COMPLETION & HANDOVER CERTIFICATE', 14, 52);
  doc.setFontSize(10);
  doc.text(`Completion Certificate No: ${params.certificateNumber}`, 14, 64);
  doc.text(`Project Code: ${params.projectCode}`, 14, 71);
  doc.text(`Project Title: ${params.projectTitle}`, 14, 78);
  doc.text(`Lead Engineer: ${params.assignedEngineer}`, 14, 85);
  doc.text(`Acknowledged By Client: ${params.acknowledgedBy}`, 14, 92);
  doc.text(`Handover Timestamp: ${new Date(params.acknowledgedAt).toLocaleString('en-IN')}`, 14, 99);
  doc.line(14, 106, 196, 106);
  doc.setFontSize(9);
  doc.text(
    'This certifies that all deliverables for the above project have been handed over and acknowledged.',
    14,
    116
  );
  doc.save(`${params.certificateNumber}.pdf`);
}

export function downloadProjectFinanceReportPdf(params: {
  summary: {
    projectCount: number;
    totalQuotedInr: number;
    totalCollectedInr: number;
    totalOutstandingInr: number;
    clearedProjectsCount: number;
  };
  projects: Array<{
    projectCode: string;
    title: string;
    customerName: string;
    totalAmountInr: number;
    paidAmountInr: number;
    balanceAmountInr: number;
    paymentClearanceStatus: string;
  }>;
}) {
  const doc = new jsPDF();
  addCompanyHeader(doc);
  doc.setFontSize(13);
  doc.text('PROJECT FINANCIAL SUMMARY REPORT', 14, 48);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 54);
  doc.text(
    `Projects: ${params.summary.projectCount} | Quoted: INR ${params.summary.totalQuotedInr.toLocaleString('en-IN')} | Collected: INR ${params.summary.totalCollectedInr.toLocaleString('en-IN')} | Outstanding: INR ${params.summary.totalOutstandingInr.toLocaleString('en-IN')}`,
    14,
    61
  );
  doc.line(14, 66, 196, 66);
  let y = 74;
  for (const p of params.projects) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text(`${p.projectCode} — ${p.title.slice(0, 38)} (${p.customerName})`, 14, y);
    doc.text(
      `Total: ${p.totalAmountInr} | Paid: ${p.paidAmountInr} | Bal: ${p.balanceAmountInr} [${p.paymentClearanceStatus}]`,
      14,
      y + 4.5
    );
    y += 11;
  }
  doc.save(`NexusTekFusion_Project_Finance_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function downloadKrashivantriReportPdf(params: {
  summary: {
    totalBookings: number;
    totalFarmerCollectionsInr: number;
    platformCommissionInr: number;
    settledPayoutsInr: number;
    pendingPayoutsInr: number;
    totalPenaltiesInr: number;
  };
}) {
  const doc = new jsPDF();
  addCompanyHeader(doc);
  doc.setFontSize(13);
  doc.text('KRASHIVANTRI DRONE OPERATIONS FINANCIAL REPORT', 14, 48);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 56);
  doc.line(14, 62, 196, 62);
  const lines = [
    `Total Spraying Bookings: ${params.summary.totalBookings}`,
    `Total Farmer Collections: INR ${params.summary.totalFarmerCollectionsInr.toLocaleString('en-IN')}`,
    `Platform Commission Earned: INR ${params.summary.platformCommissionInr.toLocaleString('en-IN')}`,
    `Settled Pilot Payouts: INR ${params.summary.settledPayoutsInr.toLocaleString('en-IN')}`,
    `Pending Pilot Payouts: INR ${params.summary.pendingPayoutsInr.toLocaleString('en-IN')}`,
    `Active / Deducted Penalties: INR ${params.summary.totalPenaltiesInr.toLocaleString('en-IN')}`,
  ];
  let y = 72;
  for (const l of lines) {
    doc.text(l, 14, y);
    y += 8;
  }
  doc.save(`KRASHIVANTRI_Financial_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
}
