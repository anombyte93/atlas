import fs from "fs";
import path from "path";

import { BountyEvidence } from "./AtlasCoinClient";

export interface ParseResult {
  success: boolean;
  evidence: BountyEvidence;
  errors?: string[];
}

interface JsonLikeResult {
  success?: boolean;
  status?: string;
  numFailedTests?: number;
  numPassedTests?: number;
  numPendingTests?: number;
  numTotalTests?: number;
  testResults?: Array<{ status?: string; assertionResults?: Array<{ status?: string }> }>;
  tests?: Array<{ status?: string }>;
}

/**
 * Parses test output and coverage into Atlas Coin evidence.
 */
export class EvidenceParser {
  private readonly defaultCoveragePath: string;

  constructor(coveragePath = path.resolve(process.cwd(), "coverage/coverage-summary.json")) {
    this.defaultCoveragePath = coveragePath;
  }

  parseFromOutput(stdout: string, stderr: string): ParseResult {
    const errors: string[] = [];
    const coveragePercent = this.safeParseCoverage(this.defaultCoveragePath);

    try {
      const combined = `${stdout}\n${stderr}`.trim();
      const jsonCandidate = this.tryParseJson(stdout) ?? this.tryParseJson(stderr) ?? this.tryParseEmbeddedJson(combined);

      if (jsonCandidate) {
        const evidence = this.parseJsonTestResult(jsonCandidate, coveragePercent);
        return { success: evidence.ci_passed, evidence };
      }

      const tapEvidence = this.parseTapOutput(combined, coveragePercent);
      if (tapEvidence) {
        return { success: tapEvidence.ci_passed, evidence: tapEvidence };
      }

      const textEvidence = this.parseTextOutput(combined, coveragePercent);
      return { success: textEvidence.ci_passed, evidence: textEvidence };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      return {
        success: false,
        evidence: {
          ci_passed: false,
          coverage_percent: coveragePercent,
          test_results: `Parsing failed: ${message}`,
        },
        errors,
      };
    }
  }

  parseFromFile(jsonPath: string): ParseResult {
    const errors: string[] = [];
    const coveragePercent = this.safeParseCoverage(this.defaultCoveragePath);

    try {
      const raw = fs.readFileSync(jsonPath, "utf8");
      const parsed = JSON.parse(raw) as JsonLikeResult;
      const evidence = this.parseJsonTestResult(parsed, coveragePercent);
      return { success: evidence.ci_passed, evidence };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      return {
        success: false,
        evidence: {
          ci_passed: false,
          coverage_percent: coveragePercent,
          test_results: `File parse failed: ${message}`,
        },
        errors,
      };
    }
  }

  parseCoverage(coverageJsonPath: string): number {
    return this.safeParseCoverage(coverageJsonPath);
  }

  private parseJsonTestResult(result: JsonLikeResult, coveragePercent: number): BountyEvidence {
    const ciPassed = this.computePassFromJson(result);
    const parts: string[] = [];

    const passed = this.extractNumber(result.numPassedTests, "passed");
    const failed = this.extractNumber(result.numFailedTests, "failed");
    const pending = this.extractNumber(result.numPendingTests, "pending");
    const total = this.extractNumber(result.numTotalTests, "total");

    if (passed) parts.push(passed);
    if (failed) parts.push(failed);
    if (pending) parts.push(pending);
    if (total) parts.push(total);

    if (!parts.length && result.status) {
      parts.push(`status=${result.status}`);
    }

    if (!parts.length && result.testResults) {
      const passes = result.testResults.filter(tr => tr.status === "passed").length;
      const fails = result.testResults.filter(tr => tr.status === "failed").length;
      parts.push(`tests passed=${passes} failed=${fails}`);
    }

    if (!parts.length) {
      parts.push(this.safeStringify(result));
    }

    return {
      ci_passed: ciPassed,
      coverage_percent: coveragePercent,
      test_results: parts.join("; "),
    };
  }

