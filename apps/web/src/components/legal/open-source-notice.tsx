// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import notice from "virtual:open-source-notice";

/** The repository's NOTICE file, word for word. Loaded only when the dialog opens. */
export default function OpenSourceNotice() {
  return (
    <pre className="max-h-[50vh] overflow-auto border border-border bg-card p-3 text-caption whitespace-pre-wrap text-muted-foreground">
      {notice}
    </pre>
  );
}
