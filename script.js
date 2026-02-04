let loadedRows = [];
let selectedPackage = "";
let compressedImageBase64 = "";
let pendingRequestId = null;
let toastQueue = [];
let activeToast = null;
let toastTimer = null;
let isAdmin = false;
let adminToken = localStorage.getItem("adminToken") || null;
window.isUploading = false;

const DEV_MODE = false;
const scriptURL = "https://script.google.com/macros/s/AKfycbzYIaa1E25aZXtmy55Q6W0XtsNEDG8U0x0ygrSVDWiRw4f8wAKysu0V-DdnyB1PcdLy/exec";

/* ================= TOAST ================= */

function showToast(message, type = "info", options = {}) {
  const { persistent = false, spinner = false, duration = 3000 } = options;
  toastQueue.push({ message, type, persistent, spinner, duration });
  processToastQueue();
}

function processToastQueue() {
  if (activeToast || toastQueue.length === 0) return;

  const { message, type, persistent, spinner, duration } = toastQueue.shift();
  const icons = { success: "✅", error: "❌", info: "ℹ️" };

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const iconWrap = document.createElement("div");
  iconWrap.className = "toast-icon";

  if (spinner) {
    const spin = document.createElement("div");
    spin.className = "toast-spinner";
    iconWrap.appendChild(spin);
  } else {
    iconWrap.textContent = icons[type] || "ℹ️";
  }

  toast.appendChild(iconWrap);

  const msg = document.createElement("div");
  msg.className = "toast-message";
  msg.textContent = message;
  toast.appendChild(msg);

  document.body.appendChild(toast);
  activeToast = toast;

  if (!persistent) {
    toastTimer = setTimeout(() => dismissToast(toast), duration);
  }
}

function dismissToast(toast) {
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.classList.add("hide");

  setTimeout(() => {
    toast.remove();
    activeToast = null;
    processToastQueue();
  }, 300);
}

/* ================= UI ================= */

function setLoginLoading(isLoading) {
  const btn = document.getElementById("buttonDiv");
  const loadingUI = document.getElementById("loginLoadingUI");
  if (!btn || !loadingUI) return;
  btn.style.display = isLoading ? "none" : "flex";
  loadingUI.style.display = isLoading ? "flex" : "none";
}

