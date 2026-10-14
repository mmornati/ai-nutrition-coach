import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { AppShell } from './AppShell';
import { DepartureBoard } from './DepartureBoard';
import { Header } from './Header';
import { LockButton } from './LockButton';
import { TierRadio, type Tier } from './TierRadio';
import { UpdateBanner } from './UpdateBanner';
import { Chip } from '../primitives';

describe('AppShell', () => {
  const renderShell = (onLog = vi.fn()) =>
    render(
      <AppShell
        header={
          <Header
            title="Tuesday"
            sub="13 Oct"
            chip={<Chip dot>Local</Chip>}
            settingsHref="#/settings"
          />
        }
        route={<p>route slot</p>}
        onLog={onLog}
        banner={<UpdateBanner onReload={() => undefined} onLater={() => undefined} />}
      >
        <p>content</p>
      </AppShell>,
    );

  it('has header, main, the dock (route slot + LOG) and the desktop rail', () => {
    renderShell();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('content');
    const dock = screen.getByRole('region', { name: 'Week and log' });
    expect(within(dock).getByText('route slot')).toBeInTheDocument();
    expect(dock).toHaveClass('fixed', 'lg:hidden');
    expect(within(dock).getByRole('button', { name: 'Log a plate' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Today', 'Week', 'Settings']);
  });

  it('the rail marks the current destination and shows the local status and footmark', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Today' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Week' })).not.toHaveAttribute('aria-current');
    expect(
      screen.getByText('All plates stored on this device. Nothing leaves home.'),
    ).toBeInTheDocument();
    expect(screen.getByText('yours to run · open source')).toBeInTheDocument();
  });

  it('both Log buttons (rail and dock) call onLog', async () => {
    const onLog = vi.fn();
    renderShell(onLog);
    const buttons = screen.getAllByRole('button', { name: 'Log a plate' });
    expect(buttons).toHaveLength(2);
    for (const b of buttons) await userEvent.click(b);
    expect(onLog).toHaveBeenCalledTimes(2);
  });

  it('keeps the update line after main in the DOM (screen readers) but first visually', () => {
    renderShell();
    const main = screen.getByRole('main');
    const reload = screen.getAllByRole('button', { name: 'Reload' })[0] as HTMLElement;
    expect(main.compareDocumentPosition(reload) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(reload.closest('.order-first')).not.toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = renderShell();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Header', () => {
  it('shows the day in display type, a sub line, the chip slot and a phone-only settings button', () => {
    render(
      <Header
        title="Tuesday"
        sub="13 Oct · 3 lines running"
        chip={<Chip dot>Local</Chip>}
        settingsHref="#/settings"
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Tuesday' })).toHaveClass(
      'font-display',
      'uppercase',
    );
    expect(screen.getByText('13 Oct · 3 lines running')).toBeInTheDocument();
    expect(screen.getByText('Local')).toBeInTheDocument();
    const settings = screen.getByRole('link', { name: 'Settings' });
    expect(settings).toHaveAttribute('href', '#/settings');
    expect(settings.parentElement).toHaveClass('lg:hidden');
  });
});

describe('DepartureBoard', () => {
  it('renders rows with title, subtitle, status text and selects on click', async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <DepartureBoard
        rows={[
          {
            id: 'ai',
            line: 'dairy',
            title: 'Your AI',
            subtitle: 'Reads your plate photos',
            status: 'Free quota',
            onSelect,
          },
        ]}
      />,
    );
    const row = screen.getByRole('button', { name: /Your AI/ });
    expect(row).toHaveTextContent('Reads your plate photos');
    expect(row).toHaveTextContent('Free quota');
    await userEvent.click(row);
    expect(onSelect).toHaveBeenCalled();
    expect(row).toHaveClass('min-h-[68px]');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('TierRadio', () => {
  const tiers: Tier[] = [
    { id: 'none', title: 'No AI', description: 'Log by barcode.' },
    { id: 'free', title: 'Free quota', description: 'Hosted model.' },
    { id: 'local', title: 'Local model', description: 'Not available yet.', disabled: true },
  ];
  function Controlled({ onChange }: { onChange?: (id: string) => void }) {
    const [value, setValue] = useState('free');
    return (
      <TierRadio
        tiers={tiers}
        value={value}
        onChange={(id) => {
          setValue(id);
          onChange?.(id);
        }}
      />
    );
  }

  it('is a radiogroup with the chosen tier checked and the unavailable one disabled with a v2 tag', () => {
    render(<Controlled />);
    expect(screen.getByRole('radiogroup', { name: 'AI tier' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /Free quota/ })).toBeChecked();
    const local = screen.getByRole('radio', { name: /Local model/ });
    expect(local).toBeDisabled();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('coming in version 2')).toBeInTheDocument();
  });

  it('choosing a tier selects it; arrow keys move between enabled tiers; disabled is skipped', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: /No AI/ }));
    expect(onChange).toHaveBeenLastCalledWith('none');
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: /Free quota/ })).toBeChecked();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: /No AI/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Local model/ })).not.toBeChecked();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Controlled />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('LockButton', () => {
  it('renders only when unlocked, and locks on click', async () => {
    const onLock = vi.fn();
    const { container, rerender } = render(<LockButton unlocked={false} onLock={onLock} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<LockButton unlocked onLock={onLock} />);
    await userEvent.click(screen.getByRole('button', { name: 'Lock' }));
    expect(onLock).toHaveBeenCalledTimes(1);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('UpdateBanner', () => {
  it('is one line: the message, Reload and Later; says reloading locks the data', () => {
    render(<UpdateBanner onReload={() => undefined} onLater={() => undefined} />);
    expect(screen.getByText(/A new version is ready/)).toBeInTheDocument();
    expect(screen.getByText(/Reloading locks your data/)).toBeInTheDocument();
    expect(screen.getByText(/passphrase again/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toHaveClass('min-h-12');
    expect(screen.getByRole('button', { name: 'Later' })).toHaveClass('min-h-12');
  });

  it('has no badge or count', () => {
    const { container } = render(
      <UpdateBanner onReload={() => undefined} onLater={() => undefined} />,
    );
    expect(container.textContent).not.toMatch(/\d/);
  });
});