  private parseTapOutput(output: string, coveragePercent: number): BountyEvidence | null {
    const lines = output.split(/\r?\n/);
    if (!lines.some(line => line.toLowerCase().startsWith("ok") || line.toLowerCase().startsWith("not ok"))) {
      return null;
    }

    let failed = 0;
    let passed = 0;

    for (const line of lines) {
      if (line.toLowerCase().startsWith("not ok")) failed += 1;
      if (line.toLowerCase().startsWith("ok")) passed += 1;
    }

    const ciPassed = failed === 0 && passed > 0;
    return {
      ci_passed: ciPassed,
      coverage_percent: coveragePercent,
      test_results: `tap summary: passed=${passed} failed=${failed}`,
    };
  }

  private parseTextOutput(output: string, coveragePercent: number): BountyEvidence {
    const ciPassed = this.detectPassFromText(output);
    const summary = this.buildTextSummary(output);

    return {
      ci_passed: ciPassed,
      coverage_percent: coveragePercent,
      test_results: summary,
    };
  }

  private detectPassFromText(text: string): boolean {
    const suiteFail = /Test Suites:\s*(\d+) failed/i.exec(text);
    if (suiteFail && Number(suiteFail[1]) > 0) return false;

    const testFail = /Tests:\s*(\d+) failed/i.exec(text);
    if (testFail && Number(testFail[1]) > 0) return false;

    const anyFailWord = /(FAIL|failed|not ok)/i.test(text);
    const anyPassWord = /(PASS|passed|ok)/i.test(text);

    if (anyFailWord && !anyPassWord) return false;
    if (anyPassWord && !anyFailWord) return true;
    return !anyFailWord && anyPassWord;
  }

  private buildTextSummary(text: string): string {
    const lines = text.split(/\r?\n/);
    const keyLines = lines.filter(line => /Test Suites|Tests|PASS|FAIL|ok|not ok/i.test(line)).slice(0, 8);
    if (keyLines.length) {
      return keyLines.join(" | ");
    }

    const trimmed = text.trim();
    return trimmed.length > 500 ? `${trimmed.slice(0, 480)}...` : trimmed || "No test output";
  }

  private tryParseJson(raw: string): JsonLikeResult | null {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
    try {
      return JSON.parse(trimmed) as JsonLikeResult;
    } catch {
      return null;
    }
  }

  private tryParseEmbeddedJson(raw: string): JsonLikeResult | null {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const snippet = raw.slice(start, end + 1);
    try {
      return JSON.parse(snippet) as JsonLikeResult;
    } catch {
      return null;
    }
  }

  private computePassFromJson(result: JsonLikeResult): boolean {
    if (typeof result.success === "boolean") return result.success;
    if (typeof result.status === "string") return result.status.toLowerCase() === "passed";
    if (typeof result.numFailedTests === "number") return result.numFailedTests === 0;

    const failedFromResults = result.testResults?.some(r => r.status === "failed");
    if (failedFromResults !== undefined) return !failedFromResults;

    const failedFromAssertions = result.testResults?.some(r =>
      r.assertionResults?.some(ar => ar.status === "failed")
    );
    if (failedFromAssertions !== undefined) return !failedFromAssertions;

    const failedFromTestsArray = result.tests?.some(t => t.status === "failed");
    if (failedFromTestsArray !== undefined) return !failedFromTestsArray;

    return false;
  }

  private extractNumber(value: unknown, label: string): string | null {
    if (typeof value === "number") return `${label}=${value}`;
    return null;
  }

  private safeStringify(value: unknown): string {
    try {
      const str = JSON.stringify(value);
      return str && str.length > 600 ? `${str.slice(0, 580)}...` : str;
    } catch {
      return String(value);
    }
  }

  private safeParseCoverage(coverageJsonPath: string): number {
    try {
      if (!fs.existsSync(coverageJsonPath)) return 0;
      const raw = fs.readFileSync(coverageJsonPath, "utf8");
      const json = JSON.parse(raw) as {
        total?: {
          lines?: { pct?: number };
          statements?: { pct?: number };
          branches?: { pct?: number };
          functions?: { pct?: number };
        };
      };

      const total = json.total ?? {};
      const candidates = [total.lines?.pct, total.statements?.pct, total.branches?.pct, total.functions?.pct].filter(
        (n): n is number => typeof n === "number"
      );

      if (!candidates.length) return 0;
      const average = candidates.reduce((sum, n) => sum + n, 0) / candidates.length;
      return Number.isFinite(average) ? Number(average.toFixed(2)) : 0;
    } catch {
      return 0;
    }
  }
}
