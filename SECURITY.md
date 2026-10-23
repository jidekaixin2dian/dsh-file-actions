# Security

File operations use the host's existing Session and WorkspaceFiles remotes. The
plugin adds no command execution endpoint or filesystem permissions. File reads
can include paths outside a workspace when the host's composed filesystem permits
them; the workspace label is not a containment guarantee.

Browser previews run in a sandboxed iframe with an opaque origin. Scripts and
forms can run, but file content cannot access the enclosing DSH document, its
cookies, or its opener. Relative resources beside a file are not served by a
Blob URL. Opening the same file externally delegates trust to the chosen app.

Versions through 0.1.5 opened active HTML/SVG directly at the DSH Blob origin.
Preview isolation is included in release 0.1.7 and later. Historical release
assets have not been replaced.

Preferred applications are stored locally in the browser, by extension. Only
application IDs are saved; a preference must match a currently returned Host
association before it can be used. Preferences neither execute commands nor
change OS file associations.

Automated host tests serve only synthetic files on loopback. Optional full-Web
drivers require a separate `DFA_HOME`; they do not copy personal profiles, and
stop only a recorded launcher with matching creation time and command line.
Launch URLs and files under `test-e2e/run/` are private, ignored test state.

Report vulnerabilities privately through GitHub where available. Do not include
real file contents, cookies, API keys or authenticated launch URLs in an issue.
