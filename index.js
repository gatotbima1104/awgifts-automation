// Import Libraries
import puppeter from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { setTimeout } from "node:timers/promises";
import { google } from "googleapis";
import * as dotenv from "dotenv";
import fs from "fs";

// Configurate .env
dotenv.config();
puppeter.use(StealthPlugin());

// Pull credential from .env
const email = process.env.EMAIL;
const password = process.env.PASSWORD;
const credential_path = "./credential_tomas.json";
const spreadSheet_ID = process.env.SPREADSHEET_ID;
const range_column = `${process.env.SHEET_NAME}!A:B`;
const loginUrl = "https://www.awgifts.sk/login.sys";

// Function Authorize Google
async function authorize() {
  const content = fs.readFileSync(credential_path);
  const credentials = JSON.parse(content);

  const authClient = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return authClient.getClient();
}

// Function Read SpreadSheet
async function readSpreadsheet(auth) {
  const sheets = google.sheets({
    version: "v4",
    auth,
  });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadSheet_ID,
    range: range_column,
  });

  const rows = response.data.values;
  if (rows.length) {
    return rows.slice(1).map((row) => ({
      code: row[0],
      amount: row[1],
    }));
  } else {
    throw new Error("No data found.");
  }
}

// Function logging reminder
function consoleLog(values) {
  console.log(`============== ${values} `);
}

// Function code
async function loginPage(page, email, password, browser, loginUrl) {
  try {
    // const existCookies = fs.existsSync("./cookies.json"); // Cek Cookies exist
    // if (!existCookies) {
      // Cek Condition coookies
    //   consoleLog("NO COOKIES FOUND, LOGGING IN ...");
      consoleLog("LOGGING IN....")
      await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
      await setTimeout(1000);

      await page.type('input[type="email"]', email, {
        delay: 100,
      });
      await page.type('input[type="password"]', password, {
        delay: 100,
      });
      const loginSelector = "button#login_button";
      await page.click(loginSelector);

      await setTimeout(1000);

      try {
        await page.waitForSelector("div.sweet-alert.showSweetAlert.visible");
        consoleLog("CREDENTIALS ARE WRONG, PLEASE TRY AGAIN ....");
        await browser.close();

        return false;
      } catch (e) {
        // If the timeout is reached, it means the login failed selector didn't appear, so login should be successful
        // const cookies = await page.cookies();
        // fs.writeFileSync("./cookies.json", JSON.stringify(cookies, null, 2));
        // consoleLog("COOKIE SAVED");
        consoleLog("LOGIN SUCCESSFULLY");

        return true;
      }
    // } else {
    //   const cookieString = fs.readFileSync("./cookies.json");
    //   const cookies = await JSON.parse(cookieString);
    //   await page.setCookie(...cookies);
    //   consoleLog("COOKIES FOUND AND SETTED SUCCESSFULLY");

    //   return true;
    // }
  } catch (error) {
    console.log(error);
    return false;
  }
}

// Function addToChart Product
async function addToChart(page, product, amountItem, codeItem) {
  await page.goto(product, { waitUntil: "domcontentloaded" });

  // Check if the order input element exists
  const orderInput = await page.$("input.order_input");

  if (!orderInput) {
    consoleLog(`PRODUCT CODE \x1b[1m${codeItem}\x1b[0m IS SOLD OUT`);
    return false;
  }

  await page.type("input.order_input", amountItem);

  const orderSelector = "span.order_button";
  await page.click(orderSelector);
  await setTimeout(2000);

  return true;
}

// Function loopProduct each product
async function loopProduct(page, codeItem, amountItem) {
  try {
    await page.goto(`https://www.awgifts.sk/search.sys?q=${codeItem}`, {
      waitUntil: "domcontentloaded",
    });
    await setTimeout(2000);

    // Extract first link product
    const product = await page.evaluate(() => {
      const productSelector = document.querySelector(
        "#search_results > div:nth-child(1) > div:nth-child(2) > div > h5 > a"
      );
      const product = productSelector
        ? "https://www.awgifts.sk" + productSelector.getAttribute("href")
        : null;
      return product;
    });

    // Condition if product not found
    if (!product) {
      consoleLog(`PRODUCT w/ CODE \x1b[1m${codeItem}\x1b[0m NOT FOUND`);
      return false;
    }

    const addToChartSuccessfully = await addToChart(page, product, amountItem, codeItem);
    if (addToChartSuccessfully) {
      consoleLog(
        `PRODUCT CODE w/ \x1b[1m${codeItem}\x1b[0m w/ AMOUNT \x1b[1m${amountItem}\x1b[0m AADDED SUCCESSFULLY`
      );
    } else {
      consoleLog(`PRODUCT CODE \x1b[1m${codeItem}\x1b[0m FAILED TO ADDED`);
    }

    return true;
  } catch (error) {
    console.log(error);

    return false;
  }
}

// Main function
(async () => {
  try {
    // Auth for spreadsheet ID
    const auth = await authorize();
    const items = await readSpreadsheet(auth);
    const codes = items.map((item) => item.code);
    const amounts = items.map((item) => item.amount);

    // configure browser
    const browser = await puppeter.launch({
      headless: "new",
      args: [`--no-sandbox`],
    });

    // Login process
    const page = await browser.newPage();
    const loginSuccessfully = await loginPage( page, email, password, browser, loginUrl );

    if (loginSuccessfully) {                // Check login isSuccess or not
      // Search process
      for (let item = 0; item < codes.length; item++) {
        const codeItem = codes[item];
        const amountItem = amounts[item];

        const goEachProduct = await loopProduct(page, codeItem, amountItem);
        // if(!goEachProduct){
        //     consoleLog(`FAILED TO GO TO PRODUCT w/ CODE \x1b[1m${codeItem}\x1b[0m`);
        // }
      }
      consoleLog("ALL PRODUCT LOADED SUCCESSFULLY !!!!");
    }

    await browser.close();
  } catch (error) {
    console.log(error);
  }
})();
