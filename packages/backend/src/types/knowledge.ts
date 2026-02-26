import { ArticleStatus } from './enums';

export interface KnowledgeArticle {
  id: string;
  tenant_id: string;
  title: string;
  content: string;
  language: string;
  category: string;
  tags: string[];
  source: string;
  source_url?: string;
  status: ArticleStatus;
  created_by: string;
  approved_by?: string;
  created_at: Date;
  updated_at: Date;
  version: number;
}
