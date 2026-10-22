# Changelog

## Unreleased

- Isolate active HTML/SVG browser previews from the DSH origin while retaining
  script execution inside a sandboxed frame; clear the popup opener.
- Keep POSIX roots and resource Session identity, prefer a resource address over
  a child tooltip, and use case-sensitive POSIX path comparisons.
- Cancel stale menu opens after another click or unload; revoke thumbnail URLs
  on unload, key cached thumbnails by Session/path/version and reject partial data.
- Add reproducible real-host/browser CI and archive installation checks. Replace
  personal paths, direct profile mutation and port-owner termination in optional
  full-Web tooling with the official CLI and owned-process validation.

## 0.1.5

Historical release: resource links, decorated filenames, subtitle and media
classification. The published tarball does not include the unreleased fixes.
