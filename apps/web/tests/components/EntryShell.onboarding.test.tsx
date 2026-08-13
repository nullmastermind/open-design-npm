// @vitest-environment jsdom

import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import { I18nProvider } from '../../src/i18n';
import { fetchProjectFiles } from '../../src/providers/registry';
import type { AgentInfo, AppConfig } from '../../src/types';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';

const analyticsMocks = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return {
    ...actual,
    useAnalytics: () => ({
      newRequestId: vi.fn(() => 'request-1'),
      setConfigureGlobals: vi.fn(),
      setConsent: vi.fn(),
      setIdentity: vi.fn(),
      track: analyticsMocks.track,
    }),
    useAppVersion: () => null,
  };
});

const originalFetch = globalThis.fetch;
const originalResizeObserver = globalThis.ResizeObserver;

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function amrAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'amr',
    name: 'AMR',
    bin: 'amr',
    available: true,
    models: [{ id: 'amr-model', label: 'AMR Model' }],
    ...overrides,
  };
}

function cliAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'claude-code',
    name: 'Claude Code',
    bin: 'claude',
    available: true,
    version: '1.0.0',
    models: [{ id: 'sonnet', label: 'Sonnet' }],
    ...overrides,
  };
}

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    mode: 'daemon',
    agentId: null,
    agentModels: {},
    apiProtocol: 'anthropic',
    apiProtocolConfigs: {},
    apiKey: '',
    baseUrl: '',
    model: '',
    ...overrides,
  } as AppConfig;
}

function renderOnboarding(
  overrides: Partial<React.ComponentProps<typeof EntryShell>> = {},
) {
  window.history.replaceState(null, '', '/onboarding');
  const props: React.ComponentProps<typeof EntryShell> = {
    skills: [],
    designTemplates: [],
    designSystems: [],
    projects: [],
    templates: [],
    promptTemplates: [],
    defaultDesignSystemId: null,
    connectors: [],
    connectorsLoading: false,
    config: baseConfig(),
    agents: [amrAgent(), cliAgent()],
    daemonLive: true,
    onModeChange: vi.fn(),
    onAgentChange: vi.fn(),
    onAgentModelChange: vi.fn(),
    onApiProtocolChange: vi.fn(),
    onApiModelChange: vi.fn(),
    onConfigPersist: vi.fn(),
    onRefreshAgents: vi.fn(() => [amrAgent(), cliAgent()]),
    onCreateProject: vi.fn(),
    onCreatePluginShareProject: vi.fn(),
    onImportClaudeDesign: vi.fn(),
    onOpenProject: vi.fn(),
    onOpenLiveArtifact: vi.fn(),
    onDeleteProject: vi.fn(),
    onRenameProject: vi.fn(),
    onChangeDefaultDesignSystem: vi.fn(),
    onPersistComposioKey: vi.fn(),
    onOpenSettings: vi.fn(),
    onCompleteOnboarding: vi.fn(),
    ...overrides,
  };

  function Harness() {
    const [config, setConfig] = useState(props.config);
    return (
      <I18nProvider initial="en">
        <EntryShell
          {...props}
          config={config}
          onConfigPersist={(next) => {
            props.onConfigPersist(next);
            setConfig(next as AppConfig);
          }}
        />
      </I18nProvider>
    );
  }

  render(
    <Harness />,
  );

  return props;
}

function renderHome(
  overrides: Partial<React.ComponentProps<typeof EntryShell>> = {},
  path = '/',
) {
  window.history.replaceState(null, '', path);
  const props: React.ComponentProps<typeof EntryShell> = {
    skills: [],
    designTemplates: [],
    designSystems: [],
    projects: [],
    templates: [],
    promptTemplates: [],
    defaultDesignSystemId: null,
    connectors: [],
    connectorsLoading: false,
    config: baseConfig({
      agentId: 'claude-code',
      agentModels: { 'claude-code': { model: 'sonnet' } },
    }),
    agents: [cliAgent()],
    daemonLive: true,
    onModeChange: vi.fn(),
    onAgentChange: vi.fn(),
    onAgentModelChange: vi.fn(),
    onApiProtocolChange: vi.fn(),
    onApiModelChange: vi.fn(),
    onConfigPersist: vi.fn(),
    onRefreshAgents: vi.fn(() => [cliAgent()]),
    onCreateProject: vi.fn(),
    onCreatePluginShareProject: vi.fn(),
    onImportClaudeDesign: vi.fn(),
    onOpenProject: vi.fn(),
    onOpenLiveArtifact: vi.fn(),
    onDeleteProject: vi.fn(),
    onRenameProject: vi.fn(),
    onChangeDefaultDesignSystem: vi.fn(),
    onPersistComposioKey: vi.fn(),
    onOpenSettings: vi.fn(),
    onCompleteOnboarding: vi.fn(),
    ...overrides,
  };

  render(
    <I18nProvider initial="en">
      <EntryShell {...props} />
    </I18nProvider>,
  );

  return props;
}

