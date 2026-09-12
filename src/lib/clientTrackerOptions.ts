export const CLIENT_TRACKER_OPTION_KEYS = [
  'viewProfile',
  'showInterviewFeedback',
  'addComments',
  'downloadResume',
  'showLinkedIn',
  'showNotes',
  'showScore',
  'addRemarks',
  'changeStage',
  'attachDocument',
  'downloadFiles',
] as const;

export type ClientTrackerOptionKey = (typeof CLIENT_TRACKER_OPTION_KEYS)[number];

export type ClientTrackerOptions = Record<ClientTrackerOptionKey, boolean>;

export const CLIENT_TRACKER_OPTION_DEFAULTS: ClientTrackerOptions = {
  viewProfile: true,
  showInterviewFeedback: true,
  addComments: true,
  downloadResume: true,
  showLinkedIn: true,
  showNotes: true,
  showScore: true,
  addRemarks: true,
  changeStage: true,
  attachDocument: true,
  downloadFiles: true,
};

export const CLIENT_TRACKER_OPTION_LEGACY_DEFAULTS: ClientTrackerOptions = {
  viewProfile: true,
  showInterviewFeedback: true,
  addComments: true,
  downloadResume: true,
  showLinkedIn: true,
  showNotes: false,
  showScore: false,
  addRemarks: true,
  changeStage: true,
  attachDocument: true,
  downloadFiles: false,
};

export const CLIENT_TRACKER_OPTION_FIELDS: Array<{
  id: ClientTrackerOptionKey;
  label: string;
  action?: boolean;
  hint?: string;
}> = [
  { id: 'viewProfile', label: 'View profile' },
  { id: 'showInterviewFeedback', label: 'Show interview feedback' },
  { id: 'addComments', label: 'Add comments', action: true },
  { id: 'downloadResume', label: 'Download resume', action: true },
  { id: 'showLinkedIn', label: 'LinkedIn' },
  { id: 'showNotes', label: 'Show recruiter notes' },
  { id: 'showScore', label: 'Show match score' },
  { id: 'addRemarks', label: 'Share decision', action: true },
  {
    id: 'changeStage',
    label: 'Change stage',
    action: true,
    hint: 'Choose which stages the client can pick. Shown in the preview table and on the Client tab (does not move CRM pipeline).',
  },
  { id: 'attachDocument', label: 'Attach document', action: true },
  { id: 'downloadFiles', label: 'Download files' },
];

export function normalizeClientTrackerOptions(
  raw?: Partial<ClientTrackerOptions> | null,
  useNewDefaults = false,
): ClientTrackerOptions {
  const next: ClientTrackerOptions = {
    ...(useNewDefaults ? CLIENT_TRACKER_OPTION_DEFAULTS : CLIENT_TRACKER_OPTION_LEGACY_DEFAULTS),
  };
  if (!raw || typeof raw !== 'object') return next;
  for (const key of CLIENT_TRACKER_OPTION_KEYS) {
    if (typeof raw[key] === 'boolean') next[key] = raw[key];
  }
  return next;
}

export function clientTrackerAllowsResponse(options: ClientTrackerOptions): boolean {
  return options.addRemarks || options.addComments || options.attachDocument || options.changeStage;
}

/** All stage names recruiters can offer on a Client Preview link. */
export function allClientPreviewStageNames(
  stages: Array<{ id: string; name: string }> = [],
): string[] {
  return stages.map((s) => String(s.name || '').trim()).filter(Boolean);
}

/** Normalize recruiter-selected stage names against the fixed catalog. */
export function normalizeAllowedClientStages(
  raw: unknown,
  catalog: Array<{ id: string; name: string }>,
  fallbackAll = true,
): string[] {
  const byName = new Map(
    catalog.map((row) => [row.name.toLowerCase(), row.name] as const),
  );
  const byId = new Map(catalog.map((row) => [row.id.toLowerCase(), row.name] as const));
  const incoming = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',').map((part) => part.trim())
      : [];
  const picked: string[] = [];
  for (const item of incoming) {
    const key = String(item || '').trim();
    if (!key) continue;
    const lower = key.toLowerCase();
    const name = byName.get(lower) || byId.get(lower.replace(/[\s-&]+/g, '_'));
    if (name && !picked.includes(name)) picked.push(name);
  }
  if (picked.length) return picked;
  return fallbackAll ? catalog.map((row) => row.name) : [];
}