function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function selectPackage(pkg, el) {
  document.querySelectorAll('.package-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedPackage = pkg;
}

function confirmPackage() {
  if (!selectedPackage) return alert("Select a package");
  showSection("menu-section");
}

function backToPackage() {
  selectedPackage = "";
  document.querySelectorAll('.package-card').forEach(c => c.classList.remove('selected'));
  showSection("package-section");
}

function showMenu() { showSection("menu-section"); }
function showLogForm() {
  showSection("form-section");
  document.getElementById('date').valueAsDate = new Date();
}
function showHistoryView() {
  showSection("history-section");
  const today = new Date();
  const weekAgo = new Date(today - 7 * 86400000);
  document.getElementById('toDate').valueAsDate = today;
  document.getElementById('fromDate').valueAsDate = weekAgo;
}

/* ================= IMAGE ================= */

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => img.src = e.target.result;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX_WIDTH = 1024;
      let { width, height } = img;
      if (width > MAX_WIDTH) {
        height *= MAX_WIDTH / width;
        width = MAX_WIDTH;
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    reader.onerror = img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function previewImage(e) {
  const file = e.target.files[0];
  if (!file) return;

  const uploadDiv = document.querySelector('.photo-upload');
  const placeholder = uploadDiv.querySelector('.placeholder');
  let img = uploadDiv.querySelector("img");

  if (!img) {
    img = document.createElement("img");
    img.className = "photo-preview";
    uploadDiv.appendChild(img);
  }

  compressedImageBase64 = await compressImage(file);
  img.src = compressedImageBase64;
  uploadDiv.classList.add("has-image");
  if (placeholder) placeholder.style.display = "none";
}

/* ================= FORM ================= */

function validateForm() {
  return (
    document.getElementById("date").value &&
    document.getElementById("volume").value &&
    document.getElementById("waste").value &&
    compressedImageBase64
  );
}

/* ================= UPLOAD ================= */

async function addEntry() {
  if (window.isUploading) return;
  window.isUploading = true;

  const submitBtn = document.getElementById("submitBtn");
  submitBtn.disabled = true;

  try {
    const token = localStorage.getItem("userToken");
    if (!token) {
      showToast("Session expired", "error");
      showSection("login-section");
      return;
    }

    if (!validateForm()) {
      showToast("Fill all fields", "error");
      return;
    }

    showToast("Uploading entry...", "info", { persistent: true, spinner: true });

    if (!pendingRequestId) pendingRequestId = crypto.randomUUID();

    const payload = {
      requestId: pendingRequestId,
      action: "submit",
      package: selectedPackage,
      date: date.value,
      volume: volume.value,
      waste: waste.value,
      token,
      imageByte: compressedImageBase64.split(",")[1],
      imageName: `Waste_${Date.now()}.jpg`
    };

    const res = await fetch(scriptURL, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const result = await res.json();

    dismissToast(activeToast);

    if (result.error) throw new Error(result.error);

    showToast("Entry saved!", "success");
    setTimeout(resetFormAfterSuccess, 2000);

  } catch (err) {
    dismissToast(activeToast);
    showToast(err.message || "Upload failed", "error");
  } finally {
    window.isUploading = false;
    submitBtn.disabled = false;
  }
}

function resetFormAfterSuccess() {
  pendingRequestId = null;
  document.getElementById("date").value = "";
  document.getElementById("volume").value = "";
  document.getElementById("waste").value = "";
  document.getElementById("photo").value = null;
  compressedImageBase64 = "";
  document.querySelector(".photo-upload").classList.remove("has-image");
  document.getElementById("modal").classList.add("active");
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

/* ================= HISTORY ================= */

async function loadHistory() {
  const from = fromDate.value;
  let to = toDate.value;

  // ✅ Make TO date inclusive (add 1 day)
  const toObj = new Date(to);
  toObj.setDate(toObj.getDate() + 1);
  to = toObj.toISOString().split("T")[0];

  const url = `${scriptURL}?package=${selectedPackage}&from=${from}&to=${to}`;

  const loading = document.getElementById("loading");
  const tableContainer = document.getElementById("table-container");
  const emptyState = document.getElementById("empty-state");
  const tbody = document.getElementById("table-body");

  // UI reset
  tableContainer.style.display = "none";
  emptyState.style.display = "none";   // ✅ HIDE EMPTY MESSAGE
  tbody.innerHTML = "";

  // ✅ SHOW SPINNER
  loading.style.display = "block";

  try {
    const res = await fetch(url);
    const rows = await res.json();

    loading.style.display = "none";
    loadedRows = rows;

    if (!rows || rows.length <= 1) {
      emptyState.style.display = "block";
      return;
    }

    rows.slice(1).forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${new Date(r[0]).toLocaleDateString()}</td>
        <td>${r[1]}</td>
        <td>${r[2]}</td>
        <td>${r[4]}</td>
        <td><a onclick="openImageModal('${r[5]}')">View</a></td>
      `;
      tbody.appendChild(tr);
    });

    tableContainer.style.display = "block";

  } catch (err) {
    console.error(err);
    loading.style.display = "none";
    emptyState.style.display = "block";
  }
}



/* ================= ADMIN ================= */

function showAdminLogin() {
  document.getElementById("loginWrapper").style.display = "none";
  document.querySelector("#login-section h2").style.display = "none";
  document.querySelector("#login-section p").style.display = "none";
  document.querySelector("#login-section .btn-secondary").style.display = "none";
  document.getElementById("admin-section").style.display = "block";
}


async function adminLogin() {
  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value.trim();

  if (!email || !password) {
    showToast("Enter email and password", "error");
    return;
  }

  showToast("Logging in...", "info", { spinner: true, persistent: true });

  const res = await fetch(scriptURL, {
    method: "POST",
    body: JSON.stringify({ action: "loginAdmin", email, password })
  });

  const data = await res.json();
  dismissToast(activeToast);

  if (!data.success) return showToast(data.message, "error");

  adminToken = data.token;
  localStorage.setItem("adminToken", adminToken);
  isAdmin = true;
  showToast("Admin logged in", "success");
  showAdminPanel();
}


async function loadUsersForAdmin() {
  const res = await fetch(scriptURL, {
    method: "POST",
    body: JSON.stringify({ action: "getUsers", token: adminToken })
  });

  const data = await res.json();
  const list = document.getElementById("admin-user-list");
  list.innerHTML = "";

  data.users.forEach(u => {
    const div = document.createElement("div");
    div.innerHTML = `
      <b>${u.email}</b> — ${u.status}
      <button onclick="updateUser('${u.email}','Approved')">Approve</button>
      <button onclick="updateUser('${u.email}','Rejected')">Reject</button>
    `;
    list.appendChild(div);
  });
}

async function updateUser(email, status) {
  const res = await fetch(scriptURL, {
    method: "POST",
    body: JSON.stringify({ action: "updateUserStatus", token: adminToken, email, status })
  });

  const data = await res.json();
  if (data.success) {
    showToast("Updated", "success");
    loadUsersForAdmin();
  } else {
    showToast(data.error, "error");
  }
}

function showAdminPanel() {
  document.getElementById("admin-section").style.display = "block";
  document.getElementById("adminPanel").style.display = "block";
  loadUsersForAdmin();
}



/* ================= GOOGLE LOGIN ================= */

function parseJwt(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(atob(base64).split('').map(c =>
    '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
}

async function handleCredentialResponse(response) {
  setLoginLoading(true);
  const email = parseJwt(response.credential).email.toLowerCase();

  const res = await fetch(`${scriptURL}?email=${encodeURIComponent(email)}`);
  const data = await res.json();
  setLoginLoading(false);

  if (data.status === "Approved") {
    localStorage.setItem("userToken", data.token);
    showSection("package-section");
    showToast("Welcome!", "success");
  } else if (data.status === "Rejected") {
    showToast("Access denied", "error");
  } else {
    showToast("Awaiting approval", "info");
  }
}

function showUserLogin() {
  document.getElementById("admin-section").style.display = "none";
  document.getElementById("loginWrapper").style.display = "block";
  document.querySelector("#login-section h2").style.display = "block";
  document.querySelector("#login-section p").style.display = "block";
}


/* ================= INIT ================= */

window.onload = () => {
  google.accounts.id.initialize({
    client_id: "648943267004-cgsr4bhegtmma2jmlsekjtt494j8cl7f.apps.googleusercontent.com",
    callback: handleCredentialResponse
  });

  google.accounts.id.renderButton(
    document.getElementById("buttonDiv"),
    { theme: "outline", size: "large", width: "250" }
  );
};

if (adminToken) {
  isAdmin = true;
  showAdminLogin();
  showAdminPanel();
}


/* ================= IMAGE MODAL ================= */

function openImageModal(url) {
  const modal = document.getElementById("imageModal");
  const img = document.getElementById("modalImage");
  const match = url.match(/[-\w]{25,}/);
  if (!match) return;
  img.src = `https://drive.google.com/thumbnail?id=${match[0]}&sz=w1200`;
  modal.style.display = "flex";
}

function closeImageModal() {
  document.getElementById("imageModal").style.display = "none";
  document.getElementById("modalImage").src = "";
}
