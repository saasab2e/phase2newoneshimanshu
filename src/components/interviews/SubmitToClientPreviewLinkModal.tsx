'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, X } from 'lucide-react';
import { DetailsModalShell } from '../drawers/DetailsModalShell';
import { DrawerLinkActions } from '../drawers/DrawerLinkActions';
import {
  apiConnectIntegration,
  apiGetMailboxStatus,
  apiUpdateClientTracker,
  type MailboxStatusResponse,
} from '../../lib/api';
import {
  buildInboxComposePath,
  buildMailboxComposeUrl,
  buildSubmitToClientMailCopy,
  connectedMailboxEmail,
  connectedMailboxProviders,
  openMailboxComposeTab,
  stashInboxComposeDraft,
  type MailboxComposeProvider,
} from '../../lib/mailboxCompose';
import {
  CLIENT_TRACKER_OPTION_DEFAULTS,
  CLIENT_TRACKER_OPTION_FIELDS,
  normalizeAllowedClientStages,
  type ClientTrackerOptionKey,
  type ClientTrackerOptions,
} from '../../lib/clientTrackerOptions';
import { CLIENT_PIPELINE_STAGE_CHOICES } from '../../lib/clientReviewTypes';
import {
  getDefaultSubmitToClientMailTemplate,
  listSubmitToClientMailTemplates,
  subscribeSubmitToClientMailTemplatesChanged,
  type SubmitToClientMailTemplate,
} from '../../lib/submitToClientMailTemplate';

type Props = {
  isOpen: boolean;
  loading: boolean;
  error: string;
  reviewUrl: string;
  candidateNames: string[];
  jobTitle?: string;
  clientEmail?: string;
  clientName?: string;
  visibleCount: number | null;
  hiddenCount: number | null;
  matchId?: string;
  batchMatchIds?: string[];
  trackerOptions?: ClientTrackerOptions;
  allowedClientStages?: string[];
  onTrackerOptionsChange?: (options: ClientTrackerOptions) => void;
  onAllowedClientStagesChange?: (stages: string[]) => void;
  onClose: () => void;
  onRetry: () => void;
};

