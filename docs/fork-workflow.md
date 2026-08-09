# Fork Workflow

This document defines the branching strategy and feature management conventions for this repository fork.

## Branch Roles

- **`main`**: Mirrors upstream `main` (`getpaseo/paseo`) 1:1. No custom feature code or un-upstreamed changes are committed directly to `main`. `main` is updated by fetching and fast-forwarding from upstream.
- **`custom`**: The primary development branch for our fork. All custom features, enhancements, and fork-specific capabilities land on `custom`.

## Upstream Synchronization

`custom` stays close to `main` by merging `main` into `custom` on a regular cadence:

```bash
git checkout main
git pull upstream main
git checkout custom
git merge main
```

Resolving merge conflicts promptly ensures minimal drift between upstream developments and our custom features.

## Feature Tracking & Implementation Rules

To keep track of custom capabilities and ensure long-term maintainability:

1. **Trackable Implementation Paths**: Every custom capability should be built in distinct, trackable commits or feature branches (`feature/<name>`) before merging to `custom`.
2. **Atomic & Descriptive Commits**: Use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`) with precise scope boundaries so changes on `custom` can be audited against `main` easily.
3. **Reversibility**: Structure custom features modularly so individual features can be cleanly reverted or isolated if upstream changes supersede them.
4. **Upstreaming Readiness**: Maintain a clean separation between core generic enhancements and repository-specific configs. This leaves the door open to opening pull requests to contribute custom features back to upstream `main`.
