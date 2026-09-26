#!/usr/bin/env python3
"""Work around a bug in the uploader bundle shipped with django-ddm 3.0.0b4.

The bug (frontend/DDMUploader/src/composables/useFileProcessor/extractionEngine.ts):

    export function discardRow(...): null {
      blueprintOutcomeMap[blueprintId].incrementExtractionRuleCount(rule);
      return;            // <- returns undefined, although the callers test `=== null`
    }

Its callers in contentParsers.ts decide with `pushed !== null` whether a row was kept.
Because a discarded row yields `undefined`, a display-group id is still recorded for it.
From then on `rowGroupIds` is longer than `extractedData`, so with
"Group entries by parent item" switched on, messages are shown under the wrong
conversation, and "Remove this element from my donation" removes the wrong rows.
It shows up as soon as an extraction rule deletes a row inside a nested loop - which our
ChatGPT blueprint does on purpose (hidden/system nodes).

The fix makes discardRow return null, as its signature says. Nothing inside
site-packages is modified: a patched COPY of the bundle is written to
site/static_extra/, which settings.py lists in STATICFILES_DIRS, so it takes
precedence over the packaged file. The script refuses to run if the bundle does not
contain exactly the expected code, e.g. after an upgrade - then re-check whether the
bug still exists and delete site/static_extra/ if it does not.
"""
import sys
from pathlib import Path

import ddm.core

BUGGY = "function Jn(e,t,n){n[t].incrementExtractionRuleCount(e)}"
FIXED = "function Jn(e,t,n){return n[t].incrementExtractionRuleCount(e),null}"
REL = Path("ddm_core/frontend/uploader/js/ddm_uploader_frontend.js")

source = Path(ddm.core.__file__).resolve().parent / "static" / REL
target = Path(__file__).resolve().parent.parent / "site" / "static_extra" / REL

code = source.read_text(encoding="utf-8")
if code.count(BUGGY) != 1:
    sys.exit(f"REFUSING TO PATCH: expected exactly one occurrence of the buggy discardRow in {source}; "
             f"found {code.count(BUGGY)}. The installed django-ddm is not 3.0.0b4 or was already changed.")
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(code.replace(BUGGY, FIXED), encoding="utf-8")
print(f"patched copy written to {target}")
