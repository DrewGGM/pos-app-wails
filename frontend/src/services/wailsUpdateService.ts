// Frontend wrapper for Wails Update service

type AnyObject = Record<string, any>;

function getUpdateService(): AnyObject | null {
  const w = (window as AnyObject);
  if (!w.go || !w.go.services || !w.go.services.UpdateService) {
    return null;
  }
  return w.go.services.UpdateService;
}

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  download_url: string;
  release_notes: string;
  published_at: string;
  file_size: number;
}

export const wailsUpdateService = {
  // Get current app version
  async getCurrentVersion(): Promise<string | null> {
    const svc = getUpdateService();
    if (!svc) return null;
    return await svc.GetCurrentVersion();
  },

  // Check for available updates
  async checkForUpdates(): Promise<UpdateInfo | null> {
    const svc = getUpdateService();
    if (!svc) return null;
    return await svc.CheckForUpdates();
  },

  // Download update
  async downloadUpdate(url: string): Promise<string | null> {
    const svc = getUpdateService();
    if (!svc) return null;
    return await svc.DownloadUpdate(url);
  },

  // Extract downloaded update
  async extractUpdate(zipPath: string): Promise<string | null> {
    const svc = getUpdateService();
    if (!svc) return null;
    return await svc.ExtractUpdate(zipPath);
  },

  // Apply the update (replace exe)
  async applyUpdate(newExePath: string): Promise<void> {
    const svc = getUpdateService();
    if (!svc) return;
    return await svc.ApplyUpdate(newExePath);
  },

  // Perform complete update process
  async performUpdate(): Promise<void> {
    const svc = getUpdateService();
    if (!svc) return;
    return await svc.PerformUpdate();
  }
};
