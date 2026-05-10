function normalizeId(s) {
  return String(s || "").replace(/\D+/g, "");
}

function getToken() {
  return sessionStorage.getItem("obb_admin_token") || "";
}

function clearToken() {
  sessionStorage.removeItem("obb_admin_token");
}

function showMsg(text, ok) {
  const el = document.getElementById("msg");
  el.textContent = text || "";
  el.className = "msg " + (ok ? "ok" : "err");
}

async function apiGetModels() {
  const res = await fetch("/api/models", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load models");
  const data = await res.json();
  return data.models || [];
}

async function addModel(id, name) {
  const token = getToken();
  const res = await fetch("/api/models/add", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token
    },
    body: JSON.stringify({ id, name })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "Add failed");
  return data.models || [];
}

async function setCategory(id, category) {
  const token = getToken();
  const res = await fetch("/api/models/setCategory", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token
    },
    body: JSON.stringify({ id, category })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "Set category failed");
  return data.models || [];
}

async function addModelWithCategory(id, name, category) {
  const token = getToken();
  const res = await fetch("/api/models/add", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token
    },
    body: JSON.stringify({ id, name, category })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "Add failed");
  return data.models || [];
}

async function removeModel(id) {
  const token = getToken();
  const res = await fetch("/api/models/remove", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token
    },
    body: JSON.stringify({ id })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "Remove failed");
  return data.models || [];
}

async function setImageUrl(id, imageUrl) {
  const token = getToken();
  const res = await fetch("/api/models/setImageUrl", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token
    },
    body: JSON.stringify({ id, imageUrl })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "Set image URL failed");
  return data.models || [];
}

async function uploadImage(id, file) {
  const token = getToken();
  const fd = new FormData();
  fd.append("id", id);
  fd.append("image", file);
  const res = await fetch("/api/models/uploadImage", {
    method: "POST",
    headers: {
      "x-admin-token": token
    },
    body: fd
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "Upload failed");
  return data.models || [];
}

function renderList(models) {
  const tbody = document.getElementById("list");
  tbody.innerHTML = "";

  for (const m of models) {
    const tr = document.createElement("tr");

    const tdImg = document.createElement("td");
    const img = document.createElement("img");
    img.alt = "";
    img.className = "imgPrev";
    img.src = m.image || "";
    tdImg.appendChild(img);

    const tdId = document.createElement("td");
    tdId.textContent = m.id;

    const tdName = document.createElement("td");
    const nameWrap = document.createElement("div");
    nameWrap.style.display = "flex";
    nameWrap.style.flexWrap = "wrap";
    nameWrap.style.gap = "10px";
    nameWrap.style.alignItems = "center";

    const nameText = document.createElement("div");
    nameText.textContent = m.name || "";
    nameText.style.minWidth = "180px";
    nameWrap.appendChild(nameText);

    const catSelect = document.createElement("select");
    catSelect.style.width = "160px";
    const optInternet = document.createElement("option");
    optInternet.value = "internet";
    optInternet.textContent = "Интернет";
    const optTv = document.createElement("option");
    optTv.value = "tv";
    optTv.textContent = "Телевизия";
    const optOther = document.createElement("option");
    optOther.value = "other";
    optOther.textContent = "Други";
    catSelect.appendChild(optInternet);
    catSelect.appendChild(optTv);
    catSelect.appendChild(optOther);
    catSelect.value = (m.category === "internet" || m.category === "tv" || m.category === "other") ? m.category : "other";
    catSelect.addEventListener("change", async () => {
      try {
        showMsg("", true);
        const next = await setCategory(m.id, catSelect.value);
        renderList(next);
        showMsg("Category saved.", true);
      } catch (e) {
        showMsg(String(e?.message || e), false);
      }
    });
    nameWrap.appendChild(catSelect);

    tdName.appendChild(nameWrap);

    const tdImgActions = document.createElement("td");
    const urlInput = document.createElement("input");
    urlInput.placeholder = "Image URL or /uploads/..";
    urlInput.value = m.image || "";
    urlInput.style.width = "240px";

    const saveUrlBtn = document.createElement("button");
    saveUrlBtn.type = "button";
    saveUrlBtn.textContent = "Save URL";
    saveUrlBtn.addEventListener("click", async () => {
      try {
        showMsg("", true);
        const next = await setImageUrl(m.id, urlInput.value);
        renderList(next);
        showMsg("Image URL saved.", true);
      } catch (e) {
        showMsg(String(e?.message || e), false);
      }
    });

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";

    const uploadBtn = document.createElement("button");
    uploadBtn.type = "button";
    uploadBtn.textContent = "Upload";
    uploadBtn.addEventListener("click", async () => {
      try {
        showMsg("", true);
        const f = fileInput.files && fileInput.files[0];
        if (!f) throw new Error("Pick an image first.");
        const next = await uploadImage(m.id, f);
        renderList(next);
        showMsg("Image uploaded.", true);
      } catch (e) {
        showMsg(String(e?.message || e), false);
      }
    });

    const wrap = document.createElement("div");
    wrap.className = "row";
    wrap.appendChild(urlInput);
    wrap.appendChild(saveUrlBtn);
    wrap.appendChild(fileInput);
    wrap.appendChild(uploadBtn);
    tdImgActions.appendChild(wrap);

    const tdActions = document.createElement("td");
    const rmBtn = document.createElement("button");
    rmBtn.type = "button";
    rmBtn.className = "danger";
    rmBtn.textContent = "Remove";
    rmBtn.addEventListener("click", async () => {
      try {
        showMsg("", true);
        const next = await removeModel(m.id);
        renderList(next);
        showMsg("Removed.", true);
      } catch (e) {
        showMsg(String(e?.message || e), false);
      }
    });
    tdActions.appendChild(rmBtn);

    tr.appendChild(tdImg);
    tr.appendChild(tdId);
    tr.appendChild(tdName);
    tr.appendChild(tdImgActions);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  }
}

async function refresh() {
  const models = await apiGetModels();
  renderList(models);
}

window.addEventListener("load", async () => {
  const token = getToken();
  if (!token) {
    location.href = "/login.html";
    return;
  }

  document.getElementById("logoutBtn").addEventListener("click", () => {
    clearToken();
    location.href = "/login.html";
  });

  try {
    await refresh();
  } catch (e) {
    showMsg(String(e?.message || e), false);
  }

  const idInput = document.getElementById("idInput");
  const nameInput = document.getElementById("nameInput");
  const catInput = document.getElementById("catInput");
  const addBtn = document.getElementById("addBtn");

  addBtn.addEventListener("click", async () => {
    try {
      showMsg("", true);
      const id = normalizeId(idInput.value);
      const name = String(nameInput.value || "").trim();
      if (!id) throw new Error("Material Id is required (digits).");
      const category = String(catInput?.value || "other");
      const models = await addModelWithCategory(id, name, category);
      renderList(models);
      showMsg("Added/Updated.", true);
      idInput.value = "";
      nameInput.value = "";
    } catch (e) {
      showMsg(String(e?.message || e), false);
    }
  });
});

