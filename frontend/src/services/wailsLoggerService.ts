import {
  LogFrontendError,
  LogFrontendWarning,
  LogFrontendInfo,
  GetLogDirectory,
  GetTodayLogPath
} from '../../wailsjs/go/services/LoggerService';

/**
 * Frontend Logger Service
 * Sends all frontend logs to the backend to be written to daily log files
 */
export const wailsLoggerService = {
  /**
   * Log an error from the frontend
   */
  async logError(message: string, error?: Error, componentInfo?: string): Promise<void> {
    try {
      const stack = error?.stack || new Error().stack || '';
      const component = componentInfo || '';
      await LogFrontendError(message, stack, component);
    } catch (err) {
      // Fallback to console if logging service fails
      console.error('[Logger Service Failed]', message, error);
    }
  },

  /**
   * Log a warning from the frontend
   */
  async logWarning(message: string, details?: string): Promise<void> {
    try {
      await LogFrontendWarning(message, details || '');
    } catch (err) {
      console.warn('[Logger Service Failed]', message, details);
    }
  },

  /**
   * Log info from the frontend
   */
  async logInfo(message: string, details?: string): Promise<void> {
    try {
      await LogFrontendInfo(message, details || '');
    } catch (err) {
      console.info('[Logger Service Failed]', message, details);
    }
  },

  /**
   * Get the directory where logs are stored
   */
  async getLogDirectory(): Promise<string> {
    try {
      return await GetLogDirectory();
    } catch (err) {
      console.error('Failed to get log directory', err);
      return '';
    }
  },

  /**
   * Get the path to today's log file
   */
  async getTodayLogPath(): Promise<string> {
    try {
      return await GetTodayLogPath();
    } catch (err) {
      console.error('Failed to get today log path', err);
      return '';
    }
  },

  /**
   * Initialize global error handlers
   * Call this once when the app starts
   */
  initializeGlobalHandlers(): void {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.logError(
        'Unhandled Promise Rejection',
        event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
        'window.unhandledrejection'
      );
      console.error('Unhandled promise rejection:', event.reason);
    });

    // Handle global errors
    window.addEventListener('error', (event) => {
      this.logError(
        `Global Error: ${event.message}`,
        event.error || new Error(event.message),
        `${event.filename}:${event.lineno}:${event.colno}`
      );
      console.error('Global error:', event);
    });

    // Log when the app starts
    this.logInfo('Frontend application started', window.location.href);
  }
};

// React Error Boundary helper
export class ErrorBoundaryLogger {
  static logError(error: Error, errorInfo: { componentStack: string }): void {
    wailsLoggerService.logError(
      `React Error Boundary: ${error.message}`,
      error,
      errorInfo.componentStack
    );
  }
}

export default wailsLoggerService;
