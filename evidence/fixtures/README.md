# Evidence fixtures

Pages that the live end-to-end run (`e2e/`) uses as evidence for its vows. The validators of the network fetch
them over the internet, so the run reads them from this repository on GitHub (`raw.githubusercontent.com`) and
pins one of them at the commit that is checked out (`github.com/<owner>/<repo>/blob/<sha>/...`, a permalink).

| file | what it shows | used by |
|---|---|---|
| `kept.md` | the 2.0.0 entry was published on 2026-01-15 | the `kept` scenario (expected verdict: kept) |
| `broken.md` | the 2.0.0 entry is only planned | the `broken` scenario (expected verdict: broken) |
| `counter.md` | a reader note that the entry does not exist | counter-evidence from the doubter in `broken` |

These files must be pushed to GitHub before a live run: the run checks that every address answers with the
expected text and stops early if it does not. Change the wording and the expected verdicts may change with it, and
the offline self-check (`npm run check` in `e2e/`) relies on the sentences "was published on 2026-01-15" and
"has not been written".
