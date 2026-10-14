import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import {
  Button,
  Checkbox,
  Chip,
  GroupMarker,
  ICONS,
  IconButton,
  TextField,
  VersionTag,
  VisuallyHidden,
  GearIcon,
} from '.';

describe('Button', () => {
  it('is a square, at-least-48px button with its label', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Log a plate</Button>);
    const button = screen.getByRole('button', { name: 'Log a plate' });
    expect(button).toHaveClass('min-h-12', 'rounded-none', 'uppercase', 'font-display');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders each variant with a distinct look', () => {
    const { rerender } = render(<Button variant="solid-porcelain">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-porcelain');
    rerender(<Button variant="outline-porcelain">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-transparent', 'border-porcelain');
    rerender(<Button variant="solid-enamel">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-enamel');
    rerender(<Button variant="ghost-enamel">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('text-enamel', 'border-enamel');
  });

  it('disabled does not fire', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Log
      </Button>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('busy is inert, announces aria-busy, swaps the label and shows no spinner', async () => {
    const onClick = vi.fn();
    const { container } = render(
      <Button busy busyLabel="Logging…" onClick={onClick}>
        Log
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Logging…' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('svg, [role="progressbar"]')).toBeNull();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('busy keeps focus (aria-disabled, not disabled) and ignores clicks', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Log</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Log' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    const button = screen.getByRole('button', { name: 'Log' });
    expect(button).toHaveFocus();
    rerender(
      <Button busy busyLabel="Logging…" onClick={onClick}>
        Log
      </Button>,
    );
    const busy = screen.getByRole('button', { name: 'Logging…' });
    expect(busy).not.toBeDisabled();
    expect(busy).toHaveFocus();
    await userEvent.click(busy);
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('aria-disabled alone also ignores clicks, without busy semantics', async () => {
    const onClick = vi.fn();
    render(
      <Button aria-disabled onClick={onClick}>
        Log
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Log' });
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('has no axe violations in any state', async () => {
    const { container } = render(
      <div>
        <Button>One</Button>
        <Button variant="outline-porcelain">Two</Button>
        <Button disabled>Three</Button>
        <Button busy>Four</Button>
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('IconButton', () => {
  it('is named by its required label and 48x48', () => {
    render(
      <IconButton label="Settings">
        <GearIcon />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'Settings' });
    expect(button).toHaveClass('size-12', 'border-control');
    expect(button).not.toHaveAttribute('aria-current');
  });

  it('takes the porcelain edge when current, and the raised edge on raised enamel', () => {
    const { rerender } = render(
      <IconButton label="Settings" current>
        <GearIcon />
      </IconButton>,
    );
    expect(screen.getByRole('button')).toHaveClass('border-porcelain');
    expect(screen.getByRole('button')).toHaveAttribute('aria-current', 'page');
    rerender(
      <IconButton label="Settings" raised>
        <GearIcon />
      </IconButton>,
    );
    expect(screen.getByRole('button')).toHaveClass('border-control-raised');
  });

  it('renders a link when given an href', () => {
    render(
      <IconButton label="Settings" href="#/settings">
        <GearIcon />
      </IconButton>,
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '#/settings');
  });
});

describe('small pieces', () => {
  it('every icon is decorative (aria-hidden) and uses one stroke weight', () => {
    const { container } = render(
      <div>
        {Object.entries(ICONS).map(([name, Icon]) => (
          <Icon key={name} />
        ))}
      </div>,
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(Object.keys(ICONS).length);
    for (const svg of svgs) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('stroke-width', '2');
    }
  });

  it('GroupMarker pairs the swatch with the group name, other is dashed and neutral', () => {
    const { container, rerender } = render(<GroupMarker group="protein" />);
    expect(screen.getByText('Protein')).toBeInTheDocument();
    expect(container.querySelector('.bg-line-protein')).not.toBeNull();
    rerender(<GroupMarker group="other" />);
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(container.querySelector('.border-dashed')).not.toBeNull();
  });

  it('VersionTag speaks its meaning', () => {
    render(<VersionTag spoken="coming in version 2">v2</VersionTag>);
    expect(screen.getByText('coming in version 2')).toHaveClass('sr-only');
  });

  it('VisuallyHidden stays in the accessibility tree', () => {
    render(<VisuallyHidden>hello</VisuallyHidden>);
    expect(screen.getByText('hello')).toHaveClass('sr-only');
  });

  it('TextField labels its input and links the message', () => {
    render(<TextField label="Custom food name" message="Type a name first" />);
    const input = screen.getByLabelText('Custom food name');
    expect(input).toHaveAccessibleDescription('Type a name first');
  });

  it('Checkbox toggles and is a 48px row', async () => {
    const onChange = vi.fn();
    render(
      <Checkbox checked={false} onChange={onChange}>
        Rice
      </Checkbox>,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Rice' }));
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByText('Rice').closest('label')).toHaveClass('min-h-12');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <div>
        <Chip dot>Local</Chip>
        <IconButton label="Settings">
          <GearIcon />
        </IconButton>
        <TextField label="Name" />
        <Checkbox defaultChecked>Rice</Checkbox>
        <GroupMarker group="dairy" />
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
