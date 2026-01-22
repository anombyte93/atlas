/**
 * Security Audit Logging Service
 *
 * Provides comprehensive audit logging for security events.
 * All security-relevant actions are logged for compliance and forensics.
 *
 * Security Events Logged:
 * - Authentication (login, logout, failed login)
 * - Account management (password change, password reset, email change)
 * - Authorization (role changes, permission changes)
 * - Data access (sensitive data exports, account deletion)
 * - API access (rate limit hits, blocked requests)
 * - Admin actions (user moderation, content moderation)
 *
 * Design Pattern: Observer Pattern - Events are logged asynchronously
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { headers } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';

/**
 * Security event types
 */
export enum SecurityEventType {
  // Authentication events
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  FAILED_LOGIN = 'FAILED_LOGIN',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_COMPLETE = 'PASSWORD_RESET_COMPLETE',

  // Account events
  ACCOUNT_CREATED = 'ACCOUNT_CREATED',
  ACCOUNT_DELETED = 'ACCOUNT_DELETED',
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',
  EMAIL_CHANGED = 'EMAIL_CHANGED',

  // Authorization events
  ROLE_CHANGED = 'ROLE_CHANGED',
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  PERMISSION_REVOKED = 'PERMISSION_REVOKED',

  // Data access events
  DATA_EXPORT = 'DATA_EXPORT',
  DATA_DELETED = 'DATA_DELETED',
  SCAN_ACCESS = 'SCAN_ACCESS',

  // API security events
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  API_BLOCKED = 'API_BLOCKED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',