function trackedEvents(name: string) {
  return analyticsMocks.track.mock.calls.filter(([eventName]) => eventName === name);
}

function latestTrackedEvent<T extends Record<string, unknown>>(name: string): T {
  const calls = trackedEvents(name);
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1]?.[1] as T;
}

function findTrackedEvent<T extends Record<string, unknown>>(
  name: string,
  predicate: (payload: T) => boolean,
): T {
  const payload = trackedEvents(name)
    .map(([, eventPayload]) => eventPayload as T)
    .find(predicate);
  expect(payload).toBeTruthy();
  return payload as T;
}

function chooseOnboardingOption(label: string, option: string | RegExp) {
  const chipField = screen
    .getAllByText(label)
    .map((node) => node.closest('.onboarding-chip-field'))
    .find((node): node is HTMLElement => node instanceof HTMLElement);
  if (chipField) {
    const matcher = option instanceof RegExp ? option : new RegExp(option, 'i');
    const chip = Array.from(chipField.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      matcher.test(button.textContent ?? ''),
    );
    if (!(chip instanceof HTMLButtonElement)) {
      throw new Error(`profile chip not found: ${label} / ${String(option)}`);
    }
    fireEvent.click(chip);
    return;
  }

  const dropdownField = screen
    .getAllByText(label)
    .map((node) => node.closest('.onboarding-view__select-field'))
    .find((node): node is HTMLElement => node instanceof HTMLElement);
  if (!dropdownField) throw new Error(`profile field not found: ${label}`);
  const trigger = dropdownField.querySelector('button');
  if (!(trigger instanceof HTMLButtonElement)) {
    throw new Error(`profile field trigger not found: ${label}`);
  }
  fireEvent.click(trigger);
  fireEvent.click(
    screen.getByRole('option', {
      name: option instanceof RegExp ? option : new RegExp(option, 'i'),
    }),
  );
}

async function waitForModelSourceChooser() {
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Choose your model source' })).toBeTruthy();
  });
}

async function openLocalRuntimeSetup() {
  await waitForModelSourceChooser();
  fireEvent.click(screen.getByRole('radio', { name: /Local Agent/i }));
  fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
  expect(await screen.findByText('Local CLI')).toBeTruthy();
}

async function openByokRuntimeSetup() {
  await waitForModelSourceChooser();
  fireEvent.click(screen.getByRole('radio', { name: /Bring Your Own Key/i }));
  fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
  expect(await screen.findByRole('heading', { name: 'Bring Your Own Key' })).toBeTruthy();
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  globalThis.ResizeObserver = originalResizeObserver;
  vi.useRealTimers();
  analyticsMocks.track.mockReset();
  window.sessionStorage.clear();
});

beforeEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  analyticsMocks.track.mockReset();
});

describe('EntryShell settings menu', () => {
  it('opens settings from the signed-out rail without duplicating the footer action', async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      return jsonResponse({});
    }) as typeof fetch;
    const props = renderHome();

    // The signed-out rail's own settings item (below 扩展) is the single
    // settings entry — the #5517 footer carries none.
    fireEvent.click(await screen.findByTestId('entry-settings-button'));

    expect(props.onOpenSettings).toHaveBeenCalledWith();
    expect(screen.getAllByTestId('entry-settings-button')).toHaveLength(1);
  });
});

