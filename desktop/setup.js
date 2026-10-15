const $ = (id) => document.getElementById(id);
const firstRun = new URLSearchParams(location.search).get("firstRun") === "1";

async function init() {
  const view = await window.desktopSetup.get();
  if (!view) return;
  if (!firstRun) {
    $("title").textContent = "Configure keys";
    $("intro").textContent = "Change the keys the app uses. Leave a secret field empty to keep the current value. Saving restarts the app server.";
    $("skip").textContent = "Cancel";
  }
  $("openrouterModel").value = view.openrouterModel;
  $("googleClientId").value = view.googleClientId;
  $("redirectUri").textContent = view.redirectUri;
  if (view.hasOpenrouterApiKey) $("openrouterApiKey").placeholder = "Saved (leave empty to keep)";
  if (view.hasGoogleClientSecret) $("googleClientSecret").placeholder = "Saved (leave empty to keep)";
  $("googleHint").textContent = view.hasGoogleClientSecret ? "" : "Required to connect Gmail.";
}

document.addEventListener("click", (e) => {
  const link = e.target.closest("a[data-external]");
  if (link) {
    e.preventDefault();
    window.desktopSetup.openExternal(link.href);
  }
});

$("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("redirectUri").textContent);
  $("copy").textContent = "Copied";
  setTimeout(() => ($("copy").textContent = "Copy"), 1500);
});

$("skip").addEventListener("click", () => window.close());

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const values = {
    openrouterApiKey: $("openrouterApiKey").value,
    openrouterModel: $("openrouterModel").value,
    googleClientId: $("googleClientId").value,
    googleClientSecret: $("googleClientSecret").value,
  };
  if (values.googleClientId.trim() && !/\.apps\.googleusercontent\.com$/.test(values.googleClientId.trim())) {
    $("error").textContent = "The Google client ID should end with .apps.googleusercontent.com";
    $("error").hidden = false;
    return;
  }
  $("save").disabled = true;
  $("save").textContent = "Saving...";
  const result = await window.desktopSetup.save(values);
  if (!result?.ok) {
    $("save").disabled = false;
    $("save").textContent = "Save and continue";
    $("error").textContent = "Could not save the settings.";
    $("error").hidden = false;
  }
});

init();
