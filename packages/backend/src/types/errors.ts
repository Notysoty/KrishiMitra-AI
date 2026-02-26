import { DataQualityType, DataQualitySeverity } from './enums';

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface SafetyRefusal {
  refused: true;
  reason: string;
  alternative?: string;
}

export interface DataQualityWarning {
  type: DataQualityType;
  message: string;
  severity: DataQualitySeverity;
  action?: string;
}