describe('EntryShell design systems view', () => {
  it('leaves workspace-scoped design-system activation to the mounted tab', async () => {
    const onDesignSystemsRefresh = vi.fn();
    renderHome({ onDesignSystemsRefresh }, '/design-systems');

    expect(await screen.findByTestId('entry-view-design-systems')).toHaveAttribute(
      'data-active',
      'true',
    );
    // DesignSystemsTab owns its Team SSE activation and fallback snapshot.
    // Calling the App-level catalog refresh here as well creates a duplicate,
    // differently-scoped request every time the route becomes active.
    expect(onDesignSystemsRefresh).not.toHaveBeenCalled();
  });
});

describe('EntryShell route scroll isolation', () => {
  afterEach(() => {
    window.localStorage.removeItem('od.entry.railOpen');
  });

  function entryScrollContainer(): HTMLElement {
    const scrollContainer = document.querySelector('.entry-main--scroll');
    expect(scrollContainer).toBeInstanceOf(HTMLElement);
    if (!(scrollContainer instanceof HTMLElement)) {
      throw new Error('entry scroll container not found');
    }
    return scrollContainer;
  }

  // #5517 reshaped the rail: the flat `entry-nav-projects` button is gone, and
  // its Drafts / All-projects replacements only mount under a workspace
  // context this render has none of. Design systems is the nearest rail
  // destination that survives in every state, and the reset it exercises is the
  // same shared `.entry-main--scroll` element, so the spec's subject is intact.
  it('resets the shared scroll offset when navigating away from Home', async () => {
    window.localStorage.setItem('od.entry.railOpen', 'true');
    renderHome();

    const scrollContainer = entryScrollContainer();
    scrollContainer.scrollTop = 280;
    fireEvent.click(screen.getByTestId('entry-nav-design-systems'));

    await waitFor(() => {
      expect(
        screen.getByTestId('entry-view-design-systems').getAttribute('data-active'),
      ).toBe('true');
    });
    expect(scrollContainer.scrollTop).toBe(0);
  });

  it('resets the shared scroll offset when navigating from Projects to Home', async () => {
    window.localStorage.setItem('od.entry.railOpen', 'true');
    renderHome({}, '/projects');

    const scrollContainer = entryScrollContainer();
    scrollContainer.scrollTop = 360;
    fireEvent.click(screen.getByTestId('entry-nav-home'));

    await waitFor(() => {
      expect(screen.getByTestId('entry-view-home').getAttribute('data-active')).toBe('true');
    });
    expect(scrollContainer.scrollTop).toBe(0);
  });
});

describe('EntryShell project reopen request priority', () => {
  it('aborts Home cover work, keeps hidden Projects idle, and lets the foreground files read finish', async () => {
    const files = [{
      name: 'index.html',
      path: 'index.html',
      kind: 'html' as const,
      mtime: 1,
      size: 1,
      mime: 'text/html',
    }];
    const fileRequests: Array<RequestInit | undefined> = [];
    const fetchMock = vi.fn(
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
        if (url === '/api/projects/project-reopen/files') {
          // Single-flight (`lib/shared-cancellable-get`) gives every `/files`
          // reader — cancellable or not — one shared request carrying the
          // shared AbortSignal, so "is this the background scan?" is the
          // request ordinal, not the presence of a signal. Request #1 is
          // Home's cover scan and must hang until it is aborted; the
          // foreground read that follows it must be answered.
          const isBackgroundCoverScan = fileRequests.length === 0;
          fileRequests.push(init);
          if (isBackgroundCoverScan) {
            return new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                'abort',
                () => reject(new DOMException('Aborted', 'AbortError')),
                { once: true },
              );
            });
          }
          return jsonResponse({ files });
        }
        if (url.includes('/api/live-artifacts?projectId=project-reopen')) {
          return jsonResponse({ liveArtifacts: [] });
        }
        return jsonResponse({});
      },
    );
    globalThis.fetch = fetchMock as typeof fetch;
    const onOpenProject = vi.fn((projectId: string) => {
      expect(projectId).toBe('project-reopen');
      // App leaves EntryShell when it opens ProjectView. Model that boundary
      // directly so the mounted Home strip must cancel its background probe.
      cleanup();
    });

    renderHome({
      projects: [{
        id: 'project-reopen',
        name: 'Reopen project',
        skillId: null,
        designSystemId: null,
        createdAt: 1,
        updatedAt: 2,
        status: { value: 'not_started' },
      }],
      onOpenProject,
    });

    await waitFor(() => expect(fileRequests).toHaveLength(1));
    const homeSignal = fileRequests[0]?.signal;
    expect(homeSignal).toBeDefined();
    // DesignsTab is mounted under EntryShell's hidden Projects pane, but its
    // own background files/live-artifact scans must remain dormant.
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).includes('/api/live-artifacts?projectId=project-reopen'),
      ),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /Reopen project/ }));

    expect(onOpenProject).toHaveBeenCalledTimes(1);
    expect(homeSignal?.aborted).toBe(true);
    await expect(fetchProjectFiles('project-reopen')).resolves.toEqual(files);
    expect(fileRequests).toHaveLength(2);
    // The foreground read must own a live request of its own: it neither joins
    // the abandoned scan's dead entry nor inherits its aborted signal.
    const foregroundSignal = fileRequests[1]?.signal;
    expect(foregroundSignal).toBeDefined();
    expect(foregroundSignal).not.toBe(homeSignal);
    expect(foregroundSignal?.aborted).toBe(false);
  });
});

