function setToken(t) {
  sessionStorage.setItem("obb_admin_token", String(t || ""));
}

async function checkToken(token) {
  const res = await fetch("/api/auth/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token
    },
    body: JSON.stringify({})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "Unauthorized");
  return true;
}

function showMsg(text, ok) {
  const el = document.getElementById("msg");
  el.textContent = text || "";
  el.className = "msg " + (ok ? "ok" : "err");
}

window.addEventListener("load", () => {
  const tokenEl = document.getElementById("token");
  const btn = document.getElementById("loginBtn");

  const doLogin = async () => {
    try {
      showMsg("", true);
      const token = String(tokenEl.value || "").trim();
      if (!token) throw new Error("Липсва token.");
      await checkToken(token);
      setToken(token);
      location.href = "/admin.html";
    } catch (e) {
      showMsg(String(e?.message || e), false);
    }
  };

  btn.addEventListener("click", doLogin);
  tokenEl.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
  tokenEl.focus();
});

