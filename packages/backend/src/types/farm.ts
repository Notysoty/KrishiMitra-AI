import { CropStatus, InputType, IrrigationType } from './enums';
import { Location } from './base';

export interface Farm {
  id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  location: Location;
  total_acreage: number;
  irrigation_type: IrrigationType;
  created_at: Date;
  updated_at: Date;
}

export interface Crop {
  id: string;
  farm_id: string;
  crop_type: string;
  variety?: string;
  acreage: number;
  planting_date: Date;
  expected_harvest_date?: Date;
  actual_harvest_date?: Date;
  status: CropStatus;
  created_at: Date;
  updated_at: Date;
}

export interface InputLog {
  id: string;
  farm_id: string;
  crop_id?: string;
  input_type: InputType;
  quantity: number;
  unit: string;
  cost?: number;
  date: Date;
  notes?: string;
  created_at: Date;
}

export interface YieldRecord {
  id: string;
  farm_id: string;
  crop_id: string;
  quantity: number;
  unit: string;
  harvest_date: Date;
  quality_grade?: string;
}
