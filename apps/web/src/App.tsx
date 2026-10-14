import { lazy, Suspense } from 'react';
import { AppRoot, type AppRootProps } from './app/AppRoot';
import { useHash } from './app/router';

// The dev gallery is not part of a release. Both operands are replaced with constants at build
// time, so the whole conditional (the dynamic import, its chunk and the '#/gallery' route) is
// dropped unless the dev server or a `VITE_GALLERY=1` build (the e2e server) asks for it.
// tools/check_no_gallery_in_build.sh fails `pnpm verify` if any of it leaks into dist/.
const gallery =
  import.meta.env.DEV || import.meta.env.VITE_GALLERY === '1'
    ? {
        route: '#/gallery',
        Page: lazy(async () => ({ default: (await import('./components/gallery')).Gallery })),
      }
    : null;

/** The app: the dev gallery on `#/gallery` (dev only), otherwise the composition root. */
export function App(props: AppRootProps) {
  const hash = useHash();
  if (gallery && hash === gallery.route) {
    return (
      <Suspense fallback={null}>
        <gallery.Page />
      </Suspense>
    );
  }
  return <AppRoot {...props} />;
}
