# Her lines

Everything she says in her speech bubble can be yours: add your own lines to hers, or replace hers completely. You can give **every model** the same extra lines, and give **each character** her own personality: a shy one, a cool one, one who calls you "master".

Nothing here is needed. Without it she uses her own lines, in the language YDCP is set to.

## Where

| File | For |
|---|---|
| `~/.ydcp/lines.json` (Windows: `%USERPROFILE%\.ydcp\lines.json`) | Every model |
| The model's profile, `my-model.json` next to `my-model.vrm` (see [models.md](models.md#model-profile-optional)) | That character only |

Both use the same `"lines"` block, so you can copy it from one to the other. YDCP notices changes within a couple of seconds; no restart needed.

## Example

`~/.ydcp/lines.json`:

```json
{
  "lines": {
    "greetings": ["Ohayo~ ready when you are!", "Back to work? I'll watch!"],
    "musings": ["Hydrate! 💧", "Posture check!", "Did you save your work?"],
    "pat": ["Nyaa~", "More, please…"]
  }
}
```

She keeps her own lines and adds these to them.

A cool character's profile, `rei.json`, replacing hers completely:

```json
{
  "name": "Rei",
  "lines": {
    "mode": "replace",
    "greetings": ["…You're here. Fine."],
    "pat": ["…Don't push your luck.", "Hmph."],
    "musings": []
  }
}
```

`"musings": []` with `"replace"` means she doesn't muse at all.

## What you can set

| Name | When she says it |
|---|---|
| `greetings` | When she first appears |
| `wake` | When you come back after she dozed off |
| `sleep` | When she dozes off (10 minutes without the mouse) |
| `musings` | Now and then, every minute or two |
| `cheer` | When the agent link says an agent finished (`done`) |
| `failed` | When the agent link says something failed |
| `pat` | Sometimes, when you pat her head |
| `wave`, `peace`, `shy` | During the built-in moments of those names |

Each is a list of lines; she picks one at random each time. A single line in quotes works too: `"pat": "Nyaa~"`.

| Setting | Meaning |
|---|---|
| `"mode": "add"` (or no `mode`) | Your lines are mixed in with hers |
| `"mode": "replace"` | Only your lines, for every name you list. Names you don't list keep hers. An empty list (`[]`) silences that one |

**Both files at once:** her lines come first, then `lines.json` is applied, then the model's profile. So a profile with `"replace"` wins for that character, and a profile with `"add"` adds to whatever `lines.json` gave her.

## Good to know

- Your lines are shown exactly as you write them, in any language and whatever YDCP's language is set to. Her own lines follow Menu → Language.
- Lines longer than 140 characters are cut; her bubble is small. Up to 50 lines per name.
- If a file has a mistake (most often a comma after the last line in a list), YDCP ignores that file and she keeps her own lines. See [Editing the JSON files](../README.md#editing-the-json-files) for the common mistakes and how to check a file.
- Added lines are mixed in with hers, so with `"add"` one new line among her eight cheers comes up about 1 time in 9. Use `"replace"` if you always want yours.
- Lines for your own motions (`.vrma`) go in `motions.json` instead: see [motions.md](motions.md). Lines from an AI agent or a script go in `state.json`: see [agent-link.md](agent-link.md).
- Like everything else in YDCP, these files never leave your computer.
