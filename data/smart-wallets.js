// Curated "smart money" wallets: well-known Solana memecoin traders (KOLs) whose wallets are PUBLICLY attributed to them.
// Rule: only addresses we could verify from a public source, each one cited. Verified 2026-10-17.
// Source A = kolscan.io, a public KOL PnL tracker: each wallet page https://kolscan.io/account/<address> lists the name
//            and X account it attributes to that wallet (data embedded in the page, fetched 2026-10-17).
// Source B = public preview of huggingface.co/datasets/masonmarker/solana-memecoin-kols (same name -> address).
// cat: "caller" = posts public calls (pump.fun callouts); "trader" = tracked for its own on-chain PnL (kolscan leaderboard).
// Attribution can go stale (traders rotate wallets). To add one: open its kolscan page, confirm the name/X handle, add a cited line.
"use strict";
module.exports = [
  // Cented (x.com/Cented7): source A https://kolscan.io/account/CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o; also source B
  { addr: 'CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o', label: 'Cented', x: 'Cented7', cat: 'trader' },
  // theo (x.com/theonomix): source A https://kolscan.io/account/Bi4rd5FH5bYEN8scZ7wevxNZyNmKHdaBcvewdPFxYdLt; also source B
  { addr: 'Bi4rd5FH5bYEN8scZ7wevxNZyNmKHdaBcvewdPFxYdLt', label: 'theo', x: 'theonomix', cat: 'trader' },
  // West (x.com/ratwizardx): source A https://kolscan.io/account/JDd3hy3gQn2V982mi1zqhNqUw1GfV2UL6g76STojCJPN; also source B
  { addr: 'JDd3hy3gQn2V982mi1zqhNqUw1GfV2UL6g76STojCJPN', label: 'West', x: 'ratwizardx', cat: 'trader' },
  // Doji (x.com/Humanevolvd): source A https://kolscan.io/account/5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg; also source B
  { addr: '5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg', label: 'Doji', x: 'Humanevolvd', cat: 'trader' },
  // Cupsey (x.com/Cupseyy): source A https://kolscan.io/account/2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f
  { addr: '2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f', label: 'Cupsey', x: 'Cupseyy', cat: 'trader' },
  // decu (x.com/notdecu): source A https://kolscan.io/account/4vw54BmAogeRV3vPKWyFet5yf8DTLcREzdSzx4rw9Ud9
  { addr: '4vw54BmAogeRV3vPKWyFet5yf8DTLcREzdSzx4rw9Ud9', label: 'decu', x: 'notdecu', cat: 'trader' },
  // Gake (x.com/Ga__ke): source A https://kolscan.io/account/DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm
  { addr: 'DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm', label: 'Gake', x: 'Ga__ke', cat: 'trader' },
  // orangie (x.com/orangie): source A https://kolscan.io/account/DuQabFqdC9eeBULVa7TTdZYxe8vK8ct5DZr4Xcf7docy
  { addr: 'DuQabFqdC9eeBULVa7TTdZYxe8vK8ct5DZr4Xcf7docy', label: 'orangie', x: 'orangie', cat: 'trader' },
  // Euris (x.com/Euris_JT): source A https://kolscan.io/account/DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj
  { addr: 'DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj', label: 'Euris', x: 'Euris_JT', cat: 'trader' },
  // Jijo (x.com/jijo_exe): source A https://kolscan.io/account/4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk
  { addr: '4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk', label: 'Jijo', x: 'jijo_exe', cat: 'trader' },
  // Mitch (x.com/idrawline): source A https://kolscan.io/account/4Be9CvxqHW6BYiRAxW9Q3xu1ycTMWaL5z8NX4HR3ha7t
  { addr: '4Be9CvxqHW6BYiRAxW9Q3xu1ycTMWaL5z8NX4HR3ha7t', label: 'Mitch', x: 'idrawline', cat: 'trader' },
  // trunoest (x.com/trunoest): source A https://kolscan.io/account/ardinRsN1mNYVeoJWTBsWeYeXvuR9UUDGMsCDKpb6AT
  { addr: 'ardinRsN1mNYVeoJWTBsWeYeXvuR9UUDGMsCDKpb6AT', label: 'trunoest', x: 'trunoest', cat: 'trader' },
  // clukz (x.com/clukzSOL): source A https://kolscan.io/account/G6fUXjMKPJzCY1rveAE6Qm7wy5U3vZgKDJmN1VPAdiZC
  { addr: 'G6fUXjMKPJzCY1rveAE6Qm7wy5U3vZgKDJmN1VPAdiZC', label: 'clukz', x: 'clukzSOL', cat: 'trader' },
  // Daumen (x.com/daumenxyz): source A https://kolscan.io/account/8MaVa9kdt3NW4Q5HyNAm1X5LbR8PQRVDc1W8NMVK88D5; also pump.fun caller https://frontend-api-v3.pump.fun/users/daumen (address = canonical_svm_wallet, checked 2026-10-23)
  { addr: '8MaVa9kdt3NW4Q5HyNAm1X5LbR8PQRVDc1W8NMVK88D5', label: 'Daumen', x: 'daumenxyz', cat: 'caller', pump: 'daumen' },
  // Publix (x.com/Publixplayz): source A https://kolscan.io/account/86AEJExyjeNNgcp7GrAvCXTDicf5aGWgoERbXFiG1EdD
  { addr: '86AEJExyjeNNgcp7GrAvCXTDicf5aGWgoERbXFiG1EdD', label: 'Publix', x: 'Publixplayz', cat: 'trader' },
  // Scharo (x.com/XScharo): source A https://kolscan.io/account/4sAUSQFdvWRBxR8UoLBYbw8CcXuwXWxnN8pXa4mtm5nU
  { addr: '4sAUSQFdvWRBxR8UoLBYbw8CcXuwXWxnN8pXa4mtm5nU', label: 'Scharo', x: 'XScharo', cat: 'trader' },
  // Kev (x.com/Kevsznx): source A https://kolscan.io/account/BTf4A2exGK9BCVDNzy65b9dUzXgMqB4weVkvTMFQsadd
  { addr: 'BTf4A2exGK9BCVDNzy65b9dUzXgMqB4weVkvTMFQsadd', label: 'Kev', x: 'Kevsznx', cat: 'trader' },
  // Jidn (x.com/jidn_w): source A https://kolscan.io/account/3h65MmPZksoKKyEpEjnWU2Yk2iYT5oZDNitGy5cTaxoE
  { addr: '3h65MmPZksoKKyEpEjnWU2Yk2iYT5oZDNitGy5cTaxoE', label: 'Jidn', x: 'jidn_w', cat: 'trader' },
  // Loopierr (x.com/Loopierr): source A https://kolscan.io/account/9yYya3F5EJoLnBNKW6z4bZvyQytMXzDcpU5D6yYr4jqL
  { addr: '9yYya3F5EJoLnBNKW6z4bZvyQytMXzDcpU5D6yYr4jqL', label: 'Loopierr', x: 'Loopierr', cat: 'trader' },
  // Sheep (x.com/imsheepsol): source A https://kolscan.io/account/78N177fzNJpp8pG49xDv1efYcTMSzo9tPTKEA9mAVkh2
  { addr: '78N177fzNJpp8pG49xDv1efYcTMSzo9tPTKEA9mAVkh2', label: 'Sheep', x: 'imsheepsol', cat: 'trader' },
  // ---- pump.fun callers (added 2026-10-23) ----
  // Source C = pump.fun's public profile API https://frontend-api-v3.pump.fun/users/<username>: the "address" and
  //            "canonical_svm_wallet" fields both matched the wallet below, and "x_username" gives the X handle. Each caller
  //            posts public callouts on https://pump.fun/profile/<username>. When the wallet also shows up on the kolscan
  //            leaderboard (source A), both sources are cited.
  // chairman (x.com/Chairman_DN): source C https://frontend-api-v3.pump.fun/users/chairman; also source A https://kolscan.io/account/Be24Gbf5KisDk1LcWWZsBn8dvB816By7YzYF5zWZnRR6 (as "Chairman")
  { addr: 'Be24Gbf5KisDk1LcWWZsBn8dvB816By7YzYF5zWZnRR6', label: 'chairman', x: 'Chairman_DN', cat: 'caller', pump: 'chairman' },
  // jackduvalcalls (x.com/jackduval): source C https://frontend-api-v3.pump.fun/users/jackduvalcalls
  { addr: 'BAr5csYtpWoNpwhUjixX7ZPHXkUciFZzjBp9uNxZXJPh', label: 'jackduvalcalls', x: 'jackduval', cat: 'caller', pump: 'jackduvalcalls' },
  // cupsey (x.com/Cupseyy): source C https://frontend-api-v3.pump.fun/users/cupsey
  { addr: '6DQAGJT7VZPVBsuG4kn3AvpyHCEi7B2RFFvMZdbqQqqP', label: 'cupsey', x: 'Cupseyy', cat: 'caller', pump: 'cupsey' },
  // HarryPaulDavies (x.com/harrypauldavies): source C https://frontend-api-v3.pump.fun/users/HarryPaulDavies
  { addr: 'DuARUpsEzdVbVpSnbGipLJvWxaXUCPLDJDjNov6Rc6s6', label: 'HarryPaulDavies', x: 'harrypauldavies', cat: 'caller', pump: 'HarryPaulDavies' },
  // Dior (x.com/Dior100x): source C https://frontend-api-v3.pump.fun/users/Dior; also source A https://kolscan.io/account/87rRdssFiTJKY4MGARa4G5vQ31hmR7MxSmhzeaJ5AAxJ (as "Dior")
  { addr: '87rRdssFiTJKY4MGARa4G5vQ31hmR7MxSmhzeaJ5AAxJ', label: 'Dior', x: 'Dior100x', cat: 'caller', pump: 'Dior' },
  // cap (x.com/cap100x): source C https://frontend-api-v3.pump.fun/users/cap
  { addr: 'CAPn1yH4oSywsxGU456jfgTrSSUidf9jgeAnHceNUJdw', label: 'cap', x: 'cap100x', cat: 'caller', pump: 'cap' },
  // ely (x.com/ProofOfEly): source C https://frontend-api-v3.pump.fun/users/ely
  { addr: 'CE44oKS3wpUerx8afyeii56u5oQjBLZknzm4Q2CYHUz9', label: 'ely', x: 'ProofOfEly', cat: 'caller', pump: 'ely' },
  // POORGOAT___ (x.com/PoorGoat_): source C https://frontend-api-v3.pump.fun/users/POORGOAT___
  { addr: '8k1sAmVUjzaZkxqexeYkCPphjcQobYugQeGmCyvKtHNG', label: 'POORGOAT___', x: 'PoorGoat_', cat: 'caller', pump: 'POORGOAT___' },
  // ferre (x.com/FerreWeb3): source C https://frontend-api-v3.pump.fun/users/ferre
  { addr: 'BSzpGGB3AMwtW126RT3Z27STSBrVjKV5A96H4BsUKdtD', label: 'ferre', x: 'FerreWeb3', cat: 'caller', pump: 'ferre' },
  // cooker (x.com/CookerFlips): source C https://frontend-api-v3.pump.fun/users/cooker; also source A https://kolscan.io/account/8deJ9xeUvXSJwicYptA9mHsU2rN2pDx37KWzkDkEXhU6 (as "Cooker")
  { addr: '8deJ9xeUvXSJwicYptA9mHsU2rN2pDx37KWzkDkEXhU6', label: 'cooker', x: 'CookerFlips', cat: 'caller', pump: 'cooker' },
  // _logjam (x.com/_logjam): source C https://frontend-api-v3.pump.fun/users/_logjam
  { addr: 'AH39BneW9UeWxQysUcwogQrYFdPvJuRVZ5w4ccq9SKfL', label: '_logjam', x: '_logjam', cat: 'caller', pump: '_logjam' },
  // 0xEthan (x.com/0xEthan): source C https://frontend-api-v3.pump.fun/users/0xEthan
  { addr: '6yVb4pxNwDfr6rovwNnBg3SyKSvDcHGD4WdFPN1JJBqm', label: '0xEthan', x: '0xEthan', cat: 'caller', pump: '0xEthan' },
  // slingoor (x.com/slingoorio): source C https://frontend-api-v3.pump.fun/users/slingoor; also source A https://kolscan.io/account/5YRgrP3mjGzrzirYYN5HAQH19cTYREYwGxW6XRJQUzij (as "slingoor")
  { addr: '5YRgrP3mjGzrzirYYN5HAQH19cTYREYwGxW6XRJQUzij', label: 'slingoor', x: 'slingoorio', cat: 'caller', pump: 'slingoor' },
  // thedetective (x.com/MemeRetire): source C https://frontend-api-v3.pump.fun/users/thedetective
  { addr: '6qudAN2kV8mtCcYJxb5QQ6Vr15itdHHdeVbYm99NKMhy', label: 'thedetective', x: 'MemeRetire', cat: 'caller', pump: 'thedetective' },
  // SossaDotKek (x.com/GeoffO7): source C https://frontend-api-v3.pump.fun/users/SossaDotKek
  { addr: '2M2vLX34LXMg24dMEnjWHvRXS1tshpEDRWzmXgV8ENNZ', label: 'SossaDotKek', x: 'GeoffO7', cat: 'caller', pump: 'SossaDotKek' },
  // Yennii56 (x.com/Yennii56): source C https://frontend-api-v3.pump.fun/users/Yennii56
  { addr: '5B52w1ZW9tuwUduueP5J7HXz5AcGfruGoX6YoAudvyxG', label: 'Yennii56', x: 'Yennii56', cat: 'caller', pump: 'Yennii56' },
  // RoaringKitty (x.com/RoaringKitty): source C https://frontend-api-v3.pump.fun/users/RoaringKitty
  { addr: 'HVaeUPbAwFhZnY8T3MrUzTWqpHiAbTU1NACmCQdJrqZp', label: 'RoaringKitty', x: 'RoaringKitty', cat: 'caller', pump: 'RoaringKitty' },
  // poe (x.com/poe_real69): source C https://frontend-api-v3.pump.fun/users/poe
  { addr: '7YndBV5gp3VvAiBbSfv8M7CoyMhFsiKeGYWkwee49fTg', label: 'poe', x: 'poe_real69', cat: 'caller', pump: 'poe' },
  // cousin (x.com/cousincrypt0): source C https://frontend-api-v3.pump.fun/users/cousin
  { addr: '6mrqa4cDaqBCD9UrUiUyoK78e4AJ8XzRaF8uTbcuTVae', label: 'cousin', x: 'cousincrypt0', cat: 'caller', pump: 'cousin' },
  // sadcrissy (x.com/sadcrissy): source C https://frontend-api-v3.pump.fun/users/sadcrissy
  { addr: 'EqBQhoU88ty3a3aDphDRCBuiRirjUsFSFi4UHGY64qvv', label: 'sadcrissy', x: 'sadcrissy', cat: 'caller', pump: 'sadcrissy' },
  // icedknife (x.com/IcedKnife): source C https://frontend-api-v3.pump.fun/users/icedknife
  { addr: 'DrJ6SnDXkEsPeGdmSs93v5rwWumv5QMvAGSZjAyWSd5o', label: 'icedknife', x: 'IcedKnife', cat: 'caller', pump: 'icedknife' },
  // wirelyss (x.com/wirelyss): source C https://frontend-api-v3.pump.fun/users/wirelyss
  { addr: 'AvGiSdrkwtGYhrrFXZPtdhNhV4pASUR67TmRjfaKGdMP', label: 'wirelyss', x: 'wirelyss', cat: 'caller', pump: 'wirelyss' },
  // FlippingProfits (x.com/Flippingprofits): source C https://frontend-api-v3.pump.fun/users/FlippingProfits
  { addr: 'DdM1tyCdoEyoxYYmGMjdf5rRPcpmj3UzZTpE7ScuTf7d', label: 'FlippingProfits', x: 'Flippingprofits', cat: 'caller', pump: 'FlippingProfits' },
  // gr3gor14n (x.com/gr3gor14n): source C https://frontend-api-v3.pump.fun/users/gr3gor14n; also source A https://kolscan.io/account/J23qr98GjGJJqKq9CBEnyRhHbmkaVxtTJNNxKu597wsA (as "gr3g")
  { addr: 'J23qr98GjGJJqKq9CBEnyRhHbmkaVxtTJNNxKu597wsA', label: 'gr3gor14n', x: 'gr3gor14n', cat: 'caller', pump: 'gr3gor14n' },
  // rikz_ (x.com/kenAbz): source C https://frontend-api-v3.pump.fun/users/rikz_
  { addr: '9LXWa7V3AE15VfBupcx5gDts2ix3Y9NzbcKZKjkkq6hV', label: 'rikz_', x: 'kenAbz', cat: 'caller', pump: 'rikz_' },
  // marcell (x.com/MarcellxMarcell): source C https://frontend-api-v3.pump.fun/users/marcell
  { addr: '6vbrTLsWy76TxDQAUKLqZrPohQuq6EVaJgfGzR82paFa', label: 'marcell', x: 'MarcellxMarcell', cat: 'caller', pump: 'marcell' },

  // ---- top kolscan traders (added 2026-10-23) ----
  // Source A' = the public kolscan.io/leaderboard as fetched 2026-10-23 (1d/7d/30d PnL lists). Each wallet's own kolscan
  //             page https://kolscan.io/account/<address> attributes the name and X account given below.
  // Schoen (x.com/Schoen_xyz): source A' https://kolscan.io/account/5hAgYC8TJCcEZV7LTXAzkTrm7YL29YXyQQJPCNrG84zM
  { addr: '5hAgYC8TJCcEZV7LTXAzkTrm7YL29YXyQQJPCNrG84zM', label: 'Schoen', x: 'Schoen_xyz', cat: 'trader' },
  // milito (x.com/fnmilito): source A' https://kolscan.io/account/EeXvxkcGqMDZeTaVeawzxm9mbzZwqDUMmfG3bF7uzumH
  { addr: 'EeXvxkcGqMDZeTaVeawzxm9mbzZwqDUMmfG3bF7uzumH', label: 'milito', x: 'fnmilito', cat: 'trader' },
  // Matt (x.com/MattFws): source A' https://kolscan.io/account/3bzaJd5yZG73EVDz8xosQb7gfZm2LN5auFGh6wnP1n1f
  { addr: '3bzaJd5yZG73EVDz8xosQb7gfZm2LN5auFGh6wnP1n1f', label: 'Matt', x: 'MattFws', cat: 'trader' },
  // Flames (x.com/FlamesOnSol): source A' https://kolscan.io/account/6aXFYXbFob1ZKAEDCcqZnX2vooA3TgEqDoy5dAQbeWoV
  { addr: '6aXFYXbFob1ZKAEDCcqZnX2vooA3TgEqDoy5dAQbeWoV', label: 'Flames', x: 'FlamesOnSol', cat: 'trader' },
  // Nyhrox (x.com/nyhrox): source A' https://kolscan.io/account/6S8GezkxYUfZy9JPtYnanbcZTMB87Wjt1qx3c6ELajKC
  { addr: '6S8GezkxYUfZy9JPtYnanbcZTMB87Wjt1qx3c6ELajKC', label: 'Nyhrox', x: 'nyhrox', cat: 'trader' },
  // Giann (x.com/Giann2K): source A' https://kolscan.io/account/GNrmKZCxYyNiSUsjduwwPJzhed3LATjciiKVuSGrsHEC
  { addr: 'GNrmKZCxYyNiSUsjduwwPJzhed3LATjciiKVuSGrsHEC', label: 'Giann', x: 'Giann2K', cat: 'trader' },
  // Kadenox (x.com/kadenox): source A' https://kolscan.io/account/B32QbbdDAyhvUQzjcaM5j6ZVKwjCxAwGH5Xgvb9SJqnC
  { addr: 'B32QbbdDAyhvUQzjcaM5j6ZVKwjCxAwGH5Xgvb9SJqnC', label: 'Kadenox', x: 'kadenox', cat: 'trader' },
  // Wugi (x.com/xWugi_wara): source A' https://kolscan.io/account/862TYSvRYoiHAK3F3WwTRYAfuGiQaGdxedN9AGvRGWo2
  { addr: '862TYSvRYoiHAK3F3WwTRYAfuGiQaGdxedN9AGvRGWo2', label: 'Wugi', x: 'xWugi_wara', cat: 'trader' },
  // Limfork.eth (x.com/Limfork): source A' https://kolscan.io/account/BQVz7fQ1WsQmSTMY3umdPEPPTm1sdcBcX9sP7o6kPRmB
  { addr: 'BQVz7fQ1WsQmSTMY3umdPEPPTm1sdcBcX9sP7o6kPRmB', label: 'Limfork.eth', x: 'Limfork', cat: 'trader' },
  // Tuults (x.com/tuults69): source A' https://kolscan.io/account/5T229oePmJGE5Cefys8jE9Jq8C7qfGNNWy3RVA7SmwEP
  { addr: '5T229oePmJGE5Cefys8jE9Jq8C7qfGNNWy3RVA7SmwEP', label: 'Tuults', x: 'tuults69', cat: 'trader' },
  // Stacker (x.com/Stackeronsol): source A' https://kolscan.io/account/HbCxe8yWQJWnK3f3FX4oohgm87FZuPYD4Ydszqxgkwft
  { addr: 'HbCxe8yWQJWnK3f3FX4oohgm87FZuPYD4Ydszqxgkwft', label: 'Stacker', x: 'Stackeronsol', cat: 'trader' },
  // peacefuldestroy (x.com/peacefuldestroy): source A' https://kolscan.io/account/8AtQ4ka3dgtrH1z4Uq3Tm4YdMN3cK5RRj1eKuGNnvenm
  { addr: '8AtQ4ka3dgtrH1z4Uq3Tm4YdMN3cK5RRj1eKuGNnvenm', label: 'peacefuldestroy', x: 'peacefuldestroy', cat: 'trader' },
  // Inquixit (x.com/inquixit): source A' https://kolscan.io/account/3L8RAxLkvwkz4CgHivaVRtq19741FAdGLk5DgjRfc1fW
  { addr: '3L8RAxLkvwkz4CgHivaVRtq19741FAdGLk5DgjRfc1fW', label: 'Inquixit', x: 'inquixit', cat: 'trader' },
  // Sebastian (x.com/Saint_pablo123): source A' https://kolscan.io/account/3BLjRcxWGtR7WRshJ3hL25U3RjWr5Ud98wMcczQqk4Ei
  { addr: '3BLjRcxWGtR7WRshJ3hL25U3RjWr5Ud98wMcczQqk4Ei', label: 'Sebastian', x: 'Saint_pablo123', cat: 'trader' },
  // Ethan Prosper (x.com/pr6spr): source A' https://kolscan.io/account/sAdNbe1cKNMDqDsa4npB3TfL62T14uAo2MsUQfLvzLT
  { addr: 'sAdNbe1cKNMDqDsa4npB3TfL62T14uAo2MsUQfLvzLT', label: 'Ethan Prosper', x: 'pr6spr', cat: 'trader' },
  // Lynk (x.com/lynk0x): source A' https://kolscan.io/account/CkPFGv2Wv1vwdWjtXioEgb8jhZQfs3eVZez3QCetu7xD
  { addr: 'CkPFGv2Wv1vwdWjtXioEgb8jhZQfs3eVZez3QCetu7xD', label: 'Lynk', x: 'lynk0x', cat: 'trader' },
  // Mel (x.com/melxprt): source A' https://kolscan.io/account/36A6mEN5rYJdVTb6fMqVvG6ez8g2mTYdr1omWcQ1kDKG
  { addr: '36A6mEN5rYJdVTb6fMqVvG6ez8g2mTYdr1omWcQ1kDKG', label: 'Mel', x: 'melxprt', cat: 'trader' },
  // k4ye (x.com/k4yeSol): source A' https://kolscan.io/account/5fHJszey2UdB2nETS1y6NS2wSG4ic9byKtbgJzaYzGeV
  { addr: '5fHJszey2UdB2nETS1y6NS2wSG4ic9byKtbgJzaYzGeV', label: 'k4ye', x: 'k4yeSol', cat: 'trader' },
  // Letterbomb (x.com/ihateoop): source A' https://kolscan.io/account/BtMBMPkoNbnLF9Xn552guQq528KKXcsNBNNBre3oaQtr
  { addr: 'BtMBMPkoNbnLF9Xn552guQq528KKXcsNBNNBre3oaQtr', label: 'Letterbomb', x: 'ihateoop', cat: 'trader' },
  // Hueno (x.com/HuenoZ): source A' https://kolscan.io/account/FWAmTVsmAjxYZe4Nt5ooLDg6AHHUx3ST3nz89oGSGu59
  { addr: 'FWAmTVsmAjxYZe4Nt5ooLDg6AHHUx3ST3nz89oGSGu59', label: 'Hueno', x: 'HuenoZ', cat: 'trader' },
  // King Solomon (x.com/0xsolomon): source A' https://kolscan.io/account/DEdEW3SMPU2dCfXEcgj2YppmX9H3bnMDJaU4ctn2BQDQ
  { addr: 'DEdEW3SMPU2dCfXEcgj2YppmX9H3bnMDJaU4ctn2BQDQ', label: 'King Solomon', x: '0xsolomon', cat: 'trader' },
  // Setsu (x.com/Setsu2k): source A' https://kolscan.io/account/2k7Mnf2K3GhpB7hEVN1CFFeV4oNzzuCS5Q6SmcfAoLHd
  { addr: '2k7Mnf2K3GhpB7hEVN1CFFeV4oNzzuCS5Q6SmcfAoLHd', label: 'Setsu', x: 'Setsu2k', cat: 'trader' },
  // LUKEY (x.com/VERYKOOLLUKEY): source A' https://kolscan.io/account/DjM7Tu7whh6P3pGVBfDzwXAx2zaw51GJWrJE3PwtuN7s
  { addr: 'DjM7Tu7whh6P3pGVBfDzwXAx2zaw51GJWrJE3PwtuN7s', label: 'LUKEY', x: 'VERYKOOLLUKEY', cat: 'trader' },
  // jrus (x.com/savemejrus): source A' https://kolscan.io/account/951wq3qDowjKHaycrNaiRB5WpovYVKXnqhnrcKPh46zt
  { addr: '951wq3qDowjKHaycrNaiRB5WpovYVKXnqhnrcKPh46zt', label: 'jrus', x: 'savemejrus', cat: 'trader' },
  // The Doc (x.com/KayTheDoc): source A' https://kolscan.io/account/DYAn4XpAkN5mhiXkRB7dGq4Jadnx6XYgu8L5b3WGhbrt
  { addr: 'DYAn4XpAkN5mhiXkRB7dGq4Jadnx6XYgu8L5b3WGhbrt', label: 'The Doc', x: 'KayTheDoc', cat: 'trader' },
  // Naruza (x.com/0xNaruza): source A' https://kolscan.io/account/ASVzakePP6GNg9r95d4LPZHJDMXun6L6E4um4pu5ybJk
  { addr: 'ASVzakePP6GNg9r95d4LPZHJDMXun6L6E4um4pu5ybJk', label: 'Naruza', x: '0xNaruza', cat: 'trader' },
  // Woozy (x.com/woozy2so): source A' https://kolscan.io/account/9tRff7L6Mx3ZDNBoGPffdjD3c9JNzLc3nxzadYH4TnAp
  { addr: '9tRff7L6Mx3ZDNBoGPffdjD3c9JNzLc3nxzadYH4TnAp', label: 'Woozy', x: 'woozy2so', cat: 'trader' },
  // Pikalosi (x.com/pikalosi): source A' https://kolscan.io/account/9cdZg6xR4c9kZiqKSzqjn4QHCXNQuC9HEWBzzMJ3mzqw
  { addr: '9cdZg6xR4c9kZiqKSzqjn4QHCXNQuC9HEWBzzMJ3mzqw', label: 'Pikalosi', x: 'pikalosi', cat: 'trader' },
  // KOREAN (x.com/Korean_bags): source A' https://kolscan.io/account/6KR7SorsUQtNH6CB6JpAnWCAKeTysa95iyXeWihdNeGT
  { addr: '6KR7SorsUQtNH6CB6JpAnWCAKeTysa95iyXeWihdNeGT', label: 'KOREAN', x: 'Korean_bags', cat: 'trader' },
  // Megga (x.com/Megga): source A' https://kolscan.io/account/H31vEBxSJk1nQdUN11qZgZyhScyShhscKhvhZZU3dQoU
  { addr: 'H31vEBxSJk1nQdUN11qZgZyhScyShhscKhvhZZU3dQoU', label: 'Megga', x: 'Megga', cat: 'trader' },
  // Advyth (x.com/Advyth): source A' https://kolscan.io/account/GEKZWL474tFAyYDUoTgKEgYuMxT3Se7HzKDDptrnXnvS
  { addr: 'GEKZWL474tFAyYDUoTgKEgYuMxT3Se7HzKDDptrnXnvS', label: 'Advyth', x: 'Advyth', cat: 'trader' },
  // Gasp (x.com/oh_gasp): source A' https://kolscan.io/account/xyzfhxfy8NhfeNG3Um3WaUvFXzNuHkrhrZMD8dsStB6
  { addr: 'xyzfhxfy8NhfeNG3Um3WaUvFXzNuHkrhrZMD8dsStB6', label: 'Gasp', x: 'oh_gasp', cat: 'trader' },
  // Solana degen (x.com/Solanadegen): source A' https://kolscan.io/account/9tY7u1HgEt2RDcxym3RJ9sfvT3aZStiiUwXd44X9RUr8
  { addr: '9tY7u1HgEt2RDcxym3RJ9sfvT3aZStiiUwXd44X9RUr8', label: 'Solana degen', x: 'Solanadegen', cat: 'trader' },
  // denzaa (x.com/denzzaaa): source A' https://kolscan.io/account/4X199Pq6etVAdmZf5zfbhAu18biucGip3jFZMj3qvCA8
  { addr: '4X199Pq6etVAdmZf5zfbhAu18biucGip3jFZMj3qvCA8', label: 'denzaa', x: 'denzzaaa', cat: 'trader' },
  // set (x.com/Setuhx): source A' https://kolscan.io/account/62N1K57D37AUDGp68tnDYKPjGDsaAAtmo357nBtEtuR
  { addr: '62N1K57D37AUDGp68tnDYKPjGDsaAAtmo357nBtEtuR', label: 'set', x: 'Setuhx', cat: 'trader' },
  // Toxic weast (x.com/Toxic_weast): source A' https://kolscan.io/account/DU323DieHUGPmYamp6A4Ai1V4YSYgRi35mGpzJGrjf7k
  { addr: 'DU323DieHUGPmYamp6A4Ai1V4YSYgRi35mGpzJGrjf7k', label: 'Toxic weast', x: 'Toxic_weast', cat: 'trader' },
  // Pain (x.com/PainCrypt0): source A' https://kolscan.io/account/J6TDXvarvpBdPXTaTU8eJbtso1PUCYKGkVtMKUUY8iEa
  { addr: 'J6TDXvarvpBdPXTaTU8eJbtso1PUCYKGkVtMKUUY8iEa', label: 'Pain', x: 'PainCrypt0', cat: 'trader' },
  // Fabix (x.com/Fabix_R): source A' https://kolscan.io/account/DN7pYLSGYqHXwvPLh8tJM2zoJjhMSsNGVRVkMWVpredr
  { addr: 'DN7pYLSGYqHXwvPLh8tJM2zoJjhMSsNGVRVkMWVpredr', label: 'Fabix', x: 'Fabix_R', cat: 'trader' },
  // Mr. Frog (x.com/TheMisterFrog): source A' https://kolscan.io/account/4DdrfiDHpmx55i4SPssxVzS9ZaKLb8qr45NKY9Er9nNh
  { addr: '4DdrfiDHpmx55i4SPssxVzS9ZaKLb8qr45NKY9Er9nNh', label: 'Mr. Frog', x: 'TheMisterFrog', cat: 'trader' },
  // Pavlo (x.com/pavlotrading): source A' https://kolscan.io/account/7NnaXghjuU92gM9kmwXysqa5HboyZuR2LTaBnvazFxSH
  { addr: '7NnaXghjuU92gM9kmwXysqa5HboyZuR2LTaBnvazFxSH', label: 'Pavlo', x: 'pavlotrading', cat: 'trader' },
  // zeropnl (x.com/im0pnl): source A' https://kolscan.io/account/4xY9T1Q7foJzJsJ6YZDSsfp9zkzeZsXnxd45SixduMmr
  { addr: '4xY9T1Q7foJzJsJ6YZDSsfp9zkzeZsXnxd45SixduMmr', label: 'zeropnl', x: 'im0pnl', cat: 'trader' },
  // Casino (x.com/casino616): source A' https://kolscan.io/account/8rvAsDKeAcEjEkiZMug9k8v1y8mW6gQQiMobd89Uy7qR
  { addr: '8rvAsDKeAcEjEkiZMug9k8v1y8mW6gQQiMobd89Uy7qR', label: 'Casino', x: 'casino616', cat: 'trader' },
  // Fox (x.com/fox09_09): source A' https://kolscan.io/account/DAEdBmTPEKM6xkwfzC3d411QUe6coKpkND6UURa4CvHC
  { addr: 'DAEdBmTPEKM6xkwfzC3d411QUe6coKpkND6UURa4CvHC', label: 'Fox', x: 'fox09_09', cat: 'trader' },
  // narc (x.com/narracanz): source A' https://kolscan.io/account/CxgPWvH2GoEDENELne2XKAR2z2Fr4shG2uaeyqZceGve
  { addr: 'CxgPWvH2GoEDENELne2XKAR2z2Fr4shG2uaeyqZceGve', label: 'narc', x: 'narracanz', cat: 'trader' },
  // Numer0 trencharc (x.com/Numerooo0): source A' https://kolscan.io/account/A3W8psibkTUvjxs4LRscbnjux6TFDXdvD4m4GsGpQ2KJ
  { addr: 'A3W8psibkTUvjxs4LRscbnjux6TFDXdvD4m4GsGpQ2KJ', label: 'Numer0 trencharc', x: 'Numerooo0', cat: 'trader' },
  // Johnson (x.com/johnsoncooks101): source A' https://kolscan.io/account/J9TYAsWWidbrcZybmLSfrLzryANf4CgJBLdvwdGuC8MB
  { addr: 'J9TYAsWWidbrcZybmLSfrLzryANf4CgJBLdvwdGuC8MB', label: 'Johnson', x: 'johnsoncooks101', cat: 'trader' },
  // OGAntD (x.com/0GAntD): source A' https://kolscan.io/account/215nhcAHjQQGgwpQSJQ7zR26etbjjtVdW74NLzwEgQjP
  { addr: '215nhcAHjQQGgwpQSJQ7zR26etbjjtVdW74NLzwEgQjP', label: 'OGAntD', x: '0GAntD', cat: 'trader' },
  // Silver (x.com/0xSilver): source A' https://kolscan.io/account/67Nwfi9hgwqhxGoovT2JGLU67uxfomLwQAWncjXXzU6U
  { addr: '67Nwfi9hgwqhxGoovT2JGLU67uxfomLwQAWncjXXzU6U', label: 'Silver', x: '0xSilver', cat: 'trader' },
  // ban (x.com/Ban_Val): source A' https://kolscan.io/account/EqiFgyNw6kgrmYstWyrP8VjKhka7XEmKTZzHSmwpr1Zb
  { addr: 'EqiFgyNw6kgrmYstWyrP8VjKhka7XEmKTZzHSmwpr1Zb', label: 'ban', x: 'Ban_Val', cat: 'trader' },
  // Domy (x.com/domyxbt): source A' https://kolscan.io/account/3LUfv2u5yzsDtUzPdsSJ7ygPBuqwfycMkjpNreRR2Yww
  { addr: '3LUfv2u5yzsDtUzPdsSJ7ygPBuqwfycMkjpNreRR2Yww', label: 'Domy', x: 'domyxbt', cat: 'trader' },
  // Reljoo (x.com/Reljoooo): source A' https://kolscan.io/account/FsG3BaPmRTdSrPaivbgJsFNCCa8cPfkUtk8VLWXkHpHP
  { addr: 'FsG3BaPmRTdSrPaivbgJsFNCCa8cPfkUtk8VLWXkHpHP', label: 'Reljoo', x: 'Reljoooo', cat: 'trader' },
  // el charto (x.com/elchartox): source A' https://kolscan.io/account/CCUcjek5p6DLoH2YNtjizxYhAnStXAQAGVxhp1cYJF7w
  { addr: 'CCUcjek5p6DLoH2YNtjizxYhAnStXAQAGVxhp1cYJF7w', label: 'el charto', x: 'elchartox', cat: 'trader' },
  // bandit (x.com/bandeez): source A' https://kolscan.io/account/5B79fMkcFeRTiwm7ehsZsFiKsC7m7n1Bgv9yLxPp9q2X
  { addr: '5B79fMkcFeRTiwm7ehsZsFiKsC7m7n1Bgv9yLxPp9q2X', label: 'bandit', x: 'bandeez', cat: 'trader' },
  // Zef (x.com/zefwashere): source A' https://kolscan.io/account/EjtQrPTbcMevStBkpnjsH23NfUCMhGHusTYsHuGVQZp2
  { addr: 'EjtQrPTbcMevStBkpnjsH23NfUCMhGHusTYsHuGVQZp2', label: 'Zef', x: 'zefwashere', cat: 'trader' },
  // marker (x.com/m4rk3r): source A' https://kolscan.io/account/CQervCdE3WAUGRmaTj9NHdbNrNGVsxJb68t3QggcntM2
  { addr: 'CQervCdE3WAUGRmaTj9NHdbNrNGVsxJb68t3QggcntM2', label: 'marker', x: 'm4rk3r', cat: 'trader' },
  // Frost (x.com/FrostBallin): source A' https://kolscan.io/account/4nwfXw7n98jEQn93VWY7Cuf1jnn1scHXuXCPGVYS9k6T
  { addr: '4nwfXw7n98jEQn93VWY7Cuf1jnn1scHXuXCPGVYS9k6T', label: 'Frost', x: 'FrostBallin', cat: 'trader' },
  // Coler (x.com/ColerCooks): source A' https://kolscan.io/account/99xnE2zEFi8YhmKDaikc1EvH6ELTQJppnqUwMzmpLXrs
  { addr: '99xnE2zEFi8YhmKDaikc1EvH6ELTQJppnqUwMzmpLXrs', label: 'Coler', x: 'ColerCooks', cat: 'trader' },
  // rez (x.com/rezthegreatt): source A' https://kolscan.io/account/FkRN9yF3Gysw3BVhUqAXJJMEGfKiJNaPQAWYWBErgDuN
  { addr: 'FkRN9yF3Gysw3BVhUqAXJJMEGfKiJNaPQAWYWBErgDuN', label: 'rez', x: 'rezthegreatt', cat: 'trader' },
  // TIL (x.com/tilcrypto): source A' https://kolscan.io/account/EHg5YkU2SZBTvuT87rUsvxArGp3HLeye1fXaSDfuMyaf
  { addr: 'EHg5YkU2SZBTvuT87rUsvxArGp3HLeye1fXaSDfuMyaf', label: 'TIL', x: 'tilcrypto', cat: 'trader' },
  // lyftical (x.com/lyftical): source A' https://kolscan.io/account/2hN82SXLUffhG3vxpezRmae1sGrCBMqHHBDxjmjpagqk
  { addr: '2hN82SXLUffhG3vxpezRmae1sGrCBMqHHBDxjmjpagqk', label: 'lyftical', x: 'lyftical', cat: 'trader' },
  // big bags bobby (x.com/bigbagsbobby): source A' https://kolscan.io/account/8oQoMhfBQnRspn7QtNAq2aPThRE4q94kLSTwaaFQvRgs
  { addr: '8oQoMhfBQnRspn7QtNAq2aPThRE4q94kLSTwaaFQvRgs', label: 'big bags bobby', x: 'bigbagsbobby', cat: 'trader' },
  // neo. (x.com/neodot): source A' https://kolscan.io/account/5o3kAZLwEzNF1kfVv8JSEqv6sSB88pZbHxF1oYTxgXzG
  { addr: '5o3kAZLwEzNF1kfVv8JSEqv6sSB88pZbHxF1oYTxgXzG', label: 'neo.', x: 'neodot', cat: 'trader' },
  // evening (x.com/eveningbtc): source A' https://kolscan.io/account/E7gozEiAPNhpJsdS52amhhN2XCAqLZa7WPrhyR6C8o4S
  { addr: 'E7gozEiAPNhpJsdS52amhhN2XCAqLZa7WPrhyR6C8o4S', label: 'evening', x: 'eveningbtc', cat: 'trader' },
  // blixze (x.com/blixze): source A' https://kolscan.io/account/5vg7he5HibvsAW86wfiuP6jw7VwKmUAnP6P93mVCdpJu
  { addr: '5vg7he5HibvsAW86wfiuP6jw7VwKmUAnP6P93mVCdpJu', label: 'blixze', x: 'blixze', cat: 'trader' },
  // Putrick (x.com/Putrickk): source A' https://kolscan.io/account/AVjEtg2ECYKXYeqdRQXvaaAZBjfTjYuSMTR4WLhKoeQN
  { addr: 'AVjEtg2ECYKXYeqdRQXvaaAZBjfTjYuSMTR4WLhKoeQN', label: 'Putrick', x: 'Putrickk', cat: 'trader' },
  // zhynx (x.com/onlyzhynx): source A' https://kolscan.io/account/zhYnXqK3MNSmwS3yxSvPmY5kUa1n2WUaCJgYUDrAHkL
  { addr: 'zhYnXqK3MNSmwS3yxSvPmY5kUa1n2WUaCJgYUDrAHkL', label: 'zhynx', x: 'onlyzhynx', cat: 'trader' },
  // Ducky (x.com/zXDuckyXz): source A' https://kolscan.io/account/ADC1QV9raLnGGDbnWdnsxazeZ4Tsiho4vrWadYswA2ph
  { addr: 'ADC1QV9raLnGGDbnWdnsxazeZ4Tsiho4vrWadYswA2ph', label: 'Ducky', x: 'zXDuckyXz', cat: 'trader' },
  // samsrep (x.com/samsrepx): source A' https://kolscan.io/account/CUHBzSPSaNS3tArEtM3maSV6pNdJhHJFYZpurPPK9P7H
  { addr: 'CUHBzSPSaNS3tArEtM3maSV6pNdJhHJFYZpurPPK9P7H', label: 'samsrep', x: 'samsrepx', cat: 'trader' },
  // EustazZ (x.com/Eustazzeus): source A' https://kolscan.io/account/FqamE7xrahg7FEWoByrx1o8SeyHt44rpmE6ZQfT7zrve
  { addr: 'FqamE7xrahg7FEWoByrx1o8SeyHt44rpmE6ZQfT7zrve', label: 'EustazZ', x: 'Eustazzeus', cat: 'trader' },
  // Art (x.com/ArtCryptoz): source A' https://kolscan.io/account/CgaA9a1JwAXJyfHuvZ7VW8YfTVRkdiT5mjBBSKcg7Rz5
  { addr: 'CgaA9a1JwAXJyfHuvZ7VW8YfTVRkdiT5mjBBSKcg7Rz5', label: 'Art', x: 'ArtCryptoz', cat: 'trader' },
  // radiance (x.com/radiancebrr): source A' https://kolscan.io/account/FAicXNV5FVqtfbpn4Zccs71XcfGeyxBSGbqLDyDJZjke
  { addr: 'FAicXNV5FVqtfbpn4Zccs71XcfGeyxBSGbqLDyDJZjke', label: 'radiance', x: 'radiancebrr', cat: 'trader' },
  // Latuche (x.com/Latuche95): source A' https://kolscan.io/account/GJA1HEbxGnqBhBifH9uQauzXSB53to5rhDrzmKxhSU65
  { addr: 'GJA1HEbxGnqBhBifH9uQauzXSB53to5rhDrzmKxhSU65', label: 'Latuche', x: 'Latuche95', cat: 'trader' },
  // Meechie (x.com/973Meech): source A' https://kolscan.io/account/9iaawVBEsFG35PSwd4PahwT8fYNQe9XYuRdWm872dUqY
  { addr: '9iaawVBEsFG35PSwd4PahwT8fYNQe9XYuRdWm872dUqY', label: 'Meechie', x: '973Meech', cat: 'trader' },
  // Rilsio (x.com/CryptoRilsio): source A' https://kolscan.io/account/4fZFcK8ms3bFMpo1ACzEUz8bH741fQW4zhAMGd5yZMHu
  { addr: '4fZFcK8ms3bFMpo1ACzEUz8bH741fQW4zhAMGd5yZMHu', label: 'Rilsio', x: 'CryptoRilsio', cat: 'trader' },
  // CookDoc (x.com/CookDoc1993): source A' https://kolscan.io/account/Dvbv5TdAyPpJk16X9mUxWFVicYtCUxTLhuof8TGuUaRv
  { addr: 'Dvbv5TdAyPpJk16X9mUxWFVicYtCUxTLhuof8TGuUaRv', label: 'CookDoc', x: 'CookDoc1993', cat: 'trader' },
  // Yami (x.com/YamiPNL): source A' https://kolscan.io/account/7Js5gmq57y9jG2sseKrAeJt3vbncSWSFFHDEsyJDnyVm
  { addr: '7Js5gmq57y9jG2sseKrAeJt3vbncSWSFFHDEsyJDnyVm', label: 'Yami', x: 'YamiPNL', cat: 'trader' },
  // Rem (x.com/yeaitsrem): source A' https://kolscan.io/account/3pfqebV65sHMbF5z86HsPKSiTxwpNhCzjK5X7GUqCbtK
  { addr: '3pfqebV65sHMbF5z86HsPKSiTxwpNhCzjK5X7GUqCbtK', label: 'Rem', x: 'yeaitsrem', cat: 'trader' },
];
