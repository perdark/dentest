/**
 * Packaging config for the DEMO copy of the app.
 *
 * Derived from the real config in package.json rather than copied, so a change
 * to what ships (files, icons, targets) can never apply to one bundle and quietly
 * miss the other. Only the three things that MUST differ are overridden.
 *
 * The important one is `productName`. Electron derives the per-user data folder
 * from it, so the demo writes to %APPDATA%\Zuha Demo while the real app keeps
 * %APPDATA%\zuha. A client who tries the demo and then starts working for real
 * therefore cannot end up with fictional money in their books. [packaging]
 */
const base = require("./package.json").build;

module.exports = {
  ...base,
  appId: "iq.zuha.clinic.demo",
  productName: "Zuha Demo",
  // `files` is inherited untouched. Both Arabic readmes are already excluded
  // from the payload there — appending exclusions here instead put them after
  // the build/app object entry, where electron-builder scoped them to that
  // entry and the wrong readme shipped inside resources/app/electron/.
  win: {
    ...base.win,
    artifactName: "Zuha-${version}-win-x64-demo.${ext}",
  },
  extraFiles: [{ from: "electron/اقرأني-تجريبي.txt", to: "اقرأني.txt" }],
};
