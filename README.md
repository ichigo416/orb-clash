# Orb Clash

A real-time multiplayer arena game (agar.io-style): move toward your cursor, eat orbs to
grow, absorb smaller players, avoid bigger ones. Built as a portfolio piece to demonstrate
authoritative multiplayer game server design, not just frontend polish.

## Stack

- **Server**: Node.js, Express, Socket.io, TypeScript
- **Client**: Phaser 3, TypeScript, Vite, socket.io-client

## Architecture — the part worth talking about in an interview

**The server is the only source of truth.** Clients never send their position — only a
"target point" representing where the mouse is pointing. The server (`GameRoom.ts`) owns
every player and orb, runs a fixed-rate tick loop (`TICK_RATE_HZ = 20`), and is the only
code that ever mutates position, size, or score. This closes the most common exploit in
naive multiplayer implementations: a modified client simply cannot teleport, speed-hack, or
fake a bigger radius, because the server recomputes everything itself every tick.

**Decoupled simulation and render rates.** The server ticks at 20Hz and broadcasts a
snapshot each time. The client renders at whatever frame rate the browser gives it (usually
60fps) and smooths entity positions toward the latest server snapshot using exponential
interpolation (`GameScene.ts`, `SMOOTHING_RATE`) rather than snapping directly to each
snapshot, which would look jittery. This is a simplified stand-in for the "buffered
snapshot interpolation" technique used in most production netcode (Valve's source engine
docs are the canonical reference) — a natural next step to mention if asked how you'd
improve it.

**Collision detection is currently O(n²)** over all player/orb pairs each tick
(`handleOrbConsumption`, `handlePlayerCollisions`). That's fine at the scale of a few dozen
concurrent entities but is the first thing to fix for scale — bucket entities into a
spatial grid or quadtree so a player only checks collisions against nearby cells instead of
every other entity.

**Other deliberate choices:**
- Growth is area-based, not radius-based, so early orbs matter proportionally more than
  late ones (mirrors real balancing in games like this).
- Player speed decreases slightly as they grow, so being huge is strong but not simply
  dominant.
- Elimination triggers a short respawn delay + a `elimination` broadcast event so all
  clients can show a toast/notification, not just the two players involved.

## Running locally

Requires Node 18+.

```bash
# terminal 1 — server
cd server
npm install
npm run dev        # starts on http://localhost:3001

# terminal 2 — client
cd client
npm install
npm run dev         # starts on http://localhost:5173
```

Open `http://localhost:5173` in multiple browser tabs/windows to see multiplayer in action
locally — each tab is an independent connected player.

## Deploying

- **Server**: Render, Railway, or Fly.io all work well for a persistent Socket.io process
  (this needs a long-running server, not a serverless function). Set `CLIENT_ORIGIN` to
  your deployed client's URL so CORS is locked down properly instead of the `*` dev
  default.
- **Client**: Vercel or Netlify. Set the `VITE_SERVER_URL` environment variable to your
  deployed server's URL before building (`client/src/network/SocketClient.ts` reads it).

## Project structure

```
server/
  src/
    server.ts          # Express + Socket.io setup, socket event handlers
    types.ts            # Wire protocol shared with the client
    game/
      GameRoom.ts       # Authoritative tick loop, collisions, orb spawning
      Player.ts         # Player entity: movement, growth
      Orb.ts            # Orb entity

client/
  src/
    main.ts             # Menu overlay wiring + Phaser bootstrap
    types.ts             # Wire protocol (mirrors server/src/types.ts)
    network/
      SocketClient.ts   # Thin typed wrapper around socket.io-client
    scenes/
      GameScene.ts      # Rendering, camera, input, interpolation, leaderboard
```

## Possible extensions (good "what would you add next" answers)

- Spatial partitioning (grid/quadtree) for collision checks at higher player counts
- Server-side rate limiting / sanity checks on input frequency to harden against abuse
- Persistent leaderboard (MongoDB) across sessions, not just the live in-room one
- Multiple rooms/lobbies instead of one global arena
- Reconnection handling that restores a player's in-progress state instead of respawning
