import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import { CoachCard, DepthPanel } from './CoachCard';

const Q = 'A handful of greens would round this plate out.';

describe('CoachCard', () => {
  it('shows the question and the two actions', () => {
    render(<CoachCard question={Q} onSure={() => {}} onAskLater={() => {}} />);
    expect(screen.getByText(Q)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sure' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask later' })).toBeInTheDocument();
  });

  it('both actions are at least 48px tall and square', () => {
    render(<CoachCard question={Q} onSure={() => {}} onAskLater={() => {}} />);
    for (const name of ['Sure', 'Ask later']) {
      const btn = screen.getByRole('button', { name });
      expect(btn.className).toContain('min-h-12');
      expect(btn.className).not.toMatch(/rounded/);
    }
  });

  it('calls onSure and onAskLater', async () => {
    const onSure = vi.fn();
    const onAskLater = vi.fn();
    render(<CoachCard question={Q} onSure={onSure} onAskLater={onAskLater} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sure' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ask later' }));
    expect(onSure).toHaveBeenCalledTimes(1);
    expect(onAskLater).toHaveBeenCalledTimes(1);
  });

  it('renders an optional short title and uses the fade-collapsing entrance class', () => {
    render(
      <CoachCard
        title="Why lentils count twice"
        question={Q}
        onSure={() => {}}
        onAskLater={() => {}}
      />,
    );
    expect(screen.getByText('Why lentils count twice')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Coach question' })).toHaveClass('day-enter');
  });

  it('announces the question inside a named group', () => {
    render(<CoachCard question={Q} onSure={() => {}} onAskLater={() => {}} />);
    expect(screen.getByRole('group', { name: 'Coach question' })).toHaveTextContent(Q);
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <CoachCard title="Title" question={Q} onSure={() => {}} onAskLater={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('DepthPanel', () => {
  it('shows the follow-up and a 48px Close that calls onClose', async () => {
    const onClose = vi.fn();
    render(<DepthPanel followUp={Q} onClose={onClose} />);
    expect(screen.getByText(Q)).toBeInTheDocument();
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close.className).toContain('min-h-12');
    await userEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('with no follow-up shows an empty panel with Close only, no "unavailable" message', () => {
    for (const followUp of [null, undefined, '']) {
      const { container, unmount } = render(<DepthPanel followUp={followUp} onClose={() => {}} />);
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
      expect(container.querySelectorAll('p')).toHaveLength(0);
      expect(container.textContent).toBe('Close');
      unmount();
    }
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <>
        <DepthPanel followUp={Q} onClose={() => {}} />
        <DepthPanel onClose={() => {}} />
      </>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
