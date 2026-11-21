import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export interface PcbPricingConfig {
  singleLayerBaseSetupInr: number;
  singleLayerRatePerCm2Inr: number;
  doubleLayerBaseSetupInr: number;
  doubleLayerRatePerCm2Inr: number;
  minOrderChargeInr: number;
  copperRates: Record<string, number>; // multiplier e.g. '1 oz': 1, '2 oz': 1.35
  thicknessRates: Record<string, number>; // multiplier e.g. '1.6 mm': 1
  finishSurchargesInr: Record<string, number>;
  colorSurchargesInr: Record<string, number>;
  standardShippingInr: number;
  freeShippingAboveInr: number;
  gstApplicable: boolean;
  gstPercent: number;
}

export const DEFAULT_PCB_PRICING_CONFIG: PcbPricingConfig = {
  singleLayerBaseSetupInr: 250,
  singleLayerRatePerCm2Inr: 1.25,
  doubleLayerBaseSetupInr: 450,
  doubleLayerRatePerCm2Inr: 2.15,
  minOrderChargeInr: 599,
  copperRates: {
    '1 oz (35 µm)': 1,
    '2 oz (70 µm)': 1.35,
  },
  thicknessRates: {
    '0.8 mm': 1.05,
    '1.0 mm': 1,
    '1.2 mm': 1,
    '1.6 mm': 1,
    '2.0 mm': 1.18,
  },
  finishSurchargesInr: {
    'HASL Lead-Free': 0,
    'HASL Leaded': 0,
    'ENIG Gold': 450,
  },
  colorSurchargesInr: {
    Green: 0,
    Blue: 80,
    Black: 80,
    Red: 80,
    White: 100,
  },
  standardShippingInr: 120,
  freeShippingAboveInr: 3000,
  gstApplicable: true,
  gstPercent: 18,
};

export interface GerberAnalysisResult {
  canAutoAnalyze: boolean;
  quotationRequired: boolean;
  reason: string;
  detectedLayerCount?: 1 | 2;
  detectedLengthMm?: number;
  detectedWidthMm?: number;
  inspectedFiles: string[];
}

function parseRs274xBounds(content: string): { widthMm: number; heightMm: number } | null {
  const isInch = /%MOIN\*%/i.test(content);
  const fsMatch = content.match(/%FS[LT][AI]X(\d)(\d)Y(\d)(\d)\*%/i);
  const decX = fsMatch ? Number(fsMatch[2]) : 4;
  const decY = fsMatch ? Number(fsMatch[4]) : 4;
  const scaleX = Math.pow(10, decX);
  const scaleY = Math.pow(10, decY);
  const unitFactor = isInch ? 25.4 : 1;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let count = 0;

  const coordRegex = /(?:X(-?\d+))?(?:Y(-?\d+))?D0[123]\*/g;
  let match: RegExpExecArray | null;
  let curX = 0;
  let curY = 0;

  while ((match = coordRegex.exec(content)) !== null) {
    if (!match[1] && !match[2]) continue;
    if (match[1]) curX = (Number(match[1]) / scaleX) * unitFactor;
    if (match[2]) curY = (Number(match[2]) / scaleY) * unitFactor;
    if (Number.isFinite(curX) && Number.isFinite(curY)) {
      if (curX < minX) minX = curX;
      if (curX > maxX) maxX = curX;
      if (curY < minY) minY = curY;
      if (curY > maxY) maxY = curY;
      count++;
    }
    if (count > 50000) break;
  }

  if (count < 2 || !Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return null;
  }
  const widthMm = Math.round((maxX - minX) * 10) / 10;
  const heightMm = Math.round((maxY - minY) * 10) / 10;
  if (widthMm <= 2 || heightMm <= 2 || widthMm > 1200 || heightMm > 1200) {
    return null;
  }
  return { widthMm, heightMm };
}

