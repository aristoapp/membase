export type CaptureMode = "off" | "summary";
export type ProjectMode = "auto_git" | "off" | "manual";
export type SessionStartContext = "off" | "minimal" | "profile";

export interface PluginConfig {
  apiUrl: string;
  autoRecall: boolean;
  autoWikiRecall: boolean;
  captureMode: CaptureMode;
  maxRecallChars: number;
  sessionStartContext: SessionStartContext;
  projectMode: ProjectMode;
  projectSlug?: string;
  debug: boolean;
}

export interface TokenState {
  clientId: string;
  clientSecret?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  scope?: string;
}

export interface NodeResponse {
  uuid: string;
  name: string;
  labels?: string[];
  summary?: string | null;
  source?: string | null;
  created_at?: string | null;
  valid_at?: string | null;
  attributes?: Record<string, unknown>;
}

export interface EdgeResponse {
  uuid: string;
  name?: string;
  fact?: string | null;
  source_node_uuid?: string;
  target_node_uuid?: string;
  created_at?: string | null;
}

export interface EpisodeBundle {
  episode: NodeResponse;
  relevance_score?: number | null;
  nodes?: NodeResponse[];
  edges?: EdgeResponse[];
}

export interface WikiDocument {
  id: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  source?: string;
  collection_id?: string | null;
  collection_name?: string | null;
  similarity?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CaptureRecord {
  capture_id: string;
  capture_kind:
    | "tool_summary"
    | "compact_summary"
    | "explicit"
    | "project_index";
  content: string;
  display_summary?: string;
  project?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  attempts?: number;
  last_error?: string;
}

export interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  prompt?: string;
  tool_calls?: Array<Record<string, unknown>>;
  last_assistant_message?: string;
  compact_summary?: string;
  [key: string]: unknown;
}

export class MembaseApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "MembaseApiError";
  }
}
