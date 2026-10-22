// Curated "smart money" wallets: well-known Solana memecoin traders (KOLs) whose wallets are PUBLICLY attributed to them.
// Rule: only addresses we could verify from a public source, each one cited. Verified 2026-10-17.
// Source A = kolscan.io, a public KOL PnL tracker: each wallet page https://kolscan.io/account/<address> lists the name
//            and X account it attributes to that wallet (data embedded in the page, fetched 2026-10-17).
// Source B = public preview of huggingface.co/datasets/masonmarker/solana-memecoin-kols (same name -> address).
// Attribution can go stale (traders rotate wallets). To add one: open its kolscan page, confirm the name/X handle, add a cited line.
"use strict";
module.exports = [
  // Cented (x.com/Cented7): source A https://kolscan.io/account/CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o; also source B
  { addr: 'CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o', label: 'Cented', x: 'Cented7' },
  // theo (x.com/theonomix): source A https://kolscan.io/account/Bi4rd5FH5bYEN8scZ7wevxNZyNmKHdaBcvewdPFxYdLt; also source B
  { addr: 'Bi4rd5FH5bYEN8scZ7wevxNZyNmKHdaBcvewdPFxYdLt', label: 'theo', x: 'theonomix' },
  // West (x.com/ratwizardx): source A https://kolscan.io/account/JDd3hy3gQn2V982mi1zqhNqUw1GfV2UL6g76STojCJPN; also source B
  { addr: 'JDd3hy3gQn2V982mi1zqhNqUw1GfV2UL6g76STojCJPN', label: 'West', x: 'ratwizardx' },
  // Doji (x.com/Humanevolvd): source A https://kolscan.io/account/5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg; also source B
  { addr: '5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg', label: 'Doji', x: 'Humanevolvd' },
  // Cupsey (x.com/Cupseyy): source A https://kolscan.io/account/2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f
  { addr: '2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f', label: 'Cupsey', x: 'Cupseyy' },
  // decu (x.com/notdecu): source A https://kolscan.io/account/4vw54BmAogeRV3vPKWyFet5yf8DTLcREzdSzx4rw9Ud9
  { addr: '4vw54BmAogeRV3vPKWyFet5yf8DTLcREzdSzx4rw9Ud9', label: 'decu', x: 'notdecu' },
  // Gake (x.com/Ga__ke): source A https://kolscan.io/account/DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm
  { addr: 'DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm', label: 'Gake', x: 'Ga__ke' },
  // orangie (x.com/orangie): source A https://kolscan.io/account/DuQabFqdC9eeBULVa7TTdZYxe8vK8ct5DZr4Xcf7docy
  { addr: 'DuQabFqdC9eeBULVa7TTdZYxe8vK8ct5DZr4Xcf7docy', label: 'orangie', x: 'orangie' },
  // Euris (x.com/Euris_JT): source A https://kolscan.io/account/DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj
  { addr: 'DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj', label: 'Euris', x: 'Euris_JT' },
  // Jijo (x.com/jijo_exe): source A https://kolscan.io/account/4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk
  { addr: '4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk', label: 'Jijo', x: 'jijo_exe' },
  // Mitch (x.com/idrawline): source A https://kolscan.io/account/4Be9CvxqHW6BYiRAxW9Q3xu1ycTMWaL5z8NX4HR3ha7t
  { addr: '4Be9CvxqHW6BYiRAxW9Q3xu1ycTMWaL5z8NX4HR3ha7t', label: 'Mitch', x: 'idrawline' },
  // trunoest (x.com/trunoest): source A https://kolscan.io/account/ardinRsN1mNYVeoJWTBsWeYeXvuR9UUDGMsCDKpb6AT
  { addr: 'ardinRsN1mNYVeoJWTBsWeYeXvuR9UUDGMsCDKpb6AT', label: 'trunoest', x: 'trunoest' },
  // clukz (x.com/clukzSOL): source A https://kolscan.io/account/G6fUXjMKPJzCY1rveAE6Qm7wy5U3vZgKDJmN1VPAdiZC
  { addr: 'G6fUXjMKPJzCY1rveAE6Qm7wy5U3vZgKDJmN1VPAdiZC', label: 'clukz', x: 'clukzSOL' },
  // Daumen (x.com/daumenxyz): source A https://kolscan.io/account/8MaVa9kdt3NW4Q5HyNAm1X5LbR8PQRVDc1W8NMVK88D5
  { addr: '8MaVa9kdt3NW4Q5HyNAm1X5LbR8PQRVDc1W8NMVK88D5', label: 'Daumen', x: 'daumenxyz' },
  // Publix (x.com/Publixplayz): source A https://kolscan.io/account/86AEJExyjeNNgcp7GrAvCXTDicf5aGWgoERbXFiG1EdD
  { addr: '86AEJExyjeNNgcp7GrAvCXTDicf5aGWgoERbXFiG1EdD', label: 'Publix', x: 'Publixplayz' },
  // Scharo (x.com/XScharo): source A https://kolscan.io/account/4sAUSQFdvWRBxR8UoLBYbw8CcXuwXWxnN8pXa4mtm5nU
  { addr: '4sAUSQFdvWRBxR8UoLBYbw8CcXuwXWxnN8pXa4mtm5nU', label: 'Scharo', x: 'XScharo' },
  // Kev (x.com/Kevsznx): source A https://kolscan.io/account/BTf4A2exGK9BCVDNzy65b9dUzXgMqB4weVkvTMFQsadd
  { addr: 'BTf4A2exGK9BCVDNzy65b9dUzXgMqB4weVkvTMFQsadd', label: 'Kev', x: 'Kevsznx' },
  // Jidn (x.com/jidn_w): source A https://kolscan.io/account/3h65MmPZksoKKyEpEjnWU2Yk2iYT5oZDNitGy5cTaxoE
  { addr: '3h65MmPZksoKKyEpEjnWU2Yk2iYT5oZDNitGy5cTaxoE', label: 'Jidn', x: 'jidn_w' },
  // Loopierr (x.com/Loopierr): source A https://kolscan.io/account/9yYya3F5EJoLnBNKW6z4bZvyQytMXzDcpU5D6yYr4jqL
  { addr: '9yYya3F5EJoLnBNKW6z4bZvyQytMXzDcpU5D6yYr4jqL', label: 'Loopierr', x: 'Loopierr' },
  // Sheep (x.com/imsheepsol): source A https://kolscan.io/account/78N177fzNJpp8pG49xDv1efYcTMSzo9tPTKEA9mAVkh2
  { addr: '78N177fzNJpp8pG49xDv1efYcTMSzo9tPTKEA9mAVkh2', label: 'Sheep', x: 'imsheepsol' },
];
