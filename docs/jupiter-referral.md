# Earn a fee on "Buy" swaps (Jupiter referral) — beginner guide

Every Solana token page on On the Scope has a **⚡ Buy … here** card. It's the official
[Jupiter Plugin](https://dev.jup.ag/tool-kits/plugin), so the swap runs inside Jupiter's widget and the
buyer's own wallet (Phantom, Backpack, Solflare…) signs it. We never touch keys or funds.

The card **works right away with no setup**. It just doesn't earn you anything until you add a
Jupiter *referral account*. Once you set one, a small fee (default **0.5%**) is added to each swap
made through the card and paid to that account. The card tells buyers about the fee.

> Jupiter keeps 20% of the referral fee (e.g. on 0.5%, you get 0.4%). Allowed range: 50–255 bps (0.5%–2.55%).

## 1. Create the referral account (one time, ~2 minutes, costs a little SOL for rent)

1. Open **https://referral.jup.ag** (Jupiter's Referral Dashboard) in a browser that has your wallet.
2. Connect the wallet that should **own** the fees. For this site that is the project wallet
   `EL63Jz5kAamGAFtwiunvCJsFcAZWGUmagPTHZTrcPVv6`.
3. Create a new referral account under the **Jupiter Ultra** project (the Plugin uses Ultra,
   project `DkiqsTrw1u1bYFumumC7sCG2S8K25qc2vemJFHyW2wJc`). Give it any name, e.g. `onthescope`.
4. Approve the transaction in your wallet. The dashboard then shows your **referral account address**
   (a long Solana address). It is **not** your wallet address. Copy it.

## 2. Create fee token accounts (so fees can actually land)

Jupiter picks which token the fee is paid in (usually **SOL**, otherwise USDC/USDT). If the matching
"referral token account" doesn't exist, the swap still goes through but **you earn nothing**.

In the dashboard, open your referral account and create token accounts for at least:

- **SOL** (wrapped SOL `So11111111111111111111111111111111111111112`) — covers almost every memecoin buy
- **USDC** `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- **USDT** `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` (optional)

Each costs a tiny bit of SOL for rent.

## 3. Turn it on in Render

Render → your **trenchscope** service → **Environment** → add:

| Key | Value |
| --- | --- |
| `JUP_REFERRAL_ACCOUNT` | the referral account address from step 1 (not your wallet) |
| `JUP_REFERRAL_FEE_BPS` | optional, `50` = 0.5% (default). 50–255 allowed |

Save, then **Manual Deploy → Deploy latest commit** (this service does not auto-deploy).
Check `https://<your-site>/api/config`: it should show your `referralAccount` and `feeBps`.
The Render log line `[jupiter] … referral 50 bps` confirms it too.

## 4. Claim your fees

Fees pile up in the referral token accounts. Open **https://referral.jup.ag** with the owner wallet
and press **Claim** (or use `claimAllV2` from `@jup-ag/referral-sdk`).

## Switches

- `JUP_PLUGIN=0` hides the on-site swap card; the **⚡ Buy** button then just opens jup.ag.
- The **Buy on Jupiter ↗** link under the card always works as a fallback.

Sources: [Jupiter Plugin docs](https://dev.jup.ag/tool-kits/plugin/customization) (`formProps.referralAccount` / `referralFee`),
[Ultra integrator fees](https://dev.jup.ag/docs/ultra/add-fees-to-ultra).
