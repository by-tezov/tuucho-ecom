import type { MailTemplateMessage } from './contracts.js';

export type MailTemplateFn = (data: Record<string, unknown>, language?: string) => MailTemplateMessage;

const templates = new Map<string, MailTemplateFn>();

export function registerMailTemplate(id: string, render: MailTemplateFn): void {
  templates.set(id, render);
}

export function getMailTemplate(id: string): MailTemplateFn | undefined {
  return templates.get(id);
}

export function listMailTemplates(): string[] {
  return [...templates.keys()];
}

export function resetMailTemplates(): void {
  templates.clear();
}
