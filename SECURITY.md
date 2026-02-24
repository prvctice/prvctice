# Security Policy

This is a personal project without active maintenance commitments.

## Reporting a Vulnerability

If you find a security issue, you can open a GitHub issue. I'll look when I can, but no guarantees on response time.

## Security Model

### Architecture

Prvctice is designed as a **personal productivity tool**. The security model assumes:

- **Single-user deployment**: One user per instance
- **Local-first storage**: Data stays on your device (IndexedDB/OPFS)
- **User-provided API keys**: You bring your own keys for AI providers
- **No authentication layer**: The app trusts whoever can access it

### API Keys

- API keys are stored in your browser's session storage
- Keys are sent only to their respective provider endpoints (OpenAI, Anthropic, etc.)
- Keys are never logged or transmitted to Prvctice servers
- For self-hosted deployments, keys can also be set via environment variables

### Desktop App (Electron)

- Context isolation is enabled
- Node integration is disabled in renderer
- Preload scripts use contextBridge for safe IPC
- Auto-updates are signed and verified (SHA512)

### Web App

- Helmet.js security headers enabled
- Rate limiting on API endpoints
- CORS configured for same-origin by default
- CSP policy in place (note: uses `unsafe-inline` for compatibility; nonce-based CSP planned for future)

## Known Advisories

### Build Tooling (Does NOT affect shipped application)

The build process uses Electron Forge, which has a transitive dependency on `tar` with a known path traversal vulnerability ([GHSA-8qq5-rm4j-mr97](https://github.com/advisories/GHSA-8qq5-rm4j-mr97)).

**Impact**: Build-time only. Does not affect the runtime application or end users.

**Mitigation**:

- Build in trusted environments
- Use npm's integrity checking (enabled by default)
- This is an upstream Electron ecosystem issue with no current fix

**Status**: Accepted risk, documented. Tracking upstream for resolution.

## Best Practices for Self-Hosting

1. **Run behind authentication** if exposing to a network (nginx basic auth, Cloudflare Access, etc.)
2. **Use HTTPS** in production
3. **Keep dependencies updated**: `npm audit` regularly
4. **Protect your API keys**: Use environment variables, not hardcoded values
5. **Backup your data**: Export notes periodically

## Scope

The following are **out of scope** for security reports:

- Vulnerabilities in third-party AI providers (report to them directly)
- Issues requiring physical access to the machine
- Social engineering attacks
- Denial of service against self-hosted instances
- Issues in dependencies with no available fix (like the tar advisory above)

## Acknowledgments

We appreciate security researchers who help keep Prvctice safe. Contributors who report valid vulnerabilities will be acknowledged here (with permission).

---

_Last verified: 2026-02-08_
