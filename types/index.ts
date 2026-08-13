/**
 * CommandEditor Enhancement Pack - Type Definitions
 * Zero-knowledge architecture preserved throughout
 */

// ============ IN-PLACE EDITOR TYPES ============

export interface PDFTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
  fontSize: number;
  pageIndex: number;
  transform: number[]; // PDF transform matrix [a,b,c,d,e,f]
  hasEOL: boolean;
  dir: string;
}

export interface TextEditOperation {
  id: string;
  pageIndex: number;
  originalText: string;
  newText: string;
  textItem: PDFTextItem;
  timestamp: number;
}

export interface ImageEditOperation {
  id: string;
  pageIndex: number;
  originalImageRef: string;
  newImageData: Uint8Array;
  mimeType: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditorState {
  textEdits: TextEditOperation[];
  imageEdits: ImageEditOperation[];
  deletedObjects: string[];
  addedObjects: Array<{ type: 'text' | 'image' | 'shape'; data: unknown }>;
}

// ============ AI ASSISTANT TYPES ============

export interface DocumentChunk {
  id: string;
  text: string;
  pageIndex: number;
  embedding: number[];
  metadata: {
    paragraphIndex: number;
    wordCount: number;
    isHeading: boolean;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  sources?: Array<{ pageIndex: number; text: string }>;
}

export interface AIQueryResult {
  answer: string;
  relevantChunks: DocumentChunk[];
  confidence: number;
  processingTime: number;
}

// ============ E-SIGNATURE TYPES ============

export interface SignerIdentity {
  id: string;
  name: string;
  email: string;
  publicKeyJwk: JsonWebKey;
  timestamp: number;
}

export interface SignatureField {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  signerId: string;
  signed: boolean;
  signatureData?: string; // base64 PNG
  timestamp?: number;
}

export interface AuditEntry {
  action: 'document_created' | 'signed' | 'viewed' | 'forwarded' | 'verified';
  actor: SignerIdentity;
  timestamp: number;
  documentHash: string;
  details: Record<string, unknown>;
  signature?: string; // cryptographic proof
}

export interface SigningCertificate {
  documentHash: string;
  documentName: string;
  createdAt: number;
  completedAt?: number;
  signers: SignerIdentity[];
  auditTrail: AuditEntry[];
  signatureFields: SignatureField[];
  certificateId: string;
}

// ============ CLOUD CONNECTOR TYPES ============

export type CloudProvider = 'google_drive' | 'dropbox' | 'onedrive' | 'box';

export interface CloudFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  provider: CloudProvider;
  downloadUrl?: string;
  thumbnailUrl?: string;
}

export interface CloudAuthState {
  provider: CloudProvider;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string[];
}

// ============ FORM BUILDER TYPES ============

export type FormFieldType = 
  | 'text' 
  | 'checkbox' 
  | 'radio' 
  | 'dropdown' 
  | 'textarea'
  | 'signature'
  | 'date'
  | 'number';

export interface FormField {
  id: string;
  type: FormFieldType;
  name: string;
  label: string;
  pageIndex: number;
  x: number;
  y:  number;
  width: number;
  height: number;
  required: boolean;
  defaultValue?: string;
  options?: string[]; // for dropdown/radio
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    maxLength?: number;
  };
  fontSize?: number;
  fontColor?: string;
}

export interface FormTemplate {
  id: string;
  name: string;
  description: string;
  fields: FormField[];
  createdAt: number;
}

// ============ VISUAL DIFF TYPES ============

export interface DiffResult {
  pageIndex: number;
  similarityScore: number; // 0-1
  changedRegions: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    changeType: 'added' | 'removed' | 'modified';
  }>;
  diffCanvas?: HTMLCanvasElement;
}

export interface ComparisonSettings {
  threshold: number; // pixel difference threshold (0-255)
  ignoreColors: boolean;
  ignoreAntialiasing: boolean;
  highlightColor: string;
  overlayOpacity: number;
}
