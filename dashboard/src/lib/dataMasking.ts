/**
 * Data Masking Module
 * Protect PII (Personally Identifiable Information) in data
 */

import crypto from 'crypto';

export type MaskingMethod = 'full' | 'partial' | 'hash' | 'fake' | 'none';

export interface MaskingRule {
  column: string;
  method: MaskingMethod;
  pattern?: string;
  preserveLength?: boolean;
}

export interface PIIDetectionResult {
  column: string;
  piiType: 'email' | 'phone' | 'ssn' | 'credit_card' | 'passport' | 'name' | 'address' | 'unknown';
  confidence: number; // 0-1
  suggestedMasking: MaskingMethod;
}

// PII detection patterns
const PII_PATTERNS = {
  email: /email|e-mail|mail/i,
  phone: /phone|tel|mobile|cell/i,
  ssn: /ssn|social.*security|national.*id/i,
  credit_card: /card|credit|payment/i,
  passport: /passport/i,
  name: /name|first.*name|last.*name|full.*name/i,
  address: /address|street|city|zip|postal/i,
  password: /password|passwd|pwd/i,
};

/**
 * Detect PII in column names
 */
export function detectPII(columnName: string, sampleData?: any[]): PIIDetectionResult | null {
  const lowerName = columnName.toLowerCase();
  
  // Check against patterns
  for (const [piiType, pattern] of Object.entries(PII_PATTERNS)) {
    if (pattern.test(lowerName)) {
      let confidence = 0.8;
      let suggestedMasking: MaskingMethod = 'partial';

      // Adjust confidence and masking based on type
      if (piiType === 'password') {
        confidence = 1.0;
        suggestedMasking = 'hash';
      } else if (piiType === 'email') {
        confidence = 0.9;
        suggestedMasking = 'partial';
      } else if (piiType === 'ssn' || piiType === 'credit_card') {
        confidence = 0.95;
        suggestedMasking = 'hash';
      }

      // Validate with sample data if available
      if (sampleData && sampleData.length > 0) {
        const validationResult = validatePIIWithSamples(piiType as any, sampleData);
        confidence = (confidence + validationResult.confidence) / 2;
      }

      return {
        column: columnName,
        piiType: piiType as any,
        confidence,
        suggestedMasking,
      };
    }
  }

  return null;
}

/**
 * Validate PII detection with sample data
 */
function validatePIIWithSamples(
  piiType: string,
  samples: any[]
): { confidence: number } {
  let matches = 0;
  const validSamples = samples.filter(s => s != null && s !== '');

  if (validSamples.length === 0) {
    return { confidence: 0.5 };
  }

  for (const sample of validSamples.slice(0, 10)) {
    const str = String(sample);
    
    switch (piiType) {
      case 'email':
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) matches++;
        break;
      case 'phone':
        if (/^\+?[\d\s\-()]{10,}$/.test(str)) matches++;
        break;
      case 'ssn':
        if (/^\d{3}-?\d{2}-?\d{4}$/.test(str)) matches++;
        break;
      case 'credit_card':
        if (/^\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}$/.test(str)) matches++;
        break;
    }
  }

  return {
    confidence: matches / Math.min(validSamples.length, 10),
  };
}

/**
 * Mask data according to rule
 */
export function maskData(value: any, rule: MaskingRule): string {
  if (value == null || value === '') {
    return '';
  }

  const str = String(value);

  switch (rule.method) {
    case 'full':
      return rule.preserveLength ? '*'.repeat(str.length) : '***';

    case 'partial':
      return maskPartial(str, rule.pattern);

    case 'hash':
      return hashValue(str);

    case 'fake':
      return generateFakeData(rule.column);

    case 'none':
      return str;

    default:
      return '***';
  }
}

/**
 * Partial masking (show first and last characters)
 */
function maskPartial(value: string, pattern?: string): string {
  if (value.length <= 3) {
    return '*'.repeat(value.length);
  }

  // Email: show first char and domain
  if (value.includes('@')) {
    const [local, domain] = value.split('@');
    return `${local[0]}***@${domain}`;
  }

  // Phone: show last 4 digits
  if (/^\+?[\d\s\-()]+$/.test(value)) {
    const digits = value.replace(/\D/g, '');
    return `***-***-${digits.slice(-4)}`;
  }

  // Default: show first and last character
  return `${value[0]}${'*'.repeat(value.length - 2)}${value[value.length - 1]}`;
}

/**
 * Hash value (one-way)
 */
function hashValue(value: string): string {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Generate fake data
 */
function generateFakeData(columnName: string): string {
  const lowerName = columnName.toLowerCase();

  if (lowerName.includes('email')) {
    return `user${Math.floor(Math.random() * 10000)}@example.com`;
  }

  if (lowerName.includes('phone')) {
    return `555-${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 9000 + 1000)}`;
  }

  if (lowerName.includes('name')) {
    const names = ['John Doe', 'Jane Smith', 'Bob Johnson', 'Alice Williams'];
    return names[Math.floor(Math.random() * names.length)];
  }

  if (lowerName.includes('address')) {
    return `${Math.floor(Math.random() * 9999 + 1)} Main St, City, ST 12345`;
  }

  return 'REDACTED';
}

/**
 * Mask entire dataset
 */
export function maskDataset(
  rows: any[][],
  columns: string[],
  rules: MaskingRule[]
): any[][] {
  const ruleMap = new Map(rules.map(r => [r.column, r]));

  return rows.map(row => {
    return row.map((value, index) => {
      const columnName = columns[index];
      const rule = ruleMap.get(columnName);

      if (rule) {
        return maskData(value, rule);
      }

      return value;
    });
  });
}

/**
 * Auto-detect and create masking rules for a schema
 */
export function autoDetectMaskingRules(
  columns: string[],
  sampleData?: any[][]
): MaskingRule[] {
  const rules: MaskingRule[] = [];

  for (let i = 0; i < columns.length; i++) {
    const columnName = columns[i];
    const samples = sampleData?.map(row => row[i]);

    const piiResult = detectPII(columnName, samples);

    if (piiResult && piiResult.confidence > 0.7) {
      rules.push({
        column: columnName,
        method: piiResult.suggestedMasking,
        preserveLength: true,
      });
    }
  }

  return rules;
}

/**
 * Validate masking rules
 */
export function validateMaskingRules(
  rules: MaskingRule[],
  columns: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const columnSet = new Set(columns);

  for (const rule of rules) {
    if (!columnSet.has(rule.column)) {
      errors.push(`Column '${rule.column}' not found in schema`);
    }

    if (!['full', 'partial', 'hash', 'fake', 'none'].includes(rule.method)) {
      errors.push(`Invalid masking method '${rule.method}' for column '${rule.column}'`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get masking statistics
 */
export function getMaskingStats(rules: MaskingRule[]): {
  totalColumns: number;
  maskedColumns: number;
  byMethod: Record<MaskingMethod, number>;
} {
  const byMethod: Record<MaskingMethod, number> = {
    full: 0,
    partial: 0,
    hash: 0,
    fake: 0,
    none: 0,
  };

  for (const rule of rules) {
    byMethod[rule.method]++;
  }

  return {
    totalColumns: rules.length,
    maskedColumns: rules.filter(r => r.method !== 'none').length,
    byMethod,
  };
}
