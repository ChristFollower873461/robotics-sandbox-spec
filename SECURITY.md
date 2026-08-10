# Security Policy

Robot Field Guide is a public, read-only browser workbench. Report suspected
security issues through
[GitHub private vulnerability reporting](https://github.com/ChristFollower873461/robotics-sandbox-spec/security/advisories/new),
not a public issue.

## Visit-Safety Invariants

- Production HTTP redirects to `https://robotics.basementboys.org`.
- Public responses set CSP, HSTS, frame, content-type, referrer, opener, and
  permissions protections.
- Photos and floor plans are read locally and are never uploaded by the public
  application. They are omitted from JSON and HTML exports.
- The production Worker serves static assets only. It has no account, payment,
  upload, telemetry, or public mutation endpoint.
- Catalog network reads are HTTPS, GET-only, size-bounded, and disabled in the
  production UI until an explicitly authorized same-origin adapter exists.
- External product media and documentation must use HTTPS. The site sends no
  referrer when a browser loads or opens those resources.
- Browser imports and exports remain size-bounded and must not execute imported
  content as HTML or code.
- Deployment credentials and private facility data do not belong in Git.
