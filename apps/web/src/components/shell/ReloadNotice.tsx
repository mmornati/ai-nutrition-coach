import { signInAgain } from '../../net/sign-in';
import { Button } from '../primitives';

/**
 * The calm line shown where something this server offers (its AI, its backup) is out of reach
 * because the sign-in in front of it asks for a fresh session, with the one action that fixes it:
 * open the page again through the network (the service worker would answer a plain reload itself), and the proxy asks the person to sign in. No login flow lives here.
 */
export function ReloadNotice({ text, action }: { readonly text: string; readonly action: string }) {
  return (
    <div className="flex flex-col gap-3" data-sign-in-required="">
      <p role="status" className="text-body text-ink">
        {text}
      </p>
      <div>
        <Button variant="secondary" onClick={() => signInAgain()}>
          {action}
        </Button>
      </div>
    </div>
  );
}
