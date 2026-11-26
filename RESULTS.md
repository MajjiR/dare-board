# Results

Generated 2026-11-26T16:06:31.584Z by `node f5.mjs report` from the files in `runs/`.

## HTTP sweep (read-only)

4 of 11 live apps answer 404 when a real page is refreshed.

| App | Page | Home | Same page after refresh |
|---|---|---|---|
| https://payloan.vercel.app | `/login` | 200 | **404** |
| https://my-financial-ledger.vercel.app | `/auth` | 200 | **404** |
| https://study-zen-vision-main.vercel.app | `/focus` | 404 | **404** |
| https://ib-electric-store.vercel.app | `/shop` | 404 | **404** |
| https://nido-phase-4.vercel.app | `/login` | 200 | **404** |
| https://heal-sphere.vercel.app | `/login` | 200 | **404** |
| https://physicalmedia.thamara.co.uk | `/stats` | 200 | **200** |
| https://scriptforgeaii.lovable.app | `/pricing` | 200 | **200** |
| https://guest-it.vercel.app | `/login` | 200 | **200** |
| https://kairos-website-virid.vercel.app | `/about` | 200 | **200** |
| https://careconnect-cuidadores.vercel.app | `/planos` | 200 | **200** |

## Kane proof and fix loop

| App (repo) | Kane, live | Kane, stand-in before | Rounds | Kane after fix | Files changed | Evidence |
|---|---|---|---|---|---|---|
| [Arbab-Mustafa/Payloan](https://github.com/Arbab-Mustafa/Payloan) | failed | failed | 1: claude -> not logged in, skipped<br>2: codex -> passed | passed | vercel.json | [runs/payloan](runs/payloan) |
| [sirmakau/my-financial-compass](https://github.com/sirmakau/my-financial-compass) | failed | failed | 1: claude -> not logged in, skipped<br>2: codex -> passed | passed | vercel.json | [runs/financial-compass](runs/financial-compass) |
| [thenameisshambhulinga/ERP-Platform-](https://github.com/thenameisshambhulinga/ERP-Platform-) | failed | failed | 1: claude -> not logged in, skipped<br>2: codex -> failed<br>3: codex -> failed | failed | vercel.json | [runs/nido-erp](runs/nido-erp) |