describe('EntryShell new project rail', () => {
  // The rail's "+ New project" button (`entry-nav-new-project`) is gone in
  // #5517's rail: `EntryShell` still passes `onNewProject` — with its
  // `new_project_plus` ui_click — to `EntryNavRail`, but the rail never renders
  // a control that calls it, so the button and that analytics event are both
  // unreachable. The spec that drove it is therefore removed; opening the
  // new-project modal is still covered by the Projects-view CTA below, which is
  // the surviving entry point.

  it('opens the new project modal from the Projects view new-project button', async () => {
    const fetchMock = vi.fn(
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url === '/api/projects' && init?.method === 'POST') {
          return jsonResponse({
            project: {
              id: 'blank-project-from-projects',
              name: 'Untitled',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            conversationId: 'conversation-2',
          });
        }
        if (url.endsWith('/api/projects/project-existing/files')) {
          return jsonResponse({ files: [] });
        }
        if (url.endsWith('/api/live-artifacts?projectId=project-existing')) {
          return jsonResponse({ liveArtifacts: [] });
        }
        return jsonResponse({});
      });
    globalThis.fetch = fetchMock as typeof fetch;
    // Start directly on the Projects view (/projects). The nav rail no longer
    // has a single "Projects" button — the projects list is its own route,
    // reachable via /projects or Home's "view all" — so drive the DesignsTab's
    // own new-project CTA rather than a removed rail button.
    const props = renderHome({
      projects: [
        {
          id: 'project-existing',
          name: 'Existing project',
          skillId: null,
          designSystemId: null,
          createdAt: 1,
          updatedAt: 2,
          status: { value: 'not_started' },
        },
      ],
    }, '/projects');

    fireEvent.click(screen.getByTestId('designs-new-project'));

    await waitFor(() => {
      expect(screen.getByTestId('new-project-modal')).toBeTruthy();
    });
    expect(screen.getByTestId('new-project-panel')).toBeTruthy();
    expect(props.onOpenProject).not.toHaveBeenCalled();
    expect(props.onCreateProject).not.toHaveBeenCalled();
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) => input === '/api/projects' && init?.method === 'POST',
    );
    expect(createCall).toBeUndefined();
    expect(analyticsMocks.track).toHaveBeenCalledWith(
      'ui_click',
      expect.objectContaining({
        page_name: 'projects',
        area: 'list_controls',
        element: 'create_project',
      }),
      undefined,
    );
  });
});

describe('EntryShell Home submit handoff', () => {
  it('keeps the Home run button in sending state until project creation resolves', async () => {
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.endsWith('/api/plugins')) return jsonResponse({ plugins: [] });
      if (url.endsWith('/api/mcp/servers')) return jsonResponse({ servers: [] });
      return jsonResponse({});
    }) as typeof fetch;
    let resolveCreate: (accepted: boolean) => void = () => undefined;
    const onCreateProject = vi.fn(
      () => new Promise<boolean>((resolve) => { resolveCreate = resolve; }),
    );
    renderHome({ onCreateProject });

    await screen.findByTestId('home-hero-input');
    setHomeHeroPrompt('Build a landing page');
    const submit = await screen.findByTestId('home-hero-submit') as HTMLButtonElement;
    fireEvent.click(submit);

    await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(1));
    expect(submit.disabled).toBe(true);
    // #5517: the submit is icon-only (spinner while sending) — assert the
    // busy state through aria instead of the removed label text.
    expect(submit.getAttribute('aria-busy')).toBe('true');

    resolveCreate(true);
    await waitFor(() => expect(submit.disabled).toBe(false));
  });
});

