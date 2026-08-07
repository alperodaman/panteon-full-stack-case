# Project Overview — Weekly Leaderboard System

*A plain-language guide to what this project does and how it works. No coding background required.*

---

## The Problem

One of Panteon's mobile games has over 10 million registered players, with around 2 million playing every day. Players earn in-game currency as they play, and every week the leaderboard resets — whoever earns the most that week wins.

The old leaderboard had three complaints from players:
- It took forever to load.
- Players could see the top of the list, but not where *they* personally ranked.
- Scrolling down to find a friend would freeze the page.

This project is a full rebuild of that system, designed to fix all three problems.

---

## What This System Does

**1. Every time a player earns money, their rank updates instantly.**
There's no waiting, no page refresh needed. The leaderboard is "live" — if you check it while playing, you see your position change in real time.

**2. Every player can always find themselves.**
- If you're in the Top 100, you see yourself right there in the main list.
- If you're *not* in the Top 100 (most players won't be, out of 2 million), the system still shows you your own rank, plus the players just above and below you — so you always have context on where you stand and who's close to catching up or being caught.

**3. Prizes are handled automatically, every week.**
A small share of everything earned during the week is set aside as a prize pool. When the week ends:
- The system locks in the final standings.
- It automatically calculates who gets what (bigger rewards near the top, smaller amounts spreading down through rank 100).
- It records everything for auditing.
- It resets the board so a new week starts fresh — with zero manual work needed from anyone at Panteon.

---

## How Data Flows, Step by Step

```
Player earns money in-game
        │
        ▼
Rank updates instantly (this is what makes the leaderboard feel "live")
        │
        ▼
Player opens the leaderboard screen → sees Top 100 + their own position, immediately
        │
        ▼
   ... week continues ...
        │
        ▼
Week ends → standings are locked in automatically
        │
        ▼
Prize money is calculated and distributed automatically
        │
        ▼
Results are saved for history/records
        │
        ▼
Board resets → new week begins
```

The key design goal behind all of this: **speed and reliability at scale.** With millions of players potentially checking the board at once, the system is built so that no single server becomes a bottleneck — any server instance can handle any request, which means Panteon can add more servers under heavy load without redesigning anything.

---

## Why This Matters for the Business

- **Player retention:** A leaderboard that's slow or where you can't find yourself is frustrating and drives players away from a competitive feature that's meant to keep them engaged.
- **Zero manual ops:** Prize distribution used to be (or could easily be) a manual, error-prone weekly task. Here it's fully automated and self-verifying — nobody has to remember to run it or double check the math.
- **Built to scale:** The system is designed for the game's actual size (millions of players), not just for a small demo, while still working well in a demo/review setting.

---

## Trying It Out

The project includes sample data and a simple "simulate earnings" tool built into the interface, so anyone reviewing this project can watch the leaderboard update live without needing to know how to write code or use developer tools.

---

## Where to Look Next

- **`README.md`** — setup instructions and technical stack details
- **`AI_WORKFLOW.md`** — how AI tools were used during development, and which decisions were made by the developer vs. suggested by AI
