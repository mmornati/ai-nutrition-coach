import { useState, type ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';
import { ConfirmDialog } from './ConfirmDialog';
import { EraseLocalDataDialog } from './EraseLocalDataDialog';
import { OffLookupNotice } from './OffLookupNotice';
import { PhotoConsentDialog } from './PhotoConsentDialog';
import { RemovePlateDialog } from './RemovePlateDialog';

/** A page with an opener button and a dialog that is open or closed by the parent, as in the app. */
function Harness({ children }: { children: (open: boolean, close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open it
      </button>
      {children(open, () => setOpen(false))}
    </>
  );
}

describe('Dialog', () => {
  it('opens as a modal labelled by its title, and mounts no content while closed', async () => {
    render(
      <Harness>
        {(open, close) => (
          <Dialog open={open} onClose={close} title="Hello">
            <p>Body</p>
          </Dialog>
        )}
      </Harness>,
    );
    expect(screen.queryByText('Body')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    const dialog = screen.getByRole('dialog', { name: 'Hello' });
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('Esc closes it and focus returns to the opener', async () => {
    render(
      <Harness>
        {(open, close) => (
          <Dialog open={open} onClose={close} title="Hello">
            <button type="button">Inside</button>
          </Dialog>
        )}
      </Harness>,
    );
    const opener = screen.getByRole('button', { name: 'Open it' });
    await userEvent.click(opener);
    expect(screen.getByRole('button', { name: 'Inside' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('Esc is ignored when escDismiss is false', async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Hello" escDismiss={false}>
        <button type="button">Inside</button>
      </Dialog>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveAttribute('open');
  });

  it('a click on the scrim (the dialog itself) dismisses; a click inside does not', async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Hello">
        <button type="button">Inside</button>
      </Dialog>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Inside' }));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('scrimDismiss=false keeps it open on a scrim click', async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Hello" scrimDismiss={false}>
        <p>Body</p>
      </Dialog>,
    );
    await userEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('data-autofocus chooses the initial focus', () => {
    render(
      <Dialog open onClose={() => undefined} title="Hello">
        <button type="button">First</button>
        <button type="button" data-autofocus>
          Chosen
        </button>
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'Chosen' })).toHaveFocus();
  });

  it('does not report a dismissal when the parent closes it', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Dialog open onClose={onClose} title="Hello">
        <p>Body</p>
      </Dialog>,
    );
    rerender(
      <Dialog open={false} onClose={onClose} title="Hello">
        <p>Body</p>
      </Dialog>,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a dialog nested in another one dismisses only itself (cancel and close bubble in React)', async () => {
    const outerClose = vi.fn();
    function Nested() {
      const [inner, setInner] = useState(false);
      return (
        <Dialog open onClose={outerClose} title="Outer">
          <button type="button" onClick={() => setInner(true)}>
            Open inner
          </button>
          <Dialog open={inner} onClose={() => setInner(false)} title="Inner">
            <p>Inner body</p>
          </Dialog>
        </Dialog>
      );
    }
    render(<Nested />);
    await userEvent.click(screen.getByRole('button', { name: 'Open inner' }));
    expect(screen.getByRole('dialog', { name: 'Inner' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Inner body')).not.toBeInTheDocument());
    expect(outerClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument();
  });

  it('has no axe violations when open', async () => {
    const { baseElement } = render(
      <Dialog open onClose={() => undefined} title="Hello">
        <p>Body</p>
        <button type="button">OK</button>
      </Dialog>,
    );
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});

describe('ConfirmDialog', () => {
  it('the safe choice has initial focus and is the dismiss action', async () => {
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Sure?"
        body={<p>Calm words</p>}
        confirmLabel="Do it"
        dismissLabel="Not now"
        onConfirm={onConfirm}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByRole('alertdialog', { name: 'Sure?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('is described by its body text', () => {
    render(
      <ConfirmDialog
        open
        title="Sure?"
        body={<p>Calm words</p>}
        confirmLabel="Do it"
        dismissLabel="Not now"
        onConfirm={() => undefined}
        onDismiss={() => undefined}
      />,
    );
    expect(screen.getByRole('alertdialog', { name: 'Sure?' })).toHaveAccessibleDescription(
      'Calm words',
    );
  });

  it('both buttons are the same size class', () => {
    render(
      <ConfirmDialog
        open
        title="Sure?"
        body="x"
        confirmLabel="Do it"
        dismissLabel="Not now"
        onConfirm={() => undefined}
        onDismiss={() => undefined}
      />,
    );
    for (const name of ['Do it', 'Not now']) {
      expect(screen.getByRole('button', { name })).toHaveClass('min-h-12', 'flex-1');
    }
  });
});

describe('EraseLocalDataDialog', () => {
  it('"Keep my data" is the default and the dismiss; there is no countdown', async () => {
    const onKeep = vi.fn();
    const onErase = vi.fn();
    const { baseElement } = render(<EraseLocalDataDialog open onKeep={onKeep} onErase={onErase} />);
    expect(
      screen.getByRole('alertdialog', { name: 'Erase everything on this device?' }),
    ).toBeInTheDocument();
    const keep = screen.getByRole('button', { name: 'Keep my data' });
    expect(keep).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Erase' })).toBeEnabled();
    expect(baseElement.textContent).not.toMatch(/\b\d+\s*(s|sec|seconds)\b/i);
    await userEvent.keyboard('{Escape}');
    expect(onKeep).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Erase' }));
    expect(onErase).toHaveBeenCalledTimes(1);
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});

describe('RemovePlateDialog', () => {
  it('names the dish and keeps the plate by default', async () => {
    const onKeep = vi.fn();
    const onRemove = vi.fn();
    const { baseElement } = render(
      <RemovePlateDialog open dish="Rice, salmon" onKeep={onKeep} onRemove={onRemove} />,
    );
    expect(screen.getByText(/Rice, salmon will be removed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep it' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onKeep).toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});

describe('PhotoConsentDialog', () => {
  const host = 'api.example-ai.test';

  it('names the host verbatim in the title and the body', () => {
    render(
      <PhotoConsentDialog open host={host} onAllow={() => undefined} onDecline={() => undefined} />,
    );
    expect(
      screen.getByRole('alertdialog', { name: `Send this photo to ${host}?` }),
    ).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Also visible to ${host}`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${host} may keep requests`))).toBeInTheDocument();
    expect(screen.getByText(/Not sent: your name, your history/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Allow ${host}` })).toBeInTheDocument();
  });

  it('through this server: says both hops plainly, names the provider, and stays accessible', async () => {
    const { baseElement } = render(
      <PhotoConsentDialog
        open
        host="plate.example.test"
        via="Acme AI"
        onAllow={() => undefined}
        onDecline={() => undefined}
      />,
    );
    const dialog = screen.getByRole('alertdialog', { name: 'Send this photo to this server?' });
    expect(dialog.textContent).toContain('goes to this server (plate.example.test)');
    expect(dialog.textContent).toContain('adds its own AI key and passes it on to Acme AI');
    expect(dialog.textContent).toContain('Also visible to whoever runs plate.example.test');
    expect(dialog.textContent).toContain(
      'Acme AI receives the photo from this server, not from your device',
    );
    expect(dialog.textContent).toContain('Acme AI may keep requests under its own terms');
    expect(screen.getByRole('button', { name: 'Allow this server' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
    expect(await axe(baseElement)).toHaveNoViolations();
  });

  it('web wording mentions the address of this site; the other wording does not', () => {
    const { rerender } = render(
      <PhotoConsentDialog open host={host} onAllow={() => undefined} onDecline={() => undefined} />,
    );
    expect(screen.getByText(/the address of this site/)).toBeInTheDocument();
    rerender(
      <PhotoConsentDialog
        open
        host={host}
        onWeb={false}
        onAllow={() => undefined}
        onDecline={() => undefined}
      />,
    );
    expect(screen.queryByText(/the address of this site/)).not.toBeInTheDocument();
  });

  it('has nothing pre-ticked: no checkbox, switch or radio at all', () => {
    const { baseElement } = render(
      <PhotoConsentDialog open host={host} onAllow={() => undefined} onDecline={() => undefined} />,
    );
    expect(
      baseElement.querySelectorAll('input, [role="checkbox"], [role="switch"], [role="radio"]'),
    ).toHaveLength(0);
  });

  it('"Not now" is as large and quiet as "Allow": same classes, same flex share', () => {
    render(
      <PhotoConsentDialog open host={host} onAllow={() => undefined} onDecline={() => undefined} />,
    );
    const decline = screen.getByRole('button', { name: 'Not now' });
    const allow = screen.getByRole('button', { name: `Allow ${host}` });
    expect(decline.className).toBe(allow.className);
    expect(decline).toHaveClass('min-h-12', 'flex-1');
  });

  it('links to the in-app privacy route, never an external URL', () => {
    render(
      <PhotoConsentDialog open host={host} onAllow={() => undefined} onDecline={() => undefined} />,
    );
    const link = screen.getByRole('link', { name: 'What this app stores and sends' });
    expect(link).toHaveAttribute('href', '#/privacy');
  });

  it('per-photo mode asks about this one photo', () => {
    render(
      <PhotoConsentDialog
        open
        host={host}
        perPhoto
        onAllow={() => undefined}
        onDecline={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Send this photo' })).toBeInTheDocument();
    expect(screen.getByText(/You are asked before every photo/)).toBeInTheDocument();
  });

  it('is described by its body text', () => {
    render(
      <PhotoConsentDialog open host={host} onAllow={() => undefined} onDecline={() => undefined} />,
    );
    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(new RegExp(`${host}`));
  });

  it('declining is the default focus, Esc declines, and the scrim does not answer', async () => {
    const onAllow = vi.fn();
    const onDecline = vi.fn();
    const { baseElement } = render(
      <PhotoConsentDialog open host={host} onAllow={onAllow} onDecline={onDecline} />,
    );
    expect(screen.getByRole('button', { name: 'Not now' })).toHaveFocus();
    await userEvent.click(screen.getByRole('alertdialog'));
    expect(onDecline).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onAllow).not.toHaveBeenCalled();
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});

describe('OffLookupNotice', () => {
  it('offers two equal choices and a link to the privacy page', async () => {
    const onAllow = vi.fn();
    const onOfflineOnly = vi.fn();
    const { baseElement } = render(
      <OffLookupNotice open onAllow={onAllow} onOfflineOnly={onOfflineOnly} />,
    );
    const ok = screen.getByRole('button', { name: 'OK' });
    const offline = screen.getByRole('button', { name: 'Don’t look up online' });
    expect(ok.className).toBe(offline.className);
    expect(screen.getByRole('link', { name: 'What this app stores and sends' })).toHaveAttribute(
      'href',
      '#/privacy',
    );
    await userEvent.click(ok);
    expect(onAllow).toHaveBeenCalledTimes(1);
    expect(await axe(baseElement)).toHaveNoViolations();
  });

  it('any other dismissal (Esc, scrim) means offline only', async () => {
    const onAllow = vi.fn();
    const onOfflineOnly = vi.fn();
    render(<OffLookupNotice open onAllow={onAllow} onOfflineOnly={onOfflineOnly} />);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('dialog'));
    expect(onOfflineOnly).toHaveBeenCalledTimes(2);
    expect(onAllow).not.toHaveBeenCalled();
  });
});
