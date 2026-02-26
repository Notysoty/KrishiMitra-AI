import { Citation } from './ai';

export interface Conversation {
  id: string;
  user_id: string;
  tenant_id: string;
  messages: Message[];
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  confidence?: number;
  citations?: Citation[];
  timestamp: Date;
}
