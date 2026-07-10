// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PrivacyConsentModal } from '../../src/components/PrivacyConsentModal';
import { I18nProvider } from '../../src/i18n';

function renderModal(overrides?: { onAccept?: () => void }) {
  const onAccept = overrides?.onAccept ?? vi.fn();
  render(
    <I18nProvider initial="en">
      <PrivacyConsentModal onShare={onShare} onDecline={onDecline} />
    </I18nProvider>,
  );
  return { ...result, onShare, onDecline };
}

describe('PrivacyConsentModal', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders explicit share and decline choices', () => {
    const { container } = renderModal();
    const share = screen.getByRole('button', { name: 'Share' });
    expect(share.className).toContain('privacy-consent-action--primary');
    expect(screen.getByRole('button', { name: "Don't share" }).className)
      .not.toContain('privacy-consent-action--primary');
    expect(screen.queryByRole('button', { name: 'I get it' })).toBeNull();
    expect(container.querySelector('.privacy-consent-banner-head .kicker')).toBeNull();
  });

  it('tells the user choices are changeable in Settings', () => {
    renderModal();
    expect(screen.getByText(/Sharing usage data helps us understand/i)).toBeTruthy();
    const footer = screen.getByText(/You can change these any time/i);
    expect(footer.textContent ?? '').toMatch(/You can change these any time/i);
    expect(footer.textContent ?? '').toMatch(/Settings/);
    expect(footer.textContent ?? '').toMatch(/Privacy/);
  });

  it('invokes onAccept when the acknowledgement button is clicked', () => {
    const { onAccept } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'I get it' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});
