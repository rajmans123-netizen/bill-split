# Bill Split · split the bill by who had what

Scan the restaurant bill, tap who had what, and send everyone their exact share on UPI.

**Try it:** https://rajmans123-netizen.github.io/bill-split/

- **Scan, don't type:** point your camera at the bill. It reads the items, GST, service charge, discount and total, and checks they add up.
- **Fair, not equal:** each dish is split between the people who had it. Tax and service charge are shared in proportion to what each person ate, so the friend who only had chai doesn't pay GST on your pizza.
- **Service charge is optional:** if the bill has one, it tells you so (CCPA guidelines, upheld by the Delhi High Court in 2025) and can take it off the split.
- **Pay links:** everyone gets a link with their share and a UPI button and QR to pay the person who paid the bill. Shares are rounded to whole rupees; the payer covers the paise.
- **Private:** the photo is read on your phone (tesseract.js). Only the reader's code and English model are downloaded, once. Pay links carry the split after the `#`, which is never sent to any server.

**How it works:** `ocr.js` reads the photo, `parse.js` turns the bill's text into items and charges (Petpooja-style columns, "2 x Item" cafe tills, names on their own line, wrapped names, misread digits fixed by the bill's own arithmetic), and `split.js` does the maths in paise so the shares add up to the bill exactly. `node test/parse.test.mjs` and `node test/split.test.mjs` run the checks; `test/bills/` has OCR text of sample bills (all names and GSTINs made up).

Built with Claude by [Raj Tries](https://instagram.com/raj_triess). MIT licensed.
