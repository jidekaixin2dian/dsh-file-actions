# Security

File operations use the host's existing Session and WorkspaceFiles remotes. The
plugin adds no command execution endpoint or filesystem permissions. File reads
can include paths outside a workspace when the host's composed filesystem permits
them; the workspace label is not a containment guarantee. Copying the contents of
a file outside the session workspace requires an explicit confirmation, because
chat text can plant absolute paths; a declined or unavailable confirmation reads
no bytes. The same gates apply to copying referenced lines: the file must fit the
2 MiB text-copy cap, and invalid or out-of-file line ranges never fall back to
copying the full file. Invalid UTF-8 is rejected rather than silently replaced. Chunked exports
check file identity, version, offsets and reported size, stopping on changes;
this detects inconsistent responses but does not create an atomic Host snapshot.

Browser previews run in a sandboxed iframe with an opaque origin. HTML/SVG start
as static previews: scripts, forms, automatic refresh and external resource loads
are blocked. An explicit button enables scripts and network access for that
preview only. Trusted file scripts can transmit their own content and contact
external services, while the sandbox still isolates DSH DOM, cookies and opener.
User-clicked hyperlinks are explicit navigations, not blocked resource loads.
Relative resources beside a file are not served by a Blob URL. Opening the same
file externally delegates trust to the chosen app.

Versions through 0.1.5 opened active HTML/SVG directly at the DSH Blob origin.
Preview isolation is included in release 0.1.7 and later. Historical release
assets have not been replaced.

Preferred applications are stored locally in the browser, by extension. Only
application IDs are saved; a preference must match a currently returned Host
association before it can be used. Preferences neither execute commands nor
change OS file associations.

Association results also cache application IDs, display names, default flags and
optional icons locally, up to 24 hours for storage reuse. Persisted answers are
revalidated in the background; explicit opens wait for that validation. Failed
opens invalidate the cache without replaying the action. File contents are not
stored in localStorage. Thumbnail Blob/data URLs remain in memory, under a
16 MiB byte budget and a 12-entry cap, and are revoked on disposal.

Automated host tests serve only synthetic files on loopback. Optional full-Web
drivers require a separate `DFA_HOME`; they do not copy personal profiles, and
stop only a recorded launcher with matching creation time and command line.
Launch URLs and files under `test-e2e/run/` are private, ignored test state.

Report vulnerabilities privately through GitHub where available. Do not include
real file contents, cookies, API keys or authenticated launch URLs in an issue.