export function SubmitToClientPreviewLinkModal({
  isOpen,
  loading,
  error,
  reviewUrl,
  candidateNames,
  jobTitle,
  clientEmail,
  clientName,
  visibleCount,
  hiddenCount,
  matchId,
  batchMatchIds,
  trackerOptions,
  allowedClientStages,
  onTrackerOptionsChange,
  onAllowedClientStagesChange,
  onClose,
  onRetry,
}: Props) {
  const [mailboxStatus, setMailboxStatus] = useState<MailboxStatusResponse | null>(null);
  const [mailboxReady, setMailboxReady] = useState(false);
  const [mailHint, setMailHint] = useState('');
  const [connecting, setConnecting] = useState<MailboxComposeProvider | null>(null);
  const [savingOptions, setSavingOptions] = useState(false);
  const [optionsHint, setOptionsHint] = useState('');
  const [mailTemplates, setMailTemplates] = useState<SubmitToClientMailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const options = trackerOptions || CLIENT_TRACKER_OPTION_DEFAULTS;
  const selectedStages = useMemo(
    () =>
      normalizeAllowedClientStages(
        allowedClientStages,
        CLIENT_PIPELINE_STAGE_CHOICES,
        true,
      ),
    [allowedClientStages],
  );

  const persistPreviewOptions = async (
    nextOptions: ClientTrackerOptions,
    nextStages: string[],
  ) => {
    if (!matchId || savingOptions) return;
    onTrackerOptionsChange?.(nextOptions);
    onAllowedClientStagesChange?.(nextStages);
    setSavingOptions(true);
    setOptionsHint('');
    try {
      await apiUpdateClientTracker(matchId, {
        trackerOptions: nextOptions,
        allowedClientStages: nextStages,
        batchMatchIds: batchMatchIds && batchMatchIds.length > 1 ? batchMatchIds : undefined,
      });
      setOptionsHint('Preview options saved. The client sees these on this link.');
    } catch (err: unknown) {
      onTrackerOptionsChange?.(options);
      onAllowedClientStagesChange?.(selectedStages);
      setOptionsHint(err instanceof Error ? err.message : 'Could not save preview options.');
    } finally {
      setSavingOptions(false);
    }
  };

  useEffect(() => {
    setMailHint('');
    setConnecting(null);
    setOptionsHint('');
  }, [reviewUrl, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const refresh = (next?: SubmitToClientMailTemplate[]) => {
      const list = next || listSubmitToClientMailTemplates();
      setMailTemplates(list);
      setSelectedTemplateId((prev) => {
        if (prev && list.some((t) => t.id === prev)) return prev;
        return getDefaultSubmitToClientMailTemplate(list).id;
      });
    };
    refresh();
    return subscribeSubmitToClientMailTemplatesChanged(refresh);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || loading) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, loading, onClose]);

  useEffect(() => {
    if (!isOpen || loading || !reviewUrl) {
      setMailboxStatus(null);
      setMailboxReady(false);
      return;
    }
    let cancelled = false;
    setMailboxReady(false);
    void apiGetMailboxStatus()
      .then((status) => {
        if (!cancelled) setMailboxStatus(status);
      })
      .catch(() => {
        if (!cancelled) setMailboxStatus(null);
      })
      .finally(() => {
        if (!cancelled) setMailboxReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, loading, reviewUrl]);

  const connectedProviders = useMemo(
    () => connectedMailboxProviders(mailboxStatus),
    [mailboxStatus],
  );

  const selectedTemplate = useMemo(() => {
    return (
      mailTemplates.find((t) => t.id === selectedTemplateId) ||
      getDefaultSubmitToClientMailTemplate(mailTemplates)
    );
  }, [mailTemplates, selectedTemplateId]);

  const mailCopy = useMemo(
    () =>
      buildSubmitToClientMailCopy({
        reviewUrl,
        candidateNames,
        jobTitle,
        clientEmail,
        clientName,
        template: selectedTemplate,
      }),
    [reviewUrl, candidateNames, jobTitle, clientEmail, clientName, selectedTemplate],
  );

  if (!isOpen) return null;

  const namesLabel =
    candidateNames.length === 0
      ? ''
      : candidateNames.length === 1
        ? candidateNames[0]
        : `${candidateNames[0]} +${candidateNames.length - 1} more`;

  const openCompose = (provider: MailboxComposeProvider) => {
    const accountEmail = connectedMailboxEmail(mailboxStatus, provider);
    const brand = provider === 'gmail' ? 'Gmail' : 'Outlook';

    // Outlook: open HRYANTRA Inbox compose (review + send). Do not auto-send.
    if (provider === 'outlook') {
      const draftId = stashInboxComposeDraft({
        provider: 'outlook',
        to: clientEmail,
        subject: mailCopy.subject,
        body: mailCopy.body,
      });
      const opened = openMailboxComposeTab(buildInboxComposePath('outlook', draftId));
      setMailHint(
        opened
          ? `Opened Inbox compose for ${accountEmail || 'Outlook'}. Review and send from there.`
          : 'Allow pop-ups to open Inbox compose.',
      );
      return;
    }

    const url = buildMailboxComposeUrl({
      provider,
      to: clientEmail,
      subject: mailCopy.subject,
      body: mailCopy.body,
      accountEmail,
    });
    const opened = openMailboxComposeTab(url);
    setMailHint(
      opened
        ? accountEmail
          ? `Opened ${brand} compose for ${accountEmail}. If the wrong profile opens, choose that account once in the browser — HRYANTRA does not send this email.`
          : `Opened ${brand} compose in a new tab. Review and send it from there — HRYANTRA does not send this email.`
        : 'Allow pop-ups to open Gmail or Outlook compose.',
    );
  };

  const handleConnect = async (provider: MailboxComposeProvider) => {
    try {
      setConnecting(provider);
      await apiConnectIntegration(
        provider,
        typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined,
      );
    } catch (err: unknown) {
      setConnecting(null);
      setMailHint(err instanceof Error ? err.message : 'Could not start Gmail or Outlook connect.');
    }
  };

  const toggleTrackerOption = async (key: ClientTrackerOptionKey) => {
    const next: ClientTrackerOptions = { ...options, [key]: !options[key] };
    const nextStages =
      key === 'changeStage' && next.changeStage && selectedStages.length === 0
        ? CLIENT_PIPELINE_STAGE_CHOICES.map((s) => s.name)
        : selectedStages;
    await persistPreviewOptions(next, nextStages);
  };

  const toggleAllowedStage = async (stageName: string) => {
    if (!options.changeStage) return;
    const exists = selectedStages.includes(stageName);
    const nextStages = exists
      ? selectedStages.filter((name) => name !== stageName)
      : [...selectedStages, stageName];
    if (!nextStages.length) {
      setOptionsHint('Select at least one stage for the client.');
      return;
    }
    const ordered = CLIENT_PIPELINE_STAGE_CHOICES.map((s) => s.name).filter((name) =>
      nextStages.includes(name),
    );
    await persistPreviewOptions(options, ordered);
  };

  return (
    <DetailsModalShell
      size="md"
      zIndexClass="z-[140]"
      panelClassName="!h-auto max-h-[min(88vh,780px)]"
      onBackdropClick={loading ? undefined : onClose}
      dialogTitleId="submit-client-preview-link-title"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-indigo-100 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-600">
              Submit to Client
            </p>
            <h2 id="submit-client-preview-link-title" className="mt-1 text-lg font-bold text-slate-900">
              Client preview link
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-5">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
              <div>
                <p className="text-sm font-semibold text-slate-800">Generating preview link…</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Applying Submit to Client visibility for the selected candidate
                  {candidateNames.length > 1 ? 's' : ''}.
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4">
              <p className="text-sm font-semibold text-rose-800">Could not generate the link</p>
              <p className="mt-1 text-sm text-rose-700">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-flex items-center rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700"
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              {namesLabel ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Selected
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-800">{namesLabel}</p>
                  {candidateNames.length > 1 ? (
                    <p className="mt-1 text-xs text-slate-500">{candidateNames.join(', ')}</p>
                  ) : null}
                </div>
              ) : null}

              {visibleCount != null && hiddenCount != null ? (
                <p className="text-xs text-slate-500">
                  Client preview includes <span className="font-semibold text-slate-700">{visibleCount} visible</span>{' '}
                  fields
                  {hiddenCount > 0 ? (
                    <>
                      {' '}
                      · <span className="font-semibold text-slate-700">{hiddenCount} hidden</span> fields are not shown
                    </>
                  ) : null}
                  .
                </p>
              ) : null}

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Select fields and actions for the client
                </p>
                <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                  {CLIENT_TRACKER_OPTION_FIELDS.map((field) => (
                    <div
                      key={field.id}
                      className={field.id === 'changeStage' ? 'sm:col-span-2' : undefined}
                    >
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={options[field.id]}
                          disabled={!matchId || savingOptions}
                          onChange={() => void toggleTrackerOption(field.id)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-slate-800">
                          {field.label}
                          {field.action ? (
                            <span className="ml-1 text-[11px] font-medium text-slate-400">
                              [Action]
                            </span>
                          ) : null}
                          {field.hint ? (
                            <span className="mt-0.5 block text-[11px] font-normal leading-4 text-slate-500">
                              {field.hint}
                            </span>
                          ) : null}
                        </span>
                      </label>
                      {field.id === 'changeStage' && options.changeStage ? (
                        <div className="mt-2 ml-7 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                          <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-indigo-700">
                            Stages shown to client
                            <select
                              multiple
                              size={Math.min(8, CLIENT_PIPELINE_STAGE_CHOICES.length)}
                              disabled={!matchId || savingOptions}
                              value={selectedStages}
                              onChange={(event) => {
                                const values = Array.from(event.target.selectedOptions).map(
                                  (opt) => opt.value,
                                );
                                if (!values.length) {
                                  setOptionsHint('Select at least one stage for the client.');
                                  return;
                                }
                                const ordered = CLIENT_PIPELINE_STAGE_CHOICES.map((s) => s.name).filter(
                                  (name) => values.includes(name),
                                );
                                void persistPreviewOptions(options, ordered);
                              }}
                              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none ring-indigo-200 focus:ring-2"
                            >
                              {CLIENT_PIPELINE_STAGE_CHOICES.map((stage) => (
                                <option key={stage.id} value={stage.name}>
                                  {stage.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {CLIENT_PIPELINE_STAGE_CHOICES.map((stage) => {
                              const checked = selectedStages.includes(stage.name);
                              return (
                                <button
                                  key={stage.id}
                                  type="button"
                                  disabled={!matchId || savingOptions}
                                  onClick={() => void toggleAllowedStage(stage.name)}
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition disabled:opacity-60 ${
                                    checked
                                      ? 'bg-indigo-600 text-white ring-indigo-600'
                                      : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  {stage.name}
                                </button>
                              );
                            })}
                          </div>
                          <p className="mt-2 text-[11px] leading-4 text-slate-500">
                            Hold Ctrl/Cmd to multi-select in the list, or tap the chips. Only
                            selected stages appear in the client Stage dropdown.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
                {optionsHint ? (
                  <p className="mt-2 text-xs leading-5 text-slate-600">{optionsHint}</p>
                ) : savingOptions ? (
                  <p className="mt-2 text-xs text-slate-500">Saving preview options…</p>
                ) : null}
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Preview link
                </p>
                <div className="mt-2">
                  <DrawerLinkActions url={reviewUrl} shareTitle="Client preview" />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Send a mail to the client
                </p>
                {mailTemplates.length > 0 ? (
                  <label className="mt-3 block space-y-1">
                    <span className="text-[11px] font-medium text-slate-500">Email template</span>
                    <select
                      value={selectedTemplate.id}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none ring-indigo-200 focus:ring-2"
                    >
                      {mailTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                          {template.isDefault ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] leading-4 text-slate-500">
                      Subject: {mailCopy.subject || '—'}
                    </p>
                  </label>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!mailboxReady ? (
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-500">
                      <Loader2 size={15} className="animate-spin" />
                      Checking mail accounts…
                    </span>
                  ) : connectedProviders.length ? (
                    <>
                      {connectedProviders.includes('gmail') ? (
                        <button
                          type="button"
                          onClick={() => openCompose('gmail')}
                          className="inline-flex flex-col items-start gap-0.5 rounded-xl bg-rose-600 px-3.5 py-2.5 text-left text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Mail size={15} strokeWidth={2.25} />
                            Gmail
                          </span>
                          {connectedMailboxEmail(mailboxStatus, 'gmail') ? (
                            <span className="text-[10px] font-medium text-rose-100">
                              {connectedMailboxEmail(mailboxStatus, 'gmail')}
                            </span>
                          ) : null}
                        </button>
                      ) : null}
                      {connectedProviders.includes('outlook') ? (
                        <button
                          type="button"
                          onClick={() => openCompose('outlook')}
                          className="inline-flex flex-col items-start gap-0.5 rounded-xl bg-sky-600 px-3.5 py-2.5 text-left text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Mail size={15} strokeWidth={2.25} />
                            Outlook
                          </span>
                          {connectedMailboxEmail(mailboxStatus, 'outlook') ? (
                            <span className="text-[10px] font-medium text-sky-100">
                              {connectedMailboxEmail(mailboxStatus, 'outlook')}
                            </span>
                          ) : null}
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">Connect Gmail or Outlook to open compose.</p>
                  )}
                </div>

                {mailHint ? (
                  <p className="mt-2 text-xs leading-5 text-slate-600">{mailHint}</p>
                ) : null}

                {mailboxReady && !connectedProviders.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleConnect('gmail')}
                      disabled={connecting !== null}
                      className="inline-flex items-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                    >
                      {connecting === 'gmail' ? 'Connecting…' : 'Connect Gmail'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleConnect('outlook')}
                      disabled={connecting !== null}
                      className="inline-flex items-center rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-60"
                    >
                      {connecting === 'outlook' ? 'Connecting…' : 'Connect Outlook'}
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
          >
            Done
          </button>
        </div>
      </div>
    </DetailsModalShell>
  );
}
