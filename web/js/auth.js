// Google sign-in and the access token. Nothing here knows about the Sheets API.

import { CLIENT_ID } from "./config.js";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SCRIPT_WAIT_TIMEOUT_MS = 10000;
const SCRIPT_POLL_MS = 50;

let accessToken = null;
let tokenClient = null;

// The GIS script is loaded with `async defer`, so it may land after this module.
function waitForGoogleIdentity() {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (window.google?.accounts?.oauth2) {
        resolve();
      } else if (Date.now() - startedAt > SCRIPT_WAIT_TIMEOUT_MS) {
        reject(new Error("Google sign-in script failed to load."));
      } else {
        setTimeout(check, SCRIPT_POLL_MS);
      }
    };
    check();
  });
}

export async function initAuth() {
  await waitForGoogleIdentity();
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: () => {},
  });
}

export function signIn() {
  return new Promise((resolve, reject) => {
    tokenClient.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error_description || response.error));
        return;
      }
      accessToken = response.access_token;
      resolve(accessToken);
    };
    tokenClient.requestAccessToken();
  });
}

export function getToken() {
  return accessToken;
}

export function isSignedIn() {
  return accessToken !== null;
}

export function clearToken() {
  accessToken = null;
}