function readZipEntries(buf: Buffer): Array<{ name: string; content: string }> | null {
  try {
    const entries: Array<{ name: string; content: string }> = [];
    let offset = 0;
    while (offset + 30 <= buf.length) {
      const sig = buf.readUInt32LE(offset);
      if (sig !== 0x04034b50) break;
      const flags = buf.readUInt16LE(offset + 6);
      const compression = buf.readUInt16LE(offset + 8);
      const compSize = buf.readUInt32LE(offset + 18);
      const nameLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);
      const nameStart = offset + 30;
      const dataStart = nameStart + nameLen + extraLen;
      const fileName = buf.toString('utf8', nameStart, nameStart + nameLen);

      if ((flags & 0x0001) !== 0) {
        // Encrypted ZIP
        return null;
      }
      if ((flags & 0x0008) !== 0 && compSize === 0) {
        // Data descriptor streaming ZIP not supported cleanly without central directory scan
        return null;
      }

      const compData = buf.subarray(dataStart, dataStart + compSize);
      if (!fileName.endsWith('/') && compData.length > 0 && entries.length < 40) {
        if (compression === 0) {
          entries.push({ name: fileName, content: compData.toString('utf8', 0, Math.min(compData.length, 512 * 1024)) });
        } else if (compression === 8) {
          const raw = zlib.inflateRawSync(compData);
          entries.push({ name: fileName, content: raw.toString('utf8', 0, Math.min(raw.length, 512 * 1024)) });
        } else {
          return null;
        }
      }
      offset = dataStart + compSize;
    }
    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

export function analyzeUploadedGerberFiles(
  files: Array<{ originalName: string; filePath: string }>
): GerberAnalysisResult {
  if (!files || files.length === 0) {
    return {
      canAutoAnalyze: false,
      quotationRequired: false,
      reason: 'No Gerber files uploaded yet; instant pricing uses entered board dimensions.',
      inspectedFiles: [],
    };
  }

  const inspectedFiles: string[] = [];
  const extractedTexts: Array<{ name: string; content: string }> = [];

  for (const f of files) {
    const ext = path.extname(f.originalName).toLowerCase();
    inspectedFiles.push(f.originalName);

    if (ext === '.rar') {
      return {
        canAutoAnalyze: false,
        quotationRequired: true,
        reason: 'RAR archive requires manual engineering inspection (Quotation Required).',
        inspectedFiles,
      };
    }

    if (ext === '.zip') {
      try {
        const buf = fs.readFileSync(f.filePath);
        const entries = readZipEntries(buf);
        if (!entries) {
          return {
            canAutoAnalyze: false,
            quotationRequired: true,
            reason: 'Gerber ZIP archive structure could not be automatically parsed — Quotation Required.',
            inspectedFiles,
          };
        }
        extractedTexts.push(...entries);
      } catch {
        return {
          canAutoAnalyze: false,
          quotationRequired: true,
          reason: 'Unable to read Gerber ZIP archive — Quotation Required.',
          inspectedFiles,
        };
      }
    } else if (
      ['.gbr', '.gerber', '.gtl', '.gbl', '.gts', '.gbs', '.gto', '.gbo', '.gko', '.gm1', '.drl', '.txt', '.xln'].includes(ext)
    ) {
      try {
        const raw = fs.readFileSync(f.filePath, 'utf8').slice(0, 512 * 1024);
        extractedTexts.push({ name: f.originalName, content: raw });
      } catch {
        return {
          canAutoAnalyze: false,
          quotationRequired: true,
          reason: 'Gerber file encoding could not be automatically read — Quotation Required.',
          inspectedFiles,
        };
      }
    }
  }

  // Detect multilayer files cleanly (NexusTekFusion fabricates Single & Double Layer only)
  const lowerNames = extractedTexts.map((e) => path.basename(e.name).toLowerCase());
  const hasInnerLayer = lowerNames.some((n) => /\.(g[1234]l?|gl[23]|l[23]|in\d+)\b|inner|layer[_-]?[34]/.test(n));
  if (hasInnerLayer) {
    return {
      canAutoAnalyze: false,
      quotationRequired: true,
      reason: 'Inner copper layers (>2 layers) detected. NexusTekFusion supports Single & Double Layer PCBs — engineering review required.',
      inspectedFiles,
    };
  }

  const hasBottomCopper = lowerNames.some((n) => /\.(gbl|sol|bottom|b_cu)\b|bottom[_-]?copper|b\.cu/.test(n));
  const hasTopCopper = lowerNames.some((n) => /\.(gtl|cmp|top|f_cu)\b|top[_-]?copper|f\.cu/.test(n));
  const detectedLayerCount: 1 | 2 | undefined =
    hasTopCopper && hasBottomCopper ? 2 : hasTopCopper || hasBottomCopper ? 1 : undefined;

  // Attempt to extract board bounds from outline/copper RS-274X
  const gerberCandidates = extractedTexts.filter((e) => /%FS|%MO|D0[123]\*/.test(e.content));
  if (gerberCandidates.length === 0) {
    // Only non-Gerber attachments (e.g., PDF/image/BOM) uploaded without valid RS-274X data
    return {
      canAutoAnalyze: false,
      quotationRequired: true,
      reason: 'Uploaded file does not contain parseable RS-274X Gerber geometry — Quotation Required.',
      inspectedFiles,
    };
  }

  let bestBounds: { widthMm: number; heightMm: number } | null = null;
  // Prefer board outline (.gko, .gm1, edge) first
  const outlineFirst = [
    ...gerberCandidates.filter((c) => /\.(gko|gm1)\b|edge|outline|profile/i.test(c.name)),
    ...gerberCandidates.filter((c) => !/\.(gko|gm1)\b|edge|outline|profile/i.test(c.name)),
  ];

  for (const cand of outlineFirst) {
    const b = parseRs274xBounds(cand.content);
    if (b) {
      bestBounds = b;
      break;
    }
  }

  if (!bestBounds) {
    return {
      canAutoAnalyze: false,
      quotationRequired: true,
      reason: 'Could not determine exact board outline dimensions from Gerber coordinates — Quotation Required.',
      inspectedFiles,
    };
  }

  return {
    canAutoAnalyze: true,
    quotationRequired: false,
    reason: `RS-274X geometry verified (${bestBounds.widthMm} × ${bestBounds.heightMm} mm).`,
    detectedLayerCount,
    detectedLengthMm: bestBounds.widthMm,
    detectedWidthMm: bestBounds.heightMm,
    inspectedFiles,
  };
}

export interface PcbEstimateInput {
  pcbType: 'Single Layer' | 'Double Layer';
  boardLengthMm: number;
  boardWidthMm: number;
  quantity: number;
  copperThickness: string;
  pcbThickness: string;
  solderMaskColor: string;
  surfaceFinish: string;
  quotationRequired?: boolean;
  quotationReason?: string;
}

export interface PcbEstimateResult {
  quotationRequired: boolean;
  reason?: string;
  pcbType: 'Single Layer' | 'Double Layer';
  areaCm2: number;
  manufacturingCostInr: number;
  unitCostInr: number;
  shippingInr: number;
  gstInr: number;
  totalEstimatedInr: number;
  minOrderApplied: boolean;
}

export function calculatePcbPricingBreakdown(
  input: PcbEstimateInput,
  rawConfig?: Partial<PcbPricingConfig> | null
): PcbEstimateResult {
  const cfg: PcbPricingConfig = {
    ...DEFAULT_PCB_PRICING_CONFIG,
    ...(rawConfig || {}),
    copperRates: { ...DEFAULT_PCB_PRICING_CONFIG.copperRates, ...(rawConfig?.copperRates || {}) },
    thicknessRates: { ...DEFAULT_PCB_PRICING_CONFIG.thicknessRates, ...(rawConfig?.thicknessRates || {}) },
    finishSurchargesInr: { ...DEFAULT_PCB_PRICING_CONFIG.finishSurchargesInr, ...(rawConfig?.finishSurchargesInr || {}) },
    colorSurchargesInr: { ...DEFAULT_PCB_PRICING_CONFIG.colorSurchargesInr, ...(rawConfig?.colorSurchargesInr || {}) },
  };

  const len = Math.max(0, Number(input.boardLengthMm || 0));
  const wid = Math.max(0, Number(input.boardWidthMm || 0));
  const qty = Math.max(1, Math.floor(Number(input.quantity || 1)));
  const areaCm2 = Math.round(((len * wid) / 100) * 100) / 100;

  if (input.quotationRequired || len <= 0 || wid <= 0) {
    return {
      quotationRequired: true,
      reason:
        input.quotationReason ||
        'Board geometry requires engineering file verification before issuing final pricing.',
      pcbType: input.pcbType,
      areaCm2,
      manufacturingCostInr: 0,
      unitCostInr: 0,
      shippingInr: 0,
      gstInr: 0,
      totalEstimatedInr: 0,
      minOrderApplied: false,
    };
  }

  const isSingle = input.pcbType === 'Single Layer';
  const baseSetup = isSingle ? cfg.singleLayerBaseSetupInr : cfg.doubleLayerBaseSetupInr;
  const ratePerCm2 = isSingle ? cfg.singleLayerRatePerCm2Inr : cfg.doubleLayerRatePerCm2Inr;

  const copperMult = cfg.copperRates[input.copperThickness] ?? 1;
  const thickMult = cfg.thicknessRates[input.pcbThickness] ?? 1;
  const finishAdd = cfg.finishSurchargesInr[input.surfaceFinish] ?? 0;
  const colorAdd = cfg.colorSurchargesInr[input.solderMaskColor] ?? 0;

  const rawBoardTotal = Math.round(
    (baseSetup + areaCm2 * ratePerCm2 * qty * copperMult * thickMult) + finishAdd + colorAdd
  );
  const minOrderApplied = rawBoardTotal < cfg.minOrderChargeInr;
  const manufacturingCostInr = Math.max(cfg.minOrderChargeInr, rawBoardTotal);
  const unitCostInr = Math.round((manufacturingCostInr / qty) * 100) / 100;

  const shippingInr =
    manufacturingCostInr >= cfg.freeShippingAboveInr ? 0 : cfg.standardShippingInr;

  const gstInr = cfg.gstApplicable
    ? Math.round(((manufacturingCostInr + shippingInr) * cfg.gstPercent) / 100)
    : 0;

  const totalEstimatedInr = manufacturingCostInr + shippingInr + gstInr;

  return {
    quotationRequired: false,
    pcbType: input.pcbType,
    areaCm2,
    manufacturingCostInr,
    unitCostInr,
    shippingInr,
    gstInr,
    totalEstimatedInr,
    minOrderApplied,
  };
}
