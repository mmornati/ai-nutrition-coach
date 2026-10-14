import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it } from 'vitest';
import { DayGallerySection } from './DayGallerySection';

describe('DayGallerySection', () => {
  it('renders every state and resolves a plate on demand', async () => {
    render(<DayGallerySection />);
    expect(screen.getByText('Reading the plate…')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Greens would round out dinner/ }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resolve the plate' }));
    expect(screen.queryByText('Reading the plate…')).not.toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'Coach question' })).toHaveLength(2);
  });

  it('has no axe violations', async () => {
    const { container } = render(<DayGallerySection />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
