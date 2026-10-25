# X reply bot — setup guide (beginner friendly)

When someone tags **@OnTheScope** (or whatever handle you set) in a post that has a contract address — or replies
to / quotes a post that has one — the bot replies with the Scope Score and a link to the token page:

```
🎯 $Bonk Scope Score: 78/100
Coin 80 · OK | Narrative 75 · LIKELY REAL
“Top 10 wallets (excl. pools/lockers) hold 38% · real project footprint”
Breakdown: https://onthescope.fun/token/DezXAZ…B263
DYOR · not financial advice
```

It understands raw Solana mints, EVM `0x…` addresses, and links from DexScreener, pump.fun, Birdeye, Solscan,
Jupiter, GMGN and On the Scope. Posts with no address are ignored (no reply, no cost).

The bot is **off** until the four keys below are set. Nothing is posted from this repo or by me. You
create the X account and keys yourself.

---

## What it costs (checked 17 Oct 2026 on docs.x.com/x-api/getting-started/pricing)

X no longer has a free plan that can read mentions. The official pricing page lists only **pay-per-use credits**:
you buy credits in the Developer Console, and each call takes some off your balance.

| What the bot does | X price |
|---|---|
| Read a mention of **your own** account (`GET /2/users/{id}/mentions`, an “Owned Read”) | **$0.001** per post |
| Read the post being replied to or quoted (it comes back with the mention) | $0.005 per post |
| Post the reply (a reply to a post that tagged you is a “summoned” reply) | **$0.010** per reply |
| One-time lookup of the bot’s own account at startup (`/2/users/me`) | $0.010 |

Normal posts that contain a link cost $0.20, but X’s page says *summoned replies remain at standard price*,
so link replies to mentions should cost $0.01. **Set a spending limit in the console** in case X bills differently.

Rough cost: 100 tagged posts a day ≈ 100 × ($0.001 + $0.005 + $0.01) ≈ **$1.60/day (~$48/month)**. Mentions with
no contract address cost only $0.001 (plus $0.005 for the parent post).

---

## Step by step

1. **Create the bot’s X account** (e.g. @OnTheScope) in the X app, like any normal account.
   In *Settings → Your account → Account information → Automation*, mark it as an automated account managed by
   your main account. X asks bots to do this.
2. Go to **https://console.x.com** and sign in **as the bot account**. Accept the developer terms and create a
   **Project + App**.
3. In the app, open **User authentication settings → Set up**:
   - App permissions: **Read and write**
   - Type of app: **Web App, Automated App or Bot**
   - Callback URL / Website: use your site URL (`https://onthescope.fun`, or `https://trenchscope.onrender.com`)
   - Save.
4. Open **Keys and tokens**:
   - **API Key and Secret** (also called Consumer Key/Secret) → copy both.
   - **Access Token and Secret** → *Generate*. Do this **after** step 3 so the token has *Read and Write*
     (the console shows it). If you generated them earlier, click *Regenerate*.
   - **Bearer Token** is optional. The bot signs every call with the four keys above.
5. **Add credits** in the console (Billing) and set a **spending limit**.
6. On **Render → trenchscope → Environment**, add:

   | Variable | Value |
   |---|---|
   | `X_API_KEY` | API Key |
   | `X_API_SECRET` | API Key Secret |
   | `X_ACCESS_TOKEN` | Access Token (of the bot account) |
   | `X_ACCESS_SECRET` | Access Token Secret |
   | `X_BEARER_TOKEN` | optional, not needed today |
   | `X_BOT_HANDLE` | optional, default `OnTheScope` |
   | `PUBLIC_URL` | optional, defaults to `https://onthescope.fun` in `render.yaml` (or falls back to Render’s `RENDER_EXTERNAL_URL`) |
   | `X_BOT_DRY_RUN` | optional, `1` = log the replies it *would* post to the Render logs but post nothing. Good for a first test |
   | `X_POLL_SECONDS` | optional, default `90` (minimum 30) |
   | `X_MAX_REPLIES_PER_HOUR` | optional, default `30` |

7. **Save → Manual Deploy → Deploy latest commit.** Render does not auto-deploy this service.
8. Check it’s running: open `https://<your site>/api/health`. It should show `"xbot": {"enabled": true, ...}`
   with a recent `lastPoll` and `lastError: null`. Render’s *Logs* tab shows `[xbot] watching @OnTheScope mentions`.
9. Test: from another account, post `@OnTheScope <a contract address>`. The reply arrives within ~1.5 minutes.

## Safety and rate limits built in
- On first start it **does not answer old mentions**. It only replies to mentions newer than that moment.
- It never replies to the same post twice, never replies to itself, and replies at most 3 times per hour to the
  same person and `X_MAX_REPLIES_PER_HOUR` times per hour overall.
- It reads X’s `x-rate-limit-remaining` / `x-rate-limit-reset` headers. On HTTP 429 it pauses until X’s reset time.
- Keys are only read from environment variables. Never put them in the code or commit them.
- Render’s free disk resets on each deploy. The bot then skips the backlog again (it won’t double-reply to
  old mentions after a restart, but mentions that arrive while the service is asleep are skipped).

## Troubleshooting
| `lastError` says | Fix |
|---|---|
| `X 401` | One of the four keys is wrong, or was regenerated. Copy all four again. |
| `X 403 … oauth1 app permissions` | The access token is read-only. Set *Read and write* (step 3), then **regenerate** the access token. |
| `X 402` / credits | Add credits in console.x.com. |
| `rate limited until …` | Normal. It resumes on its own. |