describe('EntryShell onboarding Open Design AMR runtime', () => {
  it('shows the model-source chooser to a signed-out completed setup without clearing saved setup', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', configPath: '/x', user: null }),
    ) as typeof fetch;
    const props = renderOnboarding({
      config: baseConfig({
        onboardingCompleted: true,
        mode: 'api',
        apiKey: 'persisted-key',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
      }),
    });

    expect(
      await screen.findByRole('heading', { name: 'Choose your model source' }),
    ).toBeTruthy();
    expect(window.location.pathname).toBe('/onboarding');
    expect(props.onConfigPersist).not.toHaveBeenCalled();
    expect(props.onModeChange).not.toHaveBeenCalled();
    expect(props.onAgentChange).not.toHaveBeenCalled();
  });

  it('shows the model-source chooser first without exposing legacy onboarding steps', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        loggedIn: true,
        profile: 'prod',
        configPath: '/x',
        user: { id: 'u', email: 'user@example.com' },
      }),
    ) as typeof fetch;
    renderOnboarding();

    expect(
      await screen.findByRole('heading', { name: 'Choose your model source' }),
    ).toBeTruthy();
    expect(screen.queryByRole('radio', { name: /Open Design Hosted/i })).toBeNull();
    expect(screen.getByRole('radio', { name: /Local Agent/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Bring Your Own Key/i })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'About you' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Stay in the loop' })).toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Create once, build everywhere' }),
    ).toBeNull();
  });

  it('supports arrow-key selection and focus within the model-source radio group', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        loggedIn: true,
        profile: 'prod',
        configPath: '/x',
        user: { id: 'u', email: 'user@example.com' },
      }),
    ) as typeof fetch;
    renderOnboarding();

    await waitForModelSourceChooser();
    const local = screen.getByRole('radio', { name: /Local Agent/i });
    const byok = screen.getByRole('radio', { name: /Bring Your Own Key/i });
    local.focus();
    fireEvent.keyDown(local, { key: 'ArrowDown' });

    expect(byok.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(byok);
    fireEvent.keyDown(byok, { key: 'ArrowUp' });
    expect(local.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(local);
  });

  it('shows the model-source chooser again for a completed but invalid setup', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        loggedIn: true,
        profile: 'prod',
        configPath: '/x',
        user: { id: 'u', email: 'user@example.com' },
      }),
    ) as typeof fetch;
    const props = renderOnboarding({
      config: baseConfig({
        onboardingCompleted: true,
        mode: 'api',
        apiKey: '',
        baseUrl: '',
        model: '',
      }),
    });

    expect(
      await screen.findByRole('heading', { name: 'Choose your model source' }),
    ).toBeTruthy();
    expect(props.onCompleteOnboarding).not.toHaveBeenCalled();
    expect(props.onModeChange).not.toHaveBeenCalled();
    expect(props.onAgentChange).not.toHaveBeenCalled();
  });

  it('requires a successful Local Agent test before persisting and completing setup', async () => {
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          loggedIn: true,
          profile: 'prod',
          configPath: '/x',
          user: { id: 'u', email: 'user@example.com' },
        });
      }
      if (url.endsWith('/api/test/connection') && init?.method === 'POST') {
        return jsonResponse({
          ok: true,
          kind: 'success',
          latencyMs: 12,
          model: 'sonnet',
          sample: 'pong',
          agentName: 'Claude Code',
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const props = renderOnboarding({
      config: baseConfig({
        agentId: 'claude-code',
        agentModels: { 'claude-code': { model: 'sonnet' } },
      }),
    });

    await waitForModelSourceChooser();
    fireEvent.click(screen.getByRole('radio', { name: /Local Agent/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));

    expect(await screen.findByRole('heading', { name: 'Local Agent' })).toBeTruthy();
    const continueButton = screen.getByRole('button', { name: /^Continue$/i });
    expect(continueButton.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /^Test$/i }));
    expect(await screen.findByText(/Claude Code replied in 12 ms/i)).toBeTruthy();
    expect(continueButton.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(props.onCompleteOnboarding).toHaveBeenCalledTimes(1);
    });
    expect(props.onConfigPersist).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'daemon', agentId: 'claude-code' }),
    );
    expect(
      findTrackedEvent<Record<string, unknown>>(
        'ui_click',
        (payload) => payload.element === 'local_coding_agent',
      ),
    ).toMatchObject({
      area: 'model_source',
      step_name: 'model_source',
      runtime_type: 'local_cli',
    });
    expect(latestTrackedEvent('onboarding_complete_result')).toMatchObject({
      result: 'completed',
      exit_step_name: 'runtime_setup',
      runtime_type: 'local_cli',
    });
    expect(
      trackedEvents('page_view').filter(([, payload]) =>
        (payload as Record<string, unknown>).area === 'runtime_setup',
      ),
    ).toHaveLength(1);
  });

  it('excludes AMR from the Local CLI agent list', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        loggedIn: true,
        profile: 'prod',
        user: { id: 'u', email: 'user@example.com' },
        configPath: '/x',
      }),
    ) as typeof fetch;
    renderOnboarding();

    await openLocalRuntimeSetup();

    const localPanel = screen.getByText('Local CLI').closest('.onboarding-view__setup-panel');
    expect(localPanel?.textContent).toContain('Claude Code');
    expect(localPanel?.textContent).not.toContain('AMR');
  });

  it('tests the selected Local CLI agent from onboarding', async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          loggedIn: true,
          profile: 'prod',
          configPath: '/x',
          user: { id: 'u', email: 'user@example.com' },
        });
      }
      if (url.endsWith('/api/test/connection') && init?.method === 'POST') {
        return jsonResponse({
          ok: true,
          kind: 'success',
          latencyMs: 12,
          model: 'sonnet',
          sample: 'pong',
          agentName: 'Claude Code',
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    renderOnboarding({
      config: baseConfig({
        agentId: 'claude-code',
        agentCliEnv: { 'claude-code': { OPEN_DESIGN_TEST: '1' } },
        agentModels: { 'claude-code': { model: 'sonnet', reasoning: 'high' } },
      }),
      agents: [amrAgent(), cliAgent()],
      onRefreshAgents: vi.fn(() => [amrAgent(), cliAgent()]),
    });

    await openLocalRuntimeSetup();
    fireEvent.click(screen.getByRole('button', { name: /^Test$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Claude Code replied in 12 ms/i)).toBeTruthy();
    });
    const connectionTestCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/api/test/connection'),
    );
    expect(connectionTestCalls).toHaveLength(1);
    expect(JSON.parse(String(connectionTestCalls[0]?.[1]?.body))).toMatchObject({
      mode: 'agent',
      agentId: 'claude-code',
      model: 'sonnet',
      reasoning: 'high',
      agentCliEnv: { 'claude-code': { OPEN_DESIGN_TEST: '1' } },
    });
  });

  it('renders Local CLI test failures as alerts in onboarding', async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          loggedIn: true,
          profile: 'prod',
          user: { id: 'u', email: 'user@example.com' },
          configPath: '/x',
        });
      }
      if (url.endsWith('/api/test/connection') && init?.method === 'POST') {
        return jsonResponse({
          ok: false,
          kind: 'agent_not_installed',
          latencyMs: 0,
          agentName: 'Claude Code',
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    renderOnboarding({
      config: baseConfig({ agentId: 'claude-code' }),
      agents: [amrAgent(), cliAgent()],
      onRefreshAgents: vi.fn(() => [amrAgent(), cliAgent()]),
    });

    await openLocalRuntimeSetup();
    fireEvent.click(screen.getByRole('button', { name: /^Test$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Claude Code is not installed or not in PATH.');
  });

  it('uses provider preferences instead of the first upstream model during BYOK onboarding', async () => {
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          loggedIn: true,
          profile: 'prod',
          user: { id: 'u', email: 'user@example.com' },
          configPath: '/x',
        });
      }
      if (url.endsWith('/api/provider/models') && init?.method === 'POST') {
        return jsonResponse({
          ok: true,
          kind: 'success',
          latencyMs: 10,
          models: [
            { id: 'upstream-first', label: 'Upstream First' },
            { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const props = renderOnboarding({
      config: baseConfig({
        apiProtocol: 'anthropic',
        apiKey: 'test-api-key',
        baseUrl: 'https://api.anthropic.com',
        model: '',
        apiProviderBaseUrl: 'https://api.anthropic.com',
      }),
    });

    await openByokRuntimeSetup();
    fireEvent.click(screen.getByRole('button', { name: /Fetch models/i }));

    await waitFor(() => {
      expect(props.onApiModelChange).toHaveBeenCalledWith('claude-sonnet-4-5');
    });
    expect(props.onApiModelChange).not.toHaveBeenCalledWith('upstream-first');
  });

  it('persists the BYOK config before finishing onboarding', async () => {
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          loggedIn: true,
          profile: 'prod',
          configPath: '/x',
          user: { id: 'u', email: 'user@example.com' },
        });
      }
      if (url.endsWith('/api/provider/models') && init?.method === 'POST') {
        return jsonResponse({
          ok: true,
          kind: 'success',
          latencyMs: 10,
          models: [
            { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
            { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
          ],
        });
      }
      if (url.endsWith('/api/test/connection') && init?.method === 'POST') {
        return jsonResponse({
          ok: true,
          kind: 'success',
          latencyMs: 12,
          model: 'claude-opus-4-8',
          sample: 'Connected',
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const props = renderOnboarding();

    await waitForModelSourceChooser();
    fireEvent.click(screen.getByRole('radio', { name: /Bring Your Own Key/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    expect(await screen.findByRole('heading', { name: 'Bring Your Own Key' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'test-api-key' } });
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://api.anthropic.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Fetch models/i }));
    await waitFor(() => {
      expect(screen.getByText('Fetched 2 models.')).toBeTruthy();
    });
    chooseOnboardingOption('Model', /claude-opus-4-8/i);
    fireEvent.click(screen.getByRole('button', { name: /^Test$/i }));
    await waitFor(() => {
      expect(screen.getByText(/Connected\. Replied in 12 ms/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));

    expect(props.onModeChange).not.toHaveBeenCalled();
    expect(props.onApiModelChange).toHaveBeenCalledWith('claude-opus-4-8');
    expect(props.onConfigPersist).toHaveBeenCalled();
    await waitFor(() => {
      expect(props.onCompleteOnboarding).toHaveBeenCalledTimes(1);
    });
    expect((props.onConfigPersist as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).toMatchObject({
      mode: 'api',
      apiProtocol: 'anthropic',
      apiKey: 'test-api-key',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-4-8',
      apiProviderBaseUrl: null,
    });
    expect(latestTrackedEvent('onboarding_complete_result')).toMatchObject({
      result: 'completed',
      exit_step_name: 'runtime_setup',
      runtime_type: 'byok',
    });
  });

  it('lets Azure BYOK onboarding enter a custom deployment directly', async () => {
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          loggedIn: true,
          profile: 'prod',
          user: { id: 'u', email: 'user@example.com' },
          configPath: '/x',
        });
      }
      if (url.endsWith('/api/test/connection') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body ?? '{}'));
        expect(body).toMatchObject({
          protocol: 'azure',
          apiKey: 'azure-key',
          baseUrl: 'https://example.openai.azure.com',
          model: 'deployment-one',
        });
        return jsonResponse({
          ok: true,
          kind: 'success',
          latencyMs: 11,
          model: 'deployment-one',
          sample: 'Connected',
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const props = renderOnboarding({
      config: baseConfig({
        mode: 'api',
        apiProtocol: 'azure',
        apiProviderBaseUrl: '',
      }),
    });

    await openByokRuntimeSetup();

    expect(screen.getByRole('tab', { name: 'Azure OpenAI' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect((screen.getByRole('button', { name: /Fetch models/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getAllByRole('button', { name: 'Azure OpenAI' }).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'azure-key' } });
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://example.openai.azure.com' },
    });
    fireEvent.change(screen.getByLabelText('Deployment name'), {
      target: { value: 'deployment-one' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Test$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Connected\. Replied in 11 ms/i)).toBeTruthy();
    });
    expect(props.onApiModelChange).toHaveBeenCalledWith('deployment-one');
    expect((props.onConfigPersist as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).toMatchObject({
      mode: 'api',
      apiProtocol: 'azure',
      apiKey: 'azure-key',
      apiProviderBaseUrl: '',
      baseUrl: 'https://example.openai.azure.com',
      model: 'deployment-one',
    });
  });
});
