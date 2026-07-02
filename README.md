somewhat of a mess

<details>
  <summary>todos</summary>
  
  - input validation
    - is there a way to make this bearable with socket.io or do we find an alternative that has built-in standard schema integration
    - and things beyond (no boss class selection in e.g. ffa)
  - room stuff
    - clearer side effects
    - way to cleanly open and close custom rooms
  - finish moving all ui logic to svelte components, remove jsx-dom
    - the largest part remaining is the game over menu
  - simplify `setupSocket` logic (can we keep the same `io` instance and the same event handlers when reconnecting/switching rooms?)
  - set up database for accounts, clans (probably lower priority)

  - gameplay:

    - player mechanics:
      - should not show up on in-game leaderboard until they have first spawned into current round
      
    - bullets:
      - the bullets seem to overshoot for a frame before dissappearing (when shooting the corner of a wall, sometimes when shooting clutter) {expected behavior is for them to disappear same frame upon hitting the wall}
      - if switch weapons too quickly, it looks like the gun fires twice (?)

    - notifs/events:
      - hardpoint score updates should probably occur on the server, independent of client socket emits

    - misc:
      - different characters should have different jump strengths
      - fix head clipping through wall when jumping against bottom of wall (though this happened in original too)
      - room player limit of 8 should be enforced
      - make it harder for player to accidentally click out of a game right after dying by clicking on a room in the room browser (maybe have a dedicated "join" button?)
      - players should not be rendered inside walls of new map after game countdown finishes and new round starts
      - (check) should there be bullet holes in non-explosive barrels? need to render them after game objects in that case
        - the walk dust particles in same layer currently should stay behind barrels though

</details>

## How to install and play locally

### Windows

- Go to https://nodejs.org/en/download and follow the install instructions for windows for v25 of nodejs, not the LTS one
- Go to https://pnpm.io/installation and follow the install instructions for windows
- Go to https://git-scm.com/install/windows and download the installer, or use winget to install git, open powershell and run `git clone https://github.com/KrunkerRevivalProject/vertix.git` **OR** download the repo as a zip and extract it somewhere.
- Open powershell in the vertix folder (the one you cloned or extracted), and run `pnpm i`, after that's done you won't need to run it again
- To start the server run `pnpm dev` then go to http://localhost:5173 in your browser.

### Linux

- If your package manager has v25 of nodejs, you can install everything from there, if not go to https://nodejs.org/en/download, https://pnpm.io/installation and follow the install instructions for linux.
- Install git from your package manager if you haven't already, run the following in your terminal

```
git clone https://github.com/KrunkerRevivalProject/vertix.git
cd vertix
pnpm i
```

- To start the server run `pnpm dev` then go to http://localhost:5173 in your browser.
