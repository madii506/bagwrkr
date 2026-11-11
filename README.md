# bagwrkr

Work your bag. Get paid for it. A launchpad on Raydium LaunchLab where the curve fees of every coin go to the holders who work it on X, by points.

- `index.html` + `assets/`: the intro and the terminal (floor, coins, clock in, payroll, leaders, launch, docs, ops), the time card, the console. No build step.
- `api/bagwrkr.js`: one serverless function. Launches on Raydium LaunchLab; the chain index is read from the tag address in `api/bagwrkr-config.json`. Posts are read from X's public post pages (fxtwitter, with vxtwitter as a fallback) and scored; payroll pays SOL split by points.
- `api/bagwrkr-config.json`: fee, opens, and the work rules (minimum followers and account age, post age, daily limit, decay, cap, minimum hold, post kinds).
- Storage: a Vercel Blob store (`BLOB_READ_WRITE_TOKEN`) for images, metadata, coin cards, X links, handed-in work and payslips.
- Env: `BAGWRKR_PAD` (the launchpad once created), optional `BAGWRKR_SALT` (for the clock-in codes), optional `RPC_URL`.

Every transaction is signed in the visitor's own wallet. bagwrkr never holds keys or coins, never asks for an X password and never posts for anyone.

Live: https://bagwrkr.vercel.app
