const $ = (id) => document.getElementById(id);
let url = "";

window.desktopConnect.onState((state) => {
  if (state.kind === "code") {
    url = state.url;
    $("intro").textContent = "Your browser opened the website. Log in (or start a free trial) and confirm this code:";
    $("code").textContent = state.userCode;
    $("code").hidden = false;
    $("open").hidden = false;
    $("status").textContent = "Waiting for confirmation...";
  } else if (state.kind === "done") {
    $("intro").textContent = "";
    $("code").hidden = true;
    $("open").hidden = true;
    $("status").className = "status";
    $("status").textContent = `Connected to ${state.email}. You can close this window.`;
    $("close").textContent = "Close";
  } else if (state.kind === "error") {
    $("intro").textContent = "";
    $("code").hidden = true;
    $("open").hidden = true;
    $("status").className = "status error";
    $("status").textContent = state.message;
    $("close").textContent = "Close";
  }
});

$("open").addEventListener("click", () => url && window.desktopConnect.openUrl(url));
$("close").addEventListener("click", () => window.close());
