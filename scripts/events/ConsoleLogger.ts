import { ILogger } from "./types";

export class ConsoleLogger implements ILogger {
  constructor(private readonly debugEnabled = false) {}

  info(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      console.log(message, meta);
    } else {
      console.log(message);
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      console.warn(message, meta);
    } else {
      console.warn(message);
    }
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      console.error(message, meta);
    } else {
      console.error(message);
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (!this.debugEnabled) return;

    if (meta) {
      console.log(message, meta);
    } else {
      console.log(message);
    }
  }
}

export default ConsoleLogger;
