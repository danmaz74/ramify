# Show source outside every module in the explorer

`ramify check` warns about compiler-selected files that lie outside every
module's `src/`. The project explorer in the browser says nothing about them,
so someone who only opens the explorer believes the module tree covers the
whole project. The check already knows these files; the explorer should show
them.

## Request

- The explorer's home page shows how many files lie outside every module, and
  nothing when there are none.
- The module tree page lists those files, grouped by the nearest module
  directory that contains them, with the reason each one is outside: a sibling
  `tests/` or `interfaces/` directory, loose source under `subs/`, or a file
  beside `src/`.
- Selecting a group in the list highlights that module in the tree.
- The list follows the project: when a file is moved into a module's `src/`
  while the explorer is open, it leaves the list without a reload.

## Constraints

- The explorer performs no analysis and reads no project files. It shows what
  the resident analysis has already published for the revision on screen.
- The list belongs to a revision, like everything else in the explorer. It
  never mixes files from two revisions.
- These files remain warnings. Nothing in the explorer presents them as
  errors or as modules.
- The list is bounded: past 200 files it shows the first 200 and the total.

## Acceptance

- In a project with a sibling `tests/` directory and a loose file under
  `subs/`, the home page shows the count and the tree page shows both files
  under their nearest modules with the right reasons.
- Moving one of them into `src/` removes it from the open page.
- A project with no such files shows no count and no empty list.
- `ramify check` output is unchanged.
