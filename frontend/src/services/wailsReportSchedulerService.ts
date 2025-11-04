import {
  GetStatus,
  Restart
} from '../../wailsjs/go/services/ReportSchedulerService';

export interface SchedulerStatus {
  running: boolean;
  enabled: boolean;
  sync_mode: string;
  sync_interval: number;
  sync_time: string;
  last_sync_at: string | null;
  last_sync_status: string;
  last_sync_error: string;
  total_syncs: number;
  next_sync_at: string | null;
  seconds_until_next_sync: number;
}

export const wailsReportSchedulerService = {
  async getStatus(): Promise<SchedulerStatus> {
    const status = await GetStatus();
    return status as SchedulerStatus;
  },

  async restart(): Promise<void> {
    return await Restart();
  }
};