  // Admin events
  USER_BANNED = 'USER_BANNED',
  USER_UNBANNED = 'USER_UNBANNED',
  CONTENT_FLAGGED = 'CONTENT_FLAGGED',
  CONTENT_APPROVED = 'CONTENT_APPROVED',
  CONTENT_REMOVED = 'CONTENT_REMOVED',
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  userId?: string;
  eventType: SecurityEventType;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

/**
 * Extract IP address from headers
 */
export function extractIpAddress(): string {
  try {
    const headersList = headers();

    // Check various headers for IP
    const ip =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      headersList.get('cf-connecting-ip') || // Cloudflare
      headersList.get('x-client-ip') ||
      'unknown';

    return ip;
  } catch {
    return 'unknown';
  }
}

/**
 * Extract user agent from headers
 */
export function extractUserAgent(): string {
  try {
    const headersList = headers();
    return headersList.get('user-agent') || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Log a security event to both database and logger
 *
 * @param entry - Audit log entry
 * @returns The created audit log ID
 */
export async function logSecurityEvent(entry: AuditLogEntry): Promise<string> {
  const auditId = uuidv4();

  try {
    // Extract request context if not provided
    const ipAddress: string = entry.ipAddress || extractIpAddress();
    const userAgent: string = entry.userAgent || extractUserAgent();

    // Store in database for long-term audit trail
    await prisma.securityAuditLog.create({
      data: {
        id: auditId,
        userId: entry.userId,
        eventType: entry.eventType,
        ipAddress,
        userAgent,
        metadata: entry.metadata || {},
      },
    });

    // Also log to application logger for immediate visibility
    logger.logSecurity(entry.eventType, {
      auditId,
      userId: entry.userId,
      ipAddress,
      metadata: entry.metadata,
    });

    return auditId;
  } catch (error) {
    // Never fail the request if audit logging fails
    logger.error('Failed to log security event', error, {
      eventType: entry.eventType,
      userId: entry.userId,
    });

    return auditId; // Return ID even if DB write failed
  }
}

/**
 * Log authentication event
 */
export async function logAuthEvent(
  eventType: SecurityEventType.LOGIN | SecurityEventType.LOGOUT | SecurityEventType.FAILED_LOGIN,
  userId?: string,
  email?: string,
  success: boolean = true
): Promise<string> {
  return logSecurityEvent({
    userId,
    eventType,
    metadata: {
      email: success ? email : undefined, // Don't log email on failed attempts
      success,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log account change event
 */
export async function logAccountEvent(
  eventType:
    | SecurityEventType.PASSWORD_CHANGE
    | SecurityEventType.ACCOUNT_DELETED
    | SecurityEventType.EMAIL_CHANGED,
  userId: string,
  metadata?: Record<string, any>
): Promise<string> {
  return logSecurityEvent({
    userId,
    eventType,
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log admin action
 */
export async function logAdminAction(
  eventType:
    | SecurityEventType.USER_BANNED
    | SecurityEventType.USER_UNBANNED
    | SecurityEventType.CONTENT_FLAGGED
    | SecurityEventType.CONTENT_REMOVED,
  adminUserId: string,
  targetUserId?: string,
  reason?: string
): Promise<string> {
  return logSecurityEvent({
    userId: adminUserId,
    eventType,
    metadata: {
      targetUserId,
      reason,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log API security event
 */
export async function logApiSecurityEvent(
  eventType: SecurityEventType.RATE_LIMIT_EXCEEDED | SecurityEventType.API_BLOCKED,
  identifier: string,
  endpoint?: string,
  metadata?: Record<string, any>
): Promise<string> {
  return logSecurityEvent({
    eventType,
    metadata: {
      identifier,
      endpoint,
      ...metadata,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Query audit logs for a user
 */
export async function getUserAuditLogs(
  userId: string,
  limit: number = 100
): Promise<any[]> {
  try {
    return await prisma.securityAuditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (error) {
    logger.error('Failed to query user audit logs', error, { userId });
    return [];
  }
}

/**
 * Query audit logs by event type
 */
export async function getAuditLogsByType(
  eventType: SecurityEventType,
  limit: number = 100
): Promise<any[]> {
  try {
    return await prisma.securityAuditLog.findMany({
      where: { eventType },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (error) {
    logger.error('Failed to query audit logs by type', error, { eventType });
    return [];
  }
}

/**
 * Query audit logs by IP address (for fraud detection)
 */
export async function getAuditLogsByIP(
  ipAddress: string,
  limit: number = 100
): Promise<any[]> {
  try {
    return await prisma.securityAuditLog.findMany({
      where: { ipAddress },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (error) {
    logger.error('Failed to query audit logs by IP', error, { ipAddress });
    return [];
  }
}

/**
 * Get recent security events for admin dashboard
 */
export async function getRecentSecurityEvents(limit: number = 50): Promise<any[]> {
  try {
    return await prisma.securityAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (error) {
    logger.error('Failed to query recent security events', error);
    return [];
  }
}

/**
 * Check for suspicious activity (multiple failed logins from same IP)
 */
export async function detectSuspiciousActivity(
  ipAddress: string,
  windowMinutes: number = 15,
  threshold: number = 5
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const failedLogins = await prisma.securityAuditLog.count({
      where: {
        ipAddress,
        eventType: SecurityEventType.FAILED_LOGIN,
        createdAt: { gte: since },
      },
    });

    return failedLogins >= threshold;
  } catch (error) {
    logger.error('Failed to detect suspicious activity', error, { ipAddress });
    return false;
  }
}

/**
 * Clean up old audit logs (to be run periodically)
 *
 * @param daysToKeep - Number of days of logs to retain (default: 90 days)
 */
export async function cleanupOldAuditLogs(daysToKeep: number = 90): Promise<number> {
  try {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

    const result = await prisma.securityAuditLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    logger.info(`Cleaned up old audit logs`, {
      deletedCount: result.count,
      cutoffDate: cutoffDate.toISOString(),
    });

    return result.count;
  } catch (error) {
    logger.error('Failed to cleanup old audit logs', error);
    return 0;
  }
}

/**
 * Export audit logs for compliance (GDPR, SOC2, etc.)
 */
export async function exportAuditLogs(
  startDate: Date,
  endDate: Date,
  userId?: string
): Promise<any[]> {
  try {
    return await prisma.securityAuditLog.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        ...(userId && { userId }),
      },
      orderBy: { createdAt: 'asc' },
    });
  } catch (error) {
    logger.error('Failed to export audit logs', error, { startDate, endDate, userId });
    return [];
  }
}
