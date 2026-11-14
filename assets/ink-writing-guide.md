# Writing Ink for Hidden Scion

A reference for writing dialog scenes and story beats in `content/story/*.ink`.

- **Part 1** covers the parts of the ink language we use.
- **Part 2** covers this game's own rules: speakers, tags, triggers and names.

You can write and preview `.ink` files in [Inky](https://github.com/inkle/inky), ink's free editor. The game compiles them itself when it builds and when the tests run, so there is no export step. A broken file stops the build and the tests, and the error names the file and line.

> Technical background is in `docs/dialog-and-story-beats-plan.md` §5–§7. The code that reads the tags is `src/ui/engine/story.ts`, and the code that plays the lines is `src/ui/engine/dialog.ts`.

---

## Part 1: Ink basics

### Text

Each line of text is one line of dialog. The player advances with the arrow button, Enter or Space.

```ink
The courtyard falls silent.
hedge_knight: Again. From the top.
```

Comments are ignored:

```ink
// a single-line comment
/* a multi-line
   comment */
```

To use a literal `#`, `{`, `}`, `|` or `\` in text, put a backslash in front of it: `\#`, `\{`.

### Knots: one scene each

A **knot** is a named section that starts with `===`. Here, each story beat is one knot.

```ink
=== knight_1 ===
hedge_knight: You hold that sword like a ladle.
-> END
```

- Knot names may use letters, digits and underscores (`knight_1`, `father_talk_3`).
- Always finish a scene with `-> END`.
- A knot can contain **stitches** (`= name`), which are sub-sections. Stitches are never beats themselves, but you can divert to them.

### Diverts

`->` jumps to another knot or stitch:

```ink
=== knight_2 ===
hedge_knight: Remember what I told you?
-> knight_lecture        // a helper knot (no # order tag, so it is not a beat)

=== knight_lecture ===
hedge_knight: Feet first. Then the blade.
-> END
```

### Choices

Choices appear as buttons in the text box, replacing the advance arrow.

```ink
squire: Want me to show her how it's done?
* [Accept the challenge]
    scion: Show me, then. If you can.
* [Ignore him]
    scion: (Better not to rise to it.)
- hedge_knight: Enough. Both of you, at the pell.
-> END
```

- `*` starts a choice. The text in `[brackets]` appears only on the button and is not repeated as a line afterwards.
  - Text outside the brackets is shown on the button and then repeated as a line: `* Yes[.], I will.`.
  - Here, prefer brackets-only.
- `-` is a **gather**: the branches meet up again there. **Every branch should rejoin with a gather** (see Part 2).
- Choices can nest (`**` and `--` for the second level), but keep branching shallow.
- `+` makes a "sticky" choice that can be picked again. Since there are no loops, there is no reason to use it.

### Variables and inline logic

Print a variable with braces:

```ink
hedge_knight: A steady hand, {scion}.
```

Pick between two pieces of text with a condition:

```ink
hedge_knight: {bellatores >= 40: You fight like a knight already.|You still fight like a farmhand.}
```

Conditional blocks also work:

```ink
{ oratores >= 30:
    hermit: You have been reading. Good.
- else:
    hermit: Have you opened the psalter at all?
}
```

**Avoid sequences, cycles and shuffles** (`{a|b|c}`, `{&a|b}`, `{~a|b}`), and conditions on visit counts (`{knight_1: ...}`). The game resets ink before every scene, so a sequence always shows its first item and visit counts are always 0. Use stat conditions instead.

### Tags

A tag is text after `#`. On a line of dialog it applies to that line, and a line may carry several tags:

```ink
squire: Shall we try a bout? # right: squire # bg: job
```

Tags placed directly under a knot's `===` line, before any text, are **knot tags**. They describe the whole scene. Tags at the very top of the file are **global tags**. Part 2 lists every tag the game reads.

---

## Part 2: Rules for this game

### File layout

One file per **thread** (a storyline); one knot per **beat**.

```ink
VAR scion = "Joan"
VAR player = "Gerald"
VAR bellatores = 15
VAR oratores = 15
VAR laboratores = 15
# cooldown: 2
-> END

=== knight_1 ===
# title: The Hedge Knight's Squire
# order: 10
# activity: hedge_knight village_watch
hedge_knight: You hold that sword like a ladle, {scion}.
...
-> END
```

- **The five `VAR` lines are required** in every file, exactly as above. The values are only for previewing in Inky; the game replaces them before each scene (see "Names" below).
- **The `-> END` before the first knot is required.** It stops the file's top section from running straight into the first scene.
- **No `INCLUDE`.** Each file must stand alone, and the build rejects `INCLUDE`.
- The file name (without `.ink`) is the **thread name**. A beat's id is `<file>/<knot>`, e.g. `knight/knight_1`. The save stores these ids, so **don't rename a knot or file once beats have shipped**, or old saves will think that beat hasn't played.

Current threads:

| File | Thread | Triggered by |
|---|---|---|
| `knight.ink` | Bellatores storyline | `hedge_knight`, `village_watch` |
| `cloister.ink` | Oratores storyline | `hermit`, `scriptorium` |
| `alley.ink` | Laboratores storyline | `smuggler`, `alehouse` |
| `stables.ink` | Stables | `stables` |
| `father.ink` | Father and daughter | `socialize` (the Social button) |

### Lines: speech, thoughts and narration

| You write | Shown as |
|---|---|
| `squire: You call that a guard?` | **Speech:** name plate "Squire", then the text |
| `scion: (He's not wrong.)` | **Thought:** name plate, italic text in parentheses |
| `The courtyard falls silent.` | **Narration:** italic text, no name plate |

- A line is speech only when it starts with a **known character id** (see the table below) followed by `:`.
- **A misspelled id is not an error. It shows as narration**, so `sqiure: Hello` appears as the literal text "sqiure: Hello". Check speaker ids carefully.
- A thought is speech whose text starts with `(` and ends with `)`. The parentheses are shown.
- A narration line that happens to start with a character id and a colon would be read as speech, so reword it if that happens.

### Portraits and backgrounds

- The **left** portrait is the main speaker. By default it is `scion`, or `father` in a Social talk.
- The **right** portrait is the other person, and is mirrored to face left. When someone who isn't on the left speaks, they appear on the right automatically. Use `# right:` to place someone before they speak, or to swap who is shown.
- Whoever isn't speaking is dimmed slightly.
- The **opening background** is where the activity happened (`school` for lessons, `job` for work, `home` for rest and Social), unless the knot sets `# bg:`.

Tags on a line inside a scene:

| Tag | Effect |
|---|---|
| `# bg: <background>` | Cross-fades to another background. |
| `# right: <character>` | Puts that character on the right. |
| `# left: <character>` | Changes the main speaker. This should be rare. |

### Knot tags (the beat's trigger and reward)

Write these directly under the `=== knot ===` line, one per line.

| Tag | Required | Meaning |
|---|---|---|
| `# order: 10` | **yes** | Marks the knot as a beat and sets its place in the thread (see below). Must be a whole number. |
| `# activity: hedge_knight village_watch` | **yes** | The activities that can trigger the beat, separated by spaces. Use `socialize` for the Social button. |
| `# title: The Grey Mare` | no | The name shown in the Chronicle ("A story: The Grey Mare"). Defaults to the knot name. |
| `# month: 5` | no (default 1) | The earliest campaign month, 1–24. Month 1 is the first 4 weeks. |
| `# stat: bellatores 30` | no, repeatable | A minimum stat. All `stat` tags must be met. |
| `# reward: coin 25` | no, repeatable | Coin granted when the scene ends. Treasury is capped at 9,999. |
| `# reward: item gambeson` | no, repeatable | An item granted when the scene ends. |
| `# bg: school` | no | The opening background. |
| `# left: scion` | no | The opening main speaker. |

**Global tag** (top of the file): `# cooldown: 3` is the minimum number of weeks between two beats of this thread. The default is 2.

Rewards are shown to the player as a last line ("Received: 25 Coin, Gambeson"). You don't write that line yourself.

### What `# order` does

1. **It marks a knot as a beat.** Knots without `# order` are helpers: you can divert to them, but they never trigger on their own and aren't listed in the Gallery.
2. **It sets the beat's place in its thread.** Within a file, beats are sorted by `order`, and only the **first unplayed beat** is ever considered. A later beat never plays before an earlier one, even if its conditions are met first.

- **Position in the file doesn't matter**, only the number.
- **Use gaps** (10, 20, 30…) so a beat can be added later at, say, 15 without renumbering.
- Orders only need to be **unique within one file**. Different threads may reuse the same numbers.

### When a beat plays

After a lesson, job or rest, a thread's next beat plays when **all** of these hold:

- the activity is in its `# activity:` list;
- the campaign month is at least `# month:`;
- every `# stat:` minimum is met. Stats are checked **after** the activity, so the lesson that crosses a threshold triggers the beat right away;
- at least `# cooldown:` weeks have passed since the thread's previous beat.

Further rules:

- **At most one beat plays per week**, across all threads. If two threads are ready at once, the file name that sorts first wins. Threads shouldn't share activities, so this should be rare.
- **No beat plays** after the forced recovery week, a week that ends in collapse, or the final deadline.
- The scene plays **before** the result popup. When it ends, the beat is saved and its reward granted.
- If the player **quits mid-scene**, the beat is not recorded and plays again after the next matching activity.
- **Social talks** (`socialize`) follow the same rules, but they are free: no week passes and no result popup appears. The Social button is greyed out until a talk is ready. While one is ready, the daughter's thought box reads "I have something on my mind...".

A thread that's been neglected for months catches up one beat at a time, with its cooldown between beats.

### Names: from ink to the game

| In ink | Means | Comes from |
|---|---|---|
| `{scion}` | the daughter's name | the save (chosen at New Game) |
| `{player}` | the player's first name | the save |
| `{bellatores}`, `{oratores}`, `{laboratores}` | her current stats | the save |
| speaker `scion` | name plate shows the daughter's name | the save, plus the portrait from `characters.ts` |
| speaker `father` | name plate shows the player's first name | the save, plus the portrait from `characters.ts` |
| any other speaker id | name plate and portrait | `src/ui/text/characters.ts` |
| `# bg:` value | background picture | `BACKGROUND` in `src/ui/assets.ts` |
| `# activity:` value | what triggers the beat | activity ids in the rules (`content/rules.default.json`) |
| `# reward: item` value | item name, icon and effect | `content/items.json` |

The ink only ever uses ids. To change a character's display name or portrait, edit `characters.ts`, not the ink. Several characters can share a placeholder portrait.

**Character ids** (`src/ui/text/characters.ts`; add new ones there):

| Id | Name plate |
|---|---|
| `scion` | the daughter's name |
| `father` | the player's first name |
| `hedge_knight` | Hedge Knight |
| `watch_captain` | Watch Captain |
| `squire` | Squire |
| `hermit` | Hermit |
| `brother_librarian` | Brother Librarian |
| `novice` | Heretic Novice |
| `smuggler` | Smuggler |
| `alewife` | Alewife |
| `urchin` | Urchin |
| `stablemaster` | Stablemaster |

**Backgrounds:** `home`, `school`, `job`, `pilgrimage`, `waystation`, `capital`, `title`

**Activities:**
- Tutors: `hedge_knight`, `hermit`, `smuggler`
- Jobs: `stables`, `alehouse`, `village_watch`, `scriptorium`
- Rests: `rest_home`, `bathhouse`, `shrine`, `banquet`
- Social button: `socialize`

**Items:** `theriac`, `st_johns_wort`, `metheglin` (consumables); `gambeson`, `saints_relic`, `weighted_coin` (equipment)

### What gets checked

The test run (`npm test`) reports, for every beat:

- a bad `order`, `month`, `stat`, `reward` or `cooldown` value, or a missing `activity`;
- an unknown activity, item, background or `# left` character in the **knot tags**;
- two beats with the same `order` in one file.

The tests do **not** yet catch misspelled speaker ids, or unknown ids in tags on lines inside a scene. Those fail quietly: the line shows as narration, the background falls back to `home`, or no portrait is drawn. Preview new scenes in the Gallery to catch them.

### Previewing

- **Inky** shows text, choices and stat conditions. Edit the `VAR` defaults to try different stats.
- **In the game:** run `npm run dev` and open `http://localhost:5173/?gallery`. Pick the scene under **Dialog preview** and click **Play scene**. This shows portraits and backgrounds, and plays any beat regardless of its conditions. Rewards are shown but not granted.

### Style rules

- Placeholder beats can be short: a few lines that get the idea across.
- **Choices may only change the lines that follow within the same scene.** Nothing remembers a choice afterwards, so always rejoin with a gather (`-`).
- Stat conditions may change wording, never what happens: rewards and triggers come from tags only.
- Give each thread's grand item (Gambeson, Saint's Relic, Weighted Coin) on its second-to-last or last beat.
