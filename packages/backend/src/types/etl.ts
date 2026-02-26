import { ETLJobType, ETLJobStatus } from './enums';

export interface ETLJob {
  id: string;
  name: string;
  type: ETLJobType;
  status: ETLJobStatus;
  source: string;
  records_processed: number;
  records_failed: number;
  error_message?: string;
  started_at?: Date;
  completed_at?: Date;
  next_run_at: Date;
}
