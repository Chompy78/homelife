# D-2026-07-18-poller-token-out-of-source

Date: 2026-07-18
Status: Done

**Context:** `poller.py`'s `WORKER_TOKEN` was hardcoded as a plain
string literal. The user's next planned step was to push `poller.py`
to a (private) GitHub repo - doing that with the token still hardcoded
would put a real secret into git history permanently. Private
visibility doesn't protect against this risk (account compromise,
accidental collaborator access, a visibility toggle mistake), and
rewriting git history after a push is unreliable. The token had, at
the point this was caught, never been committed or pushed anywhere -
so there was nothing to clean up yet, only something to prevent.

**Options:**
1. Read the token from an environment variable, set wherever the
   script actually runs (cron/systemd/shell), never in the source file.
2. Read it from a separate config file that's git-ignored from the
   start.
3. Leave it hardcoded and just remember not to `git add` that one line
   (rejected outright - relies on manual discipline every future edit,
   exactly the kind of thing that eventually slips).

**Decision:** Option 1.

**Why:** No new file to manage or accidentally forget to `.gitignore`
- `poller.py` already runs exclusively via a cron job on the user's
  own machine, so an environment variable set in the crontab itself
  (a `NAME=value` line above the job entry - never a file that gets
  committed anywhere) is the natural fit. Fails closed (`sys.exit` with
  a clear message) if the variable isn't set, rather than silently
  running with an empty token and getting confusing `unauthorized`
  errors back from the edge function.

**Status:** Done. `poller.py` now does
`WORKER_TOKEN = os.environ.get("HOMELIFE_WORKER_TOKEN")` with a
fail-closed check right after. The actual secret value now lives only
in the user's crontab. Hit and resolved an unrelated crontab
gotcha along the way: an interactive `crontab -e` edit failed with
"bad minute" (cron mis-parsed the new env-var line as a schedule
line, root cause not fully pinned down - suspected an invisible
character from copy-paste). Worked around it with the more reliable
dump/edit/reinstall pattern (`crontab -l > file`, edit the plain file,
`crontab file`) instead of the interactive editor. Verified live via
the poller's own log output - clean polling plus a real
fingerprint-regeneration request processed successfully after the
crontab update took effect. `poller.py` is now safe to push to that
private repo whenever the user gets to it.
