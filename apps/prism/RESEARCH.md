# prism — one picture, every material of the farm at once

Owner 2026-10-11: «створи нову апку у яку я зможу поділитись зображенням, а вона зробить одночасно декілька стилів
зміни, усі наші теми, також світла тема враховується. і також створити свій стиль промпт зберігаємо також
мініатюрку зображення результату самого стилю лише … саме при збереженні робимо ту ж лисичку зі стилем самого
кастомера. зберігати у юзера в бд?» Decisions (AskUserQuestion): the light side follows the current theme
(«за поточною темою»), the name is **Prism**; then «так всі одразу викладай прям релізом».

## What it stands on (nothing new on the pods)

- `/feed/image/material` (edge image.js, owner 2026-09-05): `{image, material}` → the same scene, only its
  substance changed; ONE Space at a time in a measured order (JitRoy2024/Qwen_Img_Space → ovi054 LoRA →
  kogutt999). The 11 scene prompts were each read on a sheet before they shipped (podoba's keeper).
- New for Prism (edge d5f8bcc): `mode: "light"` = each material's PAPER twin (same wording, a light ground; paper
  and ink were light already), and `material: "custom"` + `style` = a person's words in the same scene-first
  frame, so a free prompt keeps the composition instead of inventing a subject.
- `/feed/styles/{list,save,del}` (edge styles.js): name + prompt + the FOX thumb (≤ 64 KB) per account in
  Postgres (`user_style`), 24 per account; an account merge carries them.
- The fox: `rt/theme-plain.webp`, the neutral fox every theme's tile in the material picker is drawn from. A
  custom style's thumb is that fox redrawn in the style, made on the phone before the save.

## State map

| state | screen |
|---|---|
| no picture | the hero line + the kit's Chooser (gallery · camera); a picture shared from the gallery lands here directly (`share.files: image/*`) |
| picture, not split | the picture card (night/day, «Розкласти на стилі») + the grid: every material as its fox, idle |
| splitting | each tile a fox with a slow light passing over it, «малюю»; the count «Малюю · n з N» |
| tile drawn | the picture fades in on the focal clock; a tap opens it full-screen with Save / Share |
| tile failed | the fox dim + «Ще раз» on the tile |
| own style sheet | name + «із чого все складається» → «Намалювати лисичку» → the fox in the style → «Зберегти» (signed in) |

Four tasks in flight at a time: the pods walk material jobs by bucket; fifteen at once only queue.

## Not done (said, not hidden)

- No timing measured on the pods for a full 11-material split yet; first live run decides whether 4 in flight
  is right.
- The paper twins were written from the dark lines, not yet read on a sheet the way the dark ones were.
