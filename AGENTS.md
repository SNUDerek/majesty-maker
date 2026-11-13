# AGENTS.md

## Rules

### code style

- prefer to make minimal changes; do not add features beyond current target.
- minimize blast radius for any features or fixes. prefer decoupled code.
- we do planning, implementation, review, and refactoring separately; do not refactor existing code when implementing new feature unless required.

### git conventions

- we use trunk-based development. 'main' is the trunk branch. name branches like feature/xxx, fix/xxx.
- always work in a git worktree located in .worktrees. name the tree same as feeature branch name (replace / with -).
- always create tests for new features or fixes.

### planning

- when planning a new feature, create a new feature branch (in new worktree)
- generate planning docs as markdown files in ./docs directory. commit them when finished.

### implementing features and fixes

- when working on a large feature, commit subtasks regularly. use Conventional Commits style for commits.
- when done with feature or fix implementation, create a PR on github. do not merge branch or delete worktree.
- when creating a PR, include a comprehensive but concise description of changes.
- 'sign' each PR with your provider and/or model name at the bottom. 

### code review

- when reviewing a PR, make any required changes yourself and commit them. add a comment to the PR.
- after testing revisions, merge the branch yourself, close PR, and delete branch and worktree.
- ensure README.md is updated, and archive any finished plannings docs to ./docs/archive.

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