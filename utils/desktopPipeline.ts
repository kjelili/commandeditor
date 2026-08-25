/**
 * Desktop Voice Pipeline
 *
 * Parses and executes multi-step compound commands that require
 * file-system access, silent printing, or email composition.
 * Only runs inside the Tauri desktop shell.
 */

import { invoke } from '@tauri-apps/api/tauri';
import { VoiceCommandType } from '@/components/VoiceCommand';

export interface ResolveStep {
  fileName: string;
  location: 'desktop' | 'downloads' | 'documents';
}

export interface DesktopPipeline {
  resolveSteps: ResolveStep[];
  commands: VoiceCommandType[];
  finalize?: { type: 'print' } | { type: 'email'; to: string; subject?: string };
}

function extractFileNames(text: string): ResolveStep[] {
  const results: ResolveStep[] = [];
  const patterns = [
    /find\s+(?:file\s+)?(?:name\s+)?([^\s,]+(?:\s+[^\s,]+)?)\s+(?:on|in|from)\s+(?:the\s+)?(desktop|downloads|documents)/gi,
    /open\s+([^\s,]+(?:\s+[^\s,]+)?)\s+(?:on|in|from)\s+(?:the\s+)?(desktop|downloads|documents)/gi,
  ];
  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      results.push({ fileName: match[1].trim(), location: match[2].toLowerCase() as ResolveStep['location'] });
    }
  }
  return results;
}

function extractEmail(text: string): string | undefined {
  const match = text.match(/email\s+(?:it\s+)?(?:to\s+)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  return match?.[1];
}

function extractCommands(text: string): VoiceCommandType[] {
  const commands: VoiceCommandType[] = [];
  const segments = text
    .toLowerCase()
    .replace(/\b(hey|ok(ay)?|hello|hi)\s*ed\w+\b/gi, '')
    .replace(/\beditor\b/gi, '')
    .split(/\s*(?:,\s*(?:and\s+)?|(?:\band\s+then\b|\bthen\b|\band\s+after\s+that\b|\bafter\s+that\b|\band\s+also\b|\bfollowed\s+by\b|\bnext\b)\s+)/i)
    .map(s => s.trim())
    .filter(s => s.length >= 2);

  for (const segment of segments) {
    if (/\b(merge|join|combine)\b/i.test(segment)) commands.push({ action: 'merge' });
    else if (/\b(compress|squish|shrink)\b/i.test(segment)) commands.push({ action: 'compress' });
    else if (/\b(pagenum|number\s+(?:the\s+)?pages?)\b/i.test(segment)) commands.push({ action: 'pagenum' });
    else if (/\b(to\s+pdf|convert\s+to\s+pdf)\b/i.test(segment)) commands.push({ action: 'toPDF' });
    else if (/\b(watermark|stamp)\b/i.test(segment)) commands.push({ action: 'watermark' });
    else if (/\b(flatten)\b/i.test(segment)) commands.push({ action: 'flatten' });
    else if (/\b(grayscale|greyscale)\b/i.test(segment)) commands.push({ action: 'grayscale' });
    else if (/\b(rotate)\b/i.test(segment)) commands.push({ action: 'rotate' });
    else if (/\b(ocr)\b/i.test(segment)) commands.push({ action: 'ocr' });
    else if (/\b(sign)\b/i.test(segment)) commands.push({ action: 'sign' });
    else if (/\b(redact)\b/i.test(segment)) commands.push({ action: 'redact' });
  }
  return commands;
}

export function parseDesktopPipeline(transcript: string): DesktopPipeline | null {
  const resolveSteps = extractFileNames(transcript);
  const emailTo = extractEmail(transcript);
  const commands = extractCommands(transcript);
  const hasPrint = /\b(send\s+to\s+print|print\s+it|send\s+to\s+(?:the\s+)?printer)\b/i.test(transcript);

  if (resolveSteps.length === 0 && !emailTo && !hasPrint) return null;

  const finalize = emailTo
    ? { type: 'email' as const, to: emailTo, subject: 'Document from CommandEditor' }
    : hasPrint
    ? { type: 'print' as const }
    : undefined;

  return { resolveSteps, commands, finalize };
}

export async function executeDesktopPipeline(
  pipeline: DesktopPipeline,
  handlers: {
    onLoadFiles: (files: File[]) => void;
    onCommand: (cmd: VoiceCommandType) => void;
    onStatus: (msg: string) => void;
    getCurrentOutput: () => File | null;
  }
): Promise<void> {
  const { onStatus, onLoadFiles, onCommand, getCurrentOutput } = handlers;

  onStatus('🔍 Resolving files…');
  const resolvedFiles: File[] = [];

  for (const step of pipeline.resolveSteps) {
    try {
      const path: string = await invoke('resolve_file', { name: step.fileName, location: step.location });
      onStatus(`📁 Found: ${path.split(/[\\/]/).pop()}`);

      const bytes: number[] = await invoke('read_file_bytes', { path });
      const uint8 = new Uint8Array(bytes);
      const blob = new Blob([uint8]);
      const fileName = path.split(/[\\/]/).pop() || 'file';
      const file = new File([blob], fileName, { type: 'application/octet-stream' });
      resolvedFiles.push(file);
    } catch (e: any) {
      onStatus(`❌ Could not find "${step.fileName}" on ${step.location}`);
      throw e;
    }
  }

  if (resolvedFiles.length > 0) {
    onLoadFiles(resolvedFiles);
    await new Promise(r => setTimeout(r, 300));
  }

  for (let i = 0; i < pipeline.commands.length; i++) {
    const cmd = pipeline.commands[i];
    onStatus(`⚙️ Step ${i + 1}/${pipeline.commands.length}: ${cmd.action}…`);
    onCommand(cmd);
    await new Promise(r => setTimeout(r, 1200));
  }

  if (pipeline.finalize) {
    const output = getCurrentOutput();
    if (!output) {
      onStatus('⚠️ No output file to finalize');
      return;
    }

    onStatus('💾 Preparing output…');
    const arrayBuffer = await output.arrayBuffer();
    const bytes = Array.from(new Uint8Array(arrayBuffer));
    const tempPath: string = await invoke('write_temp_file', {
      bytes,
      name: output.name || 'output.pdf',
    });

    if (pipeline.finalize.type === 'print') {
      onStatus('🖨️ Sending to printer…');
      await invoke('print_file', { path: tempPath });
      onStatus('✅ Sent to printer');
    } else if (pipeline.finalize.type === 'email') {
      onStatus('✉️ Opening email client…');
      await invoke('compose_email', {
        to: pipeline.finalize.to,
        subject: pipeline.finalize.subject || 'Document from CommandEditor',
        body: 'Please find the attached document.',
        attachment: tempPath,
      });
      onStatus('✅ Email client ready');
    }
  } else {
    onStatus('✅ Pipeline complete');
  }
}