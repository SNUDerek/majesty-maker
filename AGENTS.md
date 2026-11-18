# AGENTS.md

## Rules

### code style

- prefer to make minimal changes; do not add features beyond current target.
- minimize blast radius for any features or fixes. prefer decoupled code.
- we do planning, implementation, review, and refactoring separately; do not refactor existing code when implementing new feature unless required.

### git conventions

- we use trunk-based development. 'main' is the trunk branch. name branches like feature/xxx, fix/xxx.
- always work in a git worktree located in .worktrees. name the tree same as feature branch name (replace / with -).
- always create tests for new features or fixes.

### planning

- follow these instructions when tasked specifically with planning a new feature.
- when planning, work directly in `main` branch.
- generate planning docs as markdown files in ./docs directory. commit them when finished and push changes.
- do not edit any code while planning.

### orchestration

- follow these instructions ONLY when explicitly told you are the orchestrator. agents spawned by an orchestrator must never spawn other agents.
- roles:
  | role      | command |
  |-----------|---------|
  | implement | `claude -p --permission-mode auto --model opus --effort medium "<prompt>"` |
  | review    | `codex exec -c model="gpt-6.2-sol" -c model_reasoning_effort="medium" -c hide_agent_reasoning=true --approve-for-me --trust --ephemeral "<prompt>"` |
- read the given plan in ./docs and derive tasks + dependencies. start a task only when all its dependencies are merged into main.
- launch each job detached in its own tmux window named after the worktree, logging to .worktrees/.logs/<name>.log.
- worker prompts are pointers only, e.g. `You are the implementer for task T3 in docs/plan-x.md. Follow AGENTS.md.`
- github is the source of truth: open PR = implemented, merged PR = reviewed. always re-derive status with `gh pr list --state all`; never rely on memory.
- when an implementation PR appears, launch a review job for it. allow only one merge at a time; reviewers rebase on main and re-run tests before merging.
- poll every few minutes using sleeps shorter than your shell tool's timeout. if a job's window has exited with no PR, read its log, relaunch once, then stop and report to the user.
- when all assigned tasks are merged, report with summary. do not edit docs or code as orchestrator.

### implementing features and fixes

- when working on a large feature, commit subtasks regularly. use Conventional Commits style for commits.
- when done with feature or fix implementation, create a PR on github. do not merge branch or delete worktree.
- when creating a PR, include a comprehensive but concise description of changes.
- 'sign' each PR with your provider and/or model name at the bottom. 

### code review

- when reviewing a PR, make any required changes yourself and commit them. add a comment to the PR.
- after testing revisions, ensure README.md is updated, and archive any finished plannings docs to ./docs/archive.
- when done, rebase on main, re-run tests, merge the branch yourself, close PR, and delete branch and worktree.

## Project

This is a Princess Maker type "raising up simulation", similar to modern games like Gust's Atelier games and the Persona games. 
The main focus is a time-management sim, where the player must schedule activities to help grow their characters in order to overcome the final obstacle 
at the end of the allotted time. The in-game conceit is that the player is raising their adoptive daughter to become the princess (hence, Princess Maker).

Time is split into months and weeks. Each week, the player can assign the daughter to one activity: doing a job to earn currency, 
studying to increase stats, socializing with friends to build relationships, resting to reduce fatigue, or adventuring, 
which sees the daughter (and her companions, usually) participate in some RPG type gameplay in order to further the story 
and make progress towards overcoming the final encounter.

This is a POC meant to implement this basic game loop, including a simplified adventuring mechanic. 
it is meant to be more closely medieval-themed than the Princess Maker games

### Documentation

* `./docs/thematic-design-doc.md` describes the concept and thematic elements, with some high level gameplay descriptions.
* `./docs/technical-planning-doc.md` contains technical details for the game logic and the initial backend plan.
* `./docs/implementation-tasks.md` describes current tasks.

do not archive these documents unless instructed (e.g. archiving completed tasks to make new document of next phase tasks)
