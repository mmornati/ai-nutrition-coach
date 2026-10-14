import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the Today heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
  });

  it('serves the dev gallery on #/gallery while developing', async () => {
    window.location.hash = '#/gallery';
    try {
      render(<App />);
      expect(await screen.findByRole('heading', { level: 1, name: 'Gallery' })).toBeInTheDocument();
    } finally {
      window.location.hash = '';
    }
  });

  it('has no axe violations', async () => {
    const { container } = render(<App />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
