// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { Trans } from "@lingui/react/macro";
import { BRAND } from "@rakazo/contracts/brand";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Spinner,
} from "@rakazo/ui-web";
import { Scale } from "lucide-react";
import { lazy, Suspense } from "react";

const OpenSourceNotice = lazy(() => import("./open-source-notice"));
const LICENSE_URL = "https://www.apache.org/licenses/LICENSE-2.0";

/**
 * Credits the open-source project a white-label is built from, with its license and the
 * repository's NOTICE file. The names are passed as values, never written into the sentence,
 * so the brand hook cannot rename the project being credited.
 */
export function OpenSourceLicenses() {
  const brand = BRAND.name;
  const project = BRAND.source.name;
  const license = BRAND.source.license;
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="lg" className="w-full justify-start gap-2.5 font-normal" />
        }
      >
        <Scale className="text-muted-foreground" strokeWidth={1.75} />
        <Trans>Open-source licenses</Trans>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Open-source licenses</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              {brand} is built on {project}, open-source software by the {project} contributors,
              used under the {license} license.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <p className="flex gap-4 text-body-sm">
          <a className="underline" href={BRAND.source.url} target="_blank" rel="noreferrer">
            <Trans>Source code</Trans>
          </a>
          <a className="underline" href={LICENSE_URL} target="_blank" rel="noreferrer">
            <Trans>License text</Trans>
          </a>
        </p>
        <Suspense fallback={<Spinner />}>
          <OpenSourceNotice />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}
