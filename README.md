<p align="center"><img src="logo.svg" alt="Alve" width="92" height="92" /></p>
<h1 align="center">Alve Agent</h1>
<p align="center"><b>A self-improving AI agent whose every change is committed here and anchored on Solana.</b></p>
<p align="center">
  <a href="https://alveagent.io">Live app</a> ·
  <a href="https://github.com/Quoriss/Alve-Agent">GitHub</a> ·
  <a href="https://x.com/AlveAgent">X</a>
</p>
<p align="center">
  <img src="https://img.shields.io/github/stars/Quoriss/Alve-Agent?color=5B5BF5" alt="Stars">
  <img src="https://img.shields.io/github/license/Quoriss/Alve-Agent?color=5B5BF5" alt="License">
  <img src="https://img.shields.io/github/last-commit/Quoriss/Alve-Agent?color=5B5BF5" alt="Last commit">
  <img src="https://img.shields.io/badge/anchored%20on-Solana-9945FF?logo=solana&logoColor=white" alt="Anchored on Solana">
  <img src="https://img.shields.io/badge/brain-public%20%26%20editable-5B5BF5" alt="Public brain">
  <img src="https://img.shields.io/badge/powered%20by-Claude%20Opus-D97757" alt="Powered by Claude Opus">
</p>

---

## What is this?

**Alve** is an AI chat agent that **improves itself**. This repository is its **living brain** — the personality, principles, skills, and tools that decide how it thinks and answers.

The agent edits these files on its own. Every accepted improvement is an **automatic commit**, and that commit's hash is written onto the **Solana** blockchain. Anyone can verify the exact version of the brain that's running — no silent updates, no hidden prompt swaps. The whole evolution is public and verifiable.

## How it works

### 1 · Character — decided by votes

- A **champion** brain is challenged by a **challenger** with one small, targeted tweak to its tone or rules.
- Token holders vote **blind** on A/B answer pairs — *which answer is better?*
- If the challenger wins with quorum, it's **promoted** to champion and `personality.md` / `principles.md` are updated and committed here.

### 2 · Tools — built on demand

- Users propose tools the agent is missing and **fund the ones they want most** with ALVE.
- Each round the agent builds the **most-wanted** request: it writes the code, runs it in an isolated **sandbox** with auto-generated tests, and ships it only if every test passes.
- If it ships, the winning request's tokens are **burned**. If the agent can't build it, the pledged ALVE is **refunded to its backers** — nothing is lost on a failed build.
- Every other request's funding **carries over** to the next round. New tools land in `tools/`.

### 3 · Verifiable on Solana

- Every commit — a character update or a new tool — is hashed and the hash is anchored on-chain via a Solana **memo transaction**.
- The app shows the commit hash and the on-chain signature side by side. Click through and confirm the running version matches this repo.

## Token

**ALVE** gates participation — hold it to vote on answers and to fund tool requests. It's never spent on voting (just a balance check at the moment you vote), and the winning tool-request's funds are burned each round.

- **Contract (CA):** `6LmJojcsKRfYB3wdBFSMR6uhDSNsLQU3HD69sJ1Vpump`

> Alve has one official token. The only contract address is the one published in this repo and on [x.com/AlveAgent](https://x.com/AlveAgent). Ignore any other.

## What's inside

```text
personality.md     the agent's voice and answering style
principles.md      hard rules and safety constraints
skills/            how-to notes the agent follows
tools/             generated, sandbox-verified tools
  INDEX.md         catalogue of live tools
JOURNAL.md         human-readable evolution log
VERSION            current version label
```

## Verify it yourself

1. Open the **Evolution** timeline in the app and pick any version.
2. Copy its commit hash and Solana signature.
3. Check the commit here on GitHub, then open the signature in a Solana explorer — the memo reads `alve:<commit>:<repo>@<short-hash>`.

If they match, you're looking at exactly the brain that's serving answers.

---

<p align="center">Built to evolve in the open · <a href="https://alveagent.io">alveagent.io</a> · CA <code>6LmJ...Vpump</code></p>
