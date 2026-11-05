# Lot 7 parking prototype

A Wizard-of-Oz prototype for an HCI course project. It is a static site:
no build step, no server, no real data. Nothing typed into it is sent
anywhere, and the payment screen is a mock.

## Files

- `index.html` – page structure, phone frame, and wizard panel
- `styles.css` – Design A styling with Design B's numbered steps
- `app.js` – screens, simulated clock, fake texts, and wizard actions

## Run locally

Open `index.html` in a browser.

## Put it on Vercel (no command line)

1. Create a new repository on github.com (for example `parking-prototype`).
2. Click **Add file → Upload files** and drag in all four files. Commit.
3. Go to vercel.com, sign in with GitHub, and click **Add New → Project**.
4. Import the repository. Leave Framework Preset as **Other** and every
   build setting empty. Click **Deploy**.
5. Vercel gives you a URL such as `parking-prototype.vercel.app`.

Any later commit to the repository redeploys the site automatically.

## Running a session

- The wizard panel sits beside the phone on a laptop. Press **W**, or
  triple-tap the "Lot 7" logo, to show or hide it. On a phone it opens as a
  sheet from the bottom.
- Add `#participant` to the URL to start with the wizard hidden.
- **Reset demo** clears everything (it is stored only in that browser).

| Wizard button | What the participant sees |
|---|---|
| Make a returning user | "Welcome back" with one-tap parking |
| Plate scan succeeds | The plate field fills in, as if the camera read it |
| AUTO: car enters lot | A check-in text and the confirmation screen, with no form |
| AUTO: car leaves lot | Exit text; if money is owed, the pay screen |
| +15 min / Jump to 1 h 45 m | Clock moves forward; the 15-minute reminder text fires |
| Jump to 2 h 10 m / 5 h 10 m | Free time ends; the $5 or $10 charge appears |
| Weak cell signal | Registration waits, retries, then succeeds |
