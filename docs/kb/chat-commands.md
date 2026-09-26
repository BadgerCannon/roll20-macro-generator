# Chat commands and roll flags

Source: Complete Guide → _Chat Commands_, _Initiative_, _Errors_; Macros → _Multiple
commands_, _Roll Options_.

| Command | Meaning | Example |
| --- | --- | --- |
| `/r`, `/roll` | Roll (whole line is a roll) | `/r 1d20+5` |
| `/gr`, `/gmroll` | Roll shown only to GM | `/gr 2d6+3` |
| `/w NAME` | Whisper; quote names with spaces | `/w "Bob Smith" hi`, `/w gm …` |
| `/em`, `/me` | Emote as selected character | `/em swings [[2d6+2]]` |
| `/ooc` | Out-of-character | |
| `/desc` | GM description | |
| `/as "NAME"` | GM: speak as any character | `/as "Sir Bearington" …` |
| `/emas NAME` | GM: emote as any name | |
| `/talktomyself` | Toggle private chat | |
| `/fx TYPE-COLOR SRC TGT` | Visual effect | `/fx beam-acid @{target|Caster|token_id} @{target|Foe|token_id}` |
| `!command` | API (Mod) command | `!setattr --name John --hp|15` |

- **Each line is a separate chat message.** A multi-line macro runs its lines in order and
  can mix commands and plain text.
- Plain text with inline rolls needs no command: `Arcana [[1d20+15]]`.
- Markdown in chat: `*italic*`, `**bold**`, `***both***`, ` ``code`` `, `[text](url)`.

## Roll flags

| Flag | Effect |
| --- | --- |
| `&{tracker}` | Put the roll result on the Turn Tracker for the selected token |
| `&{tracker:+}` / `&{tracker:-}` | Add to / subtract from the current tracker value |
| `&{noerror}` | Suppress errors such as missing attributes |

Flags work in `/roll` and inside inline rolls: `[[1d20+4 &{tracker}]]`, `[[10 &{tracker:-}]]`.
Tracker values can be read with `@{tracker|Name}`.
